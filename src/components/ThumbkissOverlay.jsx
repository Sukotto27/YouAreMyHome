import { useEffect, useRef, useState } from 'react'

const EMOJIS = ['💋', '💕']
const RAMP_DURATION_MS = 4000
const MAX_SPAWN_INTERVAL_MS = 550
const MIN_SPAWN_INTERVAL_MS = 120

export default function ThumbkissOverlay({ myPressing, partnerPressing, both }) {
  const [particles, setParticles] = useState([])
  const holdStartRef = useRef(null)
  const nextSpawnRef = useRef(null)
  const rafRef = useRef(null)

  const visible = myPressing || partnerPressing

  useEffect(() => {
    if (!both) {
      holdStartRef.current = null
      nextSpawnRef.current = null
      return
    }
    holdStartRef.current = Date.now()

    function tick() {
      const now = Date.now()
      const elapsed = now - holdStartRef.current
      const progress = Math.min(1, elapsed / RAMP_DURATION_MS)
      const interval = MAX_SPAWN_INTERVAL_MS - progress * (MAX_SPAWN_INTERVAL_MS - MIN_SPAWN_INTERVAL_MS)

      if (!nextSpawnRef.current || now >= nextSpawnRef.current) {
        nextSpawnRef.current = now + interval
        const id = `${now}-${Math.random()}`
        const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
        const drift = (Math.random() - 0.5) * 60
        setParticles((prev) => [...prev.slice(-24), { id, emoji, drift }])
        setTimeout(() => {
          setParticles((prev) => prev.filter((p) => p.id !== id))
        }, 1400)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [both])

  if (!visible) return null

  const label = both ? 'connected 💕' : partnerPressing ? "they're reaching for you..." : 'holding...'

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div
          className={`relative flex h-24 w-24 items-center justify-center rounded-full border-2 ${
            both ? 'animate-thumbkiss-connect border-rose bg-rose' : 'border-rose bg-rose/70'
          }`}
        >
          {partnerPressing && !both && (
            <span className="absolute inset-0 rounded-full bg-rose animate-thumbkiss-pulse" />
          )}
          {particles.map((p) => (
            <span
              key={p.id}
              className="absolute bottom-1/2 left-1/2 text-2xl animate-thumbkiss-float"
              style={{ '--drift': `${p.drift}px` }}
            >
              {p.emoji}
            </span>
          ))}
        </div>
        <p className="rounded-full bg-paper/90 px-4 py-1.5 font-hand text-lg text-ink-soft shadow">{label}</p>
      </div>
    </div>
  )
}
