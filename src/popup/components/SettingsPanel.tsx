import React, { useEffect, useState, useCallback } from 'react'
import { storageGet, storageSet } from '../../utils/helpers'
import { getAvailableVoices, getAvailableLocales } from '../../voice/speechSynthesis'
import {
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_SPEECH_RATE,
  STORAGE_KEY_SPEECH_VOLUME,
  STORAGE_KEY_SPEECH_VOICE,
  STORAGE_KEY_SPEECH_LOCALE,
  DEFAULT_SPEECH_RATE,
  MIN_SPEECH_RATE,
  MAX_SPEECH_RATE,
  DEFAULT_SPEECH_VOLUME,
  DEFAULT_SPEECH_LOCALE,
} from '../../utils/constants'

export type VoiceSettings = {
  rate: number
  volume: number
  voiceName: string
  locale: string
}

type Props = {
  settings: VoiceSettings
  onSettingsChange: (next: Partial<VoiceSettings>) => void
}

export function SettingsPanel({ settings, onSettingsChange }: Props): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [locales, setLocales] = useState<string[]>([DEFAULT_SPEECH_LOCALE])

  // Load API key from storage on mount
  useEffect(() => {
    void storageGet<string>(STORAGE_KEY_API_KEY).then((v) => {
      if (typeof v === 'string') setApiKey(v)
    })
  }, [])

  // Load voices — they may not be available immediately on first render
  const loadVoices = useCallback(() => {
    const available = getAvailableVoices()
    if (available.length > 0) {
      setVoices(available)
      setLocales(getAvailableLocales())
    }
  }, [])

  useEffect(() => {
    loadVoices()
    // Voices load asynchronously in Chrome — listen for the event
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
      return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
    }
    return undefined
  }, [loadVoices])

  const saveKey = async (): Promise<void> => {
    await storageSet(STORAGE_KEY_API_KEY, apiKey.trim())
    setSavedAt(Date.now())
  }

  const update = async (patch: Partial<VoiceSettings>): Promise<void> => {
    onSettingsChange(patch)
    if (patch.rate !== undefined) await storageSet(STORAGE_KEY_SPEECH_RATE, patch.rate)
    if (patch.volume !== undefined) await storageSet(STORAGE_KEY_SPEECH_VOLUME, patch.volume)
    if (patch.voiceName !== undefined) await storageSet(STORAGE_KEY_SPEECH_VOICE, patch.voiceName)
    if (patch.locale !== undefined) await storageSet(STORAGE_KEY_SPEECH_LOCALE, patch.locale)
  }

  // Filter voices by selected locale
  const filteredVoices = settings.locale
    ? voices.filter((v) => v.lang.startsWith(settings.locale.split('-')[0]))
    : voices

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
    <div className="space-y-4 rounded border border-slate-200 bg-white p-3">
      {/* Header */}
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

      {/* API Key */}
      <div>
        <label htmlFor="vora-api-key" className="mb-1 block text-xs font-medium text-slate-600">
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
          onClick={() => { void saveKey() }}
          className="mt-1 w-full rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800"
        >
          Save key
        </button>
        {savedAt != null && <p className="mt-1 text-xs text-emerald-600">Saved.</p>}
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100" />

      {/* Language / Locale */}
      <div>
        <label htmlFor="vora-locale" className="mb-1 block text-xs font-medium text-slate-600">
          Language
        </label>
        <select
          id="vora-locale"
          value={settings.locale}
          onChange={(e) => { void update({ locale: e.target.value, voiceName: '' }) }}
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
        >
          {locales.length === 0 && (
            <option value={DEFAULT_SPEECH_LOCALE}>{DEFAULT_SPEECH_LOCALE}</option>
          )}
          {locales.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {/* Voice selection */}
      <div>
        <label htmlFor="vora-voice" className="mb-1 block text-xs font-medium text-slate-600">
          Voice
        </label>
        <select
          id="vora-voice"
          value={settings.voiceName}
          onChange={(e) => { void update({ voiceName: e.target.value }) }}
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
        >
          <option value="">System default</option>
          {filteredVoices.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name}{v.localService ? '' : ' ☁'}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">☁ = online voice</p>
      </div>

      {/* Speech rate */}
      <div>
        <label htmlFor="vora-rate" className="mb-1 block text-xs font-medium text-slate-600">
          Speech rate: {settings.rate.toFixed(1)}x
        </label>
        <input
          id="vora-rate"
          type="range"
          min={MIN_SPEECH_RATE}
          max={MAX_SPEECH_RATE}
          step={0.1}
          value={settings.rate}
          onChange={(e) => { void update({ rate: parseFloat(e.target.value) }) }}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-400">
          <span>0.5x</span>
          <button
            type="button"
            onClick={() => { void update({ rate: DEFAULT_SPEECH_RATE }) }}
            className="text-slate-500 hover:text-slate-800"
          >
            Reset
          </button>
          <span>1.5x</span>
        </div>
      </div>

      {/* Volume */}
      <div>
        <label htmlFor="vora-volume" className="mb-1 block text-xs font-medium text-slate-600">
          Volume: {Math.round(settings.volume * 100)}%
        </label>
        <input
          id="vora-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => { void update({ volume: parseFloat(e.target.value) }) }}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-400">
          <span>0%</span>
          <button
            type="button"
            onClick={() => { void update({ volume: DEFAULT_SPEECH_VOLUME }) }}
            className="text-slate-500 hover:text-slate-800"
          >
            Reset
          </button>
          <span>100%</span>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Stored locally. Voice data is never persisted beyond a single command.
      </p>
    </div>
  )
}
