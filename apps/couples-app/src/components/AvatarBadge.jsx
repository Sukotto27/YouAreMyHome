// Fixed radial slots around an avatar (hex layout, clockwise from 12
// o'clock) — each notification type always lives in the same slot wherever
// it appears, so the badges read consistently across both avatars.
export const BADGE_ANGLE = {
  chat: 0,
  mail: 60,
  sendLove: 120,
  calendar: 180,
  qa: 240,
  journal: 300,
  music: 0,
}

export default function AvatarBadge({ type, emoji, label, onClick }) {
  const angle = BADGE_ANGLE[type]
  const rad = (angle * Math.PI) / 180
  const left = 50 + 50 * Math.sin(rad)
  const top = 50 - 50 * Math.cos(rad)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{ left: `${left}%`, top: `${top}%` }}
      className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-bounce items-center justify-center rounded-full bg-rose text-xs shadow-md ring-2 ring-paper transition-transform hover:scale-110"
    >
      {emoji}
    </button>
  )
}
