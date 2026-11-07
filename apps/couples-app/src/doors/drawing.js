// The co-op drawing mechanic. A player enters draw mode (while standing on the
// ground) and draws ONE line with the mouse, anywhere in either view. The line
// is solid ONLY to the other player; the drawer is frozen in place until it
// vanishes. All the numbers (lifetime, ink, cooldown) live in config.js.
//
// A player's `draw.mode` moves through:
//   idle -> aiming      pressed the draw key; frozen, waiting for the mouse
//   aiming -> idle      pressed the draw key again: cancelled, no cooldown
//   aiming -> drawing   mouse down: ink is being spent
//   drawing -> active   mouse up: the line exists (solid to the partner) and
//                       its lifetime starts; the drawer stays frozen
//   active -> idle      the line expired: cooldown starts, drawer is free
//
// Pure data and functions (the mouse handling lives in index.js, which feeds
// world-space points in), so all of it can be tested headless.
import { ABILITY, DRAW } from './config.js'

const FROZEN = new Set(['aiming', 'drawing', 'active'])

export function initDraw() {
  return { mode: 'idle', cooldown: 0 }
}

export function initDrawingState() {
  return { lines: [], stroke: null, nextLineId: 1 }
}

export const isFrozen = (player) => FROZEN.has(player.draw.mode)

// What a player's Solid Light can do right now (null while they have not found it).
export const solidLightParams = (player) => ABILITY.SOLID_LIGHT[Math.min(ABILITY.MAX_LEVEL, player.abilities?.solidLight || 0)]

// Solid Light 3: the line stays until its caster chooses to move.
export function releaseOnMove(game, player, input) {
  if (player.draw.mode !== 'active' || !(input.left || input.right || input.jump || input.crouch)) return
  for (const line of game.lines) if (line.owner === player.id && !line.stone && line.life === Infinity) line.released = true
}

// There is one mouse: only one player can be aiming or drawing at a time.
const mouseBusy = (game, except) =>
  game.players.some((p) => p !== except && (p.draw.mode === 'aiming' || p.draw.mode === 'drawing' || p.rope?.mode === 'aiming'))

// While drawing, the caster turns toward the line and extends an arm at it (view3d.js): where they point.
export function setAim(player, x, y) {
  player.aim = { x, y }
  if (Math.abs(x - player.x) > 0.3) player.facing = x > player.x ? 1 : -1
}

// The draw key. Returns true if it did something.
export function toggleDraw(game, player) {
  const d = player.draw
  if (d.mode === 'aiming') {
    d.mode = 'idle' // changed their mind: no line, no cooldown
    return true
  }
  if (d.mode !== 'idle') return false
  if (!solidLightParams(player) || d.cooldown > 0 || !player.onGround || mouseBusy(game, player)) return false
  if (player.rope?.mode === 'aiming') player.rope.mode = 'idle' // (one mouse: drawing takes over from aiming a rope)
  d.mode = 'aiming'
  return true
}

// Mouse down (world-space point, in tiles).
export function beginStroke(game, player, x, y) {
  if (player.draw.mode !== 'aiming') return false
  player.draw.mode = 'drawing'
  setAim(player, x, y)
  game.stroke = { owner: player.id, points: [{ x, y }], length: 0 }
  return true
}

// Mouse move while the button is down. The line stops growing once the ink is
// used up (the last segment is clipped to what's left).
export function extendStroke(game, player, x, y) {
  const stroke = game.stroke
  if (!stroke || stroke.owner !== player.id) return
  const last = stroke.points[stroke.points.length - 1]
  const dx = x - last.x
  const dy = y - last.y
  let dist = Math.hypot(dx, dy)
  if (dist < DRAW.MIN_POINT_SPACING) return
  const remaining = solidLightParams(player).ink - stroke.length
  if (remaining <= 1e-6) return
  if (dist > remaining) {
    x = last.x + (dx / dist) * remaining
    y = last.y + (dy / dist) * remaining
    dist = remaining
  }
  stroke.points.push({ x, y })
  stroke.length += dist
  setAim(player, x, y)
}

// Mouse up: the line becomes real. A tiny scribble is discarded and the
// player goes back to aiming.
export function endStroke(game, player) {
  const stroke = game.stroke
  if (!stroke || stroke.owner !== player.id) return null
  game.stroke = null
  if (stroke.length < DRAW.MIN_LINE) {
    player.draw.mode = 'aiming'
    return null
  }
  const line = {
    id: game.nextLineId++,
    owner: player.id,
    points: stroke.points,
    length: stroke.length,
    rects: buildRects(stroke.points),
    age: 0,
    life: solidLightParams(player).life,
  }
  game.lines.push(line)
  player.draw.mode = 'active'
  return line
}

// Called every simulation step: ages lines, retires expired ones (freeing
// their drawer and starting the cooldown) and ticks the cooldowns.
export function updateDrawing(game, dt) {
  for (const player of game.players) {
    if (player.draw.cooldown > 0) player.draw.cooldown = Math.max(0, player.draw.cooldown - dt)
  }
  for (const line of game.lines) line.age += dt
  const alive = []
  for (const line of game.lines) {
    const owner = game.players.find((p) => p.id === line.owner)
    if (line.stone) {
      // a jump-boost stone: just fades away; it has nothing to do with the owner's drawing
      if (line.age < line.life) alive.push(line)
      continue
    }
    if (line.age < line.life && !line.released) {
      // (if its caster died the line goes too: they are no longer holding it)
      if (owner.draw.mode === 'active') alive.push(line)
      continue
    }
    owner.draw.mode = 'idle'
    owner.draw.cooldown = DRAW.DRAW_COOLDOWN
  }
  game.lines = alive
}

// A line becomes a chain of small square "bricks" along its path. The same
// axis-aligned collision used for tiles then works for any shape, and the
// engine's step-up lets players walk up gentle ramps made of them.
export function buildRects(points) {
  const half = DRAW.LINE_THICKNESS / 2
  const rects = []
  const add = (x, y) => rects.push({ x0: x - half, y0: y - half, x1: x + half, y1: y + half })
  add(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / DRAW.RECT_STEP))
    for (let k = 1; k <= steps; k++) add(a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps)
  }
  return rects
}

// The lines that are solid to `player`: everyone's but their own, and — so a
// line can never trap you when it appears on top of you — not any line that
// cuts through your body (it turns solid once you've stepped clear). Barely
// touching doesn't count as "through": feet just inside a line's top face are
// simply lifted onto it by the engine.
export function solidLinesFor(game, player, left, top, right, bottom) {
  const result = []
  for (const line of game.lines) {
    if (line.owner === player.id) continue
    let embedded = false
    for (const r of line.rects) {
      if (left + 0.04 < r.x1 && right - 0.04 > r.x0 && top + 0.14 < r.y1 && bottom - 0.14 > r.y0) {
        embedded = true
        break
      }
    }
    if (!embedded) result.push(line)
  }
  return result
}

export function drawDebugLines(game) {
  const lines = []
  for (const p of game.players) {
    const d = p.draw
    const extra = d.mode === 'idle' && d.cooldown > 0 ? ` cooldown ${d.cooldown.toFixed(1)}s` : ''
    lines.push(`draw ${p.id.padEnd(4)} ${d.mode}${extra}`)
  }
  if (game.stroke) lines.push(`stroke by ${game.stroke.owner}: ink ${game.stroke.length.toFixed(1)}/${DRAW.INK_MAX}`)
  for (const l of game.lines) {
    lines.push(`line #${l.id} (${l.owner}) ${l.length.toFixed(1)} tiles, ${Math.max(0, l.life - l.age).toFixed(1)}s left`)
  }
  return lines
}
