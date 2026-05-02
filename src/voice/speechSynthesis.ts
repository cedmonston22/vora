import {
  DEFAULT_SPEECH_RATE,
  MIN_SPEECH_RATE,
  MAX_SPEECH_RATE,
  DEFAULT_SPEECH_VOLUME,
  MIN_SPEECH_VOLUME,
  MAX_SPEECH_VOLUME,
} from '../utils/constants'

export type SpeakOptions = {
  rate?: number
  volume?: number
  voiceName?: string
  locale?: string
}

export function speak(text: string, rateOrOptions: number | SpeakOptions = DEFAULT_SPEECH_RATE): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve()
      return
    }
    if (!text || !text.trim()) {
      resolve()
      return
    }

    const opts: SpeakOptions =
      typeof rateOrOptions === 'number' ? { rate: rateOrOptions } : rateOrOptions

    const rate = Math.max(MIN_SPEECH_RATE, Math.min(MAX_SPEECH_RATE, opts.rate ?? DEFAULT_SPEECH_RATE))
    const volume = Math.max(MIN_SPEECH_VOLUME, Math.min(MAX_SPEECH_VOLUME, opts.volume ?? DEFAULT_SPEECH_VOLUME))
    const locale = opts.locale ?? 'en-US'

    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = rate
    utt.volume = volume
    utt.pitch = 1.0
    utt.lang = locale

    // Apply selected voice if specified
    if (opts.voiceName) {
      const voices = window.speechSynthesis.getVoices()
      const match = voices.find((v) => v.name === opts.voiceName)
      if (match) utt.voice = match
    }

    utt.onend = () => resolve()
    utt.onerror = () => resolve()
    window.speechSynthesis.speak(utt)
  })
}

export function cancelSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

/** Returns all available voices for the given locale (or all voices if no locale given) */
export function getAvailableVoices(locale?: string): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return []
  const voices = window.speechSynthesis.getVoices()
  if (!locale) return voices
  return voices.filter((v) => v.lang.startsWith(locale.split('-')[0]))
}

/** Returns a deduplicated list of available BCP-47 locale codes */
export function getAvailableLocales(): string[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return ['en-US']
  const voices = window.speechSynthesis.getVoices()
  const seen = new Set<string>()
  for (const v of voices) {
    seen.add(v.lang)
  }
  return Array.from(seen).sort()
}
