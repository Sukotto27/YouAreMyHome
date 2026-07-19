import { useEffect, useRef, useState } from 'react'
import { MOOD_PRESETS } from '../lib/moodPresets'

// Shown near an avatar on the Home page. Only the owner's bubble is
// clickable — tapping it opens a small popover (presets + custom text)
// instead of navigating anywhere.
export default function MoodBubble({ mood, isMine, onSetMood }) {
  const [picking, setPicking] = useState(false)
  const [customText, setCustomText] = useState('')
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!picking) return
    function handlePointerDown(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) setPicking(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [picking])

  function choose(emoji, label) {
    onSetMood(emoji, label)
    setPicking(false)
  }

  function submitCustom(event) {
    event.preventDefault()
    const label = customText.trim()
    if (!label) return
    onSetMood('💬', label)
    setCustomText('')
    setPicking(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => isMine && setPicking((v) => !v)}
        disabled={!isMine}
        className={`whitespace-nowrap rounded-full border px-3 py-1 font-body text-xs transition-colors ${
          mood ? 'border-rose/30 bg-blush-soft text-ink-soft' : 'border-ink/10 bg-white/60 text-ink-soft/60'
        } ${isMine ? 'cursor-pointer hover:border-rose' : 'cursor-default'}`}
      >
        {mood ? `${mood.emoji} ${mood.label}` : isMine ? 'set your mood' : '…'}
      </button>

      {picking && (
        <div
          ref={popoverRef}
          className="absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-2xl border border-ink/10 bg-paper p-3 shadow-lg"
        >
          <div className="grid grid-cols-5 gap-1">
            {MOOD_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => choose(preset.emoji, preset.label)}
                title={preset.label}
                className="rounded-lg py-1 text-xl transition-transform hover:scale-125"
              >
                {preset.emoji}
              </button>
            ))}
          </div>
          <form onSubmit={submitCustom} className="mt-2 flex gap-1">
            <input
              type="text"
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              placeholder="or write your own..."
              className="min-w-0 flex-1 rounded-full border border-ink/15 bg-white/70 px-2.5 py-1 font-body text-xs text-ink outline-none focus:border-rose"
            />
            <button
              type="submit"
              disabled={!customText.trim()}
              className="shrink-0 rounded-full bg-rose px-3 py-1 font-body text-xs font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
            >
              Set
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
