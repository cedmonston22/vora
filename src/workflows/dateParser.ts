// Lightweight natural-language date/time parsing for the Calendar workflow.
//
// Input is whatever the user spoke for the date or time slot. Output is a
// normalized form: parseDate -> { year, month, day }, parseTime -> { hour,
// minute }. Both return null if no recognizable pattern is found, which
// triggers a re-prompt rather than guessing.

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

const WEEKDAYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
]

export type ParsedDate = { year: number; month: number; day: number }
export type ParsedTime = { hour: number; minute: number }

function clean(s: string): string {
  return s.toLowerCase().replace(/[,.!?]+$/g, '').replace(/\s+/g, ' ').trim()
}

export function parseDate(raw: string, now: Date = new Date()): ParsedDate | null {
  const text = clean(raw)
  if (!text) return null

  const today = startOfDay(now)

  if (text === 'today' || text === 'tonight') return toParts(today)
  if (text === 'tomorrow') return toParts(addDays(today, 1))
  if (text === 'day after tomorrow' || text === 'the day after tomorrow') {
    return toParts(addDays(today, 2))
  }

  // "next monday", "this friday", "monday"
  const wd = matchWeekday(text)
  if (wd != null) {
    const wantNext = /^next\s+/.test(text)
    const wantThis = /^this\s+/.test(text)
    let delta = (wd - today.getDay() + 7) % 7
    if (delta === 0) delta = wantThis ? 0 : 7
    if (wantNext && delta < 7) delta += 7
    return toParts(addDays(today, delta || 7))
  }

  // "in 3 days", "in two weeks"
  const inMatch = /^in\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(day|days|week|weeks)\b/.exec(text)
  if (inMatch) {
    const n = wordToNumber(inMatch[1])
    const unit = inMatch[2]
    if (n != null) {
      const days = unit.startsWith('week') ? n * 7 : n
      return toParts(addDays(today, days))
    }
  }

  // "december 5", "december fifth", "december 5th 2026"
  const monthMatch = /\b([a-z]+)\s+(\d{1,2}|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty[-\s]?first|twenty[-\s]?second|twenty[-\s]?third|twenty[-\s]?fourth|twenty[-\s]?fifth|twenty[-\s]?sixth|twenty[-\s]?seventh|twenty[-\s]?eighth|twenty[-\s]?ninth|thirtieth|thirty[-\s]?first)(?:st|nd|rd|th)?(?:[\s,]+(\d{4}))?/.exec(text)
  if (monthMatch) {
    const monthIdx = MONTHS.indexOf(monthMatch[1])
    if (monthIdx >= 0) {
      const day = ordinalToNumber(monthMatch[2])
      if (day != null && day >= 1 && day <= 31) {
        let year = monthMatch[3] ? parseInt(monthMatch[3], 10) : today.getFullYear()
        const candidate = new Date(year, monthIdx, day)
        // If no explicit year and the date already passed this year, roll over.
        if (!monthMatch[3] && candidate.getTime() < today.getTime()) {
          year += 1
        }
        return { year, month: monthIdx + 1, day }
      }
    }
  }

  // "12/5", "12-5", "12/5/2026"
  const numericMatch = /^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/.exec(text)
  if (numericMatch) {
    const month = parseInt(numericMatch[1], 10)
    const day = parseInt(numericMatch[2], 10)
    let year = numericMatch[3] ? parseInt(numericMatch[3], 10) : today.getFullYear()
    if (year < 100) year += 2000
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const candidate = new Date(year, month - 1, day)
      if (!numericMatch[3] && candidate.getTime() < today.getTime()) {
        year += 1
      }
      return { year, month, day }
    }
  }

  return null
}

export function parseTime(raw: string): ParsedTime | null {
  const text = clean(raw)
  if (!text) return null

  if (text === 'noon' || text === 'midday') return { hour: 12, minute: 0 }
  if (text === 'midnight') return { hour: 0, minute: 0 }

  // "3pm", "3 pm", "3:30pm", "3:30 p.m.", "15:00", "0900"
  const m = /(?:^|\s|at\s)(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/.exec(text)
  if (m) {
    let hour = parseInt(m[1], 10)
    const minute = m[2] ? parseInt(m[2], 10) : 0
    const ampm = m[3]?.replace(/\./g, '').toLowerCase()
    if (ampm === 'pm' && hour < 12) hour += 12
    if (ampm === 'am' && hour === 12) hour = 0
    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
      return { hour, minute }
    }
  }

  return null
}

// Format a ParsedDate + ParsedTime range for Google Calendar's TEMPLATE URL.
// Calendar expects local-time strings of the form YYYYMMDDTHHmmss/YYYYMMDDTHHmmss.
export function formatCalendarRange(
  date: ParsedDate,
  time: ParsedTime,
  durationMinutes: number,
): string {
  const start = new Date(date.year, date.month - 1, date.day, time.hour, time.minute)
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  return `${formatLocal(start)}/${formatLocal(end)}`
}

// Friendly readback of a ParsedDate, e.g. "Friday, December 5".
export function formatDateReadback(date: ParsedDate): string {
  const d = new Date(date.year, date.month - 1, date.day)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function formatTimeReadback(time: ParsedTime): string {
  const d = new Date(2000, 0, 1, time.hour, time.minute)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// --- helpers ---

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function toParts(d: Date): ParsedDate {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatLocal(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function matchWeekday(text: string): number | null {
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const w = WEEKDAYS[i]
    if (text === w || text.endsWith(' ' + w) || text.startsWith(w + ' ')) return i
  }
  return null
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10,
}

function wordToNumber(s: string): number | null {
  const n = parseInt(s, 10)
  if (!isNaN(n)) return n
  return NUMBER_WORDS[s] ?? null
}

const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16,
  seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
  thirtieth: 30,
}

function ordinalToNumber(s: string): number | null {
  const cleaned = s.replace(/[-\s]/g, '')
  const n = parseInt(cleaned, 10)
  if (!isNaN(n)) return n
  if (ORDINAL_WORDS[cleaned]) return ORDINAL_WORDS[cleaned]
  // "twenty-first" .. "thirty-first"
  const composite = /^(twenty|thirty)(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)$/.exec(cleaned)
  if (composite) {
    const tens = composite[1] === 'twenty' ? 20 : 30
    const ones = ORDINAL_WORDS[composite[2]] ?? 0
    if (ones) return tens + ones
  }
  return null
}
