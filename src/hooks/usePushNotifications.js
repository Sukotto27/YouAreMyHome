import { useEffect, useState } from 'react'
import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { app, db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

export function usePushNotifications() {
  const { user } = useAuth()
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    if (!firebaseReady || typeof Notification === 'undefined' || !VAPID_KEY) return
    isSupported().then(setSupported)
  }, [])

  async function enable() {
    if (!firebaseReady || !user || !VAPID_KEY) return false
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result !== 'granted') return false

    try {
      const registration = await navigator.serviceWorker.ready
      const messaging = getMessaging(app)
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      })
      if (!token) return false

      const tokensRef = collection(db, 'fcmTokens', user.uid, 'tokens')
      const existing = await getDocs(query(tokensRef, where('token', '==', token)))
      if (existing.empty) {
        await addDoc(tokensRef, { token, createdAt: serverTimestamp() })
      }
      return true
    } catch (error) {
      console.error('Failed to register for push notifications:', error)
      return false
    }
  }

  return { permission, supported, enable }
}
