import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'
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

// Avoid initializing the SDK with placeholder/missing values — getAuth() etc.
// throw synchronously on an invalid config, which would crash the whole app
// before real Firebase credentials are ever added.
const app = firebaseReady ? initializeApp(firebaseConfig) : null

// App Check proves a request comes from this actual app (via reCAPTCHA v3),
// not a script hitting Firebase's APIs directly. Inert until a site key is set
// in .env.local (VITE_APPCHECK_SITE_KEY); once the key is in place and App
// Check is switched to "Enforce" in the Firebase console, raw API calls stop
// working. Must run before any other Firebase service is used.
const appCheckSiteKey = import.meta.env.VITE_APPCHECK_SITE_KEY
if (app && appCheckSiteKey) {
  // localhost can't pass reCAPTCHA; this prints a debug token to the console to
  // register under App Check → Apps → Manage debug tokens.
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
export const functions = app ? getFunctions(app) : null
