import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../../src/ai/promptBuilder'
import { parseAction } from '../../src/ai/actionParser'
import type { PageContext } from '../../src/types/dom'
import { ActionType } from '../../src/types/actions'

const context: PageContext = {
  url: 'https://example.com',
  title: 'Test',
  elements: [
    {
      selector: '#go',
      role: 'button',
      label: 'Open settings',
      tag: 'button',
      visible: true,
    },
  ],
  headings: [],
  visibleText: '',
}

describe('command flow (integration)', () => {
  it('full pipeline: build prompt, mock Claude response, parse to action', () => {
    const { user } = buildPrompt('open settings', context, [])
    expect(user).toContain('#go')

    const fakeClaude = JSON.stringify({
      action: { type: 'CLICK_ELEMENT', selector: '#go', label: 'Open settings' },
      readback: 'Opened settings.',
    })
    const intent = parseAction(fakeClaude)
    expect(intent.action.type).toBe(ActionType.CLICK_ELEMENT)
    expect(intent.confirmationText).toBeUndefined()
    expect(intent.readbackText).toBe('Opened settings.')
  })

  it('destructive submit triggers confirmation in the parsed intent', () => {
    const fakeClaude = JSON.stringify({
      action: { type: 'SUBMIT_FORM', selector: 'form', label: 'feedback form' },
      readback: 'Submitted feedback form.',
    })
    const intent = parseAction(fakeClaude)
    expect(intent.confirmationText).toBeDefined()
    expect(intent.confirmationText).toMatch(/feedback form/)
  })

  it('parser blocks filling password fields by returning UNKNOWN', () => {
    const fakeClaude = JSON.stringify({
      action: {
        type: 'FILL_INPUT',
        selector: '#pw',
        value: 'secret',
        label: 'Password',
      },
      readback: 'Filled password.',
    })
    const intent = parseAction(fakeClaude)
    expect(intent.action.type).toBe(ActionType.UNKNOWN)
  })
})
