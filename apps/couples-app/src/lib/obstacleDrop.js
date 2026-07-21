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
export const MAX_OBSTACLES_PER_PLAYER = 10
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
