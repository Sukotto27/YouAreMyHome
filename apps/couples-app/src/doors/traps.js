// Traps: fire jets, lasers, arrow walls, falling spikes, collapsing floors and
// rolling boulders — plus the checkpoints that make dying survivable. Like the
// doors they are plain data driven by the level JSON, and every number that
// matters is a parameter. They run inside the fixed-step simulation (no
// randomness, no DOM), so they are deterministic and testable headless.
//
// THE RULE: drawn lines are solid to every hazard, whoever drew them. A line
// stops a flame, a laser, an arrow, a falling spike and a boulder, so a line can
// shield someone — including a frozen drawer.
//
// Level JSON ("traps": [...]; x,y are world coordinates in tiles, y down):
//   { "id", "type": "fire" | "laser", "x", "y", "dir": "up"|"down"|"left"|"right",
//     "length", "thickness"?, "period"?, "on"?, "offset"?, "telegraph"? }
//       a beam from (x,y): a pulsing fire jet, or a laser (always on unless
//       "period" is given). The beam stops at the first tile, line or closed door.
//   { "type": "arrow", "x", "y", "dir": "left"|"right", "period", "offset"?,
//     "speed"?, "range"?, "telegraph"? }       fires arrows along a row
//   { "type": "spikes", "x", "y", "trigger"?, "lead"?, "warn"?, "rest"?, "reset"? }
//       hangs at (x,y); falls when someone walks under it
//   { "type": "collapse", "x", "y", "w", "delay", "respawn" }
//       w floor tiles at row y that give way "delay" seconds after you step on
//       them and come back "respawn" seconds later
//   { "type": "boulder", "x", "y", "dir": -1|1, "speed"?, "radius"?, "period",
//     "offset"? }                               rolls out of (x,y) every period
//   { "type": "crusher", "x", "y", "w", "h", "dir"?: "down"|"up"|"left"|"right",
//     "travel"?, "rest"?, "warn"?, "hold"?, "speed"?, "rise"?, "offset"? }
//       a block whose resting box is the w x h tiles at (x,y) (leave those cells
//       empty); it shakes, slams "travel" tiles along dir, holds, and rises again.
//       A drawn line, a tile or a closed door stops it short: a line under a
//       crusher is a prop that keeps the space below safe.
//   { "type": "blade", "x", "y", "length", "amplitude"?, "period"?, "offset"?, "radius"? }
//       a pendulum hung from the pivot (x,y); amplitude is degrees either side of
//       straight down. A drawn line in its swing stops the blade dead.
//   { "type": "wind", "x", "y", "dir", "length", "width", "speed"?, "period"?, "on"?,
//     "offset"?, "telegraph"? }
//       a fan at (x,y) blowing a "width"-wide stream "length" tiles along dir.
//       Sideways it adds "speed" tiles/s to whoever is in it; up it lifts, down it
//       slams. Harmless by itself: it pushes you into other things. A drawn line
//       cuts the stream off, so everything behind it is calm.
//   { "type": "trapdoor", "x", "y", "w", "delay"?, "open"?, "startOpen"?, "closeWhen"? }
//       a floor that gives way under the first person to stand on it, drops them, and then SEALS shut
//       for good (it never reopens): how the tutorial room splits the pair across two levels.
//   Any hazard may also say "offWhile": "plateId": while that plate is held it is switched off
//       (jets, lasers and wind go out, arrows stop, crushers wait, spikes and boulders don't trigger, collapsing floors
//       hold, blades go harmless).
//       It may name a lever instead: the hazard is then off for good once the lever is flipped.
// "checkpoints": [{ "id", "x", "y" }]  a flag standing in cell (x,y); touching it
//   makes that player respawn there from now on.
import { TRAPS } from './config.js'
import { isSolid } from './levels.js'
import { crateSolid } from './crates.js'
import { bodyBottom, bodyCenter, bodyTop } from './gravity.js'

const TYPES = new Set(['fire', 'laser', 'arrow', 'spikes', 'collapse', 'boulder', 'crusher', 'blade', 'wind', 'trapdoor'])
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const EPS = 1e-6

function fail(level, message) {
  throw new Error(`Level "${level.name}": ${message}`)
}

export function createTrapSystem(level) {
  const traps = (level.objects.traps || []).map((d, index) => {
    if (!TYPES.has(d.type)) fail(level, `trap "${d.id || index}" has unknown type "${d.type}"`)
    const trap = { ...d, id: d.id || `${d.type}-${index}` }
    switch (d.type) {
      case 'fire':
      case 'laser': {
        if (!DIRS[d.dir]) fail(level, `trap "${trap.id}" needs a dir of up/down/left/right`)
        Object.assign(trap, {
          thickness: d.thickness ?? (d.type === 'fire' ? TRAPS.FIRE_THICKNESS : TRAPS.LASER_THICKNESS),
          length: d.length ?? 12,
          telegraph: d.telegraph ?? TRAPS.TELEGRAPH,
          on: d.on ?? 1.2,
          offset: d.offset ?? 0,
          phase: d.period || d.type === 'fire' ? 'off' : 'on',
          beam: null, // { x0, y0, x1, y1 } while on
        })
        if (d.type === 'fire' && !d.period) fail(level, `fire trap "${trap.id}" needs a period`)
        break
      }
      case 'arrow':
        if (d.dir !== 'left' && d.dir !== 'right') fail(level, `arrow trap "${trap.id}" needs dir left or right`)
        Object.assign(trap, {
          offset: d.offset ?? 0,
          speed: d.speed ?? TRAPS.ARROW_SPEED,
          range: d.range ?? 12,
          telegraph: d.telegraph ?? TRAPS.TELEGRAPH,
          arrows: [],
          lastShot: -1,
          phase: 'idle',
        })
        break
      case 'spikes':
        Object.assign(trap, {
          trigger: d.trigger ?? 1.0,
          lead: d.lead ?? true,
          warn: d.warn ?? TRAPS.SPIKE_WARN,
          rest: d.rest ?? 1.5,
          reset: d.reset ?? 2.5,
          mode: 'armed',
          t: 0,
          cy: d.y, // current centre y
          vy: 0,
        })
        break
      case 'collapse': {
        for (let i = 0; i < d.w; i++) {
          if (isSolid(level, d.x + i, d.y)) fail(level, `collapsing floor "${trap.id}" overlaps a solid tile (leave those cells empty in the grid)`)
        }
        Object.assign(trap, { delay: d.delay ?? 0.6, respawn: d.respawn ?? 5, mode: 'solid', t: 0 })
        break
      }
      case 'trapdoor': {
        for (let i = 0; i < d.w; i++) {
          if (isSolid(level, d.x + i, d.y)) fail(level, `trapdoor "${trap.id}" overlaps a solid tile (leave those cells empty in the grid)`)
        }
        // "startOpen": it begins open (a gap) and "closeWhen": "leverId" closes it for good when that lever is flipped (a drawbridge)
        Object.assign(trap, { delay: d.delay ?? 0.3, openTime: d.open ?? 1.4, mode: d.startOpen ? 'open' : 'closed', startOpen: !!d.startOpen, closeWhen: d.closeWhen || null, t: 0 })
        break
      }
      case 'boulder':
        Object.assign(trap, {
          speed: d.speed ?? 3,
          radius: d.radius ?? TRAPS.BOULDER_RADIUS,
          offset: d.offset ?? 0,
          lastSpawn: -1,
          boulders: [],
        })
        break
      case 'crusher': {
        const dir = d.dir || 'down'
        if (!DIRS[dir]) fail(level, `crusher "${trap.id}" needs a dir of up/down/left/right`)
        if (!(d.w > 0 && d.h > 0)) fail(level, `crusher "${trap.id}" needs a w and h`)
        Object.assign(trap, {
          dir,
          travel: d.travel ?? 30,
          rest: d.rest ?? TRAPS.CRUSHER_REST,
          warn: d.warn ?? TRAPS.CRUSHER_WARN,
          hold: d.hold ?? TRAPS.CRUSHER_HOLD,
          speed: d.speed ?? TRAPS.CRUSHER_SPEED,
          rise: d.rise ?? TRAPS.CRUSHER_RISE,
          mode: 'rest',
          t: -(d.offset ?? 0), // the opening wait is rest + offset
          dist: 0, // how far it has moved out of its resting box
        })
        break
      }
      case 'blade':
        if (!(d.length > 0)) fail(level, `blade "${trap.id}" needs a length`)
        Object.assign(trap, {
          amplitude: ((d.amplitude ?? 60) * Math.PI) / 180,
          period: d.period ?? 3,
          offset: d.offset ?? 0,
          radius: d.radius ?? TRAPS.BLADE_RADIUS,
          ang: 0, // where the blade really is (a line can hold it back from where it "wants" to be)
          cx: d.x,
          cy: d.y + d.length,
        })
        break
      case 'wind':
        if (!DIRS[d.dir]) fail(level, `wind "${trap.id}" needs a dir of up/down/left/right`)
        Object.assign(trap, {
          thickness: d.width ?? 3, // the stream's width (shares the beam geometry)
          length: d.length ?? 10,
          speed: d.speed ?? TRAPS.WIND_SPEED,
          telegraph: d.telegraph ?? TRAPS.TELEGRAPH,
          on: d.on ?? 2.5,
          offset: d.offset ?? 0,
          phase: 'on',
          beam: null, // the stream's centre line while blowing
        })
        break
      default:
    }
    return trap
  })

  const checkpoints = (level.objects.checkpoints || []).map((c, i) => ({
    id: c.id || `checkpoint-${i}`,
    x: c.x,
    y: c.y,
    ceiling: !!c.ceiling, // a flag hanging from the ceiling, for flipped players
    reached: { blue: false, pink: false },
  }))
  return { traps, checkpoints, time: 0 }
}

// ---------------------------------------------------------------------------
// What stops a hazard: tiles, intact collapsing floors, closed doors and — the
// point of the whole mechanic — drawn lines of either player.
// ---------------------------------------------------------------------------
const doorCell = (game, tx, ty) => game.doors.doors.some((d) => !d.open && tx === d.x && ty >= d.y && ty < d.y + d.h)

// Is this tile cell occupied by an intact collapsing floor?
// (`player`, when given, is who is asking: an open trapdoor only drops whoever triggered it; to anyone else
// it stays a floor, so exactly one of a pair falls even if they walk onto it together)
export function collapseSolid(system, tx, ty, player = null) {
  for (const trap of system.traps) {
    if (trap.type === 'trapdoor') {
      const open = trap.mode === 'open' && (!player || !trap.victim || player.id === trap.victim)
      if (!open && ty === trap.y && tx >= trap.x && tx < trap.x + trap.w) return true
      continue
    }
    if (trap.type !== 'collapse' || trap.mode === 'gone') continue
    if (ty === trap.y && tx >= trap.x && tx < trap.x + trap.w) return true
  }
  return false
}

function makeBlocker(game) {
  const sys = game.traps
  const level = game.level
  const bricks = []
  const segments = [] // the same lines as smooth capsules (what a rolling boulder collides with)
  for (const line of game.lines) {
    for (const r of line.rects) bricks.push(r)
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1]
      const b = line.points[i]
      segments.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, r: TRAPS.LINE_RADIUS })
    }
  }
  const cellSolid = (tx, ty) => isSolid(level, tx, ty) || collapseSolid(sys, tx, ty) || doorCell(game, tx, ty) || crateSolid(game, tx, ty)
  const pointBlocked = (x, y) => {
    if (cellSolid(Math.floor(x), Math.floor(y))) return true
    for (const b of bricks) if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return true
    return false
  }
  const rectBlocked = (x0, y0, x1, y1) => {
    for (let ty = Math.floor(y0); ty <= Math.floor(y1 - EPS); ty++) {
      for (let tx = Math.floor(x0); tx <= Math.floor(x1 - EPS); tx++) if (cellSolid(tx, ty)) return true
    }
    for (const b of bricks) if (x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0) return true
    return false
  }
  // does a circle overlap a solid tile, door or drawn-line brick?
  const circleBlocked = (cx, cy, r) => {
    const touches = (x0, y0, x1, y1) => Math.hypot(cx - Math.max(x0, Math.min(cx, x1)), cy - Math.max(y0, Math.min(cy, y1))) < r
    for (let ty = Math.floor(cy - r); ty <= Math.floor(cy + r); ty++) {
      for (let tx = Math.floor(cx - r); tx <= Math.floor(cx + r); tx++) if (cellSolid(tx, ty) && touches(tx, ty, tx + 1, ty + 1)) return true
    }
    for (const b of bricks) if (touches(b.x0, b.y0, b.x1, b.y1)) return true
    return false
  }
  return { bricks, segments, cellSolid, pointBlocked, rectBlocked, circleBlocked }
}

const overlaps = (p, x0, y0, x1, y1) => p.x + p.w / 2 > x0 && p.x - p.w / 2 < x1 && bodyBottom(p) > y0 && bodyTop(p) < y1

// ---------------------------------------------------------------------------
// beams (fire jets, lasers)
// ---------------------------------------------------------------------------
function beamPhase(trap, time) {
  if (!trap.period) return 'on'
  const tc = (((time - trap.offset) % trap.period) + trap.period) % trap.period
  if (tc < trap.on) return 'on'
  if (tc >= trap.period - trap.telegraph) return 'warn'
  return 'off'
}

function castBeam(trap, blocker) {
  const [dx, dy] = DIRS[trap.dir]
  const step = 0.05
  let travelled = 0
  while (travelled < trap.length) {
    if (blocker.pointBlocked(trap.x + dx * (travelled + step), trap.y + dy * (travelled + step))) break
    travelled += step
  }
  return { x0: trap.x, y0: trap.y, x1: trap.x + dx * travelled, y1: trap.y + dy * travelled }
}

function beamRect(trap) {
  const b = trap.beam
  const half = trap.thickness / 2
  const horizontal = trap.dir === 'left' || trap.dir === 'right'
  return horizontal
    ? [Math.min(b.x0, b.x1), trap.y - half, Math.max(b.x0, b.x1), trap.y + half]
    : [trap.x - half, Math.min(b.y0, b.y1), trap.x + half, Math.max(b.y0, b.y1)]
}

// ---------------------------------------------------------------------------
// boulders: a circle against axis-aligned boxes (tiles and line bricks)
// ---------------------------------------------------------------------------
// Solid tile cells in a region, merged into as few boxes as possible: runs along
// each row, then identical runs stacked on top of each other.
function mergedTileBoxes(cellSolid, x0, x1, y0, y1) {
  const runs = []
  for (let ty = y0; ty <= y1; ty++) {
    let tx = x0
    while (tx <= x1) {
      if (cellSolid(tx, ty)) {
        let end = tx
        while (end + 1 <= x1 && cellSolid(end + 1, ty)) end++
        runs.push({ x0: tx, x1: end + 1, y0: ty, y1: ty + 1 })
        tx = end + 1
      } else tx++
    }
  }
  runs.sort((a, b) => a.x0 - b.x0 || a.x1 - b.x1 || a.y0 - b.y0)
  const out = []
  for (const run of runs) {
    const last = out[out.length - 1]
    if (last && last.x0 === run.x0 && last.x1 === run.x1 && last.y1 === run.y0) last.y1 = run.y1
    else out.push({ ...run })
  }
  return out
}

function stepBoulder(b, radius, blocker, dt) {
  const SUB = 2
  const h = dt / SUB
  for (let s = 0; s < SUB; s++) {
    b.vy += TRAPS.BOULDER_GRAVITY * h
    b.x += b.vx * h
    b.y += b.vy * h
    // nearby tiles as MERGED boxes (so the seam between two floor tiles can't kick the boulder),
    // and nearby drawn lines as smooth capsules
    const boxes = mergedTileBoxes(
      blocker.cellSolid,
      Math.floor(b.x - radius - 1),
      Math.floor(b.x + radius + 1),
      Math.floor(b.y - radius - 1),
      Math.floor(b.y + radius + 1),
    )
    const near = blocker.segments.filter(
      (s) =>
        Math.max(s.x0, s.x1) + s.r > b.x - radius - 0.1 &&
        Math.min(s.x0, s.x1) - s.r < b.x + radius + 0.1 &&
        Math.max(s.y0, s.y1) + s.r > b.y - radius - 0.1 &&
        Math.min(s.y0, s.y1) - s.r < b.y + radius + 0.1,
    )
    for (let pass = 0; pass < 2; pass++) {
      for (const s of near) {
        const sx = s.x1 - s.x0
        const sy = s.y1 - s.y0
        const len2 = sx * sx + sy * sy
        const t = len2 ? Math.max(0, Math.min(1, ((b.x - s.x0) * sx + (b.y - s.y0) * sy) / len2)) : 0
        let dx = b.x - (s.x0 + sx * t)
        let dy = b.y - (s.y0 + sy * t)
        const dist = Math.hypot(dx, dy)
        const reach = radius + s.r
        if (dist >= reach) continue
        if (dist < 1e-6) {
          const len = Math.sqrt(len2) || 1
          dx = -sy / len
          dy = sx / len
          if (dy > 0) {
            dx = -dx
            dy = -dy
          }
        } else {
          dx /= dist
          dy /= dist
        }
        b.x += dx * (reach - dist)
        b.y += dy * (reach - dist)
        const vn = b.vx * dx + b.vy * dy
        if (vn < 0) {
          b.vx -= (1 + TRAPS.BOULDER_BOUNCE) * vn * dx
          b.vy -= (1 + TRAPS.BOULDER_BOUNCE) * vn * dy
        }
      }
      for (const r of boxes) {
        const nx = Math.max(r.x0, Math.min(b.x, r.x1))
        const ny = Math.max(r.y0, Math.min(b.y, r.y1))
        let dx = b.x - nx
        let dy = b.y - ny
        let dist = Math.hypot(dx, dy)
        if (dist >= radius) continue
        if (dist < 1e-6) {
          // centre inside the box: shove out along the shallowest axis
          const left = b.x - r.x0
          const right = r.x1 - b.x
          const up = b.y - r.y0
          const down = r.y1 - b.y
          const m = Math.min(left, right, up, down)
          dx = m === left ? -1 : m === right ? 1 : 0
          dy = m === up ? -1 : m === down ? 1 : 0
          dist = 0
          b.x += dx * (m + radius)
          b.y += dy * (m + radius)
        } else {
          dx /= dist
          dy /= dist
          b.x += dx * (radius - dist)
          b.y += dy * (radius - dist)
        }
        const vn = b.vx * dx + b.vy * dy
        if (vn < 0) {
          b.vx -= (1 + TRAPS.BOULDER_BOUNCE) * vn * dx
          b.vy -= (1 + TRAPS.BOULDER_BOUNCE) * vn * dy
        }
      }
    }
    // a little rolling drag so it eventually settles
    const drag = Math.max(0, 1 - TRAPS.BOULDER_DRAG * h)
    b.vx *= drag
    b.ang += (b.vx * h) / radius
  }
}

// the box a crusher currently occupies
export function crusherBox(trap, dist = trap.dist) {
  const [dx, dy] = DIRS[trap.dir]
  return [trap.x + dx * dist, trap.y + dy * dist, trap.x + trap.w + dx * dist, trap.y + trap.h + dy * dist]
}

// where a pendulum's blade is for a given swing angle (0 = hanging straight down)
export function bladePos(trap, ang) {
  return { x: trap.x + Math.sin(ang) * trap.length, y: trap.y + Math.cos(ang) * trap.length }
}

const circleHitsPlayer = (p, cx, cy, r) =>
  Math.hypot(cx - Math.max(p.x - p.w / 2, Math.min(cx, p.x + p.w / 2)), cy - Math.max(bodyTop(p), Math.min(cy, bodyBottom(p)))) < r

// ---------------------------------------------------------------------------
// the per-step update
// ---------------------------------------------------------------------------
// kill(player, trapId) is supplied by the engine (it respawns the player)
export function updateTraps(game, dt, kill) {
  const sys = game.traps
  sys.time += dt
  const { time } = sys
  const blocker = makeBlocker(game)
  for (const p of game.players) p.push = { vx: 0, ay: 0, capUp: 0 } // wind below re-applies it
  const live = game.players.filter((p) => !(p.invuln > 0))
  const hit = (p, trap) => {
    if (p.invuln > 0 || trap.off) return // (a trap switched off by a plate is harmless)
    kill(p, trap.id)
  }
  // a hazard's "offWhile" names a plate (off while held) or a lever (off for good once flipped)
  const plateHeld = (id) => game.doors.plates.some((pl) => pl.id === id && pl.held) || game.doors.switches.some((sw) => sw.id === id && sw.on)

  for (const trap of sys.traps) {
    trap.off = !!trap.offWhile && [].concat(trap.offWhile).some(plateHeld)
    switch (trap.type) {
      case 'fire':
      case 'laser': {
        if (trap.off) {
          trap.phase = 'off'
          trap.beam = null
          break
        }
        trap.phase = beamPhase(trap, time)
        trap.beam = trap.phase === 'on' ? castBeam(trap, blocker) : null
        if (trap.beam) {
          const [x0, y0, x1, y1] = beamRect(trap)
          for (const p of live) if (overlaps(p, x0, y0, x1, y1)) hit(p, trap)
        }
        break
      }
      case 'arrow': {
        if (trap.off) {
          trap.arrows = []
          trap.phase = 'idle'
          trap.lastShot = Math.floor((time - trap.offset) / trap.period)
          break
        }
        const tc = (((time - trap.offset) % trap.period) + trap.period) % trap.period
        trap.phase = time >= trap.offset && tc >= trap.period - trap.telegraph ? 'warn' : 'idle'
        const shot = Math.floor((time - trap.offset) / trap.period)
        if (time >= trap.offset && shot > trap.lastShot) {
          trap.lastShot = shot
          trap.arrows.push({ x: trap.x, y: trap.y, travelled: 0 })
        }
        const dir = trap.dir === 'right' ? 1 : -1
        const alive = []
        for (const arrow of trap.arrows) {
          const move = trap.speed * dt
          let stopped = false
          for (let d = 0.1; d <= move + 1e-9; d += 0.1) {
            if (blocker.pointBlocked(arrow.x + dir * d, arrow.y)) {
              stopped = true
              break
            }
          }
          if (!stopped && blocker.pointBlocked(arrow.x + dir * move, arrow.y)) stopped = true
          if (stopped) continue
          arrow.x += dir * move
          arrow.travelled += move
          if (arrow.travelled > trap.range) continue
          for (const p of live) if (overlaps(p, arrow.x - 0.35, arrow.y - 0.08, arrow.x + 0.35, arrow.y + 0.08)) hit(p, trap)
          alive.push(arrow)
        }
        trap.arrows = alive
        break
      }
      case 'spikes': {
        const halfW = 0.4
        const halfH = 0.45
        if (trap.mode === 'armed' && !trap.off) {
          for (const p of live) {
            if (bodyCenter(p) < trap.cy) continue // only people below it
            const fall = Math.sqrt((2 * Math.max(0, bodyCenter(p) - trap.cy)) / TRAPS.SPIKE_GRAVITY)
            const predicted = trap.lead ? p.x + p.vx * (trap.warn + fall) : p.x
            if (Math.abs(predicted - trap.x) < trap.trigger) {
              trap.mode = 'warn'
              trap.t = 0
              break
            }
          }
        } else if (trap.mode === 'warn') {
          trap.t += dt
          if (trap.t >= trap.warn) {
            trap.mode = 'falling'
            trap.vy = 0
            trap.t = 0
          }
        } else if (trap.mode === 'falling') {
          trap.vy = Math.min(TRAPS.SPIKE_MAX_SPEED, trap.vy + TRAPS.SPIKE_GRAVITY * dt)
          const next = trap.cy + trap.vy * dt
          if (blocker.rectBlocked(trap.x - halfW, next - halfH, trap.x + halfW, next + halfH)) {
            // stopped by a tile or a drawn line: rests on it, harmless
            trap.mode = 'landed'
            trap.t = 0
          } else {
            trap.cy = next
            for (const p of live) if (overlaps(p, trap.x - halfW, trap.cy - halfH, trap.x + halfW, trap.cy + halfH)) hit(p, trap)
          }
        } else if (trap.mode === 'landed') {
          // spikes standing on the floor are as deadly as falling ones: nobody wades through them
          for (const p of live) if (overlaps(p, trap.x - halfW, trap.cy - halfH, trap.x + halfW, trap.cy + halfH)) hit(p, trap)
          trap.t += dt
          if (trap.t >= trap.rest) {
            trap.mode = 'resetting'
            trap.t = 0
          }
        } else if (trap.mode === 'resetting') {
          for (const p of live) if (overlaps(p, trap.x - halfW, trap.cy - halfH, trap.x + halfW, trap.cy + halfH)) hit(p, trap)
          trap.t += dt
          if (trap.t >= trap.reset) {
            trap.mode = 'armed'
            trap.cy = trap.y
            trap.vy = 0
            trap.t = 0
          }
        }
        break
      }
      case 'trapdoor': {
        const standingOn = (p) => p.onGround && Math.abs(p.y - (p.grav < 0 ? trap.y + 1 : trap.y)) < 0.06 && p.x > trap.x && p.x < trap.x + trap.w
        if (trap.mode === 'closed') {
          const first = game.players.find(standingOn)
          if (first) {
            trap.mode = 'warn'
            trap.victim = first.id // the one who stepped on it first is the one who falls
            trap.t = 0
          }
        } else if (trap.mode === 'warn') {
          trap.t += dt
          if (trap.t >= trap.delay) {
            trap.mode = 'open'
            trap.t = 0
          }
        } else if (trap.mode === 'open' && trap.closeWhen) {
          // a drawbridge: closes for good once its lever is flipped (and nobody is standing in the gap)
          const flipped = game.doors.switches.some((sw) => sw.id === trap.closeWhen && sw.on)
          if (flipped && !game.players.some((p) => overlaps(p, trap.x, trap.y, trap.x + trap.w, trap.y + 1))) trap.mode = 'sealed'
        } else if (trap.mode === 'open') {
          trap.t += dt
          // it shuts for good once whoever fell is clear of it
          const faller = game.players.find((p) => p.id === trap.victim)
          if (trap.t >= trap.openTime && !(faller && overlaps(faller, trap.x, trap.y, trap.x + trap.w, trap.y + 1))) {
            trap.mode = 'sealed'
            trap.t = 0
          }
        }
        break
      }
      case 'collapse': {
        const standing = (p) => p.onGround && Math.abs(p.y - (p.grav < 0 ? trap.y + 1 : trap.y)) < 0.06 && p.x + p.w / 2 > trap.x && p.x - p.w / 2 < trap.x + trap.w
        if (trap.mode === 'solid') {
          if (!trap.off && game.players.some(standing)) { // (held up while its plate is held)
            trap.mode = 'shaking'
            trap.t = 0
          }
        } else if (trap.mode === 'shaking') {
          trap.t += dt
          if (trap.t >= trap.delay) {
            trap.mode = 'gone'
            trap.t = 0
          }
        } else if (trap.mode === 'gone') {
          trap.t += dt
          const occupied = game.players.some((p) => overlaps(p, trap.x, trap.y, trap.x + trap.w, trap.y + 1))
          if (trap.t >= trap.respawn && !occupied) {
            trap.mode = 'solid'
            trap.t = 0
          }
        }
        break
      }
      case 'boulder': {
        const shot = Math.floor((time - trap.offset) / trap.period)
        // the boulders come out of a hole in the ceiling at (x, y); holding its plate (or flipping its lever) seals the hole:
        // nothing more comes out and the ones already rolling crumble away
        if (trap.off) trap.lastSpawn = shot
        if (!trap.off && time >= trap.offset && shot > trap.lastSpawn) {
          trap.lastSpawn = shot
          trap.boulders.push({ x: trap.x, y: trap.y, vx: (trap.dir || -1) * trap.speed, vy: 0, ang: 0, age: 0 })
          if (trap.boulders.length > 4) trap.boulders.shift()
        }
        const alive = []
        for (const b of trap.boulders) {
          if (trap.off) b.dying = (b.dying || 0) + dt
          if (b.dying > 0.4) continue
          b.age += dt
          stepBoulder(b, trap.radius, blocker, dt)
          if (b.y > game.level.rows + 8 || b.x < -4 || b.x > game.level.cols + 4 || b.age > TRAPS.BOULDER_LIFE) continue
          for (const p of live) {
            const nx = Math.max(p.x - p.w / 2, Math.min(b.x, p.x + p.w / 2))
            const ny = Math.max(bodyTop(p), Math.min(b.y, bodyBottom(p)))
            if (Math.hypot(b.x - nx, b.y - ny) < trap.radius * 0.92) hit(p, trap)
          }
          alive.push(b)
        }
        trap.boulders = alive
        break
      }
      case 'crusher': {
        if (trap.off && trap.mode === 'rest') {
          trap.t = 0 // waiting up in its slot while the plate is held
          break
        }
        trap.t += dt
        const blockedAt = (dist) => {
          const [bx0, by0, bx1, by1] = crusherBox(trap, dist)
          return blocker.rectBlocked(bx0, by0, bx1, by1)
        }
        if (trap.mode === 'rest') {
          if (trap.t >= trap.rest) {
            trap.mode = 'warn'
            trap.t = 0
          }
        } else if (trap.mode === 'warn') {
          if (trap.t >= trap.warn) {
            trap.mode = 'slam'
            trap.t = 0
          }
        } else if (trap.mode === 'slam') {
          // advance in small increments so it stops flush against whatever blocks it
          let remaining = trap.speed * dt
          while (remaining > 1e-9) {
            const inc = Math.min(0.05, remaining)
            if (trap.dist + inc > trap.travel + 1e-9 || blockedAt(trap.dist + inc)) {
              trap.mode = 'hold'
              trap.t = 0
              break
            }
            trap.dist += inc
            remaining -= inc
          }
          if (trap.mode === 'slam' && trap.dist >= trap.travel - 1e-9) {
            trap.mode = 'hold'
            trap.t = 0
          }
        } else if (trap.mode === 'hold') {
          if (trap.t >= trap.hold) {
            trap.mode = 'rise'
            trap.t = 0
          }
        } else if (trap.mode === 'rise') {
          trap.dist = Math.max(0, trap.dist - trap.rise * dt)
          if (trap.dist <= 0) {
            trap.mode = 'rest'
            trap.t = 0
          }
        }
        const [x0, y0, x1, y1] = crusherBox(trap)
        for (const p of live) if (overlaps(p, x0, y0, x1, y1)) hit(p, trap)
        break
      }
      case 'blade': {
        const target = trap.amplitude * Math.sin((2 * Math.PI * (time - trap.offset)) / trap.period)
        // sweep toward where the blade should be; a drawn line (or tile) in the way stops it
        const startedBlocked = blocker.circleBlocked(trap.cx, trap.cy, trap.radius)
        let a = trap.ang
        while (Math.abs(target - a) > 1e-9) {
          const next = a + Math.max(-TRAPS.BLADE_STEP, Math.min(TRAPS.BLADE_STEP, target - a))
          const to = bladePos(trap, next)
          if (!startedBlocked && blocker.circleBlocked(to.x, to.y, trap.radius)) break
          a = next
        }
        trap.ang = a
        const pos = bladePos(trap, a)
        trap.cx = pos.x
        trap.cy = pos.y
        for (const p of live) if (circleHitsPlayer(p, pos.x, pos.y, trap.radius * 0.92)) hit(p, trap)
        break
      }
      case 'wind': {
        if (trap.off) {
          trap.phase = 'off'
          trap.beam = null
          break
        }
        trap.phase = beamPhase(trap, time)
        trap.beam = trap.phase === 'on' ? castBeam(trap, blocker) : null
        if (trap.beam) {
          const [x0, y0, x1, y1] = beamRect(trap)
          for (const p of game.players) {
            if (!overlaps(p, x0, y0, x1, y1)) continue
            if (trap.dir === 'left') p.push.vx -= trap.speed
            else if (trap.dir === 'right') p.push.vx += trap.speed
            else if (trap.dir === 'up') {
              p.push.ay -= TRAPS.WIND_LIFT
              p.push.capUp = TRAPS.WIND_LIFT_CAP
            } else p.push.ay += TRAPS.WIND_DOWN
          }
        }
        break
      }
      default:
    }
  }
}

// Touching a checkpoint's flag makes that player respawn there from now on.
export function updateCheckpoints(game) {
  for (const cp of game.traps.checkpoints) {
    for (const p of game.players) {
      if (cp.reached[p.id]) continue
      const feet = cp.ceiling ? cp.y : cp.y + 1 // where the feet are when standing at the flag
      if (p.onGround && (p.grav < 0) === cp.ceiling && Math.abs(p.x - (cp.x + 0.5)) < 0.8 && Math.abs(p.y - feet) < 0.2) {
        cp.reached[p.id] = true
        p.spawn = { x: cp.x + 0.5, y: feet, grav: cp.ceiling ? -1 : 1 }
      }
    }
  }
}

export function trapDebugLines(system) {
  const lines = []
  for (const t of system.traps) {
    let detail = ''
    if (t.type === 'fire' || t.type === 'laser') detail = t.phase
    else if (t.type === 'arrow') detail = `${t.phase}, ${t.arrows.length} in flight`
    else if (t.type === 'spikes') detail = t.mode
    else if (t.type === 'collapse' || t.type === 'trapdoor') detail = `${t.mode} ${t.t.toFixed(1)}s`
    else if (t.type === 'boulder') detail = `${t.boulders.length} rolling`
    else if (t.type === 'crusher') detail = `${t.mode} out ${t.dist.toFixed(1)}`
    else if (t.type === 'blade') detail = `angle ${((t.ang * 180) / Math.PI).toFixed(0)}deg`
    else if (t.type === 'wind') detail = t.phase
    lines.push(`trap ${t.id.padEnd(12)} ${t.type.padEnd(8)} ${detail}`)
  }
  for (const c of system.checkpoints) lines.push(`checkpoint ${c.id}: blue ${c.reached.blue ? 'yes' : '-'} pink ${c.reached.pink ? 'yes' : '-'}`)
  return lines
}
