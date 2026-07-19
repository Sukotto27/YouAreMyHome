import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'

const TYPING_TIMEOUT_MS = 4000
const WRITE_THROTTLE_MS = 2000

// Plain client timestamps (not serverTimestamp()) — this is a latency-
// tolerant "is someone typing right now" signal, not something that needs to
// survive a page reload, so clock-skew risk isn't worth the async round trip.
export function useTypingIndicator() {
  const { user } = useAuth()
  const [partnerTyping, setPartnerTyping] = useState(false)
  const lastWriteRef = useRef(0)

  useEffect(() => {
    if (!firebaseReady || !user) return
    let clearTimer = null
    const unsubscribe = onSnapshot(collection(db, 'typing'), (snapshot) => {
      const partnerDoc = snapshot.docs.find((d) => d.id !== user.uid)
      const at = partnerDoc?.data()?.at
      if (clearTimer) clearTimeout(clearTimer)
      if (!at) {
        setPartnerTyping(false)
        return
      }
      const remaining = TYPING_TIMEOUT_MS - (Date.now() - at)
      if (remaining <= 0) {
        setPartnerTyping(false)
        return
      }
      setPartnerTyping(true)
      clearTimer = setTimeout(() => setPartnerTyping(false), remaining)
    })
    return () => {
      unsubscribe()
      if (clearTimer) clearTimeout(clearTimer)
    }
  }, [user])

  const notifyTyping = useCallback(() => {
    if (!firebaseReady || !user) return
    const now = Date.now()
    if (now - lastWriteRef.current < WRITE_THROTTLE_MS) return
    lastWriteRef.current = now
    setDoc(doc(db, 'typing', user.uid), { at: now }, { merge: true })
  }, [user])

  const stopTyping = useCallback(() => {
    if (!firebaseReady || !user) return
    lastWriteRef.current = 0
    setDoc(doc(db, 'typing', user.uid), { at: 0 }, { merge: true })
  }, [user])

  return { partnerTyping, notifyTyping, stopTyping }
}
