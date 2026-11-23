import { useEffect, useState } from 'react'
import { onValue, ref, remove, set, update } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { COMPUTER_UID, readSolo, writeSolo } from '../lib/solo'
import { BALL_CENTER, DEFAULT_TARGET_SCORE } from '../lib/pong'

export const DEMO_PARTNER_UID = 'demo-partner'
const DEMO_KEY = 'pongMatch'
export const SOLO_KEY = 'pongSolo'

// One ever-live match in Realtime Database, same shape as Obstacle Drop's.
// The host (whoever starts the match, always the left/bottom player) runs the
// ball physics and is the only one who records scores; see PongGame.
export function usePongMatch(solo = false) {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  // Solo and preview mode both play on this device, against the AI paddle.
  const local = solo || !firebaseReady
  const effectivePartnerUid = solo ? COMPUTER_UID : firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const [match, setMatch] = useState(solo ? readSolo(SOLO_KEY) : firebaseReady ? null : readDemoList(DEMO_KEY)[0] || null)

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
    return onValue(ref(rtdb, 'pong/match'), (snap) => setMatch(snap.val()))
  }, [solo])

  function saveLocal(next) {
    if (next.solo) writeSolo(SOLO_KEY, next)
    else writeDemoList(DEMO_KEY, [next])
    setMatch(next)
  }

  async function startMatch(targetScore = DEFAULT_TARGET_SCORE, asSolo = solo) {
    if (!user) return
    const next = {
      hostUid: user.uid,
      leftUid: user.uid,
      rightUid: asSolo ? COMPUTER_UID : effectivePartnerUid,
      ...(asSolo ? { solo: true } : {}),
      targetScore,
      scores: {},
      status: 'playing',
      winnerUid: null,
    }
    if (asSolo || !firebaseReady) {
      saveLocal(next)
      return
    }
    await Promise.all([
      remove(ref(rtdb, 'pong/paddles')),
      set(ref(rtdb, 'pong/state'), { ...BALL_CENTER, vx: 0, vy: 0, hits: 0 }),
      set(ref(rtdb, 'pong/match'), next),
    ])
  }

  // Host only — called whenever a point is scored.
  async function recordGoal(uid) {
    if (!match || match.status !== 'playing') return
    const scores = { ...match.scores }
    scores[uid] = (scores[uid] || 0) + 1
    let status = match.status
    let winnerUid = null
    if (scores[uid] >= match.targetScore) {
      status = 'finished'
      winnerUid = uid
    }
    if (local) {
      saveLocal({ ...match, scores, status, winnerUid })
      return
    }
    await update(ref(rtdb, 'pong/match'), { scores, status, winnerUid })
  }

  // Either player can end the match; both land back on the lobby.
  async function endGame() {
    if (!user || !match) return
    const patch = { status: 'ended', endedBy: user.uid }
    if (local) {
      saveLocal({ ...match, ...patch })
      return
    }
    await update(ref(rtdb, 'pong/match'), patch)
  }

  return { match, effectivePartnerUid, startMatch, recordGoal, endGame }
}
