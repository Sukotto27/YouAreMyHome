// Shown after picking a photo to send, before it actually goes anywhere —
// a quick preview with Send/Cancel. Whether it auto-downloads is the
// recipient's own call (Settings → Photos in chat), not something set here.
export default function SendImageModal({ previewUrl, sending, error, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-2xl bg-paper p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <img src={previewUrl} alt="" className="max-h-56 w-full rounded-xl object-cover" />

        {error && <p className="mt-3 font-body text-xs text-rose">Couldn't send that photo: {error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-ink/15 px-4 py-2 font-body text-sm text-ink-soft transition-colors hover:border-rose"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={onConfirm}
            className="flex-1 rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
