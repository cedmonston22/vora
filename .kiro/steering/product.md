# Product Steering

## What We're Building

Vora is a Chrome extension that enables people with motor disabilities, paralysis, Parkinson's, or anyone who cannot use a mouse or keyboard to control any website entirely through natural language voice commands. Users speak naturally — "go to my Gmail and read my newest email" or "fill in the contact form with my name" — and Vora interprets the intent, reads the page, and executes the action automatically. It replaces the mouse and keyboard entirely using voice as the sole input method.

## Core User Journey

1. User installs the Vora Chrome extension and clicks the Vora icon to activate it
2. User speaks a natural language command describing what they want to do on the current page
3. Vora captures the voice input via Web Speech API and reads the current page DOM for context
4. The command and page context are sent to Kiro API which returns structured browser actions
5. The Chrome extension executes those actions (click, scroll, fill, navigate) on the live page
6. Text-to-speech confirms what was done and prompts the user for their next command

## Key User Personas

- **Primary**: Adults with motor disabilities, paralysis, Parkinson's disease, ALS, RSI, or severe arthritis who cannot reliably use a mouse or keyboard but can speak
- **Secondary**: Temporarily injured users (broken wrist, post-surgery) and power users who want fully hands-free browsing for productivity

## Success Metrics

- A user can navigate from a blank tab to completing a multi-step task (e.g. finding and reading an email) using only voice in under 60 seconds
- Vora correctly interprets and executes at least 90% of natural language commands on standard web pages
- Zero mouse clicks or keyboard inputs required from activation through task completion
- Demo scenario completes end-to-end without failure during judge presentation

## Hard Constraints

- Vora must never execute destructive actions (deleting files, submitting payments, sending emails) without reading back what it is about to do and receiving explicit voice confirmation from the user
- Vora must never store, log, or transmit voice recordings or page content beyond what is required for a single command execution
- Vora must always indicate clearly when it does not understand a command rather than guessing and executing the wrong action
- Vora must work on any standard webpage without requiring site-specific configuration or plugins
- All UI overlays must be non-intrusive and must not block the content the user is trying to interact with
- Vora must never require a mouse click or keyboard input to operate after initial activation