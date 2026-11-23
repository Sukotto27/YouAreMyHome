import { useEffect, useState } from 'react'
import { onValue, ref, remove, set, update } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { myNameFor } from '../lib/names'

// The co-op session record for Doors: who the host is and which character each
// of you plays. Scott is always Blue and Cristina always Pink, decided by name so
// both phones agree without negotiating. The game itself is shared by
// doors/coopNet.js; this is just the lobby's side.
export function useDoorsMatch() {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const [match, setMatch] = useState(null)
  const [loaded, setLoaded] = useState(!firebaseReady)

  useEffect(() => {
    if (!firebaseReady) return
    return onValue(ref(rtdb, 'doors/match'), (snap) => {
      setMatch(snap.val())
      setLoaded(true)
    })
  }, [])

  async function startMatch() {
    if (!user || !partnerUid) return
    const mine = myNameFor(user) === 'Scott' ? 'blue' : 'pink'
    const next = {
      hostUid: user.uid,
      roles: { [user.uid]: mine, [partnerUid]: mine === 'blue' ? 'pink' : 'blue' },
      createdAt: Date.now(),
      status: 'playing',
    }
    await Promise.all([
      remove(ref(rtdb, 'doors/state')),
      remove(ref(rtdb, 'doors/input')),
      remove(ref(rtdb, 'doors/cmds')),
      set(ref(rtdb, 'doors/match'), next),
    ])
  }

  async function endMatch() {
    if (!user) return
    await update(ref(rtdb, 'doors/match'), { status: 'ended', endedBy: user.uid })
  }

  return { match, loaded, partnerUid, myUid: user?.uid, startMatch, endMatch }
}
