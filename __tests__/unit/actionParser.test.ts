import { describe, it, expect } from 'vitest'
import { parseAction } from '../../src/ai/actionParser'
import { ActionType } from '../../src/types/actions'

describe('actionParser', () => {
  it('parses CLICK_ELEMENT', () => {
    const result = parseAction(JSON.stringify({
      action: { type: 'CLICK_ELEMENT', selector: '#btn', label: 'Submit' },
      readback: 'Clicked Submit.',
    }))
    expect(result.action.type).toBe(ActionType.CLICK_ELEMENT)
    if (result.action.type === ActionType.CLICK_ELEMENT) {
      expect(result.action.selector).toBe('#btn')
      expect(result.action.label).toBe('Submit')
    }
    expect(result.readbackText).toBe('Clicked Submit.')
  })

  it('parses FILL_INPUT', () => {
    const result = parseAction(JSON.stringify({
      action: { type: 'FILL_INPUT', selector: 'input#q', value: 'hello', label: 'Search' },
      readback: 'Filled search.',
    }))
    expect(result.action.type).toBe(ActionType.FILL_INPUT)
  })

  it('parses SELECT_OPTION', () => {
    const result = parseAction(JSON.stringify({
      action: { type: 'SELECT_OPTION', selector: 'select#country', value: 'US', label: 'Country' },
      readback: 'Selected US.',
    }))
    expect(result.action.type).toBe(ActionType.SELECT_OPTION)
  })

  it('parses PRESS_KEY', () => {
    const result = parseAction(JSON.stringify({
      action: { type: 'PRESS_KEY', key: 'Enter' },
      readback: 'Pressed Enter.',
    }))
    expect(result.action.type).toBe(ActionType.PRESS_KEY)
    if (result.action.type === ActionType.PRESS_KEY) {
      expect(result.action.key).toBe('Enter')
    }
  })

  it('parses CLEAR_INPUT', () => {
    const result = parseAction(JSON.stringify({
      action: { type: 'CLEAR_INPUT', selector: 'input#q', label: 'Search' },
      readback: 'Cleared search.',
    }))
    expect(result.action.type).toBe(ActionType.CLEAR_INPUT)
  })

  it('parses SCROLL_DOWN without amount', () => {
    const result = parseAction(JSON.stringify({
      action: { type: 'SCROLL_DOWN' },
      readback: 'Scrolled down.',
    }))
    expect(result.action.type).toBe(ActionType.SCROLL_DOWN)
  })

  it('parses NAVIGATE', () => {
    const result = parseAction(JSON.stringify({
      action: { type: 'NAVIGATE', url: 'https://example.com' },
      readback: 'Going to example.com.',
    }))
    expect(result.action.type).toBe(ActionType.NAVIGATE)
  })

  it('returns UNKNOWN for invalid NAVIGATE url', () => {
    const result = parseAction(JSON.stringify({
      action: { type: 'NAVIGATE', url: 'not-a-url' },
      readback: 'Done.',
    }))
    expect(result.action.type).toBe(ActionType.UNKNOWN)
  })

  it('returns UNKNOWN on unparseable JSON', () => {
    expect(() => parseAction('not json')).toThrow()
  })

  it('returns UNKNOWN for missing selector on CLICK_ELEMENT', () => {
    const result = parseAction(JSON.stringify({
      action: { type: 'CLICK_ELEMENT', label: 'Submit' },
      readback: 'Done.',
    }))
    expect(result.action.type).toBe(ActionType.UNKNOWN)
  })

  it('returns UNKNOWN for sensitive field', () => {
    const result = parseAction(JSON.stringify({
      action: { type: 'FILL_INPUT', selector: 'input#pw', value: 'secret', label: 'password' },
      readback: 'Done.',
    }))
    expect(result.action.type).toBe(ActionType.UNKNOWN)
  })

  it('sets confirmationText for SUBMIT_FORM', () => {
    const result = parseAction(JSON.stringify({
      action: { type: 'SUBMIT_FORM', selector: 'form', label: 'contact form' },
      readback: 'Submitted.',
    }))
    expect(result.confirmationText).toBeTruthy()
    expect(result.confirmationText).toContain('contact form')
  })

  it('sets confirmationText for destructive CLICK_ELEMENT label', () => {
    const result = parseAction(JSON.stringify({
      action: { type: 'CLICK_ELEMENT', selector: '#del', label: 'Delete account' },
      readback: 'Deleted.',
    }))
    expect(result.confirmationText).toBeTruthy()
  })

  it('strips code fences from response', () => {
    const result = parseAction('```json\n{"action":{"type":"SCROLL_DOWN"},"readback":"Scrolled."}\n```')
    expect(result.action.type).toBe(ActionType.SCROLL_DOWN)
  })

  it('falls back to Done. when readback is missing', () => {
    const result = parseAction(JSON.stringify({
      action: { type: 'SCROLL_DOWN' },
    }))
    expect(result.readbackText).toBe('Done.')
  })

  it('parses REPEAT_LAST with a message', () => {
    const json = JSON.stringify({
      action: { type: 'REPEAT_LAST', message: 'I clicked the Submit button.' },
      readback: 'Repeating last message.',
    })
    const intent = parseAction(json)
    expect(intent.action.type).toBe(ActionType.REPEAT_LAST)
    if (intent.action.type === ActionType.REPEAT_LAST) {
      expect(intent.action.message).toBe('I clicked the Submit button.')
    }
    expect(intent.confirmationText).toBeUndefined()
  })

  it('parses REPEAT_LAST with an empty message gracefully', () => {
    const json = JSON.stringify({
      action: { type: 'REPEAT_LAST', message: '' },
      readback: 'Repeating.',
    })
    const intent = parseAction(json)
    expect(intent.action.type).toBe(ActionType.REPEAT_LAST)
    if (intent.action.type === ActionType.REPEAT_LAST) {
      expect(intent.action.message).toBe('')
    }
  })
})
