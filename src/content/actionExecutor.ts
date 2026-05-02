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
  el.click()
  return { success: true, action, message: `Clicked ${label || 'element'}.` }
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
