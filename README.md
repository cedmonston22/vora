# Vora

Voice control for any website. Built for people who cannot use a mouse or keyboard.

Vora is a Chrome extension that lets you control any webpage through natural language voice commands. Speak naturally — "search for climate change", "open discord", "scroll down" — and Vora reads the page, interprets your intent via Claude AI, and executes the action automatically.

## Demo

1. Install the extension (see Setup below)
2. Click the Vora icon to open the side panel
3. Enter your Anthropic API key in Settings
4. Click the mic button and speak a command

See [`docs/demo-script.md`](docs/demo-script.md) for the full demo flow.

## Setup

**Requirements:** Chrome 120+, Anthropic API key

```bash
npm install
npm run build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `dist/` folder
4. Click the Vora icon → Settings → paste your API key → Save

## Commands

Vora understands natural language. Examples:

| You say | What happens |
|---|---|
| "search for climate change" | Fills the search box and presses Enter |
| "open discord" | Navigates to discord.com |
| "scroll down" | Scrolls the page |
| "click the Sign In button" | Clicks that button |
| "read me the first paragraph" | TTS reads the content aloud |
| "select United States from the dropdown" | Picks the option |
| "delete this" | Asks for voice confirmation first |

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the full technical breakdown.

**Short version:**
- **Side panel (React)** — owns the state machine, voice I/O, and UI
- **Service worker** — stateless AI pipeline proxy (DOM read → Claude → parse)
- **Content script** — executes actions on the live page, shows status pill overlay
- **Claude API** — converts transcript + page context into a typed browser action

## Development

```bash
npm run dev        # Vite dev build with HMR
npm run build      # Production build → dist/
npm run typecheck  # TypeScript strict check
npm test           # Vitest unit + integration tests
```

## Project Structure

```
src/
├── ai/           # Claude client, prompt builder, action parser
├── background/   # Service worker (AI pipeline RPC)
├── content/      # Content script: DOM reader, action executor, overlay
├── popup/        # React side panel UI
├── types/        # Shared TypeScript types
├── utils/        # Constants, helpers
└── voice/        # Web Speech API wrappers
```

## Privacy

- Voice recordings are never stored or transmitted beyond a single command
- Page content is sent only to the Anthropic Claude API for the current command
- Password, PIN, SSN, and payment fields are never read or filled
- API key lives in your Chrome profile only — never in source or build output

## Kiro Usage

See [`KIRO_WRITEUP.md`](KIRO_WRITEUP.md) for how Kiro was used to build this project.
