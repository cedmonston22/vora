# Voice AI Flow

## Overview

This document defines the exact pipeline every voice command follows in Vora — from user activation through execution and confirmation. Kiro must never generate code that breaks or bypasses this flow.

## MVP Activation

- The user clicks the Vora icon to open the **side panel** (Chrome `sidePanel` API). The panel persists across tab switches.
- The user clicks the mic button in the side panel to start a session.
- Once active, recognition runs in continuous loop: capture command → process → execute → TTS readback → re-enter listening.
- The session ends when the user clicks the mic again (Stop) or closes the side panel.
- The side panel displays state: Idle → Listening → Thinking → Confirming (destructive only) → Executing → Listening.
- The in-page side panel (Shadow DOM, injected by the content script) mirrors state and shows live transcripts.

## Future: Wake Word Activation

- Wake word "Hey Vora" is **not implemented in the MVP**.
- Future work: add an offscreen document or persistent passive recognition layer that detects "Hey Vora" without requiring the side panel to be open. On detection, open the side panel and begin a listening session.
- Wake word detection must be lightweight — it must not impact page performance.

## Step-by-Step Command Pipeline

```
1. USER ACTIVATES (MVP)
   └── User clicks the mic button in the side panel
   └── Side panel state sets to LISTENING
   └── Web Speech API recognition starts (in the side panel window context)
   └── In-page status pill appears in bottom-right corner (Shadow DOM, no body shift)
   └── Status pill shows "🎙 Listening"

2. VOICE CAPTURE
   └── Web Speech API captures continuous speech
   └── On final result (isFinal === true), recognition stops
   └── Raw transcript passed to promptBuilder.ts
   └── If confidence < 0.7, skip to ERROR HANDLING

3. DOM EXTRACTION
   └── Content script runs domReader.ts on current page
   └── Extracts: interactive elements (buttons, links, inputs), headings, visible text
   └── Sanitizes: removes script tags, event handlers, sensitive input values
   └── Returns PageContext object with typed element map

4. PROMPT CONSTRUCTION
   └── promptBuilder.ts combines:
       - System prompt (Vora role, action schema, constraints)
       - Page context (sanitized DOM snapshot)
       - User command (raw transcript)
   └── Sends to Claude API via claudeClient.ts

5. AI PROCESSING
   └── claudeClient.ts calls Anthropic Claude API (claude-sonnet-4-6)
   └── 10 second timeout, hard fail at 15 seconds
   └── Claude returns structured JSON action or error
   └── actionParser.ts validates and types the response

6. FEEDBACK — THINKING STATE
   └── While Claude is processing:
       - Visual overlay updates to "Thinking..." with a loading indicator
       - No TTS during thinking — audio is reserved for confirmation and readback
   └── Visual feedback only during AI processing

7. CONFIRMATION (DESTRUCTIVE ACTIONS ONLY)
   └── If action type is SUBMIT_FORM, CLICK_SEND, CLICK_DELETE, CLICK_PAY:
       - TTS reads back: "I'm about to [action]. Say yes to confirm."
       - Recognition restarts, listens for yes/no
       - Yes → proceed, No → cancel and return to LISTENING
   └── Non-destructive actions execute immediately without confirmation

8. EXECUTION
   └── actionExecutor.ts receives typed BrowserAction
   └── Executes action on live page DOM
   └── Each action wrapped in try/catch
   └── On success → step 9
   └── On failure → ERROR HANDLING

9. CONFIRMATION READBACK
   └── TTS confirms what was done in plain English
   └── Example: "Done. I clicked the Submit button."
   └── Visual overlay updates to "Done"
   └── After TTS completes, recognition automatically restarts
   └── Vora returns to LISTENING state without requiring re-activation

10. LISTENING RESUMES
    └── User can speak next command immediately
    └── Session continues until user closes popup
```

## Error Handling

### Command not understood (confidence < 0.7)
- TTS explains what it heard and why it couldn't act: "I heard '[transcript]' but I'm not sure what to do with that on this page. Could you rephrase?"
- Returns to LISTENING state immediately after TTS completes
- Never attempts to execute a low-confidence command

### Claude returns unparseable response
- TTS says: "I'm not sure how to do that on this page. Could you rephrase?"
- Returns to LISTENING state
- Never guesses or partially executes

### Action execution fails
- TTS says: "I tried but couldn't [action]. The page may have changed."
- Returns to LISTENING state
- Does not retry automatically

### Claude API timeout
- TTS says: "That took too long. Please try again."
- Cancels the request
- Returns to LISTENING state

### Network error
- TTS says: "I can't reach the AI right now. Check your connection."
- Returns to IDLE state

## State Machine

```
USER CLICKS MIC → LISTENING → THINKING → CONFIRMING (destructive only) → EXECUTING → LISTENING
                                                                                    ↓ (on error)
                                                                                 LISTENING

USER CLICKS MIC AGAIN → IDLE (session ends)
```

The state machine lives in the side panel React app, not the service worker, because Web Speech APIs require a window context and service workers terminate when idle. The service worker is a stateless RPC layer for the AI pipeline.

## Rules Kiro Must Never Break

- TTS readback must always complete before recognition restarts — no audio overlap
- Recognition must always be explicitly stopped before starting a new session
- Claude API must never be called without a sanitized page context
- Destructive actions must never execute without voice confirmation
- A failed action must never leave the extension in a broken state — always return to LISTENING