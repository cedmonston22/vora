import type { ParsedIntent } from '../types/commands'
import type { BrowserAction } from '../types/actions'
import { ActionType, DESTRUCTIVE_ACTIONS } from '../types/actions'
import { isDestructiveLabel, isSensitiveField } from '../utils/helpers'

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

export function parseAction(rawResponse: string): ParsedIntent {
  const stripped = stripCodeFences(rawResponse).trim()
  let json: unknown
  try {
    json = JSON.parse(stripped)
  } catch {
    throw new ParseError('Response was not valid JSON.')
  }
  if (!isObj(json)) throw new ParseError('Response was not an object.')

  const readbackText = typeof json.readback === 'string' && json.readback.trim().length > 0
    ? json.readback.trim()
    : 'Done.'
  const action = parseBrowserAction(json.action)

  const intent: ParsedIntent = { action, readbackText }

  if (needsConfirmation(action)) {
    intent.confirmationText = buildConfirmationText(action)
  }

  return intent
}

function parseBrowserAction(raw: unknown): BrowserAction {
  if (!isObj(raw) || typeof raw.type !== 'string') {
    return unknown('Missing or invalid action type.')
  }

  switch (raw.type) {
    case ActionType.CLICK_ELEMENT: {
      const selector = stringField(raw, 'selector')
      const label = stringField(raw, 'label') ?? ''
      if (!selector) return unknown('Click action missing a selector.')
      return { type: ActionType.CLICK_ELEMENT, selector, label }
    }
    case ActionType.FILL_INPUT: {
      const selector = stringField(raw, 'selector')
      const value = stringField(raw, 'value') ?? ''
      const label = stringField(raw, 'label') ?? ''
      if (!selector) return unknown('Fill action missing a selector.')
      if (isSensitiveField(label)) {
        return unknown('I cannot fill that field for your security.')
      }
      return { type: ActionType.FILL_INPUT, selector, value, label }
    }
    case ActionType.CLEAR_INPUT: {
      const selector = stringField(raw, 'selector')
      const label = stringField(raw, 'label') ?? ''
      if (!selector) return unknown('Clear action missing a selector.')
      return { type: ActionType.CLEAR_INPUT, selector, label }
    }
    case ActionType.SELECT_OPTION: {
      const selector = stringField(raw, 'selector')
      const value = stringField(raw, 'value') ?? ''
      const label = stringField(raw, 'label') ?? ''
      if (!selector) return unknown('Select action missing a selector.')
      return { type: ActionType.SELECT_OPTION, selector, value, label }
    }
    case ActionType.PRESS_KEY: {
      const key = stringField(raw, 'key')
      if (!key) return unknown('Press key action missing a key.')
      const selector = stringField(raw, 'selector')
      return selector !== undefined
        ? { type: ActionType.PRESS_KEY, key, selector }
        : { type: ActionType.PRESS_KEY, key }
    }
    case ActionType.SCROLL_DOWN: {
      const amount = numberField(raw, 'amount')
      return amount !== undefined
        ? { type: ActionType.SCROLL_DOWN, amount }
        : { type: ActionType.SCROLL_DOWN }
    }
    case ActionType.SCROLL_UP: {
      const amount = numberField(raw, 'amount')
      return amount !== undefined
        ? { type: ActionType.SCROLL_UP, amount }
        : { type: ActionType.SCROLL_UP }
    }
    case ActionType.SCROLL_TO_ELEMENT: {
      const selector = stringField(raw, 'selector')
      const label = stringField(raw, 'label') ?? ''
      if (!selector) return unknown('Scroll-to action missing a selector.')
      return { type: ActionType.SCROLL_TO_ELEMENT, selector, label }
    }
    case ActionType.NAVIGATE: {
      const url = stringField(raw, 'url')
      if (!url) return unknown('Navigate action missing a URL.')
      try {
        new URL(url)
      } catch {
        return unknown('Navigate URL is not valid.')
      }
      return { type: ActionType.NAVIGATE, url }
    }
    case ActionType.SUBMIT_FORM: {
      const selector = stringField(raw, 'selector')
      const label = stringField(raw, 'label') ?? 'this form'
      if (!selector) return unknown('Submit action missing a selector.')
      return { type: ActionType.SUBMIT_FORM, selector, label }
    }
    case ActionType.READ_CONTENT: {
      const selector = stringField(raw, 'selector')
      return selector !== undefined
        ? { type: ActionType.READ_CONTENT, selector }
        : { type: ActionType.READ_CONTENT }
    }
    case ActionType.FOCUS_ELEMENT: {
      const selector = stringField(raw, 'selector')
      const label = stringField(raw, 'label') ?? ''
      if (!selector) return unknown('Focus action missing a selector.')
      return { type: ActionType.FOCUS_ELEMENT, selector, label }
    }
    case ActionType.REPEAT_LAST: {
      const message = stringField(raw, 'message') ?? ''
      return { type: ActionType.REPEAT_LAST, message }
    }
    case ActionType.UNKNOWN: {
      const reason = stringField(raw, 'reason') ?? 'Unrecognized command.'
      return { type: ActionType.UNKNOWN, reason }
    }
    default:
      return unknown(`Unsupported action type: ${raw.type}`)
  }
}

function needsConfirmation(action: BrowserAction): boolean {
  if (DESTRUCTIVE_ACTIONS.has(action.type)) return true
  if (action.type === ActionType.CLICK_ELEMENT && isDestructiveLabel(action.label)) return true
  return false
}

function buildConfirmationText(action: BrowserAction): string {
  switch (action.type) {
    case ActionType.SUBMIT_FORM:
      return `I am about to submit ${action.label}. Say yes to confirm or no to cancel.`
    case ActionType.CLICK_ELEMENT:
      return `I am about to click ${action.label}. Say yes to confirm or no to cancel.`
    default:
      return 'Say yes to confirm or no to cancel.'
  }
}

function unknown(reason: string): BrowserAction {
  return { type: ActionType.UNKNOWN, reason }
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function stringField(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function numberField(o: Record<string, unknown>, key: string): number | undefined {
  const v = o[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function stripCodeFences(s: string): string {
  const m = s.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/)
  return m && typeof m[1] === 'string' ? m[1] : s
}
