// Hand-rolled ICS/VCALENDAR builder (RFC 5545) — small enough to not need a
// dependency. Only milestones/plans/goals/dateNights with a date are
// included, no holidays (those aren't "our" events).
const { zonedTimeToUtc } = require('./timezone')

function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function icsStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

// Mirrors src/lib/milestones.js's recurrenceTypeOf — older docs only ever
// had the boolean `recurring` (yearly-or-not); Date Nights use the richer
// `recurrenceType` field, so this maps a doc missing it back to the
// equivalent type.
function recurrenceTypeOf(item) {
  if (item.recurrenceType) return item.recurrenceType
  return item.recurring === false ? 'none' : 'yearly'
}

function rruleFor(recurrenceType) {
  if (recurrenceType === 'weekly') return 'RRULE:FREQ=WEEKLY'
  if (recurrenceType === 'biweekly') return 'RRULE:FREQ=WEEKLY;INTERVAL=2'
  if (recurrenceType === 'monthly') return 'RRULE:FREQ=MONTHLY'
  if (recurrenceType === 'yearly') return 'RRULE:FREQ=YEARLY'
  return null
}

function eventBlock(item) {
  const lines = ['BEGIN:VEVENT', `UID:${item.id}@youaremyhome`, `DTSTAMP:${icsStamp(new Date())}`]

  if (item.time && item.timezone) {
    // A Date Night with a specific time — real UTC instant, not an all-day value.
    lines.push(`DTSTART:${icsStamp(zonedTimeToUtc(item.date, item.time, item.timezone))}`)
  } else {
    lines.push(`DTSTART;VALUE=DATE:${item.date.replace(/-/g, '')}`)
  }

  lines.push(`SUMMARY:${escapeText(item.title)}`)
  if (item.notes) lines.push(`DESCRIPTION:${escapeText(item.notes)}`)
  const rrule = rruleFor(recurrenceTypeOf(item))
  if (rrule) lines.push(rrule)
  lines.push('END:VEVENT')
  return lines
}

exports.buildIcsFeed = function buildIcsFeed(items) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//You Are My Home//Calendar//EN', 'CALSCALE:GREGORIAN']
  for (const item of items) {
    if (!item.date) continue
    lines.push(...eventBlock(item))
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
