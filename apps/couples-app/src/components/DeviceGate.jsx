import { useAuth } from '../context/AuthContext'
import { describeDevice } from '../lib/deviceIdentity'

const COPY = {
  pending: {
    emoji: '⏳',
    title: 'Waiting for approval',
    body: "This looks like a new device. One of you needs to approve it from a device that's already trusted — we've sent a notification to both of you. This page updates by itself.",
  },
  blocked: {
    emoji: '⏳',
    title: 'Too many requests waiting',
    body: 'There are already several new-device requests pending. Open Settings → Devices on a trusted device and deny the ones you don’t recognise, then this one can ask again.',
  },
  denied: {
    emoji: '🚫',
    title: 'This device isn’t allowed',
    body: 'A request from this device was turned down, or it couldn’t be verified. If that’s a mistake, sign out and ask to be approved again from a trusted device.',
  },
  revoked: {
    emoji: '🚫',
    title: 'This device was removed',
    body: 'It was removed from the list of trusted devices. Sign out here — to use the app on it again, it’ll need to be approved afresh.',
  },
  error: {
    emoji: '📡',
    title: 'Couldn’t verify this device',
    body: 'Something went wrong reaching the server. Check your connection — we’ll keep trying.',
  },
}

// Shown instead of the app whenever this device isn't (yet) trusted. Nothing
// in here can read your data — the rules block it server-side regardless of
// what this screen does.
export default function DeviceGate() {
  const { deviceStatus, recheckDevice, logout } = useAuth()
  const copy = COPY[deviceStatus] || COPY.error
  const waiting = deviceStatus === 'pending' || deviceStatus === 'blocked' || deviceStatus === 'error'

  return (
    <div className="flex min-h-svh items-center justify-center bg-paper px-6 text-ink">
      <div className="w-full max-w-sm text-center">
        <p className="text-4xl">{copy.emoji}</p>
        <h1 className="mt-3 font-display text-2xl italic">{copy.title}</h1>
        <p className="mt-3 font-body text-sm text-ink-soft">{copy.body}</p>
        <p className="mt-4 font-body text-xs text-ink-soft/70">This device: {describeDevice()}</p>

        <div className="mt-6 flex flex-col gap-2">
          {waiting && (
            <button
              type="button"
              onClick={recheckDevice}
              className="rounded-full bg-rose px-5 py-2.5 font-body text-sm font-medium text-paper transition-transform hover:-translate-y-0.5"
            >
              Check again
            </button>
          )}
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-ink/15 px-5 py-2.5 font-body text-sm font-medium text-ink-soft transition-colors hover:border-rose hover:text-rose"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
