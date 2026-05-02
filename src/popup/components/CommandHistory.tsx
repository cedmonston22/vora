import React from 'react'
import type { CommandHistoryEntry } from '../../types/commands'

// Scope D — implement
type Props = { entries: CommandHistoryEntry[] }

export function CommandHistory({ entries }: Props): React.ReactElement {
  return <ul>{entries.map((e, i) => <li key={i}>{e.transcript}</li>)}</ul>
}
