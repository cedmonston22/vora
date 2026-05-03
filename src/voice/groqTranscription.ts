// Thin client for Groq's OpenAI-compatible audio transcription endpoint.
// We pin to whisper-large-v3-turbo because it has the best
// accuracy-per-millisecond tradeoff on Groq's free tier (~5x faster than
// whisper-large-v3 with only marginally lower WER).

const GROQ_TRANSCRIBE_URL =
  'https://api.groq.com/openai/v1/audio/transcriptions'
const GROQ_MODEL = 'whisper-large-v3-turbo'

export class GroqTranscriptionError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'GroqTranscriptionError'
  }
}

export type TranscribeOptions = {
  apiKey: string
  audio: Blob
  // BCP-47 locale (e.g. 'en-US'); we pass the language code prefix to Groq.
  // Optional — Whisper auto-detects when omitted.
  locale?: string
  // Comma-separated vocabulary hint biased toward expected words. Whisper's
  // prompt field has limited effect but can nudge proper nouns (e.g. "Vora").
  prompt?: string
}

export async function transcribeAudio(opts: TranscribeOptions): Promise<string> {
  const { apiKey, audio, locale, prompt } = opts
  if (!apiKey) {
    throw new GroqTranscriptionError('Missing Groq API key.')
  }
  if (audio.size === 0) {
    throw new GroqTranscriptionError('Empty audio blob.')
  }

  const form = new FormData()
  // Groq inspects the filename extension to detect the container format.
  // Our recorder emits webm/opus, so .webm is required — passing .bin or
  // omitting the name silently degrades to a 400.
  form.append('file', audio, 'audio.webm')
  form.append('model', GROQ_MODEL)
  form.append('response_format', 'json')
  form.append('temperature', '0')
  if (locale) {
    const lang = locale.split('-')[0]?.toLowerCase()
    if (lang) form.append('language', lang)
  }
  if (prompt) form.append('prompt', prompt)

  let res: Response
  try {
    res = await fetch(GROQ_TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Network error.'
    throw new GroqTranscriptionError(`Groq request failed: ${m}`)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new GroqTranscriptionError(
      `Groq returned ${res.status}: ${body || res.statusText}`,
      res.status,
    )
  }

  const data = (await res.json().catch(() => null)) as { text?: unknown } | null
  const text = data && typeof data.text === 'string' ? data.text.trim() : ''
  return text
}
