import { weightFor } from './tree'

// Deterministic per-id "randomness" — jitter is stable across re-renders (no
// flicker) but still varies branch to branch, since it's seeded from each
// event's own id rather than Math.random().
function seedFromString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return h
}

function mulberry32(seed) {
  let s = seed | 0
  return function next() {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function jitter(id, range) {
  const rand = mulberry32(seedFromString(id))()
  return (rand - 0.5) * 2 * range
}

// angleDeg: 0 = straight up, positive = toward +x (right), matching how
// FEATURE_ANGLE below reads ("+" branches lean right, "-" lean left).
function endpoint(x, y, angleDeg, length) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: x + Math.sin(rad) * length, y: y - Math.cos(rad) * length }
}

// A single quadratic-bezier branch: slightly curved rather than a straight
// line, for the organic look — the control point is offset from the
// straight-line midpoint so the curve bows toward `bow` (+/-, small).
function branchPath(x0, y0, angleDeg, length, bow) {
  const { x: x1, y: y1 } = endpoint(x0, y0, angleDeg, length)
  const mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
  const control = endpoint(mid.x, mid.y, angleDeg + 90, bow * length)
  return { d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`, end: { x: x1, y: y1 } }
}

const BRANCH_LEN = { 1: 14, 2: 20, 3: 28, 4: 38 }
const BRANCH_WIDTH = { 1: 1.4, 2: 2, 3: 2.8, 4: 3.6 }
const SIBLING_DECAY = 0.93 // keeps a long run of same-year interactions from sprawling forever
const CHILD_SCALE = 0.6 // twigs (comments) are smaller than the interaction they're replying to

// Chronologically chains `events` into branches: the first sprouts from
// (x, y) at `baseAngle`, and each next one continues from the previous
// branch's tip rather than forking from the same point — reads as
// continuous growth over the section rather than one starburst. Each
// event's own `children` (comments) recurse the same way, smaller, off that
// event's tip. Returns a flat list of render-ready branches.
export function layoutEvents(x, y, baseAngle, events, depth = 0, scale = 1) {
  const results = []
  let originX = x
  let originY = y
  let originAngle = baseAngle

  events.forEach((event, i) => {
    const weight = weightFor(event.feature, event.kind)
    const side = i % 2 === 0 ? 1 : -1
    const spread = (16 + jitter(`${event.id}-spread`, 9)) * side
    const angle = originAngle + spread
    const decay = SIBLING_DECAY ** i
    const length = (BRANCH_LEN[weight] ?? BRANCH_LEN[2]) * scale * decay
    const width = (BRANCH_WIDTH[weight] ?? BRANCH_WIDTH[2]) * scale
    const bow = 0.22 + jitter(`${event.id}-bow`, 0.12)
    const { d, end } = branchPath(originX, originY, angle, length, bow)

    results.push({ event, d, end, angle, depth, width, weight })

    if (event.children?.length) {
      results.push(...layoutEvents(end.x, end.y, angle, event.children, depth + 1, scale * CHILD_SCALE))
    }

    originX = end.x
    originY = end.y
    originAngle = angle
  })

  return results
}

export { jitter, endpoint, branchPath }
