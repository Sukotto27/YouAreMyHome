import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../context/NotificationsContext'

// Everything that currently has an icon on the Home avatars, as plain text
// (worded like the push notifications) with a way straight to it. Not a
// history: an item goes away when its icon does (you read the message, took
// your turn, ...). The journal timeline is the permanent record.
export default function Notifications() {
  const navigate = useNavigate()
  const { items } = useNotifications()

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
      <h1 className="font-display text-3xl italic text-ink">Notifications</h1>
      {items.length === 0 ? (
        <p className="py-10 text-center font-hand text-lg text-ink-soft">You're all caught up 💕</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => navigate(item.to, item.state ? { state: item.state } : undefined)}
                className="flex w-full items-center gap-3 rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-left shadow-sm transition-colors hover:border-rose"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose/90 text-lg">
                  {item.emoji}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-body text-xs font-semibold uppercase tracking-wide text-ink-soft">{item.title}</span>
                  <span className="font-body text-sm text-ink">{item.text}</span>
                </span>
                <span className="shrink-0 font-body text-sm font-medium text-rose">Open →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-center font-body text-xs text-ink-soft">
        Only things that currently show as an icon on your avatars. For everything that has happened, see the Journal.
      </p>
    </div>
  )
}
