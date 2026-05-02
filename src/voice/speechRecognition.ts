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
  r.continuous = false
  r.interimResults = true
  r.maxAlternatives = 1
  r.lang = 'en-US'

  r.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const item = event.results[i]
      if (!item) continue
      const alt = item[0]
      const transcript = alt.transcript.trim()
      if (!transcript) continue
      if (item.isFinal) {
        cbs.onFinal({
          transcript,
          confidence: typeof alt.confidence === 'number' ? alt.confidence : 0,
          timestamp: Date.now(),
        })
      } else {
        cbs.onPartial?.(transcript)
      }
    }
  }

  r.onerror = () => {
    active = null
  }

  r.onend = () => {
    active = null
  }

  active = r
  try {
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
