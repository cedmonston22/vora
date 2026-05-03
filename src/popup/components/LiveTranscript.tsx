import React from 'react'
import type { ExtensionState } from '../../types/commands'

type Props = {
  text: string
  state: ExtensionState
}

export function LiveTranscript({ text, state }: Props): React.ReactElement {
  const trimmed = text.trim()
  const isListening = state === 'LISTENING'
  const showPlaceholder = isListening && trimmed.length === 0

  return (
    <div className="flex min-h-[5.5rem] w-full items-center justify-center px-1">
      {trimmed.length > 0 ? (
        <p
          className="text-center text-xl font-medium leading-snug text-stone-900"
          aria-live="polite"
        >
          {trimmed}
          {isListening && (
            <span className="vora-cursor ml-0.5 text-vora-500">▍</span>
          )}
        </p>
      ) : showPlaceholder ? (
        <p className="text-center text-base font-medium tracking-wide text-vora-500/70">
          Listening<span className="vora-cursor ml-0.5">…</span>
        </p>
      ) : (
        <p className="text-center text-sm text-stone-400">Tap the mic and speak.</p>
      )}
    </div>
  )
}
