# Requirements Document

## Introduction

Vora is a Chrome extension that enables people with motor disabilities to control any website entirely through natural language voice commands. Users speak naturally and Vora interprets intent, reads the page, and executes browser actions automatically — replacing the mouse and keyboard with voice as the sole input method. This document specifies the requirements across four workstreams: AI Pipeline, Voice and State Machine, Action Execution, and Popup UI, plus end-to-end integration.

## Glossary

- **Vora**: The Chrome extension system as a whole
- **Service_Worker**: The Manifest V3 background service worker that owns extension state and orchestrates the command pipeline
- **DOM_Reader**: The module (`domReader.ts`) that walks the live DOM and extracts interactive elements into a typed PageContext
- **Prompt_Builder**: The module (`promptBuilder.ts`) that combines system prompt, PageContext, and user transcript into a Claude API request
- **Claude_Client**: The module (`claudeClient.ts`) that sends requests to the Anthropic Claude API and returns raw responses
- **Action_Parser**: The module (`actionParser.ts`) that validates Claude JSON responses into typed BrowserAction objects
- **Speech_Recognizer**: The module (`speechRecognition.ts`) that wraps the Web Speech API for voice capture
- **Speech_Synthesizer**: The module (`speechSynthesis.ts`) that wraps the Web Speech Synthesis API for TTS readback
- **Action_Executor**: The module (`actionExecutor.ts`) that receives typed BrowserAction objects and executes them on the live DOM
- **Overlay**: The Shadow DOM overlay (`overlay.ts`) injected into host pages for visual state feedback
- **Content_Script**: The content script entry point (`index.ts`) that wires message listeners and coordinates DOM reading and action execution
- **Popup**: The React-based popup UI providing status display, command history, settings, and activation controls
- **PageContext**: A typed object containing the current page URL, title, interactive elements, headings, and visible text
- **BrowserAction**: A discriminated union type representing a single executable browser action (click, fill, scroll, navigate, etc.)
- **ExtensionState**: The global state of the extension: IDLE, LISTENING, THINKING, CONFIRMING, EXECUTING, or ERROR
- **VoiceCommand**: A typed object containing a transcript string, confidence score, and timestamp
- **Destructive_Action**: Any action that submits forms, sends messages, deletes content, or makes payments — requires voice confirmation before execution
- **Wake_Word**: The phrase "Hey Vora" used to activate the extension hands-free
- **TTS**: Text-to-speech output via the Web Speech Synthesis API
- **Confidence_Threshold**: The minimum speech recognition confidence score (0.7) required to process a command

## Requirements

### Requirement 1: DOM Context Extraction

**User Story:** As a voice-controlled browser user, I want Vora to read and understand the current page structure, so that it can identify which elements I can interact with.

#### Acceptance Criteria

1. WHEN a DOM context request is received, THE DOM_Reader SHALL walk the live DOM and return a PageContext object containing the page URL, title, interactive elements, headings (h1–h3), and visible text trimmed to 2000 characters.
2. THE DOM_Reader SHALL extract interactive elements including buttons, links, inputs, textareas, selects, headings, images with alt text, and form elements, each with a unique CSS selector, role, label, tag, and visibility status.
3. THE DOM_Reader SHALL limit the extracted elements to a maximum of 100 entries, prioritizing visible and interactive elements.
4. WHEN extracting elements, THE DOM_Reader SHALL derive labels from visible text content, aria-label attributes, placeholder attributes, or alt text, in that priority order.
5. THE DOM_Reader SHALL sanitize the extracted context by stripping script tags, inline event handlers, and style tags from the output.
6. THE DOM_Reader SHALL exclude the current value of password fields, PIN fields, and fields labelled with sensitive terms (SSN, social security, credit card, CVV, CVC) from the PageContext.
7. THE DOM_Reader SHALL exclude hidden elements (display:none, visibility:hidden, zero dimensions) from the extracted elements.

### Requirement 2: Prompt Construction

**User Story:** As a voice-controlled browser user, I want Vora to build context-aware prompts for the AI, so that the AI can accurately interpret my commands against the current page.

#### Acceptance Criteria

1. WHEN a transcript and PageContext are provided, THE Prompt_Builder SHALL combine a system prompt, the serialized PageContext, and the raw transcript into a single Claude API request body.
2. THE Prompt_Builder SHALL include in the system prompt the Vora role definition, the complete BrowserAction JSON schema, and constraints specifying that the AI must return exactly one valid BrowserAction.
3. THE Prompt_Builder SHALL include the page URL, page title, list of interactive elements with their selectors and labels, and visible text in the page context section of the prompt.
4. THE Prompt_Builder SHALL instruct Claude to return a JSON object matching the BrowserAction discriminated union, including a `readbackText` field describing the action in plain English.

### Requirement 3: Claude API Communication

**User Story:** As a voice-controlled browser user, I want Vora to communicate reliably with the AI service, so that my commands are interpreted without excessive delays.

#### Acceptance Criteria

1. WHEN a prompt and API key are provided, THE Claude_Client SHALL send a POST request to the Anthropic Claude API using the claude-sonnet-4-6 model via native fetch.
2. THE Claude_Client SHALL enforce a 10-second timeout on the API request and hard-fail at 15 seconds by aborting the request.
3. IF the Claude API returns an HTTP error status, THEN THE Claude_Client SHALL throw a typed AIError containing the status code and a plain-English error message.
4. IF the Claude API request exceeds the 15-second hard timeout, THEN THE Claude_Client SHALL abort the request and throw a typed AIError with the message "That took too long. Please try again."
5. IF a network error occurs during the API request, THEN THE Claude_Client SHALL throw a typed NetworkError with the message "I can't reach the AI right now. Check your connection."
6. THE Claude_Client SHALL be the sole module that calls the Anthropic Claude API — no other module shall make direct API calls.

### Requirement 4: Action Response Parsing

**User Story:** As a voice-controlled browser user, I want Vora to validate AI responses before acting, so that only well-formed actions are executed on the page.

#### Acceptance Criteria

1. WHEN a raw Claude response string is received, THE Action_Parser SHALL parse the JSON and validate it against the BrowserAction discriminated union type.
2. THE Action_Parser SHALL verify that the parsed action contains a valid ActionType enum value and all required fields for that action type (selector and label for click actions, selector and value for fill actions, url for navigate actions).
3. IF the Claude response is not valid JSON, THEN THE Action_Parser SHALL throw a typed AIError.
4. IF the parsed JSON does not match any known BrowserAction variant, THEN THE Action_Parser SHALL throw a typed AIError.
5. THE Action_Parser SHALL extract the readbackText and optional confirmationText from the Claude response and return a complete ParsedIntent object.
6. WHEN the parsed action targets an element with a destructive label (send, submit, delete, remove, cancel, pay, purchase, confirm, post, publish) or is of type SUBMIT_FORM, THE Action_Parser SHALL set the confirmationText field on the returned ParsedIntent.
7. FOR ALL valid BrowserAction JSON strings, parsing then serializing then parsing SHALL produce an equivalent BrowserAction object (round-trip property).

### Requirement 5: Voice Capture

**User Story:** As a user with motor disabilities, I want to speak commands naturally and have them captured accurately, so that I can control the browser without a keyboard or mouse.

#### Acceptance Criteria

1. WHEN listening is started, THE Speech_Recognizer SHALL activate the Web Speech API with continuous recognition enabled and interim results disabled.
2. WHEN the Web Speech API emits a final result (isFinal is true), THE Speech_Recognizer SHALL stop recognition and emit a VoiceCommand containing the transcript, confidence score, and timestamp.
3. IF the final result confidence score is below 0.7, THEN THE Speech_Recognizer SHALL still emit the VoiceCommand but mark it as low-confidence so the Service_Worker can handle the rejection.
4. WHEN stopListening is called, THE Speech_Recognizer SHALL explicitly stop the Web Speech API recognition session.
5. THE Speech_Recognizer SHALL ensure that a new recognition session is never started while a previous session is still active.
6. IF the Web Speech API emits an error event, THEN THE Speech_Recognizer SHALL stop recognition and report the error to the Service_Worker.

### Requirement 6: Text-to-Speech Readback

**User Story:** As a user with motor disabilities, I want Vora to speak confirmations and errors aloud, so that I can use the extension without needing to read the screen.

#### Acceptance Criteria

1. WHEN speak is called with a text string, THE Speech_Synthesizer SHALL use the Web Speech Synthesis API to speak the text aloud and return a Promise that resolves when speech completes.
2. THE Speech_Synthesizer SHALL use the user-configured speech rate (default 1.0, range 0.5 to 1.5).
3. THE Speech_Synthesizer SHALL ensure that TTS playback completes fully before the returned Promise resolves, so that voice recognition can safely restart afterward.
4. IF a speech synthesis error occurs, THEN THE Speech_Synthesizer SHALL reject the Promise with a typed VoiceError.
5. THE Speech_Synthesizer SHALL cancel any in-progress speech before starting a new utterance to prevent overlapping audio.

### Requirement 7: Extension State Machine and Service Worker

**User Story:** As a voice-controlled browser user, I want the extension to manage a clear lifecycle of states, so that voice capture, AI processing, and action execution never overlap or conflict.

#### Acceptance Criteria

1. THE Service_Worker SHALL maintain a global ExtensionState that transitions through IDLE, LISTENING, THINKING, CONFIRMING, EXECUTING, and ERROR states.
2. WHEN the wake word "Hey Vora" is detected, THE Service_Worker SHALL transition from IDLE to LISTENING and start voice recognition.
3. WHEN a VoiceCommand is received with confidence at or above 0.7, THE Service_Worker SHALL transition to THINKING, request PageContext from the Content_Script, build a prompt, and call the Claude_Client.
4. WHEN a VoiceCommand is received with confidence below 0.7, THE Service_Worker SHALL trigger TTS to say "I heard '[transcript]' but I'm not sure what to do with that on this page. Could you rephrase?" and return to LISTENING after TTS completes.
5. WHEN the Action_Parser returns a ParsedIntent with a confirmationText, THE Service_Worker SHALL transition to CONFIRMING, speak the confirmation prompt via TTS, and listen for a yes or no response.
6. WHILE in CONFIRMING state, WHEN the user says "yes", THE Service_Worker SHALL transition to EXECUTING and send the BrowserAction to the Content_Script for execution.
7. WHILE in CONFIRMING state, WHEN the user says "no" or 5 seconds elapse without a response, THE Service_Worker SHALL cancel the action, speak "Cancelled. What would you like to do?", and return to LISTENING.
8. WHEN action execution completes successfully, THE Service_Worker SHALL speak the readback text via TTS and return to LISTENING after TTS completes.
9. IF action execution fails, THEN THE Service_Worker SHALL speak "I tried but couldn't [action]. The page may have changed." and return to LISTENING.
10. IF the Claude_Client throws an AIError due to timeout, THEN THE Service_Worker SHALL speak "That took too long. Please try again." and return to LISTENING.
11. IF the Claude_Client throws a NetworkError, THEN THE Service_Worker SHALL speak "I can't reach the AI right now. Check your connection." and return to IDLE.
12. THE Service_Worker SHALL broadcast ExtensionState changes to all connected contexts (Popup, Content_Script) via Chrome message passing.
13. THE Service_Worker SHALL ensure TTS readback completes before restarting voice recognition in every state transition.

### Requirement 8: Action Execution on Live DOM

**User Story:** As a voice-controlled browser user, I want Vora to execute browser actions on the current page, so that I can click buttons, fill forms, scroll, and navigate without a mouse.

#### Acceptance Criteria

1. WHEN a CLICK_ELEMENT action is received, THE Action_Executor SHALL locate the element by its CSS selector and programmatically click it, returning a success ActionResult with a plain-English message.
2. WHEN a FILL_INPUT action is received, THE Action_Executor SHALL locate the input element by its CSS selector, set its value, and dispatch input and change events.
3. WHEN a FILL_INPUT action targets a field with a sensitive label (password, PIN, SSN, credit card, CVV, CVC), THE Action_Executor SHALL refuse to fill the field and return a failure ActionResult with the message "I can't fill that field for your security."
4. WHEN a SCROLL_DOWN or SCROLL_UP action is received, THE Action_Executor SHALL scroll the page by the specified amount or a default increment.
5. WHEN a SCROLL_TO_ELEMENT action is received, THE Action_Executor SHALL scroll the targeted element into view.
6. WHEN a NAVIGATE action is received, THE Action_Executor SHALL set window.location.href to the specified URL.
7. WHEN a READ_CONTENT action is received, THE Action_Executor SHALL extract the text content of the targeted element (or the page body if no selector is provided) and return it in the ActionResult message for TTS readback.
8. WHEN a FOCUS_ELEMENT action is received, THE Action_Executor SHALL locate the element by its CSS selector and call focus() on it.
9. IF the targeted element cannot be found by its CSS selector, THEN THE Action_Executor SHALL return a failure ActionResult with a plain-English message.
10. THE Action_Executor SHALL wrap each action execution in a try/catch block so that a single failed action does not crash the content script.

### Requirement 9: Visual State Overlay

**User Story:** As a voice-controlled browser user, I want to see a visual indicator of what Vora is doing, so that I have supplementary feedback alongside audio.

#### Acceptance Criteria

1. WHEN showOverlay is called with an ExtensionState, THE Overlay SHALL inject a Shadow DOM element into the host page displaying the current state label.
2. THE Overlay SHALL use high-contrast colors with a minimum 4.5:1 contrast ratio: blue (#1D4ED8) for LISTENING, amber (#B45309) for THINKING, green (#15803D) for EXECUTING/Done, red (#B91C1C) for ERROR, and violet (#7C3AED) for CONFIRMING.
3. THE Overlay SHALL use a minimum font size of 16px for all displayed text.
4. THE Overlay SHALL use Shadow DOM encapsulation so that host page styles do not leak into the overlay and overlay styles do not affect the host page.
5. THE Overlay SHALL position itself so that it does not cover interactive elements the user is trying to reach.
6. WHEN hideOverlay is called, THE Overlay SHALL remove the Shadow DOM element from the host page.
7. THE Overlay SHALL contain no React code — it must be implemented in vanilla TypeScript with raw CSS.

### Requirement 10: Content Script Message Wiring

**User Story:** As a voice-controlled browser user, I want the content script to coordinate DOM reading and action execution in response to service worker messages, so that the full command pipeline works end-to-end.

#### Acceptance Criteria

1. WHEN the Content_Script loads, THE Content_Script SHALL register a Chrome message listener that handles DOM_CONTEXT_REQUEST, ACTION_EXECUTE, and STATE_CHANGE message types.
2. WHEN a DOM_CONTEXT_REQUEST message is received, THE Content_Script SHALL call the DOM_Reader and respond with a DOM_CONTEXT_RESPONSE message containing the PageContext.
3. WHEN an ACTION_EXECUTE message is received, THE Content_Script SHALL call the Action_Executor with the provided BrowserAction and respond with an ACTION_RESULT message containing the success status and plain-English message.
4. WHEN a STATE_CHANGE message is received, THE Content_Script SHALL update the Overlay to reflect the new ExtensionState.
5. THE Content_Script SHALL check chrome.runtime.lastError after every sendMessage call and log errors to the console.

### Requirement 11: Popup Voice State Hook

**User Story:** As a voice-controlled browser user, I want the popup to display the current extension state in real time, so that I have visual confirmation of what Vora is doing.

#### Acceptance Criteria

1. THE useVoiceState hook SHALL listen for STATE_CHANGE messages from the Service_Worker via chrome.runtime.onMessage and return the current ExtensionState.
2. WHEN a STATE_CHANGE message is received, THE useVoiceState hook SHALL update its returned state value, triggering a React re-render.
3. WHEN the hook mounts, THE useVoiceState hook SHALL initialize with the IDLE state.
4. WHEN the hook unmounts, THE useVoiceState hook SHALL remove its Chrome message listener to prevent memory leaks.

### Requirement 12: Popup Command History Hook

**User Story:** As a voice-controlled browser user, I want to see my recent commands and their outcomes, so that I can track what Vora has done.

#### Acceptance Criteria

1. THE useCommandHistory hook SHALL maintain an ordered list of CommandHistoryEntry objects, with the most recent entry first.
2. WHEN a new entry is added, THE useCommandHistory hook SHALL prepend it to the list and trim the list to a maximum of 20 entries.
3. THE useCommandHistory hook SHALL expose an `add` function that accepts a CommandHistoryEntry and updates the list.

### Requirement 13: Status Indicator Component

**User Story:** As a voice-controlled browser user, I want to see a clear visual indicator of the current state in the popup, so that I know whether Vora is listening, thinking, or done.

#### Acceptance Criteria

1. THE StatusIndicator component SHALL display the current ExtensionState as a human-readable label (Idle, Listening, Thinking, Confirming, Executing, Error).
2. THE StatusIndicator component SHALL use visually distinct colors for each state: blue for LISTENING, amber for THINKING, green for EXECUTING, red for ERROR, and violet for CONFIRMING.
3. THE StatusIndicator component SHALL be accessible with appropriate ARIA attributes for screen readers.

### Requirement 14: Activation Button Component

**User Story:** As a voice-controlled browser user, I want a clear toggle to activate and deactivate Vora from the popup, so that I can control when the extension is listening.

#### Acceptance Criteria

1. WHEN the user clicks the ActivationButton while Vora is inactive, THE ActivationButton SHALL send a WAKE_WORD_DETECTED message to the Service_Worker to begin listening.
2. WHEN the user clicks the ActivationButton while Vora is active, THE ActivationButton SHALL send a deactivation message to the Service_Worker to stop listening and return to IDLE.
3. THE ActivationButton SHALL display a microphone icon that visually indicates whether Vora is active or inactive.
4. THE ActivationButton SHALL be accessible with an aria-label describing its current state ("Activate Vora" or "Deactivate Vora").

### Requirement 15: Command History Component

**User Story:** As a voice-controlled browser user, I want to see a scrollable list of my recent commands and their outcomes in the popup, so that I can review what Vora has done.

#### Acceptance Criteria

1. THE CommandHistory component SHALL render a scrollable list of CommandHistoryEntry objects showing the transcript, readback message, success or failure status, and timestamp for each entry.
2. WHEN the command history is empty, THE CommandHistory component SHALL display a placeholder message indicating no commands have been issued yet.
3. THE CommandHistory component SHALL visually distinguish successful commands from failed commands using color or iconography.

### Requirement 16: Settings Panel Component

**User Story:** As a voice-controlled browser user, I want to configure my API key and voice preferences, so that Vora works with my account and speaks at a comfortable speed.

#### Acceptance Criteria

1. THE SettingsPanel SHALL provide a text input for the user to enter and save their Anthropic Claude API key to chrome.storage.local.
2. THE SettingsPanel SHALL mask the API key input so that the key is not visible on screen.
3. THE SettingsPanel SHALL provide a control for adjusting the TTS speech rate between 0.5 and 1.5, with a default of 1.0.
4. WHEN the user saves settings, THE SettingsPanel SHALL persist the API key and speech rate to chrome.storage.local and confirm the save via a visual indicator.
5. WHEN the SettingsPanel mounts, THE SettingsPanel SHALL load existing settings from chrome.storage.local and populate the inputs.

### Requirement 17: Popup Root Layout

**User Story:** As a voice-controlled browser user, I want a cohesive popup interface that brings together status, controls, history, and settings, so that I have a single place to monitor and configure Vora.

#### Acceptance Criteria

1. THE App component SHALL render the StatusIndicator, ActivationButton, CommandHistory, and SettingsPanel components in a structured layout.
2. THE App component SHALL wire the useVoiceState hook to the StatusIndicator and ActivationButton components.
3. THE App component SHALL wire the useCommandHistory hook to the CommandHistory component.
4. THE App component SHALL use Tailwind CSS utility classes for styling and maintain a fixed width of 320px suitable for a Chrome extension popup.

### Requirement 18: End-to-End Command Pipeline Integration

**User Story:** As a voice-controlled browser user, I want the entire pipeline — from speaking a command to seeing it executed — to work seamlessly, so that I can control any website with voice alone.

#### Acceptance Criteria

1. WHEN the user speaks a command after activation, THE Service_Worker SHALL orchestrate the full pipeline: capture voice → extract DOM context → build prompt → call Claude API → parse action → (confirm if destructive) → execute action → TTS readback → resume listening.
2. THE Service_Worker SHALL send STATE_CHANGE messages at each pipeline transition so that both the Popup and the Overlay reflect the current state.
3. WHEN a non-destructive action is parsed, THE Service_Worker SHALL execute the action immediately without a confirmation step.
4. WHEN a destructive action is parsed, THE Service_Worker SHALL pause execution, speak the confirmation prompt, and wait for a yes/no voice response before proceeding.
5. THE integrated pipeline SHALL ensure that TTS readback completes before voice recognition restarts at every transition point.
6. THE integrated pipeline SHALL handle errors at each stage (voice capture, DOM extraction, AI call, parsing, execution) by speaking a plain-English error message via TTS and returning to LISTENING or IDLE state.

### Requirement 19: Privacy and Data Safety

**User Story:** As a user with motor disabilities, I want Vora to protect my privacy, so that my voice data and browsing activity are not stored or transmitted beyond what is needed for a single command.

#### Acceptance Criteria

1. THE Vora extension SHALL NOT store, log, or transmit voice recordings beyond the active command execution cycle.
2. THE Vora extension SHALL NOT persist page DOM content, PageContext objects, or user transcripts in extension storage, local storage, or any external service beyond the current command.
3. THE DOM_Reader SHALL exclude sensitive field values (password, PIN, SSN, credit card, CVV) from all PageContext objects sent to the Claude API.
4. THE Speech_Synthesizer SHALL NOT read aloud the contents of password fields or other sensitive data.
5. IF a user command targets a sensitive field, THEN THE Action_Executor SHALL refuse the action and speak "I can't fill that field for your security."
