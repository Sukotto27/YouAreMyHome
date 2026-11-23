// Shared constants and pure geometry for Obstacle Drop — kept free of any
// Matter.js/Firebase imports (unlike useObstacleDropMatch/ObstacleDropGame)
// so the hole-protection logic is trivially unit-testable, same reasoning as
// lib/farkle.js.
//
// Everything is in normalized [0,1] x [0,1] canvas-fraction coordinates —
// the same convention DrawingCanvas's strokes already use — so an obstacle
// drawn on one device reconstructs identically on the other regardless of
// each screen's actual pixel size, and the host's physics simulation and
// both clients' rendering all agree on the same geometry.
export const TARGET_SCORE_OPTIONS = [5, 7]
export const DEFAULT_TARGET_SCORE = 5

export const OBSTACLE_TTL_MS = 10000
// Lines are limited by ink, not by count: a line costs its own length (in
// field widths), and your ink refills steadily. The count cap is only a safety net.
export const MAX_OBSTACLES_PER_PLAYER = 40
export const INK_MAX = 2
export const INK_REGEN_PER_S = 0.3
export const INK_MIN_TO_DRAW = 0.04
export const OBSTACLE_THICKNESS = 0.014

export const BALL_RADIUS = 0.022
export const BALL_START = { x: 0.5, y: 0.06 }
export const MISS_Y = 1.03 // past this, the ball fell off the bottom without scoring

export const HOLE_RADIUS = 0.075
// Kept a bit wider than the hole itself so an obstacle can't be drawn right
// up against the rim and effectively wall it off.
export const HOLE_PROTECTED_RADIUS = HOLE_RADIUS + 0.035
export const HOLE_Y = 0.94

export const LEFT_HOLE = { x: 0.25, y: HOLE_Y }
export const RIGHT_HOLE = { x: 0.75, y: HOLE_Y }

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function strokeLength(points) {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i])
  return total
}

// Random static bumpers (round posts) scattered across the middle of the field.
// A fresh set is generated for every drop and stored on the match, so both
// screens draw — and the host simulates — exactly the same ones. They keep clear
// of the walls, the drop point and the holes, and of each other, so there is
// always room for the ball to get through.
export function generateBumpers(rand = Math.random) {
  const count = 3 + Math.floor(rand() * 3)
  const bumpers = []
  for (let tries = 0; bumpers.length < count && tries < 200; tries++) {
    const r = 0.03 + rand() * 0.015
    const x = 0.12 + rand() * 0.76
    const y = 0.2 + rand() * 0.5
    if (bumpers.every((b) => Math.hypot(b.x - x, b.y - y) > b.r + r + 0.14)) {
      bumpers.push({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, r: Math.round(r * 1000) / 1000 })
    }
  }
  return bumpers
}

export function holeForSide(side) {
  return side === 'left' ? LEFT_HOLE : RIGHT_HOLE
}

export function isInsideProtectedZone(point) {
  return distance(point, LEFT_HOLE) < HOLE_PROTECTED_RADIUS || distance(point, RIGHT_HOLE) < HOLE_PROTECTED_RADIUS
}

// Splits a freeform stroke into disjoint point-runs, dropping any point that
// falls inside either hole's protected zone. A stroke that only clips the
// edge of a zone keeps the rest of its runs (clipped); one drawn entirely
// inside a zone comes back empty (rejected) — the caller should refuse to
// submit an obstacle with zero runs.
export function clipStrokeAroundHoles(points) {
  const runs = []
  let current = []
  for (const point of points) {
    if (isInsideProtectedZone(point)) {
      if (current.length >= 2) runs.push(current)
      current = []
    } else {
      current.push(point)
    }
  }
  if (current.length >= 2) runs.push(current)
  return runs
}

// A pending write's createdAt resolves to null in the local optimistic echo
// until the server timestamp comes back (same RTDB/Firestore serverTimestamp
// quirk noted elsewhere, e.g. useMoods.js) — treat that as "just created,"
// never as already-expired.
export function isObstacleExpired(obstacle, now = Date.now()) {
  if (!obstacle.createdAt) return false
  return now - obstacle.createdAt > OBSTACLE_TTL_MS
}

export function activeObstacleCount(obstacles, uid, now = Date.now()) {
  return obstacles.filter((o) => o.uid === uid && !isObstacleExpired(o, now)).length
}
