---
fileMatch: ["**/*"]
---

# Agent Steering

## Purpose

This document defines how Kiro agents should behave when generating, modifying, or reviewing code in the Vora project. These rules apply to all autonomous agent actions — vibe coding, spec execution, and hook-triggered tasks.

---

## Hard Safety Rules (Never Violate)

- Never generate code that stores, logs, caches, or transmits voice recordings or page DOM content beyond a single command execution
- Never generate code that executes a destructive action (delete, submit form, send message, make payment) without first reading back the intended action via TTS and waiting for explicit voice confirmation
- Never call the Claude API directly — all AI calls must go through `src/ai/claudeClient.ts` only
- Never inject React or any framework into content scripts — content scripts and `overlay.ts` must be vanilla TypeScript only
- Never introduce `any` types, `@ts-ignore`, or disabled lint rules

---

## Agent Responsibilities by Area

### Voice Pipeline (`src/voice/`)
- Handles only capture and synthesis — no intent parsing, no action logic
- `speechRecognition.ts` captures raw text and passes it upstream — it must not interpret or filter commands
- `speechSynthesis.ts` handles readback only — it must not trigger any browser actions

### AI Layer (`src/ai/`)
- `claudeClient.ts` is the sole entry point for all Claude API calls — agents must never create additional API clients
- `promptBuilder.ts` builds context-aware prompts — when modifying, always include page context and user intent, never include raw voice audio data
- `actionParser.ts` converts Claude responses into typed `BrowserAction` objects — output must always conform to `src/types/actions.ts`, never use freeform strings

### Action Execution (`src/content/actionExecutor.ts`)
- Before executing any action, validate it against the `BrowserAction` type
- Destructive actions (`SUBMIT_FORM`, `DELETE_ELEMENT`, `SEND_MESSAGE`) require a confirmation step — never remove or bypass this flow
- If an action cannot be validated or matched to a DOM element, surface an error via TTS — never guess or silently fail

### DOM Reading (`src/content/domReader.ts`)
- Extract only interactive elements needed for the current command — do not snapshot or persist full page state
- Sanitize all extracted text before including it in prompts — strip scripts, event handlers, and sensitive input values (passwords, credit card fields)

### Popup UI (`src/popup/`)
- React is allowed here only — never port popup patterns to content scripts
- Components must remain single-responsibility — `ActivationButton` handles activation only, `StatusIndicator` displays state only
- Hooks in `src/popup/hooks/` manage state only — no direct Chrome API calls from hooks, route those through the background service worker

### Background Service Worker (`src/background/service-worker.ts`)
- Single source of truth for cross-tab communication via Chrome message passing
- All Chrome API calls from other contexts must go through messages to this worker, not direct API calls

---

## What Agents Should Do When Uncertain

- If a command is ambiguous, generate code that surfaces the ambiguity to the user via TTS — never silently pick an interpretation
- If a generated action could be destructive, always add a confirmation step even if not explicitly asked
- If a file location is unclear, follow `structure.md` — when in doubt, ask rather than guess
- If a type is unclear, define it in `src/types/` before using it elsewhere

---

## Scope Limits

- Do not introduce new dependencies without updating `tech.md` and `package.json`
- Do not create new Chrome extension permissions in `manifest.json` without a clear justification comment
- Do not add server-side rendering, SSR patterns, or server components — the popup is client-side only
- Do not modify steering documents autonomously — these require human review

---

## Privacy Constraints (Enforced in All Generated Code)

- No voice data persisted beyond the active command cycle
- No page content stored in extension storage, local storage, or sent to any service other than the Claude API for the current command
- Sensitive DOM fields (password inputs, payment fields) must be masked or excluded from page context sent to Claude
- Error messages must never include raw user input or page content
