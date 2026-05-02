import React from 'react'
import type { CommandHistoryEntry } from '../../types/commands'

type Props = { entries: CommandHistoryEntry[] }

export function CommandHistory({ entries }: Props): React.ReactElement {
  if (entries.length === 0) {
    return (
      <p className="px-1 text-[0.75rem] font-medium tracking-wide text-[#6B6577]">
        No commands yet.
      </p>
    )
  }

  return (
    <ul className="vora-scroll max-h-36 space-y-1.5 overflow-y-auto px-1">
      {entries.map((e) => (
        <li
          key={e.timestamp}
          className="rounded-lg border border-[#E5E0EC] bg-[#F5F0FF] px-3 py-2"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-[0.875rem] font-semibold text-[#1F1B2E]">
              {e.transcript}
            </span>
            <span
              aria-label={e.success ? 'Succeeded' : 'Failed'}
              className={[
                'mt-0.5 flex-shrink-0 text-xs font-bold',
                e.success ? 'text-emerald-600' : 'text-red-500',
              ].join(' ')}
            >
              {e.success ? '✓' : '×'}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[0.75rem] text-[#6B6577]">
            {e.readback}
          </div>
        </li>
      ))}
    </ul>
  )
}
