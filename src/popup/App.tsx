import React, { useCallback, useEffect, useReducer, useRef } from 'react'
import { ActivationButton } from './components/ActivationButton'
import { StatusIndicator } from './components/StatusIndicator'
import { CommandHistory } from './components/CommandHistory'
import { SettingsPanel } from './components/SettingsPanel'
import type { VoiceSettings } from './components/SettingsPanel'
import { useCommandHistory } from './hooks/useCommandHistory'
import { startListening, stopListening } from '../voice/speechRecognition'
import { speak, cancelSpeech } from '../voice/speechSynthesis'
import { storageGet } from '../utils/helpers'
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
    message: 'Tap the mic to start.',
    settings: DEFAULT_SETTINGS,
  })
  const history = useCommandHistory()
  const sessionActive = useRef(false)
  const settingsRef = useRef<VoiceSettings>(DEFAULT_SETTINGS)
  settingsRef.current = session.settings

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

  const enterListening = useCallback((): void => {
    if (!sessionActive.current) return
    dispatch({ type: 'state', state: 'LISTENING', message: 'Listening…' })
    void broadcastState('LISTENING')
    void broadcastPartial('')
    try {
      startListening({
        onPartial: (text) => {
          console.log('[vora] partial:', text)
          dispatch({ type: 'message', message: `"${text}"` })
          void broadcastPartial(text)
        },
        onFinal: (cmd) => {
          console.log('[vora] final:', cmd.transcript, 'confidence:', cmd.confidence)
          void broadcastPartial(cmd.transcript)
          void runCommand(cmd)
        },
      })
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Microphone unavailable.'
      dispatch({ type: 'state', state: 'ERROR', message: m })
      sessionActive.current = false
      void broadcastState('ERROR', m)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcastState, broadcastPartial])

  const stopSession = useCallback((): void => {
    sessionActive.current = false
    stopListening()
    cancelSpeech()
    dispatch({ type: 'state', state: 'IDLE', message: 'Tap the mic to start.' })
    void broadcastState('IDLE')
  }, [broadcastState])

  const onToggle = useCallback((): void => {
    if (sessionActive.current) {
      stopSession()
      return
    }
    sessionActive.current = true
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

      dispatch({ type: 'state', state: 'EXECUTING', message: 'Acting…' })
      void broadcastState('EXECUTING')

      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (tab?.id == null) throw new Error('No active tab.')
        const exec = await chrome.tabs.sendMessage(tab.id, {
          type: MSG.ACTION_EXECUTE,
          payload: intent.action,
        })
        const ok = exec?.payload?.success === true
        const execMessage: string =
          (typeof exec?.payload?.message === 'string' ? exec.payload.message : '') ||
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
        dispatch({
          type: 'state',
          state: ok ? 'IDLE' : 'ERROR',
          message: spoken,
        })
        void broadcastState(ok ? 'IDLE' : 'ERROR')
        await speakWithSettings(spoken)
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
        <h1 className="text-lg font-semibold">Vora</h1>
        <p className="text-xs text-slate-500">Voice control for any website.</p>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-3 py-2">
        <ActivationButton
          isActive={sessionActive.current && session.state !== 'IDLE'}
          onToggle={onToggle}
        />
        <StatusIndicator state={session.state} />
        <p className="min-h-[2.5rem] max-w-[16rem] text-center text-sm text-slate-600">
          {session.message}
        </p>
      </section>

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
