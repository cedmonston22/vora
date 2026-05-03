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

  // Hard 3-second utterance window. From the moment the user starts speaking
  // (first interim or final), we collect everything (including interim text
  // never finalized by the engine) for UTTERANCE_MAX_MS, then dispatch the
  // best transcript we have. This avoids Web Speech's tendency to split a
  // single utterance into multiple finals — and bounds command length so
  // long ramblings don't pile up.
  const UTTERANCE_MAX_MS = 3000
  let bufferedFinals = ''
  let liveInterim = ''
  let bufferedConfidence = 0
  let utteranceStartTs = 0
  let capTimer: ReturnType<typeof setTimeout> | null = null

  const resetUtterance = (): void => {
    if (capTimer !== null) {
      clearTimeout(capTimer)
      capTimer = null
    }
    bufferedFinals = ''
    liveInterim = ''
    bufferedConfidence = 0
    utteranceStartTs = 0
  }

  const flushUtterance = (): void => {
    const text = [bufferedFinals, liveInterim].filter(Boolean).join(' ').trim()
    const ts = utteranceStartTs || Date.now()
    const conf = bufferedConfidence
    resetUtterance()
    if (!text) return
    cbs.onFinal({ transcript: text, confidence: conf, timestamp: ts })
  }

  r.onresult = (event) => {
    let interimThisEvent = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const item = event.results[i]
      if (!item) continue
      const alt = item[0]
      const transcript = alt.transcript.trim()
      if (!transcript) continue
      if (item.isFinal) {
        bufferedFinals = bufferedFinals ? `${bufferedFinals} ${transcript}` : transcript
        const c = typeof alt.confidence === 'number' ? alt.confidence : 0
        if (c > bufferedConfidence) bufferedConfidence = c
      } else {
        interimThisEvent = interimThisEvent ? `${interimThisEvent} ${transcript}` : transcript
      }
    }
    liveInterim = interimThisEvent
    if (utteranceStartTs === 0 && (bufferedFinals || liveInterim)) {
      utteranceStartTs = Date.now()
      capTimer = setTimeout(flushUtterance, UTTERANCE_MAX_MS)
    }
    const live = [bufferedFinals, liveInterim].filter(Boolean).join(' ').trim()
    if (live) cbs.onPartial?.(live)
  }

  r.onerror = (e) => {
    console.warn('[vora-rec] error:', e.error)
    resetUtterance()
    active = null
    cbs.onError?.(e.error)
  }

  r.onend = () => {
    console.log('[vora-rec] ended')
    // Flush whatever is buffered before tearing down. Otherwise short
    // utterances ending before the 3s cap (e.g. user said one word and
    // the engine ended on silence) would never reach onFinal.
    flushUtterance()
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
