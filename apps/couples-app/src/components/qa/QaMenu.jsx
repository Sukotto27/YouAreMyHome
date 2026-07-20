import { QUESTION_CATEGORIES } from '../../data/questionLibrary'

// Landing screen for Q&A — a placeholder menu ahead of a bigger rework of
// this page. The featured card at top is a random question neither of you
// has answered yet (shuffle re-rolls it); below it, every question category
// plus "Awaiting Your Answer" (questions your partner already answered that
// you haven't), "Custom", and "Assessments" as entries in the same list.
export default function QaMenu({
  randomQuestion,
  onShuffleRandom,
  onAnswerRandom,
  onSelectCategory,
  onSelectAwaiting,
  onSelectCustom,
  onSelectAssessments,
  onRewind,
  awaitingCount,
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="text-center">
        <h1 className="font-display text-3xl italic text-ink">Q&A</h1>
        <p className="mt-1 font-hand text-xl text-ink-soft">pick a category, or answer today's random pick</p>
        <button
          type="button"
          onClick={onRewind}
          className="mt-3 font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 transition-colors hover:text-rose"
        >
          Rewind — revisit past questions
        </button>
      </div>

      {randomQuestion ? (
        <div className="space-y-3 rounded-3xl border border-teal/30 bg-teal/10 p-5 text-center">
          <p className="font-hand text-sm text-teal">🎲 random question</p>
          <p className="font-display text-xl italic text-ink">{randomQuestion.text}</p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={onAnswerRandom}
              className="rounded-full bg-rose px-5 py-2 font-body text-sm font-medium text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5"
            >
              Answer this
            </button>
            <button
              type="button"
              onClick={onShuffleRandom}
              className="rounded-full border border-teal/40 px-5 py-2 font-body text-sm font-medium text-teal transition-colors hover:border-rose hover:text-rose"
            >
              Shuffle
            </button>
          </div>
        </div>
      ) : (
        <p className="text-center font-hand text-lg text-ink-soft">
          you've started every question in the library — try "Awaiting Your Answer" or a category
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onSelectAwaiting}
          className="relative rounded-2xl border border-rose/30 bg-blush-soft/50 px-4 py-3 text-left font-body font-medium text-ink transition-colors hover:border-rose"
        >
          Awaiting Your Answer
          {awaitingCount > 0 && (
            <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose px-1.5 font-body text-xs font-semibold text-paper">
              {awaitingCount}
            </span>
          )}
        </button>
        {QUESTION_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => onSelectCategory(category)}
            className="rounded-2xl border border-teal/30 bg-white/60 px-4 py-3 text-left font-body text-ink transition-colors hover:border-rose"
          >
            {category}
          </button>
        ))}
        <button
          type="button"
          onClick={onSelectCustom}
          className="rounded-2xl border border-teal/30 bg-white/60 px-4 py-3 text-left font-body text-ink transition-colors hover:border-rose"
        >
          Custom
        </button>
        <button
          type="button"
          onClick={onSelectAssessments}
          className="rounded-2xl border border-rose/30 bg-blush-soft/50 px-4 py-3 text-left font-body font-medium text-ink transition-colors hover:border-rose"
        >
          Assessments
        </button>
      </div>
    </div>
  )
}
