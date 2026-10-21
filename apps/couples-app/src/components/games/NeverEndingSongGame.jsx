import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNeverEndingSong } from '../../hooks/useNeverEndingSong'
import { useGameInvite } from '../../hooks/useGameInvite'

// Like the Never-Ending Story, but every line you add has to be built out of
// real song titles — you may only sprinkle in small "filler" words to make
// the whole thing read grammatically, and you can't change the titles
// themselves. e.g. "Do you want to take a Slow Ride" → "On the Crazy Train?"
export default function NeverEndingSongGame({ onBack }) {
  const { user } = useAuth()
  const { turns, loading, myTurn, waitingOnPartner, addLine } = useNeverEndingSong()
  const partnerLabel = user.displayName === 'Cristina' ? 'Scott' : 'Cristina'
  const { sendInvite } = useGameInvite('song', 'The Never-Ending Song')
  const [inviting, setInviting] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')

  async function handleInvite() {
    setInviting(true)
    try {
      await sendInvite()
      setInviteMessage("Invite sent — they'll get a notification!")
      setTimeout(() => setInviteMessage(''), 2500)
    } finally {
      setInviting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-hand text-2xl text-ink-soft">just a moment...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="self-start font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
      >
        ← Games
      </button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl italic text-ink">The Never-Ending Song</h1>
          <p className="font-hand text-lg text-ink-soft">one song title at a time, forever in progress</p>
        </div>
        <button
          type="button"
          onClick={handleInvite}
          disabled={inviting}
          className="shrink-0 rounded-full border border-rose/40 px-4 py-1.5 font-body text-xs font-medium text-rose transition-colors hover:bg-blush-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          {inviting ? 'Inviting…' : '🎶 Invite partner'}
        </button>
      </div>
      {inviteMessage && <p className="text-center font-hand text-sm text-rose">{inviteMessage}</p>}

      <div className="rounded-2xl border border-ink/10 bg-white/40 px-4 py-3">
        <p className="font-body text-sm text-ink-soft">
          Every line has to be a real <span className="font-medium text-ink">song title</span> (or a few strung
          together). You can add little <span className="italic">filler</span> words — "the", "on a", "and then" — to
          make it read grammatically, but you can't change the titles themselves. Keep the sentence going.
        </p>
      </div>

      {turns.length > 0 && (
        <div className="rounded-2xl border border-ink/10 bg-white/50 p-4">
          <SongText turns={turns} myUid={user.uid} />
          <SongCredits turns={turns} />
        </div>
      )}

      {waitingOnPartner && (
        <p className="animate-pulse text-center font-hand text-xl text-rose">
          waiting on {partnerLabel} for the next line...
        </p>
      )}

      {myTurn && <MyTurnForm first={turns.length === 0} onSubmit={(text, songs) => addLine(text, songs)} />}
    </div>
  )
}

function SongText({ turns, myUid }) {
  return (
    <p className="font-body text-lg leading-relaxed text-ink">
      {turns.map((turn, index) => (
        <span key={turn.id}>
          {index > 0 && ' '}
          <span className={turn.authorUid === myUid ? 'text-rose' : 'text-teal'}>{turn.text}</span>
        </span>
      ))}
      {turns.length > 0 && <span className="text-ink-soft"> …</span>}
    </p>
  )
}

function SongCredits({ turns }) {
  const credits = turns.map((t) => (t.songs || '').trim()).filter(Boolean)
  if (credits.length === 0) return null
  return (
    <p className="mt-3 border-t border-ink/10 pt-2 font-body text-xs text-ink-soft">
      <span className="font-medium">Songs used:</span> {credits.join(' · ')}
    </p>
  )
}

function MyTurnForm({ first, onSubmit }) {
  const [text, setText] = useState('')
  const [songs, setSongs] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const canSubmit = text.trim().length > 0

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onSubmit(text.trim(), songs.trim())
      setText('')
      setSongs('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-rose/30 bg-blush-soft/40 p-4">
      <p className="font-body text-sm font-medium text-ink">
        {first ? 'Start the song' : 'Your line'}
      </p>
      <label className="block">
        <span className="mb-1 block font-body text-xs text-ink-soft">
          {first ? 'Open with a song title (plus any filler words)' : 'Continue the sentence with a song title'}
        </span>
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={first ? 'Do you want to take a Slow Ride' : 'On the Crazy Train'}
          autoFocus
          className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-sm text-ink outline-none focus:border-rose"
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-body text-xs text-ink-soft">Song title(s) you used (optional, for the record)</span>
        <input
          type="text"
          value={songs}
          onChange={(event) => setSongs(event.target.value)}
          placeholder="Slow Ride — Foghat"
          className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-sm text-ink outline-none focus:border-rose"
        />
      </label>
      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="w-full rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Saving…' : 'Add my line'}
      </button>
    </form>
  )
}
