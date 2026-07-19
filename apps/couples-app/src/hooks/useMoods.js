import { useEffect, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { readDemoList, writeDemoList } from '../lib/demoStore'

export function useMoods() {
  const { user } = useAuth()
  const [moods, setMoods] = useState(firebaseReady ? {} : demoMoodsByUid())

  useEffect(() => {
    if (!firebaseReady) return
    return onSnapshot(collection(db, 'moods'), (snapshot) => {
      const next = {}
      snapshot.docs.forEach((moodDoc) => {
        next[moodDoc.id] = moodDoc.data()
      })
      setMoods(next)
    })
  }, [])

  async function setMyMood(emoji, label) {
    if (!user) return
    const authorName = user.displayName || user.email

    if (!firebaseReady) {
      const list = readDemoList('moods').filter((m) => m.uid !== user.uid)
      list.push({ uid: user.uid, emoji, label })
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
    next[m.uid] = { emoji: m.emoji, label: m.label }
  })
  return next
}
