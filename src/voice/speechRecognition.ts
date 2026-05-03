import type { VoiceCommand } from '../types/commands'
import { transcribeAudio, GroqTranscriptionError } from './groqTranscription'
import { storageGet } from '../utils/helpers'
import { STORAGE_KEY_GROQ_KEY } from '../utils/constants'

// VAD tuning. The recorder runs continuously, so RMS_THRESHOLD only gates
// whether we *send* an utterance to Whisper — the audio leading into the
// trigger is already captured. SPEECH_END_MS is generous so mid-sentence
// thinking pauses don't split an utterance into two Whisper calls.
//
// IDLE_RESTART_MS bounds how much pre-roll silence rides along with each
// utterance. Without a periodic restart the recorder would accumulate
// every second of silence since session start, ballooning Whisper input.
const RMS_THRESHOLD = 0.006
const VAD_INTERVAL_MS = 30
const SPEECH_END_MS = 1200
const IDLE_RESTART_MS = 4000
const RECORDER_TIMESLICE_MS = 200

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
]

// Hardcoded English. Whisper auto-detect occasionally flips to other
// languages on short or noisy clips, which manifests as transcripts in
// Spanish/Portuguese for English speech. Locked here to keep judges' demo
// deterministic.
const WHISPER_LOCALE = 'en-US'

export type ListenCallbacks = {
  onPartial?: (transcript: string) => void
  onFinal: (cmd: VoiceCommand) => void
  onError?: (error: string) => void
  onEnd?: () => void
  onSpeechStart?: () => void
  onSpeechEnd?: () => void
  // Fires after speech ends but before the Whisper response lands. Lets the
  // UI show a "transcribing…" placeholder during the network round-trip,
  // which can be 400-1500ms on the free tier.
  onTranscribing?: () => void
  // BCP-47 locale (e.g. 'en-US'). Forwarded to Whisper as the language hint;
  // falls back to WHISPER_LOCALE when omitted or empty.
  locale?: string
}

interface Session {
  stream: MediaStream | null
  audioCtx: AudioContext | null
  source: MediaStreamAudioSourceNode | null
  analyser: AnalyserNode | null
  vadTimer: ReturnType<typeof setInterval> | null
  // The recorder runs continuously while the session is active. It rotates
  // (stop + immediately replace) on speech end so each Whisper request gets
  // a self-contained webm file, and on idle timeout to bound pre-roll size.
  recorder: MediaRecorder | null
  recorderChunks: Blob[]
  recorderStartedAt: number
  recorderMime: string
  speaking: boolean
  lastVoicedAt: number
  cbs: ListenCallbacks
  apiKey: string
  stopped: boolean
}

let active: Session | null = null

export function startListening(
  onFinalOrCallbacks: ((cmd: VoiceCommand) => void) | ListenCallbacks,
): void {
  if (active) return

  // Fast synchronous failure for unsupported browsers, mirroring the old
  // Web Speech behavior so App.tsx's try/catch still fires.
  if (typeof MediaRecorder === 'undefined' ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone capture is not supported in this browser.')
  }

  const cbs: ListenCallbacks =
    typeof onFinalOrCallbacks === 'function'
      ? { onFinal: onFinalOrCallbacks }
      : onFinalOrCallbacks

  const session: Session = {
    stream: null,
    audioCtx: null,
    source: null,
    analyser: null,
    vadTimer: null,
    recorder: null,
    recorderChunks: [],
    recorderStartedAt: 0,
    recorderMime: pickMime(),
    speaking: false,
    lastVoicedAt: 0,
    cbs,
    apiKey: '',
    stopped: false,
  }
  active = session

  void initSession(session)
}

export function stopListening(): void {
  const s = active
  if (!s) return
  active = null
  teardown(s)
  s.cbs.onEnd?.()
}

export function isListening(): boolean {
  return active !== null
}

// Internals ------------------------------------------------------------------

async function initSession(s: Session): Promise<void> {
  const apiKey = (await storageGet<string>(STORAGE_KEY_GROQ_KEY))?.trim() ?? ''
  if (s.stopped) return
  if (!apiKey) {
    bailout(s, 'missing-groq-key')
    return
  }
  s.apiKey = apiKey

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Keep echo cancellation — without it, TTS playback gets fed back
        // into the mic and shows up as phantom commands.
        echoCancellation: true,
        // Browser noise suppression and AGC degrade Whisper accuracy: NS
        // strips fricatives and quiet phonemes, AGC pumps room noise up
        // between words. Whisper is trained on raw, varied audio.
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    })
  } catch (err) {
    if (s.stopped) return
    const msg = err instanceof Error ? err.message : ''
    const code = /denied|permission|not allowed/i.test(msg)
      ? 'not-allowed'
      : 'mic-unavailable'
    bailout(s, code)
    return
  }
  if (s.stopped) {
    for (const t of stream.getTracks()) t.stop()
    return
  }
  s.stream = stream

  const audioCtx = new AudioContext({ sampleRate: 16000 })
  if (audioCtx.state === 'suspended') {
    try { await audioCtx.resume() } catch { /* swallow */ }
  }
  if (s.stopped) {
    try { void audioCtx.close() } catch { /* ignore */ }
    for (const t of stream.getTracks()) t.stop()
    return
  }

  const source = audioCtx.createMediaStreamSource(stream)
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 1024
  analyser.smoothingTimeConstant = 0.4
  source.connect(analyser)

  s.audioCtx = audioCtx
  s.source = source
  s.analyser = analyser

  // Start the always-on recorder before VAD wakes up so the first tick
  // already has audio history to draw on.
  startRecorder(s)

  const buf = new Float32Array(analyser.fftSize)
  s.vadTimer = setInterval(() => tickVad(s, buf), VAD_INTERVAL_MS)
  console.log('[vora-rec] groq-whisper recognizer started')
}

function bailout(s: Session, errCode: string): void {
  if (active === s) active = null
  s.cbs.onError?.(errCode)
  teardown(s)
  s.cbs.onEnd?.()
}

function teardown(s: Session): void {
  s.stopped = true
  if (s.vadTimer !== null) {
    clearInterval(s.vadTimer)
    s.vadTimer = null
  }
  if (s.recorder && s.recorder.state !== 'inactive') {
    try { s.recorder.stop() } catch { /* ignore */ }
  }
  s.recorder = null
  s.recorderChunks = []
  if (s.source) {
    try { s.source.disconnect() } catch { /* ignore */ }
    s.source = null
  }
  if (s.audioCtx) {
    try { void s.audioCtx.close() } catch { /* ignore */ }
    s.audioCtx = null
  }
  if (s.stream) {
    for (const t of s.stream.getTracks()) {
      try { t.stop() } catch { /* ignore */ }
    }
    s.stream = null
  }
}

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

function startRecorder(s: Session): void {
  if (!s.stream || s.stopped) return
  // Each recorder owns its own chunks array, captured by closure. The
  // session-level pointer is just a handle for the active recorder; rotating
  // it must NOT redirect this recorder's final dataavailable burst into the
  // next recorder's buffer — that bug was clipping the trailing ~200ms of
  // every utterance and dropping short utterances entirely.
  const chunks: Blob[] = []
  s.recorderChunks = chunks
  s.recorderStartedAt = performance.now()
  try {
    const opts: MediaRecorderOptions = s.recorderMime
      ? { mimeType: s.recorderMime }
      : {}
    const recorder = new MediaRecorder(s.stream, opts)
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }
    recorder.onerror = (e) => {
      console.warn('[vora-rec] recorder error', e)
    }
    s.recorder = recorder
    recorder.start(RECORDER_TIMESLICE_MS)
  } catch (err) {
    console.warn('[vora-rec] failed to start recorder:', err)
    s.recorder = null
  }
}

// Stops the current recorder, optionally sending its blob to Groq, and
// starts a fresh one. The brief gap between stop+start (a few ms) only
// happens during silence (right after speech end or while idle), so no
// real audio is lost.
function rotateRecorder(s: Session, sendToGroq: boolean): void {
  const old = s.recorder
  const oldChunks = s.recorderChunks
  const mime = s.recorderMime || 'audio/webm'
  s.recorder = null
  s.recorderChunks = []

  startRecorder(s)

  if (!old) return

  const onStop = (): void => {
    if (!sendToGroq || oldChunks.length === 0) return
    const blob = new Blob(oldChunks, { type: mime })
    void transcribeAndDeliver(s, blob)
  }

  if (old.state === 'inactive') {
    onStop()
    return
  }
  old.onstop = onStop
  try {
    old.stop()
  } catch {
    onStop()
  }
}

function tickVad(s: Session, buf: Float32Array): void {
  if (s.stopped || !s.analyser) return
  s.analyser.getFloatTimeDomainData(buf)
  let sumSq = 0
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] ?? 0
    sumSq += v * v
  }
  const rms = Math.sqrt(sumSq / buf.length)
  const now = performance.now()
  const voiced = rms > RMS_THRESHOLD

  if (!s.speaking) {
    if (voiced) {
      // The recorder has been running this whole time — it already has
      // the leading edge of this word in its buffer. Just flip state.
      s.speaking = true
      s.lastVoicedAt = now
      console.log('[vora-rec] speechstart')
      s.cbs.onSpeechStart?.()
      s.cbs.onPartial?.('')
      return
    }
    // Idle: rotate periodically so an unused recorder doesn't accumulate
    // minutes of silence to ship to Whisper on the next utterance.
    if (now - s.recorderStartedAt > IDLE_RESTART_MS) {
      rotateRecorder(s, false)
    }
    return
  }

  if (voiced) {
    s.lastVoicedAt = now
    return
  }
  if (now - s.lastVoicedAt >= SPEECH_END_MS) {
    s.speaking = false
    console.log(
      '[vora-rec] speechend',
      `(${Math.round(now - s.recorderStartedAt)}ms incl. pre-roll)`,
    )
    s.cbs.onSpeechEnd?.()
    rotateRecorder(s, true)
  }
}

async function transcribeAndDeliver(s: Session, blob: Blob): Promise<void> {
  if (s.stopped) return
  s.cbs.onTranscribing?.()
  try {
    const text = await transcribeAudio({
      apiKey: s.apiKey,
      audio: blob,
      locale: s.cbs.locale && s.cbs.locale.trim() ? s.cbs.locale : WHISPER_LOCALE,
    })
    if (s.stopped) return
    if (!text) {
      // Whisper returned nothing — usually a noise-only or sub-word clip.
      // Signal an empty partial so the popup can leave the TRANSCRIBING
      // state; do NOT call onFinal because there is no command to run.
      s.cbs.onPartial?.('')
      return
    }
    s.cbs.onPartial?.(text)
    s.cbs.onFinal({ transcript: text, timestamp: Date.now() })
  } catch (err) {
    if (s.stopped) return
    const m =
      err instanceof GroqTranscriptionError ? err.message
      : err instanceof Error ? err.message
      : 'Transcription failed.'
    console.warn('[vora-rec] transcription error:', m)
    s.cbs.onError?.(m)
  }
}
