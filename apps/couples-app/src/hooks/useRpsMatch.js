import { useEffect, useRef, useState } from 'react'
import { onValue, ref, set, update } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { CHOICES, REVEAL_MS, RESOLVE_GRACE_MS, COUNTDOWN_FROM, WINS_NEEDED, roundWinner } from '../lib/rps'

export const DEMO_PARTNER_UID = 'demo-partner'
const DEMO_KEY = 'rpsMatch'

// One ever-live match in Realtime Database (same shape as Obstacle Drop's).
// Rounds move through phases: 'countdown' (both players preselect; picks are
// written the moment they're tapped and can be changed until 0) -> 'reveal'
// (both picks shown, score updated) -> next round's 'countdown', or
// status 'finished' once someone has WINS_NEEDED. Only the host (whoever
// started the match) advances phases, so there's a single referee and the
// two screens can't disagree about who won a round.
export function useRpsMatch() {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const effectivePartnerUid = firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const [match, setMatch] = useState(firebaseReady ? null : readDemoList(DEMO_KEY)[0] || null)
  const matchRef = useRef(match)
  matchRef.current = match

  useEffect(() => {
    if (!firebaseReady) return
    return onValue(ref(rtdb, 'rps/match'), (snap) => setMatch(snap.val()))
  }, [])

  // Shallow-merge into the match: a real RTDB update, or the local demo copy.
  async function patch(partial) {
    if (!firebaseReady) {
      const next = { ...matchRef.current, ...partial }
      for (const key of Object.keys(next)) if (next[key] === null) delete next[key]
      matchRef.current = next
      writeDemoList(DEMO_KEY, [next])
      setMatch(next)
      return
    }
    await update(ref(rtdb, 'rps/match'), partial)
  }

  async function startMatch() {
    if (!user) return
    const next = {
      hostUid: user.uid,
      leftUid: user.uid,
      rightUid: effectivePartnerUid,
      status: 'playing',
      phase: 'countdown',
      round: 1,
      scores: {},
      winnerUid: null,
    }
    if (!firebaseReady) {
      matchRef.current = next
      writeDemoList(DEMO_KEY, [next])
      setMatch(next)
      return
    }
    await set(ref(rtdb, 'rps/match'), next)
  }

  async function pick(choice) {
    if (!user || !matchRef.current) return
    if (!firebaseReady) {
      await patch({ picks: { ...(matchRef.current.picks || {}), [user.uid]: choice } })
      return
    }
    await update(ref(rtdb, 'rps/match'), { [`picks/${user.uid}`]: choice })
  }

  const isHost = !!match && match.hostUid === user?.uid

  // Referee (host only): resolve at the end of the countdown, advance after
  // the reveal.
  useEffect(() => {
    if (!isHost || match.status !== 'playing') return
    let timer
    if (match.phase === 'countdown') {
      timer = setTimeout(() => {
        const m = matchRef.current
        const picks = m.picks || {}
        const leftPick = picks[m.leftUid]
        const rightPick = picks[m.rightUid]
        const side = roundWinner(leftPick, rightPick)
        const roundWinnerUid = side === 'left' ? m.leftUid : side === 'right' ? m.rightUid : null
        const scores = { ...(m.scores || {}) }
        if (roundWinnerUid) scores[roundWinnerUid] = (scores[roundWinnerUid] || 0) + 1
        patch({
          phase: 'reveal',
          scores,
          reveal: { leftPick: leftPick || null, rightPick: rightPick || null, winnerUid: roundWinnerUid },
        })
      }, COUNTDOWN_FROM * 1000 + RESOLVE_GRACE_MS)
    } else if (match.phase === 'reveal') {
      timer = setTimeout(() => {
        const m = matchRef.current
        const matchWinner = Object.keys(m.scores || {}).find((uid) => m.scores[uid] >= WINS_NEEDED)
        if (matchWinner) {
          patch({ status: 'finished', winnerUid: matchWinner })
        } else {
          patch({ phase: 'countdown', round: m.round + 1, picks: null, reveal: null })
        }
      }, REVEAL_MS)
    }
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, match?.status, match?.phase, match?.round])

  // Demo mode has no real partner: pick for them shortly into each countdown.
  useEffect(() => {
    if (firebaseReady || !match || match.status !== 'playing' || match.phase !== 'countdown') return
    const timer = setTimeout(() => {
      const m = matchRef.current
      if (!m || m.phase !== 'countdown') return
      const choice = CHOICES[Math.floor(Math.random() * CHOICES.length)]
      patch({ picks: { ...(m.picks || {}), [DEMO_PARTNER_UID]: choice } })
    }, 1200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status, match?.phase, match?.round])

  // Either player can end the match; both land back on the lobby.
  async function endGame() {
    if (!user || !matchRef.current) return
    await patch({ status: 'ended', endedBy: user.uid })
  }

  return { match, myUid: user?.uid, effectivePartnerUid, startMatch, pick, endGame }
}
