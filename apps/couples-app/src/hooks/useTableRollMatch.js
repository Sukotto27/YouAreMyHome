import { useEffect, useRef, useState } from 'react'
import { onValue, ref, remove, set, update } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { COMPUTER_UID, readSolo, writeSolo } from '../lib/solo'
import { BALLS_EACH, randomSetup } from '../lib/tableRoll'

export const DEMO_PARTNER_UID = 'demo-partner'
const DEMO_KEY = 'tableRollMatch'
export const SOLO_KEY = 'tableRollSolo'

// Applies an RTDB-style multi-path patch ({ 'ready/uid': true, status: 'x' })
// to a plain object, so local (solo / preview) play behaves like the database.
function applyPatch(base, partial) {
  const next = { ...base }
  for (const [path, value] of Object.entries(partial)) {
    const parts = path.split('/')
    let node = next
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = { ...(node[parts[i]] || {}) }
      node = node[parts[i]]
    }
    const last = parts[parts.length - 1]
    if (value === null) delete node[last]
    else node[last] = value
  }
  return next
}

// One ever-live match in Realtime Database, turn-based. Positions of every
// ball live in `match.balls[uid]` (host frame, see lib/tableRoll.js). While a
// shot is rolling, the shooter's device runs the physics and streams the
// positions to `tableRoll/state` (the other screen just draws them); when the
// shot comes to rest, the shooter writes the final positions back to the match.
// In Play Solo the computer's setup and shots run on this device.
export function useTableRollMatch(solo = false) {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const local = solo || !firebaseReady
  const botUid = solo ? COMPUTER_UID : DEMO_PARTNER_UID
  const effectivePartnerUid = solo ? COMPUTER_UID : firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const [match, setMatch] = useState(solo ? readSolo(SOLO_KEY) : firebaseReady ? null : readDemoList(DEMO_KEY)[0] || null)
  const matchRef = useRef(match)
  matchRef.current = match
  const streamRef = useRef(null) // the shooter's latest streamed positions

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
    const offMatch = onValue(ref(rtdb, 'tableRoll/match'), (snap) => setMatch(snap.val()))
    const offState = onValue(ref(rtdb, 'tableRoll/state'), (snap) => {
      streamRef.current = snap.val()
    })
    return () => {
      offMatch()
      offState()
    }
  }, [solo])

  function saveLocal(next) {
    matchRef.current = next
    if (next.solo) writeSolo(SOLO_KEY, next)
    else writeDemoList(DEMO_KEY, [next])
    setMatch(next)
  }

  async function patch(partial) {
    if (local) {
      saveLocal(applyPatch(matchRef.current || {}, partial))
      return
    }
    await update(ref(rtdb, 'tableRoll/match'), partial)
  }

  async function startMatch(asSolo = solo) {
    if (!user) return
    const next = {
      hostUid: user.uid,
      leftUid: user.uid,
      rightUid: asSolo ? COMPUTER_UID : effectivePartnerUid,
      ...(asSolo ? { solo: true } : {}),
      createdAt: Date.now(),
      status: 'setup',
      ready: {},
      balls: {},
      turnUid: null,
      shooting: false,
      shotSeq: 0,
      winnerUid: null,
    }
    streamRef.current = null
    if (asSolo || !firebaseReady) {
      saveLocal(next)
      return
    }
    await Promise.all([remove(ref(rtdb, 'tableRoll/state')), set(ref(rtdb, 'tableRoll/match'), next)])
  }

  // Lock in your setup: your balls become part of the match (the other side
  // only gets to see them once the game starts).
  async function submitSetup(balls) {
    if (!user) return
    await patch({ [`balls/${user.uid}`]: balls, [`ready/${user.uid}`]: true })
  }

  // The shooter's device calls this ~25 times a second while a shot rolls.
  function publish(seq, flat, shooter) {
    if (local) return
    set(ref(rtdb, 'tableRoll/state'), { seq, p: flat, s: shooter }).catch(() => {})
  }

  async function endGame() {
    if (!user || !matchRef.current) return
    await patch({ status: 'ended', endedBy: user.uid, shooting: false })
  }

  // Host: once both are set up, start playing (the host rolls first).
  const leftReady = !!match?.ready?.[match?.leftUid]
  const rightReady = !!match?.ready?.[match?.rightUid]
  useEffect(() => {
    const m = matchRef.current
    if (!m || m.status !== 'setup' || m.hostUid !== user?.uid || !leftReady || !rightReady) return
    patch({ status: 'playing', turnUid: m.leftUid })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status, leftReady, rightReady])

  // Preview mode and solo have no second device: the stand-in sets up its balls shortly after the match opens.
  useEffect(() => {
    if (!local || !match || match.status !== 'setup' || match.ready?.[botUid]) return
    const timer = setTimeout(() => {
      const m = matchRef.current
      if (!m || m.status !== 'setup' || m.ready?.[botUid]) return
      patch({ [`balls/${botUid}`]: randomSetup(1, BALLS_EACH), [`ready/${botUid}`]: true })
    }, 1200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, match?.status, match?.createdAt])

  return { match, myUid: user?.uid, effectivePartnerUid, botUid, streamRef, startMatch, submitSetup, patch, publish, endGame }
}
