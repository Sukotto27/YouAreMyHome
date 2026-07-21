import { useEffect, useState } from 'react'
import { onValue, ref, remove, serverTimestamp as rtdbServerTimestamp, set, update } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { BALL_START, DEFAULT_TARGET_SCORE } from '../lib/obstacleDrop'

export const DEMO_PARTNER_UID = 'demo-partner'
const DEMO_KEY = 'obstacleDropMatch'

// A single ever-live match, same "one shared doc, not per-round docs" shape
// as Farkle — but in Realtime Database rather than Firestore, since the
// ball's position needs to stream several times a second (see
// ObstacleDropGame's physics loop) and RTDB is what the rest of the app
// already reaches for whenever something needs to be genuinely live (Draw's
// canvas, Thumbkiss). The host — whoever calls startMatch — becomes the
// left-hole player and the physics authority; see ObstacleDropGame for how
// that authority is actually used.
export function useObstacleDropMatch() {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const effectivePartnerUid = firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const [match, setMatch] = useState(firebaseReady ? null : readDemoList(DEMO_KEY)[0] || null)

  useEffect(() => {
    if (!firebaseReady) return
    return onValue(ref(rtdb, 'obstacleDrop/match'), (snap) => {
      setMatch(snap.val())
    })
  }, [])

  async function startMatch(targetScore = DEFAULT_TARGET_SCORE) {
    if (!user) return
    const next = {
      hostUid: user.uid,
      leftUid: user.uid,
      rightUid: effectivePartnerUid,
      targetScore,
      scores: {},
      status: 'playing',
      winnerUid: null,
    }

    if (!firebaseReady) {
      writeDemoList(DEMO_KEY, [next])
      setMatch(next)
      return
    }

    await Promise.all([
      remove(ref(rtdb, 'obstacleDrop/obstacles')),
      set(ref(rtdb, 'obstacleDrop/ball'), { ...BALL_START, vx: 0, vy: 0 }),
      set(ref(rtdb, 'obstacleDrop/match'), { ...next, createdAt: rtdbServerTimestamp() }),
    ])
  }

  // Called by the host only, whenever a round ends (goal or miss) — misses
  // pass uid: null, just bumping nothing but signaling a fresh drop.
  async function recordGoal(uid) {
    if (!match || match.status !== 'playing') return
    const scores = { ...match.scores }
    let status = match.status
    let winnerUid = null
    if (uid) {
      scores[uid] = (scores[uid] || 0) + 1
      if (scores[uid] >= match.targetScore) {
        status = 'finished'
        winnerUid = uid
      }
    }

    if (!firebaseReady) {
      const next = { ...match, scores, status, winnerUid }
      writeDemoList(DEMO_KEY, [next])
      setMatch(next)
      return
    }
    await update(ref(rtdb, 'obstacleDrop/match'), { scores, status, winnerUid })
  }

  return { match, myUid: user?.uid, effectivePartnerUid, startMatch, recordGoal }
}
