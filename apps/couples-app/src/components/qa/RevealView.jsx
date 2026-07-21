import CommentThread from '../CommentThread'

export default function RevealView({
  roundId,
  questionText,
  answers,
  currentUid,
  onAskAgain,
  startingNew,
  rewind = false,
  askAgainLabel = 'Ask a new question',
}) {
  const entries = Object.entries(answers)
  const ordered = entries.sort(([uidA]) => (uidA === currentUid ? -1 : 1))

  return (
    <div
      className={`mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 overflow-y-auto px-4 py-8 sm:px-6 ${
        rewind ? 'animate-rewind-in' : ''
      }`}
    >
      {rewind && (
        <button
          type="button"
          onClick={onAskAgain}
          className="self-start font-body text-sm text-ink-soft transition-colors hover:text-rose"
        >
          {askAgainLabel}
        </button>
      )}
      <div className="rounded-3xl border border-ink/10 bg-white/50 p-6 text-center">
        <p className="font-display text-2xl italic text-ink">{questionText}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {ordered.map(([uid, answer], index) => (
          <div
            key={uid}
            className="animate-reveal-in space-y-2 rounded-2xl border border-teal/30 bg-white/60 p-4"
            style={{ animationDelay: `${index * 120}ms` }}
          >
            <p className="font-hand text-lg text-teal">{answer.name}</p>
            <p className="font-body text-ink">{answer.text}</p>
          </div>
        ))}
      </div>

      {roundId && (
        <div className="rounded-2xl border border-ink/10 bg-white/40 p-4">
          <CommentThread collectionName="qaRounds" parentId={roundId} />
        </div>
      )}

      {!rewind && (
        <button
          type="button"
          onClick={onAskAgain}
          disabled={startingNew}
          className="mx-auto rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {askAgainLabel}
        </button>
      )}
    </div>
  )
}
