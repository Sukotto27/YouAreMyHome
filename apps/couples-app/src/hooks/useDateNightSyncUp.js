import { useEffect, useState } from 'react'
import { onValue, ref, serverTimestamp, set } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { zonedTimeToUtc } from '../lib/timezone'

// Same ±1h window as the Home page's countdown icon (useUpcomingDateNight.js).
const WINDOW_MS = 60 * 60 * 1000
const COUNTDOWN_SECONDS = 5

// Ready/countdown state lives in Realtime Database rather than Firestore —
// this is exactly the ephemeral "is my partner doing this right now" sync
// useThumbkiss.js already uses RTDB for. Each occurrence's state is stamped
// with `occurrenceDate` so a stale ready-check from a *previous* occurrence
// of a recurring Date Night is ignored once functions/index.js rolls
// `nextOccurrenceDate` forward — mirrors how `remindersSent` resets there.
export function useDateNightSyncUp(item) {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const [now, setNow] = useState(() => Date.now())
  const [syncState, setSyncState] = useState(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!firebaseReady || !item?.id) return
    return onValue(ref(rtdb, `dateNightSync/${item.id}`), (snap) => {
      setSyncState(snap.val() || {})
    })
  }, [item?.id])

  const occurrenceDate = item.nextOccurrenceDate || item.date
  const startInstant = item.time && item.timezone ? zonedTimeToUtc(occurrenceDate, item.time, item.timezone) : null
  const msUntilStart = startInstant ? startInstant.getTime() - now : null
  const isAboutToStart =
    !item.completed && msUntilStart !== null && msUntilStart <= WINDOW_MS && msUntilStart >= -WINDOW_MS
  const hasReachedStartTime = msUntilStart !== null && msUntilStart <= 0

  const myEntry = user ? syncState?.[user.uid] : null
  const partnerEntry = partnerUid ? syncState?.[partnerUid] : null
  const myReady = !!(myEntry?.ready && myEntry.occurrenceDate === occurrenceDate)
  const partnerReady = !!(partnerEntry?.ready && partnerEntry.occurrenceDate === occurrenceDate)
  const bothReady = myReady && partnerReady

  const countdown = syncState?.countdown
  const countdownActive = countdown?.occurrenceDate === occurrenceDate && typeof countdown?.startAt === 'number'
  const secondsRemaining = countdownActive
    ? Math.max(0, COUNTDOWN_SECONDS - Math.floor((now - countdown.startAt) / 1000))
    : null
  const syncComplete = countdownActive && secondsRemaining === 0

  // Whichever device notices "both ready" first stamps the shared countdown
  // anchor; a near-simultaneous double-write from both devices is harmless
  // since both land within a fraction of a second of the true moment. If
  // someone un-readies before the countdown finishes, clear it so a rejoin
  // starts a fresh 5 seconds instead of resuming a stale one.
  useEffect(() => {
    if (!firebaseReady || !item?.id) return
    if (bothReady && !countdownActive) {
      set(ref(rtdb, `dateNightSync/${item.id}/countdown`), { startAt: serverTimestamp(), occurrenceDate })
    } else if (!bothReady && countdownActive && !syncComplete) {
      set(ref(rtdb, `dateNightSync/${item.id}/countdown`), null)
    }
  }, [bothReady, countdownActive, syncComplete, item?.id, occurrenceDate])

  function toggleReady() {
    if (!firebaseReady || !user || !item?.id) return
    set(ref(rtdb, `dateNightSync/${item.id}/${user.uid}`), { ready: !myReady, occurrenceDate })
  }

  return {
    isAboutToStart,
    hasReachedStartTime,
    msUntilStart,
    myReady,
    partnerReady,
    bothReady,
    secondsRemaining,
    syncComplete,
    toggleReady,
  }
}
