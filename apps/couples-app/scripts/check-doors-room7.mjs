// Headless playthrough of room 7 (gravity): two scripted players flip onto the ceiling, cross
// the wall, work the ceiling plate, cross the pit, and walk out of the exit up on the ceiling:
//   node scripts/check-doors-room7.mjs
import fs from 'node:fs'
import { createGame, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { SIM } from '../src/doors/config.js'

const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false }
const json = JSON.parse(fs.readFileSync(new URL('../src/doors/levels/room-7-gravity.json', import.meta.url), 'utf8'))
const g = createGame(parseLevel(json))
const [B, P] = g.players
const door = (id) => g.doors.doors.find((d) => d.id === id)
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}
// walk toward world-x `x`; upside down, "right" on the keyboard is world-left, so the keys are swapped
const drive = (x, { tol = 0.2, autoJump = true } = {}) => (p) => {
  const dx = (x - p.x) * p.grav
  if (Math.abs(dx) < tol) return {}
  const blocked = autoJump && p.onGround && Math.abs(p.vx) < 0.3 && Math.abs(dx) > 0.5
  return { right: dx > 0, left: dx < 0, jump: blocked || (!p.onGround && p.vy * p.grav < 0) }
}
const idle = () => ({})
function until(limit, cond, blue = idle, pink = idle) {
  for (let f = 0; f < limit; f++) {
    if (cond()) return true
    stepGame(g, [{ ...none, ...blue(B, f) }, { ...none, ...pink(P, f) }], SIM.STEP)
  }
  return cond()
}
const onCeiling = (p) => p.grav < 0 && p.onGround && Math.abs(p.y - 4) < 0.05
const onFloor = (p) => p.grav > 0 && p.onGround && Math.abs(p.y - 18) < 0.05

// ---- A: the wall --------------------------------------------------------------------------
until(400, () => P.grav < 0 && B.grav < 0 && onCeiling(P), drive(24), drive(24))
until(300, () => onCeiling(B) && onCeiling(P), drive(24), drive(24.5))
check('A: both were flipped onto the ceiling by the gravity door', onCeiling(B) && onCeiling(P), `blue grav ${B.grav}, pink grav ${P.grav}`)
until(600, () => P.x > 30 && B.x > 28, drive(29), drive(31))
check('A: ...and walked past the wall that blocks the floor', B.x > 28 && P.x > 30 && B.deaths + P.deaths === 0, `blue ${B.x.toFixed(1)}, pink ${P.x.toFixed(1)}`)

// ---- B: the ceiling plate -------------------------------------------------------------------
// Blue holds the plate (x=34.5); Pink walks on, drops down through the "down" door and goes through the plate door
until(500, () => B.x > 34.2 && B.x < 34.8 && P.x > 36, drive(34.5, { tol: 0.1 }), drive(36.5))
until(100, () => door('plate-door').open, drive(34.5, { tol: 0.1 }), drive(36.5))
check('B: standing on the ceiling plate opens the floor door', door('plate-door').open && g.doors.plates[0].held)
until(600, () => P.grav > 0 && P.x > 45, drive(34.5, { tol: 0.1 }), drive(46))
check('B: Pink dropped to the floor and went through the open door', P.grav > 0 && P.x > 45, `pink x=${P.x.toFixed(1)} grav ${P.grav}`)
// Blue lets go, walks along the ceiling to the "down" door, drops and runs to the door before it shuts
until(900, () => B.x > 45 && B.grav > 0, drive(46), drive(48))
check('B: Blue followed in time (the plate holds the door open for 5s)', B.x > 45 && B.grav > 0, `blue x=${B.x.toFixed(1)}`)
until(300, () => onFloor(B) && onFloor(P), drive(49), drive(50.5))

// ---- C: the pit, crossed on the ceiling ----------------------------------------------------
until(500, () => B.grav < 0 && P.grav < 0 && onCeiling(P) && onCeiling(B), drive(55), drive(56))
check('C: both flipped up at the pit', onCeiling(B) && onCeiling(P))
until(600, () => P.onGround && Math.abs(P.x - 58.5) < 0.2 && B.x > 56.5, drive(57), drive(58.5, { tol: 0.1 }))
check('C: the ceiling flag was picked up', g.traps.checkpoints[0].reached.pink)
// jump the hanging block (x=62..64), wait in the gap before the jet's beam (x=66..70), dash across as it goes out
const tc = () => ((g.traps.time % 3) + 3) % 3
until(900, () => P.x > 65 && B.x > 64.2, drive(64.5), drive(65.2))
until(900, () => tc() > 1.0 && tc() < 1.2, drive(64.5, { autoJump: false }), drive(65.2, { autoJump: false }))
until(400, () => P.x > 71.5 && B.x > 70.8, drive(71), drive(72))
check('C: both got across the pit, past the block and the jet', B.x > 70 && P.x > 70 && B.deaths + P.deaths === 0, `blue ${B.x.toFixed(1)}, pink ${P.x.toFixed(1)}, deaths ${B.deaths + P.deaths}`)
until(500, () => onFloor(B) && onFloor(P) && B.x > 74 && P.x > 74.5, drive(76), drive(77))
check('C: the second flip door put them back on the floor', onFloor(B) && onFloor(P))

// ---- D: up to the ceiling, flip the switch, walk out -----------------------------------------
until(500, () => onCeiling(B) && onCeiling(P), drive(83), drive(85))
until(400, () => P.x > 84.2 && B.x > 82, drive(83), drive(85))
until(100, () => g.doors.switches[0].on, idle, (p, f) => ({ ...drive(84.5, { tol: 0.1 })(p), interact: Math.abs(p.x - 84.5) < 0.3 }))
check('D: the switch hanging from the ceiling opens the last door', g.doors.switches[0].on && door('final').open)
until(900, () => g.complete, drive(93), drive(93.3))
check('both players reach the exit on the ceiling', g.complete, `blue ${B.x.toFixed(1)} y ${B.y.toFixed(1)}, pink ${P.x.toFixed(1)} y ${P.y.toFixed(1)}; deaths ${B.deaths + P.deaths}`)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nRoom 7 checks passed')
process.exit(failures ? 1 : 0)
