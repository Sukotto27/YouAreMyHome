import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  onAuthStateChanged,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { auth, firebaseReady } from '../firebase'
import { callRegisterDevice } from '../lib/deviceApi'
import { describeDevice, getDeviceIdentity } from '../lib/deviceIdentity'

const AuthContext = createContext(null)

// When Firebase hasn't been configured yet, sign everyone in as a local demo
// user instead of forcing a dead-end login screen. This makes the app usable
// for previewing the UI, and it stops mattering the moment real Firebase
// credentials are added (firebaseReady flips to true and real auth takes over).
export const DEMO_USER = {
  uid: 'demo-user',
  displayName: 'You (preview)',
  email: 'preview@local',
}

// Device trust (see functions/security.js). Being signed in with the right
// password is no longer the whole story: this device must also be a known,
// approved one. deviceStatus is one of:
//   'checking' | 'approved' | 'pending' | 'denied' | 'revoked' | 'blocked' | 'error' | 'none'
// Only 'approved' lets the app render (ProtectedRoute).
const RECHECK_MS = 5 * 60 * 1000 // silent re-verification while the app is open
const RETRY_MS = 6000 // while waiting for approval (or after an error), poll this often

// registerDevice failing for reasons that say nothing about *this* device
// (network down, function cold/unavailable).
function isTransientError(error) {
  const code = error?.code
  return !code || ['functions/unavailable', 'functions/internal', 'functions/deadline-exceeded', 'functions/unknown', 'functions/cancelled'].includes(code)
}

// Asks the server about this device and, if it's approved but this session
// doesn't yet carry the device claim, swaps the password session for one that
// does (same uid). Returns a deviceStatus.
async function checkDevice({ forceRefresh = false } = {}) {
  const fbUser = auth.currentUser
  if (!fbUser) return 'none'
  const { deviceId, secret } = getDeviceIdentity()

  let hasDeviceClaim = false
  try {
    hasDeviceClaim = (await fbUser.getIdTokenResult(forceRefresh)).claims.did === deviceId
  } catch {
    // offline — the call below decides
  }

  try {
    const data = await callRegisterDevice({ deviceId, secret, label: describeDevice() })
    if (data.status === 'approved' && data.customToken) {
      await signInWithCustomToken(auth, data.customToken)
    }
    return data.status
  } catch (error) {
    if (error?.code === 'functions/permission-denied') return 'denied'
    // The server can't be reached but this session already IS a registered
    // device. Firestore/RTDB rules are what actually enforce access, and
    // they'll say no if it has been revoked — so don't lock a working app
    // behind a flaky connection.
    if (hasDeviceClaim && isTransientError(error)) return 'approved'
    return 'error'
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deviceStatus, setDeviceStatus] = useState(firebaseReady ? 'checking' : 'approved')
  const busyRef = useRef(false)
  const generationRef = useRef(0) // bumped on every sign-in/out so stale checks are ignored
  const statusRef = useRef(deviceStatus)
  statusRef.current = deviceStatus

  const runCheck = useCallback(async ({ forceRefresh = false, ignoreBusy = false } = {}) => {
    if (!auth?.currentUser) return
    if (busyRef.current && !ignoreBusy) return
    busyRef.current = true
    const generation = generationRef.current
    try {
      const status = await checkDevice({ forceRefresh })
      if (generation !== generationRef.current || !auth.currentUser) return
      // The custom-token sign-in replaces the User object (same uid), so
      // re-read it; onAuthStateChanged does not fire again for the same uid.
      setUser(auth.currentUser)
      setDeviceStatus(status)
    } finally {
      busyRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!firebaseReady) {
      setUser(DEMO_USER)
      setLoading(false)
      return
    }
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      generationRef.current += 1
      if (!nextUser) {
        setUser(null)
        setDeviceStatus('none')
        setLoading(false)
        return
      }
      setUser(nextUser)
      setDeviceStatus('checking')
      await runCheck({ ignoreBusy: true })
      setLoading(false)
    })
    return unsubscribe
  }, [runCheck])

  // Belt and braces: if a refreshed ID token ever comes back without this
  // device's claim, re-register straight away rather than waiting for the next
  // periodic check — otherwise the rules would refuse everything until then.
  useEffect(() => {
    if (!firebaseReady) return
    return onIdTokenChanged(auth, async (fbUser) => {
      if (!fbUser || statusRef.current !== 'approved') return
      try {
        const { claims } = await fbUser.getIdTokenResult()
        if (claims.did !== getDeviceIdentity().deviceId) runCheck()
      } catch {
        // offline — the periodic check will catch up
      }
    })
  }, [runCheck])

  // The silent check: re-verify periodically and whenever the app comes back
  // to the foreground. A device that has been revoked finds out here.
  useEffect(() => {
    if (!firebaseReady || !user || deviceStatus !== 'approved') return
    const interval = setInterval(() => runCheck({ forceRefresh: true }), RECHECK_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') runCheck()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user, deviceStatus, runCheck])

  // Waiting for someone to approve this device (or retrying after an error):
  // poll until the answer changes. Nothing sensitive is reachable meanwhile.
  useEffect(() => {
    if (!firebaseReady || !user || !['pending', 'blocked', 'error'].includes(deviceStatus)) return
    const interval = setInterval(() => runCheck(), RETRY_MS)
    return () => clearInterval(interval)
  }, [user, deviceStatus, runCheck])

  const login = (email, password) => {
    if (!firebaseReady) return Promise.reject(new Error('Firebase is not configured yet'))
    return signInWithEmailAndPassword(auth, email, password)
  }
  const logout = () => (firebaseReady ? signOut(auth) : Promise.resolve())

  const resetPassword = (email) => {
    if (!firebaseReady) return Promise.reject(new Error('Firebase is not configured yet'))
    return sendPasswordResetEmail(auth, email)
  }

  // Sets displayName on the Firebase Auth account itself (not just local state),
  // so it persists across devices/sessions and every `user.displayName` read
  // throughout the app — including the Cloud Functions push notifications —
  // resolves to a real name instead of falling back to the login email.
  const setDisplayName = async (displayName) => {
    if (!firebaseReady || !auth.currentUser) return
    await updateProfile(auth.currentUser, { displayName })
    setUser({ ...auth.currentUser })
  }

  const recheckDevice = () => runCheck({ ignoreBusy: true })

  return (
    <AuthContext.Provider
      value={{ user, loading, deviceStatus, recheckDevice, login, logout, resetPassword, setDisplayName }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
