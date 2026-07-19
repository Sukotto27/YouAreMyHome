export const CATEGORIES = ['milestone', 'plan', 'goal']

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// Returns null for undated items (Plans/Goals can be undated "someday"
// entries) — callers must check for null before using the result.
export function nextOccurrence(milestone, now = new Date()) {
  if (!milestone.date) return null

  const [year, month, day] = milestone.date.split('-').map(Number)
  const original = new Date(year, month - 1, day)
  const today = startOfDay(now)

  if (milestone.recurring === false) {
    const daysUntil = Math.round((original - today) / 86400000)
    return { next: original, daysUntil, yearsSince: 0, original }
  }

  let next = new Date(now.getFullYear(), month - 1, day)
  if (next < today) {
    next = new Date(now.getFullYear() + 1, month - 1, day)
  }
  const daysUntil = Math.round((next - today) / 86400000)
  const yearsSince = next.getFullYear() - original.getFullYear()
  return { next, daysUntil, yearsSince, original }
}
