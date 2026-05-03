export type Slot = {
  id: string
  // What Vora speaks to ask the user for this slot.
  prompt: string
  // Convert/clean the user's spoken answer. Return null if it cannot be
  // parsed and the user should be re-prompted; the reprompt message comes
  // from the slot's onParseFail (or a generic fallback).
  parse?: (transcript: string) => string | null
  // Spoken when parse() returns null. If omitted, a generic retry is used.
  onParseFail?: string
  // Treat the slot as filled even if the user says "skip" / "no subject" /
  // "no description". The fill value is the empty string.
  skippable?: boolean
}

export type WorkflowPlan = {
  // What Vora reads aloud as the final confirmation, e.g.
  // "I'll open an email to alice@x.com with the subject 'Lunch'. Continue?"
  summary: string
  // The destination URL Vora navigates to after the user confirms.
  url: string
}

export type Workflow = {
  id: string
  // Human-readable label shown in status messages: "Compose email", "New event".
  label: string
  // Phrase patterns that start this workflow when there is no active workflow.
  triggers: RegExp[]
  slots: Slot[]
  buildPlan: (values: Record<string, string>) => WorkflowPlan
}

export type ActiveWorkflow = {
  workflow: Workflow
  slotIndex: number
  values: Record<string, string>
}

// Phrases that abort an in-progress workflow.
const CANCEL_PATTERNS: RegExp[] = [
  /^\s*(cancel|never mind|nevermind|stop|forget it|abort)\b/i,
]

export function isCancelUtterance(transcript: string): boolean {
  return CANCEL_PATTERNS.some((p) => p.test(transcript))
}

// Phrases that mean "leave this slot blank".
const SKIP_PATTERNS: RegExp[] = [
  /^\s*(skip|no\s+\w+|none|leave\s+(it\s+)?blank|empty)\s*\.?\s*$/i,
]

export function isSkipUtterance(transcript: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(transcript))
}
