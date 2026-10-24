import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

// A one-time "here's what changed" walkthrough, shown only to Cristina. Bump
// the id when there's a new batch of features worth showing again. Marked seen
// the moment it opens, so closing it midway still counts as once. Tracked per
// device in localStorage.
const WHATS_NEW_ID = 'whats-new-v1.19'
const STORAGE_KEY = `you-are-my-home:${WHATS_NEW_ID}`

const SLIDES = [
  { emoji: '🍑', text: 'We can now show love by slapping each other’s butt!' },
  { emoji: '🎲', text: 'There are new games for us to try together, such as Farkle!' },
  { emoji: '🔖', text: 'You can now bookmark chat messages to locate them easier!' },
  { emoji: '🎧', text: 'Host a music session for you and your partner to enjoy together!' },
  { emoji: '👆', text: 'Tap and hold your partner’s avatar for quick access to many actions!' },
]

function alreadySeen() {
  try {
    return !!localStorage.getItem(STORAGE_KEY)
  } catch {
    return true
  }
}

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // storage blocked — worst case it shows again next time
  }
}

export default function WhatsNew() {
  const { user } = useAuth()
  const [open, setOpen] = useState(() => user?.displayName === 'Cristina' && !alreadySeen())
  // -1 is the welcome screen; 0..n-1 are the feature slides.
  const [index, setIndex] = useState(-1)

  if (!open) return null

  // Seen as soon as it's on screen, not only when finished.
  markSeen()

  const slide = SLIDES[index]
  const isLast = index === SLIDES.length - 1

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/50 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 text-center shadow-xl">
        {!slide ? (
          <>
            <p className="text-4xl">💌</p>
            <h2 className="mt-3 font-display text-2xl italic text-ink">Welcome back!</h2>
            <p className="mt-2 font-body text-ink-soft">I&rsquo;ve added some new features I hope you&rsquo;ll enjoy!</p>
          </>
        ) : (
          <div key={index} className="animate-reveal-in">
            <p className="text-6xl">{slide.emoji}</p>
            <p className="mt-4 font-display text-xl italic text-ink">{slide.text}</p>
            <div className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
              {SLIDES.map((_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-rose' : 'bg-ink/15'}`} />
              ))}
            </div>
          </div>
        )}
        <div className="mt-6 flex justify-center gap-3">
          {slide && (
            <button
              type="button"
              onClick={() => setIndex((i) => i - 1)}
              className="rounded-full border border-ink/15 px-5 py-2.5 font-body font-medium text-ink-soft transition-colors hover:border-rose hover:text-rose"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? setOpen(false) : setIndex((i) => i + 1))}
            className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            {!slide ? 'See what’s new →' : isLast ? 'Done 💕' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
