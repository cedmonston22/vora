import React from 'react'
import type { ExtensionState } from '../../types/commands'

// Scope D — implement
type Props = { state: ExtensionState }

export function StatusIndicator({ state }: Props): React.ReactElement {
  return <div>{state}</div>
}
