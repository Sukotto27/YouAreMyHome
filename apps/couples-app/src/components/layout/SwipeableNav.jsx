import { useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import NavIcon from './NavIcon'

const ITEMS_PER_PAGE = 5
const DRAG_THRESHOLD = 8

function chunk(items, size) {
  const pages = []
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size))
  return pages
}

// Paginated like separate carousel pages, not a horizontally scrolling
// strip — swipe to switch pages, with dot + chevron indicators so it's
// obvious there's more than one page. A tap still navigates normally (drag
// distance stays under DRAG_THRESHOLD); an actual swipe suppresses the
// click that would otherwise fire on whatever item the finger lands on.
export default function SwipeableNav({ items, unread, onOpenSendLove }) {
  const pages = chunk(items, ITEMS_PER_PAGE)
  const [pageIndex, setPageIndex] = useState(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startRef = useRef(null)
  const wasDraggingRef = useRef(false)
  const containerRef = useRef(null)

  function handlePointerDown(event) {
    startRef.current = { x: event.clientX, width: containerRef.current?.offsetWidth ?? 1 }
  }

  function handlePointerMove(event) {
    if (!startRef.current) return
    const dx = event.clientX - startRef.current.x
    if (Math.abs(dx) > DRAG_THRESHOLD) {
      setDragging(true)
      setDragOffset(dx)
    }
  }

  function handlePointerUp() {
    if (!startRef.current) return
    const { width } = startRef.current
    const threshold = width * 0.2

    if (dragging) {
      wasDraggingRef.current = true
      if (dragOffset < -threshold && pageIndex < pages.length - 1) {
        setPageIndex((p) => p + 1)
      } else if (dragOffset > threshold && pageIndex > 0) {
        setPageIndex((p) => p - 1)
      }
    }

    setDragOffset(0)
    setDragging(false)
    startRef.current = null
  }

  function handleClickCapture(event) {
    if (wasDraggingRef.current) {
      event.preventDefault()
      event.stopPropagation()
      wasDraggingRef.current = false
    }
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-ink/10 bg-paper/95 backdrop-blur sm:static sm:border-t-0 sm:bg-transparent sm:py-2">
      {pages.length > 1 && (
        <div className="flex justify-center gap-1 pt-1.5">
          {pages.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${i === pageIndex ? 'bg-rose' : 'bg-ink/15'}`}
            />
          ))}
        </div>
      )}
      <div
        ref={containerRef}
        className="relative mx-auto w-full max-w-2xl overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClickCapture={handleClickCapture}
        style={{ touchAction: 'pan-y' }}
      >
        <div
          className={`flex ${dragging ? '' : 'transition-transform duration-300 ease-out'}`}
          style={{ transform: `translateX(calc(${-pageIndex * 100}% + ${dragOffset}px))` }}
        >
          {pages.map((pageItems, pageI) => (
            <div key={pageI} className="flex w-full shrink-0">
              {pageItems.map((item) =>
                item.action === 'sendLove' ? (
                  <button
                    key={item.key}
                    type="button"
                    onClick={onOpenSendLove}
                    className="flex flex-1 flex-col items-center gap-0.5 px-2 py-2 font-body text-[11px] text-ink-soft transition-colors hover:text-ink"
                  >
                    <NavIcon name={item.icon} className="h-5 w-5" />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                ) : (
                  <NavLink
                    key={item.key}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `flex flex-1 flex-col items-center gap-0.5 px-2 py-2 font-body text-[11px] transition-colors ${
                        isActive ? 'text-rose' : 'text-ink-soft hover:text-ink'
                      }`
                    }
                  >
                    <span className="relative inline-flex">
                      <NavIcon name={item.icon} className="h-5 w-5" />
                      {item.badgeKey && unread[item.badgeKey] && (
                        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-rose" />
                      )}
                    </span>
                    <span className="whitespace-nowrap">{item.label}</span>
                  </NavLink>
                ),
              )}
            </div>
          ))}
        </div>

        {pageIndex > 0 && (
          <span className="pointer-events-none absolute left-0.5 top-1/2 -translate-y-1/2 text-ink-soft/40">
            <Chevron direction="left" />
          </span>
        )}
        {pageIndex < pages.length - 1 && (
          <span className="pointer-events-none absolute right-0.5 top-1/2 -translate-y-1/2 text-ink-soft/40">
            <Chevron direction="right" />
          </span>
        )}
      </div>
    </nav>
  )
}

function Chevron({ direction }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  )
}
