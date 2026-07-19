import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'

// Reuses the same `presence/{uid}.{feature}` timestamps useMarkSeen already
// writes for unread badges — the partner's timestamp doubles as "read up to"
// for that feature's read receipts, no extra writes needed.
export function usePartnerSeenAt(feature) {
  const { user } = useAuth()
  const [seenAt, setSeenAt] = useState(null)

  useEffect(() => {
    if (!firebaseReady || !user) return
    return onSnapshot(collection(db, 'presence'), (snapshot) => {
      const partnerDoc = snapshot.docs.find((d) => d.id !== user.uid)
      setSeenAt(partnerDoc?.data()?.[feature] ?? null)
    })
  }, [feature, user])

  return seenAt
}
