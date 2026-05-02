import { describe, it, expect } from 'vitest'
import { parseAction, ParseError } from '../../src/ai/actionParser'
import { ActionType } from '../../src/types/actions'

describe('parseAction', () => {
  it('parses a valid CLICK_ELEMENT into a ParsedIntent', () => {
    const json = JSON.stringify({
      action: { type: 'CLICK_ELEMENT', selector: '#go', label: 'Open settings' },
      readback: 'Opened settings.',
    })
    const intent = parseAction(json)
    expect(intent.action.type).toBe(ActionType.CLICK_ELEMENT)
    expect(intent.readbackText).toBe('Opened settings.')
    expect(intent.confirmationText).toBeUndefined()
  })

  it('marks SUBMIT_FORM as needing confirmation', () => {
    const json = JSON.stringify({
      action: { type: 'SUBMIT_FORM', selector: 'form#f1', label: 'contact form' },
      readback: 'Submitted contact form.',
    })
    const intent = parseAction(json)
    expect(intent.confirmationText).toBeDefined()
    expect(intent.confirmationText).toMatch(/contact form/i)
    expect(intent.confirmationText).toMatch(/yes/i)
  })

  it('marks click on a destructive label as needing confirmation', () => {
    const json = JSON.stringify({
      action: { type: 'CLICK_ELEMENT', selector: '.del', label: 'Delete email' },
      readback: 'Deleted the email.',
    })
    const intent = parseAction(json)
    expect(intent.confirmationText).toBeDefined()
  })

  it('throws ParseError on unparseable JSON', () => {
    expect(() => parseAction('not json')).toThrow(ParseError)
  })

  it('strips markdown code fences before parsing', () => {
    const wrapped = '```json\n{"action":{"type":"SCROLL_DOWN"},"readback":"Scrolled down."}\n```'
    const intent = parseAction(wrapped)
    expect(intent.action.type).toBe(ActionType.SCROLL_DOWN)
  })

  it('coerces unknown action types to UNKNOWN', () => {
    const json = JSON.stringify({
      action: { type: 'TELEPORT' },
      readback: 'Teleporting.',
    })
    const intent = parseAction(json)
    expect(intent.action.type).toBe(ActionType.UNKNOWN)
  })

  it('returns UNKNOWN when fill targets a sensitive field', () => {
    const json = JSON.stringify({
      action: { type: 'FILL_INPUT', selector: '#pw', value: '123', label: 'Password' },
      readback: 'Filled password.',
    })
    const intent = parseAction(json)
    expect(intent.action.type).toBe(ActionType.UNKNOWN)
  })

  it('rejects NAVIGATE with an invalid URL', () => {
    const json = JSON.stringify({
      action: { type: 'NAVIGATE', url: 'not a url' },
      readback: 'Navigating.',
    })
    const intent = parseAction(json)
    expect(intent.action.type).toBe(ActionType.UNKNOWN)
  })

  it('uses a default readback when none is provided', () => {
    const json = JSON.stringify({ action: { type: 'SCROLL_DOWN' } })
    const intent = parseAction(json)
    expect(intent.readbackText.length).toBeGreaterThan(0)
  })
})
