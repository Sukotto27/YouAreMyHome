import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useChatSettings } from '../hooks/useChatSettings'
import { useEncryptionKey } from '../hooks/useEncryptionKey'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { AVATAR_PRESETS } from '../lib/avatarOptions'
import { avatarFor } from '../lib/avatars'
import { squareThumbnailFromUrl } from '../lib/image'
import {
  autoDownloadImagesEnabled,
  setAutoDownloadImagesEnabled,
  setSoundsEnabled,
  soundsEnabled,
} from '../lib/deviceSettings'
import EncryptionMigrationPanel from '../components/EncryptionMigrationPanel'
import ChatCustomizationPanel from '../components/chat/ChatCustomizationPanel'

const SAVED_FEEDBACK_MS = 1400

// Reached via the header's Settings icon (or by tapping your own avatar on
// Home or in Chat). Everything
// personal (avatar, name) is cosmetic-only, living in the shared
// chat-settings doc (see useChatSettings) keyed by the fixed
// 'Scott'/'Cristina' identity every other feature matches against — this
// page never touches that identity itself, just how it's shown. Sounds and
// auto-download are per-device preferences (localStorage, see
// lib/deviceSettings) — deliberately not shared, since what you want on
// your phone has nothing to do with what your partner wants on theirs.
export default function Settings() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { hasKey, cryptoKey, rawKeyBase64 } = useEncryptionKey()
  const { permission, supported, enable } = usePushNotifications()
  const [revealingKey, setRevealingKey] = useState(false)
  const [settings, updateSettings] = useChatSettings()
  const [nameDraft, setNameDraft] = useState(settings.preferredNames[user.displayName] || user.displayName)
  const [nameSaved, setNameSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [soundsOn, setSoundsOn] = useState(soundsEnabled)
  const [autoDownloadOn, setAutoDownloadOn] = useState(autoDownloadImagesEnabled)
  const [enablingPush, setEnablingPush] = useState(false)
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

  function toggleSounds(event) {
    const checked = event.target.checked
    setSoundsOn(checked)
    setSoundsEnabled(checked)
  }

  function toggleAutoDownload(event) {
    const checked = event.target.checked
    setAutoDownloadOn(checked)
    setAutoDownloadImagesEnabled(checked)
  }

  async function handleEnablePush() {
    setEnablingPush(true)
    try {
      await enable()
    } finally {
      setEnablingPush(false)
    }
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

        <h1 className="font-display text-2xl italic text-ink">Settings</h1>

        <section className="mt-6">
          <p className="font-body text-xs font-medium text-ink-soft">You</p>
          <div className="mt-2 flex flex-col items-center gap-3">
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

          <div className="mt-4">
            <label htmlFor="settings-name" className="font-body text-xs font-medium text-ink-soft">
              Display name
            </label>
            <form onSubmit={saveName} className="mt-1.5 flex gap-2">
              <input
                id="settings-name"
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
          </div>
        </section>

        <hr className="my-6 border-ink/10" />

        <section>
          <p className="mb-2 font-body text-xs font-medium text-ink-soft">Sounds</p>
          <label className="flex items-start gap-2 font-body text-sm text-ink">
            <input type="checkbox" checked={soundsOn} onChange={toggleSounds} className="mt-0.5" />
            <span>
              Play sounds
              <span className="block font-body text-xs text-ink-soft">
                Chat sends/reads, reactions, dice rolls, and the rest — this device only.
              </span>
            </span>
          </label>
        </section>

        <hr className="my-6 border-ink/10" />

        <section>
          <p className="mb-2 font-body text-xs font-medium text-ink-soft">Notifications</p>
          {!supported ? (
            <p className="font-body text-xs text-ink-soft">Push notifications aren't supported on this device/browser.</p>
          ) : permission === 'granted' ? (
            <p className="font-body text-sm text-ink">✅ Enabled on this device.</p>
          ) : permission === 'denied' ? (
            <p className="font-body text-xs text-ink-soft">
              Blocked at the browser level — re-enable them from your browser's site settings if you'd like
              them back.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="font-body text-sm text-ink-soft">Get notified the moment the other one of us does something.</p>
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={enablingPush}
                className="shrink-0 rounded-full bg-rose px-4 py-1.5 font-body text-sm font-medium text-paper disabled:opacity-60"
              >
                {enablingPush ? '…' : 'Enable'}
              </button>
            </div>
          )}
        </section>

        <hr className="my-6 border-ink/10" />

        <section>
          <p className="mb-2 font-body text-xs font-medium text-ink-soft">Photos in chat</p>
          <label className="flex items-start gap-2 font-body text-sm text-ink">
            <input type="checkbox" checked={autoDownloadOn} onChange={toggleAutoDownload} className="mt-0.5" />
            <span>
              Auto-download images you receive
              <span className="block font-body text-xs text-ink-soft">
                Saves a copy to this device the moment a photo arrives — permanent or vanishing. Off by
                default; this is your call, not theirs.
              </span>
            </span>
          </label>
        </section>

        <hr className="my-6 border-ink/10" />

        <section>
          <p className="mb-2 font-body text-xs font-medium text-ink-soft">Chat customization</p>
          <ChatCustomizationPanel settings={settings} onUpdateSettings={updateSettings} cryptoKey={cryptoKey} />
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

        <hr className="my-6 border-ink/10" />

        <section>
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-full border border-ink/15 px-4 py-2 font-body text-sm font-medium text-ink-soft transition-colors hover:border-rose hover:text-rose"
          >
            Sign out
          </button>
        </section>
      </div>
    </div>
  )
}
