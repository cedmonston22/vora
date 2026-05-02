import React, { useCallback, useEffect, useReducer, useRef } from 'react'
import { ActivationButton } from './components/ActivationButton'
import { StatusIndicator } from './components/StatusIndicator'
import { CommandHistory } from './components/CommandHistory'
import { SettingsPanel } from './components/SettingsPanel'
import { useCommandHistory } from './hooks/useCommandHistory'
import { startListening, stopListening } from '../voice/speechRecognition'
import { speak, cancelSpeech } from '../voice/speechSynthesis'
import { storageGet } from '../utils/helpers'
import {
  MIN_CONFIDENCE,
  CONFIRMATION_TIMEOUT_MS,
  DEFAULT_SPEECH_RATE,
  STORAGE_KEY_SPEECH_RATE,
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
  rate: number
}

type Reducer =
  | { type: 'state'; state: ExtensionState; message?: string }
  | { type: 'message'; message: string }
  | { type: 'rate'; rate: number }

function reducer(s: SessionState, a: Reducer): SessionState {
  switch (a.type) {
    case 'state':
      return { ...s, state: a.state, message: a.message ?? s.message }
    case 'message':
      return { ...s, message: a.message }
    case 'rate':
      return { ...s, rate: a.rate }
  }
}

export default function App(): React.ReactElement {
  const [session, dispatch] = useReducer(reducer, {
    state: 'IDLE',
    message: 'Tap the mic to start.',
    rate: DEFAULT_SPEECH_RATE,
  })
  const history = useCommandHistory()
  const sessionActive = useRef(false)
  const rateRef = useRef(DEFAULT_SPEECH_RATE)
  rateRef.current = session.rate

  useEffect(() => {
    void storageGet<number>(STORAGE_KEY_SPEECH_RATE).then((r) => {
      if (typeof r === 'number') dispatch({ type: 'rate', rate: r })
    })
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
          dispatch({ type: 'message', message: `“${text}”` })
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
      const rate = rateRef.current

      if (cmd.confidence > 0 && cmd.confidence < MIN_CONFIDENCE) {
        dispatch({
          type: 'state',
          state: 'ERROR',
          message: `Heard "${cmd.transcript}" but not clearly.`,
        })
        await speak(
          `I heard "${cmd.transcript}" but I'm not sure what you meant. Please rephrase.`,
          rate,
        )
        enterListening()
        return
      }

      dispatch({ type: 'state', state: 'THINKING', message: `"${cmd.transcript}"` })
      void broadcastState('THINKING', `"${cmd.transcript}"`)
      console.log('[vora] sending to service worker:', cmd.transcript)

      let intent: ParsedIntent
      try {
        const res = await chrome.runtime.sendMessage({
          type: MSG.VOICE_COMMAND_RECEIVED,
          payload: cmd,
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
          await speak(err, rate)
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
        await speak('Something went wrong while processing that command.', rate)
        enterListening()
        return
      }

      if (intent.confirmationText) {
        dispatch({ type: 'state', state: 'CONFIRMING', message: intent.confirmationText })
        void broadcastState('CONFIRMING')
        const confirmed = await getVoiceConfirmation(intent.confirmationText, rate)
        if (!confirmed) {
          await speak('Cancelled. What would you like to do?', rate)
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
        await speak(spoken, rate)
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
        await speak('Something went wrong while acting on the page.', rate)
      }

      enterListening()
    },
    [broadcastState, enterListening, recordHistory],
  )

  const onRateChange = useCallback((r: number): void => {
    dispatch({ type: 'rate', rate: r })
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
        <SettingsPanel rate={session.rate} onRateChange={onRateChange} />
      </section>
    </main>
  )
}

async function getVoiceConfirmation(prompt: string, rate: number): Promise<boolean> {
  await speak(prompt, rate)
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
