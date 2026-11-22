import { useEffect, useState } from 'react'
import { onDisconnect, onValue, ref, remove, set } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'

const BEAT_MS = 30 * 1000
const STALE_MS = 90 * 1000

// Tells your partner which game you currently have open: while `game` is set,
// writes `gamePresence/{uid}` with a heartbeat, and removes it on leaving the
// game (or when the connection drops, via onDisconnect). A heartbeat that
// stops for 90s is treated as gone, covering a killed app that never got to
// clean up.
export function usePublishGamePresence(game) {
  const { user } = useAuth()
  useEffect(() => {
    if (!firebaseReady || !user || !game) return
    const node = ref(rtdb, `gamePresence/${user.uid}`)
    const beat = () => set(node, { game, at: Date.now() }).catch(() => {})
    onDisconnect(node).remove().catch(() => {})
    beat()
    const timer = setInterval(beat, BEAT_MS)
    return () => {
      clearInterval(timer)
      remove(node).catch(() => {})
    }
  }, [user, game])
}

// The game key your partner currently has open, or null.
export function usePartnerGame() {
  const { user } = useAuth()
  const [state, setState] = useState({ all: null, now: Date.now() })

  useEffect(() => {
    if (!firebaseReady || !user) return
    const unsubscribe = onValue(ref(rtdb, 'gamePresence'), (snap) =>
      setState({ all: snap.val(), now: Date.now() }),
    )
    // Re-evaluate staleness even when nothing changes in the database.
    const timer = setInterval(() => setState((s) => ({ ...s, now: Date.now() })), BEAT_MS)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
  }, [user])

  if (!user || !state.all) return null
  for (const [uid, entry] of Object.entries(state.all)) {
    if (uid !== user.uid && entry?.game && state.now - entry.at < STALE_MS) return entry.game
  }
  return null
}
