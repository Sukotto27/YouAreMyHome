import { EMOJI_CATEGORIES } from '../../data/emojis'

export default function EmojiPicker({ onSelect }) {
  return (
    <div className="absolute bottom-14 left-4 z-20 max-h-64 w-64 overflow-y-auto rounded-2xl border border-ink/10 bg-paper p-3 shadow-lg sm:left-6">
      {EMOJI_CATEGORIES.map((category) => (
        <div key={category.name} className="mb-2">
          <p className="mb-1 font-hand text-sm text-teal">{category.name}</p>
          <div className="grid grid-cols-7 gap-1">
            {category.emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onSelect(emoji)}
                className="rounded-lg py-1 text-xl transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
