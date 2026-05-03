import type { Workflow } from './types'

// Convert spoken email like "alice at gmail dot com" -> "alice@gmail.com".
// Also strips trailing punctuation and collapses whitespace inside the local
// part, since Web Speech often emits "alice smith" for "alice.smith".
function normalizeEmail(raw: string): string | null {
  let t = raw.toLowerCase().trim().replace(/[.,!?;:]+$/g, '')
  // Spoken " at " -> "@" only if no literal "@" is present.
  if (!t.includes('@')) {
    t = t.replace(/\s+at\s+/g, '@')
  }
  // Spoken " dot " -> "."
  t = t.replace(/\s+dot\s+/g, '.')
  // After substitutions, common email shape: <local>@<domain>.<tld>
  // The local part may still contain spaces if the user paused (e.g.
  // "alice smith"). Collapse interior spaces in the local part to a dot,
  // which is a reasonable guess for spoken email; user can correct on
  // confirmation.
  const at = t.indexOf('@')
  if (at < 0) return null
  const local = t.slice(0, at).replace(/\s+/g, '.')
  const domain = t.slice(at + 1).replace(/\s+/g, '')
  if (!local || !domain || !domain.includes('.')) return null
  const candidate = `${local}@${domain}`
  // Loose validation — Gmail itself will reject malformed addresses.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return null
  return candidate
}

// Sentence-case the first letter for subject lines (Web Speech tends to
// return all-lowercase). Leaves the rest of the subject as the user spoke.
function tidyText(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ')
  if (!t) return t
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export const GMAIL_COMPOSE_WORKFLOW: Workflow = {
  id: 'gmail-compose',
  label: 'Compose email',
  triggers: [
    /\b(compose|write|send|draft|start)\s+(an?\s+)?(new\s+)?(email|e-mail|message|gmail)\b/i,
    /\b(new\s+email|new\s+message)\b/i,
    /\bemail\s+(someone|somebody)\b/i,
  ],
  slots: [
    {
      id: 'to',
      prompt: "Who do you want to send the email to? Say their email address.",
      parse: normalizeEmail,
      onParseFail:
        "I didn't catch a valid email address. Try again — for example, 'alice at gmail dot com'.",
    },
    {
      id: 'subject',
      prompt: "What's the subject?",
      parse: (s) => {
        const t = tidyText(s)
        return t.length > 0 ? t : null
      },
      onParseFail: "Please tell me the subject of the email.",
    },
    {
      id: 'body',
      prompt: "What should the email say?",
      parse: (s) => {
        const t = s.trim()
        return t.length > 0 ? t : null
      },
      onParseFail: "Please tell me what the email should say.",
    },
  ],
  buildPlan: (v) => {
    const to = v.to ?? ''
    const subject = v.subject ?? ''
    const body = v.body ?? ''
    const params = new URLSearchParams({
      view: 'cm',
      fs: '1',
      to,
      su: subject,
      body,
    })
    const url = `https://mail.google.com/mail/?${params.toString()}`
    const summary = `I'll open a Gmail draft to ${to} with the subject "${subject}". You can review and say "send it" when you're ready. Continue?`
    return { summary, url }
  },
}
