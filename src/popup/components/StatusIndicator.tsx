import React from 'react'
import type { ExtensionState } from '../../types/commands'
import { OVERLAY_COLORS } from '../../utils/constants'

type Props = { state: ExtensionState }

const labelMap: Record<ExtensionState, string> = {
  IDLE: 'Idle',
  LISTENING: 'Active',
  THINKING: 'Thinking',
  CONFIRMING: 'Confirm?',
  EXECUTING: 'Acting',
  ERROR: 'Error',
}

const colorMap: Record<ExtensionState, string> = {
  IDLE: '#475569',
  LISTENING: OVERLAY_COLORS.LISTENING,
  THINKING: OVERLAY_COLORS.THINKING,
  CONFIRMING: OVERLAY_COLORS.CONFIRMING,
  EXECUTING: OVERLAY_COLORS.EXECUTING,
  ERROR: OVERLAY_COLORS.ERROR,
}

export function StatusIndicator({ state }: Props): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-sm font-medium text-slate-700"
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: colorMap[state] }}
      />
      <span>{labelMap[state]}</span>
    </div>
  )
}
