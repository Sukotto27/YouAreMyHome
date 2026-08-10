import { useState } from 'react'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import CommentThread from '../components/CommentThread'

// SVG can't auto-shrink text to fit a path, so longer titles get a smaller
// font size — rough length-based clamp rather than exact glyph measurement.
function arcFontSize(title) {
  const raw = 150 / Math.max(title.length, 6)
  return Math.max(6, Math.min(13, raw))
}

export default function Music() {
  const { tracks, currentTrack, playing, needsGesture, play, pause, next, previous, selectTrack, resume } =
    useMusicPlayer()
  const [showAllTracks, setShowAllTracks] = useState(false)

  if (showAllTracks) {
    return (
      <AllTracksView
        tracks={tracks}
        currentTrack={currentTrack}
        playing={playing}
        onSelect={selectTrack}
        onBack={() => setShowAllTracks(false)}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-6 overflow-y-auto px-4 py-8 text-center sm:px-6">
      <Record track={currentTrack} playing={playing} />

      <div>
        <h1 className="font-display text-2xl italic text-ink">Music</h1>
        {currentTrack ? (
          <p className="mt-1 font-hand text-xl text-rose">{currentTrack.title}</p>
        ) : (
          <>
            <p className="mt-2 font-hand text-2xl text-rose">coming soon...</p>
            <p className="mt-1 font-body text-sm text-ink-soft">listen to something together, someday 🎶</p>
          </>
        )}
      </div>

      {currentTrack && (
        <div className="flex items-center gap-5">
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
        </div>
      )}

      {tracks.length === 0 ? (
        <p className="pt-6 text-center font-hand text-xl text-ink-soft">no songs here yet</p>
      ) : (
        <button
          type="button"
          onClick={() => setShowAllTracks(true)}
          className="font-body text-sm font-medium text-rose underline-offset-2 hover:underline"
        >
          See all tracks & comment on them →
        </button>
      )}
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

function Record({ track, playing }) {
  return (
    <div className="relative h-48 w-48 sm:h-56 sm:w-56">
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
