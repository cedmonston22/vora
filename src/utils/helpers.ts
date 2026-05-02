import { DESTRUCTIVE_KEYWORDS, SENSITIVE_FIELD_LABELS, WAKE_WORDS } from './constants'

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

/**
 * Checks whether a transcript begins with a wake word and returns the rest of the
 * command. Returns null if no wake word is present, '' if only the wake word was said.
 *
 * Matches in two passes:
 *   1. exact match against the alias list in WAKE_WORDS
 *   2. fuzzy match: the first word of the transcript is within edit distance 1
 *      of "vora", so common mishearings like "vore", "bora", "nora", "ora",
 *      "voraa" all pass.
 */
export function stripWakeWord(
  transcript: string,
  extraAliases?: readonly string[],
): string | null {
  const trimmed = transcript.trim()
  const lower = trimmed.toLowerCase()
  const aliases = extraAliases && extraAliases.length > 0
    ? [...WAKE_WORDS, ...extraAliases].sort((a, b) => b.length - a.length)
    : WAKE_WORDS

  // Pass 1: exact alias match.
  for (const w of aliases) {
    if (lower === w) return ''
    if (
      lower.startsWith(w + ' ') ||
      lower.startsWith(w + ',') ||
      lower.startsWith(w + '.') ||
      lower.startsWith(w + '!') ||
      lower.startsWith(w + '?')
    ) {
      return trimmed.slice(w.length).replace(/^[\s,.:;!?\-]+/, '').trim()
    }
  }

  // Pass 2: fuzzy match the first word against "vora" within edit distance 1.
  const firstSpace = lower.search(/\s/)
  const firstWord = firstSpace === -1 ? lower : lower.slice(0, firstSpace)
  // Strip trailing punctuation from the first word.
  const cleanFirst = firstWord.replace(/[,.:;!?\-]+$/, '')
  if (cleanFirst.length >= 3 && cleanFirst.length <= 6) {
    if (editDistance(cleanFirst, 'vora') <= 1) {
      const rest = firstSpace === -1
        ? ''
        : trimmed.slice(firstSpace).replace(/^[\s,.:;!?\-]+/, '').trim()
      return rest
    }
  }

  return null
}

export function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1
      const left = curr[j - 1]
      const up = prev[j]
      const diag = prev[j - 1]
      if (left === undefined || up === undefined || diag === undefined) continue
      curr[j] = Math.min(left + 1, up + 1, diag + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n] ?? 0
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
