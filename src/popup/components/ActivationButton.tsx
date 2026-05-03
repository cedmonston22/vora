import React, { useEffect, useMemo, useRef } from 'react'

type Props = {
  isActive: boolean
  onToggle: () => void
}

export function ActivationButton({ isActive, onToggle }: Props): React.ReactElement {
  const btnRef = useRef<HTMLButtonElement>(null)
  const prevActive = useRef(isActive)

  // Resolve the packaged logo URL once. chrome.runtime.getURL returns a
  // chrome-extension:// URL that works in any extension surface.
  const logoUrl = useMemo(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      return chrome.runtime.getURL('public/icon128.png')
    }
    return '/public/icon128.png'
  }, [])

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
        'relative z-10 flex h-20 w-20 items-center justify-center overflow-visible rounded-[22px]',
        'transition-all duration-200',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7B2CBF]',
        isActive
          ? 'shadow-[0_0_0_8px_rgba(155,93,229,0.22)] vora-mic-pulse'
          : 'opacity-80 hover:opacity-100 hover:shadow-[0_0_0_6px_rgba(155,93,229,0.16)]',
      ].join(' ')}
    >
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        draggable={false}
        className="h-20 w-20 select-none rounded-[22px]"
      />

      {/* Ping ring — only when active, respects reduced-motion via CSS */}
      {isActive && (
        <span
          aria-hidden
          className="absolute inset-0 -z-10 rounded-[22px] bg-vora-400 opacity-20 motion-safe:animate-ping"
        />
      )}
    </button>
  )
}
