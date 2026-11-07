import { useEffect, useRef, useState } from 'react'
import { onValue, ref, set } from 'firebase/database'
import { rtdb, firebaseReady } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { usePongMatch } from '../../hooks/usePongMatch'
import { useGameInvite } from '../../hooks/useGameInvite'
import EndGameButton from './EndGameButton'
import GameIntro from './GameIntro'
import { playSound } from '../../lib/sounds'
import {
  BALL_CENTER,
  BALL_RADIUS,
  BOTTOM_PADDLE_Y,
  DEFAULT_TARGET_SCORE,
  FIELD_H,
  FIELD_W,
  PADDLE_H,
  PADDLE_W,
  TARGET_SCORE_OPTIONS,
  TOP_PADDLE_Y,
  clampPaddleX,
  serveBall,
  stepBall,
} from '../../lib/pong'

const COUNTDOWN_FROM = 3
const POINT_PAUSE_MS = 1000
const SEND_INTERVAL_MS = 33
const PADDLE_SEND_INTERVAL_MS = 40
const BALL_LERP = 0.35
const PADDLE_LERP = 0.5
const AI_MAX_SPEED = 0.55 // field units/sec — fast enough to be a game, slow enough to beat
const BURST_COLORS = ['#ff5e7e', '#ffb347', '#ffe156', '#6ee7b7', '#5ec8ff', '#b794f6']
const LEFT_COLOR = '#2f9e94'
const RIGHT_COLOR = '#e27d7a'

// Live two-player Pong. The host (whoever started the match) runs the ball
// physics in lib/pong.js and streams it; each player writes only their own
// paddle. Everything on the wire is in the HOST's frame (host paddle at the
// bottom). The guest renders that frame rotated 180° so their own paddle is
// at the bottom of their screen too — `flip` below is that rotation. With no
// Firebase (demo mode) the partner is a slightly beatable AI.
export default function PongGame({ onBack }) {
  const { user } = useAuth()
  const { match, effectivePartnerUid, startMatch, recordGoal, endGame } = usePongMatch()
  const { sendInvite } = useGameInvite('pong', 'Pong')
  const [targetChoice, setTargetChoice] = useState(DEFAULT_TARGET_SCORE)
  const [countdown, setCountdown] = useState(0)
  const [inviting, setInviting] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')

  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const layoutRef = useRef({ width: 0, height: 0, scale: 1, ox: 0, oy: 0 })

  const matchRef = useRef(match)
  matchRef.current = match
  const recordGoalRef = useRef(recordGoal)
  recordGoalRef.current = recordGoal
  const countdownRef = useRef(0)

  const myScreenXRef = useRef(FIELD_W / 2) // my paddle, in my own screen frame
  const partnerHostXRef = useRef(FIELD_W / 2) // partner's paddle target, host frame
  const renderedPartnerXRef = useRef(FIELD_W / 2)
  const renderedBallRef = useRef({ ...BALL_CENTER })
  const targetBallRef = useRef({ ...BALL_CENTER })
  const lastHitsRef = useRef(0)
  const particlesRef = useRef([])
  const ringsRef = useRef([])
  const popupsRef = useRef([])
  const prevScoresRef = useRef(null)

  const isHost = !!match && match.hostUid === user.uid
  const flip = !!match && !isHost
  const mineLabel = user.displayName === 'Cristina' ? 'Cristina' : 'Scott'
  const partnerLabel = mineLabel === 'Scott' ? 'Cristina' : 'Scott'
  const myScore = match?.scores?.[user.uid] || 0
  const partnerScore = match?.scores?.[effectivePartnerUid] || 0
  const myColor = isHost || !match ? LEFT_COLOR : RIGHT_COLOR
  const partnerColor = myColor === LEFT_COLOR ? RIGHT_COLOR : LEFT_COLOR

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

  // Canvas fit-to-container with DPR, keyed on match status because the canvas
  // only exists once a match is playing (same note as ObstacleDropGame).
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
      const scale = Math.min(rect.width / FIELD_W, rect.height / FIELD_H)
      layoutRef.current = {
        width: rect.width,
        height: rect.height,
        scale,
        ox: (rect.width - FIELD_W * scale) / 2,
        oy: (rect.height - FIELD_H * scale) / 2,
      }
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [match?.status])

  // 3-2-1 before the first serve; physics and paddle control wait on it.
  useEffect(() => {
    if (match?.status !== 'playing') {
      countdownRef.current = 0
      setCountdown(0)
      return
    }
    let n = COUNTDOWN_FROM
    countdownRef.current = n
    setCountdown(n)
    playSound('chat_send')
    const interval = setInterval(() => {
      n -= 1
      countdownRef.current = n
      setCountdown(n)
      if (n > 0) playSound('chat_send')
      else clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [match?.status])

  // Goal feedback on both screens, driven by the shared score changing.
  useEffect(() => {
    const scores = match?.scores || {}
    const prev = prevScoresRef.current
    prevScoresRef.current = scores
    if (!prev || !match) return
    const scorer = Object.keys(scores).find((uid) => (scores[uid] || 0) > (prev[uid] || 0))
    if (!scorer) return
    const mine = scorer === user.uid
    // Scorer's point lands at the opponent's end: top of my screen if I scored.
    const pos = { x: FIELD_W / 2, y: mine ? 0.12 : FIELD_H - 0.12 }
    burst(pos, 40, 0.8, 0.009)
    ringsRef.current.push({ ...pos, age: 0, maxR: 0.45, color: mine ? myColor : partnerColor })
    ringsRef.current.push({ ...pos, age: -0.15, maxR: 0.65, color: '#ffe156' })
    popupsRef.current.push({ x: FIELD_W / 2, y: FIELD_H / 2, age: 0, text: '+1', color: mine ? myColor : partnerColor })
    playSound('notification')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.scores])

  function burst(pos, count, speed, size = 0.006) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const v = speed * (0.4 + Math.random() * 0.8)
      particlesRef.current.push({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: 1,
        decay: 1.5 + Math.random() * 1.2,
        size: size * (0.6 + Math.random() * 0.8),
        color: BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)],
      })
    }
  }

  // host-frame point -> my screen frame
  function toScreen(p) {
    return flip ? { x: FIELD_W - p.x, y: FIELD_H - p.y } : p
  }

  function hitEffect(hostPos) {
    const pos = toScreen(hostPos)
    burst(pos, 12, 0.4)
    ringsRef.current.push({ ...pos, age: 0, maxR: 0.08, color: '#ffe156' })
    playSound('bubble')
  }

  function px(p) {
    const { scale, ox, oy } = layoutRef.current
    return { x: ox + p.x * scale, y: oy + p.y * scale }
  }

  function drawFrame(ballHost) {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height, scale, ox, oy } = layoutRef.current
    ctx.clearRect(0, 0, width, height)

    // field
    ctx.fillStyle = 'rgba(255, 252, 246, 0.6)'
    ctx.fillRect(ox, oy, FIELD_W * scale, FIELD_H * scale)
    ctx.strokeStyle = 'rgba(54, 37, 33, 0.18)'
    ctx.lineWidth = 2
    ctx.strokeRect(ox, oy, FIELD_W * scale, FIELD_H * scale)
    ctx.setLineDash([8, 8])
    ctx.beginPath()
    ctx.moveTo(ox, oy + (FIELD_H * scale) / 2)
    ctx.lineTo(ox + FIELD_W * scale, oy + (FIELD_H * scale) / 2)
    ctx.stroke()
    ctx.setLineDash([])

    // paddles (mine always at the bottom of my screen)
    const myP = px({ x: myScreenXRef.current, y: BOTTOM_PADDLE_Y })
    const partnerP = px({ x: toScreen({ x: renderedPartnerXRef.current, y: 0 }).x, y: TOP_PADDLE_Y })
    drawPaddle(ctx, myP.x, myP.y, myColor, scale)
    drawPaddle(ctx, partnerP.x, partnerP.y, partnerColor, scale)

    // ball
    const ball = px(toScreen(ballHost))
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, BALL_RADIUS * scale, 0, Math.PI * 2)
    ctx.fillStyle = '#362521'
    ctx.fill()

    drawEffects(ctx, scale)
  }

  function drawPaddle(ctx, cx, cy, color, scale) {
    const w = PADDLE_W * scale
    const h = PADDLE_H * scale
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2)
    ctx.fill()
  }

  function drawEffects(ctx, scale) {
    const dt = 1 / 60
    const particles = particlesRef.current
    for (const p of particles) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 0.6 * dt
      p.life -= p.decay * dt
      if (p.life <= 0) continue
      const pos = px(p)
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, p.size * scale, 0, Math.PI * 2)
      ctx.fill()
    }
    particlesRef.current = particles.filter((p) => p.life > 0)

    const rings = ringsRef.current
    for (const r of rings) {
      r.age += dt * 2.2
      if (r.age <= 0) continue
      const pos = px(r)
      ctx.globalAlpha = Math.max(0, 1 - r.age)
      ctx.strokeStyle = r.color
      ctx.lineWidth = 4 * (1 - r.age) + 1
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, r.maxR * scale * r.age, 0, Math.PI * 2)
      ctx.stroke()
    }
    ringsRef.current = rings.filter((r) => r.age < 1)

    const popups = popupsRef.current
    for (const p of popups) {
      p.age += dt * 0.9
      const pos = px({ x: p.x, y: p.y - p.age * 0.15 })
      ctx.globalAlpha = Math.max(0, 1 - p.age)
      ctx.fillStyle = p.color
      ctx.font = `bold ${Math.round(scale * 0.14)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(p.text, pos.x, pos.y)
    }
    popupsRef.current = popups.filter((p) => p.age < 1)
    ctx.globalAlpha = 1
  }

  // The live loop. Host: simulate + stream ball. Guest: lerp the streamed
  // ball. Both: stream own paddle, lerp the partner's.
  useEffect(() => {
    if (!match || match.status !== 'playing') return
    myScreenXRef.current = FIELD_W / 2
    partnerHostXRef.current = FIELD_W / 2
    renderedPartnerXRef.current = FIELD_W / 2
    renderedBallRef.current = { ...BALL_CENTER }
    targetBallRef.current = { ...BALL_CENTER }
    lastHitsRef.current = 0

    let rafId
    let last = performance.now()
    let lastBallSent = 0
    let lastPaddleSent = 0
    let ball = { ...BALL_CENTER, vx: 0, vy: 0 }
    let hits = 0
    let serveAt = Infinity // wall-clock ms; Infinity until the countdown ends
    let serveToward = Math.random() < 0.5
    const unsubscribers = []

    if (firebaseReady) {
      unsubscribers.push(
        onValue(ref(rtdb, `pong/paddles/${effectivePartnerUid}`), (snap) => {
          const value = snap.val()
          if (typeof value === 'number') partnerHostXRef.current = value
        }),
      )
      if (!isHost) {
        unsubscribers.push(
          onValue(ref(rtdb, 'pong/state'), (snap) => {
            const value = snap.val()
            if (!value) return
            targetBallRef.current = { x: value.x, y: value.y }
            if (value.hits > lastHitsRef.current) hitEffect({ x: value.x, y: value.y })
            lastHitsRef.current = value.hits || 0
          }),
        )
      }
    }

    function tick(time) {
      const dt = Math.min(1 / 30, (time - last) / 1000)
      last = time
      const now = Date.now()

      const myHostX = flip ? FIELD_W - myScreenXRef.current : myScreenXRef.current
      if (firebaseReady && time - lastPaddleSent > PADDLE_SEND_INTERVAL_MS) {
        lastPaddleSent = time
        set(ref(rtdb, `pong/paddles/${user.uid}`), myHostX)
      }

      if (isHost) {
        if (serveAt === Infinity && countdownRef.current <= 0) serveAt = now + 200

        // partner paddle: real (streamed) or AI in demo mode
        if (!firebaseReady) {
          const target = ball.vy < 0 ? ball.x : FIELD_W / 2
          const diff = target - partnerHostXRef.current
          const step = AI_MAX_SPEED * dt
          partnerHostXRef.current = clampPaddleX(partnerHostXRef.current + Math.max(-step, Math.min(step, diff)))
        }
        renderedPartnerXRef.current += (partnerHostXRef.current - renderedPartnerXRef.current) * (firebaseReady ? PADDLE_LERP : 1)

        if (ball.vx === 0 && ball.vy === 0) {
          if (now >= serveAt) ball = serveBall(serveToward)
        } else {
          const { ball: next, event } = stepBall(ball, clampPaddleX(myHostX), renderedPartnerXRef.current, dt)
          ball = next
          if (event === 'paddle') {
            hits += 1
            hitEffect({ x: ball.x, y: ball.y })
          } else if (event === 'wall') {
            burst(toScreen({ x: ball.x, y: ball.y }), 4, 0.25, 0.004)
          } else if (event === 'bottomMiss' || event === 'topMiss') {
            const m = matchRef.current
            // bottom (host/left) misses -> right scores, and vice versa
            recordGoalRef.current(event === 'bottomMiss' ? m.rightUid : m.leftUid)
            serveToward = event === 'bottomMiss' // serve toward whoever just lost
            ball = { ...BALL_CENTER, vx: 0, vy: 0 }
            serveAt = now + POINT_PAUSE_MS
          }
        }
        renderedBallRef.current = { x: ball.x, y: ball.y }

        if (firebaseReady && time - lastBallSent > SEND_INTERVAL_MS) {
          lastBallSent = time
          set(ref(rtdb, 'pong/state'), { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, hits })
        }
      } else {
        renderedPartnerXRef.current += (partnerHostXRef.current - renderedPartnerXRef.current) * PADDLE_LERP
        const target = targetBallRef.current
        const current = renderedBallRef.current
        renderedBallRef.current = {
          x: current.x + (target.x - current.x) * BALL_LERP,
          y: current.y + (target.y - current.y) * BALL_LERP,
        }
      }

      drawFrame(renderedBallRef.current)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, match?.status, match?.leftUid, match?.rightUid])

  function handlePointerMove(event) {
    if (countdownRef.current > 0) return
    const { ox, scale } = layoutRef.current
    const rect = canvasRef.current.getBoundingClientRect()
    const x = (event.clientX - rect.left - ox) / scale
    myScreenXRef.current = clampPaddleX(x)
  }

  if (!match || match.status === 'finished' || match.status === 'ended') {
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
          <p className="font-hand text-base text-ink-soft">
            {match.endedBy === user.uid ? 'You' : partnerLabel} ended the game.
          </p>
        )}
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
        <h1 className="font-display text-3xl italic text-ink">Pong</h1>
        <GameIntro gameKey="pong" title="Pong" defaultText={"Drag to slide your paddle along the bottom and keep the ball in play — get it past your partner's paddle at the top to score. The ball speeds up every hit. First to the target score wins."} />
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
            {inviting ? 'Inviting…' : '🏓 Invite partner'}
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
          <span style={{ color: myColor }} className="font-semibold">
            {mineLabel}: {myScore}
          </span>
          <span className="text-ink-soft">first to {match.targetScore}</span>
          <span style={{ color: partnerColor }} className="font-semibold">
            {partnerLabel}: {partnerScore}
          </span>
        </div>
        <EndGameButton onEnd={endGame} />
      </div>
      <div ref={containerRef} className="relative min-h-0 flex-1">
        {countdown > 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span
              key={countdown}
              className="font-display text-9xl italic text-rose drop-shadow-lg"
              style={{ animation: 'pongCountdown 1s ease-out forwards' }}
            >
              {countdown}
            </span>
            <style>{`@keyframes pongCountdown { from { transform: scale(1.8); opacity: 0 } 25% { opacity: 1 } to { transform: scale(0.8); opacity: 0.2 } }`}</style>
          </div>
        )}
        <canvas
          ref={canvasRef}
          onPointerDown={(event) => {
            event.preventDefault()
            canvasRef.current.setPointerCapture(event.pointerId)
            handlePointerMove(event)
          }}
          onPointerMove={handlePointerMove}
          className="absolute inset-0 h-full w-full touch-none"
        />
      </div>
    </div>
  )
}
