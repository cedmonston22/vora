import type { BrowserAction, ActionResult } from '../types/actions'
import { ActionType } from '../types/actions'
import { isSensitiveField, truncate } from '../utils/helpers'

export async function executeAction(action: BrowserAction): Promise<ActionResult> {
  try {
    switch (action.type) {
      case ActionType.CLICK_ELEMENT:
        return clickElement(action, action.selector, action.label)
      case ActionType.FILL_INPUT:
        return fillInput(
          action,
          action.selector,
          action.value,
          action.label,
          action.submit === true,
        )
      case ActionType.CLEAR_INPUT:
        return clearInput(action, action.selector, action.label)
      case ActionType.SELECT_OPTION:
        return selectOption(action, action.selector, action.value, action.label)
      case ActionType.PRESS_KEY:
        return pressKey(action, action.key, action.selector, action.label)
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
      case ActionType.REPEAT_LAST:
        // Handled in the side panel before reaching the content script.
        return { success: true, action, message: action.message }
      case ActionType.OPEN_TAB:
      case ActionType.CLOSE_TAB:
      case ActionType.SWITCH_TAB:
        // Tab actions are dispatched to the service worker; the content
        // script should never receive them. Surface a clear message if it does.
        return {
          success: false,
          action,
          message: 'Tab action routed to the wrong layer.',
        }
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

function fillInput(
  action: BrowserAction,
  selector: string,
  value: string,
  label: string,
  submit: boolean,
): ActionResult {
  if (isSensitiveField(label)) {
    return { success: false, action, message: 'I cannot fill that field for your security.' }
  }
  const el = pick(selector)
  if (!el) return missing(action, label)

  // Contenteditable elements (e.g. Gmail's message body, rich-text editors)
  // aren't <input>/<textarea>. Fill them via execCommand with an innerText
  // fallback, plus an input event so the editor's listeners fire.
  if (
    el instanceof HTMLElement &&
    el.isContentEditable &&
    !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
  ) {
    el.focus()
    let inserted = false
    try {
      inserted = document.execCommand('insertText', false, value)
    } catch {
      inserted = false
    }
    if (!inserted) {
      el.innerText = value
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return { success: true, action, message: `Filled ${label || 'that field'}.` }
  }

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

  if (submit) {
    const submitted = submitFromInput(el)
    return {
      success: true,
      action,
      message: submitted
        ? `Searched for "${value}".`
        : `Filled ${label || 'that field'}.`,
    }
  }
  return { success: true, action, message: `Filled ${label || 'that field'}.` }
}

// Submit the search/form an input belongs to. SPA sites (YouTube, Amazon, etc.)
// often ignore form.submit() because their handler is wired to a submit button
// click or an Enter keydown. Try the more compatible paths first.
// Returns true if some submission path was taken.
function submitFromInput(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  const form = el.form

  // 1. Click a real submit button if one exists. This fires the same
  //    handlers users get via mouse/touch — most reliable for SPAs.
  const submitBtn = findSubmitButton(form, el)
  if (submitBtn) {
    submitBtn.click()
    return true
  }

  // 2. Synthesize Enter on the input. Many search boxes listen for Enter
  //    directly rather than relying on form submission.
  for (const type of ['keydown', 'keypress', 'keyup'] as const) {
    el.dispatchEvent(
      new KeyboardEvent(type, {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      }),
    )
  }

  // 3. Last resort: real form submission.
  if (form) {
    try {
      if (typeof form.requestSubmit === 'function') form.requestSubmit()
      else form.submit()
    } catch {
      // ignore
    }
  }
  return true
}

function findSubmitButton(
  form: HTMLFormElement | null,
  input: HTMLElement,
): HTMLElement | null {
  const scope: ParentNode = form ?? input.parentElement ?? document
  const candidates = scope.querySelectorAll<HTMLElement>(
    'button[type="submit"], input[type="submit"], button[aria-label*="search" i], button[aria-label*="Search" i], button#search-icon-legacy, [role="button"][aria-label*="search" i]',
  )
  for (const c of candidates) {
    if (c instanceof HTMLButtonElement && c.disabled) continue
    if (c instanceof HTMLInputElement && c.disabled) continue
    return c
  }
  return null
}

function clearInput(action: BrowserAction, selector: string, label: string): ActionResult {
  const el = pick(selector)
  if (!el) return missing(action, label)
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return { success: false, action, message: `I could not clear ${label || 'that field'}.` }
  }
  el.focus()
  el.value = ''
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return { success: true, action, message: `Cleared ${label || 'that field'}.` }
}

function selectOption(
  action: BrowserAction,
  selector: string,
  value: string,
  label: string,
): ActionResult {
  const el = pick(selector)
  if (!el) return missing(action, label)
  if (!(el instanceof HTMLSelectElement)) {
    return { success: false, action, message: `I could not find the ${label || 'dropdown'}.` }
  }
  const opt = Array.from(el.options).find(
    (o) => o.value === value || o.text.toLowerCase() === value.toLowerCase(),
  )
  if (!opt) {
    return {
      success: false,
      action,
      message: `I could not find option "${value}" in ${label || 'the dropdown'}.`,
    }
  }
  el.value = opt.value
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return { success: true, action, message: `Selected ${opt.text} in ${label || 'the dropdown'}.` }
}

function pressKey(
  action: BrowserAction,
  key: string,
  selector: string | undefined,
  label: string | undefined,
): ActionResult {
  const normalized = normalizeKey(key)

  // Media keys: drive the video element directly. Synthetic KeyboardEvents are
  // marked isTrusted=false and players (YouTube, Vimeo, etc.) ignore them.
  const video = findActiveVideo()
  if (video) {
    if (normalized === 'k' || normalized === ' ') {
      if (video.paused) {
        void video.play().catch(() => undefined)
        return { success: true, action, message: 'Playing.' }
      }
      video.pause()
      return { success: true, action, message: 'Paused.' }
    }
    if (normalized === 'm') {
      video.muted = !video.muted
      return { success: true, action, message: video.muted ? 'Muted.' : 'Unmuted.' }
    }
    if (normalized === 'j') {
      video.currentTime = Math.max(0, video.currentTime - 10)
      return { success: true, action, message: 'Rewound ten seconds.' }
    }
    if (normalized === 'l') {
      video.currentTime = video.currentTime + 10
      return { success: true, action, message: 'Forward ten seconds.' }
    }
    if (normalized === 'f') {
      const v = video as HTMLVideoElement & {
        webkitRequestFullscreen?: () => Promise<void>
        mozRequestFullScreen?: () => Promise<void>
      }
      const req =
        v.requestFullscreen?.bind(v) ??
        v.webkitRequestFullscreen?.bind(v) ??
        v.mozRequestFullScreen?.bind(v)
      if (req) {
        try {
          void req()
        } catch {
          // ignore
        }
      }
      return { success: true, action, message: 'Fullscreen.' }
    }
  }

  // Generic key dispatch — fire on the document AND the focused element so
  // global page listeners and form-level listeners both have a chance to catch.
  const target = selector
    ? pick(selector)
    : ((document.activeElement as HTMLElement | null) ?? document.body)
  if (!target || !(target instanceof HTMLElement)) {
    return {
      success: false,
      action,
      message: `I could not find an element to press ${key} on.`,
    }
  }
  const code = guessCode(normalized)
  for (const type of ['keydown', 'keypress', 'keyup'] as const) {
    const event = new KeyboardEvent(type, {
      key: normalized,
      code,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)
    target.dispatchEvent(event)
  }
  if (normalized === 'Enter' && target instanceof HTMLInputElement) {
    const form = target.closest('form')
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  }
  return { success: true, action, message: label ? `${label}.` : `Pressed ${normalized}.` }
}

function findActiveVideo(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'))
  if (videos.length === 0) return null
  // Prefer the largest visible video — usually the main player.
  let best: HTMLVideoElement | null = null
  let bestArea = 0
  for (const v of videos) {
    const r = v.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const area = r.width * r.height
    if (area > bestArea) {
      bestArea = area
      best = v
    }
  }
  return best ?? videos[0] ?? null
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
