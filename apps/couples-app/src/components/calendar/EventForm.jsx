import { useState } from 'react'

const PLACEHOLDERS = {
  milestone: "What's the occasion?",
  plan: "What are we planning?",
  goal: 'What are we working toward?',
}

export default function EventForm({ category, initial, onSubmit, onCancel, saving }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [date, setDate] = useState(initial?.date ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [recurring, setRecurring] = useState(initial?.recurring ?? category === 'milestone')

  const dateRequired = category === 'milestone'

  function handleSubmit(event) {
    event.preventDefault()
    if (!title.trim() || (dateRequired && !date)) return
    onSubmit({ title: title.trim(), date: date || null, notes: notes.trim() || null, recurring })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-ink/10 bg-white/50 p-4">
      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={PLACEHOLDERS[category]}
        className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-ink outline-none transition-colors focus:border-rose"
      />
      <input
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-ink outline-none transition-colors focus:border-rose"
      />
      {!dateRequired && (
        <p className="font-body text-xs text-ink-soft/70">Leave the date blank for a "someday" {category}.</p>
      )}
      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-ink outline-none transition-colors focus:border-rose"
      />
      <label className="flex items-center gap-2 font-body text-sm text-ink-soft">
        <input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} />
        Repeats every year
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!title.trim() || (dateRequired && !date) || saving}
          className="rounded-full bg-rose px-5 py-2 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="font-body text-sm text-ink-soft hover:text-rose">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
