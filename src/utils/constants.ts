// AI
export const CLAUDE_MODEL = 'claude-sonnet-4-6'
export const AI_TIMEOUT_MS = 10_000
export const AI_HARD_TIMEOUT_MS = 15_000

// Voice
export const WAKE_WORD = 'hey vora'

// Wake word matching. Web Speech often mishears "Vora" as "vore uh", "nora",
// "bora", or breaks it across two tokens. We accept a list of phonetic
// variants — including English near-homophones like "laura"/"flora"/"cora" —
// to keep the wake gate forgiving. The user prefers more variants over
// stricter matching because "vora" is a hard word for the recognizer to hear.
// Order does not matter — the matcher sorts by length internally so longer
// phrases match before shorter ones.
const WAKE_PREFIXES = ['', 'hey ', 'hi ', 'ok ', 'okay ']
const WAKE_CORES = [
  'vora',
  'vore uh',
  'vore-uh',
  'voreuh',
  'vore ah',
  'vore a',
  'vore',
  'nora',
  'bora',
  'dora',
  'aurora',
  'verra',
  'vera',
  'ora',
  'oraa',
  'voda',
  'vola',
  'voraa',
  'vora vora',
  'phora',
  'laura',
  'flora',
  'lora',
  'cora',
  'tora',
  'sora',
  'mora',
  'pora',
  'veera',
  'veerah',
  'four uh',
  'four a',
  'fora',
]

export const WAKE_WORDS: readonly string[] = WAKE_PREFIXES
  .flatMap((p) => WAKE_CORES.map((c) => p + c))
  .sort((a, b) => b.length - a.length)

export const MIN_CONFIDENCE = 0.35
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
export const STORAGE_KEY_SPEECH_VOLUME = 'vora_speech_volume'
export const STORAGE_KEY_SPEECH_VOICE = 'vora_speech_voice'
export const STORAGE_KEY_SPEECH_LOCALE = 'vora_speech_locale'

// Voice defaults
export const DEFAULT_SPEECH_VOLUME = 1.0
export const MIN_SPEECH_VOLUME = 0.0
export const MAX_SPEECH_VOLUME = 1.0
export const DEFAULT_SPEECH_LOCALE = 'en-US'

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
