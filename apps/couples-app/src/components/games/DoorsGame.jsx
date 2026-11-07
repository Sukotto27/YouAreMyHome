import { useEffect, useRef } from 'react'

// Thin React shell around the Doors game. All of the game itself lives in
// src/doors as plain framework-free modules (engine, input, levels, render, …)
// and is loaded lazily, so none of it (nor three.js) is part of the main bundle.
export default function DoorsGame({ onBack }) {
  const containerRef = useRef(null)

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
          Blue: <b>WASD</b> <b>E</b> <b>Q</b>draw <b>F</b>teleport <b>G</b>change <b>X</b>echo <b>C</b>rope · Pink: <b>arrows</b> <b>/</b> <b>.</b>draw <b>,</b>teleport <b>M</b>change <b>;</b>echo <b>&apos;</b>rope · <b>mouse</b> draws · <b>Tab</b> solo/switch · <b>R</b> reset · <b>1–9, 0</b> rooms
        </p>
        <span className="rounded-full bg-gold/20 px-2.5 py-0.5 font-body text-[11px] font-semibold text-ink-soft" title="Doors is still being built and tested, so expect rough edges">
          🚧 In testing
        </span>
      </div>
      <div ref={containerRef} className="relative mt-2 min-h-0 flex-1 overflow-hidden bg-black" />
    </div>
  )
}
