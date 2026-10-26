// Starts the game. main.js (and the HUD / 3D scripts) are classic scripts that share globals, so they cannot import
// Firebase themselves: this module loads the SDK, hands it over as window.__fb, then loads the scripts in order.
import { onAuthStateChanged } from 'firebase/auth'
import { addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { onChildAdded, onDisconnect, onValue, push, ref, remove, set } from 'firebase/database'
import { auth, db, firebaseReady, rtdb } from './firebase.js'
import { FIRESTORE, HOST_ROLE, PARTNER_ROLE, roleFor, rtdbPaths } from './game/schema.js'

window.__fb = {
  onAuthStateChanged, addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where,
  onChildAdded, onDisconnect, onValue, push, ref, remove, set,
  auth, db, firebaseReady, rtdb, FIRESTORE, HOST_ROLE, PARTNER_ROLE, roleFor, rtdbPaths,
}

const base = import.meta.env.BASE_URL
const loadScript = (src) => new Promise((resolve, reject) => {
  const s = document.createElement('script')
  s.src = base + src
  s.async = false
  s.onload = resolve
  s.onerror = () => reject(new Error('failed to load ' + src))
  document.body.appendChild(s)
})

for (const src of ['src/ui/hud.js', 'src/ui/panels.js', 'src/ui/panels2.js', 'src/ui/panels3.js', 'src/main.js']) await loadScript(src)

// 3D is the default view; ?view=2d brings back the flat one
if (new URLSearchParams(location.search).get('view') !== '2d') {
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
  await import(/* @vite-ignore */ base + 'src/render3d/index.js')
}
