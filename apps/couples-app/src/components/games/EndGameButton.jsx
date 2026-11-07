import { useEffect, useState } from 'react'

// Shared "End game" control for every game. Requires a second tap within a
// few seconds — cheap insurance against a stray tap ending a match that both
// of you are still in (same pattern Farkle and Uno already used).
export default function EndGameButton({ onEnd, label = 'End game' }) {
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(timer)
  }, [confirming])

  function handleClick() {
    if (confirming) {
      setConfirming(false)
      onEnd()
      return
    }
    setConfirming(true)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`whitespace-nowrap font-body text-xs underline decoration-dotted underline-offset-4 transition-colors ${
        confirming ? 'font-semibold text-rose' : 'text-ink-soft hover:text-rose'
      }`}
    >
      {confirming ? 'Tap again to end' : label}
    </button>
  )
}
