import { useEffect, useState } from 'react'
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { toDate } from '../lib/chatGrouping'

// Generic comment thread reused under a Calendar event, a QA round, a
// Scrapbook drawing, and a Gallery photo — same collection shape
// (`{collectionName}/{parentId}/comments`) under all four. Add-only in v1,
// no comment edit/delete.
//
// `encrypt`/`decrypt` are optional (async) callbacks — only Gallery.jsx
// passes them, since gallery-photo comments are the only ones in the
// Chat/Gallery encryption scope. Left undefined (Calendar/QA/Scrapbook),
// behavior is exactly what it was before encryption existed.
export default function CommentThread({ collectionName, parentId, encrypt, decrypt }) {
  const { user } = useAuth()
  const demoKey = `comments:${collectionName}:${parentId}`
  const [comments, setComments] = useState(firebaseReady ? [] : readDemoList(demoKey))
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!firebaseReady) return
    const commentsQuery = query(
      collection(db, collectionName, parentId, 'comments'),
      orderBy('createdAt', 'asc'),
    )
    const unsubscribe = onSnapshot(commentsQuery, async (snapshot) => {
      const raw = snapshot.docs.map((commentDoc) => ({ id: commentDoc.id, ...commentDoc.data() }))
      const resolved = decrypt
        ? await Promise.all(
            raw.map(async (comment) => {
              if (!comment.encryptedContent) return comment
              try {
                return { ...comment, ...(await decrypt(comment.encryptedContent)) }
              } catch {
                return { ...comment, text: '🔒 Encrypted — couldn\'t unlock with this device\'s key' }
              }
            }),
          )
        : raw
      setComments(resolved)
    })
    return unsubscribe
  }, [collectionName, parentId, decrypt])

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
          text: trimmed,
          authorUid: user.uid,
          authorName,
          createdAt: new Date().toISOString(),
        }
        setComments((prev) => {
          const next = [...prev, entry]
          writeDemoList(demoKey, next)
          return next
        })
      } else if (encrypt) {
        await addDoc(collection(db, collectionName, parentId, 'comments'), {
          encryptedContent: await encrypt({ text: trimmed }),
          authorUid: user.uid,
          authorName,
          createdAt: serverTimestamp(),
        })
      } else {
        await addDoc(collection(db, collectionName, parentId, 'comments'), {
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
    <div className="space-y-3">
      {comments.length > 0 && (
        <div className="space-y-2">
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-xl border border-ink/10 bg-white/50 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-body text-sm font-medium text-ink">{comment.authorName}</p>
                <p className="font-body text-xs text-ink-soft/70">
                  {toDate(comment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <p className="font-body text-sm text-ink-soft">{comment.text}</p>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Add a comment..."
          className="flex-1 rounded-full border border-ink/15 bg-white/60 px-3 py-1.5 font-body text-sm text-ink outline-none transition-colors focus:border-rose"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="shrink-0 rounded-full bg-rose px-4 py-1.5 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
        >
          Post
        </button>
      </form>
    </div>
  )
}
