import type { BrowserAction, ActionResult } from '../types/actions'

// Scope C — implement in actionExecutor.ts
export async function executeAction(_action: BrowserAction): Promise<ActionResult> {
  throw new Error('Not implemented')
}
