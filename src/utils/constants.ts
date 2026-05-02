// AI
export const CLAUDE_MODEL = 'claude-sonnet-4-6'
export const AI_TIMEOUT_MS = 10_000
export const AI_HARD_TIMEOUT_MS = 15_000

// Voice
export const WAKE_WORD = 'hey vora'
export const MIN_CONFIDENCE = 0.7
export const CONFIRMATION_TIMEOUT_MS = 5_000
export const DEFAULT_SPEECH_RATE = 1.0
export const MIN_SPEECH_RATE = 0.5
export const MAX_SPEECH_RATE = 1.5

// DOM extraction
export const MAX_VISIBLE_TEXT_CHARS = 2_000
export const MAX_ELEMENTS = 100

// Command history
export const MAX_HISTORY_ENTRIES = 20

// Storage keys
export const STORAGE_KEY_API_KEY = 'vora_api_key'
export const STORAGE_KEY_SPEECH_RATE = 'vora_speech_rate'

// Destructive action keywords — if a clickable element's label contains these, require confirmation
export const DESTRUCTIVE_KEYWORDS = [
  'send',
  'submit',
  'delete',
  'remove',
  'cancel',
  'pay',
  'purchase',
  'confirm',
  'post',
  'publish',
] as const

// Sensitive field labels — never fill these
export const SENSITIVE_FIELD_LABELS = [
  'password',
  'pin',
  'ssn',
  'social security',
  'credit card',
  'cvv',
  'cvc',
] as const

// Overlay colors (high contrast, min 4.5:1)
export const OVERLAY_COLORS = {
  LISTENING: '#1D4ED8', // blue-700
  THINKING: '#B45309', // amber-700
  EXECUTING: '#1D4ED8',
  DONE: '#15803D', // green-700
  ERROR: '#B91C1C', // red-700
  CONFIRMING: '#7C3AED', // violet-700
} as const
