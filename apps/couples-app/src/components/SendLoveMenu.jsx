import { useLoveNotes } from '../hooks/useLoveNotes'
import { KISS_KINDS, LOVE_NOTE_KINDS, currentKissKind } from '../data/loveNotes'

// Opened by tapping the "Send Love" nav item (see Shell/SwipeableNav) —
// Thumbkiss lives here as a press-and-hold option rather than a tap, since
// it's a live "are you there" gesture rather than a one-off message: holding
// it closes this box immediately and hands off to ThumbkissOverlay, which
// keeps tracking the hold globally via `thumbkiss.startPress/endPress` even
// after this component unmounts (the window listeners below outlive it).
export default function SendLoveMenu({ open, onClose, thumbkiss }) {
  const { usedToday, sendKiss, sendNote } = useLoveNotes()

  if (!open) return null

  const kissKind = currentKissKind()
  const kiss = KISS_KINDS[kissKind]

  function handleThumbkissDown(event) {
    event.preventDefault()
    thumbkiss.startPress()
    onClose()
    function finish() {
      thumbkiss.endPress()
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  function handleSendKiss() {
    sendKiss(kissKind)
    onClose()
  }

  function handleSendNote(kind) {
    sendNote(kind)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-paper p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-center font-display text-2xl italic text-ink">Send Love</h2>
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onPointerDown={handleThumbkissDown}
            style={{ WebkitTouchCallout: 'none', touchAction: 'none' }}
            className="flex w-full select-none items-center gap-3 rounded-2xl border border-rose/30 bg-blush-soft/50 px-4 py-3 text-left transition-colors active:bg-blush-soft"
          >
            <span className="text-2xl">🤏</span>
            <span>
              <span className="block font-body font-medium text-ink">Thumbkiss</span>
              <span className="block font-body text-xs text-ink-soft">Press and hold to reach for them</span>
            </span>
          </button>

          <button
            type="button"
            onClick={handleSendKiss}
            className="flex w-full items-center gap-3 rounded-2xl border border-teal/30 bg-white/60 px-4 py-3 text-left transition-colors hover:border-rose"
          >
            <span className="text-2xl">{kiss.emoji}</span>
            <span className="font-body font-medium text-ink">{kiss.label}</span>
          </button>

          {Object.entries(LOVE_NOTE_KINDS).map(([kind, def]) => {
            const used = !!usedToday[kind]
            return (
              <button
                key={kind}
                type="button"
                disabled={used}
                onClick={() => handleSendNote(kind)}
                className="flex w-full items-center gap-3 rounded-2xl border border-teal/30 bg-white/60 px-4 py-3 text-left transition-colors hover:border-rose disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-teal/30"
              >
                <span className="text-2xl">{def.emoji}</span>
                <span>
                  <span className="block font-body font-medium text-ink">{def.label}</span>
                  {used && <span className="block font-body text-xs text-ink-soft">Already sent today</span>}
                </span>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full border border-ink/15 px-4 py-2 font-body text-sm font-medium text-ink-soft transition-colors hover:border-rose hover:text-rose"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
