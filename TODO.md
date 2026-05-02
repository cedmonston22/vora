# Vora — Team Task Breakdown

Deadline: 11:59pm PDT tonight. Each scope is a separate lane — no file overlaps.

---

## 🔴 BLOCKER — Do First (one person, ~30 min)

**Project Setup** — `package.json`, `vite.config.ts`, `tsconfig.json`, `manifest.json`, `tailwind.config.ts`
- Init Vite + CRXJS plugin
- Configure TypeScript strict mode
- Set up Tailwind for popup only
- Create all empty directories from structure.md
- Create `src/types/actions.ts`, `src/types/commands.ts`, `src/types/dom.ts` with all shared types
- Create `src/utils/constants.ts` (model name, timeouts, message types, action types enum)

Everyone is blocked until types and constants exist.

---

## Scope A — AI Pipeline (`src/ai/` + `src/content/domReader.ts`)

Files: `claudeClient.ts`, `promptBuilder.ts`, `actionParser.ts`, `domReader.ts`

- [ ] `domReader.ts` — walk the live DOM, extract interactive elements (buttons, links, inputs, headings), return typed `PageContext`. Sanitize: strip script tags, event handlers, input values.
- [ ] `promptBuilder.ts` — combine system prompt + PageContext + raw transcript into Claude API request body
- [ ] `claudeClient.ts` — call Anthropic Claude API via fetch, 10s timeout hard fail at 15s, return raw response or throw typed `AIError`
- [ ] `actionParser.ts` — validate Claude's JSON response into typed `BrowserAction`, throw on unparseable

---

## Scope B — Voice + State Machine (`src/voice/` + `src/background/`)

Files: `speechRecognition.ts`, `speechSynthesis.ts`, `service-worker.ts`

- [ ] `speechRecognition.ts` — wrap Web Speech API, expose start/stop, emit transcript on `isFinal`, reject if confidence < 0.7
- [ ] `speechSynthesis.ts` — wrap Web Speech Synthesis, expose `speak(text)` that returns a Promise resolving when TTS completes (no overlap with recognition)
- [ ] `service-worker.ts` — manage extension lifecycle, wake word detection, Chrome message passing hub, hold global state (IDLE / LISTENING / THINKING / CONFIRMING / EXECUTING)

---

## Scope C — Action Execution (`src/content/`)

Files: `actionExecutor.ts`, `overlay.ts`, `index.ts`

- [ ] `actionExecutor.ts` — receive typed `BrowserAction`, execute on live DOM (click, fill, scroll, navigate), each wrapped in try/catch, return success/failure
- [ ] `overlay.ts` — inject Shadow DOM overlay into host page, display state label (Listening / Thinking / Executing / Done), no React, no style leakage
- [ ] `index.ts` — content script entry, wire up message listener from service worker, call domReader + actionExecutor, send results back

---

## Scope D — Popup UI (`src/popup/`)

Files: `App.tsx`, `components/`, `hooks/`, `popup.css`, `index.html`, `index.tsx`

- [ ] `useVoiceState.ts` — React hook, mirrors service worker state via Chrome message listener
- [ ] `useCommandHistory.ts` — React hook, tracks last N commands + outcomes in local state
- [ ] `StatusIndicator.tsx` — displays current state with visual feedback (idle/listening/thinking/done)
- [ ] `ActivationButton.tsx` — mic toggle, sends activate/deactivate message to service worker
- [ ] `CommandHistory.tsx` — scrollable list of recent commands and their outcomes
- [ ] `SettingsPanel.tsx` — API key input (saved to `chrome.storage.local`), voice speed preference
- [ ] `App.tsx` — root layout, wire all components together

---

## Integration (everyone together, last ~1 hour)

- [x] Wire Scope B (service worker) → Scope A (AI pipeline) → Scope C (executor) end-to-end
- [x] Wire Scope D (side panel) state display to runtime state
- [x] Load unpacked extension in Chrome
- [x] Side panel API for persistent UI on right edge of browser
- [x] Auto-inject content script when not present on tab
- [x] In-page side panel showing live transcript
- [ ] Run demo script from `docs/demo-script.md` end-to-end without errors
- [ ] Record 3-min demo video

## Known MVP Gaps (deferred from spec)

- Wake word "Hey Vora" is not implemented. Activation is a click on the mic in the side panel. The voice-ai-flow steering doc has been updated to reflect this and notes wake word as future work.
- The runtime state machine lives in the side panel React app, not in the service worker, because Web Speech APIs require a window context.
- The in-page side panel shifts host body margin-right by 340px. Sites with fixed-position elements on the right or `body { overflow: hidden }` may not visually shift.

---

## Notes

- API key is stored in `chrome.storage.local` — never in source. Settings panel handles first-run setup.
- All Claude calls go through `claudeClient.ts` only — Scope A owns this, no one else calls the API directly.
- Scope C (content scripts) is vanilla TS only — no React imports.
- Types in `src/types/` are shared — if you need to add a type, add it there and tell the team.
