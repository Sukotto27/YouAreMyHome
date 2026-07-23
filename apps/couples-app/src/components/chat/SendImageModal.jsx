import { useState } from 'react'

// Shown after picking a photo to send, before it actually goes anywhere —
// lets you choose permanent vs. vanishing, and whether it should
// auto-download to their device either way.
export default function SendImageModal({ previewUrl, sending, onCancel, onConfirm }) {
  const [vanishing, setVanishing] = useState(false)
  const [autoDownload, setAutoDownload] = useState(false)

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-2xl bg-paper p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <img src={previewUrl} alt="" className="max-h-56 w-full rounded-xl object-cover" />

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => setVanishing(false)}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
              !vanishing ? 'border-rose bg-blush-soft/40' : 'border-ink/10'
            }`}
          >
            <span className="text-xl">🖼️</span>
            <span>
              <span className="block font-body font-medium text-ink">Permanent</span>
              <span className="block font-body text-xs text-ink-soft">Stays in chat and the gallery, like normal</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setVanishing(true)}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
              vanishing ? 'border-rose bg-blush-soft/40' : 'border-ink/10'
            }`}
          >
            <span className="text-xl">⏳</span>
            <span>
              <span className="block font-body font-medium text-ink">Vanishing</span>
              <span className="block font-body text-xs text-ink-soft">
                Disappears 1 minute after they open it — doesn't go in the gallery
              </span>
            </span>
          </button>
        </div>

        <label className="mt-3 flex items-start gap-2 rounded-xl border border-ink/10 bg-white/50 px-3 py-2.5 font-body text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={autoDownload}
            onChange={(event) => setAutoDownload(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            Auto-download for them
            <span className="block text-xs text-ink-soft/70">
              Saves a copy straight to their device — even if it's set to vanish
            </span>
          </span>
        </label>

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
            onClick={() => onConfirm({ vanishing, autoDownload })}
            className="flex-1 rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
