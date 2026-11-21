import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { resetAppLock, unlockWithPin } from '../lib/keyStore'

// Full-screen cover shown while the app lock is engaged. Rendered on top of
// the (inert) app rather than instead of it, so music, games and live
// connections keep running underneath — only the way in is gated.
export default function LockScreen() {
  const { logout } = useAuth()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fails, setFails] = useState(0)
  const [waitUntil, setWaitUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [confirmingReset, setConfirmingReset] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!waitUntil) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [waitUntil])

  const waitSeconds = Math.max(0, Math.ceil((waitUntil - now) / 1000))

  async function submit(event) {
    event.preventDefault()
    if (busy || waitSeconds > 0 || !pin) return
    setBusy(true)
    setError('')
    try {
      await unlockWithPin(pin) // on success the lock state flips and this screen unmounts
    } catch {
      const nextFails = fails + 1
      setFails(nextFails)
      setPin('')
      // A growing pause after the third miss: 5s, 10s, 20s … capped at 5 min.
      // (A speed bump for someone at the screen, not protection against offline guessing.)
      if (nextFails >= 3) {
        const delaySeconds = Math.min(5 * 2 ** (nextFails - 3), 300)
        setWaitUntil(Date.now() + delaySeconds * 1000)
        setNow(Date.now())
      }
      setError('That’s not the right PIN.')
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="App locked"
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-paper px-6 text-ink"
    >
      <div className="w-full max-w-xs text-center">
        <p className="text-4xl">🔒</p>
        <h1 className="mt-3 font-display text-2xl italic">Locked</h1>

        {confirmingReset ? (
          <div className="mt-4 space-y-3 text-left">
            <p className="font-body text-sm text-ink-soft">
              This removes the lock <strong>and the encryption key</strong> from this device. Chat and Gallery will stay
              unreadable here until you enter the key again — you can get it from your partner’s device (Settings → Show my
              encryption key).
            </p>
            <button
              type="button"
              onClick={resetAppLock}
              className="w-full rounded-full bg-rose px-5 py-2.5 font-body text-sm font-medium text-paper"
            >
              Remove lock and key from this device
            </button>
            <button
              type="button"
              onClick={() => setConfirmingReset(false)}
              className="w-full rounded-full border border-ink/15 px-5 py-2.5 font-body text-sm text-ink-soft"
            >
              Cancel
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <input
              ref={inputRef}
              type="password"
              autoComplete="off"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="PIN or passphrase"
              aria-label="PIN or passphrase"
              className="w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-2.5 text-center font-body text-ink outline-none focus:border-rose"
            />
            {error && <p className="font-body text-sm text-rose">{error}</p>}
            {waitSeconds > 0 && <p className="font-body text-xs text-ink-soft">Try again in {waitSeconds}s.</p>}
            <button
              type="submit"
              disabled={busy || waitSeconds > 0 || !pin}
              className="w-full rounded-full bg-rose px-5 py-2.5 font-body text-sm font-medium text-paper disabled:opacity-50"
            >
              {busy ? 'Unlocking…' : 'Unlock'}
            </button>
            <div className="flex justify-between pt-1">
              <button type="button" onClick={() => setConfirmingReset(true)} className="font-body text-xs text-ink-soft underline decoration-dotted underline-offset-4">
                Forgot PIN?
              </button>
              <button type="button" onClick={logout} className="font-body text-xs text-ink-soft underline decoration-dotted underline-offset-4">
                Sign out
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
