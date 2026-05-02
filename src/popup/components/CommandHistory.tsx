import React from 'react'
import type { CommandHistoryEntry } from '../../types/commands'

type Props = { entries: CommandHistoryEntry[] }

export function CommandHistory({ entries }: Props): React.ReactElement {
  if (entries.length === 0) {
    return <p className="px-1 text-xs text-slate-400">No commands yet.</p>
  }
  return (
    <ul className="max-h-32 space-y-1 overflow-y-auto px-1">
      {entries.map((e) => (
        <li
          key={e.timestamp}
          className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-700"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{e.transcript}</span>
            <span
              aria-label={e.success ? 'Succeeded' : 'Failed'}
              className={e.success ? 'text-emerald-600' : 'text-rose-600'}
            >
              {e.success ? '✓' : '×'}
            </span>
          </div>
          <div className="truncate text-slate-500">{e.readback}</div>
        </li>
      ))}
    </ul>
  )
}
