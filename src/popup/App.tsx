import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ActivationButton } from './components/ActivationButton'
import { StatusIndicator } from './components/StatusIndicator'
import { CommandHistory } from './components/CommandHistory'
import { SettingsPanel } from './components/SettingsPanel'
import { Visualizer } from './components/Visualizer'
import { LiveTranscript } from './components/LiveTranscript'
import { SpeakingHalo } from './components/SpeakingHalo'
import type { VoiceSettings } from './components/SettingsPanel'
import { useCommandHistory } from './hooks/useCommandHistory'
import { useMicLevel } from './hooks/useMicLevel'
import { startListening, stopListening } from '../voice/speechRecognition'
import { speak, cancelSpeech } from '../voice/speechSynthesis'
import { storageGet, stripWakeWord, editDistance } from '../utils/helpers'
import {
  MIN_CONFIDENCE,
  CONFIRMATION_TIMEOUT_MS,
  DEFAULT_SPEECH_RATE,
  DEFAULT_SPEECH_VOLUME,
  DEFAULT_SPEECH_LOCALE,
  STORAGE_KEY_SPEECH_RATE,
  STORAGE_KEY_SPEECH_VOLUME,
  STORAGE_KEY_SPEECH_VOICE,
  STORAGE_KEY_SPEECH_LOCALE,
} from '../utils/constants'
import { MSG } from '../types/commands'
import type {
  ExtensionState,
  VoiceCommand,
  ParsedIntent,
  ExtensionMessage,
} from '../types/commands'
import { ActionType } from '../types/actions'
import { matchTrigger, isCancelUtterance, isSkipUtterance } from '../workflows'
import type { ActiveWorkflow, Workflow } from '../workflows'

type SessionState = {
  state: ExtensionState
  message: string
  transcript: string
  settings: VoiceSettings
}

type Reducer =
  | { type: 'state'; state: ExtensionState; message?: string }
  | { type: 'message'; message: string }
  | { type: 'transcript'; text: string }
  | { type: 'settings'; patch: Partial<VoiceSettings> }

function reducer(s: SessionState, a: Reducer): SessionState {
  switch (a.type) {
    case 'state':
      return { ...s, state: a.state, message: a.message ?? s.message }
    case 'message':
      return { ...s, message: a.message }
    case 'transcript':
      return { ...s, transcript: a.text }
    case 'settings':
      return { ...s, settings: { ...s.settings, ...a.patch } }
  }
}

const DEFAULT_SETTINGS: VoiceSettings = {
  rate: DEFAULT_SPEECH_RATE,
  volume: DEFAULT_SPEECH_VOLUME,
  voiceName: '',
  locale: DEFAULT_SPEECH_LOCALE,
}

export default function App(): React.ReactElement {
  const [session, dispatch] = useReducer(reducer, {
    state: 'IDLE',
    message: 'Tap the mic to start. Then say "Vora" before each command.',
    transcript: '',
    settings: DEFAULT_SETTINGS,
  })
  const history = useCommandHistory()
  const [sessionOn, setSessionOn] = useState(false)
  const [alwaysOn, setAlwaysOn] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  // Increments on every TTS word boundary so SpeakingHalo can fire a fresh
  // ripple in time with Vora's spoken cadence.
  const [speakingPulse, setSpeakingPulse] = useState(0)
  const onSpeakBoundary = useCallback((): void => {
    setSpeakingPulse((n) => n + 1)
  }, [])
  // Real mic level drives the equalizer bars only when Vora is actively
  // engaged — armed (within the wake window) or always-on. While passively
  // waiting for the wake word the parallel mic stream is closed entirely so
  // we aren't holding the mic open or reacting to ambient room sound.
  // session.state is 'LISTENING' iff armed or always-on; 'IDLE' while passive.
  const isActivelyListening = session.state === 'LISTENING' && !isSpeaking
  const micLevel = useMicLevel(isActivelyListening)
  const alwaysOnRef = useRef(false)
  const learnedRef = useRef<string[]>([])
  const sessionActive = useRef(false)
  const processingRef = useRef(false)
  const wakeArmedUntil = useRef(0)
  const settingsRef = useRef<VoiceSettings>(DEFAULT_SETTINGS)
  settingsRef.current = session.settings
  const ARMED_WINDOW_MS = 12000
  // After a final segment, wait this long for additional speech before
  // actually running the command. Resets on every new partial/final, so a
  // natural mid-sentence pause won't cut the user off.
  const SETTLE_MS = 1500
  const pendingCommandRef = useRef('')
  const pendingConfidenceRef = useRef(0)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stable refs to settle helpers — populated once runCommand is defined
  // below. Using refs lets the recognizer callbacks call them without a
  // dependency cycle on runCommand.
  const flushPendingRef = useRef<() => void>(() => {})
  const scheduleSettleRef = useRef<() => void>(() => {})
  const cancelSettleRef = useRef<() => void>(() => {})

  const captureCandidate = useCallback((transcript: string): void => {
    const lower = transcript.toLowerCase().trim()
    if (!lower) return
    const firstWord = (lower.split(/\s+/)[0] ?? '').replace(/[,.:;!?\-]+$/, '')
    if (firstWord.length < 3 || firstWord.length > 8) return
    const dist = editDistance(firstWord, 'vora')
    // Distance 0–1 already matches the fuzzy gate. We auto-learn 2–3.
    if (dist < 2 || dist > 3) return
    if (learnedRef.current.includes(firstWord)) return
    const next = [...learnedRef.current, firstWord].slice(-10)
    learnedRef.current = next
    console.log('[vora] auto-learned wake alias:', firstWord, 'distance:', dist)
  }, [])

  // Track last readback for "repeat that" support
  const lastReadbackRef = useRef<string>('')

  // Active multi-step workflow (e.g. composing a Gmail draft, scheduling a
  // calendar event). When set, incoming transcripts are routed to the
  // workflow's slot collector instead of the LLM action pipeline.
  const workflowRef = useRef<ActiveWorkflow | null>(null)

  // Load persisted settings on mount
  useEffect(() => {
    const load = async (): Promise<void> => {
      const [rate, volume, voiceName, locale] = await Promise.all([
        storageGet<number>(STORAGE_KEY_SPEECH_RATE),
        storageGet<number>(STORAGE_KEY_SPEECH_VOLUME),
        storageGet<string>(STORAGE_KEY_SPEECH_VOICE),
        storageGet<string>(STORAGE_KEY_SPEECH_LOCALE),
      ])
      const patch: Partial<VoiceSettings> = {}
      if (typeof rate === 'number') patch.rate = rate
      if (typeof volume === 'number') patch.volume = volume
      if (typeof voiceName === 'string') patch.voiceName = voiceName
      if (typeof locale === 'string') patch.locale = locale
      if (Object.keys(patch).length > 0) dispatch({ type: 'settings', patch })
    }
    void load()
  }, [])

  // Auto-start passive listening when the side panel mounts. Chrome requires a
  // user gesture for the first mic access, and a useEffect runs after the
  // gesture from opening the panel may have expired. So we try to start
  // immediately, and if that fails we attach a one-shot listener so the very
  // first click/keydown anywhere in the side panel kicks it off.
  useEffect(() => {
    let started = false

    const tryStart = (): void => {
      if (started || sessionActive.current) return
      try {
        sessionActive.current = true
        setSessionOn(true)
        enterListening()
        started = true
        console.log('[vora] auto-start succeeded')
      } catch (err) {
        sessionActive.current = false
        setSessionOn(false)
        console.warn('[vora] auto-start deferred until first interaction:', err)
      }
    }

    tryStart()

    if (!started) {
      const onAnyInput = (): void => {
        tryStart()
        if (started) {
          document.removeEventListener('click', onAnyInput, true)
          document.removeEventListener('keydown', onAnyInput, true)
        }
      }
      document.addEventListener('click', onAnyInput, true)
      document.addEventListener('keydown', onAnyInput, true)

      return () => {
        document.removeEventListener('click', onAnyInput, true)
        document.removeEventListener('keydown', onAnyInput, true)
        sessionActive.current = false
        stopListening()
      }
    }

    return () => {
      sessionActive.current = false
      stopListening()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendToTab = useCallback(async (msg: ExtensionMessage): Promise<void> => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id == null) return
      await chrome.tabs.sendMessage(tab.id, msg).catch(() => undefined)
    } catch {
      // ignore — overlay is best-effort
    }
  }, [])

  const broadcastState = useCallback(
    async (state: ExtensionState, message?: string): Promise<void> => {
      const payload = message !== undefined ? { state, message } : { state }
      await sendToTab({ type: MSG.STATE_CHANGE, payload })
    },
    [sendToTab],
  )

  const broadcastPartial = useCallback(
    async (partial: string): Promise<void> => {
      await sendToTab({ type: MSG.TRANSCRIPT_UPDATE, payload: { partial } })
    },
    [sendToTab],
  )

  const broadcastHistory = useCallback(
    async (entry: import('../types/commands').CommandHistoryEntry): Promise<void> => {
      await sendToTab({ type: MSG.HISTORY_ENTRY, payload: entry })
    },
    [sendToTab],
  )

  const speakWithCurrentSettings = useCallback(
    async (text: string): Promise<void> => {
      const s = settingsRef.current
      setIsSpeaking(true)
      try {
        await speak(text, {
          rate: s.rate,
          volume: s.volume,
          voiceName: s.voiceName || undefined,
          locale: s.locale,
          onBoundary: onSpeakBoundary,
        })
      } finally {
        setIsSpeaking(false)
      }
    },
    [onSpeakBoundary],
  )

  const enterAlwaysOn = useCallback(async (): Promise<void> => {
    if (alwaysOnRef.current) return
    alwaysOnRef.current = true
    setAlwaysOn(true)
    processingRef.current = true
    stopListening()
    dispatch({
      type: 'state',
      state: 'LISTENING',
      message: 'Always-on. Just speak. Say "Vora off" to stop.',
    })
    void broadcastState('LISTENING', 'Always-on. Just speak. Say "Vora off" to stop.')
    await speakWithCurrentSettings('Always-on mode. Just speak.')
    processingRef.current = false
    enterListening()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcastState, speakWithCurrentSettings])

  const exitAlwaysOn = useCallback(async (): Promise<void> => {
    if (!alwaysOnRef.current) return
    alwaysOnRef.current = false
    setAlwaysOn(false)
    wakeArmedUntil.current = 0
    processingRef.current = true
    stopListening()
    dispatch({
      type: 'state',
      state: 'IDLE',
      message: 'Idle. Say "Vora" to activate, or "Vora on" for always-on.',
    })
    void broadcastState('IDLE', 'Idle. Say "Vora" to activate, or "Vora on" for always-on.')
    await speakWithCurrentSettings('Always-on off. Say Vora before each command.')
    processingRef.current = false
    enterListening()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcastState, speakWithCurrentSettings])

  const enterListening = useCallback((): void => {
    if (!sessionActive.current) return
    dispatch({ type: 'transcript', text: '' })
    const armed = Date.now() < wakeArmedUntil.current
    if (alwaysOnRef.current) {
      dispatch({
        type: 'state',
        state: 'LISTENING',
        message: 'Always-on. Just speak. Say "Vora off" to stop.',
      })
      void broadcastState('LISTENING', 'Always-on. Just speak. Say "Vora off" to stop.')
    } else if (armed) {
      // We're between hearing the wake word and capturing the command.
      // Stay visibly Active so the user knows Vora is engaged.
      dispatch({
        type: 'state',
        state: 'LISTENING',
        message: 'Active. Say a command.',
      })
      void broadcastState('LISTENING', 'Active. Say a command.')
    } else {
      dispatch({
        type: 'state',
        state: 'IDLE',
        message: 'Idle. Say "Vora" to activate, or "Vora on" for always-on.',
      })
      void broadcastState('IDLE')
    }
    void broadcastPartial('')
    try {
      startListening({
        onPartial: (text) => {
          console.log('[vora] partial:', text)
          const stripped = stripWakeWord(text, learnedRef.current)
          const armed = Date.now() < wakeArmedUntil.current
          if (stripped === null) {
            if (armed || alwaysOnRef.current) {
              if (armed) {
                // User is speaking the command; keep extending the window so
                // long pauses or slow speech don't drop the utterance.
                wakeArmedUntil.current = Date.now() + ARMED_WINDOW_MS
              }
              dispatch({ type: 'state', state: 'LISTENING', message: 'Listening — go ahead.' })
              dispatch({ type: 'transcript', text })
              void broadcastState('LISTENING')
              void broadcastPartial(text)
              // User is still speaking — extend the settle window so a brief
              // pause won't trigger an early flush.
              if (pendingCommandRef.current) scheduleSettleRef.current()
            }
            return
          }
          if (stripped === '') {
            dispatch({
              type: 'state',
              state: 'LISTENING',
              message: 'Active. Say a command.',
            })
            dispatch({ type: 'transcript', text: '' })
            void broadcastState('LISTENING')
            void broadcastPartial('')
            return
          }
          dispatch({ type: 'state', state: 'LISTENING', message: 'Listening — go ahead.' })
          dispatch({ type: 'transcript', text: stripped })
          void broadcastState('LISTENING')
          void broadcastPartial(stripped)
          if (pendingCommandRef.current) scheduleSettleRef.current()
        },
        onFinal: (cmd) => {
          console.log('[vora] final:', cmd.transcript, 'confidence:', cmd.confidence)
          const stripped = stripWakeWord(cmd.transcript, learnedRef.current)
          const armed = Date.now() < wakeArmedUntil.current

          // Session toggle: "vora on" / "vora off" / "turn on" / "turn off".
          // Detect on the wake-stripped command so it always wins, even in
          // always-on mode (where we still want "vora off" to stop).
          const toggle = stripped !== null ? parseSessionToggle(stripped) : null
          if (toggle === 'on') {
            cancelSettleRef.current()
            wakeArmedUntil.current = 0
            void broadcastPartial('')
            void enterAlwaysOn()
            return
          }
          if (toggle === 'off') {
            cancelSettleRef.current()
            wakeArmedUntil.current = 0
            void broadcastPartial('')
            void exitAlwaysOn()
            return
          }

          if (stripped === null && !armed && !alwaysOnRef.current) {
            console.log('[vora] no wake word and not armed, ignoring:', cmd.transcript)
            captureCandidate(cmd.transcript)
            dispatch({
              type: 'message',
              message: `Heard: "${cmd.transcript}" (no wake word)`,
            })
            void broadcastPartial('')
            return
          }
          if (stripped === '') {
            console.log('[vora] wake word only, arming for next utterance')
            wakeArmedUntil.current = Date.now() + ARMED_WINDOW_MS
            void broadcastPartial('')
            return
          }
          // Accumulate this final into the pending command and schedule a
          // settle. Mid-sentence pauses produce premature finals from the
          // engine; the settle waits for true silence before running so we
          // don't cut the user off.
          const command = stripped !== null ? stripped : cmd.transcript.trim()
          wakeArmedUntil.current = Date.now() + ARMED_WINDOW_MS
          pendingCommandRef.current = pendingCommandRef.current
            ? `${pendingCommandRef.current} ${command}`
            : command
          pendingConfidenceRef.current = Math.max(
            pendingConfidenceRef.current,
            cmd.confidence,
          )
          void broadcastPartial(pendingCommandRef.current)
          scheduleSettleRef.current()
        },
        onError: (err) => {
          console.warn('[vora] recognition error:', err)
          // 'no-speech' and 'aborted' are normal — onEnd will handle the restart.
          if (err === 'not-allowed' || err === 'service-not-allowed') {
            dispatch({
              type: 'state',
              state: 'ERROR',
              message: 'Microphone access denied. Allow it in chrome://settings/content/microphone.',
            })
            sessionActive.current = false
            setSessionOn(false)
          }
        },
        onEnd: () => {
          // Recognition can end on browser silence timeouts even with
          // continuous=true. Don't restart while a command is being processed,
          // otherwise the brief IDLE-restart flashes between THINKING and
          // EXECUTING. runCommand will call enterListening again at the end.
          if (!sessionActive.current) return
          if (processingRef.current) return
          setTimeout(() => {
            if (sessionActive.current && !processingRef.current) enterListening()
          }, 250)
        },
      })
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Microphone unavailable.'
      dispatch({ type: 'state', state: 'ERROR', message: m })
      sessionActive.current = false
      setSessionOn(false)
      void broadcastState('ERROR', m)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcastState, broadcastPartial])

  const stopSession = useCallback((): void => {
    sessionActive.current = false
    setSessionOn(false)
    alwaysOnRef.current = false
    setAlwaysOn(false)
    wakeArmedUntil.current = 0
    workflowRef.current = null
    stopListening()
    cancelSpeech()
    cancelSettleRef.current()
    setIsSpeaking(false)
    dispatch({
      type: 'state',
      state: 'IDLE',
      message: 'Tap the mic to start. Then say "Vora" before each command.',
    })
    dispatch({ type: 'transcript', text: '' })
    void broadcastState('IDLE')
  }, [broadcastState])

  const onToggle = useCallback((): void => {
    if (sessionActive.current) {
      stopSession()
      return
    }
    sessionActive.current = true
    setSessionOn(true)
    enterListening()
  }, [enterListening, stopSession])

  const recordHistory = useCallback(
    (entry: import('../types/commands').CommandHistoryEntry): void => {
      history.add(entry)
      void broadcastHistory(entry)
    },
    [history, broadcastHistory],
  )

  const runCommand = useCallback(
    async (cmd: VoiceCommand): Promise<void> => {
      if (!sessionActive.current) return
      const s = settingsRef.current

      const speakWithSettings = async (text: string): Promise<void> => {
        setIsSpeaking(true)
        try {
          await speak(text, {
            rate: s.rate,
            volume: s.volume,
            voiceName: s.voiceName || undefined,
            locale: s.locale,
            onBoundary: onSpeakBoundary,
          })
        } finally {
          setIsSpeaking(false)
        }
      }

      // Mark processing so the recognizer's onEnd does not flip us back to
      // IDLE between pipeline stages.
      processingRef.current = true
      // Pause recognition while we process so TTS readback isn't heard back.
      stopListening()

      if (cmd.confidence > 0 && cmd.confidence < MIN_CONFIDENCE) {
        dispatch({
          type: 'state',
          state: 'ERROR',
          message: `Heard "${cmd.transcript}" but not clearly.`,
        })
        await speakWithSettings(
          `I heard "${cmd.transcript}" but I'm not sure what you meant. Please rephrase.`,
        )
        enterListening()
        return
      }

      // Workflow handling — multi-step guided dialogues (compose email, new
      // calendar event). Active workflows route the transcript to the slot
      // collector instead of the LLM. Trigger phrases start a workflow.
      const activeWorkflow = workflowRef.current
      const triggered: Workflow | null = activeWorkflow
        ? null
        : matchTrigger(cmd.transcript)

      if (activeWorkflow || triggered) {
        // Cancel mid-workflow.
        if (activeWorkflow && isCancelUtterance(cmd.transcript)) {
          workflowRef.current = null
          dispatch({ type: 'state', state: 'IDLE', message: 'Cancelled.' })
          void broadcastState('IDLE', 'Cancelled.')
          await speakWithSettings('Cancelled.')
          processingRef.current = false
          enterListening()
          return
        }

        // Start a new workflow on trigger phrase.
        if (triggered) {
          const wf: ActiveWorkflow = {
            workflow: triggered,
            slotIndex: 0,
            values: {},
          }
          workflowRef.current = wf
          const slot = triggered.slots[0]
          const status = `${triggered.label}: ${slot.prompt}`
          dispatch({ type: 'state', state: 'LISTENING', message: status })
          void broadcastState('LISTENING', status)
          await speakWithSettings(slot.prompt)
          processingRef.current = false
          enterListening()
          return
        }

        // Continue an in-flight workflow: parse the answer for the current slot.
        const wf = activeWorkflow as ActiveWorkflow
        const slot = wf.workflow.slots[wf.slotIndex]
        let value: string | null
        if (slot.skippable && isSkipUtterance(cmd.transcript)) {
          value = ''
        } else if (slot.parse) {
          value = slot.parse(cmd.transcript)
        } else {
          value = cmd.transcript.trim() || null
        }

        if (value === null) {
          const reprompt =
            slot.onParseFail ?? `Sorry, I didn't catch that. ${slot.prompt}`
          dispatch({ type: 'state', state: 'LISTENING', message: reprompt })
          void broadcastState('LISTENING', reprompt)
          await speakWithSettings(reprompt)
          processingRef.current = false
          enterListening()
          return
        }

        wf.values[slot.id] = value
        wf.slotIndex += 1

        if (wf.slotIndex < wf.workflow.slots.length) {
          const next = wf.workflow.slots[wf.slotIndex]
          const status = `${wf.workflow.label}: ${next.prompt}`
          dispatch({ type: 'state', state: 'LISTENING', message: status })
          void broadcastState('LISTENING', status)
          await speakWithSettings(next.prompt)
          processingRef.current = false
          enterListening()
          return
        }

        // All slots filled — confirm, then navigate to the prefilled URL.
        let plan
        try {
          plan = wf.workflow.buildPlan(wf.values)
        } catch (err) {
          workflowRef.current = null
          const m = err instanceof Error ? err.message : 'Could not build the plan.'
          recordHistory({
            transcript: wf.workflow.label,
            readback: m,
            success: false,
            timestamp: Date.now(),
          })
          await speakWithSettings('Something went wrong putting that together.')
          processingRef.current = false
          enterListening()
          return
        }

        dispatch({ type: 'state', state: 'CONFIRMING', message: plan.summary })
        void broadcastState('CONFIRMING', plan.summary)
        const confirmed = await getVoiceConfirmation(plan.summary, s)
        if (!confirmed) {
          workflowRef.current = null
          recordHistory({
            transcript: wf.workflow.label,
            readback: 'Cancelled.',
            success: false,
            timestamp: Date.now(),
          })
          await speakWithSettings('Cancelled. What would you like to do?')
          processingRef.current = false
          enterListening()
          return
        }

        workflowRef.current = null
        const doing = `Opening ${wf.workflow.label}…`
        dispatch({ type: 'state', state: 'EXECUTING', message: doing })
        void broadcastState('EXECUTING', doing)

        try {
          const navRes = await chrome.runtime.sendMessage({
            type: MSG.BACKGROUND_NAVIGATE,
            payload: { url: plan.url },
          })
          const ok = navRes?.success === true
          const message: string =
            typeof navRes?.message === 'string' && navRes.message
              ? navRes.message
              : ok
                ? `${wf.workflow.label} opened.`
                : 'Could not open that page.'
          if (ok) lastReadbackRef.current = message
          recordHistory({
            transcript: wf.workflow.label,
            readback: message,
            success: ok,
            timestamp: Date.now(),
          })
          const resultPrefix = ok ? '✓ ' : '✗ '
          dispatch({
            type: 'state',
            state: ok ? 'EXECUTING' : 'ERROR',
            message: resultPrefix + message,
          })
          void broadcastState(ok ? 'EXECUTING' : 'ERROR', resultPrefix + message)
          await speakWithSettings(message)
          await sleep(400)
        } catch (err) {
          const m = err instanceof Error ? err.message : 'Navigation failed.'
          recordHistory({
            transcript: wf.workflow.label,
            readback: m,
            success: false,
            timestamp: Date.now(),
          })
          dispatch({ type: 'state', state: 'ERROR', message: m })
          void broadcastState('ERROR')
          await speakWithSettings('Something went wrong.')
        }

        processingRef.current = false
        enterListening()
        return
      }

      dispatch({ type: 'state', state: 'THINKING', message: `"${cmd.transcript}"` })
      dispatch({ type: 'transcript', text: '' })
      void broadcastState('THINKING', `"${cmd.transcript}"`)
      console.log('[vora] sending to service worker:', cmd.transcript)

      // Attach last readback so service worker can pass it to promptBuilder
      const cmdWithContext: VoiceCommand = {
        ...cmd,
        lastReadback: lastReadbackRef.current || undefined,
      }

      let intent: ParsedIntent
      let restricted = false
      try {
        const res = await chrome.runtime.sendMessage({
          type: MSG.VOICE_COMMAND_RECEIVED,
          payload: cmdWithContext,
        })
        console.log('[vora] service worker response:', res)
        if (!res?.ok) {
          const err: string = res?.error ?? 'Something went wrong.'
          dispatch({ type: 'state', state: 'ERROR', message: err })
          recordHistory({
            transcript: cmd.transcript,
            readback: err,
            success: false,
            timestamp: Date.now(),
          })
          await speakWithSettings(err)
          enterListening()
          return
        }
        intent = res.intent as ParsedIntent
        restricted = res.restricted === true
      } catch (err) {
        const m = err instanceof Error ? err.message : 'Background error.'
        dispatch({ type: 'state', state: 'ERROR', message: m })
        recordHistory({
          transcript: cmd.transcript,
          readback: m,
          success: false,
          timestamp: Date.now(),
        })
        await speakWithSettings('Something went wrong while processing that command.')
        enterListening()
        return
      }

      // Handle REPEAT_LAST directly — no execution needed
      if (intent.action.type === ActionType.REPEAT_LAST) {
        const toRepeat = intent.action.message || lastReadbackRef.current
        if (toRepeat) {
          dispatch({ type: 'state', state: 'IDLE', message: toRepeat })
          await speakWithSettings(toRepeat)
        } else {
          await speakWithSettings('Nothing to repeat yet.')
        }
        enterListening()
        return
      }

      if (intent.confirmationText) {
        dispatch({ type: 'state', state: 'CONFIRMING', message: intent.confirmationText })
        void broadcastState('CONFIRMING')
        const confirmed = await getVoiceConfirmation(intent.confirmationText, s)
        if (!confirmed) {
          await speakWithSettings('Cancelled. What would you like to do?')
          recordHistory({
            transcript: cmd.transcript,
            readback: 'Cancelled.',
            success: false,
            timestamp: Date.now(),
          })
          enterListening()
          return
        }
      }

      const description = describeAction(intent.action)
      const preview = `About to: ${description}`
      dispatch({ type: 'state', state: 'EXECUTING', message: preview })
      void broadcastState('EXECUTING', preview)
      await sleep(900)

      const doing = `Doing: ${description}`
      dispatch({ type: 'state', state: 'EXECUTING', message: doing })
      void broadcastState('EXECUTING', doing)

      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (tab?.id == null) throw new Error('No active tab.')
        let execSuccess: boolean
        let execMessageRaw: string
        const isTabAction =
          intent.action.type === ActionType.OPEN_TAB ||
          intent.action.type === ActionType.CLOSE_TAB ||
          intent.action.type === ActionType.SWITCH_TAB
        if (isTabAction) {
          // Tab management lives in the worker — content scripts can't manage tabs.
          const tabRes = await chrome.runtime.sendMessage({
            type: MSG.BACKGROUND_TAB_ACTION,
            payload: intent.action,
          })
          execSuccess = tabRes?.success === true
          execMessageRaw = typeof tabRes?.message === 'string' ? tabRes.message : ''
        } else if (restricted && intent.action.type === ActionType.NAVIGATE) {
          // Content script can't run on the New Tab page or other chrome:// URLs,
          // so the service worker performs the navigation via chrome.tabs.update.
          const navRes = await chrome.runtime.sendMessage({
            type: MSG.BACKGROUND_NAVIGATE,
            payload: { url: intent.action.url },
          })
          execSuccess = navRes?.success === true
          execMessageRaw = typeof navRes?.message === 'string' ? navRes.message : ''
        } else {
          const exec = await chrome.tabs.sendMessage(tab.id, {
            type: MSG.ACTION_EXECUTE,
            payload: intent.action,
          })
          execSuccess = exec?.payload?.success === true
          execMessageRaw =
            typeof exec?.payload?.message === 'string' ? exec.payload.message : ''
        }
        const ok = execSuccess
        const execMessage: string =
          execMessageRaw ||
          (ok ? intent.readbackText : 'I tried but could not act on the page.')

        const spoken =
          intent.action.type === ActionType.READ_CONTENT && ok
            ? execMessage
            : ok
              ? intent.readbackText
              : execMessage

        // Store last readback for "repeat that"
        if (ok) lastReadbackRef.current = spoken

        recordHistory({
          transcript: cmd.transcript,
          readback: spoken,
          success: ok,
          timestamp: Date.now(),
        })
        // Hold the result on screen while TTS reads it. Only return to IDLE
        // after the readback finishes.
        const resultPrefix = ok ? '✓ ' : '✗ '
        dispatch({
          type: 'state',
          state: ok ? 'EXECUTING' : 'ERROR',
          message: resultPrefix + spoken,
        })
        void broadcastState(ok ? 'EXECUTING' : 'ERROR', resultPrefix + spoken)
        await speakWithSettings(spoken)
        await sleep(400)
      } catch (err) {
        const m = err instanceof Error ? err.message : 'Execution error.'
        recordHistory({
          transcript: cmd.transcript,
          readback: m,
          success: false,
          timestamp: Date.now(),
        })
        dispatch({ type: 'state', state: 'ERROR', message: m })
        void broadcastState('ERROR')
        await speakWithSettings('Something went wrong while acting on the page.')
      }

      processingRef.current = false
      enterListening()
    },
    [broadcastState, enterListening, recordHistory, onSpeakBoundary],
  )

  // Wire the settle helpers now that runCommand exists. Effect re-runs if
  // runCommand identity changes; refs ensure recognizer callbacks always see
  // the latest implementation without re-creating enterListening.
  useEffect(() => {
    flushPendingRef.current = (): void => {
      const text = pendingCommandRef.current.trim()
      const confidence = pendingConfidenceRef.current
      pendingCommandRef.current = ''
      pendingConfidenceRef.current = 0
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current)
        settleTimerRef.current = null
      }
      if (!text) return
      wakeArmedUntil.current = 0
      const cmd: VoiceCommand = { transcript: text, confidence, timestamp: Date.now() }
      void runCommand(cmd)
    }
    scheduleSettleRef.current = (): void => {
      if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current)
      settleTimerRef.current = setTimeout(() => flushPendingRef.current(), SETTLE_MS)
    }
    cancelSettleRef.current = (): void => {
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current)
        settleTimerRef.current = null
      }
      pendingCommandRef.current = ''
      pendingConfidenceRef.current = 0
    }
  }, [runCommand])

  const onSettingsChange = useCallback((patch: Partial<VoiceSettings>): void => {
    dispatch({ type: 'settings', patch })
  }, [])

  const visualizerMode: 'idle' | 'listening' = session.state === 'LISTENING' && !isSpeaking
    ? 'listening'
    : 'idle'
  const heroActive = isSpeaking || visualizerMode === 'listening'

  return (
    <main className="flex min-h-[32rem] w-[22rem] flex-col gap-4 bg-gradient-to-b from-mist via-white to-white p-5 text-stone-900">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-vora-500 to-vora-700 text-white shadow-sm"
          >
            <span className="text-xs font-bold">V</span>
          </span>
          <h1 className="text-lg font-semibold tracking-tight">Vora</h1>
        </div>
        {alwaysOn && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            Always-on
          </span>
        )}
      </header>

      {/* Hero: V logo + halo + visualizer + live transcript */}
      <section
        className={[
          'relative flex flex-col items-center gap-5 rounded-2xl px-5 py-7',
          'bg-white/80 ring-1 ring-stone-200/70 backdrop-blur-sm',
          'shadow-[0_8px_30px_rgba(123,44,191,0.08)] transition-shadow duration-300',
          heroActive && 'shadow-[0_8px_40px_rgba(123,44,191,0.18)]',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="relative z-10 flex w-full flex-col items-center gap-5">
          {/* Logo + speaking aura — bigger wrapper so the blobs have room to
              radiate outward without being clipped */}
          <div className="relative flex h-40 w-40 items-center justify-center">
            <SpeakingHalo active={isSpeaking} pulseTrigger={speakingPulse} />
            <ActivationButton isActive={sessionOn} onToggle={onToggle} />
          </div>

          {/* Visualizer is always present so the user's bars never disappear */}
          <Visualizer mode={visualizerMode} getLevel={micLevel.getLevel} />

          <LiveTranscript text={session.transcript} state={session.state} />
          <div className="flex flex-col items-center gap-1.5">
            <StatusIndicator state={session.state} />
            <p className="min-h-[1rem] max-w-[18rem] text-center text-xs text-stone-500">
              {session.message}
            </p>
          </div>
        </div>
      </section>

      {history.entries.length > 0 && (
        <section className="rounded-xl bg-white/60 p-3 ring-1 ring-stone-200/60">
          <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            Recent
          </h2>
          <CommandHistory entries={history.entries} />
        </section>
      )}

      <section className="rounded-xl bg-white/60 p-3 ring-1 ring-stone-200/60">
        <SettingsPanel settings={session.settings} onSettingsChange={onSettingsChange} />
      </section>
    </main>
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseSessionToggle(stripped: string): 'on' | 'off' | null {
  const t = stripped.toLowerCase().replace(/[.,!?]+$/, '').trim()
  if (t === 'on' || t === 'turn on' || t === 'always on' || t === 'stay on') return 'on'
  if (t === 'off' || t === 'turn off' || t === 'always off' || t === 'stop' || t === 'stay off')
    return 'off'
  return null
}

function describeAction(action: import('../types/actions').BrowserAction): string {
  switch (action.type) {
    case ActionType.CLICK_ELEMENT:
      return `Click "${action.label || 'element'}"`
    case ActionType.FILL_INPUT:
      return `Fill "${action.label || 'input'}" with "${action.value}"`
    case ActionType.CLEAR_INPUT:
      return `Clear "${action.label || 'field'}"`
    case ActionType.SELECT_OPTION:
      return `Select "${action.value}" in "${action.label || 'dropdown'}"`
    case ActionType.SCROLL_DOWN:
      return 'Scroll down'
    case ActionType.SCROLL_UP:
      return 'Scroll up'
    case ActionType.SCROLL_TO_ELEMENT:
      return `Scroll to "${action.label || 'element'}"`
    case ActionType.NAVIGATE:
      return `Navigate to ${action.url}`
    case ActionType.SUBMIT_FORM:
      return `Submit "${action.label || 'form'}"`
    case ActionType.READ_CONTENT:
      return 'Read page content'
    case ActionType.FOCUS_ELEMENT:
      return `Focus "${action.label || 'element'}"`
    case ActionType.PRESS_KEY:
      return action.label ? action.label : `Press "${action.key}"`
    case ActionType.REPEAT_LAST:
      return 'Repeat last readback'
    case ActionType.OPEN_TAB:
      return `Open new tab to ${action.url}`
    case ActionType.CLOSE_TAB:
      return action.label ? `Close tab "${action.label}"` : 'Close current tab'
    case ActionType.SWITCH_TAB:
      return `Switch to "${action.label || 'tab'}"`
    case ActionType.UNKNOWN:
      return action.reason
  }
}

async function getVoiceConfirmation(prompt: string, settings: VoiceSettings): Promise<boolean> {
  await speak(prompt, {
    rate: settings.rate,
    volume: settings.volume,
    voiceName: settings.voiceName || undefined,
    locale: settings.locale,
  })
  return new Promise<boolean>((resolve) => {
    let done = false
    const finish = (v: boolean): void => {
      if (done) return
      done = true
      stopListening()
      resolve(v)
    }
    const timer = setTimeout(() => finish(false), CONFIRMATION_TIMEOUT_MS)
    try {
      startListening((cmd) => {
        clearTimeout(timer)
        const t = cmd.transcript.toLowerCase()
        if (/^\s*(yes|yeah|yep|do it|confirm)\b/.test(t)) finish(true)
        else finish(false)
      })
    } catch {
      clearTimeout(timer)
      finish(false)
    }
  })
}
