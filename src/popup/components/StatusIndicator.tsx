import React from 'react'
import type { ExtensionState } from '../../types/commands'

type Props = { state: ExtensionState }

type StateConfig = {
  label: string
  dot: string      // bg color class or inline style
  text: string     // text color class
  bg: string       // pill bg class
}

const stateConfig: Record<ExtensionState, StateConfig> = {
  IDLE: {
    label: 'Idle',
    dot: 'bg-[#6B6577]',
    text: 'text-[#6B6577]',
    bg: 'bg-[#F5F0FF]',
  },
  LISTENING: {
    label: 'Listening',
    dot: 'bg-[#9B5DE5]',
    text: 'text-[#7B2CBF]',
    bg: 'bg-[#F5F0FF]',
  },
  THINKING: {
    label: 'Thinking',
    dot: 'bg-[#FFB347]',
    text: 'text-[#92400E]',
    bg: 'bg-amber-50',
  },
  CONFIRMING: {
    label: 'Confirm?',
    dot: 'bg-[#7B2CBF]',
    text: 'text-[#3C096C]',
    bg: 'bg-[#F5F0FF]',
  },
  EXECUTING: {
    label: 'Acting',
    dot: 'bg-[#4ADE80]',
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
  },
  ERROR: {
    label: 'Error',
    dot: 'bg-[#EF4444]',
    text: 'text-red-700',
    bg: 'bg-red-50',
  },
}

export function StatusIndicator({ state }: Props): React.ReactElement {
  const cfg = stateConfig[state]

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={[
        'inline-flex items-center gap-2 rounded-pill px-3 py-1',
        'text-sm font-semibold tracking-wide',
        cfg.bg,
        cfg.text,
      ].join(' ')}
    >
      {/* Color dot — never the only indicator, label always present */}
      <span
        aria-hidden
        className={['h-2 w-2 rounded-full flex-shrink-0', cfg.dot].join(' ')}
      />
      <span>{cfg.label}</span>
    </div>
  )
}
