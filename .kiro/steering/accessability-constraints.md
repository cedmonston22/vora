# Accessibility Constraints

## Overview

Vora is built for people who cannot use a mouse or keyboard. Every design and implementation decision must be made with this user in mind. Kiro must never generate code that creates a mouse-only or keyboard-only fallback, bypasses audio feedback, or assumes the user can see the screen clearly.

## Core Principle

If a feature cannot be used without a mouse or keyboard, it must not be shipped. The voice interface is not an enhancement — it is the only interface.

## Confirmation Rules

Vora only requires voice confirmation before destructive actions:
- Form submissions (`SUBMIT_FORM`)
- Any click on elements containing: send, submit, delete, remove, cancel, pay, purchase, confirm, post, publish
- All other actions execute immediately without confirmation

Confirmation flow must be:
1. TTS reads exactly what is about to happen in plain English
2. Recognition restarts and listens for "yes" or "no"
3. If no response within 5 seconds, action is cancelled automatically
4. TTS confirms cancellation: "Cancelled. What would you like to do?"

Never require typed confirmation — voice only.

## Audio Requirements

- Every state change must have a corresponding TTS message — no silent transitions
- TTS must be audible before the next recognition session starts — never overlap
- TTS speech rate must default to 1.0x — configurable in settings between 0.5x and 1.5x
- TTS volume must default to 100% — configurable in settings between 0% and 100%
- TTS voice must default to the system default — user can select any available system voice in Settings
- TTS locale must default to `en-US` — user can select any available locale in Settings; changing locale resets the voice selection
- TTS must use a clear, natural voice — default to the best available system voice
- Error messages must be in plain English — never read out error codes, selectors, or technical strings
- TTS must read page content in logical reading order — not DOM order if they differ
- "Repeat that", "say that again", and "what did you say" must re-speak the last TTS readback without re-executing any action

## Visual Requirements

- Overlay must use high contrast colors — minimum 4.5:1 contrast ratio against any background
- Overlay must never cover interactive elements the user is trying to reach
- Overlay must use Shadow DOM — it must never inherit or override host page styles
- Overlay text must be minimum 16px
- All status states must be visually distinct: Listening (blue), Thinking (amber), Done (green), Error (red)
- Visual feedback is supplementary — the extension must be fully usable with eyes closed

## Input Requirements

- Vora is activated entirely by wake word — "Hey Vora" — no mouse or keyboard required
- After wake word detection, no further mouse or keyboard input may be required
- Settings must be configurable by voice — "set speech rate to slow" must work
- Vora must never present a CAPTCHA or bot-detection challenge — if encountered, TTS explains the situation
- Wake word detection must run passively without draining performance or requiring a visible UI element

## Content Safety

- Vora must never read aloud content from password fields
- Vora must never fill fields labelled: password, PIN, SSN, social security, credit card, CVV, CVC
- If a sensitive field is targeted, TTS says: "I can't fill that field for your security"
- Vora must never store or log page content, voice recordings, or form values beyond a single command session

## Failure Modes That Are Never Acceptable

- Silent failure — Vora must always tell the user what went wrong
- Partial execution — if a multi-step action fails halfway, TTS explains what completed and what did not
- Broken listening state — after any error, Vora must return to a clean LISTENING state
- Irreversible action without confirmation — never submit, send, delete, or pay without voice confirmation
- Mouse-required recovery — if Vora gets into an error state, voice must be able to recover it

## Language and Tone

- All TTS messages must be in plain, conversational English
- Never use technical language: no selectors, no error codes, no HTTP status
- Keep TTS messages under 20 words where possible — users are waiting to speak again
- Use active voice: "I clicked the button" not "The button was clicked"
- When reading page content, skip navigation menus, cookie banners, and ad copy unless explicitly asked