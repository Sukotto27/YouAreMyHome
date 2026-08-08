import { ANNIVERSARY } from './relationship'

// The Tree of Union's 8 main branches — every nav feature except Chat (an
// ever-flowing conversation, not a discrete "thing that happened"). `angle`
// (degrees off vertical, + = right/- = left) fixes which side of the trunk
// each feature always sprouts from, so e.g. Games branches read consistently
// across every section instead of jumping sides year to year. `color` keeps
// that same visual identity. Music has no backing data source (see
// lib/treeBackfill.js) — its branch will just stay a bare stub on the trunk.
export const FEATURES = [
  { key: 'qa', label: 'Q&A', angle: 42, color: '#e27d7a' },
  { key: 'games', label: 'Games', angle: -48, color: '#6fb8b5' },
  { key: 'gallery', label: 'Gallery', angle: 55, color: '#c89b3c' },
  { key: 'mail', label: 'Mail', angle: -38, color: '#d98a5f' },
  { key: 'calendar', label: 'Calendar', angle: 50, color: '#7c98b3' },
  { key: 'love', label: 'Send Love', angle: -58, color: '#c85a57' },
  { key: 'journal', label: 'Journal', angle: 33, color: '#7fa87a' },
  { key: 'music', label: 'Music', angle: -28, color: '#a89bc4' },
]

export const FEATURE_BY_KEY = Object.fromEntries(FEATURES.map((f) => [f.key, f]))

// Which anniversary-year "section" of the tree a date falls into (0 = the
// first year together, 1 = the second, etc.) — mirrors the `years`
// component of getElapsedBreakdown(ANNIVERSARY, date) in relationship.js,
// and must stay in sync with the identical helper duplicated into
// functions/index.js (see that file's comment for why it's duplicated
// rather than shared).
export function yearIndexFor(date) {
  let years = date.getFullYear() - ANNIVERSARY.getFullYear()
  const anniversaryThisYear = new Date(
    date.getFullYear(),
    ANNIVERSARY.getMonth(),
    ANNIVERSARY.getDate(),
    ANNIVERSARY.getHours(),
    ANNIVERSARY.getMinutes(),
    ANNIVERSARY.getSeconds(),
  )
  if (date < anniversaryThisYear) years -= 1
  return Math.max(0, years)
}

export function dateKey(date) {
  return date.toISOString().slice(0, 10)
}

// How far into its anniversary year `date` is (0..1) — drives how tall the
// current, still-growing section renders (a sliver at first, full height by
// the next anniversary). Clamped to a small minimum so the newest section
// always shows at least a little trunk to sprout from.
export function fractionOfCurrentYear(date) {
  const yearIndex = yearIndexFor(date)
  const start = new Date(ANNIVERSARY)
  start.setFullYear(ANNIVERSARY.getFullYear() + yearIndex)
  const end = new Date(ANNIVERSARY)
  end.setFullYear(ANNIVERSARY.getFullYear() + yearIndex + 1)
  const fraction = (date - start) / (end - start)
  return Math.min(1, Math.max(0.05, fraction))
}

// Milestone-level interaction -> relative branch weight (length/thickness
// hint used by TreeCanvas). 1 = smallest twig (a comment, a day of kisses),
// 4 = biggest (finishing a game together, both answering a question).
const KIND_WEIGHT = {
  'qa.answered': 4,
  'qa.comment': 1,
  'games.draw': 2,
  'games.madlibs': 3,
  'games.story': 2,
  'games.farkle': 3,
  'games.uno': 3,
  'games.comment': 1,
  'gallery.uploaded': 2,
  'gallery.comment': 1,
  'mail.letter': 2,
  'mail.card': 3,
  'calendar.milestone': 3,
  'calendar.dateNight': 2,
  'calendar.plan': 2,
  'calendar.goal': 2,
  'calendar.comment': 1,
  'love.kiss': 1,
  'love.note': 2,
  'love.thumbkiss': 1,
  'journal.mood': 1,
  'journal.gratitude': 2,
  'journal.checkin': 1,
  'journal.assessment': 3,
  'journal.custom': 2,
}

export function weightFor(feature, kind) {
  return KIND_WEIGHT[`${feature}.${kind}`] ?? 2
}

export function eventDate(event) {
  const ts = event.createdAt || event.lastAt
  if (!ts) return ANNIVERSARY
  return typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts)
}
