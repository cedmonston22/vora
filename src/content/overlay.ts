import type { ExtensionState, CommandHistoryEntry } from '../types/commands'
import { OVERLAY_COLORS } from '../utils/constants'

type PillDom = {
  host: HTMLDivElement
  badge: HTMLDivElement
  transcript: HTMLDivElement
}

let dom: PillDom | null = null

function buildPill(): PillDom {
  const host = document.createElement('div')
  host.id = 'vora-overlay-host'
  host.style.cssText = [
    'all: initial',
    'position: fixed',
    'bottom: 24px',
    'right: 24px',
    'z-index: 2147483647',
    'pointer-events: none',
    'display: flex',
    'flex-direction: column',
    'align-items: flex-end',
    'gap: 8px',
  ].join(';')

  const shadow = host.attachShadow({ mode: 'closed' })

  const badge = document.createElement('div')
  badge.style.cssText = [
    'display: inline-flex',
    'align-items: center',
    'gap: 6px',
    'padding: 6px 14px',
    'border-radius: 999px',
    'background: ' + OVERLAY_COLORS.LISTENING,
    'color: #fff',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'font-size: 13px',
    'font-weight: 700',
    'letter-spacing: .04em',
    'box-shadow: 0 2px 12px rgba(0,0,0,0.3)',
  ].join(';')
  badge.textContent = 'Listening'

  const transcript = document.createElement('div')
  transcript.style.cssText = [
    'max-width: 280px',
    'padding: 6px 12px',
    'border-radius: 10px',
    'background: rgba(15,23,42,0.85)',
    'color: #f8fafc',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'font-size: 13px',
    'line-height: 1.4',
    'box-shadow: 0 2px 8px rgba(0,0,0,0.25)',
    'display: none',
    'word-wrap: break-word',
  ].join(';')

  shadow.appendChild(transcript)
  shadow.appendChild(badge)
  document.documentElement.appendChild(host)

  return { host, badge, transcript }
}

function ensure(): PillDom {
  if (dom && dom.host.isConnected) return dom
  dom = buildPill()
  return dom
}

function badgeStyle(state: ExtensionState): { text: string; bg: string } {
  switch (state) {
    case 'LISTENING':  return { text: '🎙 Active',     bg: OVERLAY_COLORS.LISTENING }
    case 'THINKING':   return { text: '⏳ Thinking',   bg: OVERLAY_COLORS.THINKING }
    case 'CONFIRMING': return { text: '❓ Confirm?',   bg: OVERLAY_COLORS.CONFIRMING }
    case 'EXECUTING':  return { text: '⚡ Acting',     bg: OVERLAY_COLORS.EXECUTING }
    case 'ERROR':      return { text: '⚠ Error',      bg: OVERLAY_COLORS.ERROR }
    default:           return { text: 'Vora',          bg: '#475569' }
  }
}

export function showOverlay(state: ExtensionState, _message?: string): void {
  const d = ensure()
  const cfg = badgeStyle(state)
  d.badge.textContent = cfg.text
  d.badge.style.background = cfg.bg
  d.host.style.display = 'flex'
}

export function hideOverlay(): void {
  if (dom?.host.parentNode) dom.host.parentNode.removeChild(dom.host)
  dom = null
}

export function setPartial(text: string): void {
  const d = ensure()
  if (text) {
    d.transcript.textContent = `"${text}"`
    d.transcript.style.display = 'block'
  } else {
    d.transcript.style.display = 'none'
    d.transcript.textContent = ''
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function pushRecent(_entry: CommandHistoryEntry): void {
  // History is shown in the side panel — not needed in the page overlay
  const d = ensure()
  d.transcript.style.display = 'none'
  d.transcript.textContent = ''
}
