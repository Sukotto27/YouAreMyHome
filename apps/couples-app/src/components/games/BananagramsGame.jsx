import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useBananagramsMatch } from '../../hooks/useBananagramsMatch'
import { useGameInvite } from '../../hooks/useGameInvite'
import EndGameButton from './EndGameButton'
import GameIntro from './GameIntro'
import { playSound } from '../../lib/sounds'
import {
  DEFAULT_SIZE,
  DUMP_DRAW,
  GAME_SIZES,
  GRID_SIZE,
  analyzeBoard,
  handSize,
} from '../../lib/bananagrams'
import { isValidWord, loadWords } from '../../lib/wordList'

const CELL = 34
const STORAGE_PREFIX = 'you-are-my-home:bananagrams-grid:'

function loadPlacements(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '{}')
  } catch {
    return {}
  }
}

function Tile({ letter, selected, invalid, flip, ghosted, onClick, onPointerDown }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={`flex touch-none select-none items-center justify-center rounded-md border font-body font-bold text-ink shadow-sm transition-transform ${
        ghosted ? 'opacity-30' : ''
      } ${
        selected
          ? 'scale-110 border-rose bg-blush-soft ring-2 ring-rose'
          : invalid
            ? 'border-red-400 bg-red-100 text-red-700'
            : 'border-gold/60 bg-[#f6e7b4]'
      }`}
      style={{
        width: CELL - 4,
        height: CELL - 4,
        fontSize: 16,
        ...(flip ? { animation: 'bananaFlip 0.7s ease-out' } : null),
      }}
    >
      {letter}
    </button>
  )
}

// Bananagrams (see lib/bananagrams.js): both players build their own grid at
// once from a shared tile pool. Words are checked against a dictionary as you
// build (invalid ones turn red). The moment every tile is placed in one
// connected grid of valid words, PEEL happens automatically (everyone draws a
// tile); when the pile can't cover a peel, that same moment is BANANAS and
// you win. Tap a tile to select it, tap an empty square to place it.
export default function BananagramsGame({ onBack }) {
  const { user } = useAuth()
  const { match, effectivePartnerUid, startMatch, act, endGame } = useBananagramsMatch()
  const status = match?.status
  const { sendInvite } = useGameInvite('bananagrams', 'Bananagrams')
  const [sizeChoice, setSizeChoice] = useState(DEFAULT_SIZE)
  const [inviting, setInviting] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')
  const [placements, setPlacements] = useState({}) // tileId -> {x, y}, local to this device
  const [selected, setSelected] = useState(null) // tileId
  const [banner, setBanner] = useState('')
  const [dictionary, setDictionary] = useState(null)
  const finishingRef = useRef(false)
  const [drag, setDrag] = useState(null) // { id, x, y } while a tile is being dragged
  const boardRef = useRef(null)
  const scrollRef = useRef(null)
  const justDraggedRef = useRef(false) // swallows the click that follows a drag
  const latestRef = useRef({})

  const mineLabel = user.displayName === 'Cristina' ? 'Cristina' : 'Scott'
  const partnerLabel = mineLabel === 'Scott' ? 'Cristina' : 'Scott'
  const storageKey = match ? `${STORAGE_PREFIX}${match.hostUid}:${match.startedAt}` : null

  const hand = match?.hands?.[user.uid] || {}
  const poolCount = (match?.pool || '').length
  const partnerCount = match ? handSize(match, effectivePartnerUid) : 0
  const board = useMemo(() => analyzeBoard(placements, hand), [placements, hand])
  const invalidRuns = dictionary ? board.runs.filter((run) => !isValidWord(dictionary, run.word)) : []
  const invalidCells = new Set(invalidRuns.flatMap((run) => run.cells))
  const gridComplete = !!dictionary && board.allPlaced && board.connected && board.runs.length > 0 && invalidRuns.length === 0

  // Auto peel / auto bananas: fires the moment the grid is complete and valid.
  const poolEmpty = poolCount < (match?.players.length || 2)
  useEffect(() => {
    if (!gridComplete || status !== 'playing' || finishingRef.current) return
    finishingRef.current = true
    act({ type: poolEmpty ? 'win' : 'peel' }).finally(() => {
      finishingRef.current = false
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridComplete, status, poolEmpty])

  function flash(text) {
    setBanner(text)
    setTimeout(() => setBanner((current) => (current === text ? '' : current)), 2400)
  }

  useEffect(() => {
    if ((match?.status === 'playing' || match?.status === 'setup') && !dictionary) loadWords().then(setDictionary)
  }, [match?.status, dictionary])

  // Restore this device's layout for the current match, dropping tiles that
  // are no longer in the hand (dumped).
  useEffect(() => {
    if (!storageKey) return
    setPlacements(loadPlacements(storageKey))
    setSelected(null)
  }, [storageKey, match?.status === 'playing'])

  // All layout changes go through here so they're saved as they happen (an
  // effect watching `placements` would clobber the restored layout on mount).
  function updatePlacements(fn) {
    setPlacements((prev) => {
      const next = fn(prev)
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // storage unavailable — layout just won't survive a reload
      }
      return next
    })
  }

  // When Split is called (by either of you) the face-down tiles flip over.
  const [flipping, setFlipping] = useState(false)
  const prevStatusRef = useRef(status)
  useEffect(() => {
    if (prevStatusRef.current === 'setup' && status === 'playing') {
      setFlipping(true)
      flash(match.splitBy === user.uid ? 'Split! 🍌 Go go go!' : `${partnerLabel} called Split! 🍌 Go!`)
      playSound('dice_roll')
      setTimeout(() => setFlipping(false), 900)
    }
    prevStatusRef.current = status
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // Feedback for shared events: a peel (by anyone) or a challenge.
  const peels = match?.peels || 0
  useEffect(() => {
    if (!peels) return
    flash(match.lastPeelUid === user.uid ? 'PEEL! 🍌 Everyone draws a tile' : `${partnerLabel} peeled — you drew a tile 🍌`)
    playSound('dice_roll')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peels])
  useEffect(() => {
    if (status === 'finished') playSound('notification')
  }, [status])

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

  if (!match || status === 'finished' || status === 'ended') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-8 text-center sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="self-start font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
        >
          ← Games
        </button>
        {status === 'ended' && (
          <p className="font-hand text-base text-ink-soft">
            {match.endedBy === user.uid ? 'You' : partnerLabel} ended the game.
          </p>
        )}
        {status === 'finished' && (
          <div className="rounded-3xl border border-rose/30 bg-blush-soft/50 px-6 py-4">
            <p className="font-display text-2xl italic text-ink">
              {match.winnerUid === user.uid ? `${mineLabel} wins — BANANAS! 🍌🎉` : `${partnerLabel} wins — BANANAS! 🍌🎉`}
            </p>
          </div>
        )}
        <h1 className="font-display text-3xl italic text-ink">Bananagrams</h1>
        <GameIntro gameKey="bananagrams" title="Bananagrams" defaultText={"Both players choose 21 tiles from the pile. On Split, both players flip their tiles to reveal the letters. Place the letters on the grid to form connected words. The goal is to be the first to use up all your tiles. The game continues until all tiles are used up. When you use up your tiles, you Peel, and get another tile. You can Dump an unwanted tile and get 3 more in exchange. When the pile is empty, the first to use up all their tiles wins (Banana!)."} />
        <div className="flex gap-2">
          {Object.entries(GAME_SIZES).map(([key, size]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSizeChoice(key)}
              className={`rounded-full border px-4 py-1.5 font-body text-sm font-medium transition-colors ${
                sizeChoice === key ? 'border-rose bg-blush-soft text-rose' : 'border-ink/15 text-ink-soft'
              }`}
            >
              {size.label} · {size.total} tiles
            </button>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => startMatch(sizeChoice)}
            className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            {match ? 'New game' : 'Start game'}
          </button>
          <button
            type="button"
            onClick={handleInvite}
            disabled={inviting}
            className="rounded-full border border-rose/40 px-6 py-2.5 font-body font-medium text-rose transition-colors hover:bg-blush-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {inviting ? 'Inviting…' : '🍌 Invite partner'}
          </button>
        </div>
        {inviteMessage && <p className="font-hand text-sm text-rose">{inviteMessage}</p>}
      </div>
    )
  }

  if (status === 'setup') {
    const count = handSize(match, user.uid)
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-6 overflow-y-auto px-4 py-4 text-center sm:px-6">
        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
          >
            ← Games
          </button>
          <EndGameButton onEnd={endGame} />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <h1 className="font-display text-3xl italic text-ink">Ready?</h1>
          <p className="max-w-sm font-body text-sm text-ink-soft">
            Your {count} tiles are dealt face down. When you're both ready, call <b>Split</b> — you'll each flip your
            tiles over at the same moment and the race begins.
          </p>
          <div className="flex max-w-sm flex-wrap justify-center gap-1.5">
            {Array.from({ length: count }, (_, i) => (
              <div
                key={i}
                className="flex items-center justify-center rounded-md border border-gold/60 bg-gold/50 shadow-sm"
                style={{ width: CELL - 4, height: CELL - 4, fontSize: 14 }}
              >
                🍌
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => act({ type: 'split' })}
            className="rounded-full bg-rose px-10 py-3 font-body text-lg font-semibold text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            Split! 🍌
          </button>
        </div>
      </div>
    )
  }

  const placedIds = new Set(Object.keys(placements).filter((id) => id in hand))
  const rackIds = Object.keys(hand).filter((id) => !placedIds.has(id))
  const cellToTile = new Map()
  for (const id of placedIds) cellToTile.set(`${placements[id].x},${placements[id].y}`, id)

  latestRef.current = { cellToTile, placedIds }

  // Which grid square is under a screen point (null if it's off the board or
  // hidden under the rack panel / scrolled out of view).
  function cellAt(clientX, clientY) {
    const board = boardRef.current?.getBoundingClientRect()
    const view = scrollRef.current?.getBoundingClientRect()
    if (!board || !view) return null
    if (clientX < view.left || clientX >= view.right || clientY < view.top || clientY >= view.bottom) return null
    const x = Math.floor((clientX - board.left) / CELL)
    const y = Math.floor((clientY - board.top) / CELL)
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return null
    return { x, y }
  }

  // Drag a tile (from the rack or the grid) onto a square. A press that
  // doesn't move is left alone so it still works as tap-to-select. Dropping
  // off the board sends a grid tile back to the rack; dropping on a taken
  // square snaps it back to where it was.
  function startDrag(event, id) {
    if (status !== 'playing' || event.button > 0) return
    const startX = event.clientX
    const startY = event.clientY
    let dragging = false
    let pointer = { x: startX, y: startY }
    let raf = 0

    // Near the edge of the board view, keep scrolling so far squares are reachable.
    function autoScroll() {
      const view = scrollRef.current
      if (view) {
        const rect = view.getBoundingClientRect()
        const edge = 44
        const speed = 12
        if (pointer.x < rect.left + edge) view.scrollLeft -= speed
        else if (pointer.x > rect.right - edge) view.scrollLeft += speed
        if (pointer.y < rect.top + edge) view.scrollTop -= speed
        else if (pointer.y > rect.bottom - edge) view.scrollTop += speed
      }
      raf = requestAnimationFrame(autoScroll)
    }

    function onMove(moveEvent) {
      pointer = { x: moveEvent.clientX, y: moveEvent.clientY }
      if (!dragging) {
        if (Math.hypot(pointer.x - startX, pointer.y - startY) < 6) return
        dragging = true
        setSelected(null)
        raf = requestAnimationFrame(autoScroll)
      }
      setDrag({ id, x: pointer.x, y: pointer.y })
    }

    function onUp(upEvent) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      cancelAnimationFrame(raf)
      if (!dragging) return
      setDrag(null)
      justDraggedRef.current = true
      setTimeout(() => {
        justDraggedRef.current = false
      }, 0)

      const cell = upEvent.type === 'pointercancel' ? null : cellAt(upEvent.clientX, upEvent.clientY)
      const { cellToTile: taken, placedIds: placed } = latestRef.current
      if (cell) {
        const occupant = taken.get(`${cell.x},${cell.y}`)
        if (occupant && occupant !== id) return // taken — snap back
        updatePlacements((prev) => ({ ...prev, [id]: cell }))
      } else if (placed.has(id)) {
        updatePlacements((prev) => {
          const { [id]: _removed, ...rest } = prev
          return rest
        })
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const hoverCell = drag ? cellAt(drag.x, drag.y) : null

  function handleCell(x, y) {
    if (status !== 'playing' || justDraggedRef.current) return
    const occupant = cellToTile.get(`${x},${y}`)
    if (occupant) {
      setSelected(selected === occupant ? null : occupant)
      return
    }
    if (selected) {
      updatePlacements((prev) => ({ ...prev, [selected]: { x, y } }))
      setSelected(null)
    }
  }

  function returnSelected() {
    if (!selected) return
    updatePlacements((prev) => {
      const { [selected]: _removed, ...rest } = prev
      return rest
    })
    setSelected(null)
  }

  async function handleDump() {
    if (!selected) return
    const ok = await act({ type: 'dump', tileId: selected })
    if (!ok) flash(`Need at least ${DUMP_DRAW} tiles in the pile to dump.`)
    else {
      updatePlacements((prev) => {
        const { [selected]: _removed, ...rest } = prev
        return rest
      })
      setSelected(null)
      playSound('dice_roll')
    }
  }

  let hint = ''
  if (!dictionary) hint = 'Loading dictionary…'
  else if (!board.allPlaced) hint = `${rackIds.length} tile${rackIds.length === 1 ? '' : 's'} left to place`
  else if (!board.connected) hint = 'All tiles placed — connect them into one grid!'
  else if (invalidRuns.length > 0) hint = "Almost — some words aren't in the dictionary"
  else hint = poolEmpty ? 'BANANAS!' : 'Peel!'

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {drag && (
        <div
          className="pointer-events-none fixed z-50 flex scale-110 items-center justify-center rounded-md border border-rose bg-blush-soft font-body font-bold text-ink shadow-lg"
          style={{ left: drag.x - (CELL - 4) / 2, top: drag.y - (CELL - 4) / 2, width: CELL - 4, height: CELL - 4, fontSize: 16 }}
        >
          {hand[drag.id]}
        </div>
      )}
      <style>{`@keyframes bananaFlip { from { transform: rotateY(90deg) scale(0.6); opacity: 0 } to { transform: rotateY(0) scale(1); opacity: 1 } }`}</style>
      <div className="flex items-center gap-3 px-4 pt-3 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
        >
          ← Games
        </button>
        <div className="flex flex-1 items-center justify-center gap-3 font-body text-xs text-ink-soft sm:text-sm">
          <span>🍌 Pile: {poolCount}</span>
          <span>
            {partnerLabel}: {partnerCount} tiles
          </span>
        </div>
        <EndGameButton onEnd={endGame} />
      </div>
      {banner && <p className="bg-blush-soft/60 px-4 py-1.5 text-center font-hand text-sm text-rose">{banner}</p>}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-2 py-2">
        <div
          ref={boardRef}
          className="relative mx-auto rounded-xl border border-ink/10 bg-white/50"
          style={{
            width: GRID_SIZE * CELL,
            height: GRID_SIZE * CELL,
            backgroundImage:
              'linear-gradient(to right, rgba(54,37,33,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(54,37,33,0.08) 1px, transparent 1px)',
            backgroundSize: `${CELL}px ${CELL}px`,
          }}
        >
          {hoverCell && (
            <div
              className="pointer-events-none absolute rounded-md border-2 border-rose bg-rose/15"
              style={{ left: hoverCell.x * CELL, top: hoverCell.y * CELL, width: CELL, height: CELL }}
            />
          )}
          {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
            const x = i % GRID_SIZE
            const y = Math.floor(i / GRID_SIZE)
            const tileId = cellToTile.get(`${x},${y}`)
            return (
              <div
                key={i}
                onClick={() => handleCell(x, y)}
                className="absolute flex items-center justify-center"
                style={{ left: x * CELL, top: y * CELL, width: CELL, height: CELL }}
              >
                {tileId && (
                  <Tile
                    letter={hand[tileId]}
                    selected={selected === tileId}
                    invalid={invalidCells.has(`${x},${y}`)}
                    ghosted={drag?.id === tileId}
                    onPointerDown={(event) => startDrag(event, tileId)}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="border-t border-ink/10 bg-paper/80 px-3 pb-3 pt-2">
        <p className="mb-1 text-center font-hand text-sm text-ink-soft">{hint}</p>
        {invalidRuns.length > 0 && (
          <p className="mb-1 text-center font-body text-[11px] text-red-600">
            Not words: {[...new Set(invalidRuns.map((run) => run.word))].join(' · ')}
          </p>
        )}
        <div className="mb-2 flex min-h-[34px] flex-wrap justify-center gap-1.5">
          {rackIds.map((id) => (
            <Tile
              key={id}
              flip={flipping}
              letter={hand[id]}
              selected={selected === id}
              ghosted={drag?.id === id}
              onPointerDown={(event) => startDrag(event, id)}
              onClick={() => {
                if (justDraggedRef.current) return
                setSelected(selected === id ? null : id)
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {selected && placedIds.has(selected) && (
            <button
              type="button"
              onClick={returnSelected}
              className="rounded-full border border-ink/15 px-4 py-1.5 font-body text-sm text-ink-soft"
            >
              Back to rack
            </button>
          )}
          <button
            type="button"
            disabled={!selected || status !== 'playing'}
            onClick={handleDump}
            className="rounded-full border border-ink/15 px-4 py-1.5 font-body text-sm text-ink-soft disabled:opacity-40"
          >
            Dump tile (+{DUMP_DRAW - 1})
          </button>
        </div>
      </div>
    </div>
  )
}
