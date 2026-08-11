import { useEffect, useState } from 'react'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { useAuth } from '../context/AuthContext'
import CommentThread from '../components/CommentThread'

// SVG can't auto-shrink text to fit a path, so longer titles get a smaller
// font size — rough length-based clamp rather than exact glyph measurement.
function arcFontSize(title) {
  const raw = 210 / Math.max(title.length, 6)
  return Math.max(9, Math.min(18, raw))
}

const SLEEP_TIMER_OPTIONS = [15, 30, 45, 60]

export default function Music() {
  const {
    tracks,
    currentTrack,
    playing,
    needsGesture,
    play,
    pause,
    next,
    previous,
    selectTrack,
    resume,
    shuffle,
    toggleShuffle,
    volume,
    setVolume,
    myFavorites,
    partnerFavorites,
    toggleFavorite,
    position,
    duration,
    isHost,
    endSession,
  } = useMusicPlayer()
  const { user } = useAuth()
  const [view, setView] = useState('player')

  if (view === 'tracks') {
    return (
      <AllTracksView
        tracks={tracks}
        currentTrack={currentTrack}
        playing={playing}
        onSelect={selectTrack}
        onBack={() => setView('player')}
      />
    )
  }

  if (view === 'favorites') {
    return (
      <FavoritesView
        tracks={tracks}
        currentTrack={currentTrack}
        playing={playing}
        myFavorites={myFavorites}
        partnerFavorites={partnerFavorites}
        onSelect={selectTrack}
        onBack={() => setView('player')}
      />
    )
  }

  const isFavorite = !!(currentTrack && myFavorites[currentTrack.id])
  const fraction = duration > 0 ? Math.min(1, position / duration) : 0
  const partnerName = user.displayName === 'Scott' ? 'Cristina' : 'Scott'
  const hostName = isHost ? 'You' : partnerName

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-6 overflow-y-auto px-4 py-8 text-center sm:px-6">
      <Record track={currentTrack} playing={playing} fraction={fraction} />

      <div>
        <h1 className="font-display text-2xl italic text-ink">Music</h1>
        {currentTrack ? (
          <>
            <p className="mt-1 font-hand text-xl text-rose">{currentTrack.title}</p>
            <p className="mt-1 font-body text-xs text-ink-soft/70">📻 live session · hosted by {hostName}</p>
          </>
        ) : (
          <>
            <p className="mt-2 font-hand text-2xl text-rose">coming soon...</p>
            <p className="mt-1 font-body text-sm text-ink-soft">listen to something together, someday 🎶</p>
          </>
        )}
      </div>

      {currentTrack && (
        <div className="flex items-center gap-4">
          <ShuffleButton active={shuffle} onClick={toggleShuffle} />
          <BigTransportButton label="Previous track" onClick={previous}>
            <path d="M6 5v14M20 5 9 12l11 7V5Z" />
          </BigTransportButton>
          {needsGesture ? (
            <BigTransportButton label="Tap to resume" onClick={resume} primary>
              <path d="M6 4.5v15l13-7.5-13-7.5Z" fill="currentColor" stroke="none" />
            </BigTransportButton>
          ) : playing ? (
            <BigTransportButton label="Pause" onClick={pause} primary>
              <path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor" stroke="none" />
            </BigTransportButton>
          ) : (
            <BigTransportButton label="Play" onClick={play} primary>
              <path d="M6 4.5v15l13-7.5-13-7.5Z" fill="currentColor" stroke="none" />
            </BigTransportButton>
          )}
          <BigTransportButton label="Next track" onClick={next}>
            <path d="M18 5v14M4 5l11 7-11 7V5Z" />
          </BigTransportButton>
          <button
            type="button"
            onClick={() => toggleFavorite(currentTrack.id)}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className={`text-xl transition-transform hover:scale-110 ${isFavorite ? '' : 'opacity-40 grayscale'}`}
          >
            ❤️
          </button>
        </div>
      )}

      <div className="flex w-full max-w-xs items-center gap-2">
        <span className="text-sm text-ink-soft/70">🔈</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
          className="flex-1 accent-rose"
          aria-label="Volume (this device only)"
        />
        <span className="text-sm text-ink-soft/70">🔊</span>
      </div>

      {tracks.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setView('tracks')}
            className="font-body text-sm font-medium text-rose underline-offset-2 hover:underline"
          >
            See all tracks & comment on them →
          </button>
          <button
            type="button"
            onClick={() => setView('favorites')}
            className="font-body text-sm font-medium text-rose underline-offset-2 hover:underline"
          >
            ❤ Favorites →
          </button>
        </div>
      )}

      <SleepTimerControl />

      {currentTrack && isHost && (
        <button
          type="button"
          onClick={endSession}
          className="font-body text-xs text-ink-soft/60 underline-offset-2 hover:text-rose hover:underline"
        >
          End listening session
        </button>
      )}
    </div>
  )
}

function ShuffleButton({ active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? 'Shuffle on' : 'Shuffle off'}
      title={active ? 'Shuffle on' : 'Shuffle off'}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
        active ? 'bg-blush-soft text-rose' : 'text-ink-soft hover:text-rose'
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M4 6h3.5c2 0 3 1 4.5 3M4 18h3.5c2 0 3-1 4.5-3" />
        <path d="M15 6h5m0 0-2.5-2.5M20 6l-2.5 2.5M15 18h5m0 0-2.5-2.5M20 18l-2.5 2.5" />
      </svg>
    </button>
  )
}

function SleepTimerControl() {
  const { sleepTimerEndsAt, startSleepTimer, cancelSleepTimer } = useMusicPlayer()
  const [remainingSeconds, setRemainingSeconds] = useState(null)

  useEffect(() => {
    if (!sleepTimerEndsAt) {
      setRemainingSeconds(null)
      return
    }
    function tick() {
      setRemainingSeconds(Math.max(0, Math.round((sleepTimerEndsAt - Date.now()) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [sleepTimerEndsAt])

  if (sleepTimerEndsAt && remainingSeconds !== null) {
    const minutes = Math.floor(remainingSeconds / 60)
    const seconds = String(remainingSeconds % 60).padStart(2, '0')
    return (
      <div className="flex items-center gap-2 font-body text-xs text-ink-soft">
        <span>😴 Sleeping in {minutes}:{seconds}</span>
        <button type="button" onClick={cancelSleepTimer} className="font-medium text-rose hover:underline">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 font-body text-xs text-ink-soft">
      <span>😴 Sleep timer:</span>
      {SLEEP_TIMER_OPTIONS.map((minutes) => (
        <button
          key={minutes}
          type="button"
          onClick={() => startSleepTimer(minutes)}
          className="rounded-full border border-ink/15 px-2.5 py-1 transition-colors hover:border-rose hover:text-rose"
        >
          {minutes}m
        </button>
      ))}
    </div>
  )
}

function AllTracksView({ tracks, currentTrack, playing, onSelect, onBack }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-8 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="self-start font-body text-sm text-ink-soft transition-colors hover:text-rose"
      >
        ← Back
      </button>
      <h1 className="font-display text-2xl italic text-ink">All Tracks</h1>
      <div className="space-y-2 pb-4">
        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            isCurrent={currentTrack?.id === track.id}
            playing={playing}
            onSelect={() => onSelect(track.id)}
          />
        ))}
      </div>
    </div>
  )
}

function TrackRow({ track, isCurrent, playing, onSelect }) {
  const [showComments, setShowComments] = useState(false)

  return (
    <div
      className={`rounded-2xl border px-3 py-2 ${
        isCurrent ? 'border-rose bg-blush-soft/50' : 'border-ink/10 bg-white/50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSelect}
          className={`min-w-0 flex-1 truncate text-left font-body text-sm ${isCurrent ? 'text-rose' : 'text-ink'}`}
        >
          {isCurrent && playing ? '🎵 ' : ''}
          {track.title}
        </button>
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="shrink-0 font-body text-xs text-ink-soft hover:text-rose"
        >
          💬 {showComments ? 'Hide' : 'Comment'}
        </button>
      </div>

      {showComments && (
        <div className="mt-2 border-t border-ink/10 pt-2">
          <CommentThread collectionName="musicTracks" parentId={track.id} />
        </div>
      )}
    </div>
  )
}

function FavoritesView({ tracks, currentTrack, playing, myFavorites, partnerFavorites, onSelect, onBack }) {
  const { user } = useAuth()
  const partnerName = user.displayName === 'Scott' ? 'Cristina' : 'Scott'
  const favoriteTracks = tracks.filter((track) => myFavorites[track.id] || partnerFavorites[track.id])

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-8 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="self-start font-body text-sm text-ink-soft transition-colors hover:text-rose"
      >
        ← Back
      </button>
      <h1 className="font-display text-2xl italic text-ink">Favorites</h1>

      {favoriteTracks.length === 0 ? (
        <p className="pt-6 text-center font-hand text-xl text-ink-soft">
          no favorites yet — tap the heart on a song to add one
        </p>
      ) : (
        <div className="space-y-2 pb-4">
          {favoriteTracks.map((track) => {
            const isCurrent = currentTrack?.id === track.id
            const mine = !!myFavorites[track.id]
            const partners = !!partnerFavorites[track.id]
            return (
              <div
                key={track.id}
                className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 ${
                  isCurrent ? 'border-rose bg-blush-soft/50' : 'border-ink/10 bg-white/50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(track.id)}
                  className={`min-w-0 flex-1 truncate text-left font-body text-sm ${isCurrent ? 'text-rose' : 'text-ink'}`}
                >
                  {isCurrent && playing ? '🎵 ' : ''}
                  {track.title}
                </button>
                <div className="flex shrink-0 items-center gap-1.5 font-body text-xs text-ink-soft">
                  {mine && <span title="Your favorite">❤️ You</span>}
                  {partners && <span title={`${partnerName}'s favorite`}>❤️ {partnerName}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const RING_RADIUS = 47
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function Record({ track, playing, fraction }) {
  return (
    <div className="relative h-56 w-56 shrink-0 sm:h-64 sm:w-64">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="3" className="text-ink/15" />
        {track && (
          <circle
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="text-rose transition-[stroke-dashoffset] duration-500 ease-linear"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
            transform="rotate(-90 50 50)"
          />
        )}
      </svg>
      <div className="absolute inset-2.5">
        <div
          className={`relative h-full w-full rounded-full shadow-xl ${playing ? 'animate-spin [animation-duration:3s]' : ''}`}
          style={{
            background:
              'repeating-radial-gradient(circle at center, #1c1c1c 0px, #1c1c1c 3px, #2b2b2b 4px, #2b2b2b 5px)',
          }}
        >
          {track && (
            <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden="true">
              <defs>
                <path id="music-title-arc" d="M 20,100 A 80,80 0 1,1 180,100" fill="none" />
              </defs>
              <text className="fill-paper font-body" style={{ fontSize: arcFontSize(track.title) }} letterSpacing="1">
                <textPath href="#music-title-arc" startOffset="50%" textAnchor="middle">
                  {track.title}
                </textPath>
              </text>
            </svg>
          )}
          <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose shadow-inner" />
          <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper" />
        </div>
      </div>
    </div>
  )
}

function BigTransportButton({ label, onClick, children, primary }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex items-center justify-center rounded-full transition-transform duration-200 ease-out hover:-translate-y-0.5 ${
        primary ? 'h-14 w-14 bg-rose text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)]' : 'h-10 w-10 text-ink-soft hover:text-rose'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={primary ? 'h-6 w-6' : 'h-5 w-5'}
      >
        {children}
      </svg>
    </button>
  )
}
