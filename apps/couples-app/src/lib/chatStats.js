import { collection, doc, getCountFromServer, runTransaction } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { todayKey } from './dailyGoals'

// The day we first said "hi" (see lib/migrations.js's history seed) — the
// couple's own account of it is that we haven't gone a single day since
// without texting, so a brand-new stats/chatStreak doc trusts that claim
// outright rather than requiring a scan of years of message history to
// verify it. Everything from here forward is tracked for real (see
// recordChatDayActivity below), so a genuine missed day still breaks it.
export const CHAT_STREAK_ANCHOR = '2024-01-18'

// Both 'YYYY-MM-DD', compared as UTC day numbers — dailyGoals.todayKey()
// already builds these from local Y/M/D, so treating them as UTC here is
// just an arbitrary-but-consistent epoch to diff against, not a timezone
// claim.
export function daysBetween(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86_400_000)
}

// Called right after a message actually sends (see Chat.jsx) — never from a
// page just being opened, since that wouldn't mean anyone actually texted
// today. A transaction (rather than check-then-write) so two near-
// simultaneous sends from both of us can't both decide the streak broke or
// both re-seed it. Cheap to call on every send: it's a no-op past the first
// message of the day, and even that isn't a security-critical path — worst
// case on a dropped write is the same shared doc gets fixed by tomorrow's
// first message anyway.
export async function recordChatDayActivity() {
  if (!firebaseReady) return
  const today = todayKey()
  const ref = doc(db, 'stats', 'chatStreak')
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref)
      const data = snap.exists() ? snap.data() : null
      if (data?.lastMessageDay === today) return

      const gapDays = data ? daysBetween(data.lastMessageDay, today) : 0
      const currentStreakStart = !data ? CHAT_STREAK_ANCHOR : gapDays > 1 ? today : data.currentStreakStart
      transaction.set(ref, { currentStreakStart, lastMessageDay: today }, { merge: true })
    })
  } catch {
    // Best-effort — a dropped write here just means tomorrow's first
    // message reconciles it instead.
  }
}

// A live count of every message ever exchanged, not just what's currently
// loaded in Chat (which windows to RECENT_LIMIT) — an aggregation query
// costs one read regardless of collection size, so this is cheap even after
// years of history, unlike fetching every doc just to count them.
export async function fetchTotalMessageCount() {
  if (!firebaseReady) return 0
  const snap = await getCountFromServer(collection(db, 'messages'))
  return snap.data().count
}
