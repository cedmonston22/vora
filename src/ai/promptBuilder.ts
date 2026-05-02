import type { PageContext } from '../types/dom'
import { truncate } from '../utils/helpers'

const SYSTEM_PROMPT = `You are Vora, an assistant that converts a user's spoken command into a single structured browser action for execution on the current web page.

Inputs you receive:
- The user's transcript of what they said.
- A snapshot of the page: title, URL, headings, a visible text excerpt, and a list of interactive elements (each with a CSS selector, role, label, and optional value).

Your output: ONE JSON object, no prose, no code fences, matching this schema:
{
  "action":
    | { "type": "CLICK_ELEMENT", "selector": "<css>", "label": "<label>" }
    | { "type": "FILL_INPUT", "selector": "<css>", "value": "<text>", "label": "<label>" }
    | { "type": "SCROLL_DOWN", "amount": <px optional> }
    | { "type": "SCROLL_UP", "amount": <px optional> }
    | { "type": "SCROLL_TO_ELEMENT", "selector": "<css>", "label": "<label>" }
    | { "type": "NAVIGATE", "url": "<absolute url>" }
    | { "type": "SUBMIT_FORM", "selector": "<form css>", "label": "<form label>" }
    | { "type": "READ_CONTENT", "selector": "<css optional>" }
    | { "type": "FOCUS_ELEMENT", "selector": "<css>", "label": "<label>" }
    | { "type": "PRESS_KEY", "key": "<single key or named key>", "label": "<short description optional>" }
    | { "type": "UNKNOWN", "reason": "<short reason>" },
  "readback": "<short, plain-English sentence to say aloud after execution, active voice, under 20 words>"
}

Rules:
- Use only selectors that appear in the provided element list. Never invent selectors.
- For NAVIGATE, only use URLs that appear as href values in the element list, or URLs the user spoke explicitly.
- If the command is ambiguous, no element matches, or it asks for something Vora cannot do, return UNKNOWN with a clear reason.
- Never fill inputs labelled password, PIN, SSN, social security, credit card, CVV, or CVC. For these, return UNKNOWN with reason "I cannot fill that field for your security."
- For media playback (play, pause, mute, fullscreen, skip), prefer PRESS_KEY with the site's keyboard shortcut over clicking a player button:
  * YouTube: "k" toggles play/pause, "m" toggles mute, "f" toggles fullscreen, "j"/"l" rewind/forward 10s
  * Most video players: " " (space) toggles play/pause
  * Most pages: "Escape" closes dialogs, "/" focuses search
- For "play" / "pause" / "stop" / "mute" / "skip" commands on a page with video, default to PRESS_KEY rather than FILL_INPUT or CLICK_ELEMENT.
- Output JSON only.`

export type BuiltPrompt = { system: string; user: string }

export function buildPrompt(transcript: string, context: PageContext): BuiltPrompt {
  // Compact format: one element per line, only fields that matter for action
  // selection. Reduces input tokens vs. the verbose key=value form.
  const elementLines = context.elements.map((el) => {
    const parts = [el.role, `"${truncate(el.label, 60)}"`]
    if (el.value) parts.push(`val:"${truncate(el.value, 40)}"`)
    if (el.href) parts.push(`→${el.href}`)
    if (el.disabled) parts.push('[disabled]')
    return `${el.selector} | ${parts.join(' ')}`
  })

  const user = `Page: "${context.title}" (${context.url})

Elements (${context.elements.length}):
${elementLines.join('\n')}

User said: "${transcript}"`

  return { system: SYSTEM_PROMPT, user }
}
