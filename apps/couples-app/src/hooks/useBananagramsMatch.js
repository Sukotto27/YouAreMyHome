import { useEffect, useRef, useState } from 'react'
import { onValue, ref, runTransaction, set, update } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { newMatch, reduce } from '../lib/bananagrams'

export const DEMO_PARTNER_UID = 'demo-partner'
const DEMO_KEY = 'bananagramsMatch'

// One ever-live match in Realtime Database. Every state change goes through
// lib/bananagrams.js's reducer inside a transaction, so two players peeling
// or dumping at the same instant can't corrupt the shared tile pool.
export function useBananagramsMatch() {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const effectivePartnerUid = firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const [match, setMatch] = useState(firebaseReady ? null : readDemoList(DEMO_KEY)[0] || null)
  const matchRef = useRef(match)
  matchRef.current = match

  useEffect(() => {
    if (!firebaseReady) return
    return onValue(ref(rtdb, 'bananagrams/match'), (snap) => setMatch(snap.val()))
  }, [])

  async function startMatch(sizeKey) {
    if (!user) return
    const next = newMatch(user.uid, effectivePartnerUid, sizeKey)
    if (!firebaseReady) {
      writeDemoList(DEMO_KEY, [next])
      setMatch(next)
      return
    }
    await set(ref(rtdb, 'bananagrams/match'), next)
  }

  // Returns true if the action was applied.
  async function act(action) {
    if (!user) return false
    const full = { ...action, uid: user.uid }
    if (!firebaseReady) {
      const next = reduce(matchRef.current, full)
      if (!next) return false
      writeDemoList(DEMO_KEY, [next])
      matchRef.current = next
      setMatch(next)
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
    if (!firebaseReady) {
      const next = { ...matchRef.current, ...patch }
      writeDemoList(DEMO_KEY, [next])
      matchRef.current = next
      setMatch(next)
      return
    }
    await update(ref(rtdb, 'bananagrams/match'), patch)
  }

  return { match, effectivePartnerUid, startMatch, act, endGame }
}
