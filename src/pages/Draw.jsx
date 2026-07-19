import { useRef, useState } from 'react'
import { ref, remove } from 'firebase/database'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { rtdb, db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import Toolbar from '../components/canvas/Toolbar'
import DrawingCanvas from '../components/canvas/DrawingCanvas'
import { DEFAULT_COLOR, DEFAULT_BRUSH_FRACTION } from '../components/canvas/palette'

export default function Draw() {
  const { user } = useAuth()
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [brushFraction, setBrushFraction] = useState(DEFAULT_BRUSH_FRACTION)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')
  const canvasRef = useRef(null)

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
        onClear={handleClear}
        onSave={handleSave}
        saving={saving}
      />
      {savedMessage && (
        <p className="bg-blush-soft/60 px-4 py-1.5 text-center font-hand text-sm text-rose">
          {savedMessage}
        </p>
      )}
      <div className="min-h-0 flex-1 p-1.5 sm:p-3">
        <DrawingCanvas ref={canvasRef} color={color} brushFraction={brushFraction} />
      </div>
    </div>
  )
}
