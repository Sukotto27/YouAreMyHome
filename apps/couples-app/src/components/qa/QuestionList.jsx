import { useState } from 'react'
import AnswerAvatar from '../AnswerAvatar'

// Shown for any category (including the virtual "Awaiting Your Answer" and
// "Custom" ones) — every question in it, each row showing both partners'
// avatars with a checkmark overlay if that person has answered. Never shows
// the answer text itself here, only whether each of you has answered —
// actual answers stay hidden until both are in (see QuestionDetail).
export default function QuestionList({
  title,
  questions,
  mineLabel,
  partnerLabel,
  avatars,
  showCategoryTag,
  onSelectQuestion,
  onBack,
  onAskCustom,
  submittingCustom,
}) {
  const [customText, setCustomText] = useState('')

  function submitCustom(event) {
    event.preventDefault()
    const trimmed = customText.trim()
    if (!trimmed) return
    onAskCustom(trimmed)
    setCustomText('')
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="self-start font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
      >
        ← All categories
      </button>
      <h1 className="font-display text-2xl italic text-ink">{title}</h1>

      {onAskCustom && (
        <form onSubmit={submitCustom} className="space-y-2 rounded-2xl border border-ink/10 bg-white/40 p-3">
          <textarea
            value={customText}
            onChange={(event) => setCustomText(event.target.value)}
            placeholder="Write a question to ask each other..."
            rows={2}
            className="w-full resize-none rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-sm text-ink outline-none focus:border-rose"
          />
          <button
            type="submit"
            disabled={!customText.trim() || submittingCustom}
            className="rounded-full bg-rose px-4 py-1.5 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add question
          </button>
        </form>
      )}

      {questions.length === 0 ? (
        <p className="pt-6 text-center font-hand text-lg text-ink-soft">nothing here yet</p>
      ) : (
        <div className="space-y-2">
          {questions.map((question) => (
            <button
              key={question.id}
              type="button"
              onClick={() => onSelectQuestion(question)}
              className="flex w-full items-center gap-3 rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 text-left transition-colors hover:border-rose"
            >
              <div className="min-w-0 flex-1">
                {showCategoryTag && question.category && (
                  <p className="mb-0.5 font-hand text-xs text-teal">{question.category}</p>
                )}
                <p className="font-body text-sm text-ink">{question.text}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <AnswerAvatar name={mineLabel} avatars={avatars} answered={question.answeredByMe} />
                <AnswerAvatar name={partnerLabel} avatars={avatars} answered={question.answeredByPartner} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
