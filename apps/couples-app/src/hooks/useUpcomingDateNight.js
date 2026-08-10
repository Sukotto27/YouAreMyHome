import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { zonedTimeToUtc } from '../lib/timezone'

// Same ±1h "about to start" window as the Calendar row's Sync-Up panel
// (hooks/useDateNightSyncUp.js) — kept in sync so the home icon and the
// panel it links to appear/disappear together.
const WINDOW_MS = 60 * 60 * 1000
const TICK_MS = 30_000

// Surfaces the single soonest Date Night that's about to start, for the Home
// page's countdown icon. Only ever reflects one occurrence at a time — with
// two people there's realistically never more than one Date Night in the
// window at once, so "soonest" is enough without ranking a whole list.
export function useUpcomingDateNight() {
  const [items, setItems] = useState([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!firebaseReady) return
    const dateNightsQuery = query(collection(db, 'milestones'), where('category', '==', 'dateNight'))
    return onSnapshot(dateNightsQuery, (snapshot) => {
      setItems(snapshot.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() })))
    })
  }, [])

  let soonest = null
  for (const item of items) {
    if (item.completed || !item.time || !item.timezone) continue
    const occurrenceDate = item.nextOccurrenceDate || item.date
    if (!occurrenceDate) continue
    const msUntil = zonedTimeToUtc(occurrenceDate, item.time, item.timezone).getTime() - now
    if (msUntil > WINDOW_MS || msUntil < -WINDOW_MS) continue
    if (!soonest || msUntil < soonest.msUntil) soonest = { item, msUntil }
  }
  return soonest
}
