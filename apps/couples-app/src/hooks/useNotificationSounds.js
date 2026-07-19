import { useEffect, useRef } from 'react'
import { playSound } from '../lib/sounds'

// Plays a sound whenever a feature's unread flag flips from false to true —
// "chat" gets its own new_chat sound, everything else (qa/scrapbook/
// gallery/mail/milestones, including comments on any of those) shares the
// generic notification sound. Takes the Shell's already-computed
// useUnreadBadges() result rather than subscribing again itself, so this
// doesn't double up the underlying Firestore listeners.
export function useNotificationSounds(unread) {
  const prevRef = useRef(unread)

  useEffect(() => {
    const prev = prevRef.current
    for (const key of Object.keys(unread)) {
      if (unread[key] && !prev[key]) {
        playSound(key === 'chat' ? 'new_chat' : 'notification')
      }
    }
    prevRef.current = unread
  }, [unread])
}
