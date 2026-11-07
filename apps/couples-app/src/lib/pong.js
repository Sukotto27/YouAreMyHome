// Pure physics + constants for Pong — no React/Firebase, same reasoning as
// lib/farkle.js, so the rules are easy to reason about and test.
//
// The field is portrait (phone friendly): x in [0, FIELD_W], y in [0, FIELD_H].
// All simulation happens in the HOST's frame, where the host's paddle is at
// the bottom and the guest's at the top. The guest just renders that frame
// rotated 180° so that their own paddle is at the bottom of their screen too.
export const FIELD_W = 1
export const FIELD_H = 1.5
export const BALL_RADIUS = 0.022
export const PADDLE_W = 0.24
export const PADDLE_H = 0.03
export const PADDLE_MARGIN = 0.09 // distance from the field edge to a paddle's center line
export const BOTTOM_PADDLE_Y = FIELD_H - PADDLE_MARGIN
export const TOP_PADDLE_Y = PADDLE_MARGIN

export const BALL_SPEED_START = 0.75 // field units per second
export const BALL_SPEED_MAX = 1.7
export const PADDLE_SPEEDUP = 1.06
const MAX_BOUNCE_ANGLE = 1.0 // radians off vertical at the paddle's very edge

export const TARGET_SCORE_OPTIONS = [5, 7]
export const DEFAULT_TARGET_SCORE = 5

export const BALL_CENTER = { x: FIELD_W / 2, y: FIELD_H / 2 }

export function clampPaddleX(x) {
  return Math.min(FIELD_W - PADDLE_W / 2, Math.max(PADDLE_W / 2, x))
}

// Launches from center, mostly vertical with a random sideways lean.
export function serveBall(towardBottom) {
  const angle = (Math.random() - 0.5) * 0.9
  return {
    x: BALL_CENTER.x,
    y: BALL_CENTER.y,
    vx: Math.sin(angle) * BALL_SPEED_START,
    vy: (towardBottom ? 1 : -1) * Math.cos(angle) * BALL_SPEED_START,
  }
}

// Advances the ball by dt seconds. Returns { ball, event } where event is
// 'paddle' | 'wall' | 'bottomMiss' (the bottom player let it past, so the top
// player scores) | 'topMiss' | null.
export function stepBall(ball, bottomX, topX, dt) {
  let { x, y, vx, vy } = ball
  const prevY = y
  x += vx * dt
  y += vy * dt
  let event = null

  if (x < BALL_RADIUS) {
    x = BALL_RADIUS
    vx = Math.abs(vx)
    event = 'wall'
  } else if (x > FIELD_W - BALL_RADIUS) {
    x = FIELD_W - BALL_RADIUS
    vx = -Math.abs(vx)
    event = 'wall'
  }

  const speed = Math.hypot(vx, vy)

  // Bottom paddle: the ball's lower edge crossed the paddle's top face this step.
  const bottomFace = BOTTOM_PADDLE_Y - PADDLE_H / 2
  if (vy > 0 && prevY + BALL_RADIUS <= bottomFace && y + BALL_RADIUS >= bottomFace) {
    if (Math.abs(x - bottomX) <= PADDLE_W / 2 + BALL_RADIUS) {
      const offset = Math.max(-1, Math.min(1, (x - bottomX) / (PADDLE_W / 2)))
      const next = Math.min(BALL_SPEED_MAX, speed * PADDLE_SPEEDUP)
      const angle = offset * MAX_BOUNCE_ANGLE
      return { ball: { x, y: bottomFace - BALL_RADIUS, vx: Math.sin(angle) * next, vy: -Math.cos(angle) * next }, event: 'paddle' }
    }
  }
  // Top paddle: mirror image.
  const topFace = TOP_PADDLE_Y + PADDLE_H / 2
  if (vy < 0 && prevY - BALL_RADIUS >= topFace && y - BALL_RADIUS <= topFace) {
    if (Math.abs(x - topX) <= PADDLE_W / 2 + BALL_RADIUS) {
      const offset = Math.max(-1, Math.min(1, (x - topX) / (PADDLE_W / 2)))
      const next = Math.min(BALL_SPEED_MAX, speed * PADDLE_SPEEDUP)
      const angle = offset * MAX_BOUNCE_ANGLE
      return { ball: { x, y: topFace + BALL_RADIUS, vx: Math.sin(angle) * next, vy: Math.cos(angle) * next }, event: 'paddle' }
    }
  }

  if (y - BALL_RADIUS > FIELD_H) return { ball: { x, y, vx, vy }, event: 'bottomMiss' }
  if (y + BALL_RADIUS < 0) return { ball: { x, y, vx, vy }, event: 'topMiss' }
  return { ball: { x, y, vx, vy }, event }
}
