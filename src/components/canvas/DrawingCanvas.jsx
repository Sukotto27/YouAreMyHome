import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { ref, push, set, onChildAdded, onChildRemoved, serverTimestamp } from 'firebase/database'
import { rtdb, firebaseReady } from '../../firebase'
import { useAuth } from '../../context/AuthContext'

const MIN_DISTANCE_FRACTION = 0.003

const DrawingCanvas = forwardRef(function DrawingCanvas({ color, brushFraction }, ref_) {
  const { user } = useAuth()
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const rectSizeRef = useRef({ width: 0, height: 0 })
  const strokesRef = useRef(new Map())
  const activeStrokeRef = useRef(null)
  const colorRef = useRef(color)
  const brushFractionRef = useRef(brushFraction)
  const localIdRef = useRef(0)

  useEffect(() => {
    colorRef.current = color
  }, [color])

  useEffect(() => {
    brushFractionRef.current = brushFraction
  }, [brushFraction])

  function pointToPixel(point) {
    return {
      x: point.x * rectSizeRef.current.width,
      y: point.y * rectSizeRef.current.height,
    }
  }

  function lineWidthFor(meta) {
    return Math.max(1, meta.size * rectSizeRef.current.width)
  }

  function drawSegment(meta, from, to) {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.strokeStyle = meta.color
    ctx.fillStyle = meta.color
    ctx.lineWidth = lineWidthFor(meta)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (!from) {
      ctx.beginPath()
      ctx.arc(to.x, to.y, lineWidthFor(meta) / 2, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  function fullRedraw() {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.clearRect(0, 0, rectSizeRef.current.width, rectSizeRef.current.height)
    for (const stroke of strokesRef.current.values()) {
      let prevPixel = null
      for (const point of stroke.points) {
        const pixel = pointToPixel(point)
        drawSegment(stroke.meta, prevPixel, pixel)
        prevPixel = pixel
      }
    }
  }

  useImperativeHandle(ref_, () => ({
    clearLocal() {
      strokesRef.current.clear()
      fullRedraw()
    },
    exportPNG() {
      const canvas = canvasRef.current
      if (!canvas || canvas.width === 0) return null
      // Flatten onto a paper-colored background so saved drawings don't
      // export with a transparent hole where the page background showed through.
      const flattened = document.createElement('canvas')
      flattened.width = canvas.width
      flattened.height = canvas.height
      const flatCtx = flattened.getContext('2d')
      flatCtx.fillStyle = '#fbf2e9'
      flatCtx.fillRect(0, 0, flattened.width, flattened.height)
      flatCtx.drawImage(canvas, 0, 0)
      return flattened.toDataURL('image/png')
    },
  }))

  // Fit the canvas to its container, accounting for device pixel ratio, and
  // redraw existing strokes (they're stored as 0-1 fractions so this rescales
  // cleanly to whatever size the canvas ends up).
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    const ctx = canvas.getContext('2d')
    ctxRef.current = ctx

    function resize() {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      rectSizeRef.current = { width: rect.width, height: rect.height }
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      fullRedraw()
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Subscribe to live strokes from Realtime Database.
  useEffect(() => {
    if (!firebaseReady) return

    const strokesListRef = ref(rtdb, 'strokes')
    const pointDetachers = new Map()

    const detachAdded = onChildAdded(strokesListRef, (snap) => {
      const strokeId = snap.key
      const meta = snap.val()?.meta
      if (!meta) return
      if (!strokesRef.current.has(strokeId)) {
        strokesRef.current.set(strokeId, { meta, points: [] })
      }

      const pointsListRef = ref(rtdb, `strokes/${strokeId}/points`)
      const detachPoint = onChildAdded(pointsListRef, (pointSnap) => {
        const point = pointSnap.val()
        const stroke = strokesRef.current.get(strokeId)
        if (!stroke || !point) return
        const prevPixel =
          stroke.points.length > 0 ? pointToPixel(stroke.points[stroke.points.length - 1]) : null
        drawSegment(stroke.meta, prevPixel, pointToPixel(point))
        stroke.points.push(point)
      })
      pointDetachers.set(strokeId, detachPoint)
    })

    const detachRemoved = onChildRemoved(strokesListRef, (snap) => {
      const strokeId = snap.key
      pointDetachers.get(strokeId)?.()
      pointDetachers.delete(strokeId)
      strokesRef.current.delete(strokeId)
      fullRedraw()
    })

    return () => {
      detachAdded()
      detachRemoved()
      pointDetachers.forEach((detach) => detach())
    }
  }, [])

  function toNormalizedPoint(event) {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  function recordPoint(strokeId, meta, point) {
    const stroke = strokesRef.current.get(strokeId)
    if (!stroke) return
    const prevPixel = stroke.points.length > 0 ? pointToPixel(stroke.points[stroke.points.length - 1]) : null
    drawSegment(meta, prevPixel, pointToPixel(point))
    stroke.points.push(point)
    if (firebaseReady) push(ref(rtdb, `strokes/${strokeId}/points`), point)
  }

  function handlePointerDown(event) {
    event.preventDefault()
    canvasRef.current.setPointerCapture(event.pointerId)

    localIdRef.current += 1
    const strokeId = firebaseReady ? push(ref(rtdb, 'strokes')).key : `local-${localIdRef.current}`
    const meta = { uid: user.uid, color: colorRef.current, size: brushFractionRef.current }
    if (firebaseReady) {
      set(ref(rtdb, `strokes/${strokeId}/meta`), { ...meta, createdAt: serverTimestamp() })
    }
    strokesRef.current.set(strokeId, { meta, points: [] })

    activeStrokeRef.current = { id: strokeId, meta, lastPoint: null }
    const point = toNormalizedPoint(event)
    activeStrokeRef.current.lastPoint = point
    recordPoint(strokeId, meta, point)
  }

  function handlePointerMove(event) {
    const active = activeStrokeRef.current
    if (!active) return
    const point = toNormalizedPoint(event)
    const last = active.lastPoint
    const distance = last ? Math.hypot(point.x - last.x, point.y - last.y) : Infinity
    if (distance < MIN_DISTANCE_FRACTION) return
    active.lastPoint = point
    recordPoint(active.id, active.meta, point)
  }

  function endStroke(event) {
    if (!activeStrokeRef.current) return
    canvasRef.current.releasePointerCapture(event.pointerId)
    activeStrokeRef.current = null
  }

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden rounded-3xl bg-white/50">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        className="touch-none"
      />
    </div>
  )
})

export default DrawingCanvas
