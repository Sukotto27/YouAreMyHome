import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { usePartnerUid } from '../../hooks/usePartnerUid'
import { useChatSettings } from '../../hooks/useChatSettings'
import { useMadLibs, DEMO_PARTNER_UID } from '../../hooks/useMadLibs'
import { useGameInvite } from '../../hooks/useGameInvite'
import { firebaseReady } from '../../firebase'
import { MAD_LIBS_LIBRARY, madLibById, renderMadLibText } from '../../lib/madLibs'
import AnswerAvatar from '../AnswerAvatar'
import { playSound } from '../../lib/sounds'
import { myNameFor } from '../../lib/names'

export default function MadLibsGame({ onBack }) {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const [chatSettings] = useChatSettings()
  const { stories, customStories, createCustomMadLib, submitAnswers, playAgain, setComment } = useMadLibs()
  const [activeStoryId, setActiveStoryId] = useState(null)
  const [creating, setCreating] = useState(false)
  const { sendInvite } = useGameInvite('madlibs', 'Mad Libs')
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

  // Same normalization as Q&A — avatars are keyed by the exact 'Scott'/
  // 'Cristina' strings used everywhere else, so both labels must always
  // resolve distinctly rather than falling through to a raw email/demo name.
  const effectivePartnerUid = firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const mineLabel = myNameFor(user)
  const partnerLabel = mineLabel === 'Scott' ? 'Cristina' : 'Scott'

  async function handleCreate(title, text) {
    const result = await createCustomMadLib(title, text)
    if (result.ok) {
      setCreating(false)
      setActiveStoryId(result.id)
    }
    return result
  }

  if (creating) {
    return <CreateMadLibForm onSubmit={handleCreate} onBack={() => setCreating(false)} />
  }

  if (activeStoryId) {
    const story = madLibById(activeStoryId) || customStories.find((s) => s.id === activeStoryId)
    return (
      <MadLibDetail
        story={story}
        round={stories[activeStoryId]}
        userUid={user.uid}
        partnerUid={effectivePartnerUid}
        partnerLabel={partnerLabel}
        onComment={(text) => setComment(story.id, text)}
        onSubmit={(answers) => submitAnswers(story.id, story.title, answers)}
        onPlayAgain={() => playAgain(story.id)}
        onBack={() => setActiveStoryId(null)}
      />
    )
  }

  const allStories = [...MAD_LIBS_LIBRARY, ...customStories]

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
          <h1 className="font-display text-2xl italic text-ink">Mad Libs</h1>
          <p className="font-hand text-lg text-ink-soft">fill in the blanks separately, then compare</p>
        </div>
        <button
          type="button"
          onClick={handleInvite}
          disabled={inviting}
          className="shrink-0 rounded-full border border-rose/40 px-4 py-1.5 font-body text-xs font-medium text-rose transition-colors hover:bg-blush-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          {inviting ? 'Inviting…' : '📝 Invite partner'}
        </button>
      </div>
      {inviteMessage && <p className="text-center font-hand text-sm text-rose">{inviteMessage}</p>}

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-rose/40 px-4 py-3 font-body text-sm font-medium text-rose transition-colors hover:bg-blush-soft"
      >
        ✏️ Create your own
      </button>

      <div className="space-y-2">
        {allStories.map((story) => {
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
                <p className="mt-0.5 font-body text-xs text-ink-soft">
                  {story.blanks.length} blanks{story.authorName ? ` · by ${story.authorName}` : ''}
                </p>
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

// `[bracketed]` segments become blanks, hinted by whatever's inside the
// brackets — parseCustomMadLibText (via createCustomMadLib) does the actual
// parsing; this just collects the title + text and surfaces a parse error
// inline if there were no blanks to find.
function CreateMadLibForm({ onSubmit, onBack }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const result = await onSubmit(title, text)
      if (!result.ok) setError(result.reason)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="self-start font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
      >
        ← Back
      </button>
      <h1 className="font-display text-2xl italic text-ink">Create your own</h1>
      <p className="font-body text-sm text-ink-soft">
        Write your story, wrapping each blank in <span className="font-medium text-ink">[brackets]</span> with a
        hint — like "We went to <span className="font-medium text-ink">[a city]</span> and ate{' '}
        <span className="font-medium text-ink">[a food]</span>." Each bracketed hint becomes its own blank for both
        of you to fill in separately.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block font-body text-sm font-medium text-ink">Title</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Our Silly Story"
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-sm text-ink outline-none focus:border-rose"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-body text-sm font-medium text-ink">Story</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            placeholder="Once upon a time, we went to [a place] and found a [an adjective] [a noun]..."
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-sm text-ink outline-none focus:border-rose"
          />
        </label>
        {error && <p className="font-body text-xs text-rose">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="w-full rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Save & fill in'}
        </button>
      </form>
    </div>
  )
}

function MadLibDetail({ story, round, userUid, partnerUid, partnerLabel, onSubmit, onComment, onPlayAgain, onBack }) {
  const [answers, setAnswers] = useState({})
  const [showArchive, setShowArchive] = useState(false)
  const comments = round?.comments || {}
  const archive = round?.archive || []
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

  // Each side's story is visible the moment that side has filled it in —
  // no need to wait on the other before you can look back at your own.
  if (myAnswers) {
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
          <StoryCard label="Yours" text={renderMadLibText(story, myAnswers)} />
          {partnerAnswers ? (
            <StoryCard label={`${partnerLabel}'s`} text={renderMadLibText(story, partnerAnswers)} />
          ) : (
            <p className="animate-pulse text-center font-hand text-xl text-rose">
              waiting on {partnerLabel} to fill theirs in...
            </p>
          )}
        </div>
        {bothDone && (
          <>
            {(comments[userUid] || comments[partnerUid]) && (
              <div className="flex flex-col gap-1.5">
                {[
                  { uid: userUid, label: 'You' },
                  { uid: partnerUid, label: partnerLabel },
                ]
                  .filter(({ uid }) => comments[uid])
                  .map(({ uid, label }) => (
                    <p
                      key={uid}
                      className={`max-w-[85%] rounded-2xl px-3 py-1.5 font-body text-sm text-ink ${
                        uid === userUid ? 'self-end bg-blush-soft' : 'self-start bg-white/80 shadow-sm'
                      }`}
                    >
                      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</span>
                      {comments[uid]}
                    </p>
                  ))}
              </div>
            )}
            <CommentBox saved={comments[userUid]} onSend={onComment} />
            <button
              type="button"
              onClick={onPlayAgain}
              className="mx-auto rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5"
            >
              Start over
            </button>
          </>
        )}
        {archive.length > 0 && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowArchive((v) => !v)}
              className="font-body text-xs text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
            >
              {showArchive ? 'Hide' : 'Show'} earlier rounds ({archive.length})
            </button>
            {showArchive &&
              [...archive].reverse().map((r, i) => (
                <div key={r.endedAt || i} className="space-y-2 rounded-2xl border border-dashed border-ink/15 p-3">
                  <p className="font-body text-xs text-ink-soft">
                    {r.endedAt ? new Date(r.endedAt).toLocaleString() : 'Earlier round'}
                  </p>
                  {r.answers?.[userUid] && <StoryCard label="Yours" text={renderMadLibText(story, r.answers[userUid])} />}
                  {r.answers?.[partnerUid] && (
                    <StoryCard label={`${partnerLabel}'s`} text={renderMadLibText(story, r.answers[partnerUid])} />
                  )}
                  {[userUid, partnerUid].map(
                    (uid) =>
                      r.comments?.[uid] && (
                        <p key={uid} className="font-body text-xs text-ink-soft">
                          {uid === userUid ? 'You' : partnerLabel}: {r.comments[uid]}
                        </p>
                      ),
                  )}
                </div>
              ))}
          </div>
        )}
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

// Free-text comment on the revealed stories; can be sent/edited any time.
function CommentBox({ saved, onSend }) {
  const [draft, setDraft] = useState(saved || '')
  const dirty = draft.trim() !== (saved || '')
  function submit(e) {
    e.preventDefault()
    if (!dirty) return
    playSound('chat_send')
    onSend(draft.trim())
  }
  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="text"
        value={draft}
        maxLength={300}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Leave a comment…"
        className="min-w-0 flex-1 rounded-full border border-ink/15 bg-white/70 px-4 py-2 font-body text-sm text-ink focus:border-rose focus:outline-none"
      />
      <button
        type="submit"
        disabled={!dirty}
        className="rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper transition-opacity disabled:opacity-40"
      >
        {saved && !draft.trim() ? 'Clear' : saved ? 'Update' : 'Send'}
      </button>
    </form>
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
