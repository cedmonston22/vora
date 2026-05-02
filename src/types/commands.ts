import type { BrowserAction } from './actions'

// Chrome extension message types
export const MSG = {
  VOICE_COMMAND_RECEIVED: 'VOICE_COMMAND_RECEIVED',
  ACTION_EXECUTE: 'ACTION_EXECUTE',
  ACTION_RESULT: 'ACTION_RESULT',
  STATE_CHANGE: 'STATE_CHANGE',
  DOM_CONTEXT_REQUEST: 'DOM_CONTEXT_REQUEST',
  DOM_CONTEXT_RESPONSE: 'DOM_CONTEXT_RESPONSE',
  CONFIRMATION_RESPONSE: 'CONFIRMATION_RESPONSE',
  WAKE_WORD_DETECTED: 'WAKE_WORD_DETECTED',
  TRANSCRIPT_UPDATE: 'TRANSCRIPT_UPDATE',
  HISTORY_ENTRY: 'HISTORY_ENTRY',
} as const

export type MsgType = (typeof MSG)[keyof typeof MSG]

export type ExtensionState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'CONFIRMING'
  | 'EXECUTING'
  | 'ERROR'

export type VoiceCommand = {
  transcript: string
  confidence: number
  timestamp: number
  lastReadback?: string // last TTS message spoken, for "repeat that" handling
}

export type ParsedIntent = {
  action: BrowserAction
  confirmationText?: string // set for destructive actions
  readbackText: string // what TTS says after execution
}

export type CommandHistoryEntry = {
  transcript: string
  readback: string
  success: boolean
  timestamp: number
}

// Discriminated union for all Chrome messages
export type ExtensionMessage =
  | { type: typeof MSG.VOICE_COMMAND_RECEIVED; payload: VoiceCommand }
  | { type: typeof MSG.ACTION_EXECUTE; payload: BrowserAction }
  | { type: typeof MSG.ACTION_RESULT; payload: { success: boolean; message: string } }
  | { type: typeof MSG.STATE_CHANGE; payload: { state: ExtensionState; message?: string } }
  | { type: typeof MSG.DOM_CONTEXT_REQUEST }
  | { type: typeof MSG.DOM_CONTEXT_RESPONSE; payload: import('./dom').PageContext }
  | { type: typeof MSG.CONFIRMATION_RESPONSE; payload: { confirmed: boolean } }
  | { type: typeof MSG.WAKE_WORD_DETECTED }
  | { type: typeof MSG.TRANSCRIPT_UPDATE; payload: { partial: string } }
  | { type: typeof MSG.HISTORY_ENTRY; payload: CommandHistoryEntry }
