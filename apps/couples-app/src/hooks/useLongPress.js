import { useRef } from 'react'

const LONG_PRESS_MS = 500
const MOVE_THRESHOLD = 10

// Fires onTrigger after a touch/mouse hold, or immediately on right-click
// (suppressing the native context menu). Cancels itself if the pointer moves
// too far or lifts before the hold completes, so it doesn't hijack scrolling.
export function useLongPress(onTrigger) {
  const timerRef = useRef(null)
  const startRef = useRef(null)

  function clear() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    startRef.current = { x: event.clientX, y: event.clientY }
    timerRef.current = setTimeout(() => {
      onTrigger(event)
      clear()
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(event) {
    if (!startRef.current) return
    const dx = event.clientX - startRef.current.x
    const dy = event.clientY - startRef.current.y
    if (Math.hypot(dx, dy) > MOVE_THRESHOLD) clear()
  }

  function handleContextMenu(event) {
    event.preventDefault()
    clear()
    onTrigger(event)
  }

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: clear,
    onPointerLeave: clear,
    onContextMenu: handleContextMenu,
  }
}
