import { useEffect } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'

// Call once per feature page. Marks "I've seen this" both when arriving and
// when leaving, so activity that happens while you're actively looking at a
// page never gets flagged as unread once you navigate away.
export function useMarkSeen(feature) {
  const { user } = useAuth()

  useEffect(() => {
    if (!firebaseReady || !user) return

    function mark() {
      setDoc(doc(db, 'presence', user.uid), { [feature]: serverTimestamp() }, { merge: true })
    }

    mark()
    return mark
  }, [feature, user])
}
