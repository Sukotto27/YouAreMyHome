import { useState } from 'react'
import { nextOccurrence, recurrenceTypeOf } from '../../lib/milestones'
import { LOCATIONS } from '../../lib/locations'
import { zonedTimeToUtc } from '../../lib/timezone'
import CommentThread from '../CommentThread'
import EventForm from './EventForm'
import SendCardModal from './SendCardModal'

const RECURRENCE_LABELS = {
  weekly: 'Repeats every week',
  biweekly: 'Repeats every 2 weeks',
  monthly: 'Repeats every month',
  yearly: 'Repeats every year',
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function bothTimesFor(item) {
  if (!item.time || !item.timezone) return null
  const utcInstant = zonedTimeToUtc(item.date, item.time, item.timezone)
  return LOCATIONS.map((loc) => ({
    name: loc.name,
    time: utcInstant.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: loc.timezone }),
  }))
}

export default function EventRow({ item, category, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sendingCard, setSendingCard] = useState(false)

  const occurrence = nextOccurrence(item)
  const soon = occurrence && occurrence.daysUntil >= 0 && occurrence.daysUntil <= 7
  const label = occurrence
    ? occurrence.daysUntil === 0
      ? 'today!'
      : occurrence.daysUntil === 1
        ? 'tomorrow'
        : occurrence.daysUntil > 0
          ? `in ${occurrence.daysUntil} days`
          : `${Math.abs(occurrence.daysUntil)} days ago`
    : 'someday'
  const recurrenceType = recurrenceTypeOf(item)
  const bothTimes = category === 'dateNight' ? bothTimesFor(item) : null

  async function handleSave(fields) {
    setSaving(true)
    try {
      await onSave(item.id, fields)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await onDelete(item.id)
    } finally {
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  if (editing) {
    return (
      <EventForm
        category={category}
        initial={item}
        saving={saving}
        onSubmit={handleSave}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        soon ? 'border-rose bg-blush-soft/50' : 'border-ink/10 bg-white/50'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-ink">{item.title}</p>
          {item.notes && <p className="mt-0.5 font-hand text-sm text-ink-soft">{item.notes}</p>}
          {occurrence && (
            <p className="mt-1 font-body text-xs text-ink-soft">
              {occurrence.next.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
              {occurrence.yearsSince > 0 && item.showYearsSince !== false && ` · ${ordinal(occurrence.yearsSince)} anniversary`}
            </p>
          )}
          {bothTimes && (
            <p className="mt-1 font-body text-xs text-ink-soft">
              {bothTimes.map((entry, index) => (
                <span key={entry.name}>
                  {index > 0 && ' · '}
                  {entry.name}: {entry.time}
                </span>
              ))}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 font-body text-xs font-medium ${
            soon ? 'bg-rose text-paper' : 'text-ink-soft'
          }`}
        >
          {label}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 font-body text-xs text-ink-soft">
        <button type="button" onClick={() => setShowComments((v) => !v)} className="hover:text-rose">
          💬 {item.commentCount || 0}
        </button>
        <button type="button" onClick={() => setEditing(true)} className="hover:text-rose">
          Edit
        </button>
        {item.giftEligible && (
          <button type="button" onClick={() => setSendingCard(true)} className="hover:text-rose">
            💐 Send a card
          </button>
        )}
        {!item.protected &&
          (confirmingDelete ? (
            <span className="flex items-center gap-2">
              <span>Delete this?</span>
              <button type="button" onClick={handleDelete} disabled={deleting} className="font-medium text-rose">
                {deleting ? 'Deleting…' : 'Yes'}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} className="hover:text-rose">
              Delete
            </button>
          ))}
        {category === 'dateNight' && recurrenceType !== 'none' && (
          <span className="text-ink-soft/60">{RECURRENCE_LABELS[recurrenceType]}</span>
        )}
      </div>

      {showComments && (
        <div className="mt-3 border-t border-ink/10 pt-3">
          <CommentThread collectionName="milestones" parentId={item.id} />
        </div>
      )}

      {sendingCard && <SendCardModal occasion={item.title} onClose={() => setSendingCard(false)} />}
    </div>
  )
}
