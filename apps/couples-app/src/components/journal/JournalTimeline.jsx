import { useEffect, useState } from 'react'
import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db, firebaseReady } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { readDemoList, writeDemoList } from '../../lib/demoStore'
import JournalEntry from './JournalEntry'

const RECENT_LIMIT = 100

export default function JournalTimeline() {
  const { user } = useAuth()
  const [entries, setEntries] = useState(firebaseReady ? [] : readDemoList('journalEvents'))
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!firebaseReady) return
    const entriesQuery = query(collection(db, 'journalEvents'), orderBy('createdAt', 'desc'), limit(RECENT_LIMIT))
    const unsubscribe = onSnapshot(entriesQuery, (snapshot) => {
      setEntries(snapshot.docs.map((entryDoc) => ({ id: entryDoc.id, ...entryDoc.data() })))
    })
    return unsubscribe
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      const authorName = user.displayName || user.email
      if (!firebaseReady) {
        const entry = {
          id: crypto.randomUUID(),
          type: 'custom',
          text: trimmed,
          authorUid: user.uid,
          authorName,
          createdAt: new Date().toISOString(),
        }
        setEntries((prev) => {
          const next = [entry, ...prev]
          writeDemoList('journalEvents', next)
          return next
        })
      } else {
        await addDoc(collection(db, 'journalEvents'), {
          type: 'custom',
          text: trimmed,
          authorUid: user.uid,
          authorName,
          createdAt: serverTimestamp(),
        })
      }
      setText('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Add an entry..."
          className="flex-1 rounded-full border border-ink/15 bg-white/60 px-4 py-2 font-body text-ink outline-none transition-colors focus:border-rose"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="shrink-0 rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
        >
          Post
        </button>
      </form>

      {entries.length === 0 ? (
        <p className="pt-10 text-center font-hand text-xl text-ink-soft">
          nothing here yet — your day starts writing itself
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <JournalEntry key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
