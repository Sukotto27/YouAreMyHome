import { useEffect, useState } from 'react'
import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'

export const DEMO_PARTNER_UID = 'demo-partner'
const RECENT_LIMIT = 5
const DEMO_EVENT = 'you-are-my-home:demo-draw-invite'

// A "come draw with me right now" ping. The write itself does double duty:
// a Cloud Function trigger (notifyOnDrawInvite) turns it into a push
// notification, while this hook's live onSnapshot listener is what drives
// the in-app popup for whoever's already got the app open. Only the last
// few invites are ever fetched, and "which one is for me" is just "not the
// one I sent" — same everyone-but-me convention as usePartnerUid/
// notifyPartner — so no composite index is needed.
export function useDrawInvite() {
  const { user } = useAuth()
  const [invites, setInvites] = useState([])

  useEffect(() => {
    if (!firebaseReady) {
      // Preview mode has no real Firestore subscription tying separate
      // mounted instances of this hook together (e.g. the invite button in
      // DrawGame and the popup in Shell) — a window event stands in so the
      // simulated partner reply (see sendInvite below) reaches both.
      function handleDemoInvite(event) {
        setInvites((prev) => [event.detail, ...prev])
      }
      window.addEventListener(DEMO_EVENT, handleDemoInvite)
      return () => window.removeEventListener(DEMO_EVENT, handleDemoInvite)
    }
    const invitesQuery = query(collection(db, 'drawInvites'), orderBy('createdAt', 'desc'), limit(RECENT_LIMIT))
    return onSnapshot(invitesQuery, (snapshot) => {
      setInvites(snapshot.docs.map((inviteDoc) => ({ id: inviteDoc.id, ...inviteDoc.data() })))
    })
  }, [])

  const incoming = invites.find((invite) => invite.fromUid !== user.uid) || null

  async function sendInvite() {
    if (!user) return
    const fromName = user.displayName || user.email

    if (!firebaseReady) {
      // No real partner device in preview mode — simulate one inviting back
      // a moment later, purely so the popup itself is visible to test.
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent(DEMO_EVENT, {
            detail: { id: crypto.randomUUID(), fromUid: DEMO_PARTNER_UID, fromName: 'Your partner', createdAt: new Date() },
          }),
        )
      }, 1200)
      return
    }

    await addDoc(collection(db, 'drawInvites'), {
      fromUid: user.uid,
      fromName,
      createdAt: serverTimestamp(),
    })
  }

  return { incoming, sendInvite }
}
