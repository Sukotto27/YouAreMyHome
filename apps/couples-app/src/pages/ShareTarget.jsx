import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { resizeImageFile } from '../lib/image'

const SHARE_CACHE = 'share-target-v1'
const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID

function safeHostname(url) {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

// Lands here after src/sw.js intercepts the OS share-sheet POST and
// redirects with title/text/url (plain query params) and, if an image file
// was shared, an `image` Cache Storage key. Shows a confirm-before-send
// screen rather than auto-posting, matching every other compose flow in
// this app (Chat/Mail/Calendar).
export default function ShareTarget() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [imageDataUrl, setImageDataUrl] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [caption, setCaption] = useState(searchParams.get('text') || '')
  const [sending, setSending] = useState(false)

  const sharedUrl = searchParams.get('url') || ''
  const imageKey = searchParams.get('image')

  useEffect(() => {
    let cancelled = false

    async function loadImage() {
      const cache = await caches.open(SHARE_CACHE)
      const cached = await cache.match(imageKey)
      if (cached) {
        const blob = await cached.blob()
        const dataUrl = await resizeImageFile(blob)
        if (!cancelled) setImageDataUrl(dataUrl)
        await cache.delete(imageKey)
      }
    }

    async function loadPreview() {
      if (!firebaseReady || !user) return
      const idToken = await user.getIdToken()
      const response = await fetch(
        `https://us-central1-${PROJECT_ID}.cloudfunctions.net/linkPreview?url=${encodeURIComponent(sharedUrl)}`,
        { headers: { Authorization: `Bearer ${idToken}` } },
      )
      if (response.ok && !cancelled) setPreview(await response.json())
    }

    async function load() {
      try {
        if (imageKey) await loadImage()
        else if (sharedUrl) await loadPreview()
      } catch {
        // No preview/image available — still lets the raw link go through.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [imageKey, sharedUrl, user])

  async function handleSend() {
    setSending(true)
    try {
      const senderName = user.displayName || user.email

      if (imageDataUrl && firebaseReady) {
        await addDoc(collection(db, 'messages'), {
          type: 'image',
          imageDataUrl,
          replyTo: null,
          senderUid: user.uid,
          senderName,
          createdAt: serverTimestamp(),
        })
        await addDoc(collection(db, 'gallery'), {
          imageDataUrl,
          uploadedBy: user.uid,
          uploadedByName: senderName,
          createdAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
          lastActivityByUid: user.uid,
          commentCount: 0,
        })
      } else if (sharedUrl && firebaseReady) {
        await addDoc(collection(db, 'messages'), {
          type: 'link',
          url: sharedUrl,
          previewTitle: preview?.title || null,
          previewImage: preview?.image || null,
          previewDomain: preview?.domain || safeHostname(sharedUrl),
          caption: caption.trim() || null,
          replyTo: null,
          senderUid: user.uid,
          senderName,
          createdAt: serverTimestamp(),
        })
      }
      navigate('/chat')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-hand text-2xl text-ink-soft">just a moment...</p>
      </div>
    )
  }

  const domain = preview?.domain || (sharedUrl ? safeHostname(sharedUrl) : null)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl italic text-ink">Share to chat</h1>

      {imageDataUrl && <img src={imageDataUrl} alt="" className="w-full rounded-3xl border border-ink/10" />}

      {!imageDataUrl && sharedUrl && (
        <a
          href={sharedUrl}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-2xl border border-ink/10 bg-white/50"
        >
          {preview?.image && <img src={preview.image} alt="" className="h-40 w-full object-cover" />}
          <div className="p-3">
            <p className="font-body text-sm font-medium text-ink">{preview?.title || sharedUrl}</p>
            {domain && <p className="mt-0.5 font-body text-xs text-ink-soft">{domain}</p>}
          </div>
        </a>
      )}

      {!imageDataUrl && !sharedUrl && (
        <p className="font-hand text-xl text-ink-soft">Nothing to share — go back and try again.</p>
      )}

      {!imageDataUrl && sharedUrl && (
        <input
          type="text"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="Add a caption (optional)"
          className="w-full rounded-xl border border-ink/15 bg-white/60 px-4 py-2.5 font-body text-ink outline-none transition-colors focus:border-rose"
        />
      )}

      {(imageDataUrl || sharedUrl) && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="flex-1 rounded-full bg-rose px-5 py-2.5 font-body font-medium text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {sending ? 'Sending…' : 'Send to chat'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/chat')}
            className="rounded-full border border-ink/15 px-5 py-2.5 font-body text-ink-soft transition-colors hover:text-rose"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
