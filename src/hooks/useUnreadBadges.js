import { useEffect, useState } from 'react'
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'

// Draw is intentionally excluded — it's a live/ephemeral shared canvas, not a
// feed of items you either have or haven't "read".
const TRACKED_FEATURES = [
  { key: 'chat', collectionName: 'messages', authorField: 'senderUid' },
  { key: 'qa', collectionName: 'qaRounds', authorField: 'createdBy' },
  { key: 'scrapbook', collectionName: 'scrapbook', authorField: 'savedBy' },
  { key: 'gallery', collectionName: 'gallery', authorField: 'uploadedBy' },
  { key: 'mail', collectionName: 'loveLetters', authorField: 'fromUid' },
  { key: 'milestones', collectionName: 'milestones', authorField: 'addedBy' },
]

export function useUnreadBadges() {
  const { user } = useAuth()
  const [presence, setPresence] = useState(null)
  const [latest, setLatest] = useState({})

  useEffect(() => {
    if (!firebaseReady || !user) return
    return onSnapshot(doc(db, 'presence', user.uid), (snap) => setPresence(snap.data() || {}))
  }, [user])

  useEffect(() => {
    if (!firebaseReady || !user) return
    const unsubscribers = TRACKED_FEATURES.map(({ key, collectionName, authorField }) => {
      const latestQuery = query(collection(db, collectionName), orderBy('createdAt', 'desc'), limit(1))
      return onSnapshot(latestQuery, (snapshot) => {
        const latestDoc = snapshot.docs[0]
        setLatest((prev) => ({
          ...prev,
          [key]: latestDoc
            ? { authorUid: latestDoc.data()[authorField], createdAt: latestDoc.data().createdAt }
            : null,
        }))
      })
    })
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [user])

  const unread = {}
  for (const { key } of TRACKED_FEATURES) {
    const item = latest[key]
    if (!item || !item.createdAt || item.authorUid === user?.uid) {
      unread[key] = false
      continue
    }
    const seenAt = presence?.[key]
    unread[key] = !seenAt || item.createdAt.toMillis() > seenAt.toMillis()
  }
  return unread
}
