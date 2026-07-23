import { useEffect, useState } from 'react'
import { collection, getDocs, limit, query } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { bytesToBase64, decryptJson, generateRawKey, importCryptoKey, isValidRawKey } from '../lib/e2ee'

async function anyEncryptedContentExists() {
  if (!firebaseReady) return false
  const [messagesSnap, gallerySnap] = await Promise.all([
    getDocs(query(collection(db, 'messages'), limit(50))),
    getDocs(query(collection(db, 'gallery'), limit(50))),
  ])
  return (
    messagesSnap.docs.some((d) => d.data().encryptedContent) ||
    gallerySnap.docs.some((d) => d.data().encryptedImage)
  )
}

// Shown instead of Chat/Gallery/ShareTarget content whenever this device
// doesn't have the shared encryption key yet. There is no automatic sync —
// that would mean a server touches the key — so setup is always one of two
// deliberate, human-driven paths. Checks for itself whether encrypted
// content already exists anywhere, so callers (Chat/Gallery/ShareTarget)
// don't each have to compute that — while unknown, "generate a new key" is
// hidden by default so a slow check can't flash it open for a moment.
export default function EncryptionGate({ saveKey }) {
  const [mode, setMode] = useState(null) // null | 'generate' | 'enter'
  const [hasExistingContent, setHasExistingContent] = useState(true)

  useEffect(() => {
    anyEncryptedContentExists().then(setHasExistingContent)
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      {mode === 'generate' ? (
        <GenerateKeyFlow onDone={saveKey} onCancel={() => setMode(null)} />
      ) : mode === 'enter' ? (
        <EnterKeyFlow onDone={saveKey} onCancel={() => setMode(null)} />
      ) : (
        <>
          <p className="text-3xl">🔒</p>
          <h1 className="font-display text-2xl italic text-ink">Secure messaging</h1>
          <p className="font-body text-sm text-ink-soft">
            Chat and the shared gallery are end-to-end encrypted — only a device that's been given the
            key can read them. This device doesn't have it yet.
          </p>
          <div className="mt-2 flex w-full flex-col gap-2">
            {!hasExistingContent && (
              <button
                type="button"
                onClick={() => setMode('generate')}
                className="w-full rounded-full bg-rose px-5 py-2.5 font-body font-medium text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5"
              >
                I'm setting this up for the first time
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode('enter')}
              className="w-full rounded-full border border-ink/15 px-5 py-2.5 font-body font-medium text-ink transition-colors hover:border-rose"
            >
              My partner already has a key for me
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function GenerateKeyFlow({ onDone, onCancel }) {
  const [rawKeyBase64] = useState(() => bytesToBase64(generateRawKey()))
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard?.writeText(rawKeyBase64).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <>
      <h1 className="font-display text-2xl italic text-ink">Save this key</h1>
      <p className="font-body text-sm text-ink-soft">
        This is the only copy. There is no "forgot key" — if it's lost with no backup, everything
        encrypted with it becomes permanently unreadable, by anyone, including us.
      </p>
      <div className="w-full break-all rounded-xl border border-ink/15 bg-white/70 px-4 py-3 font-mono text-sm text-ink">
        {rawKeyBase64}
      </div>
      <button
        type="button"
        onClick={copy}
        className="w-full rounded-full border border-ink/15 px-5 py-2 font-body text-sm font-medium text-ink transition-colors hover:border-rose"
      >
        {copied ? 'Copied!' : 'Copy to clipboard'}
      </button>
      <div className="mt-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-left font-body text-xs text-ink-soft">
        <p className="font-medium text-ink">Getting this to your partner:</p>
        <p className="mt-1">
          Read it to them in person or on a call, or send it through a channel that's already
          end-to-end encrypted (like Signal or iMessage). Avoid email or plain text messages —
          those sit as a permanent readable copy on someone else's server, which defeats the point.
        </p>
        <p className="mt-1">You'll also need to enter this same key on any other device either of you uses this app on.</p>
      </div>
      <label className="mt-2 flex items-start gap-2 text-left font-body text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5"
        />
        I've saved this somewhere safe — I understand it can't be recovered if lost.
      </label>
      <div className="flex w-full gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-full border border-ink/15 px-5 py-2 font-body text-sm text-ink-soft transition-colors hover:border-rose"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!confirmed}
          onClick={() => onDone(rawKeyBase64)}
          className="flex-1 rounded-full bg-rose px-5 py-2 font-body font-medium text-paper disabled:cursor-not-allowed disabled:opacity-50"
        >
          I'm done, continue
        </button>
      </div>
    </>
  )
}

function EnterKeyFlow({ onDone, onCancel }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [checking, setChecking] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    setChecking(true)
    setError(null)
    try {
      await validateKeyAgainstExistingContent(trimmed)
      onDone(trimmed)
    } catch (err) {
      setError(err.message)
    } finally {
      setChecking(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col items-center gap-4">
      <h1 className="font-display text-2xl italic text-ink">Enter your key</h1>
      <p className="font-body text-sm text-ink-soft">Paste the key your partner gave you.</p>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        placeholder="Paste key here"
        className="w-full break-all rounded-xl border border-ink/15 bg-white/70 px-4 py-3 font-mono text-sm text-ink outline-none focus:border-rose"
      />
      {error && <p className="font-body text-sm text-rose">{error}</p>}
      <div className="flex w-full gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-full border border-ink/15 px-5 py-2 font-body text-sm text-ink-soft transition-colors hover:border-rose"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!value.trim() || checking}
          className="flex-1 rounded-full bg-rose px-5 py-2 font-body font-medium text-paper disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Use this key'}
        </button>
      </div>
    </form>
  )
}

// Best-effort check: if any already-encrypted message/photo exists, make
// sure this key can actually decrypt one before committing to it — catches
// a mistyped or mismatched key immediately instead of leaving every bubble
// permanently unreadable. If nothing encrypted exists yet, there's nothing
// to validate against, so any well-formed key is accepted.
async function validateKeyAgainstExistingContent(rawKeyBase64) {
  if (!isValidRawKey(rawKeyBase64)) {
    throw new Error('That doesn’t look like a valid key — check what your partner sent you.')
  }
  if (!firebaseReady) return

  const cryptoKey = await importCryptoKey(rawKeyBase64)
  const messagesSnap = await getDocs(query(collection(db, 'messages'), limit(50)))
  const encryptedDoc = messagesSnap.docs.map((d) => d.data()).find((d) => d.encryptedContent)
  if (!encryptedDoc) return

  try {
    await decryptJson(encryptedDoc.encryptedContent, cryptoKey)
  } catch {
    throw new Error("That key doesn't match what your partner is using — double check what they sent you.")
  }
}
