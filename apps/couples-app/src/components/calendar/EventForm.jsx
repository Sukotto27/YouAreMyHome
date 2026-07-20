import { useState } from 'react'
import { LOCATIONS } from '../../lib/locations'
import { currentTimezone, zonedTimeToUtc } from '../../lib/timezone'

const PLACEHOLDERS = {
  milestone: "What's the occasion?",
  plan: 'What are we planning?',
  goal: 'What are we working toward?',
  dateNight: 'What are we doing?',
}

const RECURRENCE_OPTIONS = [
  { value: 'none', label: "Doesn't repeat" },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
]

export default function EventForm({ category, initial, onSubmit, onCancel, saving }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [date, setDate] = useState(initial?.date ?? '')
  const [time, setTime] = useState(initial?.time ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [recurring, setRecurring] = useState(initial?.recurring ?? category === 'milestone')
  const [recurrenceType, setRecurrenceType] = useState(initial?.recurrenceType ?? 'weekly')
  const [giftEligible, setGiftEligible] = useState(initial?.giftEligible ?? false)

  const dateRequired = category === 'milestone' || category === 'dateNight'
  const isDateNight = category === 'dateNight'
  const bothTimes = isDateNight && date && time ? previewBothTimes(date, time) : null

  function handleSubmit(event) {
    event.preventDefault()
    if (!title.trim() || (dateRequired && !date)) return
    const fields = { title: title.trim(), date: date || null, notes: notes.trim() || null }
    if (isDateNight) {
      fields.time = time || null
      fields.recurrenceType = recurrenceType
      fields.timezone = currentTimezone()
      // Resetting these on every save (not just create) means editing a Date
      // Night's date/time always re-arms its reminders for the new time,
      // rather than leaving stale reminder-sent flags from before the edit.
      fields.nextOccurrenceDate = date
      fields.remindersSent = {}
    } else {
      fields.recurring = recurring
      if (category === 'milestone') fields.giftEligible = giftEligible
    }
    onSubmit(fields)
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
      <div className={isDateNight ? 'flex gap-2' : ''}>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-ink outline-none transition-colors focus:border-rose"
        />
        {isDateNight && (
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-ink outline-none transition-colors focus:border-rose"
          />
        )}
      </div>
      {!dateRequired && (
        <p className="font-body text-xs text-ink-soft/70">Leave the date blank for a "someday" {category}.</p>
      )}
      {bothTimes && (
        <div className="rounded-xl bg-blush-soft/50 px-3 py-2 font-body text-xs text-ink-soft">
          {bothTimes.map((entry) => (
            <p key={entry.name}>
              {entry.name}'s time: <span className="font-medium text-ink">{entry.time}</span> ({entry.date})
            </p>
          ))}
        </div>
      )}
      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-ink outline-none transition-colors focus:border-rose"
      />
      {isDateNight ? (
        <label className="block font-body text-sm text-ink-soft">
          <span className="mb-1 block">Repeats</span>
          <select
            value={recurrenceType}
            onChange={(event) => setRecurrenceType(event.target.value)}
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-ink outline-none transition-colors focus:border-rose"
          >
            {RECURRENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="flex items-center gap-2 font-body text-sm text-ink-soft">
          <input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} />
          Repeats every year
        </label>
      )}
      {category === 'milestone' && (
        <label className="flex items-center gap-2 font-body text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={giftEligible}
            onChange={(event) => setGiftEligible(event.target.checked)}
          />
          💐 Allow sending a virtual card & flowers for this
        </label>
      )}
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

function previewBothTimes(date, time) {
  const utcInstant = zonedTimeToUtc(date, time, currentTimezone())
  return LOCATIONS.map((loc) => ({
    name: loc.name,
    time: utcInstant.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: loc.timezone }),
    date: utcInstant.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: loc.timezone }),
  }))
}
