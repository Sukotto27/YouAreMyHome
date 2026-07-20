import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { nextOccurrence } from '../lib/milestones'
import { useMarkSeen } from '../hooks/useMarkSeen'
import EventForm from '../components/calendar/EventForm'
import EventRow from '../components/calendar/EventRow'
import CalendarGrid from '../components/calendar/CalendarGrid'
import OurStory from '../components/calendar/OurStory'
import WebcalPanel from '../components/calendar/WebcalPanel'

const TABS = [
  { id: 'milestones', label: 'Milestones', category: 'milestone', singular: 'milestone' },
  { id: 'dateNights', label: 'Date Night', category: 'dateNight', singular: 'date night' },
  { id: 'plans', label: 'Plans', category: 'plan', singular: 'plan' },
  { id: 'goals', label: 'Goals', category: 'goal', singular: 'goal' },
  { id: 'story', label: 'Our Story' },
  { id: 'grid', label: 'Calendar' },
]

function categoryOf(item) {
  return item.category || 'milestone'
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const oa = nextOccurrence(a)
    const ob = nextOccurrence(b)
    if (!oa && !ob) return 0
    if (!oa) return 1
    if (!ob) return -1
    return oa.daysUntil - ob.daysUntil
  })
}

export default function Calendar() {
  const { user } = useAuth()
  useMarkSeen('milestones')
  const [all, setAll] = useState(firebaseReady ? [] : readDemoList('milestones'))
  const [tab, setTab] = useState('milestones')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!firebaseReady) return
    const unsubscribe = onSnapshot(collection(db, 'milestones'), (snapshot) => {
      setAll(snapshot.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() })))
    })
    return unsubscribe
  }, [])

  const activeTab = TABS.find((t) => t.id === tab)

  async function handleAdd(fields) {
    setSaving(true)
    try {
      const authorName = user.displayName || user.email
      if (!firebaseReady) {
        const entry = {
          id: crypto.randomUUID(),
          ...fields,
          category: activeTab.category,
          addedBy: user.uid,
          addedByName: authorName,
          commentCount: 0,
        }
        setAll((prev) => {
          const next = [...prev, entry]
          writeDemoList('milestones', next)
          return next
        })
      } else {
        await addDoc(collection(db, 'milestones'), {
          ...fields,
          category: activeTab.category,
          addedBy: user.uid,
          addedByName: authorName,
          createdAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
          lastActivityByUid: user.uid,
          commentCount: 0,
        })
      }
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleSave(id, fields) {
    const editorName = user.displayName || user.email
    if (!firebaseReady) {
      setAll((prev) => {
        const next = prev.map((item) => (item.id === id ? { ...item, ...fields, updatedByName: editorName } : item))
        writeDemoList('milestones', next)
        return next
      })
      return
    }
    await updateDoc(doc(db, 'milestones', id), {
      ...fields,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
      updatedByName: editorName,
      lastActivityAt: serverTimestamp(),
      lastActivityByUid: user.uid,
    })
  }

  async function handleDelete(id) {
    if (!firebaseReady) {
      setAll((prev) => {
        const next = prev.filter((item) => item.id !== id)
        writeDemoList('milestones', next)
        return next
      })
      return
    }
    const commentsSnap = await getDocs(collection(db, 'milestones', id, 'comments'))
    const batch = writeBatch(db)
    commentsSnap.docs.forEach((commentDoc) => batch.delete(commentDoc.ref))
    batch.delete(doc(db, 'milestones', id))
    await batch.commit()
  }

  const categoryItems = activeTab.category
    ? sortItems(all.filter((item) => categoryOf(item) === activeTab.category))
    : []

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl italic text-ink">Calendar</h1>

      <div className="flex flex-wrap gap-1 rounded-full bg-ink/5 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id)
              setAdding(false)
            }}
            className={`rounded-full px-3 py-1.5 font-body text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-paper text-rose shadow-sm' : 'text-ink-soft'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab.category && (
        <>
          <div className="flex items-center justify-between">
            <p className="font-body text-sm text-ink-soft">
              {categoryItems.length} {activeTab.label.toLowerCase()}
            </p>
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5"
            >
              {adding ? 'Cancel' : `Add a ${activeTab.singular}`}
            </button>
          </div>

          {adding && <EventForm category={activeTab.category} onSubmit={handleAdd} saving={saving} />}

          <div className="space-y-2">
            {categoryItems.length === 0 && !adding && (
              <p className="pt-10 text-center font-hand text-xl text-ink-soft">
                nothing here yet — add your first {activeTab.singular}
              </p>
            )}
            {categoryItems.map((item) => (
              <EventRow key={item.id} item={item} category={categoryOf(item)} onSave={handleSave} onDelete={handleDelete} />
            ))}
          </div>
        </>
      )}

      {tab === 'story' && <OurStory items={all} />}

      {tab === 'grid' && (
        <>
          <CalendarGrid items={all} />
          <WebcalPanel />
        </>
      )}
    </div>
  )
}
