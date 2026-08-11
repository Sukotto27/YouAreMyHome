import { useState } from 'react'

const DISMISS_KEY = 'you-are-my-home:music-intro-dismissed'

// One-time explainer for how live music sessions work — shown the first
// time either of us opens the Music page, then never again (permanent
// localStorage dismissal, same pattern as InstallBanner/NotificationBanner).
export default function MusicIntro() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  if (dismissed) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 text-center shadow-xl">
        <h2 className="font-display text-2xl italic text-ink">Live Music Sessions</h2>
        <p className="mt-2 font-body text-sm text-ink-soft">
          Choose a song below to host a session. The session will be available to you and your partner
          simultaneously. Like a radio station, it will play uninterrupted for both parties, keeping you in-sync
          until the session is ended by the host, even if one of you pauses the music.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-5 rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
