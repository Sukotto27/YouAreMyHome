// Inspired by relationship-research satisfaction checklists (e.g. Funk &
// Rogge's CSI-4 concept: a handful of items on how happy/strong the
// relationship feels) — paraphrased for personal reflection, not a
// reproduction of any specific licensed clinical instrument, and not a
// diagnostic tool.
export const SATISFACTION_INDEX = {
  id: 'satisfaction-index',
  title: 'Satisfaction Index',
  description: 'A quick personal check-in on how the relationship feels right now.',
}

export const OVERALL_HAPPINESS_SCALE = [
  { value: 0, label: 'Extremely unhappy' },
  { value: 1, label: 'Fairly unhappy' },
  { value: 2, label: 'A little unhappy' },
  { value: 3, label: 'Happy' },
  { value: 4, label: 'Very happy' },
  { value: 5, label: 'Extremely happy' },
  { value: 6, label: 'Perfect' },
]

export const AGREEMENT_SCALE = [
  { value: 0, label: 'Not at all true' },
  { value: 1, label: 'A little true' },
  { value: 2, label: 'Somewhat true' },
  { value: 3, label: 'Mostly true' },
  { value: 4, label: 'True' },
  { value: 5, label: 'Completely true' },
]

export const SATISFACTION_ITEMS = [
  { id: 'sat-1', text: 'Overall, how happy are you with your relationship?', scale: 'overall' },
  { id: 'sat-2', text: 'We have a good relationship.', scale: 'agreement' },
  { id: 'sat-3', text: 'Our relationship feels strong.', scale: 'agreement' },
  { id: 'sat-4', text: 'Being with my partner makes me happy.', scale: 'agreement' },
]

export const MAX_SATISFACTION_TOTAL = 6 + 5 + 5 + 5

export function scoreSatisfaction(items, answers) {
  const itemScores = items.map((item) => answers[item.id] ?? 0)
  const total = itemScores.reduce((sum, n) => sum + n, 0)
  return { total, itemScores }
}
