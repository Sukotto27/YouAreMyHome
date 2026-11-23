import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useDoorsMatch } from '../../hooks/useDoorsMatch'
import { firebaseReady } from '../../firebase'
import { partnerNameFor } from '../../lib/names'
import GameIntro from './GameIntro'
import StartPanel from './GameLobby'

const isTouchDevice = () => !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches

// The Doors lobby: play online together (each of you on your own device, as Blue / Pink) or both on this one device.
// A co-op session lives on in the database until someone ends it, so you can leave and come back to it.
export default function DoorsGame({ onBack }) {
  const { user } = useAuth()
  const { match, loaded, partnerUid, startMatch, endMatch } = useDoorsMatch()
  const [local, setLocal] = useState(!firebaseReady) // preview mode has no partner to play with
  const [away, setAway] = useState(false) // stepped out of a co-op game into the lobby
  const partnerName = partnerNameFor(user)
  const role = match?.roles?.[user.uid]
  const online = firebaseReady && match?.status === 'playing' && !!role

  if (local) return <DoorsPlay onBack={() => (firebaseReady ? setLocal(false) : onBack())} coop={null} />
  if (online && !away) {
    const coop = { role, isHost: match.hostUid === user.uid, partnerName, partnerUid, uid: user.uid, matchId: match.createdAt }
    return <DoorsPlay key={match.createdAt} onBack={() => setAway(true)} coop={coop} />
  }

  async function handleStart() {
    setAway(false)
    await startMatch()
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-8 text-center sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="self-start font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
      >
        ← Games
      </button>
      {match?.status === 'ended' && (
        <p className="font-hand text-base text-ink-soft">{match.endedBy === user.uid ? 'You' : partnerName} ended the game.</p>
      )}
      <h1 className="font-display text-3xl italic text-ink">Doors</h1>
      <GameIntro
        gameKey="doors"
        title="Doors"
        defaultText="A two-player co-op platformer: work together to get both of you through the doors. Play online — Scott is Blue, Cristina is Pink — or both on one device."
      />
      {online && away && (
        <div className="flex w-full max-w-xs flex-col gap-3 rounded-3xl border border-rose/30 bg-blush-soft/50 p-4">
          <p className="font-body text-sm text-ink">Your co-op game with {partnerName} is still going.</p>
          <button type="button" onClick={() => setAway(false)} className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper">
            Resume
          </button>
          <button
            type="button"
            onClick={() => {
              setAway(false)
              endMatch()
            }}
            className="rounded-full border border-ink/20 px-6 py-2.5 font-body font-medium text-ink-soft hover:border-rose hover:text-rose"
          >
            End game
          </button>
        </div>
      )}
      {loaded && !(online && away) && <StartPanel gameKey="doors" label="Doors" emoji="🚪" noSolo onStart={handleStart} />}
      <button
        type="button"
        onClick={() => setLocal(true)}
        className="font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
      >
        Play on this device
      </button>
    </div>
  )
}

// Thin React shell around the Doors game. All of the game itself lives in
// src/doors as plain framework-free modules (engine, input, levels, render, …)
// and is loaded lazily, so none of it (nor three.js) is part of the main bundle.
function DoorsPlay({ onBack, coop }) {
  const containerRef = useRef(null)
  const [portrait, setPortrait] = useState(false)
  const [loadError, setLoadError] = useState('')

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
    // A failure here used to leave nothing but a black screen, so it is caught and shown instead.
    let net = null
    Promise.all([import('../../doors/index.js'), coop ? import('../../doors/coopNet.js') : null])
      .then(async ([{ startDoors }, netModule]) => {
        let options = null
        if (coop) {
          net = netModule.createCoopNet({ uid: coop.uid, partnerUid: coop.partnerUid, isHost: coop.isHost })
          // the host picks up where the last published state left off (a game left and rejoined)
          const restore = coop.isHost ? await netModule.fetchState().catch(() => null) : null
          options = { net, role: coop.role, isHost: coop.isHost, partnerName: coop.partnerName, restore }
        }
        if (cancelled) {
          net?.dispose()
          return
        }
        if (containerRef.current) game = startDoors(containerRef.current, options)
      })
      .catch((error) => {
        console.error('[doors] failed to start', error)
        if (!cancelled) setLoadError(String(error?.message || error))
      })
    return () => {
      cancelled = true
      if (game) game.dispose()
      else net?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        {loadError && <LoadError message={loadError} />}
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
      <div ref={containerRef} className="relative mt-2 min-h-0 flex-1 overflow-hidden bg-black">
        {loadError && <LoadError message={loadError} />}
      </div>
    </div>
  )
}

// Shown over the black game area if the game itself could not be loaded or started.
function LoadError({ message }) {
  return (
    <div className="absolute inset-0 z-[115] flex flex-col items-center justify-center gap-3 bg-black px-8 text-center text-white">
      <p className="font-hand text-2xl">Doors couldn&apos;t start</p>
      <p className="max-w-sm font-body text-xs text-white/70">
        Try again — if it keeps happening, close other tabs or apps and reopen the app, or update your browser.
      </p>
      <p className="max-w-sm break-words font-body text-[10px] text-white/40">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full bg-rose px-5 py-2 font-body text-sm font-medium text-paper"
      >
        Reload
      </button>
    </div>
  )
}
