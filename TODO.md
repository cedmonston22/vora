# Vora — Status

## ✅ Done

- Project scaffold: Vite + CRXJS, TypeScript strict, Tailwind, Vitest
- Manifest V3 with side panel, content scripts, service worker
- Shared types: `BrowserAction`, `PageContext`, `ExtensionMessage`, `ExtensionState`
- **Scope A (AI pipeline):** `domReader`, `claudeClient`, `promptBuilder`, `actionParser`
  - Actions: CLICK, FILL, CLEAR, SELECT_OPTION, PRESS_KEY, SCROLL, NAVIGATE, SUBMIT, READ, FOCUS
  - Prompt rewritten with plain schema, rules, one-shot example
  - "Open [site]" constructs URL for well-known services
- **Scope B (Voice + service worker):** `speechRecognition`, `speechSynthesis`, `service-worker`
  - State machine: IDLE → LISTENING → THINKING → CONFIRMING → EXECUTING
  - Content script injection with polling fallback
  - Restricted page detection (chrome://, about:)
- **Scope C (Content script):** `actionExecutor`, `overlay`, `index`
  - All action types implemented including SELECT_OPTION, PRESS_KEY, CLEAR_INPUT
  - Overlay replaced with small status pill (bottom-right, no body shift)
- **Scope D (Popup UI):** Full React app with activation, status, history, settings
- 33 tests passing (actionParser, promptBuilder, domReader, integration)
- `web_accessible_resources: assets/*` — fixes content script injection on existing tabs

## 🔧 Known Issues / Nice-to-haves

- Chrome TTS silently stops after ~15s inactivity (speechSynthesis keepalive not yet added)
- Confidence threshold lowered to 0.4 — Chrome returns unreliable scores
- Wake word "Hey Vora" not implemented (MVP: click to activate)

## 📋 Before Submission (11:59pm tonight)

- [ ] Record 3-minute demo video → upload to YouTube
- [ ] Submit on Devpost with repo URL, video, track, Kiro Powers writeup
- [ ] Confirm `.kiro/` directory is NOT in `.gitignore`
- [ ] Confirm repo is public with a LICENSE file
