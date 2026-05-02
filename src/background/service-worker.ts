import type { PageContext } from '../types/dom'
import type {
  ExtensionMessage,
  VoiceCommand,
  ParsedIntent,
} from '../types/commands'
import { MSG } from '../types/commands'
import { ActionType } from '../types/actions'
import { buildPrompt } from '../ai/promptBuilder'
import { callClaude, AIError } from '../ai/claudeClient'
import { parseAction, ParseError } from '../ai/actionParser'
import { storageGet } from '../utils/helpers'
import { STORAGE_KEY_API_KEY } from '../utils/constants'

type ServiceResult =
  | { ok: true; intent: ParsedIntent }
  | { ok: false; error: string }

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type !== MSG.VOICE_COMMAND_RECEIVED) return false
  void handleVoiceCommand(message.payload, sender).then(sendResponse)
  return true
})

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

    const context = await requestContext(tabId)
    console.log('[vora-sw] page context elements:', context?.elements.length)
    if (!context) {
      return { ok: false, error: 'I could not read this page. Try refreshing the tab.' }
    }

    const { system, user } = buildPrompt(cmd.transcript, context)
    console.log('[vora-sw] calling Claude…')
    const raw = await callClaude({ system, user, apiKey })
    console.log('[vora-sw] Claude raw response:', raw)
    const intent = parseAction(raw)
    console.log('[vora-sw] parsed action:', intent.action.type)

    if (intent.action.type === ActionType.UNKNOWN) {
      return { ok: false, error: intent.action.reason }
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

async function pickTargetTabId(
  sender: chrome.runtime.MessageSender,
): Promise<number | null> {
  if (sender.tab?.id != null) return sender.tab.id
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.id ?? null
}

async function requestContext(tabId: number): Promise<PageContext | null> {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: MSG.DOM_CONTEXT_REQUEST })
    if (
      res &&
      typeof res === 'object' &&
      'type' in res &&
      (res as { type: string }).type === MSG.DOM_CONTEXT_RESPONSE
    ) {
      return (res as { payload: PageContext }).payload
    }
    return null
  } catch {
    return null
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
