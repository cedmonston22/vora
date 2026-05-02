import React from 'react'
import { Mic, MicOff } from 'lucide-react'

type Props = {
  isActive: boolean
  onToggle: () => void
}

export function ActivationButton({ isActive, onToggle }: Props): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isActive ? 'Deactivate Vora' : 'Activate Vora'}
      aria-pressed={isActive}
      className={`relative flex h-24 w-24 items-center justify-center rounded-full text-white transition-colors focus:outline-none focus:ring-4 focus:ring-blue-300 ${
        isActive
          ? 'bg-rose-600 hover:bg-rose-700'
          : 'bg-slate-900 hover:bg-slate-800'
      }`}
    >
      {isActive ? <Mic className="h-10 w-10" /> : <MicOff className="h-10 w-10" />}
      {isActive && (
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-rose-500 opacity-30"
        />
      )}
    </button>
  )
}
