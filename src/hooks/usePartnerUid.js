import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'

// Discovers the partner's uid via the `presence` collection — every known
// account has a doc there (written by useMarkSeen), so "everyone but me" is
// exactly "the partner" in this two-person app. Same pattern already used
// inline by usePartnerSeenAt.js and (until this extraction) useDailyGoals.js.
export function usePartnerUid() {
  const { user } = useAuth()
  const [partnerUid, setPartnerUid] = useState(null)

  useEffect(() => {
    if (!firebaseReady || !user) return
    return onSnapshot(collection(db, 'presence'), (snapshot) => {
      const partnerDoc = snapshot.docs.find((d) => d.id !== user.uid)
      setPartnerUid(partnerDoc?.id ?? null)
    })
  }, [user])

  return partnerUid
}
