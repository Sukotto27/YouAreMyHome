// Presentational content for a received love note/kiss, shown from the Home
// page's Send Love avatar badge (see AvatarBadge.jsx + BADGE_ANGLE.sendLove).
// A note carrying replyToId is itself the partner's reply to something we
// sent — offering "send one back" there would just ping-pong forever, so
// that case only ever gets a close button.
export default function LoveNoteCard({ note, replied, onReply, onClose }) {
  const isReply = !!note.replyToId

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 text-center shadow-xl">
        <p className="text-4xl">{note.emoji}</p>
        <p className="mt-3 font-display text-xl italic text-ink">{note.message}</p>
        {isReply && <p className="mt-1 font-body text-sm text-ink-soft">Sent back to you 💕</p>}
        <div className="mt-5 flex justify-center gap-3">
          {!replied && !isReply && (
            <button
              type="button"
              onClick={onReply}
              className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
            >
              Send one back
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-ink/15 px-6 py-2.5 font-body font-medium text-ink-soft transition-colors hover:border-rose hover:text-rose"
          >
            {replied || isReply ? 'Close' : 'Not now'}
          </button>
        </div>
      </div>
    </div>
  )
}
