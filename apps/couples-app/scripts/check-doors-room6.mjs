// Headless playthrough of room 6 (the door gallery): two scripted players clear every gate
// — key, flip, linked, one-way, swap, random, portal — and reach the exit:
//   node scripts/check-doors-room6.mjs
import fs from 'node:fs'
import { createGame, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { SIM } from '../src/doors/config.js'

const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false }
const json = JSON.parse(fs.readFileSync(new URL('../src/doors/levels/room-6-doors-gallery.json', import.meta.url), 'utf8'))
const g = createGame(parseLevel(json))
const [B, P] = g.players
const door = (id) => g.doors.doors.find((d) => d.id === id)
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

// A "driver" decides one player's input each frame: walk toward x, jumping when something blocks the way.
const drive = (x, { tol = 0.2, jumpAt = null, autoJump = true } = {}) => (p) => {
  const dx = x - p.x
  if (Math.abs(dx) < tol) return {}
  const blocked = autoJump && p.onGround && Math.abs(p.vx) < 0.3 && Math.abs(dx) > 0.5
  return { right: dx > 0, left: dx < 0, jump: blocked || (!p.onGround && p.vy < 0) || (jumpAt !== null && p.onGround && Math.abs(p.x - jumpAt) < 0.3) }
}
const idle = () => ({})
// advance until cond() (or the frame limit), each player driven by its function
function until(limit, cond, blue = idle, pink = idle) {
  for (let f = 0; f < limit; f++) {
    if (cond()) return true
    stepGame(g, [{ ...none, ...blue(B, f) }, { ...none, ...pink(P, f) }], SIM.STEP)
  }
  return cond()
}
const at = (p, x, tol = 0.4) => () => Math.abs(p.x - x) < tol

// Pink spawns to Blue's right, so she leads and Blue follows.
// ---- gate 1: key -------------------------------------------------------------------------
until(600, () => P.x > 17, idle, drive(18))
check('gate 1: Pink picked up the key on top of the hurdle', g.doors.keys[0].holder === 'pink' || g.doors.keys[0].used)
until(600, () => door('key-door').open, idle, drive(24))
check('gate 1: the key door opened for the key holder', door('key-door').open)
until(900, () => P.x > 27.4 && B.x > 25.5, drive(26.5), drive(27.5))

// ---- gate 2: flip ------------------------------------------------------------------------
// Both climb to the upper level; Pink drops down the shaft, Blue waits at the top.
until(600, () => P.y < 14.1 && P.x > 28.6, idle, drive(28.8))
until(600, () => B.y < 14.1 && B.x > 27.4, drive(27.8), idle)
check('gate 2: both are on the upper level', B.y < 14.1 && P.y < 14.1, `blue y=${B.y.toFixed(1)}, pink y=${P.y.toFixed(1)}`)
until(400, () => P.y > 16.9 && P.x > 30, idle, drive(36, { autoJump: false }))
check('gate 2: Pink dropped down the shaft into the lower corridor', P.y > 16.9, `pink y=${P.y.toFixed(1)}`)
check('gate 2: the upper flip door starts shut', !door('F2').open)
until(500, () => P.x > 44.5, idle, drive(46))
until(30, () => false)
check('gate 2: Pink passing the lower door shut it behind her and opened the upper one', !door('F1').open && door('F2').open)
// Pink walks out of the corridor's far end; Blue crosses the shaft gap, walks along the top and drops off its end
until(900, () => P.x > 55.5, drive(50, { jumpAt: 29.6 }), drive(56))
check('gate 2: Pink came out of the lower corridor', P.x > 55 && P.y > 17.9, `pink x=${P.x.toFixed(1)}`)
until(600, () => B.x > 46, drive(52, { jumpAt: 29.6 }), idle)
check('gate 2: Blue came through the opened upper door', B.x > 45 && B.y < 14.1, `blue x=${B.x.toFixed(1)}`)
until(700, () => P.x > 60, drive(52), drive(61))
until(700, () => B.x > 58 && B.y > 17.9, drive(59, { autoJump: false }), drive(61))

// ---- gate 3: linked ---------------------------------------------------------------------
// Blue holds the plate; Pink waits at the first door, goes through when it opens; Blue lets go and runs in.
until(500, () => B.x > 62.2 && B.x < 62.9 && P.x > 64.5, drive(62.5, { tol: 0.1 }), drive(65.2))
until(300, () => door('see').open, drive(62.5, { tol: 0.1 }), drive(65.2))
check('gate 3: standing on the plate opens the first door and shuts its see-saw partner', door('see').open && !door('saw').open)
until(900, () => P.x > 70, drive(62.5, { tol: 0.1 }), drive(71))
until(300, () => B.x > 68, drive(70), drive(71))
check('gate 3: Blue got through the first door in time', B.x > 67, `blue x=${B.x.toFixed(1)}`)
until(600, () => door('saw').open, drive(70), drive(71.5))
check('gate 3: the see-saw door opened once the first had shut', door('saw').open && !door('see').open)
until(900, () => P.x > 78 && B.x > 76.5, drive(77), drive(79))

// ---- gate 4: one-way ---------------------------------------------------------------------
until(900, () => P.x > 83 && B.x > 81.5, drive(82.5), drive(84))
check('gate 4: both are through the one-way door', B.x > 81 && P.x > 82)
until(120, () => false, drive(70), idle)
check('gate 4: ...and Blue can’t get back through it', B.x > 81, `blue x=${B.x.toFixed(1)}`)
until(300, () => B.x > 81.5, drive(82.5), idle)

// ---- gate 5: swap ------------------------------------------------------------------------
until(900, () => P.x > 92 && door('swap').color === 'blue', drive(86), drive(92.5))
check('gate 5: Pink passed, so the swap door is now Blue’s', door('swap').color === 'blue')
until(900, () => B.x > 91.5, drive(92.5), idle)
check('gate 5: Blue passed too', B.x > 91)

// ---- gate 6: random ----------------------------------------------------------------------
// wait at the door until it has just opened with a good while before the next roll, then both run through
until(1200, () => door('rand').open && door('rand').period - door('rand').timer > 1.6, drive(93), drive(94.5))
until(300, () => P.x > 98 && B.x > 97, drive(97.5), drive(99))
check('gate 6: both got through the random door', B.x > 96.5 && P.x > 97, `blue ${B.x.toFixed(1)}, pink ${P.x.toFixed(1)}`)

// ---- gate 7: portal ----------------------------------------------------------------------
until(500, () => P.x > 100 && B.x > 98, drive(99.5), drive(101))
until(900, () => P.x > 117 && P.onGround, idle, drive(120))
check('gate 7: Pink walked into the ring and came out beyond the pit', P.x > 117, `pink x=${P.x.toFixed(1)}`)
until(900, () => B.x > 117 && B.onGround, drive(120), idle)
check('gate 7: so did Blue', B.x > 117, `blue x=${B.x.toFixed(1)}`)

// ---- the exit ----------------------------------------------------------------------------
until(900, () => g.complete, drive(124.5), drive(125))
check('both players reach the exit', g.complete, `blue ${B.x.toFixed(1)}, pink ${P.x.toFixed(1)}; deaths ${B.deaths + P.deaths}`)
console.log(failures ? `\n${failures} check(s) FAILED` : '\nRoom 6 checks passed')
process.exit(failures ? 1 : 0)
