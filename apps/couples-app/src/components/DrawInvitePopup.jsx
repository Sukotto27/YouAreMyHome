import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useDrawInvite } from '../hooks/useDrawInvite'

const DISMISS_KEY_PREFIX = 'you-are-my-home:draw-invite-dismissed:'
const STALE_MS = 5 * 60 * 1000

function toMillis(value) {
  if (!value) return null
  if (typeof value.toMillis === 'function') return value.toMillis()
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

// Live counterpart to the push notification sent by notifyOnDrawInvite —
// shown to whoever already has the app open when their partner taps
// "Invite to draw." Same fixed inset-0 z-30 overlay template as NamePrompt/
// CheckInReminder; dismissing is per-invite (sessionStorage keyed by invite
// id) so a later, separate invite still gets its own popup.
export default function DrawInvitePopup() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { incoming } = useDrawInvite()
  const [dismissedId, setDismissedId] = useState(null)

  if (!user || !incoming) return null

  const createdMs = toMillis(incoming.createdAt)
  const isStale = !createdMs || Date.now() - createdMs > STALE_MS
  const isDismissed = dismissedId === incoming.id || sessionStorage.getItem(DISMISS_KEY_PREFIX + incoming.id) === '1'
  if (isStale || isDismissed) return null

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY_PREFIX + incoming.id, '1')
    setDismissedId(incoming.id)
  }

  function acceptInvite() {
    dismiss()
    navigate('/games', { state: { view: 'draw' } })
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 text-center shadow-xl">
        <h2 className="font-display text-2xl italic text-ink">🎨 Draw together?</h2>
        <p className="mt-1 font-body text-sm text-ink-soft">{incoming.fromName} wants to draw with you right now.</p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={acceptInvite}
            className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            Let's draw
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
