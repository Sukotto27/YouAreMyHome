import { useEffect, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { toDate } from '../lib/chatGrouping'

// A mood only counts if it was set today — moods/{uid} is a single
// current-state doc (no date in its path), so "clears every day" just means
// treating a stale `updatedAt` as unset here rather than deleting anything.
function isFromToday(mood) {
  if (!mood?.updatedAt) return false
  return toDate(mood.updatedAt).toDateString() === new Date().toDateString()
}

export function useMoods() {
  const { user } = useAuth()
  const [moods, setMoods] = useState(firebaseReady ? {} : demoMoodsByUid())

  useEffect(() => {
    if (!firebaseReady) return
    return onSnapshot(collection(db, 'moods'), (snapshot) => {
      const next = {}
      snapshot.docs.forEach((moodDoc) => {
        const data = moodDoc.data()
        // A just-written serverTimestamp() sentinel resolves to null in the
        // optimistic local echo until the server acks it — without this,
        // setting your own mood would flash it as "cleared" for a moment.
        if (moodDoc.metadata.hasPendingWrites || isFromToday(data)) next[moodDoc.id] = data
      })
      setMoods(next)
    })
  }, [])

  async function setMyMood(emoji, label) {
    if (!user) return
    const authorName = user.displayName || user.email

    if (!firebaseReady) {
      const list = readDemoList('moods').filter((m) => m.uid !== user.uid)
      list.push({ uid: user.uid, emoji, label, updatedAt: new Date().toISOString() })
      writeDemoList('moods', list)
      setMoods(demoMoodsByUid())
      return
    }

    await setDoc(doc(db, 'moods', user.uid), { emoji, label, updatedAt: serverTimestamp() }, { merge: true })
    await addDoc(collection(db, 'journalEvents'), {
      type: 'mood',
      emoji,
      label,
      authorUid: user.uid,
      authorName,
      createdAt: serverTimestamp(),
    })
  }

  return { moods, setMyMood }
}

function demoMoodsByUid() {
  const next = {}
  readDemoList('moods').forEach((m) => {
    if (isFromToday(m)) next[m.uid] = { emoji: m.emoji, label: m.label }
  })
  return next
}
