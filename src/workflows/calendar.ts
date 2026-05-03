import type { Workflow } from './types'
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
  // "30 minutes", "thirty minutes", "1 hour", "an hour", "two hours",
  // "1.5 hours", "ninety minutes"
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

export const CALENDAR_EVENT_WORKFLOW: Workflow = {
  id: 'calendar-event',
  label: 'New calendar event',
  triggers: [
    /\b(create|schedule|add|make|new|book|set\s+up)\s+(a\s+|an\s+)?(calendar\s+)?(event|meeting|appointment|reminder)\b/i,
    /\b(add|put)\s+(\w+\s+){0,3}(to\s+my|on\s+my|in\s+my)\s+calendar\b/i,
    /\bnew\s+calendar\s+event\b/i,
  ],
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
      prompt: "What day is the event? You can say things like 'tomorrow', 'Friday', or 'December 5th'.",
      parse: (s) => {
        const d = parseDate(s)
        return d ? JSON.stringify(d) : null
      },
      onParseFail:
        "I didn't catch the date. Try a phrase like 'tomorrow', 'next Monday', or 'December 5th'.",
    },
    {
      id: 'time',
      prompt: "What time? For example, '3pm' or 'noon'.",
      parse: (s) => {
        const t = parseTime(s)
        return t ? JSON.stringify(t) : null
      },
      onParseFail: "I didn't catch the time. Try a phrase like '3pm' or '10:30am'.",
    },
    {
      id: 'duration',
      prompt:
        "How long is the event? You can say something like '30 minutes' or '1 hour', or say 'skip' for the default of one hour.",
      parse: (s) => {
        const n = parseDurationMinutes(s)
        return n != null ? String(n) : null
      },
      onParseFail:
        "I didn't catch the duration. Try '30 minutes' or '1 hour', or say 'skip' for one hour.",
      skippable: true,
    },
  ],
  buildPlan: (v) => {
    const title = v.title ?? 'Untitled event'
    const date = JSON.parse(v.date) as { year: number; month: number; day: number }
    const time = JSON.parse(v.time) as { hour: number; minute: number }
    const duration = v.duration ? parseInt(v.duration, 10) : DEFAULT_DURATION_MINUTES
    const range = formatCalendarRange(date, time, duration)
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: range,
    })
    const url = `https://calendar.google.com/calendar/render?${params.toString()}`
    const dateLabel = formatDateReadback(date)
    const timeLabel = formatTimeReadback(time)
    const summary = `I'll open Google Calendar to create "${title}" on ${dateLabel} at ${timeLabel} for ${duration} minutes. You can review and save it. Continue?`
    return { summary, url }
  },
}
