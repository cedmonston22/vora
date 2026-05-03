import type { Workflow } from './types'
import { ActionType } from '../types/actions'

// Convert spoken email like "alice at gmail dot com" -> "alice@gmail.com".
function normalizeEmail(raw: string): string | null {
  let t = raw.toLowerCase().trim().replace(/[.,!?;:]+$/g, '')
  if (!t.includes('@')) {
    t = t.replace(/\s+at\s+/g, '@')
  }
  t = t.replace(/\s+dot\s+/g, '.')
  const at = t.indexOf('@')
  if (at < 0) return null
  const local = t.slice(0, at).replace(/\s+/g, '.')
  const domain = t.slice(at + 1).replace(/\s+/g, '')
  if (!local || !domain || !domain.includes('.')) return null
  const candidate = `${local}@${domain}`
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return null
  return candidate
}

function tidySubject(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ')
  if (!t) return t
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Read an email back in a way that surfaces unusual letter sequences. The
// local part is spoken letter-by-letter so the user can catch the engine
// hearing "mister" instead of "limster", while the domain is spoken
// normally since common domains transcribe reliably.
function spellEmailForReadback(email: string): string {
  const at = email.indexOf('@')
  if (at < 0) return email
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const spelled = local
    .split('')
    .map((c) => (c === '.' ? 'dot' : c))
    .join(' ')
  return `${spelled}, at ${domain}`
}

// Gmail compose selectors. These are stable enough in practice but can
// change — keeping each in one place makes them easy to update.
const GMAIL_TO_SELECTOR =
  'textarea[name="to"], input[name="to"], [aria-label="To recipients"]'
const GMAIL_SUBJECT_SELECTOR = 'input[name="subjectbox"]'
const GMAIL_BODY_SELECTOR =
  'div[aria-label="Message Body"][contenteditable="true"], div[role="textbox"][aria-label*="Message"]'
const GMAIL_SEND_SELECTOR =
  'div[role="button"][data-tooltip-delay][aria-label^="Send"], div[role="button"][aria-label^="Send "]'

export const GMAIL_COMPOSE_WORKFLOW: Workflow = {
  id: 'gmail-compose',
  label: 'Compose email',
  triggers: [
    /^(compose|draft|write|start)\s+(a\s+|an\s+)?(new\s+)?(email|e-mail|gmail)\b/i,
    /^send\s+(a\s+|an\s+)?(new\s+)?(email|e-mail|gmail)\b/i,
    /^new\s+(email|e-mail|gmail)\b/i,
    /^email\s+(someone|somebody|to\b)/i,
  ],
  openUrl: 'https://mail.google.com/mail/u/0/?view=cm&fs=1',
  // Gmail's compose dialog needs a moment to render before the To field
  // becomes selectable. 2.5s is empirically enough on a fresh tab.
  openDelayMs: 2500,
  slots: [
    {
      id: 'to',
      prompt: "Who do you want to send to? Say their email address.",
      parse: normalizeEmail,
      onParseFail:
        "I didn't catch a valid email address. Try again — for example, 'alice at gmail dot com'.",
      // Verify before filling. Email recipients are the most costly slot to
      // get wrong, and Web Speech tends to substitute common words for
      // unusual names ("limster" → "mister"). Reading it back lets the user
      // catch and retry.
      verify: (value) => `I heard ${spellEmailForReadback(value)}. Say "yes" to use it, or "no" to try again.`,
      fillAction: (value) => ({
        type: ActionType.FILL_INPUT,
        selector: GMAIL_TO_SELECTOR,
        value,
        label: 'To',
      }),
      readback: (value) => `Sending to ${value}.`,
    },
    {
      id: 'subject',
      prompt: "What's the subject?",
      parse: (s) => {
        const t = tidySubject(s)
        return t.length > 0 ? t : null
      },
      onParseFail: "Please tell me the subject of the email.",
      fillAction: (value) => ({
        type: ActionType.FILL_INPUT,
        selector: GMAIL_SUBJECT_SELECTOR,
        value,
        label: 'Subject',
      }),
      readback: (value) => `Subject: ${value}.`,
    },
    {
      id: 'body',
      prompt: "What should the email say?",
      parse: (s) => {
        const t = s.trim()
        return t.length > 0 ? t : null
      },
      onParseFail: "Please tell me what the email should say.",
      fillAction: (value) => ({
        type: ActionType.FILL_INPUT,
        selector: GMAIL_BODY_SELECTOR,
        value,
        label: 'Message Body',
      }),
      readback: () => 'Got it. Reading it back to you.',
    },
  ],
  buildConfirmSummary: (v) =>
    `Ready to send to ${v.to ?? ''} with the subject "${v.subject ?? ''}". Send it?`,
  // After confirmation, click the Send button. Gmail also accepts Ctrl+Enter
  // but the synthetic key event isn't always trusted; clicking the button is
  // more reliable.
  finalAction: () => ({
    type: ActionType.CLICK_ELEMENT,
    selector: GMAIL_SEND_SELECTOR,
    label: 'Send',
  }),
  finalReadback: 'Sent.',
}
