import type { Workflow } from './types'
import { GMAIL_COMPOSE_WORKFLOW } from './gmail'
import { CALENDAR_EVENT_WORKFLOW } from './calendar'

export { isCancelUtterance, isSkipUtterance } from './types'
export type { Workflow, Slot, ActiveWorkflow } from './types'

export const WORKFLOWS: readonly Workflow[] = [
  GMAIL_COMPOSE_WORKFLOW,
  CALENDAR_EVENT_WORKFLOW,
]

export function matchTrigger(transcript: string): Workflow | null {
  const t = transcript.trim()
  if (!t) return null
  for (const wf of WORKFLOWS) {
    if (wf.triggers.some((re) => re.test(t))) return wf
  }
  return null
}
