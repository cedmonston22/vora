import type { PageContext, DOMElement, DOMElementRole } from '../types/dom'
import {
  MAX_ELEMENTS,
  MAX_VISIBLE_TEXT_CHARS,
  SENSITIVE_FIELD_LABELS,
} from '../utils/constants'
import { getUniqueSelector, normalizeText, truncate } from '../utils/helpers'

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type=hidden])',
  'textarea',
  'select',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="checkbox"]',
  '[contenteditable="true"]',
].join(',')

export function readPageContext(): PageContext {
  const candidates = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR))
  const elements: DOMElement[] = []

  for (const el of candidates) {
    if (elements.length >= MAX_ELEMENTS) break
    if (!isVisible(el)) continue
    const role = inferRole(el)
    const label = inferLabel(el)
    if (!label && role !== 'input' && role !== 'textarea') continue

    elements.push({
      selector: getUniqueSelector(el),
      role,
      label: truncate(normalizeText(label), 120),
      tag: el.tagName.toLowerCase(),
      type: getInputType(el),
      value: getSafeValue(el),
      href: getHref(el),
      disabled: isDisabled(el),
      visible: true,
    })
  }

  return {
    url: location.href,
    title: document.title,
    elements,
    headings: extractHeadings(),
    visibleText: extractVisibleText(),
  }
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return false
  const style = getComputedStyle(el)
  if (style.display === 'none') return false
  if (style.visibility === 'hidden') return false
  if (style.opacity === '0') return false
  return true
}

function inferRole(el: Element): DOMElementRole {
  const tag = el.tagName.toLowerCase()
  const explicit = el.getAttribute('role')
  if (explicit === 'button' || tag === 'button') return 'button'
  if (explicit === 'link' || tag === 'a') return 'link'
  if (tag === 'textarea') return 'textarea'
  if (tag === 'select') return 'select'
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type.toLowerCase()
    if (type === 'submit' || type === 'button' || type === 'reset') return 'button'
    return 'input'
  }
  if (/^h[1-6]$/.test(tag)) return 'heading'
  if (tag === 'img') return 'image'
  if (tag === 'form') return 'form'
  return 'other'
}

function inferLabel(el: Element): string {
  const aria = el.getAttribute('aria-label')
  if (aria) return aria
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const ref = document.getElementById(labelledBy)
    if (ref) return (ref.textContent ?? '').trim()
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.placeholder) return el.placeholder
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      if (lbl) return (lbl.textContent ?? '').trim()
    }
    if (el.name) return el.name
  }
  if (el instanceof HTMLAnchorElement) {
    const t = (el.textContent ?? '').trim()
    if (t) return t
  }
  if (el instanceof HTMLButtonElement) {
    const t = (el.textContent ?? '').trim()
    if (t) return t
  }
  const text = (el.textContent ?? '').trim()
  if (text) return truncate(text, 120)
  return el.getAttribute('title') ?? el.getAttribute('alt') ?? ''
}

function getInputType(el: Element): string | undefined {
  if (el instanceof HTMLInputElement) return el.type
  return undefined
}

function getSafeValue(el: Element): string | undefined {
  if (el instanceof HTMLInputElement) {
    const t = el.type.toLowerCase()
    if (t === 'password') return undefined
    const labelLower = inferLabel(el).toLowerCase()
    if (SENSITIVE_FIELD_LABELS.some((kw) => labelLower.includes(kw))) return undefined
    if (!el.value) return undefined
    return truncate(el.value, 80)
  }
  if (el instanceof HTMLTextAreaElement) {
    return el.value ? truncate(el.value, 80) : undefined
  }
  return undefined
}

function getHref(el: Element): string | undefined {
  if (el instanceof HTMLAnchorElement && el.href) return el.href
  return undefined
}

function isDisabled(el: Element): boolean {
  if (
    el instanceof HTMLButtonElement ||
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  ) {
    return el.disabled
  }
  return el.getAttribute('aria-disabled') === 'true'
}

function extractHeadings(): string[] {
  const out: string[] = []
  const headings = document.querySelectorAll('h1, h2, h3')
  for (const h of headings) {
    const t = normalizeText(h.textContent ?? '')
    if (t) out.push(truncate(t, 120))
    if (out.length >= 12) break
  }
  return out
}

function extractVisibleText(): string {
  const body = document.body
  if (!body) return ''
  const raw = (body as HTMLElement).innerText || body.textContent || ''
  const cleaned = raw.replace(/\s+/g, ' ').trim()
  return truncate(cleaned, MAX_VISIBLE_TEXT_CHARS)
}
