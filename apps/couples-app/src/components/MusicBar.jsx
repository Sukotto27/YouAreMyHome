import { useState } from 'react'
import { useMusicPlayer } from '../context/MusicPlayerContext'

// Thin persistent bar shown just above the bottom nav on every page once a
// track has ever been picked — see context/MusicPlayerContext.jsx for the
// shared playback state this reads/controls.
export default function MusicBar() {
  const {
    currentTrack,
    playing,
    needsGesture,
    play,
    pause,
    next,
    previous,
    resume,
    volume,
    setVolume,
    myFavorites,
    toggleFavorite,
  } = useMusicPlayer()
  const [showVolume, setShowVolume] = useState(false)

  if (!currentTrack) return null

  const isFavorite = !!myFavorites[currentTrack.id]

  return (
    <div className="relative flex items-center gap-2 border-t border-ink/10 bg-paper/95 px-3 py-2 backdrop-blur">
      <button
        type="button"
        onClick={() => toggleFavorite(currentTrack.id)}
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        className={`shrink-0 text-base transition-transform hover:scale-110 ${isFavorite ? '' : 'opacity-40 grayscale'}`}
      >
        ❤️
      </button>

      <p className="min-w-0 flex-1 truncate font-body text-xs text-ink-soft">
        🎵 <span className="text-ink">{currentTrack.title}</span>
      </p>

      <div className="flex shrink-0 items-center gap-1">
        <TransportButton label="Volume" onClick={() => setShowVolume((v) => !v)}>
          <path d="M4 9v6h4l5 4V5L8 9H4Z" />
          <path d="M17 8.5a5 5 0 0 1 0 7" />
        </TransportButton>
        <TransportButton label="Previous track" onClick={previous}>
          <path d="M6 5v14M20 5 9 12l11 7V5Z" />
        </TransportButton>
        {needsGesture ? (
          <TransportButton label="Tap to resume" onClick={resume} emphasized>
            <path d="M6 4.5v15l13-7.5-13-7.5Z" fill="currentColor" stroke="none" />
          </TransportButton>
        ) : playing ? (
          <TransportButton label="Pause" onClick={pause} emphasized>
            <path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor" stroke="none" />
          </TransportButton>
        ) : (
          <TransportButton label="Play" onClick={play} emphasized>
            <path d="M6 4.5v15l13-7.5-13-7.5Z" fill="currentColor" stroke="none" />
          </TransportButton>
        )}
        <TransportButton label="Next track" onClick={next}>
          <path d="M18 5v14M4 5l11 7-11 7V5Z" />
        </TransportButton>
      </div>

      {showVolume && (
        <div className="absolute bottom-full right-3 mb-1 flex items-center gap-2 rounded-full bg-paper px-4 py-2 shadow-lg ring-1 ring-ink/10">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="w-28 accent-rose"
            aria-label="Volume (this device only)"
          />
        </div>
      )}
    </div>
  )
}

function TransportButton({ label, onClick, children, emphasized }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
        emphasized ? 'bg-rose text-paper' : 'text-ink-soft hover:text-rose'
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        {children}
      </svg>
    </button>
  )
}
