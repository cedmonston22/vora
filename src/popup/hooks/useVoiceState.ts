import { useState } from 'react'
import type { ExtensionState } from '../../types/commands'

// Scope D — implement: listen to chrome.runtime messages for STATE_CHANGE
export function useVoiceState(): ExtensionState {
  const [state] = useState<ExtensionState>('IDLE')
  return state
}
