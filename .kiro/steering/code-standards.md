# Code Standards

## Language & Runtime

- TypeScript strict mode enabled across all files
- No `any` types — use `unknown` and narrow explicitly
- ES2022+ features allowed, targeting Chrome 120+
- No CommonJS — ESM imports only throughout

## Formatting

- 2 space indentation
- Single quotes for strings
- Semicolons required
- Max line length 100 characters
- Trailing commas in multi-line objects and arrays

## TypeScript Rules

- All function parameters and return types must be explicitly typed
- No implicit `any` from untyped third-party imports — declare module types in `types/`
- Use `type` for object shapes, `interface` for extensible contracts
- Prefer `const` over `let`, never `var`
- Enums for fixed sets of values (`ActionType`, `VoraState`)
- Zod or manual type guards for all data crossing API boundaries (Claude response, Chrome messages)

## Chrome Extension Specific

- Manifest V3 only — no background pages, service workers only
- All cross-context communication via `chrome.runtime.sendMessage` typed with discriminated unions
- Never use `eval()` or dynamic code execution — violates extension CSP
- Content scripts must never block the main thread — async only
- All DOM mutations in content scripts must be wrapped in try/catch
- Never access `chrome.storage` directly from content scripts — route through service worker

## AI Layer Rules

- All Claude API calls must include a structured system prompt from `promptBuilder.ts`
- Claude responses must always be parsed through `actionParser.ts` before use — never trust raw output
- Every Claude call must have a timeout — default 10 seconds, hard fail after 15
- If Claude returns an ambiguous or unparseable response, fall back to TTS error message — never guess
- Page context sent to Claude must be sanitized — strip script tags, inline event handlers, sensitive input values

## Voice Layer Rules

- Web Speech API recognition must always be explicitly stopped before starting a new session
- TTS confirmation must complete before listening resumes — no overlapping audio
- All voice errors must surface to the user via TTS, never fail silently
- Recognition confidence threshold minimum 0.7 — below that, ask user to repeat

## Error Handling

- All async functions must have explicit try/catch blocks
- Errors must be categorized: `VoiceError`, `AIError`, `ExecutionError`, `NetworkError`
- User-facing errors delivered via TTS in plain English — no technical jargon exposed to user
- Console errors in development only — strip all `console.log` before demo build
- Chrome runtime errors must be checked after every `sendMessage` call

## State Management

- No global mutable state in content scripts
- Popup state managed via React hooks only — no external state library
- Extension state persisted via `chrome.storage.local` for settings, `chrome.storage.session` for active command state
- State shape must match types defined in `types/` — no inline ad-hoc objects

## Imports

- Absolute imports from `src/` root using path aliases configured in `tsconfig.json`
- No circular imports between `ai/`, `voice/`, and `content/` modules
- Third-party imports at top, internal imports below, separated by blank line