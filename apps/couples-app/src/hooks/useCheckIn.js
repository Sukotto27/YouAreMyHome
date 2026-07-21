import { useEffect, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { todayKey } from '../lib/dailyGoals'

function readDemoCheckIn(key) {
  const raw = readDemoList(key)
  return Array.isArray(raw) ? null : raw
}

// One check-in doc per person per day, `checkins/{uid}_{date}` — mirrors the
// dailyGoals doc-id convention (see lib/dailyGoals.js), so "does today's doc
// exist" doubles as the CheckInReminder's "already done today" signal — no
// separate streak/reminder-state bookkeeping needed.
export function useCheckIn() {
  const { user } = useAuth()
  const date = todayKey()
  const [myCheckIn, setMyCheckIn] = useState(() => (user ? readDemoCheckIn(`checkins:${user.uid}:${date}`) : null))
  const [loading, setLoading] = useState(firebaseReady)
  const [partnerCheckIn, setPartnerCheckIn] = useState(null)
  const partnerUid = usePartnerUid()

  useEffect(() => {
    if (!firebaseReady || !user) return
    return onSnapshot(doc(db, 'checkins', `${user.uid}_${date}`), (snap) => {
      setMyCheckIn(snap.exists() ? snap.data() : null)
      setLoading(false)
    })
  }, [user, date])

  useEffect(() => {
    if (!firebaseReady || !partnerUid) {
      setPartnerCheckIn(null)
      return
    }
    return onSnapshot(doc(db, 'checkins', `${partnerUid}_${date}`), (snap) => {
      setPartnerCheckIn(snap.exists() ? snap.data() : null)
    })
  }, [partnerUid, date])

  async function submitCheckIn(fields) {
    if (!user) return
    const authorName = user.displayName || user.email

    if (!firebaseReady) {
      writeDemoList(`checkins:${user.uid}:${date}`, fields)
      setMyCheckIn(fields)
      const entries = readDemoList('journalEvents')
      writeDemoList('journalEvents', [
        {
          id: crypto.randomUUID(),
          type: 'checkin',
          ...fields,
          authorUid: user.uid,
          authorName,
          createdAt: new Date().toISOString(),
        },
        ...entries,
      ])
      return
    }

    await Promise.all([
      setDoc(doc(db, 'checkins', `${user.uid}_${date}`), { ...fields, updatedAt: serverTimestamp() }, { merge: true }),
      addDoc(collection(db, 'journalEvents'), {
        type: 'checkin',
        ...fields,
        authorUid: user.uid,
        authorName,
        createdAt: serverTimestamp(),
      }),
    ])
  }

  return { myCheckIn, partnerCheckIn, submitCheckIn, date, loading }
}
