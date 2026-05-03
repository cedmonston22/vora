import type { Workflow } from './types'
import { ActionType } from '../types/actions'
import {
  parseDate,
  parseTime,
  formatCalendarRange,
  formatDateReadback,
  formatTimeReadback,
} from './dateParser'

const DEFAULT_DURATION_MINUTES = 60

function parseDurationMinutes(raw: string): number | null {
  const t = raw.toLowerCase().trim()
  if (/^(default|standard|normal|whatever)/.test(t)) return DEFAULT_DURATION_MINUTES
  if (/^an?\s+hour\b/.test(t)) return 60
  if (/^half\s+(an?\s+)?hour\b/.test(t)) return 30
  const m = /^(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|h|m)\b/.exec(t)
  if (m) {
    const n = parseFloat(m[1])
    if (isNaN(n) || n <= 0) return null
    const unit = m[2]
    return unit.startsWith('h') ? Math.round(n * 60) : Math.round(n)
  }
  const wordMatch = /^(one|two|three|four|five|six|half|quarter)\s+(hours?|minutes?)\b/.exec(t)
  if (wordMatch) {
    const words: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
      half: 0.5, quarter: 0.25,
    }
    const n = words[wordMatch[1]]
    if (n != null) {
      return wordMatch[2].startsWith('h') ? Math.round(n * 60) : Math.round(n)
    }
  }
  return null
}

function buildEventUrl(values: Record<string, string>): string {
  const title = values.title ?? 'Untitled event'
  const date = JSON.parse(values.date) as { year: number; month: number; day: number }
  const time = JSON.parse(values.time) as { hour: number; minute: number }
  const duration = values.duration
    ? parseInt(values.duration, 10)
    : DEFAULT_DURATION_MINUTES
  const range = formatCalendarRange(date, time, duration)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: range,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// The Calendar workflow uses URL prefill instead of progressive DOM filling
// because Google Calendar's date/time pickers are custom widgets that don't
// accept plain FILL_INPUT. Slots are collected silently, then the final
// action navigates to a TEMPLATE URL with all fields pre-populated; the user
// just needs to click Save.
export const CALENDAR_EVENT_WORKFLOW: Workflow = {
  id: 'calendar-event',
  label: 'New calendar event',
  triggers: [
    /^(create|schedule|book|set\s+up|make)\s+(a\s+|an\s+)?(new\s+)?(calendar\s+)?(event|meeting|appointment)\b/i,
    /^(add|put)\s+(a\s+|an\s+)?(new\s+)?(event|meeting|appointment)\s+(to|on|in)\s+(my\s+)?calendar\b/i,
    /^new\s+(calendar\s+)?(event|meeting|appointment)\b/i,
  ],
  // No openUrl — collect everything first, then navigate at finalAction.
  slots: [
    {
      id: 'title',
      prompt: "What's the event called?",
      parse: (s) => {
        const t = s.trim().replace(/\s+/g, ' ')
        if (!t) return null
        return t.charAt(0).toUpperCase() + t.slice(1)
      },
      onParseFail: "Please tell me a title for the event.",
    },
    {
      id: 'date',
      prompt:
        "What day is the event? Say something like 'tomorrow', 'Friday', or 'December 5th'.",
      parse: (s) => {
        const d = parseDate(s)
        return d ? JSON.stringify(d) : null
      },
      onParseFail:
        "I didn't catch the date. Try 'tomorrow', 'next Monday', or 'December 5th'.",
    },
    {
      id: 'time',
      prompt: "What time? For example, '3pm' or 'noon'.",
      parse: (s) => {
        const t = parseTime(s)
        return t ? JSON.stringify(t) : null
      },
      onParseFail: "I didn't catch the time. Try '3pm' or '10:30am'.",
    },
    {
      id: 'duration',
      prompt:
        "How long is the event? Say something like '30 minutes' or '1 hour', or 'skip' for one hour.",
      parse: (s) => {
        const n = parseDurationMinutes(s)
        return n != null ? String(n) : null
      },
      onParseFail:
        "I didn't catch the duration. Try '30 minutes' or '1 hour', or say 'skip' for one hour.",
      skippable: true,
    },
  ],
  buildConfirmSummary: (v) => {
    const title = v.title ?? 'Untitled event'
    const date = JSON.parse(v.date) as { year: number; month: number; day: number }
    const time = JSON.parse(v.time) as { hour: number; minute: number }
    const duration = v.duration
      ? parseInt(v.duration, 10)
      : DEFAULT_DURATION_MINUTES
    return `Ready to create "${title}" on ${formatDateReadback(date)} at ${formatTimeReadback(time)} for ${duration} minutes. Open the calendar to save it?`
  },
  finalAction: (values) => ({
    type: ActionType.NAVIGATE,
    url: buildEventUrl(values),
  }),
  finalReadback: 'Calendar opened. Review the event and click Save.',
}
