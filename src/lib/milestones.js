// The fixed chapters of our story. Custom milestones (birthdays, trips, etc.)
// get added on top of these from Firestore/local storage — these ones don't
// move.
export const HISTORY_MILESTONES = [
  {
    id: 'met',
    title: 'The first "hi"',
    date: '2024-01-18',
    note: 'Where it all began — a shared Facebook page for Life is Strange.',
  },
  {
    id: 'dune-line',
    title: 'The hidden message',
    date: '2024-03-08',
    note: '"As long as I breathe, I will." — the Dune line that started it.',
  },
  {
    id: 'i-love-you',
    title: 'First "I love you"',
    date: '2024-03-11',
    note: 'Eu te amo. In any language.',
  },
  {
    id: 'anniversary',
    title: 'Official anniversary',
    date: '2024-03-30',
    note: 'Um casal oficial.',
  },
  {
    id: 'eclipse',
    title: 'The eclipse & the letter',
    date: '2024-04-08',
    note: 'The Great North American Eclipse — your first letter arrived the same day.',
  },
  {
    id: 'valentine-br',
    title: "Brazilian Valentine's Day",
    date: '2024-06-12',
    note: 'Dia dos Namorados — three days late, worth every minute.',
  },
  {
    id: 'first-date',
    title: 'First (virtual) date',
    date: '2024-08-31',
    note: "Alien: Romulus, popcorn vs. McDonald's, separate theaters.",
  },
]

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function nextOccurrence(milestone, now = new Date()) {
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
