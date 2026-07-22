import { useEffect, useRef, useState } from 'react'
import Matter from 'matter-js'
import { onValue, ref, set } from 'firebase/database'
import { rtdb, firebaseReady } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { useObstacleDropMatch } from '../../hooks/useObstacleDropMatch'
import { useObstacleDropObstacles } from '../../hooks/useObstacleDropObstacles'
import { useGameInvite } from '../../hooks/useGameInvite'
import { createWorld, resetBall, buildObstacleBodies, toNormalized } from '../../lib/obstaclePhysics'
import {
  BALL_RADIUS,
  BALL_START,
  HOLE_RADIUS,
  LEFT_HOLE,
  MISS_Y,
  OBSTACLE_THICKNESS,
  RIGHT_HOLE,
  TARGET_SCORE_OPTIONS,
  DEFAULT_TARGET_SCORE,
  isInsideProtectedZone,
  isObstacleExpired,
} from '../../lib/obstacleDrop'

const BALL_SEND_INTERVAL_MS = 50 // ~20Hz, well within "several times a second"
const LERP_FACTOR = 0.3

// A live, physics-based mini-game — see lib/obstaclePhysics.js for why the
// physics world runs in its own uniform-scaled space, and useObstacleDropMatch/
// useObstacleDropObstacles for the Realtime Database schema. Only one client
// (the host, whoever started the match) actually runs Matter.js; the other
// renders the ball from streamed position updates rather than simulating it
// independently, so the two views can never drift apart the way two
// separately-run physics engines would.
export default function ObstacleDropGame({ onBack }) {
  const { user } = useAuth()
  const { match, effectivePartnerUid, startMatch, recordGoal } = useObstacleDropMatch()
  const { obstacles, activeObstacles, canDraw, addObstacle } = useObstacleDropObstacles()
  const [targetChoice, setTargetChoice] = useState(DEFAULT_TARGET_SCORE)
  const [message, setMessage] = useState('')
  const { sendInvite } = useGameInvite('obstacleDrop', 'Obstacle Drop')
  const [inviting, setInviting] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')

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

  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const rectSizeRef = useRef({ width: 0, height: 0 })

  const matchRef = useRef(match)
  matchRef.current = match
  const obstaclesRef = useRef(obstacles)
  obstaclesRef.current = obstacles
  const activeObstaclesRef = useRef(activeObstacles)
  activeObstaclesRef.current = activeObstacles
  const recordGoalRef = useRef(recordGoal)
  recordGoalRef.current = recordGoal

  const activeStrokeRef = useRef(null)
  const renderedBallRef = useRef(BALL_START)
  const targetBallRef = useRef(BALL_START)

  const isHost = !!match && match.hostUid === user.uid
  const mySide = match?.leftUid === user.uid ? 'left' : 'right'
  const mineLabel = user.displayName === 'Cristina' ? 'Cristina' : 'Scott'
  const partnerLabel = mineLabel === 'Scott' ? 'Cristina' : 'Scott'
  const myScore = match?.scores?.[user.uid] || 0
  const partnerScore = match?.scores?.[effectivePartnerUid] || 0
  const leftName = mySide === 'left' ? mineLabel : partnerLabel
  const leftScore = mySide === 'left' ? myScore : partnerScore
  const rightName = mySide === 'left' ? partnerLabel : mineLabel
  const rightScore = mySide === 'left' ? partnerScore : myScore

  function showMessage(text) {
    setMessage(text)
    setTimeout(() => setMessage((current) => (current === text ? '' : current)), 2200)
  }

  // Canvas sizing — same fit-to-container-with-DPR approach as DrawingCanvas.
  // Keyed on match status rather than `[]`: the canvas only exists in the
  // DOM once a match is actually in progress (the lobby view before that
  // has no <canvas> at all), so an empty dependency array would run this
  // once against a null canvasRef during the lobby and never again —
  // leaving the canvas stuck at the browser's 300x150 default forever once
  // a match starts.
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')
    ctxRef.current = ctx

    function resize() {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      rectSizeRef.current = { width: rect.width, height: rect.height }
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [match?.status])

  function pointToPixel(point) {
    return { x: point.x * rectSizeRef.current.width, y: point.y * rectSizeRef.current.height }
  }

  function drawFrame(ballPos) {
    const ctx = ctxRef.current
    if (!ctx) return
    const currentMatch = matchRef.current
    const { width, height } = rectSizeRef.current
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(255, 252, 246, 0.55)'
    ctx.fillRect(0, 0, width, height)

    drawHole(ctx, LEFT_HOLE, currentMatch?.leftUid === user.uid ? mineLabel : partnerLabel, '#2f9e94')
    drawHole(ctx, RIGHT_HOLE, currentMatch?.rightUid === user.uid ? mineLabel : partnerLabel, '#e27d7a')

    for (const obstacle of activeObstaclesRef.current) {
      const color = obstacle.uid === currentMatch?.leftUid ? '#2f9e94' : '#e27d7a'
      strokeRuns(ctx, obstacle.runs, color, 1)
    }
    if (activeStrokeRef.current?.length > 1) {
      const color = currentMatch?.leftUid === user.uid ? '#2f9e94' : '#e27d7a'
      strokeRuns(ctx, [activeStrokeRef.current], color, 0.5)
    }

    const pixelBall = pointToPixel(ballPos)
    ctx.beginPath()
    ctx.arc(pixelBall.x, pixelBall.y, BALL_RADIUS * width, 0, Math.PI * 2)
    ctx.fillStyle = '#362521'
    ctx.fill()
  }

  function drawHole(ctx, hole, label, color) {
    const pixel = pointToPixel(hole)
    const radius = HOLE_RADIUS * rectSizeRef.current.width
    ctx.beginPath()
    ctx.arc(pixel.x, pixel.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = 0.35
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = color
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(label, pixel.x, pixel.y + radius + 16)
  }

  function strokeRuns(ctx, runs, color, alpha) {
    ctx.strokeStyle = color
    ctx.globalAlpha = alpha
    ctx.lineWidth = OBSTACLE_THICKNESS * rectSizeRef.current.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const run of runs) {
      ctx.beginPath()
      run.forEach((point, index) => {
        const pixel = pointToPixel(point)
        if (index === 0) ctx.moveTo(pixel.x, pixel.y)
        else ctx.lineTo(pixel.x, pixel.y)
      })
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  // The live game loop — host runs Matter.js and streams the ball's
  // position; the guest just lerps toward whatever position last arrived.
  // Deliberately keyed only on stable match identifiers, not on `obstacles`
  // (obstaclesRef/activeObstaclesRef carry the latest data into the loop
  // instead) — otherwise every drawn obstacle would tear down and rebuild
  // the whole physics world.
  useEffect(() => {
    if (!match || match.status !== 'playing') return
    renderedBallRef.current = BALL_START
    targetBallRef.current = BALL_START

    let rafId
    let engine = null
    let ball = null
    let collisionHandler = null
    let unsubscribeBall = null
    const trackedBodies = new Map()
    let lastPhysicsTime = performance.now()
    let lastSentAt = 0

    if (isHost) {
      const world = createWorld()
      engine = world.engine
      ball = world.ball

      collisionHandler = (event) => {
        for (const pair of event.pairs) {
          const labels = [pair.bodyA.label, pair.bodyB.label]
          if (!labels.includes('ball')) continue
          const currentMatch = matchRef.current
          if (labels.includes('hole:left')) {
            recordGoalRef.current(currentMatch.leftUid)
            resetBall(ball)
          } else if (labels.includes('hole:right')) {
            recordGoalRef.current(currentMatch.rightUid)
            resetBall(ball)
          }
        }
      }
      Matter.Events.on(engine, 'collisionStart', collisionHandler)
    } else if (firebaseReady) {
      unsubscribeBall = onValue(ref(rtdb, 'obstacleDrop/ball'), (snap) => {
        const value = snap.val()
        if (value) targetBallRef.current = { x: value.x, y: value.y }
      })
    }

    function syncObstacleBodies(now) {
      const byId = new Map(obstaclesRef.current.map((o) => [o.id, o]))
      for (const obstacle of obstaclesRef.current) {
        if (trackedBodies.has(obstacle.id) || isObstacleExpired(obstacle, now)) continue
        const bodies = buildObstacleBodies(obstacle.runs)
        Matter.Composite.add(engine.world, bodies)
        trackedBodies.set(obstacle.id, bodies)
      }
      for (const [id, bodies] of trackedBodies) {
        const obstacle = byId.get(id)
        if (!obstacle || isObstacleExpired(obstacle, now)) {
          Matter.Composite.remove(engine.world, bodies)
          trackedBodies.delete(id)
        }
      }
    }

    function tick(time) {
      if (isHost) {
        const delta = Math.min(33, time - lastPhysicsTime)
        lastPhysicsTime = time
        syncObstacleBodies(Date.now())
        Matter.Engine.update(engine, delta)

        const normalized = toNormalized(ball.position)
        if (normalized.y > MISS_Y) {
          recordGoalRef.current(null)
          resetBall(ball)
        }
        renderedBallRef.current = toNormalized(ball.position)

        if (firebaseReady && time - lastSentAt > BALL_SEND_INTERVAL_MS) {
          lastSentAt = time
          const velocity = toNormalized(ball.velocity)
          set(ref(rtdb, 'obstacleDrop/ball'), {
            x: renderedBallRef.current.x,
            y: renderedBallRef.current.y,
            vx: velocity.x,
            vy: velocity.y,
          })
        }
      } else {
        const target = targetBallRef.current
        const current = renderedBallRef.current
        renderedBallRef.current = {
          x: current.x + (target.x - current.x) * LERP_FACTOR,
          y: current.y + (target.y - current.y) * LERP_FACTOR,
        }
      }
      drawFrame(renderedBallRef.current)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      unsubscribeBall?.()
      if (engine) {
        if (collisionHandler) Matter.Events.off(engine, 'collisionStart', collisionHandler)
        Matter.Engine.clear(engine)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, match?.status, match?.leftUid, match?.rightUid])

  function toNormalizedPoint(event) {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  function handlePointerDown(event) {
    if (!match || match.status !== 'playing') return
    event.preventDefault()
    canvasRef.current.setPointerCapture(event.pointerId)
    if (!canDraw(user.uid)) {
      showMessage('You already have 10 obstacles out — wait for one to expire.')
      return
    }
    activeStrokeRef.current = [toNormalizedPoint(event)]
  }

  function handlePointerMove(event) {
    if (!activeStrokeRef.current) return
    const point = toNormalizedPoint(event)
    if (isInsideProtectedZone(point)) return
    activeStrokeRef.current.push(point)
  }

  async function handlePointerUp(event) {
    canvasRef.current.releasePointerCapture(event.pointerId)
    const points = activeStrokeRef.current
    activeStrokeRef.current = null
    if (!points || points.length < 2) return
    const ok = await addObstacle(user.uid, points)
    if (!ok) showMessage("That line was too close to a hole and couldn't be placed.")
  }

  if (!match || match.status === 'finished') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-8 text-center sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="self-start font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
        >
          ← Games
        </button>
        {match?.status === 'finished' && (
          <div className="rounded-3xl border border-rose/30 bg-blush-soft/50 px-6 py-4">
            <p className="font-display text-2xl italic text-ink">
              {match.winnerUid === user.uid ? `${mineLabel} wins! 🎉` : `${partnerLabel} wins! 🎉`}
            </p>
            <p className="mt-1 font-body text-sm text-ink-soft">
              Final score — {myScore} : {partnerScore}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl italic text-ink">Obstacle Drop</h1>
          <span className="rounded-full bg-gold/20 px-2 py-0.5 font-body text-[10px] font-medium uppercase tracking-wide text-gold">
            Work in progress
          </span>
        </div>
        <p className="max-w-sm font-body text-sm text-ink-soft">
          A ball drops from the top — draw lines anywhere (except right over a hole) to steer it into your own hole
          and away from theirs. Each obstacle disappears 10 seconds after you draw it, and you can have up to 10 out
          at once. First to the target score wins.
        </p>
        <div className="flex gap-2">
          {TARGET_SCORE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTargetChoice(option)}
              className={`rounded-full border px-4 py-1.5 font-body text-sm font-medium transition-colors ${
                targetChoice === option ? 'border-rose bg-blush-soft text-rose' : 'border-ink/15 text-ink-soft'
              }`}
            >
              First to {option}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => startMatch(targetChoice)}
            className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            {match ? 'New match' : 'Start match'}
          </button>
          <button
            type="button"
            onClick={handleInvite}
            disabled={inviting}
            className="rounded-full border border-rose/40 px-6 py-2.5 font-body font-medium text-rose transition-colors hover:bg-blush-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {inviting ? 'Inviting…' : '⚽ Invite partner'}
          </button>
        </div>
        {inviteMessage && <p className="font-hand text-sm text-rose">{inviteMessage}</p>}
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
        <div className="flex flex-1 items-center justify-center gap-4 font-body text-sm text-ink">
          <span style={{ color: '#2f9e94' }} className="font-semibold">
            {leftName}: {leftScore}
          </span>
          <span className="text-ink-soft">first to {match.targetScore}</span>
          <span style={{ color: '#e27d7a' }} className="font-semibold">
            {rightName}: {rightScore}
          </span>
        </div>
      </div>
      {message && <p className="bg-blush-soft/60 px-4 py-1.5 text-center font-hand text-sm text-rose">{message}</p>}
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
    </div>
  )
}
