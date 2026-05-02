import { useState } from 'react'
import type { CommandHistoryEntry } from '../../types/commands'
import { MAX_HISTORY_ENTRIES } from '../../utils/constants'

// Scope D — implement
export function useCommandHistory(): {
  entries: CommandHistoryEntry[]
  add: (entry: CommandHistoryEntry) => void
} {
  const [entries, setEntries] = useState<CommandHistoryEntry[]>([])

  const add = (entry: CommandHistoryEntry): void => {
    setEntries((prev) => [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES))
  }

  return { entries, add }
}
