import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { auth, firebaseReady } from '../firebase'

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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!firebaseReady) {
      setUser(DEMO_USER)
      setLoading(false)
      return
    }
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

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

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, resetPassword, setDisplayName }}>
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
