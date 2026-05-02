# Vora Architecture

## Extension Contexts

Chrome extensions run in isolated contexts that communicate via message passing.

```
┌─────────────────────────────────────────────────────────┐
│  Popup (React)                                          │
│  - Status display, command history, settings            │
│  - Sends: WAKE_WORD_DETECTED, CONFIRMATION_RESPONSE     │
│  - Receives: STATE_CHANGE                               │
└────────────────────┬────────────────────────────────────┘
                     │ chrome.runtime.sendMessage
┌────────────────────▼────────────────────────────────────┐
│  Service Worker (background)                            │
│  - Owns extension state machine                         │
│  - Orchestrates the full command pipeline               │
│  - Calls: AI pipeline, voice, content script            │
└──────┬──────────────────────────────────┬───────────────┘
       │ chrome.tabs.sendMessage           │ fetch
┌──────▼──────────────┐         ┌─────────▼──────────────┐
│  Content Script     │         │  Anthropic Claude API  │
│  - domReader.ts     │         │  claude-sonnet-4-6     │
│  - actionExecutor.ts│         └────────────────────────┘
│  - overlay.ts       │
└─────────────────────┘
```

## Command Pipeline

```
Wake word → LISTENING → Voice capture → DOM extraction
→ Prompt build → Claude API → Action parse
→ (Confirmation if destructive) → Execute → TTS readback → LISTENING
```

See `.kiro/steering/voice-ai-flow.md` for the full step-by-step spec.

## Key Design Decisions

- **No React in content scripts** — Shadow DOM overlay is vanilla TS to avoid style conflicts
- **Service worker owns state** — single source of truth, popup is display-only
- **API key in chrome.storage.local** — never in source, user-provided on first run
- **Native fetch only** — no HTTP client libraries to keep bundle lean
- **Type guards over Zod** — keeps bundle size down for extension context
