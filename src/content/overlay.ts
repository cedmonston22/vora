import type { ExtensionState } from '../types/commands'
import { OVERLAY_COLORS } from '../utils/constants'

const HOST_ID = 'vora-overlay-host'
let badge: HTMLDivElement | null = null

function ensure(): HTMLDivElement {
  if (badge && badge.isConnected) return badge
  const existing = document.getElementById(HOST_ID)
  if (existing) existing.remove()

  const host = document.createElement('div')
  host.id = HOST_ID
  host.style.cssText = [
    'position:fixed',
    'top:16px',
    'right:16px',
    'z-index:2147483647',
    'pointer-events:none',
  ].join(';')
  const root = host.attachShadow({ mode: 'closed' })
  const el = document.createElement('div')
  el.style.cssText = [
    'background:#0f172a',
    'color:#ffffff',
    'font:600 16px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
    'padding:10px 14px',
    'border-radius:10px',
    'box-shadow:0 8px 24px rgba(0,0,0,.25)',
    'max-width:320px',
    'display:none',
  ].join(';')
  root.appendChild(el)
  document.documentElement.appendChild(host)
  badge = el
  return el
}

const labelFor: Partial<Record<ExtensionState, { text: string; color: string }>> = {
  LISTENING: { text: 'Listening…', color: OVERLAY_COLORS.LISTENING },
  THINKING: { text: 'Thinking…', color: OVERLAY_COLORS.THINKING },
  CONFIRMING: { text: 'Confirm?', color: OVERLAY_COLORS.CONFIRMING },
  EXECUTING: { text: 'Acting…', color: OVERLAY_COLORS.EXECUTING },
  ERROR: { text: 'Error', color: OVERLAY_COLORS.ERROR },
}

export function showOverlay(state: ExtensionState): void {
  const cfg = labelFor[state]
  if (!cfg) {
    hideOverlay()
    return
  }
  const el = ensure()
  el.textContent = cfg.text
  el.style.background = cfg.color
  el.style.display = 'block'
}

export function hideOverlay(): void {
  if (!badge) return
  badge.style.display = 'none'
}
