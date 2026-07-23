import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useChatSettings } from '../hooks/useChatSettings'
import { useEncryptionKey } from '../hooks/useEncryptionKey'
import { AVATAR_PRESETS } from '../lib/avatarOptions'
import { avatarFor } from '../lib/avatars'
import { squareThumbnailFromUrl } from '../lib/image'
import EncryptionMigrationPanel from '../components/EncryptionMigrationPanel'

const SAVED_FEEDBACK_MS = 1400

// Reached by tapping your own avatar on Home or in Chat. Avatar and name
// here are cosmetic-only: they live in the shared chat-settings doc (see
// useChatSettings), keyed by the fixed 'Scott'/'Cristina' identity that
// every other feature already matches against — this page never touches
// that identity itself, just how it's shown.
export default function Profile() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { hasKey, cryptoKey, rawKeyBase64 } = useEncryptionKey()
  const [revealingKey, setRevealingKey] = useState(false)
  const [settings, updateSettings] = useChatSettings()
  const [nameDraft, setNameDraft] = useState(settings.preferredNames[user.displayName] || user.displayName)
  const [nameSaved, setNameSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const fileInputRef = useRef(null)

  const myAvatar = avatarFor(user.displayName, settings.avatars)

  async function chooseAvatar(url) {
    setUploadError(null)
    await updateSettings({ avatars: { [user.displayName]: url } })
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setUploadError(null)
    const objectUrl = URL.createObjectURL(file)
    try {
      // Same approach as everywhere else in the app (gallery/chat photos,
      // gallery-photo-as-avatar) — a small data URL stored directly in the
      // shared settings doc, no Cloud Storage bucket needed.
      const thumbnail = await squareThumbnailFromUrl(objectUrl, { size: 256, quality: 0.85 })
      await updateSettings({ avatars: { [user.displayName]: thumbnail } })
    } catch {
      setUploadError("Couldn't upload that photo — try a different one.")
    } finally {
      URL.revokeObjectURL(objectUrl)
      setUploading(false)
    }
  }

  async function saveName(event) {
    event.preventDefault()
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === user.displayName) {
      await updateSettings({ preferredNames: { [user.displayName]: '' } })
    } else {
      await updateSettings({ preferredNames: { [user.displayName]: trimmed } })
    }
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), SAVED_FEEDBACK_MS)
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-4 flex items-center gap-1 font-body text-sm text-ink-soft transition-colors hover:text-rose"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>

        <h1 className="font-display text-2xl italic text-ink">Your Profile</h1>

        <section className="mt-6">
          <div className="flex flex-col items-center gap-3">
            {myAvatar ? (
              <img
                src={myAvatar}
                alt=""
                className="h-24 w-24 rounded-full object-cover ring-4 ring-offset-4 ring-offset-paper ring-rose"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-blush-soft/60 font-display text-3xl italic text-rose ring-4 ring-offset-4 ring-offset-paper ring-rose">
                {user.displayName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full border border-rose/30 bg-blush-soft/50 px-4 py-1.5 font-body text-sm font-medium text-ink transition-colors hover:border-rose disabled:opacity-60"
            >
              {uploading ? 'Uploading…' : 'Upload a photo'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            {uploadError && <p className="font-body text-xs text-rose">{uploadError}</p>}
          </div>

          <p className="mb-2 mt-5 font-body text-xs font-medium text-ink-soft">Or pick a preset</p>
          <div className="grid grid-cols-6 gap-2">
            {AVATAR_PRESETS.map((avatar) => {
              const isCurrent = myAvatar === avatar.url
              return (
                <button
                  key={avatar.id}
                  type="button"
                  onClick={() => chooseAvatar(avatar.url)}
                  className={`h-11 w-11 overflow-hidden rounded-full border-2 transition-transform hover:scale-105 ${
                    isCurrent ? 'border-rose' : 'border-transparent'
                  }`}
                >
                  <img src={avatar.url} alt="" className="h-full w-full object-cover" />
                </button>
              )
            })}
          </div>
        </section>

        <hr className="my-6 border-ink/10" />

        <section>
          <label htmlFor="profile-name" className="font-body text-xs font-medium text-ink-soft">
            Display name
          </label>
          <form onSubmit={saveName} className="mt-1.5 flex gap-2">
            <input
              id="profile-name"
              type="text"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder={user.displayName}
              className="min-w-0 flex-1 rounded-full border border-ink/15 bg-white/70 px-4 py-2 font-body text-sm text-ink outline-none focus:border-rose"
            />
            <button
              type="submit"
              className="shrink-0 rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper transition-transform hover:-translate-y-0.5"
            >
              Save
            </button>
          </form>
          <p className="mt-1.5 font-body text-xs text-ink-soft">
            {nameSaved ? 'Saved!' : "Just how you're shown around the app — doesn't change your account name."}
          </p>
        </section>

        <hr className="my-6 border-ink/10" />

        <section>
          <p className="font-body text-xs font-medium text-ink-soft">Security</p>
          {hasKey ? (
            <div className="mt-1.5 space-y-3">
              <p className="font-body text-xs text-ink-soft">
                Chat and Gallery are end-to-end encrypted on this device. Setting up another device
                (or your partner's, if they haven't yet) needs this same key.
              </p>
              {revealingKey ? (
                <div className="break-all rounded-xl border border-ink/15 bg-white/70 px-4 py-3 font-mono text-sm text-ink">
                  {rawKeyBase64}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setRevealingKey(true)}
                  className="rounded-full border border-ink/15 px-4 py-1.5 font-body text-sm font-medium text-ink transition-colors hover:border-rose"
                >
                  Show my encryption key
                </button>
              )}
              <EncryptionMigrationPanel cryptoKey={cryptoKey} />
            </div>
          ) : (
            <p className="mt-1.5 font-body text-xs text-ink-soft">
              Set up encryption from Chat or Gallery first, then come back here to view your key or
              encrypt any existing history.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
