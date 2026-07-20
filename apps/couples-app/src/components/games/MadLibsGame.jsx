import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { usePartnerUid } from '../../hooks/usePartnerUid'
import { useChatSettings } from '../../hooks/useChatSettings'
import { useMadLibs, DEMO_PARTNER_UID } from '../../hooks/useMadLibs'
import { firebaseReady } from '../../firebase'
import { MAD_LIBS_LIBRARY, madLibById } from '../../lib/madLibs'
import AnswerAvatar from '../AnswerAvatar'

export default function MadLibsGame({ onBack }) {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const [chatSettings] = useChatSettings()
  const { stories, submitAnswers, playAgain } = useMadLibs()
  const [activeStoryId, setActiveStoryId] = useState(null)

  // Same normalization as Q&A — avatars are keyed by the exact 'Scott'/
  // 'Cristina' strings used everywhere else, so both labels must always
  // resolve distinctly rather than falling through to a raw email/demo name.
  const effectivePartnerUid = firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const mineLabel = user.displayName === 'Cristina' ? 'Cristina' : 'Scott'
  const partnerLabel = mineLabel === 'Scott' ? 'Cristina' : 'Scott'

  if (activeStoryId) {
    const story = madLibById(activeStoryId)
    return (
      <MadLibDetail
        story={story}
        round={stories[activeStoryId]}
        userUid={user.uid}
        partnerUid={effectivePartnerUid}
        partnerLabel={partnerLabel}
        onSubmit={(answers) => submitAnswers(story.id, story.title, answers)}
        onPlayAgain={() => playAgain(story.id)}
        onBack={() => setActiveStoryId(null)}
      />
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
      <div>
        <h1 className="font-display text-2xl italic text-ink">Mad Libs</h1>
        <p className="font-hand text-lg text-ink-soft">fill in the blanks separately, then compare</p>
      </div>

      <div className="space-y-2">
        {MAD_LIBS_LIBRARY.map((story) => {
          const round = stories[story.id]
          const myDone = !!round?.answers?.[user.uid]
          const partnerDone = !!round?.answers?.[effectivePartnerUid]
          return (
            <button
              key={story.id}
              type="button"
              onClick={() => setActiveStoryId(story.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 text-left transition-colors hover:border-rose"
            >
              <div className="min-w-0 flex-1">
                <p className="font-body text-sm text-ink">{story.title}</p>
                <p className="mt-0.5 font-body text-xs text-ink-soft">{story.blanks.length} blanks</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <AnswerAvatar name={mineLabel} avatars={chatSettings.avatars} answered={myDone} />
                <AnswerAvatar name={partnerLabel} avatars={chatSettings.avatars} answered={partnerDone} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function MadLibDetail({ story, round, userUid, partnerUid, partnerLabel, onSubmit, onPlayAgain, onBack }) {
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const myAnswers = round?.answers?.[userUid]
  const partnerAnswers = round?.answers?.[partnerUid]
  const bothDone = !!myAnswers && !!partnerAnswers

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit(answers)
    } finally {
      setSubmitting(false)
    }
  }

  if (bothDone) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="self-start font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
        >
          ← Back
        </button>
        <h1 className="font-display text-2xl italic text-ink">{story.title}</h1>
        <div className="space-y-4">
          <StoryCard label="Yours" text={story.template(myAnswers)} />
          <StoryCard label={`${partnerLabel}'s`} text={story.template(partnerAnswers)} />
        </div>
        <button
          type="button"
          onClick={onPlayAgain}
          className="mx-auto rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5"
        >
          Play again
        </button>
      </div>
    )
  }

  if (myAnswers) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-4 py-8 text-center sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="self-start font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
        >
          ← Back
        </button>
        <p className="font-display text-2xl italic text-ink">{story.title}</p>
        <p className="animate-pulse font-hand text-2xl text-rose">waiting on {partnerLabel} to fill theirs in...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="self-start font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
      >
        ← Back
      </button>
      <h1 className="font-display text-2xl italic text-ink">{story.title}</h1>
      {partnerAnswers && (
        <p className="font-hand text-lg text-teal">{partnerLabel} already filled theirs in — your turn!</p>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        {story.blanks.map((blank) => (
          <label key={blank.id} className="block">
            <span className="mb-1 block font-body text-sm font-medium text-ink">{blank.label}</span>
            <input
              type="text"
              value={answers[blank.id] || ''}
              onChange={(event) => setAnswers((prev) => ({ ...prev, [blank.id]: event.target.value }))}
              className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-sm text-ink outline-none focus:border-rose"
            />
          </label>
        ))}
        <button
          type="submit"
          disabled={submitting || story.blanks.some((blank) => !answers[blank.id]?.trim())}
          className="w-full rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Submit my words'}
        </button>
      </form>
    </div>
  )
}

function StoryCard({ label, text }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-4">
      <p className="mb-1 font-hand text-sm text-teal">{label}</p>
      <p className="whitespace-pre-wrap font-body text-sm text-ink">{text}</p>
    </div>
  )
}
