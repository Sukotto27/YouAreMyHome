import { avatarFor } from '../lib/avatars'

// Small circular avatar with a checkmark overlay when `answered` is true —
// shared by Q&A's question rows and Mad Libs' story list for the same
// "have they done this yet" indicator.
export default function AnswerAvatar({ name, avatars, answered }) {
  const src = avatarFor(name, avatars)
  return (
    <div
      className={`relative h-8 w-8 rounded-full ring-2 ring-paper transition-opacity ${
        answered ? '' : 'opacity-35 grayscale'
      }`}
      title={name}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full rounded-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-blush-soft font-body text-xs text-ink-soft">
          {name?.[0]}
        </div>
      )}
      {answered && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-teal text-[8px] text-paper">
          ✓
        </span>
      )}
    </div>
  )
}
