import React, { useEffect, useRef } from 'react'

type Props = {
  // 'idle' = bars completely still at rest. 'listening' = animated shimmer
  // + audio-level boost. (Speaking state is rendered by SpeakingHalo, not
  // here, so the visualizer is hidden by the parent during TTS.)
  mode: 'idle' | 'listening'
  // Optional live audio level in [0, 1]. In listening mode this adds an
  // intensity boost on top of the always-present shimmer.
  getLevel?: () => number
}

const BAR_COUNT = 9
// Per-bar weights so the bars don't all spike together — center bars are
// taller, edges shorter, mimicking a typical equalizer envelope.
const BAR_WEIGHTS = [0.45, 0.62, 0.80, 0.93, 1.0, 0.93, 0.80, 0.62, 0.45]
// Per-bar phase offsets for smoothing/jitter so motion doesn't look uniform.
const BAR_PHASES = [0.0, 1.7, 0.6, 2.4, 3.1, 0.9, 2.0, 1.2, 2.8]
// Synthetic frequencies — slightly different per bar for organic motion.
const FREQS = [0.0042, 0.0061, 0.0035, 0.0078, 0.0049, 0.0067, 0.0053, 0.0072, 0.0046]

export function Visualizer({ mode, getLevel }: Props): React.ReactElement {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([])
  const rafRef = useRef<number | null>(null)
  const reducedMotion = useRef(false)
  // Per-bar smoothed level for nice attack/decay behavior.
  const smoothedRef = useRef<number[]>(Array(BAR_COUNT).fill(0.25))

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.current = mq.matches
    const onChange = (e: MediaQueryListEvent): void => {
      reducedMotion.current = e.matches
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const bars = barsRef.current

    const setBar = (i: number, scale: number): void => {
      const el = bars[i]
      if (el) el.style.transform = `scaleY(${scale.toFixed(3)})`
    }

    // Idle: bars completely still at a fixed rest height. No animation loop.
    if (mode === 'idle') {
      for (let i = 0; i < BAR_COUNT; i++) {
        smoothedRef.current[i] = 0.22
        setBar(i, 0.22 + 0.06 * BAR_WEIGHTS[i])
      }
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }

    if (reducedMotion.current) {
      for (let i = 0; i < BAR_COUNT; i++) setBar(i, 0.55 * BAR_WEIGHTS[i] + 0.18)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }

    // Listening: synthetic shimmer always present, audio level adds boost.
    const tick = (t: number): void => {
      for (let i = 0; i < BAR_COUNT; i++) {
        const wobble = 0.5 + 0.5 * Math.sin(t * FREQS[i] + BAR_PHASES[i])
        const audio = getLevel ? getLevel() : 0
        const shimmer = 0.30 + 0.20 * wobble * BAR_WEIGHTS[i]
        const boost = audio * 0.65 * BAR_WEIGHTS[i] * (0.7 + 0.3 * wobble)
        const target = shimmer + boost
        const clamped = Math.max(0.18, Math.min(1, target))
        const prev = smoothedRef.current[i]
        const k = clamped > prev ? 0.55 : 0.20
        const next = prev + (clamped - prev) * k
        smoothedRef.current[i] = next
        setBar(i, next)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [mode, getLevel])

  const colorClass =
    mode === 'listening'
      ? 'bg-gradient-to-t from-vora-500 to-vora-400'
      : 'bg-gradient-to-t from-stone-200 to-stone-200'

  const glowClass =
    mode === 'listening' ? 'shadow-[0_0_10px_rgba(123,44,191,0.35)]' : ''

  return (
    <div
      aria-hidden
      className="flex h-20 items-end justify-center gap-2 px-2"
      role="presentation"
    >
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el
          }}
          className={`block h-16 w-2.5 origin-bottom rounded-full transition-colors duration-300 ${colorClass} ${glowClass}`}
          style={{ transform: 'scaleY(0.25)' }}
        />
      ))}
    </div>
  )
}
