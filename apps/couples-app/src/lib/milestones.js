export const CATEGORIES = ['milestone', 'plan', 'goal', 'dateNight']
export const RECURRENCE_TYPES = ['none', 'weekly', 'biweekly', 'monthly', 'yearly']

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// Older docs only ever had the boolean `recurring` (yearly-or-not); Date
// Nights need weekly/biweekly/monthly too, so `recurrenceType` is the richer
// field going forward — this maps a doc missing it back to the equivalent
// recurrenceType so both shapes work everywhere without a data migration.
export function recurrenceTypeOf(item) {
  if (item.recurrenceType) return item.recurrenceType
  return item.recurring === false ? 'none' : 'yearly'
}

// Returns null for undated items (Plans/Goals can be undated "someday"
// entries) — callers must check for null before using the result.
export function nextOccurrence(item, now = new Date()) {
  if (!item.date) return null

  const [year, month, day] = item.date.split('-').map(Number)
  const original = new Date(year, month - 1, day)
  const today = startOfDay(now)
  const recurrenceType = recurrenceTypeOf(item)

  if (recurrenceType === 'none') {
    const daysUntil = Math.round((original - today) / 86400000)
    return { next: original, daysUntil, yearsSince: 0, original }
  }

  if (recurrenceType === 'yearly') {
    let next = new Date(now.getFullYear(), month - 1, day)
    if (next < today) next = new Date(now.getFullYear() + 1, month - 1, day)
    const daysUntil = Math.round((next - today) / 86400000)
    const yearsSince = next.getFullYear() - original.getFullYear()
    return { next, daysUntil, yearsSince, original }
  }

  let next = new Date(original)
  if (recurrenceType === 'weekly' || recurrenceType === 'biweekly') {
    const stepDays = recurrenceType === 'weekly' ? 7 : 14
    if (next < today) {
      const steps = Math.ceil((today - next) / (stepDays * 86400000))
      next = new Date(next.getTime() + steps * stepDays * 86400000)
    }
  } else if (recurrenceType === 'monthly') {
    while (next < today) {
      next = new Date(next.getFullYear(), next.getMonth() + 1, next.getDate())
    }
  }
  const daysUntil = Math.round((next - today) / 86400000)
  return { next, daysUntil, yearsSince: 0, original }
}
