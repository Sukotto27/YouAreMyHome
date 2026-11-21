import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'

// Live list of one account's devices (devices/{uid}/list). Newest activity
// first. Only approved devices can read this — see firestore.rules.
export function useDevices(uid) {
  const [devices, setDevices] = useState([])

  useEffect(() => {
    if (!firebaseReady || !uid) {
      setDevices([])
      return
    }
    return onSnapshot(
      collection(db, 'devices', uid, 'list'),
      (snapshot) => {
        const next = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
        next.sort((a, b) => (b.lastSeenAt?.toMillis?.() || 0) - (a.lastSeenAt?.toMillis?.() || 0))
        setDevices(next)
      },
      () => setDevices([]),
    )
  }, [uid])

  return devices
}
