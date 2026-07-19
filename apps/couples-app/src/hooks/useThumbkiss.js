import { useEffect, useRef, useState } from 'react'
import { onDisconnect, onValue, ref, remove, set } from 'firebase/database'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db, rtdb, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { vibrate } from '../lib/vibration'

const PARTNER_PRESS_PATTERN = [100, 60, 100]
const CONNECTED_PATTERN = [60, 40, 60, 40, 60, 40, 220]

// A held-thumb "are you there" gesture, synced over Realtime Database (like
// Draw's live canvas) rather than Firestore — this is exactly the kind of
// ephemeral, low-latency "is someone touching this right now" state RTDB is
// built for, and onDisconnect() means a dropped connection or closed tab
// can't leave the partner's screen stuck mid-press.
export function useThumbkiss() {
  const { user } = useAuth()
  const [myPressing, setMyPressing] = useState(false)
  const [partnerPressing, setPartnerPressing] = useState(false)
  const prevPartnerRef = useRef(false)
  const prevBothRef = useRef(false)

  useEffect(() => {
    if (!firebaseReady || !user) return
    return onValue(ref(rtdb, 'thumbkiss'), (snap) => {
      const value = snap.val() || {}
      const partnerEntry = Object.entries(value).find(([uid]) => uid !== user.uid)
      setPartnerPressing(!!partnerEntry?.[1]?.pressing)
    })
  }, [user])

  useEffect(() => {
    if (partnerPressing && !prevPartnerRef.current) vibrate(PARTNER_PRESS_PATTERN)
    prevPartnerRef.current = partnerPressing
  }, [partnerPressing])

  const both = myPressing && partnerPressing
  useEffect(() => {
    if (both && !prevBothRef.current) {
      vibrate(CONNECTED_PATTERN)
      if (firebaseReady) {
        addDoc(collection(db, 'journalEvents'), {
          type: 'thumbkiss',
          authorUid: null,
          authorName: null,
          createdAt: serverTimestamp(),
        })
      }
    }
    prevBothRef.current = both
  }, [both])

  // Clear our own press state if we navigate away mid-hold.
  useEffect(() => {
    return () => {
      if (!firebaseReady || !user) return
      remove(ref(rtdb, `thumbkiss/${user.uid}`))
    }
  }, [user])

  function startPress() {
    setMyPressing(true)
    if (!firebaseReady || !user) return
    const myRef = ref(rtdb, `thumbkiss/${user.uid}`)
    set(myRef, { pressing: true })
    onDisconnect(myRef).remove()
  }

  function endPress() {
    setMyPressing(false)
    if (!firebaseReady || !user) return
    remove(ref(rtdb, `thumbkiss/${user.uid}`))
  }

  return { myPressing, partnerPressing, both, startPress, endPress }
}
