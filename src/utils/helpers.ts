import { DESTRUCTIVE_KEYWORDS, SENSITIVE_FIELD_LABELS } from './constants'

/** Returns true if an element label contains a destructive keyword */
export function isDestructiveLabel(label: string): boolean {
  const lower = label.toLowerCase()
  return DESTRUCTIVE_KEYWORDS.some((kw) => lower.includes(kw))
}

/** Returns true if a field label is sensitive and must never be filled */
export function isSensitiveField(label: string): boolean {
  const lower = label.toLowerCase()
  return SENSITIVE_FIELD_LABELS.some((kw) => lower.includes(kw))
}

/** Truncates text to maxLength, appending ellipsis if cut */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + '…'
}

/** Strips extra whitespace and trims a string */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Generates a unique CSS selector for a DOM element */
export function getUniqueSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`

  const parts: string[] = []
  let current: Element | null = el

  while (current && current !== document.body) {
    const tag = current.tagName.toLowerCase()
    const parentEl: Element | null = current.parentElement
    if (!parentEl) break

    const siblings = Array.from(parentEl.children).filter(
      (c) => c.tagName === current!.tagName
    )
    const index = siblings.indexOf(current) + 1
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag)
    current = parentEl
  }

  return parts.join(' > ')
}

/** Wraps chrome.storage.local.get in a Promise */
export function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] as T | undefined)
    })
  })
}

/** Wraps chrome.storage.local.set in a Promise */
export function storageSet(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve)
  })
}
