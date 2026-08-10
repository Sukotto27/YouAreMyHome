import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'

const ROUNDS_LIMIT = 500

// Standalone version of the "Awaiting Your Answer" signal pages/QA.jsx
// already computes for its own category list — just the boolean, for the
// Home page's avatar badge.
export function useAwaitingQa() {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const [rounds, setRounds] = useState([])

  useEffect(() => {
    if (!firebaseReady) return
    const roundsQuery = query(collection(db, 'qaRounds'), orderBy('createdAt', 'desc'), limit(ROUNDS_LIMIT))
    return onSnapshot(roundsQuery, (snapshot) => {
      setRounds(snapshot.docs.map((roundDoc) => roundDoc.data()))
    })
  }, [])

  if (!user || !partnerUid) return false
  return rounds.some((round) => round.answers?.[partnerUid] && !round.answers?.[user.uid])
}
