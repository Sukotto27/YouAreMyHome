// Headless playthrough of room 5 (shoulder carry): a scripted pair clears both walls
// and reaches the exit using only the carry and the chained boost:
//   node scripts/check-doors-room5.mjs
import fs from 'node:fs'
import { createGame, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { SIM } from '../src/doors/config.js'

const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false }
const json = JSON.parse(fs.readFileSync(new URL('../src/doors/levels/room-5-carry.json', import.meta.url), 'utf8'))
const g = createGame(parseLevel(json))
const [B, P] = g.players
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}
const run = (frames, fn) => {
  for (let f = 0; f < frames; f++) {
    const [bi, pi] = fn(f)
    stepGame(g, [{ ...none, ...bi }, { ...none, ...pi }], SIM.STEP)
  }
}
const until = (limit, cond, fn) => {
  for (let f = 0; f < limit; f++) {
    if (cond()) return true
    const [bi, pi] = fn(f)
    stepGame(g, [{ ...none, ...bi }, { ...none, ...pi }], SIM.STEP)
  }
  return cond()
}
const goTo = (who, x, tol = 0.15) => (who === B ? [B, P] : [P, B]) && (() => {
  const dir = x - who.x
  return Math.abs(dir) < tol ? {} : dir > 0 ? { right: true } : { left: true }
})

// C = the carrier, R = the rider. The carrier waits next to the wall; the rider runs up from the
// left and hops onto their head. The rider climbs onto the slab and flips the switch, the carrier
// walks through the opened door, and the rider steps off the far side.
function wall(leftX, switchX, switchId, chained, C, R) {
  const ci = (v) => (C === B ? [v, {}] : [{}, v])
  const ri = (v) => (R === B ? [v, {}] : [{}, v])
  const both = (cv, rv) => (C === B ? [cv, rv] : [rv, cv])
  until(400, () => Math.abs(C.x - (leftX - 0.9)) < 0.15, () => ci(goTo(C, leftX - 0.9)()))
  until(300, () => R.carriedBy === C.id, () => {
    const dx = C.x - R.x
    if (R.onGround) return ri({ right: dx > 0.2, jump: dx > 2.4 && dx < 3.4 })
    return ri({ right: dx > 0.15, jump: R.vy < 0 })
  })
  check(`wall @${leftX}: ${R.id} is riding ${C.id}`, R.carriedBy === C.id)
  if (!chained) run(40, (f) => ri({ right: true, jump: f < 30 }))
  else run(80, (f) => both({ jump: f < 40 }, { jump: f >= 4 && f < 34, right: f >= 4 && R.x < 36 }))
  check(`wall @${leftX}: ${R.id} is up on top`, R.onGround && R.y < 15 && R.x > leftX - 0.3, `at (${R.x.toFixed(1)}, ${R.y.toFixed(1)})`)
  until(300, () => Math.abs(R.x - switchX) < 0.5, () => ri(goTo(R, switchX, 0.2)()))
  run(3, (f) => ri({ interact: f === 1 }))
  check(`wall @${leftX}: the switch is on`, g.doors.switches.find((s) => s.id === switchId).on)
  until(600, () => C.x > leftX + 3.4, () => ci({ right: true }))
  check(`wall @${leftX}: ${C.id} came through the door`, C.x > leftX + 3.4, `x=${C.x.toFixed(1)}`)
  until(300, () => R.onGround && R.y > 17.9 && R.x > leftX + 2.5, () => ri({ right: true }))
}

wall(15, 16.5, 'sw-1', false, P, B)
// both walk on; Blue (ahead) is the carrier at the second wall
until(600, () => B.x > 33 && P.x > 25, () => [{ right: B.x < 34 }, { right: P.x < 27 }])
wall(35, 36.5, 'sw-2', true, B, P)
until(900, () => g.complete, () => [goTo(B, 51)(), goTo(P, 51)()].map((i) => i))
check('both players reach the exit', g.complete, `blue ${B.x.toFixed(1)}, pink ${P.x.toFixed(1)}`)
console.log(failures ? `\n${failures} check(s) FAILED` : '\nRoom 5 checks passed')
process.exit(failures ? 1 : 0)
