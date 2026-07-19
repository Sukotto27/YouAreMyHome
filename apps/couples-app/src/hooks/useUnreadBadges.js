import { useEffect, useState } from 'react'
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'

// Draw is intentionally excluded — it's a live/ephemeral shared canvas, not a
// feed of items you either have or haven't "read". For the 4 commentable
// features (qa/scrapbook/gallery/milestones), `activityField`/
// `activityAuthorField` point at `lastActivityAt`/`lastActivityByUid` instead
// of `createdAt`/`authorField` — a comment (or edit) bumps those without
// changing who originally created the doc, so the "is this mine" check must
// compare against who acted last, not who authored the item.
const TRACKED_FEATURES = [
  { key: 'chat', collectionName: 'messages', activityField: 'createdAt', activityAuthorField: 'senderUid' },
  { key: 'qa', collectionName: 'qaRounds', activityField: 'lastActivityAt', activityAuthorField: 'lastActivityByUid' },
  {
    key: 'scrapbook',
    collectionName: 'scrapbook',
    activityField: 'lastActivityAt',
    activityAuthorField: 'lastActivityByUid',
  },
  {
    key: 'gallery',
    collectionName: 'gallery',
    activityField: 'lastActivityAt',
    activityAuthorField: 'lastActivityByUid',
  },
  { key: 'mail', collectionName: 'loveLetters', activityField: 'createdAt', activityAuthorField: 'fromUid' },
  {
    key: 'milestones',
    collectionName: 'milestones',
    activityField: 'lastActivityAt',
    activityAuthorField: 'lastActivityByUid',
  },
  { key: 'journal', collectionName: 'journalEvents', activityField: 'createdAt', activityAuthorField: 'authorUid' },
]

export function useUnreadBadges() {
  const { user } = useAuth()
  const [presence, setPresence] = useState(null)
  const [latest, setLatest] = useState({})

  useEffect(() => {
    if (!firebaseReady || !user) return
    // Skip the local echo of our own pending writes: useMarkSeen() writes
    // serverTimestamp(), which resolves to null in the optimistic local
    // snapshot until the server acks it — reading that null momentarily
    // makes a just-seen feature look unread again and fires a false
    // notification sound. Waiting for confirmation avoids the flicker.
    return onSnapshot(doc(db, 'presence', user.uid), (snap) => {
      if (snap.metadata.hasPendingWrites) return
      setPresence(snap.data() || {})
    })
  }, [user])

  useEffect(() => {
    if (!firebaseReady || !user) return
    const unsubscribers = TRACKED_FEATURES.map(({ key, collectionName, activityField, activityAuthorField }) => {
      const latestQuery = query(collection(db, collectionName), orderBy(activityField, 'desc'), limit(1))
      return onSnapshot(latestQuery, (snapshot) => {
        const latestDoc = snapshot.docs[0]
        setLatest((prev) => ({
          ...prev,
          [key]: latestDoc
            ? { authorUid: latestDoc.data()[activityAuthorField], activityAt: latestDoc.data()[activityField] }
            : null,
        }))
      })
    })
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [user])

  const unread = {}
  for (const { key } of TRACKED_FEATURES) {
    const item = latest[key]
    if (!item || !item.activityAt || item.authorUid === user?.uid) {
      unread[key] = false
      continue
    }
    const seenAt = presence?.[key]
    unread[key] = !seenAt || item.activityAt.toMillis() > seenAt.toMillis()
  }
  return unread
}
