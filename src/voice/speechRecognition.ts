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

  // Utterance buffering:
  // - Flush after a short silence so natural pauses are respected.
  // - Keep a longer hard cap as a safety net for run-on speech.
  const SILENCE_FLUSH_MS = 1200
  const UTTERANCE_MAX_MS = 12000
  let bufferedFinals = ''
  let liveInterim = ''
  let bufferedConfidence = 0
  let utteranceStartTs = 0
  let capTimer: ReturnType<typeof setTimeout> | null = null
  let silenceTimer: ReturnType<typeof setTimeout> | null = null

  const resetUtterance = (): void => {
    if (capTimer !== null) {
      clearTimeout(capTimer)
      capTimer = null
    }
    if (silenceTimer !== null) {
      clearTimeout(silenceTimer)
      silenceTimer = null
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

  const scheduleSilenceFlush = (): void => {
    if (silenceTimer !== null) clearTimeout(silenceTimer)
    silenceTimer = setTimeout(flushUtterance, SILENCE_FLUSH_MS)
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
    if (bufferedFinals || liveInterim) scheduleSilenceFlush()
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
