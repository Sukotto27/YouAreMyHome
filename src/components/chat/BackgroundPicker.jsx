import { CHAT_BACKGROUNDS } from '../../lib/chatBackgrounds'

export default function BackgroundPicker({ current, onSelect, onClose }) {
  return (
    <div className="absolute right-4 top-14 z-20 grid grid-cols-3 gap-2 rounded-2xl border border-ink/10 bg-paper p-3 shadow-lg sm:right-6">
      {CHAT_BACKGROUNDS.map((bg) => (
        <button
          key={bg.id}
          type="button"
          onClick={() => {
            onSelect(bg.id)
            onClose()
          }}
          className={`flex h-14 w-16 flex-col items-center justify-end gap-1 rounded-xl border p-1 transition-transform hover:scale-105 ${
            current === bg.id ? 'border-rose ring-2 ring-rose/40' : 'border-ink/10'
          }`}
        >
          <span className="h-8 w-full rounded-md" style={bg.style} />
          <span className="font-body text-[10px] text-ink-soft">{bg.name}</span>
        </button>
      ))}
    </div>
  )
}
