import type { ExtensionState, CommandHistoryEntry } from '../types/commands'
import { OVERLAY_COLORS } from '../utils/constants'

const PANEL_WIDTH = 340
const MAX_RECENT = 8

type PanelDom = {
  host: HTMLDivElement
  badge: HTMLDivElement
  transcript: HTMLDivElement
  message: HTMLDivElement
  list: HTMLUListElement
}

let dom: PanelDom | null = null
let originalBodyMargin = ''
let recent: CommandHistoryEntry[] = []
let lastPartial = ''

function buildPanel(): PanelDom {
  const host = document.createElement('div')
  host.id = 'vora-side-panel-host'
  host.style.cssText = [
    'all: initial',
    'position: fixed',
    'top: 0',
    'right: 0',
    'width: ' + PANEL_WIDTH + 'px',
    'height: 100vh',
    'z-index: 2147483647',
    'pointer-events: auto',
  ].join(';')

  const shadow = host.attachShadow({ mode: 'closed' })

  const wrap = document.createElement('div')
  wrap.style.cssText = [
    'box-sizing: border-box',
    'width: 100%',
    'height: 100%',
    'background: #0f172a',
    'color: #f8fafc',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'font-size: 14px',
    'display: flex',
    'flex-direction: column',
    'border-left: 1px solid #1e293b',
    'box-shadow: -6px 0 24px rgba(0,0,0,0.35)',
  ].join(';')

  const header = document.createElement('div')
  header.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'padding:14px 16px',
    'border-bottom:1px solid #1e293b',
    'background:#0b1220',
  ].join(';')

  const title = document.createElement('div')
  title.style.cssText = 'font-weight:700;letter-spacing:.08em;font-size:13px;color:#e2e8f0;'
  title.textContent = 'VORA'

  const badge = document.createElement('div')
  badge.style.cssText = [
    'font-size:11px',
    'font-weight:700',
    'letter-spacing:.04em',
    'padding:4px 10px',
    'border-radius:999px',
    'background:#475569',
    'color:#f8fafc',
    'text-transform:uppercase',
  ].join(';')
  badge.textContent = 'Idle'

  header.appendChild(title)
  header.appendChild(badge)

  const transcriptLabel = document.createElement('div')
  transcriptLabel.style.cssText =
    'padding:14px 16px 4px;font-size:10px;font-weight:700;letter-spacing:.1em;color:#64748b;text-transform:uppercase;'
  transcriptLabel.textContent = 'You said'

  const transcript = document.createElement('div')
  transcript.style.cssText = [
    'min-height:48px',
    'padding:0 16px 14px',
    'font-size:18px',
    'line-height:1.4',
    'color:#475569',
    'border-bottom:1px solid #1e293b',
    'word-wrap:break-word',
  ].join(';')
  transcript.textContent = 'Listening for your command…'

  const message = document.createElement('div')
  message.style.cssText =
    'padding:10px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #1e293b;min-height:18px;'

  const recentLabel = document.createElement('div')
  recentLabel.style.cssText =
    'padding:12px 16px 6px;font-size:10px;font-weight:700;letter-spacing:.1em;color:#64748b;text-transform:uppercase;'
  recentLabel.textContent = 'Recent'

  const list = document.createElement('ul')
  list.style.cssText =
    'flex:1;overflow-y:auto;list-style:none;margin:0;padding:0 12px 16px;'
  list.id = 'vora-recent-list'

  wrap.appendChild(header)
  wrap.appendChild(transcriptLabel)
  wrap.appendChild(transcript)
  wrap.appendChild(message)
  wrap.appendChild(recentLabel)
  wrap.appendChild(list)
  shadow.appendChild(wrap)

  document.documentElement.appendChild(host)

  return { host, badge, transcript, message, list }
}

function ensure(): PanelDom {
  if (dom && dom.host.isConnected) return dom
  if (dom && !dom.host.isConnected) dom = null
  dom = buildPanel()
  return dom
}

function shiftBody(on: boolean): void {
  const body = document.body
  if (!body) return
  if (on) {
    if (!body.dataset.voraShifted) {
      originalBodyMargin = body.style.marginRight
      body.dataset.voraShifted = '1'
    }
    body.style.transition = 'margin-right 0.2s ease'
    body.style.marginRight = PANEL_WIDTH + 'px'
  } else {
    if (body.dataset.voraShifted) {
      body.style.marginRight = originalBodyMargin
      delete body.dataset.voraShifted
    }
  }
}

function badgeStyle(state: ExtensionState): { text: string; bg: string } {
  switch (state) {
    case 'LISTENING':
      return { text: 'Listening', bg: OVERLAY_COLORS.LISTENING }
    case 'THINKING':
      return { text: 'Thinking', bg: OVERLAY_COLORS.THINKING }
    case 'CONFIRMING':
      return { text: 'Confirm?', bg: OVERLAY_COLORS.CONFIRMING }
    case 'EXECUTING':
      return { text: 'Acting', bg: OVERLAY_COLORS.EXECUTING }
    case 'ERROR':
      return { text: 'Error', bg: OVERLAY_COLORS.ERROR }
    default:
      return { text: 'Idle', bg: '#475569' }
  }
}

function renderRecent(d: PanelDom): void {
  d.list.textContent = ''
  for (const e of recent) {
    const li = document.createElement('li')
    li.style.cssText =
      'padding:8px 10px;border-radius:8px;margin-bottom:6px;background:#1e293b;border:1px solid #1e293b;'

    const top = document.createElement('div')
    top.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;gap:8px;'

    const txt = document.createElement('div')
    txt.style.cssText =
      'flex:1;font-size:13px;font-weight:600;color:#f1f5f9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
    txt.textContent = e.transcript

    const ic = document.createElement('div')
    ic.style.cssText =
      'font-size:14px;font-weight:700;color:' + (e.success ? '#10b981' : '#f87171') + ';'
    ic.textContent = e.success ? '✓' : '×'

    top.appendChild(txt)
    top.appendChild(ic)

    const sub = document.createElement('div')
    sub.style.cssText =
      'font-size:11px;color:#94a3b8;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
    sub.textContent = e.readback

    li.appendChild(top)
    li.appendChild(sub)
    d.list.appendChild(li)
  }
}

export function showOverlay(state: ExtensionState, message?: string): void {
  const d = ensure()
  shiftBody(true)
  const cfg = badgeStyle(state)
  d.badge.textContent = cfg.text
  d.badge.style.background = cfg.bg
  if (message !== undefined) d.message.textContent = message
  if (state === 'LISTENING' && !lastPartial) {
    d.transcript.style.color = '#475569'
    d.transcript.textContent = 'Listening for your command…'
  }
}

export function hideOverlay(): void {
  shiftBody(false)
  if (dom?.host.parentNode) dom.host.parentNode.removeChild(dom.host)
  dom = null
  lastPartial = ''
  recent = []
}

export function setPartial(text: string): void {
  const d = ensure()
  lastPartial = text
  if (text) {
    d.transcript.style.color = '#f8fafc'
    d.transcript.textContent = text
  } else {
    d.transcript.style.color = '#475569'
    d.transcript.textContent = 'Listening for your command…'
  }
}

export function pushRecent(entry: CommandHistoryEntry): void {
  const d = ensure()
  recent = [entry, ...recent].slice(0, MAX_RECENT)
  renderRecent(d)
  d.transcript.style.color = '#475569'
  d.transcript.textContent = 'Listening for your command…'
  lastPartial = ''
}
