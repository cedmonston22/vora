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
import { storageGet, stripWakeWord } from '../utils/helpers'
import {
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
  const sessionActive = useRef(false)
  const processingRef = useRef(false)
  const wakeArmedUntil = useRef(0)
  const settingsRef = useRef<VoiceSettings>(DEFAULT_SETTINGS)
  settingsRef.current = session.settings
  const ARMED_WINDOW_MS = 12000
  // runCommand is defined below; the recognizer's onFinal callback needs to
  // invoke it without creating a useCallback dependency cycle (runCommand
  // calls enterListening, which would re-create the recognizer on every
  // new runCommand identity). The ref is updated in a useEffect after
  // runCommand is defined.
  const runCommandRef = useRef<(cmd: VoiceCommand) => Promise<void>>(
    async () => {},
  )

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

  // Watchdog: TRANSCRIBING is meant to be a transient state during the Whisper
  // round-trip (typically 400–1500ms). If we sit in it longer than 6s, a
  // callback was dropped (network hang, Groq stall, popup race) — recover
  // back to a usable state instead of hanging forever.
  useEffect(() => {
    if (session.state !== 'TRANSCRIBING') return
    const id = window.setTimeout(() => {
      const armed = Date.now() < wakeArmedUntil.current
      const nextState: ExtensionState =
        alwaysOnRef.current || armed ? 'LISTENING' : 'IDLE'
      const msg = "Didn't catch that — try again."
      dispatch({ type: 'state', state: nextState, message: msg })
      dispatch({ type: 'transcript', text: '' })
    }, 6000)
    return () => window.clearTimeout(id)
  }, [session.state])

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
        locale: settingsRef.current.locale,
        onTranscribing: () => {
          // Whisper round-trip is in flight. Show a transient state so the
          // user knows we're working — without this the UI sits on
          // "Listening" with empty text and looks frozen.
          dispatch({
            type: 'state',
            state: 'TRANSCRIBING',
            message: 'Transcribing…',
          })
          void broadcastState('TRANSCRIBING', 'Transcribing…')
        },
        onPartial: (text) => {
          console.log('[vora] partial:', text)
          // Empty text: Whisper returned nothing (silence/noise) or we're
          // resetting the line. Always drop back to a non-TRANSCRIBING state
          // — without this, a noise-only clip leaves the UI stuck on
          // "Transcribing…" until the next utterance.
          if (!text) {
            const armed = Date.now() < wakeArmedUntil.current
            const nextState: ExtensionState =
              alwaysOnRef.current || armed ? 'LISTENING' : 'IDLE'
            const msg = alwaysOnRef.current
              ? 'Always-on. Just speak. Say "Vora off" to stop.'
              : armed
                ? 'Active. Say a command.'
                : 'Idle. Say "Vora" to activate, or "Vora on" for always-on.'
            dispatch({ type: 'state', state: nextState, message: msg })
            dispatch({ type: 'transcript', text: '' })
            void broadcastState(nextState, msg)
            void broadcastPartial('')
            return
          }
          const stripped = stripWakeWord(text)
          const armed = Date.now() < wakeArmedUntil.current
          // Display the RAW transcript at all times — wake-stripping is for
          // command routing only, not display. Showing stripped text was
          // hiding words from the user when the wake matcher mis-fired on
          // the first word of their utterance.
          if (stripped === null) {
            if (armed || alwaysOnRef.current) {
              if (armed) {
                wakeArmedUntil.current = Date.now() + ARMED_WINDOW_MS
              }
              dispatch({ type: 'state', state: 'LISTENING', message: 'Listening — go ahead.' })
              dispatch({ type: 'transcript', text })
              void broadcastState('LISTENING')
              void broadcastPartial(text)
            } else {
              // Heard speech but no wake word and not armed — fall back to
              // IDLE so we don't sit on TRANSCRIBING.
              dispatch({
                type: 'state',
                state: 'IDLE',
                message: `Heard: "${text}" (no wake word)`,
              })
              dispatch({ type: 'transcript', text: '' })
              void broadcastState('IDLE')
              void broadcastPartial('')
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
          dispatch({ type: 'transcript', text })
          void broadcastState('LISTENING')
          void broadcastPartial(text)
        },
        onFinal: (cmd) => {
          console.log('[vora] final:', cmd.transcript)
          const stripped = stripWakeWord(cmd.transcript)
          const armed = Date.now() < wakeArmedUntil.current

          // Session toggle: "vora on" / "vora off" / "turn on" / "turn off".
          // Detect on the wake-stripped command so it always wins, even in
          // always-on mode (where we still want "vora off" to stop).
          const toggle = stripped !== null ? parseSessionToggle(stripped) : null
          if (toggle === 'on') {
            wakeArmedUntil.current = 0
            void broadcastPartial('')
            void enterAlwaysOn()
            return
          }
          if (toggle === 'off') {
            wakeArmedUntil.current = 0
            void broadcastPartial('')
            void exitAlwaysOn()
            return
          }

          if (stripped === null && !armed && !alwaysOnRef.current) {
            console.log('[vora] no wake word and not armed, ignoring:', cmd.transcript)
            dispatch({
              type: 'state',
              state: 'IDLE',
              message: `Heard: "${cmd.transcript}" (no wake word)`,
            })
            dispatch({ type: 'transcript', text: '' })
            void broadcastState('IDLE', `Heard: "${cmd.transcript}" (no wake word)`)
            void broadcastPartial('')
            return
          }
          if (stripped === '') {
            console.log('[vora] wake word only, arming for next utterance')
            wakeArmedUntil.current = Date.now() + ARMED_WINDOW_MS
            void broadcastPartial('')
            return
          }
          // Whisper produces one final per VAD-bounded utterance, so we run
          // the command immediately. The accumulate-then-settle dance the
          // old Web Speech path needed (mid-utterance finals, multiple
          // finals per command) is unnecessary here.
          const command = stripped !== null ? stripped : cmd.transcript.trim()
          wakeArmedUntil.current = Date.now() + ARMED_WINDOW_MS
          void runCommandRef.current({ transcript: command, timestamp: cmd.timestamp })
        },
        onError: (err) => {
          console.warn('[vora] recognition error:', err)
          if (err === 'missing-groq-key') {
            dispatch({
              type: 'state',
              state: 'ERROR',
              message: 'Add your Groq API key in Settings to enable voice.',
            })
            sessionActive.current = false
            setSessionOn(false)
            return
          }
          if (
            err === 'not-allowed' ||
            err === 'service-not-allowed' ||
            err === 'mic-unavailable'
          ) {
            dispatch({
              type: 'state',
              state: 'ERROR',
              message: 'Microphone access denied. Allow it in chrome://settings/content/microphone.',
            })
            sessionActive.current = false
            setSessionOn(false)
          }
          // Other errors (transient Groq failures) leave the session running
          // so the next utterance can recover.
        },
        onEnd: () => {
          // The recognizer ends only on stopListening(). runCommand calls
          // enterListening at the end of every command, so we don't need to
          // restart here.
          if (!sessionActive.current) return
          if (processingRef.current) return
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

      // Workflow handling — guided dialogues (compose email, new calendar
      // event). On a trigger we navigate to the workflow's openUrl, then walk
      // through slots one at a time. Each answer can run a fillAction on the
      // page so the user sees the field populate before being asked the next
      // question. After the final slot we read back a summary, get voice
      // confirmation, and run finalAction (e.g. click Send).
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

          if (triggered.openUrl) {
            const opening = `Opening ${triggered.label}…`
            dispatch({ type: 'state', state: 'EXECUTING', message: opening })
            void broadcastState('EXECUTING', opening)
            try {
              const navRes = await chrome.runtime.sendMessage({
                type: MSG.BACKGROUND_NAVIGATE,
                payload: { url: triggered.openUrl },
              })
              if (!navRes?.success) {
                workflowRef.current = null
                const m =
                  typeof navRes?.message === 'string'
                    ? navRes.message
                    : 'I could not open that page.'
                dispatch({ type: 'state', state: 'ERROR', message: m })
                await speakWithSettings(m)
                processingRef.current = false
                enterListening()
                return
              }
            } catch {
              workflowRef.current = null
              await speakWithSettings('I could not open that page.')
              processingRef.current = false
              enterListening()
              return
            }
            await sleep(triggered.openDelayMs ?? 2500)
          }

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

        // For slots with verify(), read the parsed value back and ask for
        // yes/no before filling. On "no" we re-prompt the same slot so the
        // user can re-dictate without the wrong value being typed onto the
        // page. Critical for fields where Web Speech often substitutes
        // common words for unusual names.
        if (slot.verify && value !== '') {
          const verifyPrompt = slot.verify(value)
          dispatch({ type: 'state', state: 'CONFIRMING', message: verifyPrompt })
          void broadcastState('CONFIRMING', verifyPrompt)
          const ok = await getVoiceConfirmation(verifyPrompt, s)
          if (!ok) {
            const retry = `OK, let's try again. ${slot.prompt}`
            dispatch({ type: 'state', state: 'LISTENING', message: retry })
            void broadcastState('LISTENING', retry)
            await speakWithSettings(retry)
            processingRef.current = false
            enterListening()
            return
          }
        }

        wf.values[slot.id] = value

        // Run the slot's fillAction on the page (e.g. populate the To field
        // in Gmail compose). Retry a couple of times to absorb the brief
        // window where the page is mid-render.
        if (slot.fillAction && value !== '') {
          const action = slot.fillAction(value)
          const fillRes = await sendActionWithRetry(action, 3, 700)
          if (!fillRes.success) {
            workflowRef.current = null
            const m = fillRes.message || 'I could not fill that field.'
            dispatch({ type: 'state', state: 'ERROR', message: m })
            recordHistory({
              transcript: cmd.transcript,
              readback: m,
              success: false,
              timestamp: Date.now(),
            })
            await speakWithSettings(`${m} Cancelling.`)
            processingRef.current = false
            enterListening()
            return
          }
          if (slot.readback) {
            await speakWithSettings(slot.readback(value))
          }
        }

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

        // All slots filled — confirm before running the final action.
        let summary: string
        try {
          summary = wf.workflow.buildConfirmSummary(wf.values)
        } catch (err) {
          workflowRef.current = null
          const m = err instanceof Error ? err.message : 'Could not build summary.'
          await speakWithSettings('Something went wrong putting that together.')
          recordHistory({
            transcript: wf.workflow.label,
            readback: m,
            success: false,
            timestamp: Date.now(),
          })
          processingRef.current = false
          enterListening()
          return
        }

        dispatch({ type: 'state', state: 'CONFIRMING', message: summary })
        void broadcastState('CONFIRMING', summary)
        const confirmed = await getVoiceConfirmation(summary, s)
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

        if (!wf.workflow.finalAction) {
          const message = wf.workflow.finalReadback ?? 'Done.'
          dispatch({ type: 'state', state: 'EXECUTING', message: '✓ ' + message })
          void broadcastState('EXECUTING', '✓ ' + message)
          recordHistory({
            transcript: wf.workflow.label,
            readback: message,
            success: true,
            timestamp: Date.now(),
          })
          lastReadbackRef.current = message
          await speakWithSettings(message)
          processingRef.current = false
          enterListening()
          return
        }

        const finalAction = wf.workflow.finalAction(wf.values)
        const doing = `Finishing ${wf.workflow.label}…`
        dispatch({ type: 'state', state: 'EXECUTING', message: doing })
        void broadcastState('EXECUTING', doing)

        let ok = false
        let finalMsg = ''
        try {
          if (finalAction.type === ActionType.NAVIGATE) {
            const navRes = await chrome.runtime.sendMessage({
              type: MSG.BACKGROUND_NAVIGATE,
              payload: { url: finalAction.url },
            })
            ok = navRes?.success === true
            finalMsg = typeof navRes?.message === 'string' ? navRes.message : ''
          } else {
            const res = await sendActionWithRetry(finalAction, 3, 700)
            ok = res.success
            finalMsg = res.message
          }
        } catch (err) {
          ok = false
          finalMsg = err instanceof Error ? err.message : 'Action failed.'
        }

        const message = ok
          ? wf.workflow.finalReadback ?? finalMsg ?? 'Done.'
          : finalMsg || 'I could not finish that.'
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

  // Keep runCommandRef pointing at the latest runCommand. The recognizer's
  // onFinal calls runCommandRef.current(...), avoiding a useCallback
  // dependency cycle on enterListening.
  useEffect(() => {
    runCommandRef.current = runCommand
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

// Sends an ACTION_EXECUTE message to the active tab's content script with a
// retry loop. Used by workflows where the page is freshly navigated and the
// target field may not be rendered on the first attempt.
async function sendActionWithRetry(
  action: import('../types/actions').BrowserAction,
  attempts: number,
  gapMs: number,
): Promise<{ success: boolean; message: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id == null) return { success: false, message: 'No active tab.' }
  let lastMessage = ''
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, {
        type: MSG.ACTION_EXECUTE,
        payload: action,
      })
      const success = res?.payload?.success === true
      const message =
        typeof res?.payload?.message === 'string' ? res.payload.message : ''
      if (success) return { success: true, message }
      lastMessage = message
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : 'Action failed.'
    }
    if (i < attempts - 1) await sleep(gapMs)
  }
  return { success: false, message: lastMessage || 'Action failed.' }
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
      startListening({
        locale: settings.locale,
        onFinal: (cmd) => {
          clearTimeout(timer)
          const t = cmd.transcript.toLowerCase()
          if (/^\s*(yes|yeah|yep|do it|confirm)\b/.test(t)) finish(true)
          else finish(false)
        },
      })
    } catch {
      clearTimeout(timer)
      finish(false)
    }
  })
}
