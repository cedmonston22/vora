import { useEffect, useRef } from 'react'

type Result = {
  // Returns the current normalized RMS level in [0, 1]. Returns 0 when the
  // hook is disabled or the analyser hasn't initialized yet.
  getLevel: () => number
}

/**
 * Subscribes to the microphone via getUserMedia + AnalyserNode while
 * `enabled` is true. Runs in parallel to SpeechRecognition (browsers share
 * the mic across consumers in the same tab) so the visualizer can react to
 * the user's actual voice without disrupting transcription.
 */
export function useMicLevel(enabled: boolean): Result {
  const levelRef = useRef(0)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!enabled) {
      levelRef.current = 0
      return
    }

    let cancelled = false
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let raf: number | null = null

    const start = async (): Promise<void> => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
      } catch (err) {
        console.warn('[vora] mic level: getUserMedia failed:', err)
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctx) {
          console.warn('[vora] mic level: AudioContext unavailable')
          return
        }
        ctx = new Ctx()
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        analyser.smoothingTimeConstant = 0.6
        src.connect(analyser)

        const buf = new Uint8Array(analyser.fftSize)
        const tick = (): void => {
          analyser.getByteTimeDomainData(buf)
          // Compute RMS deviation from the 128 midpoint, normalize to [0,1].
          let sum = 0
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / buf.length)
          // Slight gain so quiet speech still moves the bars; clamp at 1.
          levelRef.current = Math.min(1, rms * 2.4)
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch (err) {
        console.warn('[vora] mic level: analyser setup failed:', err)
      }
    }

    void start()

    cleanupRef.current = () => {
      cancelled = true
      if (raf !== null) cancelAnimationFrame(raf)
      if (ctx) {
        try {
          void ctx.close()
        } catch {
          // ignore
        }
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
      }
      levelRef.current = 0
    }

    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [enabled])

  return {
    getLevel: () => levelRef.current,
  }
}
