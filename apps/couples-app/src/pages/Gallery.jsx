import { useEffect, useRef, useState } from 'react'
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { resizeImageFile } from '../lib/image'
import { useMarkSeen } from '../hooks/useMarkSeen'
import { decryptJson, encryptJson } from '../lib/e2ee'
import { useEncryptionKey } from '../hooks/useEncryptionKey'
import EncryptionGate from '../components/EncryptionGate'
import CommentThread from '../components/CommentThread'

// A doc without encryptedImage is legacy pre-migration plaintext and passes
// through unchanged. One that has it but can't be decrypted (no/wrong key)
// is marked _locked rather than shown broken.
async function decryptPhoto(photo, cryptoKey) {
  if (!photo.encryptedImage) return photo
  if (!cryptoKey) return { ...photo, _locked: true }
  try {
    const { imageDataUrl } = await decryptJson(photo.encryptedImage, cryptoKey)
    return { ...photo, imageDataUrl }
  } catch {
    return { ...photo, _locked: true }
  }
}

export default function Gallery() {
  const { user } = useAuth()
  const { hasKey, cryptoKey, saveKey } = useEncryptionKey()
  useMarkSeen('gallery')
  const [photos, setPhotos] = useState(firebaseReady ? [] : readDemoList('gallery'))
  const [selected, setSelected] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!firebaseReady) return
    const photosQuery = query(collection(db, 'gallery'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(photosQuery, async (snapshot) => {
      const raw = snapshot.docs.map((photoDoc) => ({ id: photoDoc.id, ...photoDoc.data() }))
      setPhotos(await Promise.all(raw.map((photo) => decryptPhoto(photo, cryptoKey))))
    })
    return unsubscribe
  }, [cryptoKey])

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

      const encryptedImage = await encryptJson({ imageDataUrl }, cryptoKey)
      await addDoc(collection(db, 'gallery'), {
        encryptedImage,
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

  if (!hasKey) {
    return <EncryptionGate saveKey={saveKey} />
  }

  if (selected) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="self-start font-body text-sm text-ink-soft transition-colors hover:text-rose"
        >
          ← Back to gallery
        </button>
        {selected._locked ? (
          <div className="flex aspect-square w-full items-center justify-center rounded-3xl border border-ink/10 bg-white/40">
            <p className="font-hand text-lg text-ink-soft">🔒 Encrypted — couldn't unlock with this device's key</p>
          </div>
        ) : (
          <img src={selected.imageDataUrl} alt="" className="w-full rounded-3xl border border-ink/10" />
        )}
        <p className="text-center font-hand text-lg text-ink-soft">
          from {selected.uploadedByName} · {formatDate(selected.createdAt)}
        </p>
        <div className="rounded-2xl border border-ink/10 bg-white/40 p-4">
          <CommentThread
            collectionName="gallery"
            parentId={selected.id}
            encrypt={(fields) => encryptJson(fields, cryptoKey)}
            decrypt={(blob) => decryptJson(blob, cryptoKey)}
          />
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
        {/* Stays in the render tree (invisible, 1px) rather than
        display:none — some mobile browsers won't open the native file/
        camera picker for a .click() on an input that isn't actually
        rendered. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="absolute h-px w-px overflow-hidden opacity-0"
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
              {photo._locked ? (
                <div className="flex aspect-square w-full items-center justify-center bg-white/60 text-2xl">🔒</div>
              ) : (
                <img src={photo.imageDataUrl} alt="" className="aspect-square w-full object-cover" />
              )}
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
