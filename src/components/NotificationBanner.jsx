import { useState } from 'react'
import { usePushNotifications } from '../hooks/usePushNotifications'

const DISMISS_KEY = 'you-are-my-home:notifications-dismissed'

export default function NotificationBanner() {
  const { permission, supported, enable } = usePushNotifications()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')
  const [requesting, setRequesting] = useState(false)

  if (!supported || permission === 'granted' || permission === 'denied' || dismissed) return null

  function dismiss() {
    setDismissed(true)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  async function handleEnable() {
    setRequesting(true)
    try {
      await enable()
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div className="relative mx-auto mb-2 flex w-full max-w-md items-center gap-3 rounded-2xl border border-rose/30 bg-blush-soft/50 px-4 py-3 text-left">
      <p className="flex-1 font-body text-sm text-ink">
        Get notified the moment the other one of us says or does something.
      </p>
      <button
        type="button"
        onClick={handleEnable}
        disabled={requesting}
        className="shrink-0 rounded-full bg-rose px-4 py-1.5 font-body text-sm font-medium text-paper disabled:opacity-60"
      >
        {requesting ? '…' : 'Enable'}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 font-body text-lg text-ink-soft transition-colors hover:text-rose"
      >
        ×
      </button>
    </div>
  )
}
