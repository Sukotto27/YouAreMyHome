import { bookmarkColor } from '../../lib/bookmarkColors'

// Little ribbon tabs down the right edge of the chat — one per bookmark,
// oldest at the top, each in its own color. Tapping one scrolls to that
// message (the jump itself lives in Chat.jsx, which owns the message list).
// pointer-events are off on the wrapper so the empty space between ribbons
// never blocks scrolling or tapping the messages underneath.
export default function BookmarkBanners({ items, notice, onJump }) {
  if (items.length === 0 && !notice) return null

  return (
    <div className="pointer-events-none absolute right-0 top-14 z-10 flex max-h-[calc(100%-8rem)] flex-col items-end gap-1.5 overflow-y-auto">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onJump(item.id)}
          title={item.preview}
          aria-label={`Jump to bookmarked message: ${item.preview}`}
          style={{ backgroundColor: bookmarkColor(item.color) }}
          className="pointer-events-auto flex h-7 w-6 shrink-0 items-center justify-start rounded-l-md pl-1 text-white shadow-md transition-[width] duration-150 hover:w-9"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
            <path d="M6 3h12v18l-6-4-6 4z" />
          </svg>
        </button>
      ))}
      {notice && (
        <p className="pointer-events-auto mr-2 max-w-[14rem] rounded-xl bg-ink/80 px-3 py-2 font-body text-xs text-paper">
          {notice}
        </p>
      )}
    </div>
  )
}
