# Tech Stack

## Stack Overview

| Layer | Technology | Notes |
|---|---|---|
| Extension Framework | Chrome Extension Manifest V3 | Service workers, content scripts, popup |
| Popup UI | React 18 + TypeScript | Only used in popup context |
| Styling | Tailwind CSS | Popup UI only, not injected into host pages |
| Voice Input | Web Speech API | Built into Chrome, no external dependency |
| Voice Output | Web Speech Synthesis API | Built into Chrome, TTS readback |
| AI / Intent | Anthropic Claude API (claude-sonnet-4-6) | Natural language to browser action |
| Build Tool | Vite + CRXJS | Bundles extension with HMR support |
| Type Checking | TypeScript 5 strict mode | Across all contexts |
| Testing | Vitest | Unit and integration tests |
| Deployment | Chrome Web Store / Local unpacked | Demo via unpacked load |

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

## Error Handling Philosophy

- Every error has a category: `VoiceError`, `AIError`, `ExecutionError`, `NetworkError`
- Errors never surface as raw technical messages to the user — always translated to plain English via TTS
- Silent failures are not allowed — if something goes wrong, Vora always tells the user out loud
- Claude API failures fall back to a canned TTS response, never a blank state
- DOM action failures are caught individually — one failed action does not crash the session
- All errors logged to console in development, stripped in demo build