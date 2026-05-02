import React, { useEffect, useState } from 'react'
import { storageGet, storageSet } from '../../utils/helpers'
import {
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_SPEECH_RATE,
  DEFAULT_SPEECH_RATE,
  MIN_SPEECH_RATE,
  MAX_SPEECH_RATE,
} from '../../utils/constants'

type Props = {
  rate: number
  onRateChange: (rate: number) => void
}

export function SettingsPanel({ rate, onRateChange }: Props): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    void storageGet<string>(STORAGE_KEY_API_KEY).then((v) => {
      if (typeof v === 'string') setApiKey(v)
    })
  }, [])

  const saveKey = async (): Promise<void> => {
    await storageSet(STORAGE_KEY_API_KEY, apiKey.trim())
    setSavedAt(Date.now())
  }

  const updateRate = async (next: number): Promise<void> => {
    onRateChange(next)
    await storageSet(STORAGE_KEY_SPEECH_RATE, next)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-slate-500 hover:text-slate-800"
      >
        Settings
      </button>
    )
  }

  return (
    <div className="space-y-3 rounded border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">Settings</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-400 hover:text-slate-700"
        >
          Close
        </button>
      </div>

      <div>
        <label
          htmlFor="vora-api-key"
          className="mb-1 block text-xs text-slate-600"
        >
          Anthropic API key
        </label>
        <input
          id="vora-api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-…"
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={() => {
            void saveKey()
          }}
          className="mt-1 w-full rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800"
        >
          Save key
        </button>
        {savedAt != null && (
          <p className="mt-1 text-xs text-emerald-600">Saved.</p>
        )}
      </div>

      <div>
        <label
          htmlFor="vora-rate"
          className="mb-1 block text-xs text-slate-600"
        >
          Speech rate: {rate.toFixed(1)}x
        </label>
        <input
          id="vora-rate"
          type="range"
          min={MIN_SPEECH_RATE}
          max={MAX_SPEECH_RATE}
          step={0.1}
          value={rate}
          onChange={(e) => {
            void updateRate(parseFloat(e.target.value))
          }}
          className="w-full"
        />
        <button
          type="button"
          onClick={() => {
            void updateRate(DEFAULT_SPEECH_RATE)
          }}
          className="mt-1 text-xs text-slate-500 hover:text-slate-800"
        >
          Reset to default
        </button>
      </div>

      <p className="text-xs text-slate-400">
        Stored locally. Voice data is never persisted beyond a single command.
      </p>
    </div>
  )
}
