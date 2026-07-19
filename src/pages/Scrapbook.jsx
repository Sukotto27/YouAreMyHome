import { useEffect, useState } from 'react'
import { collection, doc, getDocs, onSnapshot, orderBy, query, writeBatch } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { useMarkSeen } from '../hooks/useMarkSeen'
import CommentThread from '../components/CommentThread'

export default function Scrapbook() {
  useMarkSeen('scrapbook')
  const [entries, setEntries] = useState(firebaseReady ? [] : readDemoList('scrapbook'))
  const [selected, setSelected] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!firebaseReady) return
    const entriesQuery = query(collection(db, 'scrapbook'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(entriesQuery, (snapshot) => {
      setEntries(snapshot.docs.map((entryDoc) => ({ id: entryDoc.id, ...entryDoc.data() })))
    })
    return unsubscribe
  }, [])

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    try {
      if (firebaseReady) {
        const commentsSnap = await getDocs(collection(db, 'scrapbook', selected.id, 'comments'))
        const batch = writeBatch(db)
        commentsSnap.docs.forEach((commentDoc) => batch.delete(commentDoc.ref))
        batch.delete(doc(db, 'scrapbook', selected.id))
        await batch.commit()
      } else {
        const next = entries.filter((entry) => entry.id !== selected.id)
        setEntries(next)
        writeDemoList('scrapbook', next)
      }
      setSelected(null)
      setConfirmingDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  if (selected) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setSelected(null)
              setConfirmingDelete(false)
            }}
            className="font-body text-sm text-ink-soft transition-colors hover:text-rose"
          >
            ← Back to scrapbook
          </button>
          {confirmingDelete ? (
            <div className="flex items-center gap-2 font-body text-sm">
              <span className="text-ink-soft">Delete this?</span>
              <button type="button" onClick={handleDelete} disabled={deleting} className="font-medium text-rose">
                {deleting ? 'Deleting…' : 'Yes'}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="text-ink-soft">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="font-body text-sm text-ink-soft transition-colors hover:text-rose"
            >
              Delete
            </button>
          )}
        </div>
        <img
          src={selected.imageDataUrl}
          alt="Saved drawing"
          className="w-full rounded-3xl border border-ink/10"
        />
        <p className="text-center font-hand text-lg text-ink-soft">
          saved by {selected.savedByName} · {formatDate(selected.createdAt)}
        </p>
        <div className="rounded-2xl border border-ink/10 bg-white/40 p-4">
          <CommentThread collectionName="scrapbook" parentId={selected.id} />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl italic text-ink">Scrapbook</h1>
      {entries.length === 0 ? (
        <p className="pt-10 text-center font-hand text-xl text-ink-soft">
          nothing saved yet — draw something and save it
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelected(entry)}
              className="overflow-hidden rounded-2xl border border-ink/10 transition-transform hover:-translate-y-0.5"
            >
              <img src={entry.imageDataUrl} alt="Saved drawing" className="aspect-square w-full object-cover" />
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
