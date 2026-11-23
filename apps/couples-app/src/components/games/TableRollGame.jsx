import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useWinCheer } from '../../hooks/useWinCheer'
import { useTableRollMatch, SOLO_KEY } from '../../hooks/useTableRollMatch'
import EndGameButton from './EndGameButton'
import GameIntro from './GameIntro'
import StartPanel from './GameLobby'
import { playSound } from '../../lib/sounds'
import { firebaseReady } from '../../firebase'
import { COMPUTER_LABEL, soloInProgress } from '../../lib/solo'
import { myNameFor } from '../../lib/names'
import {
  BALLS_EACH,
  BALL_R,
  DRAG_TO_SPEED,
  FIELD_H,
  FIELD_W,
  LEDGE,
  MAX_SPEED,
  MIN_DRAG,
  RAIL,
  SHOT_TIMEOUT_S,
  aliveCount,
  botShot,
  canPlace,
  clampShooterX,
  clampToZone,
  createSim,
  finalizeSim,
  randomSetup,
  setupZone,
  shooterY,
  simAtRest,
  stepSim,
} from '../../lib/tableRoll'

const SIDE_COLORS = ['#2f9e94', '#e27d7a'] // side 0 (host, bottom) / side 1
const WORLD_W = FIELD_W + RAIL * 2
const WORLD_H = FIELD_H + LEDGE * 2
const SUBSTEP = 1 / 240
const PUBLISH_MS = 40
const HIT_MAX_VOLUME = 0.5 // on top of the clip's own level
const HIT_LOUD_SPEED = 2.2 // closing speed at which a strike is as loud as it gets

// Table Roll: a long narrow table with a ledge past each end. Each of you sets
// up your balls in your end however you like, then you take turns rolling one
// ball at the other end — tap it and drag the way you want it to go (further =
// harder), banking off the side rails if you like. Balls that go off either
// end land on the ledge and are out. See lib/tableRoll.js for the physics and
// useTableRollMatch for how the shots are shared.
export default function TableRollGame({ onBack }) {
  const { user } = useAuth()
  const [solo, setSolo] = useState(() =>
    soloInProgress(SOLO_KEY, (m) => m?.status === 'setup' || m?.status === 'playing'),
  )
  const { match, effectivePartnerUid, botUid, streamRef, startMatch, submitSetup, patch, publish, endGame } =
    useTableRollMatch(solo)
  useWinCheer(match?.status === 'finished')

  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const layoutRef = useRef({ w: 0, h: 0, scale: 1, ox: 0, oy: 0 })
  const matchRef = useRef(match)
  matchRef.current = match
  const simRef = useRef(null) // { sim, side, seq, lastPub } while a shot this device is running rolls
  const displayRef = useRef(null) // smoothed positions of a shot being watched
  const dragRef = useRef(null) // setup: { index, moved }  |  aim: { startX, startY, curX, curY }
  const shooterXRef = useRef(0.5)
  const [placed, setPlaced] = useState([])
  const placedRef = useRef(placed)
  placedRef.current = placed
  const [, forceRender] = useState(0)

  const mineLabel = myNameFor(user)
  const partnerLabel = solo ? COMPUTER_LABEL : mineLabel === 'Scott' ? 'Cristina' : 'Scott'
  const mySide = match && match.rightUid === user.uid ? 1 : 0
  const flip = mySide === 1 // the guest's screen is the table turned round
  const myBalls = match?.balls?.[user.uid]
  const theirBalls = match?.balls?.[effectivePartnerUid]
  const status = match?.status
  const myTurn = status === 'playing' && match.turnUid === user.uid && !match.shooting
  const iAmReady = !!match?.ready?.[user.uid]
  const flipRef = useRef(flip)
  flipRef.current = flip

  // A fresh match starts with a clean setup.
  useEffect(() => {
    setPlaced([])
    shooterXRef.current = 0.5
    simRef.current = null
    displayRef.current = null
  }, [match?.createdAt])

  // ---- canvas sizing ----
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')
    ctxRef.current = ctx
    function resize() {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const scale = Math.min(rect.width / WORLD_W, rect.height / WORLD_H)
      layoutRef.current = {
        w: rect.width,
        h: rect.height,
        scale,
        ox: (rect.width - WORLD_W * scale) / 2,
        oy: (rect.height - WORLD_H * scale) / 2,
      }
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [status])

  // host-frame table point <-> screen pixel
  function toScreen(p) {
    const { scale, ox, oy } = layoutRef.current
    const q = flipRef.current ? { x: FIELD_W - p.x, y: FIELD_H - p.y } : p
    return { x: ox + (q.x + RAIL) * scale, y: oy + (q.y + LEDGE) * scale }
  }
  function toTable(px, py) {
    const { scale, ox, oy } = layoutRef.current
    const x = (px - ox) / scale - RAIL
    const y = (py - oy) / scale - LEDGE
    return flipRef.current ? { x: FIELD_W - x, y: FIELD_H - y } : { x, y }
  }

  // ---- shots ----
  function uidOfSide(side) {
    const m = matchRef.current
    return side === 0 ? m.leftUid : m.rightUid
  }

  function fire(side, shooter) {
    const m = matchRef.current
    if (!m || simRef.current) return
    const lists = [m.balls?.[m.leftUid] || [], m.balls?.[m.rightUid] || []]
    const seq = (m.shotSeq || 0) + 1
    simRef.current = { sim: createSim(lists, shooter), side, seq, lastPub: 0 }
    patch({ shooting: true, shotSeq: seq })
    playSound('ball_roll')
  }

  function finishShot() {
    const { sim, side } = simRef.current
    simRef.current = null
    const m = matchRef.current
    const lists = finalizeSim(sim)
    const before = [aliveCount(m.balls?.[m.leftUid]), aliveCount(m.balls?.[m.rightUid])]
    const after = [aliveCount(lists[0]), aliveCount(lists[1])]
    const other = 1 - side
    const update = {
      balls: { [m.leftUid]: lists[0], [m.rightUid]: lists[1] },
      shooting: false,
      lastShot: { by: uidOfSide(side), theirs: before[other] - after[other], own: before[side] - after[side], n: m.shotSeq || 0 },
    }
    if (after[other] === 0) patch({ ...update, status: 'finished', winnerUid: uidOfSide(side) })
    else if (after[side] === 0) patch({ ...update, status: 'finished', winnerUid: uidOfSide(other) })
    else patch({ ...update, turnUid: uidOfSide(other) })
  }

  // The computer's turn (solo / preview): it rolls on this device.
  useEffect(() => {
    // Only solo and preview mode have a computer; with a real partner their device rolls for them.
    if (!(solo || !firebaseReady)) return
    if (!match || match.status !== 'playing' || match.shooting || match.turnUid !== botUid) return
    const timer = setTimeout(() => {
      const m = matchRef.current
      if (!m || m.status !== 'playing' || m.shooting || m.turnUid !== botUid) return
      const lists = [m.balls?.[m.leftUid] || [], m.balls?.[m.rightUid] || []]
      fire(1, botShot(lists, 1))
    }, 1300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solo, match?.status, match?.turnUid, match?.shooting, match?.shotSeq])

  // ---- drawing + simulation loop ----
  useEffect(() => {
    if (!match || (match.status !== 'setup' && match.status !== 'playing')) return
    let rafId
    let last = performance.now()
    let hitSoundAt = 0

    function currentBalls() {
      const m = matchRef.current
      const run = simRef.current
      if (run) {
        const lists = [[], []]
        let shooter = null
        for (const b of run.sim.bodies) {
          if (b.side < 0) shooter = { x: b.x, y: b.y }
          else lists[b.side][b.idx] = { x: b.x, y: b.y, out: b.out }
        }
        return { lists, shooter }
      }
      const base = [m.balls?.[m.leftUid] || [], m.balls?.[m.rightUid] || []]
      const stream = streamRef.current
      if (m.shooting && stream && stream.seq === m.shotSeq && stream.p) {
        // watching the other device's shot: ease toward each streamed position
        const flat = stream.p
        const targets = []
        base.forEach((list, side) => list.forEach((b, idx) => targets.push({ side, idx, out: b.out })))
        const prev = displayRef.current
        const next = targets.map((t, i) => {
          const tx = flat[i * 2]
          const ty = flat[i * 2 + 1]
          const p = prev?.pts?.[i]
          return p ? { x: p.x + (tx - p.x) * 0.5, y: p.y + (ty - p.y) * 0.5 } : { x: tx, y: ty }
        })
        const s = stream.s
        const ps = prev?.shooter
        const shooter = s ? (ps ? { x: ps.x + (s[0] - ps.x) * 0.5, y: ps.y + (s[1] - ps.y) * 0.5 } : { x: s[0], y: s[1] }) : null
        displayRef.current = { pts: next, shooter }
        const lists = [[], []]
        targets.forEach((t, i) => {
          lists[t.side][t.idx] = { x: next[i].x, y: next[i].y, out: next[i].y < 0 || next[i].y > FIELD_H }
        })
        return { lists, shooter }
      }
      displayRef.current = null
      return { lists: base, shooter: null }
    }

    function tick(time) {
      const dt = Math.min(1 / 20, (time - last) / 1000)
      last = time
      const run = simRef.current
      if (run) {
        let events = { hits: 0, walls: 0, outs: 0, hitSpeed: 0 }
        for (let t = 0; t < dt; t += SUBSTEP) {
          const e = stepSim(run.sim, SUBSTEP)
          events = { hits: events.hits + e.hits, walls: events.walls + e.walls, outs: events.outs + e.outs, hitSpeed: Math.max(events.hitSpeed, e.hitSpeed) }
        }
        if (events.hits && time - hitSoundAt > 90) {
          hitSoundAt = time
          // the harder the strike, the louder the click (never above HIT_MAX_VOLUME)
          playSound('ball_hit', HIT_MAX_VOLUME * Math.min(1, 0.1 + (0.9 * events.hitSpeed) / HIT_LOUD_SPEED))
        }
        if (events.outs) playSound('ball_drop')
        if (time - run.lastPub > PUBLISH_MS) {
          run.lastPub = time
          const flat = []
          let shooter = null
          const ordered = [...run.sim.bodies].filter((b) => b.side >= 0).sort((a, b) => a.side - b.side || a.idx - b.idx)
          for (const b of ordered) flat.push(Math.round(b.x * 1000) / 1000, Math.round(b.y * 1000) / 1000)
          const sb = run.sim.bodies.find((b) => b.side < 0)
          if (sb && !sb.out) shooter = [Math.round(sb.x * 1000) / 1000, Math.round(sb.y * 1000) / 1000]
          publish(run.seq, flat, shooter)
        }
        if (simAtRest(run.sim) || run.sim.time > SHOT_TIMEOUT_S) finishShot()
      }
      draw(currentBalls())
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status, match?.createdAt, flip])

  function rectPath(ctx, x0, y0, x1, y1) {
    const a = toScreen({ x: x0, y: y0 })
    const b = toScreen({ x: x1, y: y1 })
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
  }

  function fillRect(ctx, x0, y0, x1, y1, color) {
    const r = rectPath(ctx, x0, y0, x1, y1)
    ctx.fillStyle = color
    ctx.fillRect(r.x, r.y, r.w, r.h)
  }

  function drawBall(ctx, p, color, { out = false, shooter = false } = {}) {
    const { scale } = layoutRef.current
    const c = toScreen(p)
    const r = BALL_R * scale
    ctx.globalAlpha = out ? 0.55 : 1
    ctx.beginPath()
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.lineWidth = shooter ? 2 : 1
    ctx.strokeStyle = shooter ? '#362521' : 'rgba(0,0,0,0.35)'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(c.x - r * 0.3, c.y - r * 0.3, r * 0.3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fill()
    ctx.globalAlpha = 1
  }

  function draw({ lists, shooter }) {
    const ctx = ctxRef.current
    const m = matchRef.current
    if (!ctx || !m) return
    const { w, h } = layoutRef.current
    ctx.clearRect(0, 0, w, h)

    // wood rails + ledges, felt on top
    fillRect(ctx, -RAIL, -LEDGE, FIELD_W + RAIL, FIELD_H + LEDGE, '#6b4a33')
    fillRect(ctx, 0, 0, FIELD_W, FIELD_H, '#2f7d5b')
    fillRect(ctx, -RAIL, -LEDGE, FIELD_W + RAIL, 0, '#4a3324')
    fillRect(ctx, -RAIL, FIELD_H, FIELD_W + RAIL, FIELD_H + LEDGE, '#4a3324')
    // centre line
    const c0 = toScreen({ x: 0, y: FIELD_H / 2 })
    const c1 = toScreen({ x: FIELD_W, y: FIELD_H / 2 })
    ctx.setLineDash([6, 8])
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(c0.x, c0.y)
    ctx.lineTo(c1.x, c1.y)
    ctx.stroke()
    ctx.setLineDash([])

    const setup = m.status === 'setup'
    if (setup) {
      const z = setupZone(mySide)
      const r = rectPath(ctx, z.minX - BALL_R, z.minY - BALL_R, z.maxX + BALL_R, z.maxY + BALL_R)
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.setLineDash([4, 5])
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.setLineDash([])
      const mine = iAmReady ? lists[mySide] : placedRef.current
      mine.forEach((b) => drawBall(ctx, b, SIDE_COLORS[mySide]))
      return
    }

    // every ball on the table (and on the ledges)
    lists.forEach((list, side) => list.forEach((b) => b && drawBall(ctx, b, SIDE_COLORS[side], { out: b.out })))

    // my ball, waiting at my end (no aiming hint: you drag by feel)
    const canAim = m.status === 'playing' && m.turnUid === user.uid && !m.shooting
    if (canAim) {
      drawBall(ctx, { x: shooterXRef.current, y: shooterY(mySide) }, '#ffffff', { shooter: true })
    } else if (shooter) {
      drawBall(ctx, shooter, '#ffffff', { shooter: true })
    } else if (m.status === 'playing' && !m.shooting) {
      // waiting: show the shooter sitting at the roller's end
      const side = m.turnUid === m.leftUid ? 0 : 1
      drawBall(ctx, { x: 0.5, y: shooterY(side) }, '#ffffff', { shooter: true })
    }
  }

  // ---- pointer input ----
  function pointer(event) {
    const rect = canvasRef.current.getBoundingClientRect()
    return toTable(event.clientX - rect.left, event.clientY - rect.top)
  }

  function handlePointerDown(event) {
    const m = matchRef.current
    if (!m) return
    event.preventDefault()
    const p = pointer(event)
    if (m.status === 'setup' && !m.ready?.[user.uid]) {
      canvasRef.current.setPointerCapture(event.pointerId)
      const list = placedRef.current
      const index = list.findIndex((b) => Math.hypot(b.x - p.x, b.y - p.y) < BALL_R * 1.6)
      if (index >= 0) {
        dragRef.current = { index, moved: false, origin: list[index] }
        return
      }
      const z = setupZone(mySide)
      const inside = p.x >= z.minX - 0.02 && p.x <= z.maxX + 0.02 && p.y >= z.minY - 0.02 && p.y <= z.maxY + 0.02
      const spot = clampToZone(p, mySide)
      if (inside && list.length < BALLS_EACH && canPlace(spot, list)) setPlaced([...list, spot])
      return
    }
    if (m.status === 'playing' && m.turnUid === user.uid && !m.shooting) {
      canvasRef.current.setPointerCapture(event.pointerId)
      const sy = shooterY(mySide)
      if (Math.hypot(p.x - shooterXRef.current, p.y - sy) < 0.2) {
        dragRef.current = { startX: p.x, startY: p.y, curX: p.x, curY: p.y }
      } else if (Math.abs(p.y - sy) < 0.2) {
        shooterXRef.current = clampShooterX(p.x) // slide the ball along your end
      }
    }
  }

  function handlePointerMove(event) {
    const drag = dragRef.current
    if (!drag) return
    const p = pointer(event)
    if ('index' in drag) {
      drag.moved = true
      const spot = clampToZone(p, mySide)
      const list = placedRef.current
      if (canPlace(spot, list, drag.index)) setPlaced(list.map((b, i) => (i === drag.index ? spot : b)))
    } else {
      drag.curX = p.x
      drag.curY = p.y
    }
  }

  function handlePointerUp(event) {
    const drag = dragRef.current
    dragRef.current = null
    canvasRef.current?.releasePointerCapture?.(event.pointerId)
    if (!drag) return
    if ('index' in drag) {
      // a tap (no drag) on a placed ball picks it back up
      if (!drag.moved) setPlaced(placedRef.current.filter((_, i) => i !== drag.index))
      return
    }
    const dx = drag.curX - drag.startX
    const dy = drag.curY - drag.startY
    const len = Math.hypot(dx, dy)
    if (len < MIN_DRAG) return
    const speed = Math.min(MAX_SPEED, len * DRAG_TO_SPEED)
    fire(mySide, { x: shooterXRef.current, y: shooterY(mySide), vx: (dx / len) * speed, vy: (dy / len) * speed })
  }

  async function handleReady() {
    if (placed.length !== BALLS_EACH) return
    await submitSetup(placed.map((b) => ({ x: Math.round(b.x * 10000) / 10000, y: Math.round(b.y * 10000) / 10000, out: false })))
    forceRender((n) => n + 1)
  }

  // ---- lobby / result ----
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
              {match.winnerUid === user.uid ? `${mineLabel} wins! 🎉` : `${partnerLabel} wins! 🎉`}
            </p>
            <p className="mt-1 font-body text-sm text-ink-soft">
              Balls left — {mineLabel}: {aliveCount(myBalls)} · {partnerLabel}: {aliveCount(theirBalls)}
            </p>
          </div>
        )}
        <h1 className="font-display text-3xl italic text-ink">Table Roll</h1>
        <GameIntro
          gameKey="tableRoll"
          title="Table Roll"
          defaultText="Position your stationary balls within your boundary, then try to knock the opponent's balls out."
        />
        <StartPanel
          gameKey="tableRoll"
          label="Table Roll"
          emoji="🎱"
          onStart={() => {
            setSolo(false)
            return startMatch(false)
          }}
          onSolo={() => {
            setSolo(true)
            return startMatch(true)
          }}
        />
      </div>
    )
  }

  const last = match.lastShot
  const lastText = last
    ? `${last.by === user.uid ? mineLabel : partnerLabel} knocked out ${last.theirs} ball${last.theirs === 1 ? '' : 's'}${
        last.own > 0 ? ` (and lost ${last.own} of their own)` : ''
      }`
    : ''
  const prompt =
    status === 'setup'
      ? iAmReady
        ? `Waiting for ${partnerLabel} to finish setting up…`
        : `Tap in your end to place your balls (${placed.length}/${BALLS_EACH}) — tap a ball to pick it up, drag to move it`
      : myTurn
        ? 'Your roll — tap the ball and drag the way you want it to go'
        : match.shooting
          ? `${match.turnUid === user.uid ? 'Rolling' : `${partnerLabel} is rolling`}…`
          : `${partnerLabel}'s turn`

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
        <div className="flex flex-1 items-center justify-center gap-4 font-body text-sm text-ink">
          <span style={{ color: SIDE_COLORS[mySide] }} className="font-semibold">
            {mineLabel}: {status === 'setup' ? placed.length || aliveCount(myBalls) : aliveCount(myBalls)}
          </span>
          <span className="text-ink-soft">balls left</span>
          <span style={{ color: SIDE_COLORS[1 - mySide] }} className="font-semibold">
            {partnerLabel}: {status === 'setup' ? BALLS_EACH : aliveCount(theirBalls)}
          </span>
        </div>
        <EndGameButton onEnd={endGame} />
      </div>
      <p className="px-4 pt-1 text-center font-hand text-base text-ink-soft">{prompt}</p>
      {status === 'playing' && lastText && <p className="px-4 text-center font-body text-xs text-rose">{lastText}</p>}
      <div ref={containerRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="absolute inset-0 h-full w-full touch-none"
        />
      </div>
      {status === 'setup' && !iAmReady && (
        <div className="flex justify-center gap-3 px-4 py-2">
          <button
            type="button"
            onClick={() => setPlaced(randomSetup(mySide, BALLS_EACH))}
            className="rounded-full border border-ink/20 px-4 py-2 font-body text-sm text-ink-soft hover:border-rose hover:text-rose"
          >
            Random
          </button>
          <button
            type="button"
            onClick={() => setPlaced([])}
            disabled={placed.length === 0}
            className="rounded-full border border-ink/20 px-4 py-2 font-body text-sm text-ink-soft hover:border-rose hover:text-rose disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleReady}
            disabled={placed.length !== BALLS_EACH}
            className="rounded-full bg-rose px-6 py-2 font-body font-medium text-paper disabled:opacity-50"
          >
            Ready
          </button>
        </div>
      )}
    </div>
  )
}
