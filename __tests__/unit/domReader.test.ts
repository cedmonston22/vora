import { describe, it, expect, beforeEach } from 'vitest'
import { readPageContext } from '../../src/content/domReader'

describe('readPageContext', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.title = 'Test page'
    Element.prototype.getBoundingClientRect = function (): DOMRect {
      return {
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        top: 0,
        left: 0,
        right: 100,
        bottom: 20,
        toJSON: () => ({}),
      } as DOMRect
    }
    // jsdom 24 does not implement CSS.escape — polyfill for tests.
    const g = globalThis as { CSS?: { escape?: (s: string) => string } }
    if (!g.CSS) g.CSS = {}
    if (!g.CSS.escape) g.CSS.escape = (s: string): string => s.replace(/(["\\])/g, '\\$1')
  })

  it('extracts buttons with their text label', () => {
    document.body.innerHTML = '<button>Click me</button>'
    const ctx = readPageContext()
    expect(
      ctx.elements.some((e) => e.label === 'Click me' && e.role === 'button'),
    ).toBe(true)
  })

  it('uses aria-label when present', () => {
    document.body.innerHTML = '<button aria-label="Send message">▶</button>'
    const ctx = readPageContext()
    expect(ctx.elements.some((e) => e.label === 'Send message')).toBe(true)
  })

  it('omits values from password inputs', () => {
    document.body.innerHTML =
      '<input type="password" value="secret" id="p" /><input type="text" placeholder="email" />'
    const ctx = readPageContext()
    const passwords = ctx.elements.filter((e) => e.type === 'password')
    expect(passwords.every((e) => e.value === undefined)).toBe(true)
  })

  it('truncates visible text to MAX_VISIBLE_TEXT_CHARS', () => {
    document.body.innerHTML = '<p>' + 'word '.repeat(1000) + '</p>'
    const ctx = readPageContext()
    expect(ctx.visibleText.length).toBeLessThanOrEqual(2000)
  })

  it('captures h1-h3 as headings, skipping h4 and below', () => {
    document.body.innerHTML =
      '<h1>Top</h1><h2>Mid</h2><h3>Sub</h3><h4>Skip</h4>'
    const ctx = readPageContext()
    expect(ctx.headings).toContain('Top')
    expect(ctx.headings).toContain('Mid')
    expect(ctx.headings).toContain('Sub')
    expect(ctx.headings.includes('Skip')).toBe(false)
  })

  it('returns the page URL and title in PageContext', () => {
    document.body.innerHTML = '<button>Click</button>'
    const ctx = readPageContext()
    expect(ctx.title).toBe('Test page')
    expect(typeof ctx.url).toBe('string')
  })
})
