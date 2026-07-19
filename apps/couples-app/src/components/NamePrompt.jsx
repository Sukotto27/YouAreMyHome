import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const NAMES = ['Scott', 'Cristina']

// Shown once per account, the first time someone logs in after this app
// started requiring a real display name. Firebase Auth accounts here were
// created without one, so every `user.displayName || user.email` fallback
// throughout the app (chat, push notifications, etc.) was showing the raw
// login email instead of a name. Picking a name here sets it on the Firebase
// Auth account itself, so it sticks for good.
export default function NamePrompt() {
  const { user, setDisplayName } = useAuth()
  const [saving, setSaving] = useState(false)

  if (!user || user.displayName) return null

  async function choose(name) {
    setSaving(true)
    try {
      await setDisplayName(name)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 text-center shadow-xl">
        <h2 className="font-display text-2xl italic text-ink">Which one of us is this?</h2>
        <p className="mt-1 font-body text-sm text-ink-soft">
          Just once, so we stop showing your email everywhere.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          {NAMES.map((name) => (
            <button
              key={name}
              type="button"
              disabled={saving}
              onClick={() => choose(name)}
              className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
