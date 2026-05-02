import React, { useEffect, useRef } from 'react'
import { Mic, MicOff } from 'lucide-react'

type Props = {
  isActive: boolean
  onToggle: () => void
}

export function ActivationButton({ isActive, onToggle }: Props): React.ReactElement {
  const btnRef = useRef<HTMLButtonElement>(null)
  const prevActive = useRef(isActive)

  // Trigger confirm-bounce animation when transitioning from inactive → active
  useEffect(() => {
    if (isActive && !prevActive.current && btnRef.current) {
      btnRef.current.classList.remove('vora-confirm-bounce')
      // Force reflow so the animation restarts
      void btnRef.current.offsetWidth
      btnRef.current.classList.add('vora-confirm-bounce')
    }
    prevActive.current = isActive
  }, [isActive])

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onToggle}
      aria-label={isActive ? 'Stop Vora' : 'Start Vora'}
      aria-pressed={isActive}
      className={[
        // Base — 64×64 circle, min tap target satisfied
        'relative flex h-16 w-16 items-center justify-center rounded-full',
        'text-white transition-all duration-200',
        // Focus ring — Vora 500, 2px solid, 2px offset
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7B2CBF]',
        isActive
          ? // Active — Vora 500 fill + listening pulse + glow ring
            'bg-[#7B2CBF] shadow-[0_0_0_8px_rgba(155,93,229,0.22)] vora-mic-pulse'
          : // Idle — Vora ink fill, subtle hover lift
            'bg-[#1A0B2E] hover:bg-[#3C096C] hover:shadow-[0_0_0_6px_rgba(155,93,229,0.14)]',
      ].join(' ')}
    >
      {isActive
        ? <Mic className="h-7 w-7" aria-hidden />
        : <MicOff className="h-7 w-7" aria-hidden />
      }

      {/* Ping ring — only when active, respects reduced-motion via CSS */}
      {isActive && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-[#9B5DE5] opacity-20 motion-safe:animate-ping"
        />
      )}
    </button>
  )
}
