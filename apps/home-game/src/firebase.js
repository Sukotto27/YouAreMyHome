import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
}

export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

// Same project as apps/couples-app (see ../../couples-app/src/firebase.js) —
// signing in there also signs you in here, same origin + same Firebase app
// config, so the game needs no login screen of its own. That includes the
// device-trust session: the sign-in there carries the approved-device claim,
// which is what Firestore/RTDB rules look for once enforcement is on.
const app = firebaseReady ? initializeApp(firebaseConfig) : null

// Same App Check setup as the main app — once enforcement is switched on in
// the Firebase console, every client of the project needs it, this one too.
const appCheckSiteKey = import.meta.env.VITE_APPCHECK_SITE_KEY
if (app && appCheckSiteKey) {
  if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  })
}

export { app }
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export const rtdb = app ? getDatabase(app) : null
