import { useEffect, useRef, useState } from 'react'
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { resizeImageFile } from '../lib/image'
import { useMarkSeen } from '../hooks/useMarkSeen'
import CommentThread from '../components/CommentThread'

export default function Gallery() {
  const { user } = useAuth()
  useMarkSeen('gallery')
  const [photos, setPhotos] = useState(firebaseReady ? [] : readDemoList('gallery'))
  const [selected, setSelected] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!firebaseReady) return
    const photosQuery = query(collection(db, 'gallery'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(photosQuery, (snapshot) => {
      setPhotos(snapshot.docs.map((photoDoc) => ({ id: photoDoc.id, ...photoDoc.data() })))
    })
    return unsubscribe
  }, [])

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    try {
      const imageDataUrl = await resizeImageFile(file)

      if (!firebaseReady) {
        const entry = {
          id: crypto.randomUUID(),
          imageDataUrl,
          uploadedByName: user.displayName,
          createdAt: new Date().toISOString(),
        }
        setPhotos((prev) => {
          const next = [entry, ...prev]
          writeDemoList('gallery', next)
          return next
        })
        return
      }

      await addDoc(collection(db, 'gallery'), {
        imageDataUrl,
        uploadedBy: user.uid,
        uploadedByName: user.displayName || user.email,
        createdAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
        lastActivityByUid: user.uid,
        commentCount: 0,
      })
    } finally {
      setUploading(false)
    }
  }

  if (selected) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="self-start font-body text-sm text-ink-soft transition-colors hover:text-rose"
        >
          ← Back to gallery
        </button>
        <img src={selected.imageDataUrl} alt="" className="w-full rounded-3xl border border-ink/10" />
        <p className="text-center font-hand text-lg text-ink-soft">
          from {selected.uploadedByName} · {formatDate(selected.createdAt)}
        </p>
        <div className="rounded-2xl border border-ink/10 bg-white/40 p-4">
          <CommentThread collectionName="gallery" parentId={selected.id} />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl italic text-ink">Gallery</h1>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading ? 'Sending…' : 'Send a photo'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {photos.length === 0 ? (
        <p className="pt-10 text-center font-hand text-xl text-ink-soft">
          no photos yet — send each other something
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setSelected(photo)}
              className="overflow-hidden rounded-2xl border border-ink/10 transition-transform hover:-translate-y-0.5"
            >
              <img src={photo.imageDataUrl} alt="" className="aspect-square w-full object-cover" />
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
