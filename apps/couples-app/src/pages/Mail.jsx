import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { encodeSecret, decodeSecret } from '../lib/cipher'
import { useMarkSeen } from '../hooks/useMarkSeen'

const DEMO_PARTNER_UID = 'demo-partner'

const DEMO_SEED = [
  {
    id: 'demo-1',
    fromUid: DEMO_PARTNER_UID,
    fromName: 'Your partner',
    body: encodeSecret(
      "This is a preview letter, sealed with our own little cipher. Write me something real once we're connected.",
    ),
    createdAt: { toDate: () => new Date() },
    readAt: null,
  },
]

export default function Mail() {
  const { user } = useAuth()
  useMarkSeen('mail')
  const [letters, setLetters] = useState(firebaseReady ? [] : DEMO_SEED)
  const [selectedId, setSelectedId] = useState(null)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!firebaseReady) return
    const lettersQuery = query(collection(db, 'loveLetters'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(lettersQuery, (snapshot) => {
      setLetters(snapshot.docs.map((letterDoc) => ({ id: letterDoc.id, ...letterDoc.data() })))
    })
    return unsubscribe
  }, [])

  async function sendLetter(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    setSending(true)
    const body = encodeSecret(text)

    if (!firebaseReady) {
      setLetters((prev) => [
        {
          id: crypto.randomUUID(),
          fromUid: user.uid,
          fromName: user.displayName,
          body,
          createdAt: { toDate: () => new Date() },
          readAt: null,
        },
        ...prev,
      ])
      setDraft('')
      setComposing(false)
      setSending(false)
      return
    }

    try {
      await addDoc(collection(db, 'loveLetters'), {
        fromUid: user.uid,
        fromName: user.displayName || user.email,
        body,
        createdAt: serverTimestamp(),
        readAt: null,
      })
      setDraft('')
      setComposing(false)
    } finally {
      setSending(false)
    }
  }

  async function openLetter(letter) {
    setSelectedId(letter.id)
    if (letter.fromUid === user.uid || letter.readAt) return

    if (!firebaseReady) {
      setLetters((prev) =>
        prev.map((item) =>
          item.id === letter.id ? { ...item, readAt: { toDate: () => new Date() } } : item,
        ),
      )
      return
    }
    await updateDoc(doc(db, 'loveLetters', letter.id), { readAt: serverTimestamp() })
  }

  const selected = letters.find((letter) => letter.id === selectedId)

  if (selected) {
    return (
      <LetterView
        letter={selected}
        isOwn={selected.fromUid === user.uid}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl italic text-ink">Love letters</h1>
        <button
          type="button"
          onClick={() => setComposing((v) => !v)}
          className="rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5"
        >
          {composing ? 'Cancel' : 'Write a letter'}
        </button>
      </div>

      {composing && (
        <form
          onSubmit={sendLetter}
          className="space-y-2 rounded-2xl border border-ink/10 bg-white/50 p-4"
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={5}
            autoFocus
            placeholder="Dear you... (querido/a...)"
            className="w-full resize-none rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-ink outline-none transition-colors focus:border-rose"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="rounded-full bg-rose px-5 py-2 font-body text-sm font-medium text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {sending ? 'Sealing…' : 'Seal & send'}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {letters.length === 0 && (
          <p className="pt-10 text-center font-hand text-xl text-ink-soft">
            no letters yet — write the first one
          </p>
        )}
        {letters.map((letter) => {
          const isOwn = letter.fromUid === user.uid
          const unread = !isOwn && !letter.readAt
          return (
            <button
              key={letter.id}
              type="button"
              onClick={() => openLetter(letter)}
              className="flex w-full items-center gap-3 rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 text-left transition-colors hover:border-rose"
            >
              <EnvelopeGlyph sealed={unread} />
              <div className="flex-1">
                <p className="font-body text-sm text-ink">
                  {isOwn ? 'You wrote to your partner' : `From ${letter.fromName}`}
                </p>
                <p className="font-hand text-sm text-ink-soft">{formatDate(letter.createdAt)}</p>
              </div>
              {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-rose" aria-label="unread" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LetterView({ letter, isOwn, onBack }) {
  const text = decodeSecret(letter.body)
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="self-start font-body text-sm text-ink-soft transition-colors hover:text-rose"
      >
        ← Back to mailbox
      </button>
      <div className="rounded-3xl border border-ink/10 bg-white/60 p-6">
        <p className="mb-4 font-hand text-lg text-ink-soft">
          {isOwn ? 'To your partner' : `From ${letter.fromName}`} · {formatDate(letter.createdAt)}
        </p>
        <p className="whitespace-pre-wrap font-display text-lg italic leading-relaxed text-ink">
          {text}
        </p>
      </div>
    </div>
  )
}

function EnvelopeGlyph({ sealed }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
        sealed ? 'bg-rose text-paper' : 'bg-blush-soft text-rose'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M4 6.5l8 6.5 8-6.5" />
      </svg>
    </span>
  )
}

function formatDate(timestamp) {
  const date = timestamp?.toDate ? timestamp.toDate() : new Date()
  return (
    date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' +
    date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  )
}
