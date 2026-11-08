// Crates: blocks the players can push. They are solid like a tile, so you can stand on one (climb), and:
//   - a crate resting on a pressure plate holds it down (weight)
//   - a crate covering a lever, a key or a crystal hides it: it cannot be used until the crate is pushed away (reveal)
//   - a crate blocks fire, lasers, arrows, boulders and spikes like a wall
//
// A crate always sits in one grid cell, which keeps the rules simple and the puzzles readable:
//   push    walk into a crate on the ground for a moment and it slides one cell (and goes on sliding while you keep pushing)
//           if the cell beyond is free. It will not move with someone standing on it or in the way, and it will not go
//           through a door, into the cells right next to a door or the exit, or onto a lever, key or crystal (so it can never
//           wall anyone in; but it MAY start on top of one, hiding it until it is pushed off).
//   fall    a crate with nothing under it falls until it lands. Out of the room it is lost and comes back where it started.
//   solid   a crate in the middle of a slide or a fall counts as filling both cells it is between.
//
// Level JSON: "crates": [{ "id"?, "x", "y" }]  (the cell it starts in; it must be empty floor-side air)
import { CRATES } from './config.js'
import { isSolid } from './levels.js'
import { collapseSolid } from './traps.js'

const EPS = 1e-6

export function createCrates(level) {
  return (level.objects.crates || []).map((c, i) => {
    if (isSolid(level, c.x, c.y)) throw new Error(`Level "${level.name}": crate "${c.id || i}" starts inside a solid tile`)
    return { id: c.id || `crate-${i}`, x: c.x, y: c.y, home: { x: c.x, y: c.y }, mode: 'idle', dx: 0, t: 0, fy: c.y, vy: 0, push: { who: null, dir: 0, t: 0 }, away: 0 }
  })
}

/** Cells a crate fills right now (two while it slides or falls). */
export function crateCells(c) {
  if (c.mode === 'lost') return []
  const cells = [[c.x, c.y]]
  if (c.mode === 'slide') cells.push([c.x + c.dx, c.y])
  if (c.mode === 'fall' && c.fy > c.y + EPS) cells.push([c.x, c.y + 1])
  return cells
}

/** Is a crate in this cell? (for solidity) */
export function crateSolid(game, tx, ty) {
  for (const c of game.crates || []) {
    if (c.mode === 'lost') continue
    if (c.x === tx && c.y === ty && !(c.mode === 'slide' && c.t >= 0.45)) return true // (halfway across, the cell it is leaving opens up, so a pusher can follow it)
    if (c.mode === 'slide' && c.x + c.dx === tx && c.y === ty) return true
    if (c.mode === 'fall' && c.fy > c.y + EPS && c.x === tx && c.y + 1 === ty) return true
  }
  return false
}

/** Does a crate hide whatever is in this cell? (levers, keys, crystals) */
export function crateCovers(game, tx, ty) {
  return crateSolid(game, tx, ty)
}

/** Is a crate resting on this plate? */
export function crateOnPlate(game, plate) {
  for (const c of game.crates || []) {
    if (c.mode === 'lost' || c.mode === 'fall') continue
    if (c.y === plate.y && c.x >= plate.x && c.x < plate.x + (plate.w || 1)) return true
  }
  return false
}

// the cells a crate may not be pushed into: doors, and the cells right beside a door, lever, key or the exit
function keepClear(game) {
  if (game._crateClear) return game._crateClear
  const set = new Set()
  const add = (x, y, w, h, pad) => {
    for (let ty = y; ty < y + h; ty++) for (let tx = x - pad; tx < x + w + pad; tx++) set.add(`${tx},${ty}`)
  }
  for (const d of game.doors.doors) add(d.x, d.y, 1, d.h, 1)
  for (const s of game.doors.switches) add(s.x, s.y, 1, 1, 0) // (a crate may START on a lever, key or crystal to hide it, but cannot be pushed onto one)
  for (const k of game.doors.keys) add(k.home.x, k.home.y, 1, 1, 0)
  if (game.doors.exit) add(game.doors.exit.x, game.doors.exit.y, game.doors.exit.w, game.doors.exit.h, 2)
  for (const c of game.level.objects.crystals) add(c.x, c.y, 1, 1, 0)
  for (const z of game.level.objects.crateKeepClear || []) add(z.x, z.y, z.w || 1, z.h || 1, 0)
  game._crateClear = set
  return set
}

const playerBoxHitsCell = (p, tx, ty) =>
  p.x + p.w / 2 > tx + EPS && p.x - p.w / 2 < tx + 1 - EPS && p.y - p.h < ty + 1 - EPS && p.y > ty + EPS

function cellFree(game, tx, ty, self, { ignorePlayers = false } = {}) {
  if (tx < 1 || tx >= game.level.cols - 1 || ty < 0) return false
  if (ty >= game.level.rows) return true // the open pit below the room
  if (isSolid(game.level, tx, ty) || collapseSolid(game.traps, tx, ty)) return false
  for (const d of game.doors.doors) if (d.x === tx && ty >= d.y && ty < d.y + d.h) return false
  for (const c of game.crates) if (c !== self && c.mode !== 'lost' && crateCells(c).some(([x, y]) => x === tx && y === ty)) return false
  if (!ignorePlayers && game.players.some((p) => playerBoxHitsCell(p, tx, ty))) return false
  return true
}

function supported(game, c) {
  if (c.y + 1 >= game.level.rows) return false
  const below = c.y + 1
  if (isSolid(game.level, c.x, below) || collapseSolid(game.traps, c.x, below)) return true
  return game.crates.some((o) => o !== c && o.mode === 'idle' && o.x === c.x && o.y === below)
}

const someoneOnTop = (game, c) => game.players.some((p) => p.grav > 0 && p.onGround && Math.abs(p.y - c.y) < 0.1 && p.x + p.w / 2 > c.x + EPS && p.x - p.w / 2 < c.x + 1 - EPS)

export function updateCrates(game, inputs, dt) {
  const half = (p) => p.w / 2
  const clear = keepClear(game)
  for (const c of game.crates) {
    if (c.mode === 'lost') {
      c.away += dt
      if (c.away >= CRATES.RESPAWN && cellFree(game, c.home.x, c.home.y, c)) {
        Object.assign(c, { x: c.home.x, y: c.home.y, fy: c.home.y, vy: 0, mode: 'idle', dx: 0, t: 0, away: 0 })
      }
      continue
    }
    if (c.mode === 'slide') {
      c.t += dt / CRATES.SLIDE_TIME
      if (c.t >= 1) {
        c.x += c.dx
        c.mode = 'idle'
        c.dx = 0
        c.t = 0
      }
      continue
    }
    if (c.mode === 'fall') {
      c.vy = Math.min(CRATES.MAX_FALL, c.vy + CRATES.GRAVITY * dt)
      c.fy += c.vy * dt
      while (c.fy >= c.y + 1) {
        if (cellFree(game, c.x, c.y + 1, c)) c.y++
        else {
          c.fy = c.y
          c.vy = 0
          c.mode = 'idle'
          break
        }
        if (c.y > game.level.rows + 2) {
          c.mode = 'lost'
          c.away = 0
          break
        }
      }
      if (c.mode === 'fall' && supported(game, c) && c.fy >= c.y) {
        c.fy = c.y
        c.vy = 0
        c.mode = 'idle'
      }
      continue
    }
    // idle
    if (!supported(game, c)) {
      c.mode = 'fall'
      c.fy = c.y
      c.vy = 0
      continue
    }
    // pushed by someone walking into it
    let pushing = null
    game.players.forEach((p, i) => {
      if (pushing || p.grav < 0 || !p.onGround || p.carrying || p.carriedBy) return
      const dir = (inputs[i].right ? 1 : 0) - (inputs[i].left ? 1 : 0)
      if (dir === 0 || Math.abs(p.y - (c.y + 1)) > 0.12) return
      const touching = dir > 0 ? p.x + half(p) >= c.x - 0.08 && p.x < c.x + 0.2 : p.x - half(p) <= c.x + 1.08 && p.x > c.x + 0.8
      if (touching) pushing = { who: p.id, dir }
    })
    if (!pushing || pushing.dir !== c.push.dir || pushing.who !== c.push.who) c.push = { who: pushing?.who || null, dir: pushing?.dir || 0, t: 0 }
    else c.push.t += dt
    if (pushing && c.push.t >= CRATES.PUSH_DELAY) {
      const nx = c.x + pushing.dir
      if (!someoneOnTop(game, c) && cellFree(game, nx, c.y, c) && !clear.has(`${nx},${c.y}`)) {
        c.mode = 'slide'
        c.dx = pushing.dir
        c.t = 0
        c.push = { who: pushing.who, dir: pushing.dir, t: CRATES.PUSH_DELAY } // (keep pushing: the next cell follows without another wait)
      }
    }
  }
}
