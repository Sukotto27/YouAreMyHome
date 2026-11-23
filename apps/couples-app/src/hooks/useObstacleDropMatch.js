import { useEffect, useState } from 'react'
import { onValue, ref, remove, serverTimestamp as rtdbServerTimestamp, set, update } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { COMPUTER_UID, readSolo, writeSolo } from '../lib/solo'
import { BALL_START, DEFAULT_TARGET_SCORE, generateBumpers } from '../lib/obstacleDrop'

export const DEMO_PARTNER_UID = 'demo-partner'
const DEMO_KEY = 'obstacleDropMatch'
export const SOLO_KEY = 'obstacleDropSolo'

// A single ever-live match, same "one shared doc, not per-round docs" shape
// as Farkle — but in Realtime Database rather than Firestore, since the
// ball's position needs to stream several times a second (see
// ObstacleDropGame's physics loop) and RTDB is what the rest of the app
// already reaches for whenever something needs to be genuinely live (Draw's
// canvas, Thumbkiss). The host — whoever calls startMatch — becomes the
// left-hole player and the physics authority; see ObstacleDropGame for how
// that authority is actually used.
export function useObstacleDropMatch(solo = false) {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  // Solo and preview mode both play on this device.
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
    return onValue(ref(rtdb, 'obstacleDrop/match'), (snap) => {
      setMatch(snap.val())
    })
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
      bumpers: generateBumpers(),
      status: 'playing',
      winnerUid: null,
    }

    if (asSolo || !firebaseReady) {
      saveLocal(next)
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

    // every drop gets a new random set of bumpers
    const bumpers = generateBumpers()
    if (local) {
      saveLocal({ ...match, scores, status, winnerUid, bumpers })
      return
    }
    await update(ref(rtdb, 'obstacleDrop/match'), { scores, status, winnerUid, bumpers })
  }

  // Either player can end the match; both land back on the lobby.
  async function endGame() {
    if (!user || !match) return
    const patch = { status: 'ended', endedBy: user.uid }
    if (local) {
      saveLocal({ ...match, ...patch })
      return
    }
    await update(ref(rtdb, 'obstacleDrop/match'), patch)
  }

  return { match, myUid: user?.uid, effectivePartnerUid, startMatch, recordGoal, endGame }
}
