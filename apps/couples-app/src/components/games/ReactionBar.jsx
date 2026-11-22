import { playSound } from '../../lib/sounds'

export const TURN_REACTIONS = ['😂', '😍', '💀', '🙈', '🔥']

// Emoji picker for one turn of the Never-Ending Story/Song. Tapping your
// current reaction again clears it.
export function ReactionBar({ label, mine, onReact }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-ink/10 bg-white/40 px-3 py-2">
      <p className="max-w-full truncate font-hand text-sm text-ink-soft">React to “{label}”</p>
      <div className="flex gap-2">
        {TURN_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              playSound('chat_send')
              onReact(mine === emoji ? null : emoji)
            }}
            className={`rounded-full border px-3 py-1 text-xl transition-transform active:scale-90 ${
              mine === emoji ? 'border-rose bg-blush-soft' : 'border-ink/15 bg-white/60'
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

// Small inline emoji shown after a turn: everyone's reactions on it.
export function ReactionBadges({ reactions }) {
  const list = Object.values(reactions || {}).filter(Boolean)
  if (list.length === 0) return null
  return <span className="ml-0.5 select-none text-sm">{list.join('')}</span>
}
