import { useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db, firebaseReady } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { encodeSecret } from '../../lib/cipher'
import { readDemoList, writeDemoList } from '../../lib/demoStore'

// Reused by EventRow (gift-eligible milestones/birthdays) and CalendarGrid
// (Valentine's Day) — writes a `loveLetters` doc with type:'card' so it
// shows up in Mail right alongside plain love letters, using the exact same
// notifyOnMail Cloud Function trigger (adjusted server-side to recognize the
// card type) for the push notification + Journal mirror.
export default function SendCardModal({ occasion, onClose }) {
  const { user } = useAuth()
  const [message, setMessage] = useState(`Happy ${occasion}! Thinking of you today. 💕`)
  const [withFlowers, setWithFlowers] = useState(true)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSend() {
    const text = message.trim()
    if (!text) return
    setSending(true)
    try {
      const fromName = user.displayName || user.email
      const body = encodeSecret(text)

      if (!firebaseReady) {
        const existing = readDemoList('loveLetters')
        writeDemoList('loveLetters', [
          {
            id: crypto.randomUUID(),
            fromUid: user.uid,
            fromName,
            type: 'card',
            occasion,
            withFlowers,
            body,
            createdAt: new Date().toISOString(),
            readAt: null,
          },
          ...existing,
        ])
      } else {
        await addDoc(collection(db, 'loveLetters'), {
          fromUid: user.uid,
          fromName,
          type: 'card',
          occasion,
          withFlowers,
          body,
          createdAt: serverTimestamp(),
          readAt: null,
        })
      }
      setSent(true)
      setTimeout(onClose, 1500)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 shadow-xl">
        {sent ? (
          <p className="py-4 text-center font-hand text-2xl text-rose">Sent! 💐</p>
        ) : (
          <>
            <h2 className="text-center font-display text-2xl italic text-ink">💐 Send a card</h2>
            <p className="mt-1 text-center font-body text-sm text-ink-soft">for {occasion}</p>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              className="mt-4 w-full resize-none rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-sm text-ink outline-none transition-colors focus:border-rose"
            />
            <label className="mt-3 flex items-center gap-2 font-body text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={withFlowers}
                onChange={(event) => setWithFlowers(event.target.checked)}
              />
              Include virtual flowers 💐
            </label>
            <div className="mt-5 flex justify-center gap-3">
              <button
                type="button"
                onClick={handleSend}
                disabled={!message.trim() || sending}
                className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-ink/15 px-6 py-2.5 font-body font-medium text-ink-soft transition-colors hover:border-rose hover:text-rose"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
