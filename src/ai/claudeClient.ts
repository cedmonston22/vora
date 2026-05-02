import { CLAUDE_MODEL, AI_TIMEOUT_MS, AI_HARD_TIMEOUT_MS } from '../utils/constants'

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'

type AnthropicTextBlock = { type: 'text'; text: string }
type AnthropicBlock = AnthropicTextBlock | { type: string; text?: string }
type AnthropicResponse = {
  content?: AnthropicBlock[]
  error?: { message?: string; type?: string }
}

export type ClaudeCallArgs = {
  system: string
  user: string
  apiKey: string
}

export type AIErrorKind = 'timeout' | 'network' | 'api' | 'no-key' | 'empty'

export class AIError extends Error {
  readonly kind: AIErrorKind
  constructor(message: string, kind: AIErrorKind) {
    super(message)
    this.name = 'AIError'
    this.kind = kind
  }
}

export async function callClaude(args: ClaudeCallArgs): Promise<string> {
  if (!args.apiKey) throw new AIError('No API key configured.', 'no-key')

  const controller = new AbortController()
  const softTimer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  const hardTimer = setTimeout(() => controller.abort(), AI_HARD_TIMEOUT_MS)

  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': args.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: args.system,
        messages: [{ role: 'user', content: args.user }],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new AIError(`Claude API ${res.status}: ${body.slice(0, 240)}`, 'api')
    }

    const json = (await res.json()) as AnthropicResponse
    const text = json.content?.find((c): c is AnthropicTextBlock => c.type === 'text')?.text
    if (!text) throw new AIError('Claude returned no text content.', 'empty')
    return text
  } catch (err) {
    if (err instanceof AIError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AIError('Claude request timed out.', 'timeout')
    }
    throw new AIError(err instanceof Error ? err.message : 'Network error.', 'network')
  } finally {
    clearTimeout(softTimer)
    clearTimeout(hardTimer)
  }
}
