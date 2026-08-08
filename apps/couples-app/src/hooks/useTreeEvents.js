import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, query } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { eventDate } from '../lib/tree'
import { buildDemoTreeEvents } from '../lib/treeDemoData'

const EVENTS_LIMIT = 5000

function byDate(a, b) {
  return eventDate(a) - eventDate(b)
}

// Subscribes to the flat `treeEvents` collection (see functions/index.js's
// logTreeEvent triggers + lib/treeBackfill.js for what writes here) and
// nests it into { [feature]: { [yearIndex]: [event, ...] } }, with each
// top-level event carrying a `children` array of the twigs (comments etc.)
// whose parentEventId points at it — the shape TreeCanvas actually renders.
// A twig whose parent never made it into the tree (see the "orphaned
// comment" note in functions/index.js) is treated as top-level itself
// rather than dropped, so nothing you did just silently vanishes.
export function useTreeEvents() {
  const [events, setEvents] = useState(firebaseReady ? [] : buildDemoTreeEvents())
  const [loading, setLoading] = useState(firebaseReady)

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false)
      return
    }
    const eventsQuery = query(collection(db, 'treeEvents'), limit(EVENTS_LIMIT))
    return onSnapshot(eventsQuery, (snapshot) => {
      setEvents(snapshot.docs.map((eventDoc) => ({ id: eventDoc.id, ...eventDoc.data() })))
      setLoading(false)
    })
  }, [])

  const byFeature = useMemo(() => {
    const byId = new Map(events.map((event) => [event.id, event]))
    const childrenOf = new Map()
    for (const event of events) {
      if (event.parentEventId && byId.has(event.parentEventId)) {
        const list = childrenOf.get(event.parentEventId) || []
        list.push(event)
        childrenOf.set(event.parentEventId, list)
      }
    }

    const grouped = {}
    for (const event of events) {
      if (event.parentEventId && byId.has(event.parentEventId)) continue // nested below as a child, not top-level
      const feature = event.feature
      const yearIndex = event.yearIndex ?? 0
      grouped[feature] ??= {}
      grouped[feature][yearIndex] ??= []
      grouped[feature][yearIndex].push({
        ...event,
        children: (childrenOf.get(event.id) || []).sort(byDate),
      })
    }
    for (const feature of Object.keys(grouped)) {
      for (const yearIndex of Object.keys(grouped[feature])) {
        grouped[feature][yearIndex].sort(byDate)
      }
    }
    return grouped
  }, [events])

  return { loading, events, byFeature }
}
