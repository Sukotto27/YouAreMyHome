import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { todayKey } from '../lib/dailyGoals'
import { CHAT_STREAK_ANCHOR, daysBetween, fetchTotalMessageCount } from '../lib/chatStats'

// Total exchanged + the current daily streak, for the "chat settings" stats
// readout (see ChatCustomizationPanel). Streak math lives here (not in
// lib/chatStats.js) so it can react live to stats/chatStreak the moment the
// other device's message updates it — the total, by contrast, is a one-shot
// aggregation fetch (see fetchTotalMessageCount) since there's no cheap way
// to listen to a count live.
export function useChatStats() {
  const [totalMessages, setTotalMessages] = useState(null)
  const [streakDoc, setStreakDoc] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchTotalMessageCount().then((count) => {
      if (!cancelled) setTotalMessages(count)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!firebaseReady) return
    return onSnapshot(doc(db, 'stats', 'chatStreak'), (snap) => {
      setStreakDoc(snap.exists() ? snap.data() : null)
    })
  }, [])

  const today = todayKey()
  const streakStart = streakDoc?.currentStreakStart || CHAT_STREAK_ANCHOR
  // No doc yet (feature just shipped, nobody's texted since) reads as "still
  // going" — see recordChatDayActivity's same trust-the-claim seed. Once a
  // real gap actually happens, the next message's write resets this doc and
  // this stops trusting it blindly.
  const gapDays = streakDoc?.lastMessageDay ? daysBetween(streakDoc.lastMessageDay, today) : 0
  const streakDays = gapDays > 1 ? 0 : daysBetween(streakStart, today) + 1

  return { totalMessages, streakDays, streakStart }
}
