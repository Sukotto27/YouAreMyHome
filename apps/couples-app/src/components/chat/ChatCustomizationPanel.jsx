import { useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { db, firebaseReady } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { readDemoList } from '../../lib/demoStore'
import { CHAT_BACKGROUNDS } from '../../lib/chatBackgrounds'
import { CHAT_FONTS } from '../../lib/chatFonts'
import { BUBBLE_COLORS } from '../../lib/bubbleColors'
import { decryptJson } from '../../lib/e2ee'

const GALLERY_LIMIT = 18

// A doc without encryptedImage is legacy pre-migration plaintext and passes
// through unchanged; one that can't be decrypted (no key yet) is dropped
// from the picker rather than shown broken.
async function decryptGalleryPhoto(photo, cryptoKey) {
  if (!photo.encryptedImage) return photo
  if (!cryptoKey) return null
  try {
    const { imageDataUrl } = await decryptJson(photo.encryptedImage, cryptoKey)
    return { ...photo, imageDataUrl }
  } catch {
    return null
  }
}

const TABS = [
  { id: 'background', label: 'Background' },
  { id: 'colors', label: 'Color' },
  { id: 'font', label: 'Font' },
]

// Background/color/font for chat — shared by ChatMenu's quick in-chat
// popover and the full Settings page, both reading/writing the same
// settings/chat doc via useChatSettings. Avatar picking lives only in
// Settings now (same underlying settings.avatars field either way, no
// need for two separate pickers for it).
export default function ChatCustomizationPanel({ settings, onUpdateSettings, cryptoKey }) {
  const { user } = useAuth()
  const [tab, setTab] = useState('background')
  const [galleryPhotos, setGalleryPhotos] = useState([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const raw = firebaseReady
        ? (
            await getDocs(query(collection(db, 'gallery'), orderBy('createdAt', 'desc'), limit(GALLERY_LIMIT)))
          ).docs.map((d) => ({ id: d.id, ...d.data() }))
        : readDemoList('gallery').slice(0, GALLERY_LIMIT)
      const decrypted = (await Promise.all(raw.map((photo) => decryptGalleryPhoto(photo, cryptoKey)))).filter(Boolean)
      if (!cancelled) setGalleryPhotos(decrypted)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [cryptoKey])

  const myColor = settings.bubbleColors[user.displayName]

  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-full bg-ink/5 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-full py-1.5 font-body text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-paper text-rose shadow-sm' : 'text-ink-soft'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'background' && (
        <div className="max-h-64 overflow-y-auto">
          <p className="mb-1.5 font-body text-xs font-medium text-ink-soft">Presets</p>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {CHAT_BACKGROUNDS.map((bg) => {
              const isCurrent = settings.background?.type === 'preset' && settings.background.id === bg.id
              return (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => onUpdateSettings({ background: { type: 'preset', id: bg.id } })}
                  className={`flex h-14 flex-col items-center justify-end gap-1 rounded-xl border p-1 transition-transform hover:scale-105 ${
                    isCurrent ? 'border-rose ring-2 ring-rose/40' : 'border-ink/10'
                  }`}
                >
                  <span className="h-8 w-full rounded-md" style={bg.style} />
                  <span className="font-body text-[10px] text-ink-soft">{bg.name}</span>
                </button>
              )
            })}
          </div>
          <p className="mb-1.5 font-body text-xs font-medium text-ink-soft">From gallery</p>
          {galleryPhotos.length === 0 ? (
            <p className="font-body text-xs text-ink-soft/70">No photos in the gallery yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {galleryPhotos.map((photo) => {
                const isCurrent = settings.background?.type === 'photo' && settings.background.url === photo.imageDataUrl
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => onUpdateSettings({ background: { type: 'photo', url: photo.imageDataUrl } })}
                    className={`h-14 overflow-hidden rounded-xl border transition-transform hover:scale-105 ${
                      isCurrent ? 'border-rose ring-2 ring-rose/40' : 'border-ink/10'
                    }`}
                  >
                    <img src={photo.imageDataUrl} alt="" className="h-full w-full object-cover" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'colors' && (
        <div>
          <p className="mb-2 font-body text-xs text-ink-soft">
            Sets the color of your bubbles — for both of us.
          </p>
          <div className="grid grid-cols-4 gap-2">
            {BUBBLE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onUpdateSettings({ bubbleColors: { [user.displayName]: color } })}
                aria-label={color}
                className={`h-10 w-10 rounded-full border-2 transition-transform hover:scale-110 ${
                  myColor === color ? 'border-ink' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}

      {tab === 'font' && (
        <div className="space-y-1">
          {CHAT_FONTS.map((font) => (
            <button
              key={font.id}
              type="button"
              onClick={() => onUpdateSettings({ font: font.id })}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 transition-colors ${
                settings.font === font.id ? 'border-rose bg-blush-soft/40' : 'border-ink/10'
              }`}
            >
              <span className={`${font.className} text-base text-ink`}>Aa — {font.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
