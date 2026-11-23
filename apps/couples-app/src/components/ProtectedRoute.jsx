import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { firebaseReady } from '../firebase'
import AppLockGate from './AppLockGate'
import DeviceGate from './DeviceGate'

// Three gates, in order: signed in -> this device is approved -> app not locked.
export default function ProtectedRoute({ children }) {
  const { user, loading, deviceStatus } = useAuth()

  // dev server only (stripped from production builds): skip the login so pages can be tried locally
  // (only the device/approval gate is skipped — with real Firebase there still has to be a signed-in user,
  // otherwise pages that read `user` crash into a blank screen)
  if (import.meta.env.DEV) {
    if (loading) return null
    if (firebaseReady && !user) return <Navigate to="/login" replace />
    return <AppLockGate>{children}</AppLockGate>
  }

  if (loading || (user && deviceStatus === 'checking')) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-paper">
        <p className="font-hand text-2xl text-ink-soft">just a moment...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (deviceStatus !== 'approved') {
    return <DeviceGate />
  }

  return <AppLockGate>{children}</AppLockGate>
}
