export enum ActionType {
  CLICK_ELEMENT = 'CLICK_ELEMENT',
  FILL_INPUT = 'FILL_INPUT',
  SCROLL_DOWN = 'SCROLL_DOWN',
  SCROLL_UP = 'SCROLL_UP',
  SCROLL_TO_ELEMENT = 'SCROLL_TO_ELEMENT',
  NAVIGATE = 'NAVIGATE',
  SUBMIT_FORM = 'SUBMIT_FORM',
  READ_CONTENT = 'READ_CONTENT',
  FOCUS_ELEMENT = 'FOCUS_ELEMENT',
  UNKNOWN = 'UNKNOWN',
}

// Actions that require voice confirmation before execution
export const DESTRUCTIVE_ACTIONS = new Set<ActionType>([
  ActionType.SUBMIT_FORM,
])

export type BrowserAction =
  | { type: ActionType.CLICK_ELEMENT; selector: string; label: string }
  | { type: ActionType.FILL_INPUT; selector: string; value: string; label: string }
  | { type: ActionType.SCROLL_DOWN; amount?: number }
  | { type: ActionType.SCROLL_UP; amount?: number }
  | { type: ActionType.SCROLL_TO_ELEMENT; selector: string; label: string }
  | { type: ActionType.NAVIGATE; url: string }
  | { type: ActionType.SUBMIT_FORM; selector: string; label: string }
  | { type: ActionType.READ_CONTENT; selector?: string }
  | { type: ActionType.FOCUS_ELEMENT; selector: string; label: string }
  | { type: ActionType.UNKNOWN; reason: string }

export type ActionResult = {
  success: boolean
  action: BrowserAction
  message: string // plain English for TTS
}
