import { useEffect, useRef, useState } from 'react'
import { onValue, ref, remove, set } from 'firebase/database'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { rtdb, db, firebaseReady } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { readDemoList, writeDemoList } from '../../lib/demoStore'
import { useGameInvite } from '../../hooks/useGameInvite'
import Toolbar from '../canvas/Toolbar'
import BottomActions from '../canvas/BottomActions'
import DrawingCanvas from '../canvas/DrawingCanvas'
import { DEFAULT_COLOR, DEFAULT_BRUSH_FRACTION, DEFAULT_CANVAS_BACKGROUND } from '../canvas/palette'
import ScrapbookGallery from './ScrapbookGallery'

const TABS = [
  { id: 'canvas', label: 'Canvas' },
  { id: 'scrapbook', label: 'Scrapbook' },
]

export default function DrawGame({ onBack }) {
  const { user } = useAuth()
  const [tab, setTab] = useState('canvas')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [brushFraction, setBrushFraction] = useState(DEFAULT_BRUSH_FRACTION)
  const [background, setBackground] = useState(DEFAULT_CANVAS_BACKGROUND)
  const [tool, setTool] = useState('pen')
  const [canUndo, setCanUndo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')
  const canvasRef = useRef(null)
  const { sendInvite } = useGameInvite('draw', 'Draw')

  useEffect(() => {
    if (!firebaseReady) return
    return onValue(ref(rtdb, 'canvasMeta/backgroundColor'), (snap) => {
      setBackground(snap.val() || DEFAULT_CANVAS_BACKGROUND)
    })
  }, [])

  function handleBackgroundChange(value) {
    setBackground(value)
    if (firebaseReady) set(ref(rtdb, 'canvasMeta/backgroundColor'), value)
  }

  function handleClear() {
    if (firebaseReady) {
      remove(ref(rtdb, 'strokes'))
    } else {
      canvasRef.current?.clearLocal()
    }
  }

  function handleUndo() {
    canvasRef.current?.undoLast()
  }

  async function handleInvite() {
    setInviting(true)
    try {
      await sendInvite()
      setInviteMessage("Invite sent — they'll get a notification!")
      setTimeout(() => setInviteMessage(''), 2500)
    } finally {
      setInviting(false)
    }
  }

  async function handleSave() {
    const dataUrl = canvasRef.current?.exportPNG()
    if (!dataUrl) return
    setSaving(true)
    try {
      if (!firebaseReady) {
        const existing = readDemoList('scrapbook')
        writeDemoList('scrapbook', [
          { id: crypto.randomUUID(), imageDataUrl: dataUrl, savedByName: user.displayName, createdAt: new Date().toISOString() },
          ...existing,
        ])
      } else {
        await addDoc(collection(db, 'scrapbook'), {
          imageDataUrl: dataUrl,
          savedBy: user.uid,
          savedByName: user.displayName || user.email,
          createdAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
          lastActivityByUid: user.uid,
          commentCount: 0,
        })
      }
      setSavedMessage('Saved to the scrapbook!')
      setTimeout(() => setSavedMessage(''), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-3 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
        >
          ← Games
        </button>
        <div className="flex flex-1 gap-1 rounded-full bg-ink/5 p-1">
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
      </div>

      {tab === 'scrapbook' ? (
        <ScrapbookGallery />
      ) : (
        <>
          <Toolbar
            color={color}
            onColorChange={setColor}
            brushFraction={brushFraction}
            onBrushFractionChange={setBrushFraction}
            background={background}
            onBackgroundChange={handleBackgroundChange}
            tool={tool}
            onToolChange={setTool}
          />
          <div className="flex justify-center px-4 pt-2 sm:px-6">
            <button
              type="button"
              onClick={handleInvite}
              disabled={inviting}
              className="rounded-full border border-rose/40 px-4 py-1.5 font-body text-xs font-medium text-rose transition-colors hover:bg-blush-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {inviting ? 'Inviting…' : '🎨 Invite to draw'}
            </button>
          </div>
          {(savedMessage || inviteMessage) && (
            <p className="bg-blush-soft/60 px-4 py-1.5 text-center font-hand text-sm text-rose">
              {savedMessage || inviteMessage}
            </p>
          )}
          <div className="relative min-h-0 flex-1">
            <DrawingCanvas
              ref={canvasRef}
              color={color}
              brushFraction={brushFraction}
              background={background}
              tool={tool}
              onCanUndoChange={setCanUndo}
            />
          </div>
          <BottomActions onSave={handleSave} saving={saving} onClear={handleClear} onUndo={handleUndo} canUndo={canUndo} />
        </>
      )}
    </div>
  )
}
