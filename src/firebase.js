import { initializeApp } from 'firebase/app'
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

// Avoid initializing the SDK with placeholder/missing values — getAuth() etc.
// throw synchronously on an invalid config, which would crash the whole app
// before real Firebase credentials are ever added.
const app = firebaseReady ? initializeApp(firebaseConfig) : null

export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export const rtdb = app ? getDatabase(app) : null
