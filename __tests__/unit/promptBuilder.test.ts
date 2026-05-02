import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../../src/ai/promptBuilder'
import type { PageContext } from '../../src/types/dom'

const mockContext: PageContext = {
  url: 'https://example.com',
  title: 'Example Page',
  elements: [
    {
      selector: 'input#search',
      role: 'input',
      label: 'Search',
      tag: 'input',
      type: 'text',
      visible: true,
    },
    {
      selector: 'button#submit',
      role: 'button',
      label: 'Submit',
      tag: 'button',
      visible: true,
    },
  ],
  headings: ['Welcome to Example'],
  visibleText: 'This is the page content.',
}

describe('promptBuilder', () => {
  it('includes the user transcript in the user message', () => {
    const { user } = buildPrompt('click submit', mockContext)
    expect(user).toContain('click submit')
  })

  it('includes the page title and URL', () => {
    const { user } = buildPrompt('test', mockContext)
    expect(user).toContain('Example Page')
    expect(user).toContain('https://example.com')
  })

  it('includes element selectors and labels', () => {
    const { user } = buildPrompt('test', mockContext)
    expect(user).toContain('input#search')
    expect(user).toContain('Search')
    expect(user).toContain('button#submit')
    expect(user).toContain('Submit')
  })

  it('includes headings', () => {
    const { user } = buildPrompt('test', mockContext)
    expect(user).toContain('Welcome to Example')
  })

  it('includes visible text excerpt', () => {
    const { user } = buildPrompt('test', mockContext)
    expect(user).toContain('This is the page content.')
  })

  it('system prompt mentions all new action types', () => {
    const { system } = buildPrompt('test', mockContext)
    expect(system).toContain('SELECT_OPTION')
    expect(system).toContain('PRESS_KEY')
    expect(system).toContain('CLEAR_INPUT')
  })

  it('system prompt includes the example', () => {
    const { system } = buildPrompt('test', mockContext)
    expect(system).toContain('climate change')
  })

  it('omits headings block when there are no headings', () => {
    const ctx = { ...mockContext, headings: [] }
    const { user } = buildPrompt('test', ctx)
    expect(user).not.toContain('Headings:')
  })

  it('truncates visible text to max length', () => {
    const longText = 'a'.repeat(5000)
    const ctx = { ...mockContext, visibleText: longText }
    const { user } = buildPrompt('test', ctx)
    // Should be truncated — user message should not contain 5000 a's
    expect(user.length).toBeLessThan(10000)
  })

  it('includes lastReadback in the user prompt when provided', () => {
    const { user } = buildPrompt('repeat that', ctx, 'I clicked the Submit button.')
    expect(user).toContain('Last Vora readback: "I clicked the Submit button."')
  })

  it('omits the lastReadback block when not provided', () => {
    const { user } = buildPrompt('click submit', ctx)
    expect(user).not.toContain('Last Vora readback')
  })

  it('includes REPEAT_LAST in the system prompt schema', () => {
    const { system } = buildPrompt('x', ctx)
    expect(system).toContain('REPEAT_LAST')
  })
})
