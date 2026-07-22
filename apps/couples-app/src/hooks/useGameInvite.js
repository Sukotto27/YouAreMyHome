import { useEffect, useState } from 'react'
import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'

export const DEMO_PARTNER_UID = 'demo-partner'
const RECENT_LIMIT = 10
const DEMO_EVENT = 'you-are-my-home:demo-game-invite'

// A "come play <game> with me right now" ping, shared by every game (Draw,
// Mad Libs, Never-Ending Story, Farkle, Obstacle Drop) instead of each
// having its own invite collection/trigger. The write does double duty: a
// Cloud Function trigger (notifyOnGameInvite) turns it into a push
// notification, while this hook's live onSnapshot listener drives the
// in-app popup (GameInvitePopup, mounted once at the Shell level) for
// whoever already has the app open.
//
// Pass a specific `gameKey` from a game screen's "Invite partner" button to
// send and to filter incoming invites down to that one game. Pass no
// gameKey (as GameInvitePopup does) to watch for an invite to ANY game.
export function useGameInvite(gameKey, gameLabel) {
  const { user } = useAuth()
  const [invites, setInvites] = useState([])

  useEffect(() => {
    if (!firebaseReady) {
      // Preview mode has no real Firestore subscription tying separate
      // mounted instances of this hook together (e.g. the invite button on
      // a game screen and the popup in Shell) — a window event stands in so
      // the simulated partner reply (see sendInvite below) reaches both.
      function handleDemoInvite(event) {
        setInvites((prev) => [event.detail, ...prev])
      }
      window.addEventListener(DEMO_EVENT, handleDemoInvite)
      return () => window.removeEventListener(DEMO_EVENT, handleDemoInvite)
    }
    const invitesQuery = query(collection(db, 'gameInvites'), orderBy('createdAt', 'desc'), limit(RECENT_LIMIT))
    return onSnapshot(invitesQuery, (snapshot) => {
      setInvites(snapshot.docs.map((inviteDoc) => ({ id: inviteDoc.id, ...inviteDoc.data() })))
    })
  }, [])

  const incoming =
    invites.find((invite) => invite.fromUid !== user.uid && (!gameKey || invite.game === gameKey)) || null

  async function sendInvite() {
    if (!user) return
    const fromName = user.displayName || user.email

    if (!firebaseReady) {
      // No real partner device in preview mode — simulate one inviting back
      // a moment later, purely so the popup itself is visible to test.
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent(DEMO_EVENT, {
            detail: {
              id: crypto.randomUUID(),
              fromUid: DEMO_PARTNER_UID,
              fromName: 'Your partner',
              game: gameKey,
              gameLabel,
              createdAt: new Date(),
            },
          }),
        )
      }, 1200)
      return
    }

    await addDoc(collection(db, 'gameInvites'), {
      fromUid: user.uid,
      fromName,
      game: gameKey,
      gameLabel,
      createdAt: serverTimestamp(),
    })
  }

  return { incoming, sendInvite }
}
