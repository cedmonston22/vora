# Tech Stack

## Stack Overview

| Layer | Technology | Notes |
|---|---|---|
| Extension Framework | Chrome Extension Manifest V3 | Service workers, content scripts, side panel |
| UI Surface | Chrome Side Panel API | Persistent panel pinned to right edge of browser |
| Side Panel UI | React 18 + TypeScript | Same React bundle, runs in `chrome.sidePanel` context |
| Styling | Tailwind CSS | Side panel UI only, not injected into host pages |
| In-page overlay | Vanilla TS + Shadow DOM | Live transcript panel injected into host page during a session |
| Voice Input | Web Speech API | Built into Chrome, runs in side panel window context |
| Voice Output | Web Speech Synthesis API | Built into Chrome, TTS readback |
| AI / Intent | Anthropic Claude API (claude-sonnet-4-6) | Natural language to browser action |
| AI access | `anthropic-dangerous-direct-browser-access: true` | Direct browser fetch with `host_permissions` declared |
| Build Tool | Vite + CRXJS | Bundles extension with HMR support |
| Type Checking | TypeScript 5 strict mode | Across all contexts |
| Testing | Vitest with jsdom | Unit and integration tests |
| Deployment | Local unpacked | Loaded via `chrome://extensions` for demo |

## Package Preferences

- HTTP client: Native `fetch` only — no axios, no wrappers
- Form handling: Not applicable — no forms in popup, plain React state
- State management: React `useState` and `useReducer` in popup — no Zustand, no Redux
- Testing: Vitest with jsdom for unit tests, no Jest
- Bundler: Vite with `@crxjs/vite-plugin` for Chrome extension support
- Type validation: Manual type guards in `actionParser.ts` — no Zod to keep bundle lean
- Icons: Lucide React in popup only
- CSS: Tailwind utility classes in popup, raw CSS variables in Shadow DOM overlay

## Chrome Message Passing Conventions

- All messages typed as discriminated unions in `types/commands.ts`
- Every `sendMessage` call must handle the response and check `chrome.runtime.lastError`
- Message structure: `{ type: MESSAGE_TYPE, payload: TypedPayload }`
- Content scripts only receive messages — they never initiate to popup
- Service worker is the single source of truth for extension state
- No message should trigger a destructive action without a confirmation payload

## Environment Variables

- Claude API key stored in `chrome.storage.local` — never hardcoded, never in source
- Users input their API key via the Settings panel in the popup on first use
- Build-time constants (version, model name) defined in `utils/constants.ts`
- No `.env` file — Chrome extensions have no server-side environment

## Voice Settings Storage Keys

All voice settings are persisted to `chrome.storage.local` and loaded on side panel mount:

| Key | Type | Default | Description |
|---|---|---|---|
| `vora_speech_rate` | `number` | `1.0` | TTS playback rate (0.5–1.5) |
| `vora_speech_volume` | `number` | `1.0` | TTS volume (0.0–1.0) |
| `vora_speech_voice` | `string` | `''` | `SpeechSynthesisVoice.name`, empty = system default |
| `vora_speech_locale` | `string` | `'en-US'` | BCP-47 locale tag, filters voice list |

## Error Handling Philosophy

- Every error has a category: `VoiceError`, `AIError`, `ExecutionError`, `NetworkError`
- Errors never surface as raw technical messages to the user — always translated to plain English via TTS
- Silent failures are not allowed — if something goes wrong, Vora always tells the user out loud
- Claude API failures fall back to a canned TTS response, never a blank state
- DOM action failures are caught individually — one failed action does not crash the session
- All errors logged to console in development, stripped in demo build

## speak() API

`speak(text, rateOrOptions)` in `src/voice/speechSynthesis.ts` accepts either a plain `number` (rate, backward-compatible) or a `SpeakOptions` object:

```ts
type SpeakOptions = {
  rate?: number     // 0.5–1.5, default 1.0
  volume?: number   // 0.0–1.0, default 1.0
  voiceName?: string // SpeechSynthesisVoice.name, undefined = system default
  locale?: string   // BCP-47 tag e.g. 'en-US', 'fr-FR'
}
```

All call sites in `App.tsx` pass the full `VoiceSettings` object. The plain-number overload is kept for backward compatibility in tests.