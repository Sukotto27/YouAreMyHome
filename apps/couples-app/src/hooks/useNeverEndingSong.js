import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { readDemoList, writeDemoList } from '../lib/demoStore'

export const DEMO_PARTNER_UID = 'demo-partner'

// Stand-ins for the partner's line in preview mode — no real second device to
// take a turn, so this just appends the next song-title fragment a beat later.
const DEMO_LINES = [
  { text: 'On the Crazy Train', songs: 'Crazy Train — Ozzy Osbourne' },
  { text: 'to the Hotel California', songs: 'Hotel California — Eagles' },
  { text: 'where we could Dance the Night away', songs: 'Dance the Night — Dua Lipa' },
  { text: "but Don't Stop Believin'", songs: "Don't Stop Believin' — Journey" },
]

// The Never-Ending Song: one ever-growing sentence built one fragment at a
// time, where every fragment has to be a real song title (or a few of them)
// with only small "filler" words allowed to bridge them into something that
// reads grammatically. Same take-turns-forever shape as the Never-Ending
// Story, but there's no blank to leave — each line just continues the one
// before it, then the turn passes back.
//
// One flat `songTurns` collection ordered by `order` (not a per-song doc),
// since it never "finishes." Turn docs use deterministic ids (`line-{order}`)
// so appending a line can run inside a Firestore transaction that checks the
// target doc doesn't exist yet — that's what actually prevents two racing
// writes from both landing on the same slot (the UI only rendering the form
// for whoever's turn it is is a convenience, not the guard).
export function useNeverEndingSong() {
  const { user } = useAuth()
  const [turns, setTurns] = useState(firebaseReady ? [] : readDemoList('songTurns'))
  const [loading, setLoading] = useState(firebaseReady)

  useEffect(() => {
    if (!firebaseReady) return
    const turnsQuery = query(collection(db, 'songTurns'), orderBy('order', 'asc'))
    return onSnapshot(turnsQuery, (snapshot) => {
      setTurns(snapshot.docs.map((turnDoc) => ({ id: turnDoc.id, ...turnDoc.data() })))
      setLoading(false)
    })
  }, [])

  const lastTurn = turns[turns.length - 1] || null
  // It's your turn to add a line if the song hasn't started yet, or if the
  // last line was your partner's. If the last line is yours, you're waiting.
  const myTurn = !!user && (!lastTurn || lastTurn.authorUid !== user.uid)
  const waitingOnPartner = !!user && !!lastTurn && lastTurn.authorUid === user.uid

  function simulateDemoReply() {
    setTimeout(() => {
      setTurns((prev) => {
        const reply = DEMO_LINES[prev.length % DEMO_LINES.length]
        const next = [
          ...prev,
          {
            id: `line-${prev.length}`,
            order: prev.length,
            authorUid: DEMO_PARTNER_UID,
            authorName: 'Your partner',
            text: reply.text,
            songs: reply.songs,
            createdAt: new Date().toISOString(),
          },
        ]
        writeDemoList('songTurns', next)
        return next
      })
    }, 1500)
  }

  // Appends the next line. Used both for the opening line and every
  // continuation — nextOrder is just the current length.
  async function addLine(text, songs) {
    if (!user || !myTurn) return
    const authorName = user.displayName || user.email
    const nextOrder = turns.length

    if (!firebaseReady) {
      const next = [
        ...turns,
        {
          id: `line-${nextOrder}`,
          order: nextOrder,
          authorUid: user.uid,
          authorName,
          text,
          songs,
          createdAt: new Date().toISOString(),
        },
      ]
      setTurns(next)
      writeDemoList('songTurns', next)
      simulateDemoReply()
      return
    }

    const lineRef = doc(db, 'songTurns', `line-${nextOrder}`)
    await runTransaction(db, async (tx) => {
      const existing = await tx.get(lineRef)
      if (existing.exists()) return // someone already took this slot
      tx.set(lineRef, {
        order: nextOrder,
        authorUid: user.uid,
        authorName,
        text,
        songs,
        createdAt: serverTimestamp(),
      })
    })
  }

  return { turns, loading, myTurn, waitingOnPartner, addLine }
}
