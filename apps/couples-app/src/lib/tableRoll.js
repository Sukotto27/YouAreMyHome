// Pure rules + physics for Table Roll — no React/Firebase imports (same
// reasoning as lib/farkle.js and lib/pong.js).
//
// A long, narrow table seen from above. Everything is in the HOST's frame: the
// host (side 0) owns the bottom end (y = FIELD_H), the guest (side 1) the top
// end (y = 0). The guest's screen is rotated 180° so their own end is at the
// bottom for them too. There is no pocket: past each end is a ledge, and any
// ball that rolls off either end drops onto it and is out of the game.
export const FIELD_W = 1
export const FIELD_H = 3.4
export const RAIL = 0.05 // side rails you can bank off (drawn outside the felt)
export const LEDGE = 0.16 // the drop-off strip past each end
export const BALL_R = 0.04
export const BALLS_EACH = 6

// Setup: each player puts their balls anywhere in a band measured from their own end.
export const SETUP_NEAR = 0.2
export const SETUP_FAR = 1.3
export const SHOOTER_INSET = 0.09 // where the rolling ball starts, from your end

export const MAX_SPEED = 3.2 // field units per second
export const DRAG_TO_SPEED = 5 // speed per field unit of drag
export const MIN_DRAG = 0.05
const FRICTION = 0.4 // constant slowing, field units / s²
const DRAG_COEF = 0.12 // extra slowing that grows with speed
const WALL_BOUNCE = 0.88
const BALL_BOUNCE = 0.96
const REST_SPEED = 0.01
export const SHOT_TIMEOUT_S = 15

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const round4 = (v) => Math.round(v * 10000) / 10000

export function shooterY(side) {
  return side === 0 ? FIELD_H - SHOOTER_INSET : SHOOTER_INSET
}

export function clampShooterX(x) {
  return clamp(x, BALL_R + 0.02, FIELD_W - BALL_R - 0.02)
}

// The band you may place balls in, for side 0 (bottom) or 1 (top).
export function setupZone(side) {
  const minX = BALL_R + 0.01
  const maxX = FIELD_W - BALL_R - 0.01
  return side === 0
    ? { minX, maxX, minY: FIELD_H - SETUP_FAR, maxY: FIELD_H - SETUP_NEAR }
    : { minX, maxX, minY: SETUP_NEAR, maxY: SETUP_FAR }
}

export function clampToZone(point, side) {
  const z = setupZone(side)
  return { x: clamp(point.x, z.minX, z.maxX), y: clamp(point.y, z.minY, z.maxY) }
}

// A ball can be placed at `point` if it doesn't overlap the others (ignoring index `skip`).
export function canPlace(point, others, skip = -1) {
  return others.every((o, i) => i === skip || Math.hypot(o.x - point.x, o.y - point.y) >= BALL_R * 2 + 0.005)
}

export function randomSetup(side, count = BALLS_EACH, rand = Math.random) {
  const z = setupZone(side)
  const balls = []
  for (let tries = 0; balls.length < count && tries < 500; tries++) {
    const p = { x: z.minX + rand() * (z.maxX - z.minX), y: z.minY + rand() * (z.maxY - z.minY) }
    if (canPlace(p, balls)) balls.push({ x: round4(p.x), y: round4(p.y), out: false })
  }
  return balls
}

export function aliveCount(list) {
  return (list || []).filter((b) => !b.out).length
}

// ---- simulation ------------------------------------------------------------
// `lists` is [side0 balls, side1 balls], each a list of { x, y, out }. The
// rolling ball (the "shooter") is the extra body with side -1.
export function createSim(lists, shooter) {
  const bodies = []
  lists.forEach((list, side) =>
    (list || []).forEach((b, idx) => bodies.push({ side, idx, x: b.x, y: b.y, vx: 0, vy: 0, out: !!b.out })),
  )
  if (shooter) bodies.push({ side: -1, idx: 0, x: shooter.x, y: shooter.y, vx: shooter.vx, vy: shooter.vy, out: false })
  return { bodies, time: 0 }
}

// Advances by dt seconds; returns { hits, walls, outs } counts for sound/effects.
export function stepSim(sim, dt) {
  const events = { hits: 0, walls: 0, outs: 0, hitSpeed: 0 }
  sim.time += dt
  for (const b of sim.bodies) {
    if (b.out) continue
    const speed = Math.hypot(b.vx, b.vy)
    if (speed > 0) {
      const slowed = Math.max(0, speed - (FRICTION + DRAG_COEF * speed) * dt)
      const k = slowed < REST_SPEED ? 0 : slowed / speed
      b.vx *= k
      b.vy *= k
    }
    b.x += b.vx * dt
    b.y += b.vy * dt
    if (b.x < BALL_R) {
      b.x = BALL_R
      if (b.vx < 0) b.vx = -b.vx * WALL_BOUNCE
      events.walls++
    } else if (b.x > FIELD_W - BALL_R) {
      b.x = FIELD_W - BALL_R
      if (b.vx > 0) b.vx = -b.vx * WALL_BOUNCE
      events.walls++
    }
    // No end rail: past either end the ball drops onto that end's ledge.
    if (b.y < 0 || b.y > FIELD_H) {
      b.y = b.y < 0 ? -LEDGE * 0.5 : FIELD_H + LEDGE * 0.5
      b.vx = 0
      b.vy = 0
      b.out = true
      events.outs++
    }
  }
  const live = sim.bodies.filter((b) => !b.out)
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]
      const b = live[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.hypot(dx, dy)
      if (dist >= BALL_R * 2 || dist === 0) continue
      const nx = dx / dist
      const ny = dy / dist
      const overlap = BALL_R * 2 - dist
      a.x -= (nx * overlap) / 2
      a.y -= (ny * overlap) / 2
      b.x += (nx * overlap) / 2
      b.y += (ny * overlap) / 2
      const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
      if (approach <= 0) continue
      const impulse = ((1 + BALL_BOUNCE) * approach) / 2
      a.vx -= impulse * nx
      a.vy -= impulse * ny
      b.vx += impulse * nx
      b.vy += impulse * ny
      if (approach > 0.05) {
        events.hits++
        events.hitSpeed = Math.max(events.hitSpeed, approach)
      }
    }
  }
  return events
}

export function simAtRest(sim) {
  return sim.bodies.every((b) => b.out || Math.hypot(b.vx, b.vy) < 0.005)
}

// The balls of both sides after a shot (the rolling ball is picked up).
export function finalizeSim(sim) {
  const lists = [[], []]
  for (const b of sim.bodies) {
    if (b.side < 0) continue
    lists[b.side][b.idx] = { x: round4(b.x), y: round4(b.y), out: b.out }
  }
  return lists
}

// ---- the computer opponent -------------------------------------------------
// Picks a spot at its end, aims at one of your balls (now and then off a side
// rail for a bank shot) with a little error, and rolls just hard enough to get there.
export function botShot(lists, botSide, rand = Math.random) {
  const targets = (lists[1 - botSide] || []).filter((b) => !b.out)
  const sx = clampShooterX(0.2 + rand() * 0.6)
  const sy = shooterY(botSide)
  const target = targets.length ? targets[Math.floor(rand() * targets.length)] : { x: 0.5, y: FIELD_H / 2 }
  let tx = target.x
  if (rand() < 0.25) tx = tx < 0.5 ? -tx : 2 - tx // aim at the mirror image: bounces off the near wall
  const angle = Math.atan2(target.y - sy, tx - sx) + (rand() - 0.5) * 0.14
  const distance = Math.hypot(tx - sx, target.y - sy)
  // hard enough to send what it hits off the end, never softer than getting there
  const speed = Math.min(MAX_SPEED, Math.max(Math.sqrt(1.4 * distance) * 1.25 + 0.3, MAX_SPEED * (0.65 + rand() * 0.35)))
  return { x: sx, y: sy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed }
}
