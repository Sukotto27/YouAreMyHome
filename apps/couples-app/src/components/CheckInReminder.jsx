import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCheckIn } from '../hooks/useCheckIn'

const DISMISS_KEY_PREFIX = 'you-are-my-home:checkin-dismissed:'

// Nudges each person to fill out the Journal's daily check-in once a day.
// Gated on the same "does today's checkins doc exist" signal useCheckIn
// already tracks for the panel itself — no separate reminder/streak state.
// Dismissing only snoozes it for the rest of today (sessionStorage keyed by
// date), so — unlike InstallBanner/NotificationBanner's permanent localStorage
// dismissal — it resurfaces naturally tomorrow instead of being silenced for good.
export default function CheckInReminder() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { myCheckIn, date } = useCheckIn()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY_PREFIX + date) === '1')
  }, [date])

  // Only ever show after NamePrompt has resolved (same fixed inset-0 z-30
  // overlay slot — the two are mutually exclusive by design).
  if (!user || !user.displayName || myCheckIn || dismissed) return null

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY_PREFIX + date, '1')
    setDismissed(true)
  }

  function checkInNow() {
    dismiss()
    navigate('/journal', { state: { tab: 'status' } })
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 text-center shadow-xl">
        <h2 className="font-display text-2xl italic text-ink">Daily check-in</h2>
        <p className="mt-1 font-body text-sm text-ink-soft">
          How are you doing today? Take a minute for yourself in the Journal.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={checkInNow}
            className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            Check in
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full border border-ink/15 px-6 py-2.5 font-body font-medium text-ink-soft transition-colors hover:border-rose hover:text-rose"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
