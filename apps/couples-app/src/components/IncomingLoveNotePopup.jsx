import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLoveNotes } from '../hooks/useLoveNotes'

const DISMISS_KEY_PREFIX = 'you-are-my-home:love-note-dismissed:'
const STALE_MS = 5 * 60 * 1000

function toMillis(value) {
  if (!value) return null
  if (typeof value.toMillis === 'function') return value.toMillis()
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

// Live counterpart to the push notification sent by notifyOnLoveNote —
// shown to whoever already has the app open when their partner sends a kiss
// or love note from the SendLoveMenu. Same fixed inset-0 z-30 overlay
// template as GameInvitePopup, dismissed per-note (sessionStorage keyed by
// note id) so a later, separate note still gets its own popup.
export default function IncomingLoveNotePopup() {
  const { user } = useAuth()
  const { incoming, sendReply } = useLoveNotes()
  const [dismissedId, setDismissedId] = useState(null)
  const [replied, setReplied] = useState(false)

  if (!user || !incoming) return null

  const createdMs = toMillis(incoming.createdAt)
  const isStale = !createdMs || Date.now() - createdMs > STALE_MS
  const isDismissed = dismissedId === incoming.id || sessionStorage.getItem(DISMISS_KEY_PREFIX + incoming.id) === '1'
  if (isStale || isDismissed) return null

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY_PREFIX + incoming.id, '1')
    setDismissedId(incoming.id)
    setReplied(false)
  }

  function reply() {
    sendReply(incoming)
    setReplied(true)
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 text-center shadow-xl">
        <p className="text-4xl">{incoming.emoji}</p>
        <p className="mt-3 font-display text-xl italic text-ink">{incoming.message}</p>
        <div className="mt-5 flex justify-center gap-3">
          {!replied && (
            <button
              type="button"
              onClick={reply}
              className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
            >
              Send one back
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full border border-ink/15 px-6 py-2.5 font-body font-medium text-ink-soft transition-colors hover:border-rose hover:text-rose"
          >
            {replied ? 'Close' : 'Not now'}
          </button>
        </div>
      </div>
    </div>
  )
}
