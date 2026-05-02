import type { VoiceCommand } from '../types/commands'

// Scope B — implement in speechRecognition.ts
export function startListening(_onResult: (cmd: VoiceCommand) => void): void {
  throw new Error('Not implemented')
}

export function stopListening(): void {
  throw new Error('Not implemented')
}
