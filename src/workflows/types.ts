import type { BrowserAction } from '../types/actions'

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
  // Treat the slot as filled even if the user says "skip" / "no description".
  // The fill value is the empty string.
  skippable?: boolean
  // Action to execute on the page after the slot is filled successfully.
  // Optional — slots without a fillAction are collected silently and only
  // affect the final summary / finalAction.
  fillAction?: (value: string) => BrowserAction
  // Spoken after the fillAction succeeds. Defaults to a short generic
  // confirmation. Use to read back what was entered ("Sending to alice…").
  readback?: (value: string) => string
  // If true, after parsing Vora reads back the parsed value and asks for a
  // yes/no confirmation BEFORE running the fillAction. On "no" the slot is
  // re-prompted. Use this for fields where mis-transcription is most costly
  // (e.g. email recipient — the engine often substitutes acoustically
  // similar real words for unusual names).
  verify?: (value: string) => string
}

export type Workflow = {
  id: string
  // Human-readable label shown in status messages.
  label: string
  // Phrase patterns that start this workflow when there is no active workflow.
  triggers: RegExp[]
  // Page to navigate to when the workflow starts. The first slot prompt is
  // spoken after openDelayMs has elapsed (so the page has time to render).
  // If omitted, no navigation happens — the workflow runs against whatever
  // page is currently active.
  openUrl?: string
  // Milliseconds to wait after navigation before the first slot prompt.
  // Default: 2500.
  openDelayMs?: number
  slots: Slot[]
  // Final spoken summary used as the voice-confirmation prompt.
  buildConfirmSummary: (values: Record<string, string>) => string
  // What to do after the user confirms — e.g. press the keyboard shortcut
  // for "send" or click a Save button. If omitted, the workflow ends after
  // confirmation without further action.
  finalAction?: (values: Record<string, string>) => BrowserAction
  // Final readback after finalAction runs.
  finalReadback?: string
}

export type ActiveWorkflow = {
  workflow: Workflow
  slotIndex: number
  values: Record<string, string>
}

const CANCEL_PATTERNS: RegExp[] = [
  /^\s*(cancel|never\s*mind|nevermind|stop|forget\s+it|abort)\b/i,
]

export function isCancelUtterance(transcript: string): boolean {
  return CANCEL_PATTERNS.some((p) => p.test(transcript))
}

const SKIP_PATTERNS: RegExp[] = [
  /^\s*(skip|no\s+\w+|none|leave\s+(it\s+)?blank|empty)\s*\.?\s*$/i,
]

export function isSkipUtterance(transcript: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(transcript))
}
