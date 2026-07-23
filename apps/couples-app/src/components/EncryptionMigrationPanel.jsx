import { useEffect, useState } from 'react'
import { collection, deleteField, doc, getDocs, onSnapshot, query, setDoc, updateDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { encryptJson } from '../lib/e2ee'

const MESSAGE_PLAIN_FIELDS = ['text', 'imageDataUrl', 'url', 'previewTitle', 'previewImage', 'previewDomain', 'caption']

function messageContentFrom(data) {
  const replyText = data.replyTo?.text
  if (data.type === 'image') return { imageDataUrl: data.imageDataUrl, replyText }
  if (data.type === 'link') {
    return {
      url: data.url,
      previewTitle: data.previewTitle,
      previewImage: data.previewImage,
      previewDomain: data.previewDomain,
      caption: data.caption,
      replyText,
    }
  }
  return { text: data.text, replyText }
}

// One-time, user-triggered conversion of existing plaintext chat/gallery
// history to encrypted, run from Settings → Security once both of you have
// set up the same key. Client-side and idempotent — safe to re-run, it just
// skips whatever's already converted. Never runs with a service account;
// this is the same authenticated session and Firestore rules as normal use.
export default function EncryptionMigrationPanel({ cryptoKey }) {
  const { user } = useAuth()
  const [migratedAt, setMigratedAt] = useState(undefined) // undefined = loading
  const [backedUp, setBackedUp] = useState(false)
  const [status, setStatus] = useState(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!firebaseReady) {
      setMigratedAt(null)
      return
    }
    return onSnapshot(doc(db, 'settings', 'e2ee'), (snap) => {
      setMigratedAt(snap.exists() ? snap.data().migratedAt ?? null : null)
    })
  }, [])

  if (!firebaseReady || migratedAt === undefined || migratedAt) return null

  async function downloadBackup() {
    const [messagesSnap, gallerySnap] = await Promise.all([
      getDocs(query(collection(db, 'messages'))),
      getDocs(query(collection(db, 'gallery'))),
    ])
    const backup = {
      exportedAt: new Date().toISOString(),
      messages: messagesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      gallery: gallerySnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `chat-gallery-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setBackedUp(true)
  }

  async function migrate() {
    setRunning(true)
    try {
      const [messagesSnap, gallerySnap] = await Promise.all([
        getDocs(query(collection(db, 'messages'))),
        getDocs(query(collection(db, 'gallery'))),
      ])

      const pendingMessages = messagesSnap.docs.filter((d) => !d.data().encryptedContent)
      const pendingGallery = gallerySnap.docs.filter((d) => !d.data().encryptedImage)
      let done = 0
      const total = pendingMessages.length + pendingGallery.length

      for (const docSnap of pendingMessages) {
        const data = docSnap.data()
        const content = messageContentFrom(data)
        const encryptedContent = await encryptJson(content, cryptoKey)
        const clears = {}
        for (const field of MESSAGE_PLAIN_FIELDS) clears[field] = deleteField()
        // The quoted-reply snippet now lives inside encryptedContent as
        // replyText (captured above) — strip the old plaintext copy off
        // replyTo, leaving it as {id, senderName} structural metadata only.
        if (data.replyTo?.text !== undefined) clears['replyTo.text'] = deleteField()
        await updateDoc(docSnap.ref, { encryptedContent, ...clears })
        done += 1
        setStatus(`Converting ${done}/${total}…`)
      }

      for (const docSnap of pendingGallery) {
        const encryptedImage = await encryptJson({ imageDataUrl: docSnap.data().imageDataUrl }, cryptoKey)
        await updateDoc(docSnap.ref, { encryptedImage, imageDataUrl: deleteField() })
        done += 1
        setStatus(`Converting ${done}/${total}…`)
      }

      // Re-verify nothing was missed (client SDK writes can be dropped/
      // retried under flaky connectivity) before marking this done.
      const [recheckMessages, recheckGallery] = await Promise.all([
        getDocs(query(collection(db, 'messages'))),
        getDocs(query(collection(db, 'gallery'))),
      ])
      const stillPlainMessages = recheckMessages.docs.filter((d) => !d.data().encryptedContent).length
      const stillPlainGallery = recheckGallery.docs.filter((d) => !d.data().encryptedImage).length
      if (stillPlainMessages || stillPlainGallery) {
        setStatus(`${stillPlainMessages + stillPlainGallery} item(s) didn't convert — try again.`)
        return
      }

      await setDoc(doc(db, 'settings', 'e2ee'), { migratedAt: new Date(), migratedBy: user.uid })
      setStatus('Done — everything is encrypted.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4">
      <p className="font-body text-sm font-medium text-ink">Encrypt existing history</p>
      <p className="mt-1 font-body text-xs text-ink-soft">
        Chat and Gallery photos sent before today are still stored as plain text. This converts
        them to encrypted, in place. Download a backup first — there's no undo.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={downloadBackup}
          className="w-full rounded-full border border-ink/15 px-4 py-2 font-body text-sm font-medium text-ink transition-colors hover:border-rose"
        >
          Download a backup
        </button>
        <button
          type="button"
          disabled={!backedUp || running}
          onClick={migrate}
          className="w-full rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? 'Migrating…' : 'Migrate to encrypted'}
        </button>
      </div>
      {status && <p className="mt-2 font-body text-xs text-ink-soft">{status}</p>}
    </div>
  )
}
