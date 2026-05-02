# Kiro Powers — How We Used Kiro to Build Vora

## Project Overview

Vora is a Chrome extension that lets people with motor disabilities control any website entirely through natural language voice commands. Users speak naturally — "go to my Gmail and read my newest email" — and Vora reads the page DOM, interprets the intent, and executes the action automatically. No mouse, no keyboard.

---

## Vibe Coding

Vora's core challenge was bridging three complex systems: the Web Speech API, live DOM parsing, and structured browser action execution. We used Kiro's vibe coding to move fast across all three without losing coherence.

The most impressive generation was the DOM context builder — we described the problem in plain language ("read the current page and extract all interactive elements with their labels, positions, and roles into a structured object that can be sent to an LLM") and Kiro produced a complete, working implementation that handled edge cases like unlabeled buttons, dynamic content, and shadow DOM elements. Writing that by hand would have taken hours of trial and error.

We also used vibe coding to rapidly prototype the voice confirmation flow for destructive actions. We described the UX constraint ("never execute a destructive action without reading back what it's about to do and waiting for voice confirmation") and Kiro scaffolded the entire state machine — listening, confirming, executing, canceling — in one pass.

---

## Steering Docs

Steering was critical for a project with hard safety constraints. We created four steering documents:

- **product.md** — defined Vora's hard constraints upfront, including "never execute destructive actions without voice confirmation" and "never store voice recordings beyond a single command." This meant every piece of code Kiro generated was already aware of these non-negotiables without us having to repeat them in every prompt.
- **code-standards.md** — enforced TypeScript strict mode, no `any` types, and structured error handling. Since Vora runs as a Chrome extension with access to live pages, type safety and predictable error behavior were non-negotiable.
- **structure.md** — kept Kiro oriented on where files belong as the project grew across content scripts, background workers, and the popup UI.
- **tech.md** — declared our stack so Kiro never suggested incompatible libraries or patterns.

The biggest difference steering made: without it, early Kiro responses were suggesting approaches that would have violated our privacy constraints (e.g., caching page content). After adding the hard constraints to product.md, those suggestions stopped entirely.

---

## Agent Hooks

We set up five hooks that automated the parts of development most likely to slip during a time-pressured hackathon:

- **pre-commit-review** — ran before every commit to catch hardcoded secrets, missing auth checks, and `any` types. Given that Vora handles voice input and page content, security review on every commit was essential.
- **security-scan** — manual hook for deeper audits before any significant push. Checked for unsanitized input, overly permissive permissions, and sensitive data leaking into logs.
- **component-scaffold-check** — triggered on new `.tsx` file creation to verify component conventions and auto-generate a stub test file. Kept our popup UI components consistent throughout the day.
- **auto-test-sync** — on every save, checked whether new functions had corresponding test coverage and added stubs if not. Prevented test debt from accumulating under time pressure.
- **api-doc-sync** — kept `docs/api.md` updated automatically whenever an API route changed. Useful for staying aligned as a team on the message format between the extension and the AI backend.

The pre-commit hook caught two real issues during the hackathon: a `console.log` that was printing page DOM content (a privacy violation) and a missing input validation check on the command parser.

---

## Spec-Driven Development

We used spec-driven development for the voice command execution pipeline — the most complex and highest-stakes part of Vora. Writing the spec forced us to think through the full flow before writing any code: how commands are parsed, how DOM context is attached, how actions are validated before execution, and how errors surface back to the user as speech.

Compared to vibe coding, the spec approach produced more structured, predictable output. Vibe coding was faster for UI components and one-off utilities. Spec-driven was better for the core pipeline where correctness mattered more than speed — Kiro's implementation matched our intended architecture much more closely when it had a full spec to work from rather than a conversational prompt.

---

## Summary

Kiro wasn't just a code generator for Vora — it was an active development partner. Steering docs encoded our constraints so we never had to re-explain them. Hooks enforced quality automatically under time pressure. Specs gave us architectural confidence on the hardest parts. And vibe coding let us move fast everywhere else. The combination let a small team build a complete, working Chrome extension in a single day.

## Accessibility Features Shipped

After the initial build, we used Kiro to extend Vora's accessibility surface for its primary users — people with motor disabilities who rely entirely on voice:

- **Voice selection** — users can pick any available system voice from a dropdown in Settings, filtered by the selected locale. Online voices are marked with ☁.
- **Volume control** — independent TTS volume slider (0–100%), separate from system volume.
- **Language/locale selection** — BCP-47 locale dropdown populated from `speechSynthesis.getVoices()`. Changing locale resets the voice selection to prevent mismatched voice/language pairs.
- **"Repeat that" command** — saying "repeat that", "say that again", or "what did you say" re-speaks the last TTS readback without re-executing any action. Implemented as a `REPEAT_LAST` action type: the last readback is stored in a ref in `App.tsx`, attached to every `VoiceCommand` payload, passed through the service worker to `buildPrompt()`, and intercepted in the side panel before the content script is ever involved.

All settings persist to `chrome.storage.local` and are loaded on side panel mount. The `speak()` API was extended to accept a `SpeakOptions` object `{ rate, volume, voiceName, locale }` while remaining backward-compatible with the plain-number rate signature used in tests.
