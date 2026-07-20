import { useEffect, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { readDemoList, writeDemoList } from '../lib/demoStore'

export const DEMO_PARTNER_UID = 'demo-partner'

function readDemoMap(key) {
  const raw = readDemoList(key)
  return Array.isArray(raw) ? {} : raw
}

// One shared doc per story (`madLibs/{storyId}`), holding both partners'
// blank answers under `answers.{uid}` — same "hidden until both are in"
// shape as Q&A rounds, but a single deterministic doc per story rather than
// arbitrary rounds, since there's no need to browse a history here — just
// "have we both filled this one in yet."
export function useMadLibs() {
  const { user } = useAuth()
  const [stories, setStories] = useState(firebaseReady ? {} : readDemoMap('madLibs'))

  useEffect(() => {
    if (!firebaseReady) return
    return onSnapshot(collection(db, 'madLibs'), (snapshot) => {
      const next = {}
      snapshot.docs.forEach((storyDoc) => {
        next[storyDoc.id] = storyDoc.data()
      })
      setStories(next)
    })
  }, [])

  async function submitAnswers(storyId, storyTitle, answers) {
    if (!user) return
    const authorName = user.displayName || user.email

    if (!firebaseReady) {
      const next = {
        ...stories,
        [storyId]: { answers: { ...(stories[storyId]?.answers || {}), [user.uid]: answers } },
      }
      setStories(next)
      writeDemoList('madLibs', next)
      const entries = readDemoList('journalEvents')
      writeDemoList('journalEvents', [
        {
          id: crypto.randomUUID(),
          type: 'madlib',
          storyId,
          title: storyTitle,
          authorUid: user.uid,
          authorName,
          createdAt: new Date().toISOString(),
        },
        ...entries,
      ])
      // Preview-only stand-in so the reveal is testable without a second
      // device connected — every blank gets the same silly placeholder word.
      setTimeout(() => {
        setStories((prev) => {
          const partnerAnswers = Object.fromEntries(Object.keys(answers).map((blankId) => [blankId, 'banana']))
          const merged = {
            ...prev,
            [storyId]: { answers: { ...(prev[storyId]?.answers || {}), [DEMO_PARTNER_UID]: partnerAnswers } },
          }
          writeDemoList('madLibs', merged)
          return merged
        })
      }, 1500)
      return
    }

    await Promise.all([
      setDoc(
        doc(db, 'madLibs', storyId),
        { [`answers.${user.uid}`]: answers, updatedAt: serverTimestamp() },
        { merge: true },
      ),
      addDoc(collection(db, 'journalEvents'), {
        type: 'madlib',
        storyId,
        title: storyTitle,
        authorUid: user.uid,
        authorName,
        createdAt: serverTimestamp(),
      }),
    ])
  }

  // Only ever shown once both of you have already completed a story, so
  // there's no risk of this clobbering an in-progress partner submission.
  async function playAgain(storyId) {
    if (!firebaseReady) {
      const next = { ...stories, [storyId]: { answers: {} } }
      setStories(next)
      writeDemoList('madLibs', next)
      return
    }
    await setDoc(doc(db, 'madLibs', storyId), { answers: {}, updatedAt: serverTimestamp() })
  }

  return { stories, submitAnswers, playAgain }
}
