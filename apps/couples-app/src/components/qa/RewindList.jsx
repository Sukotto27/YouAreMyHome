export default function RewindList({ rounds, onSelect, onBack }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="font-body text-sm text-ink-soft transition-colors hover:text-rose"
        >
          ← Back
        </button>
        <h1 className="font-display text-2xl italic text-ink">Rewind</h1>
      </div>
      <p className="font-hand text-lg text-ink-soft">every question you've asked each other</p>

      {rounds.length === 0 ? (
        <p className="pt-10 text-center font-hand text-xl text-ink-soft">
          nothing to rewind yet — answer a question first
        </p>
      ) : (
        <div className="space-y-2">
          {rounds.map((round) => (
            <button
              key={round.id}
              type="button"
              onClick={() => onSelect(round)}
              className="w-full rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 text-left transition-colors hover:border-rose"
            >
              <p className="font-body text-ink">{round.questionText}</p>
              <p className="mt-1 font-hand text-sm text-ink-soft">{formatDate(round.createdAt)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function formatDate(timestamp) {
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp || Date.now())
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
