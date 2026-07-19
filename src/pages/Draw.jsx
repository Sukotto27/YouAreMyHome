import { useEffect, useRef, useState } from 'react'
import { onValue, ref, remove, set } from 'firebase/database'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { rtdb, db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import Toolbar from '../components/canvas/Toolbar'
import BottomActions from '../components/canvas/BottomActions'
import DrawingCanvas from '../components/canvas/DrawingCanvas'
import { DEFAULT_COLOR, DEFAULT_BRUSH_FRACTION, DEFAULT_CANVAS_BACKGROUND } from '../components/canvas/palette'

export default function Draw() {
  const { user } = useAuth()
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [brushFraction, setBrushFraction] = useState(DEFAULT_BRUSH_FRACTION)
  const [background, setBackground] = useState(DEFAULT_CANVAS_BACKGROUND)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')
  const canvasRef = useRef(null)

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
      <Toolbar
        color={color}
        onColorChange={setColor}
        brushFraction={brushFraction}
        onBrushFractionChange={setBrushFraction}
        background={background}
        onBackgroundChange={handleBackgroundChange}
      />
      {savedMessage && (
        <p className="bg-blush-soft/60 px-4 py-1.5 text-center font-hand text-sm text-rose">
          {savedMessage}
        </p>
      )}
      <div className="min-h-0 flex-1">
        <DrawingCanvas
          ref={canvasRef}
          color={color}
          brushFraction={brushFraction}
          background={background}
        />
      </div>
      <BottomActions onSave={handleSave} saving={saving} onClear={handleClear} />
    </div>
  )
}
