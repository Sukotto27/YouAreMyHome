import { useEffect, useState } from 'react'
import { addDoc, collection, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { HISTORY_MILESTONES, nextOccurrence } from '../lib/milestones'
import { useMarkSeen } from '../hooks/useMarkSeen'

export default function Milestones() {
  const { user } = useAuth()
  useMarkSeen('milestones')
  const [custom, setCustom] = useState(firebaseReady ? [] : readDemoList('milestones'))
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [recurring, setRecurring] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!firebaseReady) return
    const unsubscribe = onSnapshot(collection(db, 'milestones'), (snapshot) => {
      setCustom(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    })
    return unsubscribe
  }, [])

  async function handleAdd(event) {
    event.preventDefault()
    if (!title.trim() || !date) return
    setSaving(true)
    try {
      if (!firebaseReady) {
        const entry = {
          id: crypto.randomUUID(),
          title: title.trim(),
          date,
          recurring,
          addedByName: user.displayName,
        }
        setCustom((prev) => {
          const next = [...prev, entry]
          writeDemoList('milestones', next)
          return next
        })
      } else {
        await addDoc(collection(db, 'milestones'), {
          title: title.trim(),
          date,
          recurring,
          addedBy: user.uid,
          addedByName: user.displayName || user.email,
          createdAt: serverTimestamp(),
        })
      }
      setTitle('')
      setDate('')
      setRecurring(true)
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  const all = [...HISTORY_MILESTONES, ...custom]
    .map((milestone) => ({ milestone, occurrence: nextOccurrence(milestone) }))
    .sort((a, b) => a.occurrence.daysUntil - b.occurrence.daysUntil)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl italic text-ink">Milestones</h1>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5"
        >
          {adding ? 'Cancel' : 'Add a date'}
        </button>
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="space-y-3 rounded-2xl border border-ink/10 bg-white/50 p-4">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What's the occasion?"
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-ink outline-none transition-colors focus:border-rose"
          />
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-ink outline-none transition-colors focus:border-rose"
          />
          <label className="flex items-center gap-2 font-body text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(event) => setRecurring(event.target.checked)}
            />
            Repeats every year
          </label>
          <button
            type="submit"
            disabled={!title.trim() || !date || saving}
            className="rounded-full bg-rose px-5 py-2 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Add to milestones'}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {all.map(({ milestone, occurrence }) => (
          <MilestoneRow key={milestone.id} milestone={milestone} occurrence={occurrence} />
        ))}
      </div>
    </div>
  )
}

function MilestoneRow({ milestone, occurrence }) {
  const { daysUntil, next, yearsSince } = occurrence
  const soon = daysUntil >= 0 && daysUntil <= 7
  const label =
    daysUntil === 0
      ? 'today!'
      : daysUntil === 1
        ? 'tomorrow'
        : daysUntil > 0
          ? `in ${daysUntil} days`
          : `${Math.abs(daysUntil)} days ago`

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
        soon ? 'border-rose bg-blush-soft/50' : 'border-ink/10 bg-white/50'
      }`}
    >
      <div className="min-w-0">
        <p className="font-body text-ink">{milestone.title}</p>
        {milestone.note && <p className="mt-0.5 font-hand text-sm text-ink-soft">{milestone.note}</p>}
        <p className="mt-1 font-body text-xs text-ink-soft">
          {next.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
          {yearsSince > 0 && ` · ${ordinal(yearsSince)} anniversary`}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-3 py-1 font-body text-xs font-medium ${
          soon ? 'bg-rose text-paper' : 'text-ink-soft'
        }`}
      >
        {label}
      </span>
    </div>
  )
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
