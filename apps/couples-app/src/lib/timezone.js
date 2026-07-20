// Converts a wall-clock date+time as entered in a specific IANA zone into a
// real UTC instant, using the Intl-based offset trick (format the instant in
// the target zone, diff the result against itself) — works in any modern
// browser, no timezone library needed. Mirrored server-side in
// functions/lib/timezone.js for the reminder scheduler (different runtime,
// small enough that duplicating beats sharing a module across the two).
export function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  const asUtc = Date.UTC(year, month - 1, day, hour, minute)
  const offsetMinutes = timezoneOffsetMinutes(timeZone, new Date(asUtc))
  return new Date(asUtc - offsetMinutes * 60000)
}

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

// The device's own IANA zone — used as the "source" zone whenever the
// current user enters a date/time (e.g. planning a date night), since that's
// the zone they mean it in.
export function currentTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
