import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../../src/ai/promptBuilder'
import type { PageContext } from '../../src/types/dom'

const ctx: PageContext = {
  url: 'https://example.com/page',
  title: 'Example',
  elements: [
    {
      selector: '#submit',
      role: 'button',
      label: 'Send',
      tag: 'button',
      visible: true,
    },
    {
      selector: 'input[name=email]',
      role: 'input',
      label: 'Email',
      tag: 'input',
      type: 'email',
      value: 'me@example.com',
      visible: true,
    },
  ],
  headings: ['Welcome', 'Contact us'],
  visibleText: 'Some short page text.',
}

describe('buildPrompt', () => {
  it('includes the user transcript verbatim', () => {
    const { user } = buildPrompt('click submit', ctx)
    expect(user).toContain('click submit')
  })

  it('includes every element selector in the user prompt', () => {
    const { user } = buildPrompt('x', ctx)
    expect(user).toContain('#submit')
    expect(user).toContain('input[name=email]')
  })

  it('includes the page title and URL', () => {
    const { user } = buildPrompt('x', ctx)
    expect(user).toContain('Example')
    expect(user).toContain('https://example.com/page')
  })

  it('includes the JSON-only output rule in the system prompt', () => {
    const { system } = buildPrompt('x', ctx)
    expect(system.toLowerCase()).toContain('json')
    expect(system).toContain('UNKNOWN')
  })

  it('forbids filling sensitive fields in the system prompt', () => {
    const { system } = buildPrompt('x', ctx)
    expect(system.toLowerCase()).toContain('password')
  })

  it('omits headings and visible text to keep the prompt small', () => {
    const { user } = buildPrompt('x', ctx)
    expect(user).not.toContain('Welcome')
    expect(user).not.toContain('Some short page text.')
  })

  it('system prompt mentions the merged action types', () => {
    const { system } = buildPrompt('test', ctx)
    expect(system).toContain('SELECT_OPTION')
    expect(system).toContain('PRESS_KEY')
    expect(system).toContain('CLEAR_INPUT')
    expect(system).toContain('REPEAT_LAST')
  })

  it('includes lastReadback in the user prompt when provided', () => {
    const { user } = buildPrompt('repeat that', ctx, 'I clicked the Submit button.')
    expect(user).toContain('Last Vora readback: "I clicked the Submit button."')
  })

  it('omits the lastReadback block when not provided', () => {
    const { user } = buildPrompt('click submit', ctx)
    expect(user).not.toContain('Last Vora readback')
  })
})
