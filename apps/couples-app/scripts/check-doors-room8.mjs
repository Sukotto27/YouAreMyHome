// Headless playthrough of room 8 (crystals): the pair help each other to both crystals, then leave:
//   node scripts/check-doors-room8.mjs
import fs from 'node:fs'
import { createGame, exportAbilities, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { SIM } from '../src/doors/config.js'

const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false, teleport: false, cycle: false }
const json = JSON.parse(fs.readFileSync(new URL('../src/doors/levels/room-8-crystals.json', import.meta.url), 'utf8'))
const g = createGame(parseLevel(json))
const [B, P] = g.players
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
function until(limit, cond, blue = idle, pink = idle) {
  for (let f = 0; f < limit; f++) {
    if (cond()) return true
    stepGame(g, [{ ...none, ...blue(B, f) }, { ...none, ...pink(P, f) }], SIM.STEP)
  }
  return cond()
}

check('both players start with no abilities', Object.values(B.abilities).every((v) => v === 0) && Object.values(P.abilities).every((v) => v === 0))
// Pink (the leader) stands just left of the slab; Blue hops onto her head and jumps up onto the slab
until(400, () => Math.abs(P.x - 19.3) < 0.15, idle, drive(19.3))
until(300, () => B.carriedBy === 'pink', (p) => {
  const dx = P.x - p.x
  return p.onGround ? { right: dx > 0.2, jump: dx > 2.4 && dx < 3.4 } : { right: dx > 0.15, jump: p.vy < 0 }
})
check('Blue is riding on Pink’s shoulders', B.carriedBy === 'pink')
let risen = false
until(120, () => B.onGround && B.y < 14.5 && B.x > 20, (p, f) => {
  if (p.y < 14.2) risen = true
  return { jump: f < 30, right: risen }
})
check('Blue jumped up onto the slab', B.onGround && B.y < 14.5 && B.x > 20, `blue at (${B.x.toFixed(1)}, ${B.y.toFixed(1)})`)
until(200, () => g.crystals[0].taken, drive(21.5, { tol: 0.1 }))
check('Blue took his crystal: Jump Boost I', g.crystals[0].taken && B.abilities.jumpBoost === 1)
check('...and Pink could not have', P.abilities.jumpBoost === 0)

// Blue walks off the slab and stands on the plate; Pink goes through the tunnel and takes hers
until(600, () => Math.abs(B.x - 34.5) < 0.2 && B.onGround && B.y > 17.9, drive(34.5, { tol: 0.1, autoJump: false }), idle)
until(300, () => g.doors.doors[0].open, drive(34.5, { tol: 0.1, autoJump: false }), drive(37))
check('the plate opens the tunnel door', g.doors.doors[0].open)
until(600, () => g.crystals[1].taken, drive(34.5, { tol: 0.1 }), drive(44.5, { tol: 0.1 }))
check('Pink took hers: Solid Light I', g.crystals[1].taken && P.abilities.solidLight === 1)
until(300, () => P.x > 49, idle, drive(50))
until(900, () => B.x > 49, drive(50), drive(52))
check('Blue followed through before the door shut', B.x > 49, `blue x=${B.x.toFixed(1)}`)
until(900, () => g.complete, drive(56.4), drive(57.2))
check('both reach the exit', g.complete)
const carried = exportAbilities(g)
check('their abilities can be carried to the next room', carried.blue.jumpBoost === 1 && carried.pink.solidLight === 1)
const next = createGame(parseLevel(json), carried)
check('...and arrive with them', next.players[0].abilities.jumpBoost === 1 && next.players[1].abilities.solidLight === 1)
console.log(failures ? `\n${failures} check(s) FAILED` : '\nRoom 8 checks passed')
process.exit(failures ? 1 : 0)
