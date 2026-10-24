// Opened by pressing and holding the partner's avatar on Home — a shortcut
// list for the things you'd otherwise hunt through the nav for. "Send Love"
// hands off to the Shell-level SendLoveMenu via a window event, since that
// menu (and the thumbkiss state behind it) lives up there.
export const OPEN_SEND_LOVE_EVENT = 'you-are-my-home:open-send-love'

export default function PartnerActionMenu({ name, onClose, onNavigate }) {
  const actions = [
    { emoji: '💬', label: 'Send Message', run: () => onNavigate('/chat') },
    { emoji: '💌', label: 'Send Love Letter', run: () => onNavigate('/mail', { compose: true }) },
    { emoji: '💕', label: 'Send Love', run: () => window.dispatchEvent(new Event(OPEN_SEND_LOVE_EVENT)) },
    { emoji: '🎮', label: 'Invite to Game', run: () => onNavigate('/games') },
    { emoji: '🎧', label: 'Start Jam Session', run: () => onNavigate('/music') },
  ]

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-center font-display text-2xl italic text-ink">For {name}</h2>
        <div className="mt-4 space-y-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                onClose()
                action.run()
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-teal/30 bg-white/60 px-4 py-3 text-left transition-colors hover:border-rose"
            >
              <span className="text-2xl">{action.emoji}</span>
              <span className="font-body font-medium text-ink">{action.label}</span>
            </button>
          ))}
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
