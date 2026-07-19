import { useEffect, useRef } from 'react'

const TAP_WINDOW_MS = 500
const HOLD_CONFIRM_MS = 180
const MOVE_THRESHOLD = 12

// Global "triple-tap, then hold" detector — deliberately requires the third
// (or later) tap to be HELD rather than just counting three quick taps, so
// ordinary rapid-tapping elsewhere in the app (double-tapping a button,
// etc.) can never trigger it by accident: a plain tap always releases well
// before HOLD_CONFIRM_MS. Listens on the whole document in the capture
// phase so it sees every tap regardless of what's underneath, and suppresses
// the resulting click on whatever element the hold happened to land on.
export function useThumbkissGesture(startPress, endPress) {
  const recentTapsRef = useRef([])
  const activeRef = useRef(null)
  const suppressClickRef = useRef(false)

  useEffect(() => {
    function pruneTaps(now) {
      recentTapsRef.current = recentTapsRef.current.filter((t) => now - t < TAP_WINDOW_MS)
    }

    function handlePointerDown(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (activeRef.current) return

      const now = Date.now()
      pruneTaps(now)

      const info = {
        startX: event.clientX,
        startY: event.clientY,
        pointerId: event.pointerId,
        confirmed: false,
        cancelled: false,
        timer: null,
      }
      activeRef.current = info

      if (recentTapsRef.current.length >= 2) {
        info.timer = setTimeout(() => {
          if (activeRef.current === info && !info.cancelled) {
            info.confirmed = true
            recentTapsRef.current = []
            startPress()
          }
        }, HOLD_CONFIRM_MS)
      }
    }

    function handlePointerMove(event) {
      const info = activeRef.current
      if (!info || info.pointerId !== event.pointerId || info.cancelled) return
      const dx = event.clientX - info.startX
      const dy = event.clientY - info.startY
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD) {
        info.cancelled = true
        if (info.timer) clearTimeout(info.timer)
        if (info.confirmed) endPress()
      }
    }

    function handlePointerUp(event) {
      const info = activeRef.current
      if (!info || info.pointerId !== event.pointerId) return
      if (info.timer) clearTimeout(info.timer)

      if (info.confirmed) {
        endPress()
        suppressClickRef.current = true
      } else if (!info.cancelled) {
        recentTapsRef.current.push(Date.now())
      }
      activeRef.current = null
    }

    function handleClickCapture(event) {
      if (suppressClickRef.current) {
        event.preventDefault()
        event.stopPropagation()
        suppressClickRef.current = false
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('pointermove', handlePointerMove, true)
    document.addEventListener('pointerup', handlePointerUp, true)
    document.addEventListener('pointercancel', handlePointerUp, true)
    document.addEventListener('click', handleClickCapture, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('pointermove', handlePointerMove, true)
      document.removeEventListener('pointerup', handlePointerUp, true)
      document.removeEventListener('pointercancel', handlePointerUp, true)
      document.removeEventListener('click', handleClickCapture, true)
    }
  }, [startPress, endPress])
}
