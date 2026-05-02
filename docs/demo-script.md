# Vora Demo Script

## Setup
1. Load extension unpacked from `dist/` in Chrome
2. Navigate to a page with a search bar (e.g. google.com)
3. Open the Vora popup and enter your Claude API key in Settings

## Demo Flow (~2 min)

**1. Basic navigation**
- Say: "Hey Vora"
- Say: "Search for accessibility tools for disabled users"
- Expected: Vora fills the search box and submits

**2. Reading content**
- Navigate to a search result page
- Say: "Hey Vora"
- Say: "Read me the first result"
- Expected: TTS reads the title and description of the first result

**3. Destructive action confirmation**
- Navigate to a form page
- Say: "Hey Vora"
- Say: "Submit the form"
- Expected: Vora reads back "I'm about to submit the form. Say yes to confirm."
- Say: "Yes"
- Expected: Form submits, TTS confirms

**4. Error handling**
- Say: "Hey Vora"
- Say something ambiguous: "do the thing"
- Expected: TTS says it couldn't understand and asks to rephrase

## Key Points to Highlight
- Zero mouse clicks from activation to task completion
- Voice confirmation before destructive actions
- Plain English error messages
- Works on any standard webpage
