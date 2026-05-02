# Vora Demo Script

## Setup

1. Run `npm run build` to produce a fresh `dist/` folder.
2. In Chrome, open `chrome://extensions` → toggle **Developer mode** ON → click **Load unpacked** → select the `dist/` directory.
3. Click the Vora icon in the toolbar — the **side panel** opens on the right edge of the browser. It stays pinned across tab switches.
4. In the side panel, click **Settings** at the bottom → paste your Anthropic API key → **Save key**.
5. Open `chrome://settings/content/microphone` and confirm the `chrome-extension://…` entry for Vora is set to **Allow**.

## Demo Flow (~2 min)

### 1. Activation and live transcription

- Navigate to `wikipedia.org` (or any article on Wikipedia).
- Click the **mic button** in Vora's side panel.
- Allow microphone access if Chrome prompts.
- Speak a simple phrase — words appear live in the in-page transcript panel as you speak.

### 2. Read content aloud

- On a Wikipedia article page, say:
  > "Read me the first paragraph"
- Expected: TTS reads the opening paragraph back. The status pill shows Listening → Thinking → Acting → Listening.

### 3. Page navigation

- On the Wikipedia search results page (or any page with a search input), say:
  > "Search for hackathon 2026"
- Expected: Vora fills the search input and submits the form.

### 4. Destructive-action confirmation

- Open Gmail and select an email.
- Say:
  > "Delete this email"
- Expected: Vora speaks aloud — *"I am about to click Delete. Say yes to confirm or no to cancel."*
- Reply: **"Yes"** to delete, **"No"** to cancel. Stays in confirming state for up to 5 seconds.

### 5. Error handling

- Say something ambiguous:
  > "Do the thing"
- Expected: Vora replies via TTS that it did not understand, and remains in listening state.

## What to Highlight to Judges

- Activation is voice-only after the first click — no keyboard input required during the session.
- Voice confirmation gates every destructive action.
- Sensitive fields (password, PIN, SSN, credit card) are excluded from the page context sent to Claude and refused at the executor.
- TTS uses plain English — never reads selectors, codes, or technical strings.
- The side panel and the in-page transcript panel both display the live state, so judges can see what Vora is doing in real time.

## Known MVP Gaps to Mention Up Front

- **Wake word ("Hey Vora") is not implemented in this MVP.** Activation is a single click on the mic in the side panel. Wake word is future work.
- **Service worker does not own the global state machine** as described in `voice-ai-flow.md`. The state machine lives in the side panel React app because Web Speech APIs require a window context. The service worker is a stateless Claude+context proxy.
- The in-page side panel shifts host page content using `body { margin-right }` — sites with fixed-position elements on the right edge or `body { overflow: hidden }` may not visually shift. Demo on Wikipedia, Hacker News, or simple article pages.
