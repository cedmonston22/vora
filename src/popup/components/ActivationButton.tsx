import React from 'react'

// Scope D — implement
type Props = { onToggle: () => void; isActive: boolean }

export function ActivationButton({ onToggle, isActive }: Props): React.ReactElement {
  return <button onClick={onToggle}>{isActive ? 'Stop' : 'Start'}</button>
}
