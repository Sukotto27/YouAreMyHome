import { useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { db, firebaseReady } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { readDemoList } from '../../lib/demoStore'
import { CHAT_BACKGROUNDS } from '../../lib/chatBackgrounds'
import { CHAT_FONTS } from '../../lib/chatFonts'
import { BUBBLE_COLORS } from '../../lib/bubbleColors'
import { AVATAR_PRESETS } from '../../lib/avatarOptions'
import { squareThumbnailFromUrl } from '../../lib/image'

const TABS = [
  { id: 'background', label: 'Background' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'colors', label: 'Color' },
  { id: 'font', label: 'Font' },
]

const GALLERY_LIMIT = 18

export default function ChatMenu({ settings, onUpdateSettings, onExportHistory, onClose }) {
  const { user } = useAuth()
  const [tab, setTab] = useState('background')
  const [galleryPhotos, setGalleryPhotos] = useState([])
  const [pickingAvatar, setPickingAvatar] = useState(false)

  useEffect(() => {
    if (!firebaseReady) {
      setGalleryPhotos(readDemoList('gallery').slice(0, GALLERY_LIMIT))
      return
    }
    let cancelled = false
    getDocs(query(collection(db, 'gallery'), orderBy('createdAt', 'desc'), limit(GALLERY_LIMIT))).then(
      (snapshot) => {
        if (!cancelled) setGalleryPhotos(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const myColor = settings.bubbleColors[user.displayName]
  const myAvatar = settings.avatars[user.displayName]

  async function chooseGalleryAvatar(photo) {
    setPickingAvatar(true)
    try {
      const thumbnail = await squareThumbnailFromUrl(photo.imageDataUrl)
      await onUpdateSettings({ avatars: { [user.displayName]: thumbnail } })
    } finally {
      setPickingAvatar(false)
    }
  }

  return (
    <div className="absolute right-4 top-14 z-20 w-80 rounded-2xl border border-ink/10 bg-paper p-3 shadow-lg sm:right-6">
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

      {tab === 'avatar' && (
        <div className="max-h-64 overflow-y-auto">
          <p className="mb-1.5 font-body text-xs font-medium text-ink-soft">Presets</p>
          <div className="mb-3 grid grid-cols-4 gap-2">
            {AVATAR_PRESETS.map((avatar) => {
              const isCurrent = myAvatar === avatar.url
              return (
                <button
                  key={avatar.id}
                  type="button"
                  onClick={() => onUpdateSettings({ avatars: { [user.displayName]: avatar.url } })}
                  className={`h-12 w-12 overflow-hidden rounded-full border-2 transition-transform hover:scale-105 ${
                    isCurrent ? 'border-rose' : 'border-transparent'
                  }`}
                >
                  <img src={avatar.url} alt="" className="h-full w-full object-cover" />
                </button>
              )
            })}
          </div>
          <p className="mb-1.5 font-body text-xs font-medium text-ink-soft">From gallery</p>
          {galleryPhotos.length === 0 ? (
            <p className="font-body text-xs text-ink-soft/70">No photos in the gallery yet.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {galleryPhotos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  disabled={pickingAvatar}
                  onClick={() => chooseGalleryAvatar(photo)}
                  className="h-12 w-12 overflow-hidden rounded-full border-2 border-transparent transition-transform hover:scale-105 disabled:opacity-50"
                >
                  <img src={photo.imageDataUrl} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
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

      <hr className="my-3 border-ink/10" />

      <button
        type="button"
        onClick={() => {
          onExportHistory()
          onClose()
        }}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-2 font-body text-sm text-ink-soft transition-colors hover:text-rose"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M4 19h16" />
        </svg>
        Download chat history
      </button>
    </div>
  )
}
