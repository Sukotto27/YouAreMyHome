import { useEffect, useState } from 'react'
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'

// Draw is intentionally excluded — it's a live/ephemeral shared canvas, not a
// feed of items you either have or haven't "read". For qa/scrapbook/gallery/
// milestones/chat, `activityField`/`activityAuthorField` point at
// `lastActivityAt`/`lastActivityByUid` instead of `createdAt`/`authorField`
// — a comment/reaction (or edit) bumps those without changing who originally
// created the doc, so the "is this mine" check must compare against who
// acted last, not who authored the item. Chat specifically: a reaction (see
// Chat.jsx's toggleReaction) bumps these the same way a brand-new message
// does, so it counts as unread activity too, not just new messages.
const TRACKED_FEATURES = [
  { key: 'chat', collectionName: 'messages', activityField: 'lastActivityAt', activityAuthorField: 'lastActivityByUid' },
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
  {
    key: 'mail',
    collectionName: 'loveLetters',
    activityField: 'createdAt',
    activityAuthorField: 'fromUid',
    // Lets the avatar badge show 💐 vs 💌 without a separate query — mirrors
    // the same `entry.isCard` branch JournalEntry.jsx already reads.
    detailField: 'isCard',
  },
  {
    key: 'loveNotes',
    collectionName: 'loveNotes',
    activityField: 'createdAt',
    activityAuthorField: 'fromUid',
    // Surfaces the actual emoji sent so the avatar badge can show it directly.
    detailField: 'emoji',
  },
  {
    key: 'milestones',
    collectionName: 'milestones',
    activityField: 'lastActivityAt',
    activityAuthorField: 'lastActivityByUid',
    // Milestones/Date Nights/Plans/Goals all share this one collection —
    // `detail` carries the `category` of the latest unread item so pages
    // can point at the specific tab it's in, not just "something's new".
    detailField: 'category',
  },
  {
    key: 'journal',
    collectionName: 'journalEvents',
    activityField: 'createdAt',
    activityAuthorField: 'authorUid',
    // journalEvents mirrors activity from lots of features (checkin,
    // gratitude, mood, mail, ...) — `detail` carries the entry `type` so
    // Journal can point at Status/Goals/Timeline specifically.
    detailField: 'type',
  },
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
    const unsubscribers = TRACKED_FEATURES.map(({ key, collectionName, activityField, activityAuthorField, detailField }) => {
      const latestQuery = query(collection(db, collectionName), orderBy(activityField, 'desc'), limit(1))
      return onSnapshot(latestQuery, (snapshot) => {
        const latestDoc = snapshot.docs[0]
        setLatest((prev) => ({
          ...prev,
          [key]: latestDoc
            ? {
                authorUid: latestDoc.data()[activityAuthorField],
                activityAt: latestDoc.data()[activityField],
                detail: detailField ? latestDoc.data()[detailField] : null,
              }
            : null,
        }))
      })
    })
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [user])

  const unread = {}
  const detail = {}
  for (const { key } of TRACKED_FEATURES) {
    const item = latest[key]
    if (!item || !item.activityAt || item.authorUid === user?.uid) {
      unread[key] = false
      detail[key] = null
      continue
    }
    const seenAt = presence?.[key]
    const isUnread = !seenAt || item.activityAt.toMillis() > seenAt.toMillis()
    unread[key] = isUnread
    detail[key] = isUnread ? item.detail : null
  }
  return { unread, detail }
}
