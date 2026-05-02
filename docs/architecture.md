# Vora Architecture

## Extension Contexts

Chrome extensions run in isolated contexts that communicate via `chrome.runtime` and `chrome.tabs` message passing.

```
┌─────────────────────────────────────────────────────────┐
│  Side Panel (React)                                     │
│  - chrome.sidePanel API, default_path = popup index.html│
│  - Owns voice I/O (Web Speech API recognition + TTS)    │
│  - Owns the runtime state machine and activation toggle │
│  - Renders status, activation, command history, settings│
│  - Sends: VOICE_COMMAND_RECEIVED, ACTION_EXECUTE,       │
│          STATE_CHANGE, TRANSCRIPT_UPDATE, HISTORY_ENTRY │
└────────────────────┬────────────────────────────────────┘
                     │ chrome.runtime.sendMessage
┌────────────────────▼────────────────────────────────────┐
│  Service Worker (background)                            │
│  - Stateless proxy for the AI pipeline                  │
│  - Reads API key from chrome.storage.local              │
│  - Requests DOM context from the active tab             │
│  - Falls back to chrome.scripting.executeScript when    │
│    the content script is not yet present on the tab     │
│  - Calls claudeClient.callClaude → actionParser         │
└──────┬──────────────────────────────────┬───────────────┘
       │ chrome.tabs.sendMessage           │ fetch (host_permissions)
┌──────▼──────────────┐         ┌─────────▼──────────────┐
│  Content Script     │         │  Anthropic Claude API  │
│  - domReader.ts     │         │  claude-sonnet-4-6     │
│  - actionExecutor.ts│         └────────────────────────┘
│  - overlay.ts       │  In-page side panel showing live
│                     │  transcript + recent commands.
│                     │  Shifts body margin-right by 340px
│                     │  while a session is active.
└─────────────────────┘
```

## Command Pipeline

```
User clicks mic in side panel
   ↓
Recognition starts (continuous=false, interimResults=true)
   ↓
Partial transcripts → broadcast TRANSCRIPT_UPDATE to active tab → in-page panel shows live words
   ↓
Final transcript → if confidence < 0.7, TTS rephrase prompt, restart listening
   ↓
Side panel sends VOICE_COMMAND_RECEIVED to service worker
   ↓
Service worker requests DOM context from active tab content script
   (auto-injects content script via chrome.scripting if needed)
   ↓
Service worker calls Claude (10s soft timeout, 15s hard)
   ↓
actionParser → ParsedIntent { action, readbackText, confirmationText? }
   ↓
If destructive (SUBMIT_FORM or click on destructive label):
   side panel TTS reads confirmationText
   recognition listens for yes/no, 5s timeout cancels
   ↓
Side panel sends ACTION_EXECUTE to active tab content script
   ↓
Content script executes on live DOM, returns ActionResult
   ↓
Side panel TTS reads back result, restarts listening
```

## Why the State Machine Lives in the Side Panel, Not the Service Worker

The original design (see `voice-ai-flow.md`) places the state machine in the service worker. That is not implementable in MV3:

- Service workers have no `window`, so they cannot host `SpeechRecognition` or `SpeechSynthesisUtterance`.
- Service workers terminate when idle, so a long-running listening session would die between steps.
- Side panels and popups have a window context, run the same React bundle, and survive across tab switches.

The service worker is therefore a stateless RPC layer that handles the AI pipeline — DOM read, prompt build, Claude call, parse — and returns a single `ParsedIntent` per request. The side panel orchestrates the surrounding state machine.

## Key Design Decisions

- **Side Panel API instead of popup** — The MV3 `chrome.sidePanel` API gives a persistent UI on the right edge of the browser that does not close when the user clicks the page. Activation: `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` registered from the service worker on install.
- **Content script auto-inject fallback** — When the service worker tries to read DOM from a tab whose content script is not yet present (extension reloaded after the tab was opened), it calls `chrome.scripting.executeScript` using the bundled file path resolved at runtime via `chrome.runtime.getManifest()`.
- **No React in content scripts** — Shadow DOM in-page panel is vanilla TS to avoid style leakage with the host page.
- **API key in chrome.storage.local** — never in source, never in `.env`, never baked into the build. The user enters it once via the Settings panel; it lives in their Chrome profile only.
- **Native fetch only** — no HTTP client libraries to keep the bundle lean.
- **Type guards over Zod** — keeps bundle size down for the extension context.
- **`anthropic-dangerous-direct-browser-access: true` header** — lets the extension call the Claude API directly without a server. Combined with `host_permissions: ["https://api.anthropic.com/*"]` in the manifest, this gives the service worker direct fetch access.
