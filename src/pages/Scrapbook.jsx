import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { readDemoList } from '../lib/demoStore'

export default function Scrapbook() {
  const [entries, setEntries] = useState(firebaseReady ? [] : readDemoList('scrapbook'))
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!firebaseReady) return
    const entriesQuery = query(collection(db, 'scrapbook'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(entriesQuery, (snapshot) => {
      setEntries(snapshot.docs.map((entryDoc) => ({ id: entryDoc.id, ...entryDoc.data() })))
    })
    return unsubscribe
  }, [])

  if (selected) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="self-start font-body text-sm text-ink-soft transition-colors hover:text-rose"
        >
          ← Back to scrapbook
        </button>
        <img
          src={selected.imageDataUrl}
          alt="Saved drawing"
          className="w-full rounded-3xl border border-ink/10"
        />
        <p className="text-center font-hand text-lg text-ink-soft">
          saved by {selected.savedByName} · {formatDate(selected.createdAt)}
        </p>
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
