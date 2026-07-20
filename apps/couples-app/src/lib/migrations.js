import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

// The fixed chapters of our story, formerly a hardcoded array — seeded once
// into real Firestore docs so they can be edited/commented on like anything
// else. `protected: true` keeps them from being deleted by accident, since
// there's no version history to recover them from.
const SEED_ITEMS = [
  {
    title: 'The first "hi"',
    date: '2024-01-18',
    notes: 'Where it all began — a shared Facebook page for Life is Strange.',
  },
  {
    title: 'The hidden message',
    date: '2024-03-08',
    notes: '"As long as I breathe, I will." — the Dune line that started it.',
  },
  {
    title: 'First "I love you"',
    date: '2024-03-11',
    notes: 'Eu te amo. In any language.',
  },
  {
    title: 'Official anniversary',
    date: '2024-03-30',
    notes: 'Um casal oficial.',
  },
  {
    title: 'The eclipse & the letter',
    date: '2024-04-08',
    notes: 'The Great North American Eclipse — your first letter arrived the same day.',
  },
  {
    title: "Brazilian Valentine's Day",
    date: '2024-06-12',
    notes: 'Dia dos Namorados — three days late, worth every minute.',
  },
  {
    title: 'First (virtual) date',
    date: '2024-08-31',
    notes: "Alien: Romulus, popcorn vs. McDonald's, separate theaters.",
  },
]

// Guarded by a transaction (not check-then-write) so two near-simultaneous
// app loads can't double-seed. Safe to call on every mount — a no-op once
// the sentinel doc exists.
export async function seedHistoryMilestones() {
  const sentinelRef = doc(db, 'meta', 'historySeeded')
  const milestoneRefs = SEED_ITEMS.map(() => doc(collection(db, 'milestones')))

  try {
    await runTransaction(db, async (transaction) => {
      const sentinelSnap = await transaction.get(sentinelRef)
      if (sentinelSnap.exists()) return

      transaction.set(sentinelRef, { seededAt: serverTimestamp() })
      SEED_ITEMS.forEach((item, index) => {
        transaction.set(milestoneRefs[index], {
          title: item.title,
          date: item.date,
          notes: item.notes,
          category: 'milestone',
          recurring: true,
          protected: true,
          addedBy: null,
          addedByName: null,
          createdAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
          lastActivityByUid: null,
        })
      })
    })
  } catch {
    // Best-effort — if this fails (offline, transient error), the sentinel
    // never gets created, so it'll simply retry on the next app load.
  }
}

// Birthdays, recurring yearly. The year in `date` is a placeholder (birth
// year wasn't something to guess at) — `showYearsSince: false` keeps
// EventRow from turning that placeholder into a fake "Nth anniversary"/age
// label. `giftEligible` pre-enables the virtual card & flowers button.
const BIRTHDAY_ITEMS = [
  { title: "Cristina's Birthday", date: '2000-04-22' },
  { title: "Scott's Birthday", date: '2000-01-27' },
]

export async function seedBirthdays() {
  const sentinelRef = doc(db, 'meta', 'birthdaysSeeded')
  const birthdayRefs = BIRTHDAY_ITEMS.map(() => doc(collection(db, 'milestones')))

  try {
    await runTransaction(db, async (transaction) => {
      const sentinelSnap = await transaction.get(sentinelRef)
      if (sentinelSnap.exists()) return

      transaction.set(sentinelRef, { seededAt: serverTimestamp() })
      BIRTHDAY_ITEMS.forEach((item, index) => {
        transaction.set(birthdayRefs[index], {
          title: item.title,
          date: item.date,
          notes: null,
          category: 'milestone',
          recurring: true,
          showYearsSince: false,
          giftEligible: true,
          protected: true,
          addedBy: null,
          addedByName: null,
          createdAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
          lastActivityByUid: null,
        })
      })
    })
  } catch {
    // Best-effort, same as seedHistoryMilestones above.
  }
}
