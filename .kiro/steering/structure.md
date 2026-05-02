# Project Structure

## Directory Map

```
vora/
├── manifest.json              <!-- Chrome Extension manifest v3 -->
├── public/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background/
│   │   └── service-worker.ts  <!-- Handles extension lifecycle, tab management -->
│   ├── content/
│   │   ├── index.ts           <!-- Injected into every page, executes actions -->
│   │   ├── domReader.ts       <!-- Extracts page structure for Claude context -->
│   │   ├── actionExecutor.ts  <!-- Clicks, fills, scrolls, navigates -->
│   │   └── overlay.ts         <!-- Shadow DOM visual feedback, no React -->
│   ├── popup/
│   │   ├── index.html         <!-- React root mount point -->
│   │   ├── index.tsx          <!-- React entry point -->
│   │   ├── App.tsx            <!-- Root component -->
│   │   ├── components/
│   │   │   ├── ActivationButton.tsx   <!-- Main mic on/off toggle -->
│   │   │   ├── StatusIndicator.tsx    <!-- Listening / thinking / done states -->
│   │   │   ├── CommandHistory.tsx     <!-- Last N commands and outcomes -->
│   │   │   └── SettingsPanel.tsx      <!-- API key, voice speed, preferences -->
│   │   ├── hooks/
│   │   │   ├── useVoiceState.ts       <!-- Manages listening state -->
│   │   │   └── useCommandHistory.ts   <!-- Tracks recent commands -->
│   │   └── popup.css
│   ├── voice/
│   │   ├── speechRecognition.ts  <!-- Web Speech API capture -->
│   │   └── speechSynthesis.ts    <!-- TTS readback -->
│   ├── ai/
│   │   ├── claudeClient.ts    <!-- Anthropic Claude API calls -->
│   │   ├── promptBuilder.ts   <!-- Builds context-aware prompts -->
│   │   └── actionParser.ts    <!-- Parses Claude response into actions -->
│   ├── types/
│   │   ├── actions.ts         <!-- BrowserAction, ActionType enums -->
│   │   ├── commands.ts        <!-- VoiceCommand, ParsedIntent types -->
│   │   └── dom.ts             <!-- PageContext, DOMElement types -->
│   └── utils/
│       ├── constants.ts
│       └── helpers.ts
├── __tests__/
│   ├── unit/
│   │   ├── domReader.test.ts
│   │   ├── actionParser.test.ts
│   │   └── promptBuilder.test.ts
│   └── integration/
│       └── commandFlow.test.ts
├── docs/
│   ├── architecture.md
│   └── demo-script.md
├── .kiro/
│   └── steering/
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Naming Conventions

- Files: `camelCase.ts` for logic, `PascalCase.tsx` for React components
- Components: PascalCase (`ActivationButton`, `StatusIndicator`)
- Hooks: camelCase prefixed with `use` (`useVoiceState`, `useCommandHistory`)
- Types/interfaces: PascalCase prefixed with descriptive noun (`BrowserAction`, `PageContext`, `VoiceCommand`)
- Action types: SCREAMING_SNAKE_CASE enum values (`CLICK_ELEMENT`, `FILL_FORM`, `SCROLL_DOWN`)
- Chrome message types: SCREAMING_SNAKE_CASE strings (`VOICE_COMMAND_RECEIVED`, `ACTION_EXECUTE`)

## Component Rules

- React is used **only in the popup** — all other extension contexts use vanilla TypeScript
- Content scripts must be vanilla TS only — no React injected into host pages
- Overlay UI uses Shadow DOM injected via content script to avoid style conflicts
- One component per file, co-located with its styles if component-specific CSS is needed
- All Claude API calls go through `claudeClient.ts` only — never call the API directly elsewhere
- Background service worker handles all cross-tab communication via Chrome message passing
- Popup components are client-side only — no server components, no SSR

## Test File Location

- Unit tests: `__tests__/unit/[mirrors-src-path].test.ts`
- Integration tests: `__tests__/integration/`
- Demo script: `docs/demo-script.md` — maintained as a living document updated as features ship