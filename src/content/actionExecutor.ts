import type { BrowserAction, ActionResult } from '../types/actions'
import { ActionType } from '../types/actions'
import { isSensitiveField, truncate } from '../utils/helpers'

export async function executeAction(action: BrowserAction): Promise<ActionResult> {
  try {
    switch (action.type) {
      case ActionType.CLICK_ELEMENT:
        return clickElement(action, action.selector, action.label)
      case ActionType.FILL_INPUT:
        return fillInput(action, action.selector, action.value, action.label)
      case ActionType.SCROLL_DOWN: {
        const dy = action.amount ?? Math.round(window.innerHeight * 0.85)
        window.scrollBy({ top: dy, behavior: 'smooth' })
        return { success: true, action, message: 'Scrolled down.' }
      }
      case ActionType.SCROLL_UP: {
        const dy = action.amount ?? Math.round(window.innerHeight * 0.85)
        window.scrollBy({ top: -dy, behavior: 'smooth' })
        return { success: true, action, message: 'Scrolled up.' }
      }
      case ActionType.SCROLL_TO_ELEMENT:
        return scrollToElement(action, action.selector, action.label)
      case ActionType.NAVIGATE:
        return navigate(action, action.url)
      case ActionType.SUBMIT_FORM:
        return submitForm(action, action.selector, action.label)
      case ActionType.READ_CONTENT:
        return readContent(action, action.selector)
      case ActionType.FOCUS_ELEMENT:
        return focusElement(action, action.selector, action.label)
      case ActionType.PRESS_KEY:
        return pressKey(action, action.key, action.label)
      case ActionType.UNKNOWN:
        return { success: false, action, message: action.reason }
    }
  } catch (err) {
    return {
      success: false,
      action,
      message: err instanceof Error ? err.message : 'Action failed.',
    }
  }
}

function clickElement(action: BrowserAction, selector: string, label: string): ActionResult {
  const el = pick(selector)
  if (!el) return missing(action, label)
  if (!(el instanceof HTMLElement)) {
    return { success: false, action, message: `I could not click ${label || 'that element'}.` }
  }
  el.scrollIntoView({ block: 'center' })
  // Some sites (YouTube, custom React components) ignore plain .click() unless
  // we also dispatch a full mouse event sequence.
  el.click()
  for (const type of ['mousedown', 'mouseup', 'click'] as const) {
    el.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 }),
    )
  }
  return { success: true, action, message: `Clicked ${label || 'element'}.` }
}

function pressKey(action: BrowserAction, key: string, label?: string): ActionResult {
  const target = (document.activeElement as HTMLElement | null) ?? document.body
  // Map a few common spoken/named forms to KeyboardEvent values.
  const normalized = normalizeKey(key)
  const code = guessCode(normalized)
  for (const type of ['keydown', 'keypress', 'keyup'] as const) {
    target.dispatchEvent(
      new KeyboardEvent(type, {
        key: normalized,
        code,
        bubbles: true,
        cancelable: true,
      }),
    )
  }
  return { success: true, action, message: label ? `${label}.` : `Pressed ${normalized}.` }
}

function normalizeKey(k: string): string {
  const lower = k.trim().toLowerCase()
  if (lower === 'space' || lower === 'spacebar' || lower === ' ') return ' '
  if (lower === 'esc' || lower === 'escape') return 'Escape'
  if (lower === 'enter' || lower === 'return') return 'Enter'
  if (lower === 'tab') return 'Tab'
  if (lower === 'backspace' || lower === 'delete') return 'Backspace'
  if (lower === 'arrowleft' || lower === 'left') return 'ArrowLeft'
  if (lower === 'arrowright' || lower === 'right') return 'ArrowRight'
  if (lower === 'arrowup' || lower === 'up') return 'ArrowUp'
  if (lower === 'arrowdown' || lower === 'down') return 'ArrowDown'
  if (lower.length === 1) return lower
  return k
}

function guessCode(normalized: string): string {
  if (normalized === ' ') return 'Space'
  if (normalized === 'Escape') return 'Escape'
  if (normalized === 'Enter') return 'Enter'
  if (normalized === 'Tab') return 'Tab'
  if (normalized === 'Backspace') return 'Backspace'
  if (normalized === 'ArrowLeft') return 'ArrowLeft'
  if (normalized === 'ArrowRight') return 'ArrowRight'
  if (normalized === 'ArrowUp') return 'ArrowUp'
  if (normalized === 'ArrowDown') return 'ArrowDown'
  if (normalized.length === 1) return `Key${normalized.toUpperCase()}`
  return normalized
}

function fillInput(
  action: BrowserAction,
  selector: string,
  value: string,
  label: string,
): ActionResult {
  if (isSensitiveField(label)) {
    return { success: false, action, message: 'I cannot fill that field for your security.' }
  }
  const el = pick(selector)
  if (!el) return missing(action, label)
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return { success: false, action, message: `I could not fill ${label || 'that field'}.` }
  }
  if (el instanceof HTMLInputElement && el.type.toLowerCase() === 'password') {
    return { success: false, action, message: 'I cannot fill password fields.' }
  }
  el.focus()
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return { success: true, action, message: `Filled ${label || 'that field'}.` }
}

function scrollToElement(action: BrowserAction, selector: string, label: string): ActionResult {
  const el = pick(selector)
  if (!el) return missing(action, label)
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  return { success: true, action, message: `Scrolled to ${label || 'that element'}.` }
}

function navigate(action: BrowserAction, url: string): ActionResult {
  window.location.href = url
  return { success: true, action, message: 'Going to that page.' }
}

function submitForm(action: BrowserAction, selector: string, label: string): ActionResult {
  const el = pick(selector)
  if (!el) return missing(action, label)
  if (el instanceof HTMLFormElement) {
    el.submit()
    return { success: true, action, message: `Submitted ${label || 'the form'}.` }
  }
  if (el instanceof HTMLElement) {
    const form = el.closest('form')
    if (form) {
      form.submit()
      return { success: true, action, message: `Submitted ${label || 'the form'}.` }
    }
  }
  return { success: false, action, message: 'I could not find a form to submit.' }
}

function readContent(action: BrowserAction, selector: string | undefined): ActionResult {
  let text = ''
  if (selector) {
    const el = pick(selector)
    text = (el?.textContent ?? '').trim()
  } else {
    const body = document.body
    text = body ? ((body as HTMLElement).innerText || body.textContent || '').trim() : ''
  }
  if (!text) {
    return { success: false, action, message: 'There was nothing to read.' }
  }
  return { success: true, action, message: truncate(text, 600) }
}

function focusElement(action: BrowserAction, selector: string, label: string): ActionResult {
  const el = pick(selector)
  if (!el) return missing(action, label)
  if (el instanceof HTMLElement) {
    el.focus()
    return { success: true, action, message: `Focused ${label || 'that element'}.` }
  }
  return { success: false, action, message: `I could not focus ${label || 'that element'}.` }
}

function pick(selector: string): Element | null {
  try {
    return document.querySelector(selector)
  } catch {
    return null
  }
}

function missing(action: BrowserAction, label: string): ActionResult {
  return {
    success: false,
    action,
    message: `I could not find ${label || 'that element'} on the page.`,
  }
}
