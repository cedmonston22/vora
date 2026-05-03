import type { VoiceCommand } from '../types/commands'

type Alternative = { transcript: string; confidence: number }
type ResultItem = { isFinal: boolean; readonly 0: Alternative }
type ResultList = { length: number; [i: number]: ResultItem }
type ResultEvent = { results: ResultList; resultIndex: number }
type RecognitionErrorEvent = { error: string }

interface RecognitionInstance {
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  lang: string
  onresult: ((e: ResultEvent) => void) | null
  onerror: ((e: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionCtor = new () => RecognitionInstance

declare global {
  interface Window {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
}

let active: RecognitionInstance | null = null

export type ListenCallbacks = {
  onPartial?: (transcript: string) => void
  onFinal: (cmd: VoiceCommand) => void
  onError?: (error: string) => void
  onEnd?: () => void
}

export function startListening(
  onFinalOrCallbacks: ((cmd: VoiceCommand) => void) | ListenCallbacks,
): void {
  if (active) return
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition
  if (!Ctor) {
    throw new Error('Speech recognition is not supported in this browser.')
  }
  const cbs: ListenCallbacks =
    typeof onFinalOrCallbacks === 'function'
      ? { onFinal: onFinalOrCallbacks }
      : onFinalOrCallbacks

  const r = new Ctor()
  r.continuous = true
  r.interimResults = true
  r.maxAlternatives = 1
  r.lang = 'en-US'

  r.onresult = (event) => {
    // Build a cumulative live string from ALL results (final + interim) so
    // the displayed transcript never drops earlier words when a segment
    // finalizes mid-utterance.
    let cumFinal = ''
    let interim = ''
    for (let i = 0; i < event.results.length; i++) {
      const item = event.results[i]
      if (!item) continue
      const t = item[0].transcript.trim()
      if (!t) continue
      if (item.isFinal) cumFinal += (cumFinal ? ' ' : '') + t
      else interim += (interim ? ' ' : '') + t
    }
    const live = [cumFinal, interim].filter(Boolean).join(' ').trim()
    if (live) cbs.onPartial?.(live)

    // Fire onFinal only for newly finalized segments (resultIndex onward).
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const item = event.results[i]
      if (!item || !item.isFinal) continue
      const alt = item[0]
      const t = alt.transcript.trim()
      if (!t) continue
      cbs.onFinal({
        transcript: t,
        confidence: typeof alt.confidence === 'number' ? alt.confidence : 0,
        timestamp: Date.now(),
      })
    }
  }

  r.onerror = (e) => {
    console.warn('[vora-rec] error:', e.error)
    active = null
    cbs.onError?.(e.error)
  }

  r.onend = () => {
    console.log('[vora-rec] ended')
    active = null
    cbs.onEnd?.()
  }

  active = r
  try {
    console.log('[vora-rec] starting')
    r.start()
  } catch (err) {
    active = null
    throw err
  }
}

export function stopListening(): void {
  if (!active) return
  try {
    active.stop()
  } catch {
    // Already stopping or not started — ignore.
  }
  active = null
}

export function isListening(): boolean {
  return active !== null
}
