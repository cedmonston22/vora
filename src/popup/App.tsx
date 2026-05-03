import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ActivationButton } from './components/ActivationButton'
import { StatusIndicator } from './components/StatusIndicator'
import { CommandHistory } from './components/CommandHistory'
import { SettingsPanel } from './components/SettingsPanel'
import type { VoiceSettings } from './components/SettingsPanel'
import { useCommandHistory } from './hooks/useCommandHistory'
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

type SessionState = {
  state: ExtensionState
  message: string
  settings: VoiceSettings
}

type Reducer =
  | { type: 'state'; state: ExtensionState; message?: string }
  | { type: 'message'; message: string }
  | { type: 'settings'; patch: Partial<VoiceSettings> }

function reducer(s: SessionState, a: Reducer): SessionState {
  switch (a.type) {
    case 'state':
      return { ...s, state: a.state, message: a.message ?? s.message }
    case 'message':
      return { ...s, message: a.message }
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
    settings: DEFAULT_SETTINGS,
  })
  const history = useCommandHistory()
  const [sessionOn, setSessionOn] = useState(false)
  const [alwaysOn, setAlwaysOn] = useState(false)
  const alwaysOnRef = useRef(false)
  const [learnedAliases, setLearnedAliases] = useState<string[]>([])
  const learnedRef = useRef<string[]>([])
  const sessionActive = useRef(false)
  const processingRef = useRef(false)
  const wakeArmedUntil = useRef(0)
  const settingsRef = useRef<VoiceSettings>(DEFAULT_SETTINGS)
  settingsRef.current = session.settings
  const ARMED_WINDOW_MS = 12000

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
    setLearnedAliases(next)
    console.log('[vora] auto-learned wake alias:', firstWord, 'distance:', dist)
  }, [])

  // Track last readback for "repeat that" support
  const lastReadbackRef = useRef<string>('')

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

  const speakWithCurrentSettings = useCallback((text: string): Promise<void> => {
    const s = settingsRef.current
    return speak(text, {
      rate: s.rate,
      volume: s.volume,
      voiceName: s.voiceName || undefined,
      locale: s.locale,
    })
  }, [])

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
              dispatch({ type: 'state', state: 'LISTENING', message: `Active: “${text}”` })
              void broadcastState('LISTENING')
              void broadcastPartial(text)
            }
            return
          }
          if (stripped === '') {
            dispatch({
              type: 'state',
              state: 'LISTENING',
              message: 'Active. Say a command.',
            })
            void broadcastState('LISTENING')
            void broadcastPartial('')
            return
          }
          dispatch({ type: 'state', state: 'LISTENING', message: `Active: “${stripped}”` })
          void broadcastState('LISTENING')
          void broadcastPartial(stripped)
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
          // Either wake-word + command, armed mode, or always-on mode picked
          // up the command in this utterance.
          const command = stripped !== null ? stripped : cmd.transcript.trim()
          wakeArmedUntil.current = 0
          const wakedCmd: VoiceCommand = { ...cmd, transcript: command }
          void broadcastPartial(command)
          void runCommand(wakedCmd)
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
    stopListening()
    cancelSpeech()
    dispatch({
      type: 'state',
      state: 'IDLE',
      message: 'Tap the mic to start. Then say "Vora" before each command.',
    })
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

      const speakWithSettings = (text: string): Promise<void> =>
        speak(text, {
          rate: s.rate,
          volume: s.volume,
          voiceName: s.voiceName || undefined,
          locale: s.locale,
        })

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

      dispatch({ type: 'state', state: 'THINKING', message: `"${cmd.transcript}"` })
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
    [broadcastState, enterListening, recordHistory],
  )

  const onSettingsChange = useCallback((patch: Partial<VoiceSettings>): void => {
    dispatch({ type: 'settings', patch })
  }, [])

  return (
    <main className="flex min-h-[28rem] w-80 flex-col gap-3 bg-white p-4 text-slate-900">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Vora</h1>
          {alwaysOn && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
              Always-on
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">Voice control for any website.</p>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-3 py-2">
        <ActivationButton isActive={sessionOn} onToggle={onToggle} />
        <StatusIndicator state={session.state} />
        <p className="min-h-[2.5rem] max-w-[16rem] text-center text-sm text-slate-600">
          {session.message}
        </p>
      </section>

      {learnedAliases.length > 0 && (
        <section className="border-t border-slate-100 pt-2">
          <h2 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            Learned wake words
          </h2>
          <div className="flex flex-wrap gap-1 px-1">
            {learnedAliases.map((w) => (
              <span
                key={w}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
              >
                {w}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="border-t border-slate-100 pt-2">
        <h2 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Recent
        </h2>
        <CommandHistory entries={history.entries} />
      </section>

      <section className="border-t border-slate-100 pt-2">
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
