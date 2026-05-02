import {
  DEFAULT_SPEECH_RATE,
  MIN_SPEECH_RATE,
  MAX_SPEECH_RATE,
} from '../utils/constants'

export function speak(text: string, rate: number = DEFAULT_SPEECH_RATE): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve()
      return
    }
    if (!text || !text.trim()) {
      resolve()
      return
    }
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    const clamped = Math.max(MIN_SPEECH_RATE, Math.min(MAX_SPEECH_RATE, rate))
    utt.rate = clamped
    utt.pitch = 1.0
    utt.lang = 'en-US'
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
