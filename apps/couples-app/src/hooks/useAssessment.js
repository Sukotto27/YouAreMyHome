import { useEffect, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'

function readDemoResult(uid, assessmentId) {
  return readDemoList('assessmentResults').find((r) => r.uid === uid && r.assessmentId === assessmentId) || null
}

// Retakeable, latest-result-only (same model as the mood tracker's current-
// state doc) — retaking overwrites rather than keeping history. Submitting
// also mirrors a `journalEvents` entry, same dual-write pattern as
// useMoods.js, so completions show up in the Timeline and notify the
// partner via the existing notifyOnJournalEvent trigger.
export function useAssessment(assessmentId, title) {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const [myResult, setMyResult] = useState(() => (user ? readDemoResult(user.uid, assessmentId) : null))
  const [partnerResult, setPartnerResult] = useState(null)

  useEffect(() => {
    if (!firebaseReady || !user) return
    return onSnapshot(doc(db, 'assessmentResults', `${user.uid}_${assessmentId}`), (snap) => {
      setMyResult(snap.exists() ? snap.data() : null)
    })
  }, [user, assessmentId])

  useEffect(() => {
    if (!firebaseReady || !partnerUid) {
      setPartnerResult(null)
      return
    }
    return onSnapshot(doc(db, 'assessmentResults', `${partnerUid}_${assessmentId}`), (snap) => {
      setPartnerResult(snap.exists() ? snap.data() : null)
    })
  }, [partnerUid, assessmentId])

  async function submitResult(results) {
    if (!user) return
    const authorName = user.displayName || user.email

    if (!firebaseReady) {
      const entry = { uid: user.uid, assessmentId, results, completedAt: new Date().toISOString() }
      const list = readDemoList('assessmentResults').filter(
        (r) => !(r.uid === user.uid && r.assessmentId === assessmentId),
      )
      list.push(entry)
      writeDemoList('assessmentResults', list)
      setMyResult(entry)

      const events = readDemoList('journalEvents')
      writeDemoList('journalEvents', [
        {
          id: crypto.randomUUID(),
          type: 'assessment',
          assessmentId,
          title,
          authorUid: user.uid,
          authorName,
          createdAt: new Date().toISOString(),
        },
        ...events,
      ])
      return
    }

    await Promise.all([
      setDoc(doc(db, 'assessmentResults', `${user.uid}_${assessmentId}`), {
        assessmentId,
        results,
        completedAt: serverTimestamp(),
      }),
      addDoc(collection(db, 'journalEvents'), {
        type: 'assessment',
        assessmentId,
        title,
        authorUid: user.uid,
        authorName,
        createdAt: serverTimestamp(),
      }),
    ])
  }

  return { myResult, partnerResult, submitResult }
}
