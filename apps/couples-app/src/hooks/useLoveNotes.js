import { useEffect, useState } from 'react'
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { todayKey } from '../lib/dailyGoals'
import { kindDef } from '../data/loveNotes'

const DEMO_PARTNER_UID = 'demo-partner'
const RECENT_LIMIT = 5
const DEMO_EVENT = 'you-are-my-home:demo-love-note'

function readDemoUsedToday(key) {
  const raw = readDemoList(key)
  return Array.isArray(raw) ? {} : raw
}

// A kiss/love note ping — same double-duty write as useGameInvite: a Cloud
// Function trigger (notifyOnLoveNote) turns it into a push notification,
// while this hook's live onSnapshot is what drives the in-app popup for
// whoever's already got the app open. "Thinking of you"/"Wish you were
// here"/"I miss you" are further limited to once per day each — tracked in
// their own per-day doc, the same `{collection}/{uid}_{date}` convention
// useCheckIn/useDailyGoals use, so the limit is shared across devices.
export function useLoveNotes() {
  const { user } = useAuth()
  const date = todayKey()
  const [notes, setNotes] = useState([])
  const [usedToday, setUsedToday] = useState({})

  useEffect(() => {
    if (!firebaseReady) {
      // Preview mode has no shared Firestore between the sender and the
      // simulated partner reply — a window event stands in, same trick
      // useGameInvite uses, so the incoming popup is still testable.
      function handleDemoNote(event) {
        setNotes((prev) => [event.detail, ...prev])
      }
      window.addEventListener(DEMO_EVENT, handleDemoNote)
      return () => window.removeEventListener(DEMO_EVENT, handleDemoNote)
    }
    const notesQuery = query(collection(db, 'loveNotes'), orderBy('createdAt', 'desc'), limit(RECENT_LIMIT))
    return onSnapshot(notesQuery, (snapshot) => {
      setNotes(snapshot.docs.map((noteDoc) => ({ id: noteDoc.id, ...noteDoc.data() })))
    })
  }, [])

  useEffect(() => {
    if (!user) return
    if (!firebaseReady) {
      setUsedToday(readDemoUsedToday(`loveNoteSends:${user.uid}:${date}`))
      return
    }
    return onSnapshot(doc(db, 'loveNoteSends', `${user.uid}_${date}`), (snap) => {
      setUsedToday(snap.exists() ? snap.data() : {})
    })
  }, [user, date])

  const incoming = notes.find((note) => note.fromUid !== user.uid) || null

  async function send(category, kind) {
    if (!user) return
    const fromName = user.displayName || user.email
    const def = kindDef(category, kind)
    const note = { fromUid: user.uid, fromName, category, kind, emoji: def.emoji, message: def.message(fromName) }

    if (!firebaseReady) {
      const withId = { ...note, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
      setNotes((prev) => [withId, ...prev])
      if (category === 'note') {
        const next = { ...usedToday, [kind]: true }
        writeDemoList(`loveNoteSends:${user.uid}:${date}`, next)
        setUsedToday(next)
      }
      // Simulate the partner sending one back a moment later, purely so the
      // reply flow is visible to test without a second device.
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent(DEMO_EVENT, {
            detail: {
              id: crypto.randomUUID(),
              fromUid: DEMO_PARTNER_UID,
              fromName: 'Your partner',
              category,
              kind,
              emoji: def.emoji,
              message: def.message('Your partner'),
              createdAt: new Date(),
            },
          }),
        )
      }, 1200)
      return
    }

    await addDoc(collection(db, 'loveNotes'), { ...note, createdAt: serverTimestamp() })
    if (category === 'note') {
      await setDoc(doc(db, 'loveNoteSends', `${user.uid}_${date}`), { [kind]: true }, { merge: true })
    }
  }

  function sendKiss(kind) {
    return send('kiss', kind)
  }

  function sendNote(kind) {
    return send('note', kind)
  }

  function sendReply(note) {
    return send(note.category, note.kind)
  }

  return { incoming, usedToday, sendKiss, sendNote, sendReply }
}
