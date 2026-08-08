import { ANNIVERSARY } from './relationship'
import { yearIndexFor } from './tree'

// Preview-mode-only sample data (no Firebase configured, see firebaseReady)
// so the Tree of Union has something to actually render while testing —
// real usage always comes from the `treeEvents` collection instead.
function daysAfterAnniversary(days) {
  const d = new Date(ANNIVERSARY)
  d.setDate(d.getDate() + days)
  return d
}

function ts(date) {
  return { toDate: () => date }
}

let seq = 0
function make(feature, kind, daysIn, summary, extra = {}) {
  seq += 1
  const date = daysAfterAnniversary(daysIn)
  return {
    id: `demo-${seq}`,
    feature,
    kind,
    summary,
    createdAt: ts(date),
    yearIndex: yearIndexFor(date),
    ...extra,
  }
}

export function buildDemoTreeEvents() {
  const events = [
    make('qa', 'answered', 20, 'You both answered "What made you smile today?"', { category: 'Everyday' }),
    make('qa', 'answered', 95, 'You both answered "What\'s your favorite memory of us?"', { category: 'Us' }),
    make('games', 'draw', 40, 'Cristina saved a drawing to the scrapbook'),
    make('games', 'farkle', 60, 'Finished a game of Farkle'),
    make('gallery', 'uploaded', 30, 'Scott added a photo to the gallery'),
    make('gallery', 'uploaded', 110, 'Cristina added a photo to the gallery'),
    make('mail', 'letter', 75, 'Scott sent a love letter'),
    make('calendar', 'milestone', 15, 'Cristina added "First trip together"'),
    make('journal', 'gratitude', 50, 'Scott wrote a gratitude entry'),
    make('journal', 'mood', 130, 'Cristina logged feeling grateful'),

    make('qa', 'answered', 420, 'You both answered "Where do you want to travel next?"', { category: 'Dreams' }),
    make('games', 'uno', 380, 'Finished a game of Uno'),
    make('games', 'madlibs', 440, 'You both finished "Anniversary Surprise"'),
    make('gallery', 'uploaded', 400, 'Scott added a photo to the gallery'),
    make('calendar', 'dateNight', 410, 'Cristina added "Beach date night"'),
    make('love', 'kiss', 405, 'Cristina sent a kiss', { count: 3, lastSummary: 'Cristina sent a kiss' }),
    make('journal', 'checkin', 460, 'Scott checked in'),

    make('qa', 'answered', 850, 'You both answered "What are you most proud of us for?"', { category: 'Us' }),
    make('games', 'story', 830, 'Scott left a blank, and it got filled in'),
    make('mail', 'card', 860, 'Scott sent a card for Anniversary'),
    make('love', 'thumbkiss', 855, 'You both connected with a thumbkiss', { count: 5 }),
    make('journal', 'assessment', 845, 'Cristina completed the Love Languages assessment'),
  ]

  seq += 1
  events.push({
    id: `demo-${seq}`,
    feature: 'qa',
    kind: 'comment',
    summary: 'Scott commented: I loved reading this one back',
    createdAt: ts(daysAfterAnniversary(97)),
    yearIndex: yearIndexFor(daysAfterAnniversary(97)),
    parentEventId: events[1].id,
  })

  return events
}
