// Hand-rolled ICS/VCALENDAR builder (RFC 5545) — small enough to not need a
// dependency. Only milestones/plans/goals with a date are included, no
// holidays (those aren't "our" events).

function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function dateStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function eventBlock(item) {
  const dateValue = item.date.replace(/-/g, '')
  const lines = [
    'BEGIN:VEVENT',
    `UID:${item.id}@youaremyhome`,
    `DTSTAMP:${dateStamp(new Date())}`,
    `DTSTART;VALUE=DATE:${dateValue}`,
    `SUMMARY:${escapeText(item.title)}`,
  ]
  if (item.notes) lines.push(`DESCRIPTION:${escapeText(item.notes)}`)
  if (item.recurring !== false) lines.push('RRULE:FREQ=YEARLY')
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
