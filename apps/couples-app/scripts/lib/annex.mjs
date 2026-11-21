// Plays the "annex" every campaign room now ends with: long corridors (one per story, joined by drop shafts) full of
// hazards that are never switched off. A hazard run is timing, so the pilot LOOKS AHEAD: it clones the game, runs the
// next couple of seconds on the clone, and only walks on if the clone survives; otherwise it waits where it stands.
// (Everything it does is legal input: walk, jump, crouch.)
import { isSolid } from '../../src/doors/levels.js'
import { stepGame } from '../../src/doors/engine.js'
import { SIM } from '../../src/doors/config.js'
import { none } from './pilot.mjs'

// a deep copy of the game (functions, such as the random-number generator, are shared)
function clone(value, seen = new Map()) {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)
  let out
  if (ArrayBuffer.isView(value)) out = value.slice()
  else if (Array.isArray(value)) out = []
  else if (value instanceof Set) out = new Set()
  else if (value instanceof Map) out = new Map()
  else out = {}
  seen.set(value, out)
  if (value instanceof Set) for (const v of value) out.add(clone(v, seen))
  else if (value instanceof Map) for (const [k, v] of value) out.set(k, clone(v, seen))
  else if (!ArrayBuffer.isView(value)) for (const k of Object.keys(value)) out[k] = clone(value[k], seen)
  return out
}

// what one player does to reach `goalX`: walk, hop obstacles that block the feet, crouch inside the crawlspaces
function policy(g, p, goalX, crouchZones) {
  const dx = goalX - p.x
  if (Math.abs(dx) < 0.12) return {}
  const dir = Math.sign(dx)
  const ahead = Math.floor(p.x + dir * 0.55)
  const blocked = p.onGround && !p.crouching && isSolid(g.level, ahead, Math.floor(p.y - 0.3))
  // (the old room's last pit, before the annex: hop it at the lip; the annex's own drops are meant to be fallen down)
  const pit = p.onGround && p.x < g.level.annex.xa - 0.5 && !isSolid(g.level, ahead, Math.floor(p.y + 0.2)) && !isSolid(g.level, Math.floor(p.x + dir * 0.3), Math.floor(p.y + 0.2))
  const inZone = crouchZones.some(([a, b]) => p.x > a - 0.8 && p.x < b + 0.8)
  return { left: dir < 0, right: dir > 0, jump: blocked || pit || (!p.onGround && p.vy < 0), crouch: inZone && p.onGround }
}

// advance one player (index i) by `frames`: mode 'run' follows the policy, 'back' walks the other way, 'idle' stands
// still (the other player always stands still). Returns false if they died.
function run(g, i, goalX, zones, frames, mode = 'run') {
  const p = g.players[i]
  const before = p.deaths
  const back = p.x - Math.sign(goalX - p.x) * 40
  for (let f = 0; f < frames; f++) {
    const move = mode === 'idle' ? {} : policy(g, p, mode === 'back' ? back : goalX, zones)
    const inputs = [{ ...none }, { ...none }]
    inputs[i] = { ...none, ...move }
    stepGame(g, inputs, SIM.STEP)
    if (p.deaths > before) return false
  }
  return true
}

const LOOK = 150 // frames of look-ahead (2.5 s)
const STEP = 6 // frames committed per decision

// Takes one player through the whole annex to the exit. Returns { ok, frames, deaths }.
export function crossAnnex(g, who, annex, limit = 9000) {
  const i = g.players.findIndex((p) => p.id === who)
  const p = g.players[i]
  const deaths0 = p.deaths
  const exit = g.doors.exit
  let k = 0
  let frames = 0
  const story = () => annex.stories[k]
  while (frames < limit && !exit.through[i]) {
    // which story are we on? (we fell through a shaft: the next one)
    while (k < annex.stories.length - 1 && p.y > annex.stories[k].S + 3 && p.onGround) k++
    const s = story()
    const goal = k === annex.stories.length - 1 ? exit.x + exit.w / 2 : s.goal
    // look ahead: walk on if that survives the next 2.5 s; else stand still if that does; else back off; else walk on anyway
    let mode = 'run'
    if (!run(clone(g), i, goal, s.crouch, LOOK, 'run')) {
      if (run(clone(g), i, goal, s.crouch, LOOK, 'idle')) mode = 'idle'
      else if (run(clone(g), i, goal, s.crouch, LOOK, 'back')) mode = 'back'
    }
    const back = p.x - Math.sign(goal - p.x) * 40
    const act = () => (mode === 'idle' ? {} : policy(g, p, mode === 'back' ? back : goal, s.crouch))
    const inputs = [{ ...none }, { ...none }]
    for (let f = 0; f < STEP; f++) {
      inputs[i] = { ...none, ...act() }
      stepGame(g, inputs, SIM.STEP)
      frames++
      if (exit.through[i]) break
    }
  }
  // step well inside the doorway so that the partner has room to follow
  if (exit.through[i]) {
    const dir = annex.stories[annex.stories.length - 1].dir
    const far = dir > 0 ? exit.x + exit.w - 0.35 : exit.x + 0.35
    const inputs = [{ ...none }, { ...none }]
    for (let f = 0; f < 120 && Math.abs(p.x - far) > 0.1; f++) {
      inputs[i] = { ...none, left: p.x > far, right: p.x < far }
      stepGame(g, inputs, SIM.STEP)
    }
  }
  return { ok: exit.through[i], frames, deaths: p.deaths - deaths0 }
}

// Both players: the leader goes all the way to the exit first, then the follower.
export function playAnnex(d, check, label = 'annex') {
  const { g, lead, follow } = d
  const annex = g.level.annex
  const a = crossAnnex(g, lead.id, annex)
  check(`${label}: the leader crossed every story to the exit, no deaths`, a.ok && a.deaths === 0, `${(a.frames / 60).toFixed(1)}s, deaths ${a.deaths} (${lead.lastDeath})`)
  const b = crossAnnex(g, follow.id, annex)
  check(`${label}: ...and so did the follower`, b.ok && b.deaths === 0, `${(b.frames / 60).toFixed(1)}s, deaths ${b.deaths} (${follow.lastDeath})`)
  return a.ok && b.ok
}
