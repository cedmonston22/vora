import { readPageContext } from './domReader'
import { executeAction } from './actionExecutor'
import { showOverlay, hideOverlay, setPartial, pushRecent } from './overlay'
import { MSG } from '../types/commands'
import type { ExtensionMessage } from '../types/commands'

console.log('[vora-cs] content script loaded on', location.href)

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  console.log('[vora-cs] received message:', message.type)
  switch (message.type) {
    case MSG.DOM_CONTEXT_REQUEST: {
      try {
        const context = readPageContext()
        sendResponse({ type: MSG.DOM_CONTEXT_RESPONSE, payload: context })
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'DOM read failed.',
        })
      }
      return false
    }

    case MSG.ACTION_EXECUTE: {
      void executeAction(message.payload).then((result) => {
        sendResponse({
          type: MSG.ACTION_RESULT,
          payload: { success: result.success, message: result.message },
        })
      })
      return true
    }

    case MSG.STATE_CHANGE: {
      const { state, message: msg } = message.payload
      if (state === 'IDLE') {
        hideOverlay()
      } else {
        showOverlay(state, msg)
      }
      sendResponse({ ok: true })
      return false
    }

    case MSG.TRANSCRIPT_UPDATE: {
      setPartial(message.payload.partial)
      sendResponse({ ok: true })
      return false
    }

    case MSG.HISTORY_ENTRY: {
      pushRecent(message.payload)
      sendResponse({ ok: true })
      return false
    }

    default:
      return false
  }
})
