import Matter from 'matter-js'
import { BALL_RADIUS, BALL_START, HOLE_RADIUS, LEFT_HOLE, OBSTACLE_THICKNESS, RIGHT_HOLE } from './obstacleDrop'

// Matter.js's defaults (gravity scale, restitution thresholds, sleep
// thresholds, etc.) are all tuned assuming bodies sized in the tens-to-
// hundreds of units, not the [0,1] normalized fractions the rest of this
// game (and the app's other live-canvas features) store and sync
// coordinates in. Rather than fight those defaults, the physics world runs
// in its own uniformly-scaled space and every point crossing the boundary —
// obstacle points coming in, the ball's position going out to RTDB — gets
// converted through PHYSICS_SCALE. Using the same scale for both axes keeps
// the ball circular; the physics world's aspect ratio doesn't need to match
// the canvas's, since only positions (not shapes) ever leave this module.
const PHYSICS_SCALE = 500

export function toPhysics(point) {
  return { x: point.x * PHYSICS_SCALE, y: point.y * PHYSICS_SCALE }
}

export function toNormalized(point) {
  return { x: point.x / PHYSICS_SCALE, y: point.y / PHYSICS_SCALE }
}

const WALL_THICKNESS = 40

// Matter's default gravity.scale (0.001) is tuned for bodies/worlds sized in
// the hundreds of units — at that setting a ball dropped from BALL_START
// reaches MISS_Y in about 1 second flat (checked with a headless
// simulation), leaving no time to actually place or react to an obstacle.
// This scale stretches the same drop out to ~4 seconds, which the same
// simulation confirms — enough time to draw a line and watch the ball
// actually interact with it before the round resets.
const GRAVITY_SCALE = 0.00007

export function createWorld() {
  const engine = Matter.Engine.create()
  engine.gravity.scale = GRAVITY_SCALE

  const ballStart = toPhysics(BALL_START)
  const ball = Matter.Bodies.circle(ballStart.x, ballStart.y, BALL_RADIUS * PHYSICS_SCALE, {
    restitution: 0.4,
    friction: 0.02,
    frictionAir: 0.001,
    label: 'ball',
  })

  // Sized to match the *visual* hole (HOLE_RADIUS), not the ball — the ball
  // should visibly be inside the drawn hole before it counts as scored.
  const leftHolePos = toPhysics(LEFT_HOLE)
  const rightHolePos = toPhysics(RIGHT_HOLE)
  const leftHole = Matter.Bodies.circle(leftHolePos.x, leftHolePos.y, HOLE_RADIUS * PHYSICS_SCALE, {
    isStatic: true,
    isSensor: true,
    label: 'hole:left',
  })
  const rightHole = Matter.Bodies.circle(rightHolePos.x, rightHolePos.y, HOLE_RADIUS * PHYSICS_SCALE, {
    isStatic: true,
    isSensor: true,
    label: 'hole:right',
  })

  // Side walls only — the bottom is handled as a plain y-position check
  // (see ObstacleDropGame's miss detection) rather than a physical body,
  // since a "miss" needs to reset the ball rather than bounce it.
  const leftWall = Matter.Bodies.rectangle(-WALL_THICKNESS / 2, PHYSICS_SCALE / 2, WALL_THICKNESS, PHYSICS_SCALE * 4, {
    isStatic: true,
  })
  const rightWall = Matter.Bodies.rectangle(
    PHYSICS_SCALE + WALL_THICKNESS / 2,
    PHYSICS_SCALE / 2,
    WALL_THICKNESS,
    PHYSICS_SCALE * 4,
    { isStatic: true },
  )

  Matter.Composite.add(engine.world, [ball, leftHole, rightHole, leftWall, rightWall])

  return { engine, ball, leftHole, rightHole }
}

export function resetBall(ball) {
  const start = toPhysics(BALL_START)
  Matter.Body.setPosition(ball, start)
  Matter.Body.setVelocity(ball, { x: 0, y: 0 })
  Matter.Body.setAngularVelocity(ball, 0)
}

// One static rectangle segment per consecutive point pair in each run — the
// standard "chain of thin rectangles" technique for a freeform Matter.js
// obstacle, since Matter has no native arbitrary-polyline body type.
export function buildObstacleBodies(runs) {
  const thickness = OBSTACLE_THICKNESS * PHYSICS_SCALE
  const bodies = []
  for (const run of runs) {
    for (let i = 0; i < run.length - 1; i++) {
      const a = toPhysics(run[i])
      const b = toPhysics(run[i + 1])
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      if (length < 1) continue
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      bodies.push(
        Matter.Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, length, thickness, {
          isStatic: true,
          angle,
          friction: 0.05,
          restitution: 0.3,
          label: 'obstacle',
        }),
      )
    }
  }
  return bodies
}
