import { useEffect, useRef, useState } from 'react'

const isTouchDevice = () => !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches

// Thin React shell around the Doors game. All of the game itself lives in
// src/doors as plain framework-free modules (engine, input, levels, render, …)
// and is loaded lazily, so none of it (nor three.js) is part of the main bundle.
export default function DoorsGame({ onBack }) {
  const containerRef = useRef(null)
  const [portrait, setPortrait] = useState(false)

  // On a phone the game is landscape-only: go fullscreen and lock the orientation (Android / Chrome allow that once
  // fullscreen). Where the browser will not lock it (iPhone), a "turn your phone" cover shows while it is held upright.
  useEffect(() => {
    if (!isTouchDevice()) return undefined
    const root = document.documentElement
    const lock = async () => {
      try {
        if (!document.fullscreenElement && root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' })
      } catch {
        /* fullscreen needs a tap; the cover below still covers it */
      }
      try {
        await screen.orientation?.lock?.('landscape')
      } catch {
        /* not supported here (iPhone) or not allowed */
      }
    }
    lock()
    const check = () => setPortrait(window.innerHeight > window.innerWidth)
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    // a first tap retries (some browsers only allow fullscreen from a tap that happens after the page is up)
    const retry = () => {
      lock()
      window.removeEventListener('pointerdown', retry)
    }
    window.addEventListener('pointerdown', retry)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
      window.removeEventListener('pointerdown', retry)
      try {
        screen.orientation?.unlock?.()
      } catch {
        /* ignore */
      }
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let game = null
    import('../../doors/index.js').then(({ startDoors }) => {
      if (!cancelled && containerRef.current) game = startDoors(containerRef.current)
    })
    return () => {
      cancelled = true
      game?.dispose()
    }
  }, [])

  const touch = isTouchDevice()
  // On a phone the game takes over the whole screen (like Our Little Paradise): no app header or tab bar, just the game
  // and a small back button. On a computer it stays inside the app.
  if (touch) {
    return (
      <div className="fixed inset-0 z-[100] bg-black" style={{ height: '100dvh' }}>
        <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-black" />
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to games"
          className="absolute right-2 top-2 z-[120] flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-lg text-white"
          style={{ top: 'max(0.5rem, env(safe-area-inset-top))', right: 'max(0.5rem, env(safe-area-inset-right))' }}
        >
          ✕
        </button>
        {portrait && (
          <div className="absolute inset-0 z-[110] flex flex-col items-center justify-center gap-4 bg-ink px-8 text-center text-paper">
            <div className="text-6xl" style={{ transform: 'rotate(90deg)' }} aria-hidden>
              📱
            </div>
            <p className="font-hand text-2xl">Turn your phone sideways to play</p>
          </div>
        )}
      </div>
    )
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
        <p className="flex-1 text-center font-body text-xs text-ink-soft [@media(hover:none)_and_(pointer:coarse)]:hidden">
          Blue: <b>WASD</b> <b>E</b> <b>Q</b>draw <b>F</b>teleport <b>G</b>change <b>X</b>echo <b>C</b>rope · Pink: <b>arrows</b> <b>/</b> <b>.</b>draw <b>,</b>teleport <b>M</b>change <b>;</b>echo <b>&apos;</b>rope · <b>mouse</b> draws · <b>Tab</b> solo/switch · <b>R</b> reset
        </p>
        <span className="rounded-full bg-gold/20 px-2.5 py-0.5 font-body text-[11px] font-semibold text-ink-soft" title="Doors is still being built and tested, so expect rough edges">
          🚧 In testing
        </span>
      </div>
      <div ref={containerRef} className="relative mt-2 min-h-0 flex-1 overflow-hidden bg-black" />
    </div>
  )
}
