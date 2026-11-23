import { useEffect, useRef, useState } from 'react'
import { onValue, ref, runTransaction, set, update } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { COMPUTER_UID, readSolo, writeSolo } from '../lib/solo'
import { newMatch, reduce } from '../lib/bananagrams'

export const DEMO_PARTNER_UID = 'demo-partner'
const DEMO_KEY = 'bananagramsMatch'
export const SOLO_KEY = 'bananagramsSolo'

// The computer builds at a steady human-ish pace: each time a tile is peeled
// (and at the start) it takes it somewhere in this window to finish its grid.
const BOT_MIN_MS = 40000
const BOT_MAX_MS = 80000

// One ever-live match in Realtime Database. Every state change goes through
// lib/bananagrams.js's reducer inside a transaction, so two players peeling
// or dumping at the same instant can't corrupt the shared tile pool.
export function useBananagramsMatch(solo = false) {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  // Solo and preview mode both play on this device.
  const local = solo || !firebaseReady
  const effectivePartnerUid = solo ? COMPUTER_UID : firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const [match, setMatch] = useState(solo ? readSolo(SOLO_KEY) : firebaseReady ? null : readDemoList(DEMO_KEY)[0] || null)
  const matchRef = useRef(match)
  matchRef.current = match

  useEffect(() => {
    if (solo) {
      setMatch(readSolo(SOLO_KEY))
      return
    }
    if (!firebaseReady) {
      setMatch(readDemoList(DEMO_KEY)[0] || null)
      return
    }
    setMatch(null)
    return onValue(ref(rtdb, 'bananagrams/match'), (snap) => setMatch(snap.val()))
  }, [solo])

  function saveLocal(next) {
    matchRef.current = next
    if (next.players?.includes(COMPUTER_UID)) writeSolo(SOLO_KEY, next)
    else writeDemoList(DEMO_KEY, [next])
    setMatch(next)
  }

  async function startMatch(sizeKey, asSolo = solo) {
    if (!user) return
    const next = newMatch(user.uid, asSolo ? COMPUTER_UID : effectivePartnerUid, sizeKey)
    if (asSolo || !firebaseReady) {
      saveLocal(next)
      return
    }
    await set(ref(rtdb, 'bananagrams/match'), next)
  }

  // Returns true if the action was applied.
  async function act(action) {
    if (!user) return false
    const full = { ...action, uid: user.uid }
    if (local) {
      const next = reduce(matchRef.current, full)
      if (!next) return false
      saveLocal(next)
      return true
    }
    const result = await runTransaction(ref(rtdb, 'bananagrams/match'), (current) => {
      if (!current) return current
      return reduce(current, full) || undefined // undefined aborts the transaction
    })
    return result.committed
  }

  // Either player can end the game; both land back on the lobby.
  async function endGame() {
    if (!user || !matchRef.current) return
    const patch = { status: 'ended', endedBy: user.uid }
    if (local) {
      saveLocal({ ...matchRef.current, ...patch })
      return
    }
    await update(ref(rtdb, 'bananagrams/match'), patch)
  }

  // The computer opponent. Once the race is on it finishes its grid after a
  // random pause, which peels for everyone (or calls Bananas once the pile
  // can't cover a peel) — the same thing a human finishing their grid does.
  // The timer restarts on every peel, since a peel gives it a new tile to place.
  useEffect(() => {
    if (!solo || match?.status !== 'playing') return
    const timer = setTimeout(
      () => {
        const current = matchRef.current
        if (!current || current.status !== 'playing') return
        const poolEmpty = (current.pool || '').length < current.players.length
        const next = reduce(current, { type: poolEmpty ? 'win' : 'peel', uid: COMPUTER_UID })
        if (next) saveLocal(next)
      },
      BOT_MIN_MS + Math.random() * (BOT_MAX_MS - BOT_MIN_MS),
    )
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solo, match?.status, match?.peels])

  return { match, effectivePartnerUid, startMatch, act, endGame }
}
