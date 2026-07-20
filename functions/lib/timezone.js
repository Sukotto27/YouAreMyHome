// Server-side twin of src/lib/timezone.js (different runtime/module system,
// small enough that duplicating ~20 lines beats sharing a module across the
// client bundle and the Cloud Functions codebase). Converts a wall-clock
// date+time in a specific IANA zone into a real UTC instant, using the same
// Intl-based offset trick — no timezone library needed.
function timezoneOffsetMinutes(timeZone, date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return (asIfUtc - date.getTime()) / 60000
}

function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  const asUtc = Date.UTC(year, month - 1, day, hour, minute)
  const offsetMinutes = timezoneOffsetMinutes(timeZone, new Date(asUtc))
  return new Date(asUtc - offsetMinutes * 60000)
}

module.exports = { zonedTimeToUtc }
