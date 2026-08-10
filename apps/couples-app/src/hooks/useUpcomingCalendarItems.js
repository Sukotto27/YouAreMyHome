import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { nextOccurrence } from '../lib/milestones'

const SOON_DAYS = 7
const TICK_MS = 60_000

// Same "soon" window EventRow.jsx already highlights rows with
// (daysUntil >= 0 && daysUntil <= 7) — surfaces the category of the soonest
// upcoming Milestone/Plan/Goal for the Home page's avatar badge. Date Night
// has its own dedicated badge (useUpcomingDateNight.js), so it's excluded here.
export function useUpcomingCalendarItems() {
  const [items, setItems] = useState([])
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!firebaseReady) return
    return onSnapshot(collection(db, 'milestones'), (snapshot) => {
      setItems(snapshot.docs.map((itemDoc) => itemDoc.data()))
    })
  }, [])

  let soonest = null
  for (const item of items) {
    // Missing `category` means a legacy milestone doc — same fallback
    // Calendar.jsx's categoryOf() uses.
    const category = item.category || 'milestone'
    if (category !== 'milestone' && category !== 'plan' && category !== 'goal') continue
    const occurrence = nextOccurrence(item, now)
    if (!occurrence || occurrence.daysUntil < 0 || occurrence.daysUntil > SOON_DAYS) continue
    if (!soonest || occurrence.daysUntil < soonest.daysUntil) {
      soonest = { category, daysUntil: occurrence.daysUntil }
    }
  }
  return soonest ? soonest.category : null
}
