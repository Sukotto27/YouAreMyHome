import { useEffect, useRef } from 'react'
import { QUICK_REACTIONS } from '../../data/emojis'

const MENU_WIDTH = 240
const MENU_HEIGHT = 96

// Positioned `fixed` (viewport-relative) rather than absolute-inside-bubble
// — the message list is overflow-y-auto and would clip an absolutely
// positioned popup. Dismisses on any outside pointerdown.
export default function MessageActionMenu({ x, y, onSelectReaction, onReply, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function handlePointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  const left = Math.min(Math.max(x - MENU_WIDTH / 2, 8), window.innerWidth - MENU_WIDTH - 8)
  const top = Math.min(Math.max(y - MENU_HEIGHT - 12, 8), window.innerHeight - MENU_HEIGHT - 8)

  return (
    <div
      ref={ref}
      style={{ left, top, width: MENU_WIDTH }}
      className="fixed z-30 rounded-2xl border border-ink/10 bg-paper p-3 shadow-lg"
    >
      <div className="mb-2 flex justify-between gap-1">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelectReaction(emoji)}
            className="rounded-lg p-1 text-2xl transition-transform hover:scale-125"
          >
            {emoji}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onReply}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-2 font-body text-sm text-ink-soft transition-colors hover:text-rose"
      >
        ↩ Reply
      </button>
    </div>
  )
}
