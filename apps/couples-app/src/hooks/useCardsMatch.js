import { useEffect, useRef, useState } from 'react'
import { onValue, ref, runTransaction, set, update } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { newMatch, reduce } from '../lib/cardsAgainstCouples'

export const DEMO_PARTNER_UID = 'demo-partner'
const DEMO_KEY = 'cardsAgainstCouplesMatch'

// One ever-live game in Realtime Database; every change goes through
// lib/cardsAgainstCouples.js's reducer inside a transaction so the two
// players acting at the same moment can't clobber each other.
export function useCardsMatch() {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const effectivePartnerUid = firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const [match, setMatch] = useState(firebaseReady ? null : readDemoList(DEMO_KEY)[0] || null)
  const matchRef = useRef(match)
  matchRef.current = match

  useEffect(() => {
    if (!firebaseReady) return
    return onValue(ref(rtdb, 'cardsAgainstCouples/match'), (snap) => setMatch(snap.val()))
  }, [])

  function applyLocal(next) {
    writeDemoList(DEMO_KEY, [next])
    matchRef.current = next
    setMatch(next)
  }

  async function startMatch() {
    if (!user) return
    const next = newMatch(user.uid, effectivePartnerUid)
    if (!firebaseReady) {
      applyLocal(next)
      return
    }
    await set(ref(rtdb, 'cardsAgainstCouples/match'), next)
  }

  async function act(action) {
    if (!user) return false
    const full = { ...action, uid: user.uid }
    if (!firebaseReady) {
      const next = reduce(matchRef.current, full)
      if (!next) return false
      applyLocal(next)
      return true
    }
    const result = await runTransaction(ref(rtdb, 'cardsAgainstCouples/match'), (current) => {
      if (!current) return current
      return reduce(current, full) || undefined // undefined aborts the transaction
    })
    return result.committed
  }

  // Demo mode has no real partner: play a random card shortly after each
  // prompt appears, and tap "next" shortly after each reveal.
  useEffect(() => {
    if (firebaseReady || !match || match.status === 'ended') return
    let timer
    if (match.phase === 'pick' && !(DEMO_PARTNER_UID in (match.picks || {}))) {
      timer = setTimeout(() => {
        const m = matchRef.current
        const hand = m?.hands?.[DEMO_PARTNER_UID] || []
        const card = hand[Math.floor(Math.random() * hand.length)]
        const next = reduce(m, { type: 'play', uid: DEMO_PARTNER_UID, card })
        if (next) applyLocal(next)
      }, 1800)
    } else if (match.phase === 'reveal' && !match.ready?.[DEMO_PARTNER_UID]) {
      timer = setTimeout(() => {
        const next = reduce(matchRef.current, { type: 'ready', uid: DEMO_PARTNER_UID })
        if (next) applyLocal(next)
      }, 3000)
    }
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status, match?.phase, match?.round, match?.picks, match?.ready])

  // Either player can end the game; both land back on the lobby.
  async function endGame() {
    if (!user || !matchRef.current) return
    const patch = { status: 'ended', endedBy: user.uid }
    if (!firebaseReady) {
      applyLocal({ ...matchRef.current, ...patch })
      return
    }
    await update(ref(rtdb, 'cardsAgainstCouples/match'), patch)
  }

  return { match, effectivePartnerUid, startMatch, act, endGame }
}
