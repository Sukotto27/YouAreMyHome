import { useEffect, useState } from 'react'
import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { app, db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

// Mirrors the exact checks Firebase's own isSupported() runs internally, but
// one at a time instead of collapsing them into a single boolean — so when a
// real device fails, Settings can say *what* is missing instead of just
// "not supported." Useful for diagnosing remotely (e.g. over text) without
// access to the device's devtools.
async function checkNotificationSupport() {
  const reasons = []
  if (!('serviceWorker' in navigator)) reasons.push('no Service Worker support')
  if (!('PushManager' in window)) reasons.push('no Push API support')
  if (!('Notification' in window)) reasons.push('no Notification API support')
  if (!('fetch' in window)) reasons.push('no fetch support')
  if (!navigator.cookieEnabled) reasons.push('cookies are disabled')
  if (typeof ServiceWorkerRegistration === 'undefined' || !ServiceWorkerRegistration.prototype.hasOwnProperty('showNotification')) {
    reasons.push('Service Worker notifications unsupported')
  }
  if (typeof PushSubscription === 'undefined' || !PushSubscription.prototype.hasOwnProperty('getKey')) {
    reasons.push('Push Subscription unsupported')
  }
  try {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('__notif_support_check__')
      request.onsuccess = () => {
        request.result.close()
        indexedDB.deleteDatabase('__notif_support_check__')
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  } catch {
    reasons.push('IndexedDB is unavailable (private browsing or storage blocked?)')
  }
  return reasons
}

export function usePushNotifications() {
  const { user } = useAuth()
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const [supported, setSupported] = useState(false)
  const [unsupportedReasons, setUnsupportedReasons] = useState([])

  useEffect(() => {
    if (!firebaseReady || typeof Notification === 'undefined' || !VAPID_KEY) return
    isSupported().then(setSupported)
    checkNotificationSupport().then(setUnsupportedReasons)
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

  return { permission, supported, unsupportedReasons, enable }
}
