import { useEffect } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'

// One-shot version of the mark-seen write, for features with no dedicated
// page to mount useMarkSeen on (e.g. Send Love, acknowledged by tapping its
// avatar badge rather than visiting a "Love" page).
export function markSeenNow(user, feature) {
  if (!firebaseReady || !user) return
  return setDoc(doc(db, 'presence', user.uid), { [feature]: serverTimestamp() }, { merge: true })
}

// Call once per feature page. Marks "I've seen this" both when arriving and
// when leaving, so activity that happens while you're actively looking at a
// page never gets flagged as unread once you navigate away.
export function useMarkSeen(feature) {
  const { user } = useAuth()

  useEffect(() => {
    if (!firebaseReady || !user) return

    function mark() {
      markSeenNow(user, feature)
    }

    mark()
    return mark
  }, [feature, user])
}
