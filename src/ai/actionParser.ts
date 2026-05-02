import type { ParsedIntent } from '../types/commands'

// Scope A — implement in actionParser.ts
export function parseAction(_rawResponse: string): ParsedIntent {
  throw new Error('Not implemented')
}
