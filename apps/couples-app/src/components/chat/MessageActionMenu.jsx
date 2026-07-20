import { useEffect, useRef, useState } from 'react'
import { QUICK_REACTIONS } from '../../data/emojis'

const MENU_WIDTH = 240
// Worst case: reactions row + Reply + Copy + Edit all shown — an
// overestimate here just means extra clearance above the tap point, which
// is safer than the menu clipping off the bottom of the screen.
const MENU_HEIGHT = 200

// Positioned `fixed` (viewport-relative) rather than absolute-inside-bubble
// — the message list is overflow-y-auto and would clip an absolutely
// positioned popup. Dismisses on any outside pointerdown.
export default function MessageActionMenu({ x, y, message, isOwn, onSelectReaction, onReply, onEdit, onClose }) {
  const ref = useRef(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    function handlePointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  const left = Math.min(Math.max(x - MENU_WIDTH / 2, 8), window.innerWidth - MENU_WIDTH - 8)
  const top = Math.min(Math.max(y - MENU_HEIGHT - 12, 8), window.innerHeight - MENU_HEIGHT - 8)

  const canCopy = message.type !== 'image'
  const canEdit = isOwn && message.type === 'text'

  async function handleCopy() {
    const text = message.type === 'link' ? message.caption || message.url : message.text
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(onClose, 700)
    } catch {
      // Clipboard API unavailable/blocked — just close, nothing else to do.
      onClose()
    }
  }

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
      {canCopy && (
        <button
          type="button"
          onClick={handleCopy}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-2 font-body text-sm text-ink-soft transition-colors hover:text-rose"
        >
          {copied ? '✓ Copied' : '📋 Copy text'}
        </button>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-2 font-body text-sm text-ink-soft transition-colors hover:text-rose"
        >
          ✏️ Edit
        </button>
      )}
    </div>
  )
}
