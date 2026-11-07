// Headless playthrough of room 10 (echo and rope): an echo holds the plate while both pass; Blue swings
// across the first pit; retrieves the key from the island with the rope; swings across the last pit and
// pulls Pink over with the rope; then both leave:
//   node scripts/check-doors-room10.mjs
import fs from 'node:fs'
import { createGame, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { fireRope } from '../src/doors/rope.js'
import { SIM } from '../src/doors/config.js'

const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false, teleport: false, cycle: false, echo: false, rope: false }
const json = JSON.parse(fs.readFileSync(new URL('../src/doors/levels/room-10-echo-rope.json', import.meta.url), 'utf8'))
const fresh = () => createGame(parseLevel(json))
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}
const drive = (x, { tol = 0.2, autoJump = true } = {}) => (p) => {
  const dx = x - p.x
  if (Math.abs(dx) < tol) return {}
  const blocked = autoJump && p.onGround && Math.abs(p.vx) < 0.3 && Math.abs(dx) > 0.5
  return { right: dx > 0, left: dx < 0, jump: blocked || (!p.onGround && p.vy < 0) }
}
const idle = () => ({})
function runner(g) {
  const [B, P] = g.players
  return (limit, cond, blue = idle, pink = idle) => {
    for (let f = 0; f < limit; f++) {
      if (cond()) return true
      stepGame(g, [{ ...none, ...blue(B, f) }, { ...none, ...pink(P, f) }], SIM.STEP)
    }
    return cond()
  }
}

// ---- 1. the echo holds the plate ---------------------------------------------------------
{
  const g = fresh()
  const [B, P] = g.players
  const until = runner(g)
  check('the plate door starts shut', !g.doors.doors[0].open)
  until(400, () => Math.abs(B.x - 14.5) < 0.15, drive(14.5, { tol: 0.1 }), idle)
  // (Pink is to Blue's right, in the way: Blue goes first by waiting for Pink to move on)
  until(60, () => false, drive(14.5, { tol: 0.1 }), idle)
  stepGame(g, [{ ...none, echo: true }, none], SIM.STEP)
  check('Blue casts an echo on the plate', g.echoes.length === 1 && Math.abs(g.echoes[0].x - B.x) < 0.01)
  until(60, () => false, idle, idle)
  until(900, () => B.x > 26 && P.x > 25, drive(27), drive(26))
  check('the echo holds the door open while both walk through', B.x > 26 && P.x > 25 && g.doors.plates[0].held, `blue ${B.x.toFixed(1)}, pink ${P.x.toFixed(1)}`)
}

// ---- 2. swing across a pit (brute force over the moment of letting go) -------------------------
function swingAcross(lipX, anchorX, farX) {
  let best = null
  let wins = 0
  for (let release = 10; release <= 170; release += 2) {
    const g = fresh()
    const [B] = g.players
    B.x = lipX
    B.y = 18
    B.vx = B.vy = 0
    B.onGround = true
    stepGame(g, [{ ...none, rope: true }, none], SIM.STEP)
    const type = fireRope(g, B, { x: anchorX, y: 4.2 })
    if (type !== 'solid') return { error: `rope caught ${type}` }
    stepGame(g, [none, none], SIM.STEP)
    let f = 0
    for (; f < 60 * 8; f++) {
      const jump = f === release
      stepGame(g, [{ ...none, right: true, jump }, none], SIM.STEP)
      if (B.deaths) break
      if (f > release && B.onGround && B.x > farX) break
    }
    if (!B.deaths && B.onGround && B.x > farX && B.y > 17.9) {
      wins++
      if (!best) best = { release, x: B.x }
    }
  }
  if (best) best.wins = wins // how many of the release moments tried (every 2 frames) worked
  return best
}
{
  const r = swingAcross(35.4, 42, 48.2)
  check('Blue can swing across the first pit (step off, swing, let go), with a comfortable window to let go in', r && !r.error && r.wins >= 6, r ? JSON.stringify(r) : 'no release time worked')
  const r2 = swingAcross(81.4, 88, 94.2)
  check('...and across the last one', r2 && !r2.error && r2.wins >= 6, r2 ? JSON.stringify(r2) : 'no release time worked')
}

// ---- 3. the key from the island -----------------------------------------------------------------
{
  const g = fresh()
  const [B] = g.players
  B.x = 55
  B.y = 18
  B.onGround = true
  const until = runner(g)
  stepGame(g, [{ ...none, rope: true }, none], SIM.STEP)
  const type = fireRope(g, B, { x: 61.5, y: 17.5 })
  check('Blue ropes the key on the island', type === 'key', String(type))
  until(200, () => g.doors.keys[0].holder === 'blue', (p) => ({ crouch: true }), idle)
  check('...and reels it in', g.doors.keys[0].holder === 'blue')
  B.x = 70 // (across the pit: by swinging, a quadruple jump or a teleport)
  until(300, () => g.doors.doors[1].open, drive(71.2), idle)
  check('...the key opens its door', g.doors.doors[1].open)
}

// ---- 4. pulling Pink across ---------------------------------------------------------------------
{
  const g = fresh()
  const [B, P] = g.players
  B.x = 95.5
  B.y = 18
  B.onGround = true
  P.x = 82 - 0.6
  P.y = 18
  P.onGround = true
  const until = runner(g)
  stepGame(g, [{ ...none, rope: true }, none], SIM.STEP)
  const type = fireRope(g, B, { x: P.x, y: 17 })
  check('Blue ropes Pink across the pit', type === 'partner', String(type))
  until(240, () => B.rope.mode === 'idle', (p) => ({ crouch: true }), idle)
  until(120, () => P.onGround, idle, idle)
  check('...and reels her in: she flies over the pit and lands beside him', P.x > 94.5 && P.onGround && P.deaths === 0, `pink x=${P.x.toFixed(1)}, deaths ${P.deaths}`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nRoom 10 checks passed')
process.exit(failures ? 1 : 0)
