import type { PageContext } from '../types/dom'
import type {
  ExtensionMessage,
  VoiceCommand,
  ParsedIntent,
  TabInfo,
} from '../types/commands'
import type { BrowserAction } from '../types/actions'
import { MSG } from '../types/commands'
import { ActionType } from '../types/actions'
import { buildPrompt, buildRestrictedPrompt } from '../ai/promptBuilder'
import { callClaude, AIError } from '../ai/claudeClient'
import { parseAction, ParseError } from '../ai/actionParser'
import { storageGet } from '../utils/helpers'
import { STORAGE_KEY_API_KEY } from '../utils/constants'

type ServiceResult =
  | { ok: true; intent: ParsedIntent; restricted?: boolean }
  | { ok: false; error: string }

type ContextResult =
  | { kind: 'ok'; context: PageContext }
  | { kind: 'restricted' }
  | { kind: 'failed' }

function isRestrictedUrl(url: string): boolean {
  if (!url) return true
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('chrome-search://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('view-source:') ||
    url.startsWith('devtools://')
  )
}

chrome.runtime.onInstalled.addListener(() => {
  // Make clicking the extension icon open the side panel instead of a popup.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[vora-sw] sidePanel.setPanelBehavior failed:', err))
})

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === MSG.VOICE_COMMAND_RECEIVED) {
    void handleVoiceCommand(message.payload, sender).then(sendResponse)
    return true
  }
  if (message.type === MSG.BACKGROUND_NAVIGATE) {
    void handleBackgroundNavigate(message.payload.url, sender).then(sendResponse)
    return true
  }
  if (message.type === MSG.BACKGROUND_TAB_ACTION) {
    void handleTabAction(message.payload, sender).then(sendResponse)
    return true
  }
  return false
})

async function handleTabAction(
  action: BrowserAction,
  sender: chrome.runtime.MessageSender,
): Promise<{ success: boolean; message: string }> {
  try {
    if (action.type === ActionType.OPEN_TAB) {
      if (!/^https?:\/\//i.test(action.url)) {
        return { success: false, message: 'Refusing to open a non-http(s) URL.' }
      }
      await chrome.tabs.create({ url: action.url, active: true })
      return { success: true, message: `Opened ${action.url} in a new tab.` }
    }

    if (action.type === ActionType.CLOSE_TAB) {
      const tabId =
        action.tabId !== undefined ? action.tabId : await pickTargetTabId(sender)
      if (tabId == null) return { success: false, message: 'No tab to close.' }
      await chrome.tabs.remove(tabId)
      return {
        success: true,
        message: action.label ? `Closed ${action.label}.` : 'Closed the tab.',
      }
    }

    if (action.type === ActionType.SWITCH_TAB) {
      const tab = await chrome.tabs.get(action.tabId).catch(() => null)
      if (!tab) {
        return { success: false, message: `Tab ${action.tabId} is no longer open.` }
      }
      await chrome.tabs.update(action.tabId, { active: true })
      if (tab.windowId != null) {
        await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined)
      }
      return { success: true, message: `Switched to ${action.label || 'that tab'}.` }
    }

    return { success: false, message: 'Unsupported tab action.' }
  } catch (err) {
    console.error('[vora-sw] tab action failed:', err)
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Tab action failed.',
    }
  }
}

async function handleBackgroundNavigate(
  url: string,
  sender: chrome.runtime.MessageSender,
): Promise<{ success: boolean; message: string }> {
  try {
    const tabId = await pickTargetTabId(sender)
    if (tabId == null) return { success: false, message: 'No active tab to navigate.' }
    if (!/^https?:\/\//i.test(url)) {
      return { success: false, message: 'Refusing to navigate to a non-http(s) URL.' }
    }
    await chrome.tabs.update(tabId, { url })
    return { success: true, message: `Navigating to ${url}.` }
  } catch (err) {
    console.error('[vora-sw] background navigate failed:', err)
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Navigation failed.',
    }
  }
}

async function handleVoiceCommand(
  cmd: VoiceCommand,
  sender: chrome.runtime.MessageSender,
): Promise<ServiceResult> {
  console.log('[vora-sw] received:', cmd.transcript)
  try {
    const tabId = await pickTargetTabId(sender)
    console.log('[vora-sw] target tab:', tabId)
    if (tabId == null) {
      return { ok: false, error: 'No active tab to act on.' }
    }

    const apiKey = await storageGet<string>(STORAGE_KEY_API_KEY)
    console.log('[vora-sw] api key present:', !!apiKey)
    if (!apiKey) {
      return { ok: false, error: 'Set your Anthropic API key in Settings to continue.' }
    }

    const ctxResult = await requestContext(tabId)
    console.log('[vora-sw] context result:', ctxResult.kind)
    if (ctxResult.kind === 'failed') {
      return { ok: false, error: 'I could not read this page. Try refreshing the tab.' }
    }

    const tabs = await collectOpenTabs()

    const { system, user } =
      ctxResult.kind === 'restricted'
        ? buildRestrictedPrompt(cmd.transcript, tabs, cmd.lastReadback)
        : buildPrompt(cmd.transcript, ctxResult.context, tabs, cmd.lastReadback)
    console.log('[vora-sw] calling Claude…')
    const raw = await callClaude({ system, user, apiKey })
    console.log('[vora-sw] Claude raw response:', raw)
    const intent = parseAction(raw)
    console.log('[vora-sw] parsed action:', intent.action.type)

    if (intent.action.type === ActionType.UNKNOWN) {
      return { ok: false, error: intent.action.reason }
    }

    if (ctxResult.kind === 'restricted') {
      // From a restricted page only DOM-free actions make sense.
      const allowed = new Set<ActionType>([
        ActionType.NAVIGATE,
        ActionType.OPEN_TAB,
        ActionType.CLOSE_TAB,
        ActionType.SWITCH_TAB,
        ActionType.REPEAT_LAST,
      ])
      if (!allowed.has(intent.action.type)) {
        return {
          ok: false,
          error:
            "I can only navigate or switch tabs from this page. Try 'go to', 'search for', or 'switch to'.",
        }
      }
      return { ok: true, intent, restricted: true }
    }

    return { ok: true, intent }
  } catch (err) {
    console.error('[vora-sw] error:', err)
    if (err instanceof AIError) return { ok: false, error: friendlyAiError(err) }
    if (err instanceof ParseError) {
      return { ok: false, error: 'I am not sure how to do that on this page.' }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Something went wrong.',
    }
  }
}

async function collectOpenTabs(): Promise<TabInfo[]> {
  try {
    const raw = await chrome.tabs.query({ currentWindow: true })
    return raw
      .filter((t) => t.id != null)
      .map((t) => ({
        id: t.id as number,
        title: t.title ?? '',
        url: t.url ?? t.pendingUrl ?? '',
        active: t.active === true,
      }))
  } catch (err) {
    console.warn('[vora-sw] failed to query tabs:', err)
    return []
  }
}

async function pickTargetTabId(
  sender: chrome.runtime.MessageSender,
): Promise<number | null> {
  if (sender.tab?.id != null) return sender.tab.id
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.id ?? null
}

async function requestContext(tabId: number): Promise<ContextResult> {
  // Bail early on restricted pages where content scripts cannot run
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  const url = tab?.url ?? ''
  if (isRestrictedUrl(url)) {
    console.warn('[vora-sw] restricted page, cannot inject:', url)
    return { kind: 'restricted' }
  }

  const send = async (): Promise<unknown> =>
    chrome.tabs.sendMessage(tabId, { type: MSG.DOM_CONTEXT_REQUEST })

  let res: unknown
  try {
    res = await send()
  } catch (err) {
    console.warn('[vora-sw] no content script on tab, attempting inject:', err)
    const injected = await tryInject(tabId)
    if (!injected) return { kind: 'failed' }
    // Poll until the content script is ready (CRXJS loader uses async import)
    res = await pollForContentScript(tabId, 20, 300)
    if (res === null) {
      console.error('[vora-sw] content script never became ready after inject')
      return { kind: 'failed' }
    }
  }

  if (
    res &&
    typeof res === 'object' &&
    'type' in res &&
    (res as { type: string }).type === MSG.DOM_CONTEXT_RESPONSE
  ) {
    return { kind: 'ok', context: (res as unknown as { payload: PageContext }).payload }
  }
  console.warn('[vora-sw] unexpected response shape:', res)
  return { kind: 'failed' }
}

async function pollForContentScript(
  tabId: number,
  attempts: number,
  intervalMs: number,
): Promise<unknown | null> {
  console.log(`[vora-sw] polling for content script (${attempts} attempts x ${intervalMs}ms)`)
  for (let i = 0; i < attempts; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs))
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: MSG.DOM_CONTEXT_REQUEST })
      console.log(`[vora-sw] content script responded on attempt ${i + 1}`)
      return res
    } catch (err) {
      console.log(`[vora-sw] poll attempt ${i + 1}/${attempts} failed:`, (err as Error).message)
    }
  }
  console.error('[vora-sw] content script never responded after all poll attempts')
  return null
}

async function tryInject(tabId: number): Promise<boolean> {
  const manifest = chrome.runtime.getManifest()
  const files = manifest.content_scripts?.[0]?.js
  if (!files || files.length === 0) {
    console.error('[vora-sw] no content_scripts.js declared in manifest')
    return false
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files })
    console.log('[vora-sw] injected content script into tab', tabId, files)
    return true
  } catch (err) {
    console.error('[vora-sw] could not inject content script:', err)
    return false
  }
}

function friendlyAiError(err: AIError): string {
  switch (err.kind) {
    case 'timeout':
      return 'That took too long. Please try again.'
    case 'network':
      return 'I cannot reach the AI right now. Check your connection.'
    case 'no-key':
      return 'Set your Anthropic API key in Settings to continue.'
    case 'empty':
      return 'I am not sure how to do that on this page.'
    case 'api':
      return 'The AI returned an error. Check your API key.'
  }
}
