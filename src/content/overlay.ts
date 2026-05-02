import type { ExtensionState } from '../types/commands'

// Scope C — implement in overlay.ts
export function showOverlay(_state: ExtensionState): void {
  throw new Error('Not implemented')
}

export function hideOverlay(): void {
  throw new Error('Not implemented')
}
