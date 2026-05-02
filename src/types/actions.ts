export enum ActionType {
  CLICK_ELEMENT = 'CLICK_ELEMENT',
  FILL_INPUT = 'FILL_INPUT',
  CLEAR_INPUT = 'CLEAR_INPUT',
  SELECT_OPTION = 'SELECT_OPTION',
  PRESS_KEY = 'PRESS_KEY',
  SCROLL_DOWN = 'SCROLL_DOWN',
  SCROLL_UP = 'SCROLL_UP',
  SCROLL_TO_ELEMENT = 'SCROLL_TO_ELEMENT',
  NAVIGATE = 'NAVIGATE',
  SUBMIT_FORM = 'SUBMIT_FORM',
  READ_CONTENT = 'READ_CONTENT',
  FOCUS_ELEMENT = 'FOCUS_ELEMENT',
  REPEAT_LAST = 'REPEAT_LAST',
  OPEN_TAB = 'OPEN_TAB',
  CLOSE_TAB = 'CLOSE_TAB',
  SWITCH_TAB = 'SWITCH_TAB',
  UNKNOWN = 'UNKNOWN',
}

// Actions that require voice confirmation before execution
export const DESTRUCTIVE_ACTIONS = new Set<ActionType>([
  ActionType.SUBMIT_FORM,
])

export type BrowserAction =
  | { type: ActionType.CLICK_ELEMENT; selector: string; label: string }
  | {
      type: ActionType.FILL_INPUT
      selector: string
      value: string
      label: string
      submit?: boolean
    }
  | { type: ActionType.CLEAR_INPUT; selector: string; label: string }
  | { type: ActionType.SELECT_OPTION; selector: string; value: string; label: string }
  | { type: ActionType.PRESS_KEY; key: string; selector?: string; label?: string }
  | { type: ActionType.SCROLL_DOWN; amount?: number }
  | { type: ActionType.SCROLL_UP; amount?: number }
  | { type: ActionType.SCROLL_TO_ELEMENT; selector: string; label: string }
  | { type: ActionType.NAVIGATE; url: string }
  | { type: ActionType.SUBMIT_FORM; selector: string; label: string }
  | { type: ActionType.READ_CONTENT; selector?: string }
  | { type: ActionType.FOCUS_ELEMENT; selector: string; label: string }
  | { type: ActionType.REPEAT_LAST; message: string }
  | { type: ActionType.OPEN_TAB; url: string }
  | { type: ActionType.CLOSE_TAB; tabId?: number; label?: string }
  | { type: ActionType.SWITCH_TAB; tabId: number; label: string }
  | { type: ActionType.UNKNOWN; reason: string }

export type ActionResult = {
  success: boolean
  action: BrowserAction
  message: string // plain English for TTS
}
