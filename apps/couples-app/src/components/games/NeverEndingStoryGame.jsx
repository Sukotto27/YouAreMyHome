import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNeverEndingStory } from '../../hooks/useNeverEndingStory'
import { useGameInvite } from '../../hooks/useGameInvite'

// A single ever-growing story the two of you build one blank at a time —
// whoever's turn it is fills in the blank left by the other, then
// immediately leaves their own for next time. No session/turn timer: either
// of you can pick it back up whenever (see useNeverEndingStory).
export default function NeverEndingStoryGame({ onBack }) {
  const { user } = useAuth()
  const { turns, pendingTurn, loading, startStory, fillAndContinue } = useNeverEndingStory()
  const partnerLabel = user.displayName === 'Cristina' ? 'Scott' : 'Cristina'
  const { sendInvite } = useGameInvite('story', 'Never-Ending Story')
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

  const myTurn = !!pendingTurn && pendingTurn.authorUid !== user.uid
  const waitingOnPartner = !!pendingTurn && pendingTurn.authorUid === user.uid

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
          <h1 className="font-display text-2xl italic text-ink">Never-Ending Story</h1>
          <p className="font-hand text-lg text-ink-soft">one blank at a time, forever in progress</p>
        </div>
        <button
          type="button"
          onClick={handleInvite}
          disabled={inviting}
          className="shrink-0 rounded-full border border-rose/40 px-4 py-1.5 font-body text-xs font-medium text-rose transition-colors hover:bg-blush-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          {inviting ? 'Inviting…' : '📖 Invite partner'}
        </button>
      </div>
      {inviteMessage && <p className="text-center font-hand text-sm text-rose">{inviteMessage}</p>}

      {turns.length > 0 && (
        <div className="rounded-2xl border border-ink/10 bg-white/50 p-4">
          <StoryText turns={turns} pendingTurnId={pendingTurn?.id} myUid={user.uid} />
        </div>
      )}

      {turns.length === 0 && <StartForm onSubmit={(before, after) => startStory(before, after)} />}

      {waitingOnPartner && (
        <p className="animate-pulse text-center font-hand text-xl text-rose">
          waiting on {partnerLabel} to fill in the blank...
        </p>
      )}

      {myTurn && (
        <MyTurnForm
          pendingTurn={pendingTurn}
          onSubmit={(word, before, after) => fillAndContinue(word, before, after)}
        />
      )}
    </div>
  )
}

function StoryText({ turns, pendingTurnId, myUid }) {
  return (
    <p className="whitespace-pre-wrap font-body leading-relaxed text-ink">
      {turns.map((turn, index) => {
        const isPending = turn.id === pendingTurnId
        const filled = !isPending
        return (
          <span key={turn.id}>
            {index > 0 && ' '}
            {turn.textBefore}{' '}
            <span
              className={
                !filled
                  ? 'font-semibold text-ink-soft underline decoration-dotted underline-offset-2'
                  : `font-semibold ${turn.filledByUid === myUid ? 'text-rose' : 'text-teal'}`
              }
            >
              {turn.filledWord || '_____'}
            </span>{' '}
            {turn.textAfter}
          </span>
        )
      })}
    </p>
  )
}

function StartForm({ onSubmit }) {
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const canSubmit = before.trim() || after.trim()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSubmit) return
        onSubmit(before.trim(), after.trim())
      }}
      className="space-y-3 rounded-2xl border border-ink/10 bg-white/40 p-4"
    >
      <p className="font-body text-sm text-ink-soft">
        Start the story and leave one blank for your partner to fill in — like "Once upon a time, there was a ___."
      </p>
      <label className="block">
        <span className="mb-1 block font-body text-sm font-medium text-ink">Before the blank</span>
        <input
          type="text"
          value={before}
          onChange={(event) => setBefore(event.target.value)}
          placeholder="Once upon a time, there was a"
          className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-sm text-ink outline-none focus:border-rose"
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-body text-sm font-medium text-ink">After the blank</span>
        <input
          type="text"
          value={after}
          onChange={(event) => setAfter(event.target.value)}
          placeholder="who loved cheese more than anything."
          className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-sm text-ink outline-none focus:border-rose"
        />
      </label>
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
      >
        Start the story
      </button>
    </form>
  )
}

function MyTurnForm({ pendingTurn, onSubmit }) {
  const [word, setWord] = useState('')
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const canSubmit = word.trim() && (before.trim() || after.trim())

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onSubmit(word.trim(), before.trim(), after.trim())
      setWord('')
      setBefore('')
      setAfter('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-rose/30 bg-blush-soft/40 p-4">
      <div>
        <p className="mb-1 font-body text-sm font-medium text-ink">Fill in the blank</p>
        <p className="font-hand text-lg italic text-ink-soft">
          {pendingTurn.textBefore}{' '}
          <input
            type="text"
            value={word}
            onChange={(event) => setWord(event.target.value)}
            placeholder="..."
            autoFocus
            className="inline-block w-32 rounded-lg border border-ink/15 bg-white/80 px-2 py-0.5 align-baseline font-body text-base not-italic text-ink outline-none focus:border-rose"
          />{' '}
          {pendingTurn.textAfter}
        </p>
      </div>

      <div className="space-y-3 border-t border-ink/10 pt-3">
        <p className="font-body text-sm text-ink-soft">Now leave your own blank to continue the story:</p>
        <label className="block">
          <span className="mb-1 block font-body text-sm font-medium text-ink">Before the blank</span>
          <input
            type="text"
            value={before}
            onChange={(event) => setBefore(event.target.value)}
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-sm text-ink outline-none focus:border-rose"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-body text-sm font-medium text-ink">After the blank</span>
          <input
            type="text"
            value={after}
            onChange={(event) => setAfter(event.target.value)}
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-sm text-ink outline-none focus:border-rose"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="w-full rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Saving…' : 'Submit my turn'}
      </button>
    </form>
  )
}
