import { useEffect, useState } from 'react'
import { deleteField, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'

// One doc per person, `musicFavorites/{uid}`, holding a flat { [trackId]: true }
// map — not date-scoped like checkins/dailyGoals (see dailyGoalsCustom in
// useDailyGoals.js for the same "single doc per uid, no date suffix" shape),
// since favorites just persist. Both of you read each other's doc (same
// usePartnerUid discovery useDailyGoals.js already uses) so a favorited
// song shows whose favorite(s) it is, not just "someone liked this."
export function useMusicFavorites() {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const [myFavorites, setMyFavorites] = useState({})
  const [partnerFavorites, setPartnerFavorites] = useState({})

  useEffect(() => {
    if (!firebaseReady || !user) return
    return onSnapshot(doc(db, 'musicFavorites', user.uid), (snap) => {
      setMyFavorites(snap.data() || {})
    })
  }, [user])

  useEffect(() => {
    if (!firebaseReady || !partnerUid) {
      setPartnerFavorites({})
      return
    }
    return onSnapshot(doc(db, 'musicFavorites', partnerUid), (snap) => {
      setPartnerFavorites(snap.data() || {})
    })
  }, [partnerUid])

  function toggleFavorite(trackId) {
    if (!firebaseReady || !user) return
    const next = !myFavorites[trackId]
    setDoc(doc(db, 'musicFavorites', user.uid), { [trackId]: next ? true : deleteField() }, { merge: true })
  }

  return { myFavorites, partnerFavorites, toggleFavorite }
}
