import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../../firebase'

const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID

// The token gates the (necessarily unauthenticated) calendarFeed Cloud
// Function — calendar apps can't send Firebase auth headers, so this is the
// only thing standing between the feed and anyone who finds the URL.
export default function WebcalPanel() {
  const [token, setToken] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!firebaseReady) return
    let cancelled = false

    async function ensureToken() {
      const ref = doc(db, 'config', 'calendarFeed')
      const snap = await getDoc(ref)
      if (snap.exists() && snap.data().token) {
        if (!cancelled) setToken(snap.data().token)
        return
      }
      const newToken = crypto.randomUUID()
      await setDoc(ref, { token: newToken }, { merge: true })
      if (!cancelled) setToken(newToken)
    }

    ensureToken()
    return () => {
      cancelled = true
    }
  }, [])

  if (!firebaseReady) {
    return (
      <p className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 font-body text-sm text-ink-soft">
        Connect Firebase to get a calendar subscription link.
      </p>
    )
  }

  if (!token) {
    return <p className="font-body text-sm text-ink-soft">Setting up your calendar link…</p>
  }

  const feedUrl = `https://us-central1-${PROJECT_ID}.cloudfunctions.net/calendarFeed?token=${token}`
  const webcalUrl = feedUrl.replace(/^https:\/\//, 'webcal://')

  function handleCopy() {
    navigator.clipboard?.writeText(feedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-2 rounded-2xl border border-ink/10 bg-white/50 p-4">
      <p className="font-body text-sm text-ink">
        Subscribe once from your phone's calendar app and new dates keep syncing automatically.
      </p>
      <a
        href={webcalUrl}
        className="inline-block rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5"
      >
        Subscribe to calendar
      </a>
      <button type="button" onClick={handleCopy} className="block font-body text-xs text-ink-soft hover:text-rose">
        {copied ? 'Link copied!' : 'or copy the link'}
      </button>
    </div>
  )
}
