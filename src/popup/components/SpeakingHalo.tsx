import React, { useEffect, useRef, useState } from 'react'

type Props = {
  active: boolean
  // Increments on each speech boundary so the aura can kick a fresh burst
  // of intensity in time with the spoken cadence. Boundary events aren't
  // guaranteed by every TTS voice, so the halo also runs an always-on
  // heartbeat while `active` so you can never miss that Vora is speaking.
  pulseTrigger: number
}

type Blob = {
  // Base offset from center (px) — gives the aura its lopsided silhouette.
  dx: number
  dy: number
  // Base radius (px) before scaling.
  size: number
  // Independent oscillation params so each blob breathes at its own rate.
  freqX: number
  freqY: number
  freqDriftX: number
  freqDriftY: number
  phaseX: number
  phaseY: number
  phaseDriftX: number
  phaseDriftY: number
  // Drift radius (px).
  driftAmpX: number
  driftAmpY: number
  // Tailwind background color class — varied tones for depth.
  color: string
}

const BLOBS: Blob[] = [
  {
    dx: -16,
    dy: -12,
    size: 160,
    freqX: 0.0011,
    freqY: 0.0014,
    freqDriftX: 0.0007,
    freqDriftY: 0.0009,
    phaseX: 0.2,
    phaseY: 1.1,
    phaseDriftX: 0.4,
    phaseDriftY: 2.2,
    driftAmpX: 12,
    driftAmpY: 9,
    color: 'bg-vora-400',
  },
  {
    dx: 18,
    dy: 8,
    size: 180,
    freqX: 0.0014,
    freqY: 0.0010,
    freqDriftX: 0.0006,
    freqDriftY: 0.0008,
    phaseX: 1.7,
    phaseY: 0.6,
    phaseDriftX: 2.7,
    phaseDriftY: 1.3,
    driftAmpX: 14,
    driftAmpY: 10,
    color: 'bg-vora-300',
  },
  {
    dx: -8,
    dy: 20,
    size: 145,
    freqX: 0.0009,
    freqY: 0.0013,
    freqDriftX: 0.0010,
    freqDriftY: 0.0006,
    phaseX: 3.4,
    phaseY: 2.9,
    phaseDriftX: 1.9,
    phaseDriftY: 0.8,
    driftAmpX: 10,
    driftAmpY: 12,
    color: 'bg-vora-500',
  },
  {
    dx: 10,
    dy: -18,
    size: 150,
    freqX: 0.0017,
    freqY: 0.0008,
    freqDriftX: 0.0009,
    freqDriftY: 0.0011,
    phaseX: 2.1,
    phaseY: 0.3,
    phaseDriftX: 3.0,
    phaseDriftY: 2.5,
    driftAmpX: 12,
    driftAmpY: 11,
    color: 'bg-vora-400',
  },
]

// Always-on heartbeat freq while active (rad/ms). ~0.7s period so the aura
// pulses about 1.5×/sec — clearly visible "Vora is talking" rhythm.
const HEARTBEAT_FREQ = 0.009

export function SpeakingHalo({ active, pulseTrigger }: Props): React.ReactElement | null {
  const [mounted, setMounted] = useState(active)
  const blobsRef = useRef<Array<HTMLSpanElement | null>>([])
  const ringRef = useRef<HTMLSpanElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const burstRef = useRef(0)
  const activeRef = useRef(active)
  const lastTriggerRef = useRef(pulseTrigger)
  const reducedMotion = useRef(false)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.current = mq.matches
    const onChange = (e: MediaQueryListEvent): void => {
      reducedMotion.current = e.matches
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Keep mounted briefly after `active` flips off so the aura can fade out
  // smoothly via opacity transition rather than snapping to black.
  useEffect(() => {
    if (active) {
      setMounted(true)
      return
    }
    const t = setTimeout(() => setMounted(false), 450)
    return () => clearTimeout(t)
  }, [active])

  // Each speech boundary kicks the burst up; per-frame decay smooths it down.
  useEffect(() => {
    if (!active) {
      burstRef.current = 0
      lastTriggerRef.current = pulseTrigger
      return
    }
    if (pulseTrigger === lastTriggerRef.current) return
    lastTriggerRef.current = pulseTrigger
    // Vary kick magnitude per word so the aura feels like it's reacting to
    // emphasis, not a metronome.
    const kick = 0.6 + Math.random() * 0.5
    burstRef.current = Math.min(2.0, burstRef.current + kick)
  }, [pulseTrigger, active])

  useEffect(() => {
    if (!mounted) return

    if (reducedMotion.current) {
      // Static: render blobs at base position/scale, no animation loop.
      for (let i = 0; i < BLOBS.length; i++) {
        const el = blobsRef.current[i]
        const b = BLOBS[i]
        if (el) el.style.transform = `translate(${b.dx}px, ${b.dy}px) scale(1)`
      }
      if (ringRef.current) ringRef.current.style.transform = 'scale(1)'
      return
    }

    const tick = (t: number): void => {
      // Decay the burst — quick fall-off so each word feels distinct.
      burstRef.current *= 0.93
      const burst = burstRef.current

      // Always-on heartbeat while speaking. 0..1 range.
      const heartbeat = activeRef.current
        ? 0.5 + 0.5 * Math.sin(t * HEARTBEAT_FREQ)
        : 0

      for (let i = 0; i < BLOBS.length; i++) {
        const el = blobsRef.current[i]
        if (!el) continue
        const b = BLOBS[i]

        // Per-axis scale wobble for uneven, organic feel.
        const sxBase = 0.95 + 0.20 * Math.sin(t * b.freqX + b.phaseX)
        const syBase = 0.95 + 0.20 * Math.sin(t * b.freqY + b.phaseY)
        // Heartbeat pushes the whole aura in/out so it visibly throbs even
        // without any boundary events. Burst stacks on top per word.
        const sx = sxBase + heartbeat * 0.30 + burst * 0.40
        const sy = syBase + heartbeat * 0.34 + burst * 0.46

        // Slow positional drift so blobs orbit lazily around their base point.
        const driftX = Math.sin(t * b.freqDriftX + b.phaseDriftX) * b.driftAmpX
        const driftY = Math.cos(t * b.freqDriftY + b.phaseDriftY) * b.driftAmpY

        el.style.transform = `translate(${(b.dx + driftX).toFixed(2)}px, ${(b.dy + driftY).toFixed(2)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`
      }

      // Glowing ring directly on the logo edge — the unmistakable "speaking"
      // cue. Scales with heartbeat + burst so it visibly pulses.
      if (ringRef.current) {
        const ringScale = 1.02 + heartbeat * 0.10 + burst * 0.14
        const ringOpacity = activeRef.current
          ? Math.min(1, 0.55 + heartbeat * 0.30 + burst * 0.25)
          : 0
        ringRef.current.style.transform = `scale(${ringScale.toFixed(3)})`
        ringRef.current.style.opacity = ringOpacity.toFixed(3)
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [mounted])

  if (!mounted) return null

  return (
    <div
      aria-hidden
      className={[
        'pointer-events-none absolute inset-0 z-0 flex items-center justify-center',
        'transition-opacity duration-500',
        active ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      {/* Diffuse multi-blob aura — the soft purple cloud */}
      {BLOBS.map((b, i) => (
        <span
          key={i}
          ref={(el) => {
            blobsRef.current[i] = el
          }}
          className={`absolute rounded-full opacity-90 blur-xl ${b.color}`}
          style={{
            width: `${b.size}px`,
            height: `${b.size}px`,
            transform: `translate(${b.dx}px, ${b.dy}px) scale(1)`,
            willChange: 'transform',
          }}
        />
      ))}
      {/* Bright ring hugging the logo edge — the unambiguous "speaking" cue */}
      <span
        ref={ringRef}
        className="absolute h-20 w-20 rounded-[22px] ring-4 ring-vora-400 shadow-[0_0_24px_rgba(155,93,229,0.65)]"
        style={{ transform: 'scale(1)', willChange: 'transform, opacity', opacity: 0.55 }}
      />
    </div>
  )
}
