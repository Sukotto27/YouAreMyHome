// Stable ids (not slugified at runtime) so a stored check state never shifts
// if a label wording changes later.
export const GOAL_CATEGORIES = [
  {
    id: 'productivity',
    label: 'Productivity',
    items: [
      { id: 'chores', label: 'Completed chores' },
      { id: 'clean-mess', label: 'Cleaned up a mess' },
      { id: 'decluttered', label: 'Decluttered' },
      { id: 'work-task', label: 'Finished a work task' },
      { id: 'paid-bills', label: 'Paid bills' },
      { id: 'errand', label: 'Ran an errand' },
    ],
  },
  {
    id: 'relaxation',
    label: 'Relaxation',
    items: [
      { id: 'napped', label: 'Napped' },
      { id: 'bath', label: 'Took a relaxing bath' },
      { id: 'read', label: 'Read a book' },
      { id: 'movie', label: 'Watched a movie or show' },
      { id: 'stretch', label: 'Stretched or did yoga' },
    ],
  },
  {
    id: 'destressing',
    label: 'Destressing',
    items: [
      { id: 'music', label: 'Listened to music' },
      { id: 'video-game', label: 'Played a video game' },
      { id: 'journaled', label: 'Journaled' },
      { id: 'meditated', label: 'Meditated or breathed deeply' },
      { id: 'walk', label: 'Went for a walk' },
    ],
  },
  {
    id: 'social',
    label: 'Social',
    items: [
      { id: 'family', label: 'Spent time with family' },
      { id: 'friends', label: 'Spent time with friends' },
      { id: 'night-out', label: 'Night out' },
      { id: 'called-loved-one', label: 'Called or texted a loved one' },
      { id: 'partner-time', label: 'Did something with your partner' },
    ],
  },
  {
    id: 'morning-routine',
    label: 'Morning Routine',
    items: [
      { id: 'affirmations-am', label: 'Recited affirmations' },
      { id: 'made-bed', label: 'Made the bed' },
      { id: 'breakfast', label: 'Ate breakfast' },
      { id: 'sunlight', label: 'Got sunlight' },
      { id: 'hydrated', label: 'Hydrated' },
    ],
  },
  {
    id: 'nightly-routine',
    label: 'Nightly Routine',
    items: [
      { id: 'affirmations-pm', label: 'Recited affirmations' },
      { id: 'exercised', label: 'Exercised' },
      { id: 'skincare', label: 'Skincare routine' },
      { id: 'read-before-bed', label: 'Read before bed' },
      { id: 'reflected', label: 'Reflected on the day' },
      // `prompt: true` items open a text prompt instead of being a plain
      // checkbox — see DailyGoalsPanel.jsx and useDailyGoals.addGratitudeEntry.
      { id: 'gratitude', label: 'Daily Gratitude', prompt: true },
    ],
  },
]

export function todayKey() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
