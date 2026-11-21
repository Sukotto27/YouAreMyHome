import { useEffect, useRef } from 'react'
import { useKeyLockState } from '../hooks/useEncryptionKey'
import { getAutoLockMinutes, lockNow } from '../lib/keyStore'
import LockScreen from './LockScreen'

// Wraps the signed-in app. When the app lock is enabled it locks on a cold
// start, after the app has been in the background for the chosen time, and
// after the same time with no taps/keys. While locked, the app underneath is
// made inert (no focus, no clicks, hidden from screen readers) and the lock
// screen sits on top.
//
// A no-op when the lock is off — the wrapper uses display: contents so it
// doesn't disturb the app's layout.
export default function AppLockGate({ children }) {
  const { locked, lockEnabled } = useKeyLockState()
  const contentRef = useRef(null)

  useEffect(() => {
    if (contentRef.current) contentRef.current.inert = locked
  }, [locked])

  useEffect(() => {
    if (!lockEnabled || locked) return

    let lastActivity = Date.now()
    let hiddenAt = null
    const limitMs = () => getAutoLockMinutes() * 60_000

    const noteActivity = () => {
      lastActivity = Date.now()
    }

    // Timers are throttled or frozen while the page is hidden, so use
    // timestamps: when the page comes back, see how long it was away.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= limitMs()) lockNow()
      hiddenAt = null
      lastActivity = Date.now()
    }

    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel']
    events.forEach((name) => window.addEventListener(name, noteActivity, { passive: true, capture: true }))
    document.addEventListener('visibilitychange', onVisibility)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastActivity >= limitMs()) lockNow()
    }, 10_000)

    return () => {
      events.forEach((name) => window.removeEventListener(name, noteActivity, { capture: true }))
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(timer)
    }
  }, [lockEnabled, locked])

  return (
    <>
      <div ref={contentRef} className="contents" aria-hidden={locked || undefined}>
        {children}
      </div>
      {locked && <LockScreen />}
    </>
  )
}
