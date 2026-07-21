import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { readDemoList, writeDemoList } from '../lib/demoStore'

export const DEMO_PARTNER_UID = 'demo-partner'

// Silly stand-ins for the partner's half of a turn in preview mode — no real
// second device to fill the blank or continue the story, so this both fills
// the pending blank and immediately leaves the next one, the same shape a
// real reply would.
const DEMO_CONTINUATIONS = [
  { word: 'a dragon', textBefore: 'Suddenly, a', textAfter: 'came out of nowhere.' },
  { word: 'a mysterious letter', textBefore: 'Just then, they found', textAfter: 'under the door.' },
  { word: 'three days', textBefore: 'It took', textAfter: 'to figure out what to do next.' },
]

// A single, ever-growing collaborative story — one flat `storyTurns`
// collection (ordered by `order`, not a per-story doc) rather than the
// per-story doc Mad Libs uses, since this never "finishes" and could grow
// past what's comfortable in one Firestore doc. Each turn is written by one
// partner and leaves exactly one blank (`textBefore`/`textAfter` around it);
// the *other* partner fills that blank in and leaves the next one.
//
// Turn docs use deterministic ids (`turn-{order}`) specifically so starting
// the story and filling-in-and-continuing can each run inside a Firestore
// transaction that checks the target doc's current state first — that's
// what actually prevents two racing writes (not just the UI only ever
// rendering the interactive form for whoever's turn it is), covering both
// "you both tap Start the story at once" before any turn exists yet, and a
// stray double-submit landing twice on the same pending blank.
export function useNeverEndingStory() {
  const { user } = useAuth()
  const [turns, setTurns] = useState(firebaseReady ? [] : readDemoList('storyTurns'))
  const [loading, setLoading] = useState(firebaseReady)

  useEffect(() => {
    if (!firebaseReady) return
    const turnsQuery = query(collection(db, 'storyTurns'), orderBy('order', 'asc'))
    return onSnapshot(turnsQuery, (snapshot) => {
      setTurns(snapshot.docs.map((turnDoc) => ({ id: turnDoc.id, ...turnDoc.data() })))
      setLoading(false)
    })
  }, [])

  const lastTurn = turns[turns.length - 1] || null
  const pendingTurn = lastTurn && !lastTurn.filledWord ? lastTurn : null

  function simulateDemoReply() {
    setTimeout(() => {
      setTurns((prev) => {
        const pending = prev[prev.length - 1]
        if (!pending || pending.filledWord) return prev
        const reply = DEMO_CONTINUATIONS[prev.length % DEMO_CONTINUATIONS.length]
        const next = prev.map((t) =>
          t.id === pending.id
            ? { ...t, filledWord: reply.word, filledByUid: DEMO_PARTNER_UID, filledByName: 'Your partner' }
            : t,
        )
        next.push({
          id: `turn-${next.length}`,
          order: next.length,
          authorUid: DEMO_PARTNER_UID,
          authorName: 'Your partner',
          textBefore: reply.textBefore,
          textAfter: reply.textAfter,
          filledWord: null,
          filledByUid: null,
          filledByName: null,
          createdAt: new Date().toISOString(),
        })
        writeDemoList('storyTurns', next)
        return next
      })
    }, 1500)
  }

  // Starts the very first turn — only reachable when there are no turns yet.
  async function startStory(textBefore, textAfter) {
    if (!user) return
    const authorName = user.displayName || user.email

    if (!firebaseReady) {
      if (turns.length > 0) return
      const next = [
        {
          id: 'turn-0',
          order: 0,
          authorUid: user.uid,
          authorName,
          textBefore,
          textAfter,
          filledWord: null,
          filledByUid: null,
          filledByName: null,
          createdAt: new Date().toISOString(),
        },
      ]
      setTurns(next)
      writeDemoList('storyTurns', next)
      simulateDemoReply()
      return
    }

    const turnRef = doc(db, 'storyTurns', 'turn-0')
    await runTransaction(db, async (tx) => {
      const existing = await tx.get(turnRef)
      if (existing.exists()) return // someone already started it
      tx.set(turnRef, {
        order: 0,
        authorUid: user.uid,
        authorName,
        textBefore,
        textAfter,
        filledWord: null,
        filledByUid: null,
        filledByName: null,
        createdAt: serverTimestamp(),
      })
    })
  }

  // Fills the pending blank and leaves the next one, in one atomic
  // transaction — only reachable when `pendingTurn` belongs to your partner.
  async function fillAndContinue(word, textBefore, textAfter) {
    if (!user || !pendingTurn) return
    const authorName = user.displayName || user.email
    const nextOrder = pendingTurn.order + 1

    if (!firebaseReady) {
      const next = turns.map((t) =>
        t.id === pendingTurn.id ? { ...t, filledWord: word, filledByUid: user.uid, filledByName: authorName } : t,
      )
      next.push({
        id: `turn-${nextOrder}`,
        order: nextOrder,
        authorUid: user.uid,
        authorName,
        textBefore,
        textAfter,
        filledWord: null,
        filledByUid: null,
        filledByName: null,
        createdAt: new Date().toISOString(),
      })
      setTurns(next)
      writeDemoList('storyTurns', next)
      simulateDemoReply()
      return
    }

    const pendingRef = doc(db, 'storyTurns', pendingTurn.id)
    const nextRef = doc(db, 'storyTurns', `turn-${nextOrder}`)
    await runTransaction(db, async (tx) => {
      const freshPending = await tx.get(pendingRef)
      // Someone already filled this blank (or it no longer exists) — bail
      // rather than filling it a second time or creating a duplicate turn.
      if (!freshPending.exists() || freshPending.data().filledWord) return
      const nextExisting = await tx.get(nextRef)
      if (nextExisting.exists()) return

      tx.update(pendingRef, {
        filledWord: word,
        filledByUid: user.uid,
        filledByName: authorName,
        filledAt: serverTimestamp(),
      })
      tx.set(nextRef, {
        order: nextOrder,
        authorUid: user.uid,
        authorName,
        textBefore,
        textAfter,
        filledWord: null,
        filledByUid: null,
        filledByName: null,
        createdAt: serverTimestamp(),
      })
    })
  }

  return { turns, pendingTurn, loading, startStory, fillAndContinue }
}
