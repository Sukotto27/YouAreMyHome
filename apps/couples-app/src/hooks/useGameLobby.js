import { useEffect, useRef, useState } from 'react'
import { onValue, ref, remove, runTransaction, set } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { useGameInvite } from './useGameInvite'
import { readDemoList, writeDemoList } from '../lib/demoStore'

export const DEMO_PARTNER_UID = 'demo-partner'
const DEMO_EVENT = 'you-are-my-home:demo-lobby'

// The waiting room that sits in front of every live co-op game.
//
// A lobby is one small node per game in Realtime Database —
//   lobbies/{gameKey} = { hostUid, ready: { [uid]: true }, options, startedBy, createdAt }
// — and it stays there until someone cancels it or the match starts, so
// leaving the page and coming back lands on the same waiting room. The match
// itself starts once BOTH players have pressed "Ready": whichever press
// completes the pair wins a transaction (`startedBy`) and runs the game's own
// start function, so it only ever starts once even if both press at the same
// moment.
export function useGameLobby(gameKey, gameLabel, onStart) {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const effectivePartnerUid = firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const { sendInvite } = useGameInvite(gameKey, gameLabel)
  const demoKey = `lobby-${gameKey}`
  const [lobby, setLobby] = useState(() => (firebaseReady ? null : readDemoList(demoKey)[0] || null))
  const [loaded, setLoaded] = useState(!firebaseReady)
  const onStartRef = useRef(onStart)
  onStartRef.current = onStart

  useEffect(() => {
    if (!firebaseReady) {
      const sync = () => setLobby(readDemoList(demoKey)[0] || null)
      window.addEventListener(DEMO_EVENT, sync)
      return () => window.removeEventListener(DEMO_EVENT, sync)
    }
    return onValue(ref(rtdb, `lobbies/${gameKey}`), (snap) => {
      setLobby(snap.val())
      setLoaded(true)
    })
  }, [gameKey, demoKey])

  function writeDemo(next) {
    writeDemoList(demoKey, next ? [next] : [])
    window.dispatchEvent(new Event(DEMO_EVENT))
  }

  // Preview mode has no second device: the stand-in partner presses Ready a
  // moment after the room opens, so the whole flow can be seen on one screen.
  useEffect(() => {
    if (firebaseReady || !lobby || lobby.ready?.[DEMO_PARTNER_UID]) return
    const timer = setTimeout(() => {
      const current = readDemoList(demoKey)[0]
      if (current) writeDemo({ ...current, ready: { ...current.ready, [DEMO_PARTNER_UID]: true } })
    }, 1800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby?.createdAt, lobby?.ready?.[DEMO_PARTNER_UID]])

  // Opens a waiting room (with the game's chosen options, e.g. a board size)
  // and pings your partner. You still have to press Ready yourself.
  async function openLobby(options = null) {
    if (!user) return
    const next = { hostUid: user.uid, ready: {}, options, createdAt: Date.now() }
    if (!firebaseReady) writeDemo(next)
    else await set(ref(rtdb, `lobbies/${gameKey}`), next)
    if (firebaseReady) sendInvite().catch(() => {})
  }

  async function cancelLobby() {
    if (!firebaseReady) writeDemo(null)
    else await remove(ref(rtdb, `lobbies/${gameKey}`))
  }

  async function startFrom(current) {
    try {
      await onStartRef.current?.(current.options || undefined)
    } finally {
      if (!firebaseReady) writeDemo(null)
      else await remove(ref(rtdb, `lobbies/${gameKey}`)).catch(() => {})
    }
  }

  // Ready / not ready. Pressing Ready as the second player starts the match.
  async function toggleReady() {
    if (!user || !lobby) return
    if (!firebaseReady) {
      const wasReady = !!lobby.ready?.[user.uid]
      const ready = { ...lobby.ready, [user.uid]: !wasReady }
      const both = ready[user.uid] && ready[effectivePartnerUid]
      if (both) {
        await startFrom({ ...lobby, ready })
      } else {
        writeDemo({ ...lobby, ready })
      }
      return
    }
    const result = await runTransaction(ref(rtdb, `lobbies/${gameKey}`), (current) => {
      if (!current) return current
      const ready = { ...(current.ready || {}) }
      ready[user.uid] = !ready[user.uid]
      if (!ready[user.uid]) delete ready[user.uid]
      const next = { ...current, ready }
      if (ready[user.uid] && effectivePartnerUid && ready[effectivePartnerUid] && !current.startedBy) {
        next.startedBy = user.uid
      }
      return next
    })
    const value = result.snapshot.val()
    if (result.committed && value?.startedBy === user.uid) await startFrom(value)
  }

  const myReady = !!lobby?.ready?.[user?.uid]
  const partnerReady = !!lobby?.ready?.[effectivePartnerUid]

  return {
    lobby,
    loaded,
    myReady,
    partnerReady,
    effectivePartnerUid,
    openLobby,
    cancelLobby,
    toggleReady,
    resendInvite: () => sendInvite(),
  }
}
