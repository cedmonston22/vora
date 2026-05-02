import { readPageContext } from './domReader'
import { executeAction } from './actionExecutor'
import { showOverlay, hideOverlay } from './overlay'
import { MSG } from '../types/commands'
import type { ExtensionMessage } from '../types/commands'

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
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
      const state = message.payload.state
      if (state === 'IDLE') hideOverlay()
      else showOverlay(state)
      sendResponse({ ok: true })
      return false
    }

    default:
      return false
  }
})
