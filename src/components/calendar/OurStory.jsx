import { useState } from 'react'

const CATEGORY_LABELS = { milestone: 'Milestone', plan: 'Plan', goal: 'Goal' }

export default function OurStory({ items }) {
  const story = items
    .filter((item) => item.date)
    .sort((a, b) => a.date.localeCompare(b.date))
  const [index, setIndex] = useState(0)

  if (story.length === 0) {
    return (
      <p className="pt-10 text-center font-hand text-xl text-ink-soft">
        nothing dated yet — add a milestone, plan, or goal to start the story
      </p>
    )
  }

  const clampedIndex = Math.min(index, story.length - 1)
  const current = story[clampedIndex]
  const [year, month, day] = current.date.split('-').map(Number)
  const displayDate = new Date(year, month - 1, day)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-6 text-center">
      <p className="font-body text-xs uppercase tracking-wide text-ink-soft/70">
        {CATEGORY_LABELS[current.category] ?? 'Milestone'} · {clampedIndex + 1} of {story.length}
      </p>
      <div className="animate-reveal-in w-full max-w-md rounded-3xl border border-ink/10 bg-white/50 p-6">
        <p className="font-display text-2xl italic text-ink">{current.title}</p>
        <p className="mt-2 font-body text-sm text-ink-soft">
          {displayDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
        {current.notes && <p className="mt-3 font-hand text-lg text-ink-soft">{current.notes}</p>}
        {current.commentCount > 0 && (
          <p className="mt-3 font-body text-xs text-ink-soft/70">💬 {current.commentCount}</p>
        )}
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={clampedIndex === 0}
          className="rounded-full border border-ink/10 px-4 py-2 font-body text-sm text-ink-soft transition-colors hover:text-rose disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Earlier
        </button>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(story.length - 1, i + 1))}
          disabled={clampedIndex === story.length - 1}
          className="rounded-full border border-ink/10 px-4 py-2 font-body text-sm text-ink-soft transition-colors hover:text-rose disabled:cursor-not-allowed disabled:opacity-40"
        >
          Later →
        </button>
      </div>
    </div>
  )
}
