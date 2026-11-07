// Headless playthrough of room 9 (abilities playground): Blue crosses the wall and the gap with the
// level 3 jumps, then teleports to Pink in the sealed chamber and they leave by the exit:
//   node scripts/check-doors-room9.mjs
import fs from 'node:fs'
import { createGame, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { SIM } from '../src/doors/config.js'

const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false, teleport: false, cycle: false }
const json = JSON.parse(fs.readFileSync(new URL('../src/doors/levels/room-9-abilities.json', import.meta.url), 'utf8'))
const g = createGame(parseLevel(json))
const [B, P] = g.players
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}
check('everyone starts with every ability at level 3', [B, P].every((p) => p.abilities.solidLight === 3 && p.abilities.jumpBoost === 3 && p.abilities.teleport === 3))
check('Pink starts sealed in the chamber', P.x > 62 && P.x < 70)

// Blue's driver: run right; jump at obstacles; in the air, tap jump again near the top of each jump (holding
// right, so the extra jumps go diagonally) while extra jumps remain
let frame = 0
function blueInput() {
  frame++
  const p = B
  let jump = false
  if (p.onGround) {
    const blocked = Math.abs(p.vx) < 0.3 // pressing into the wall
    const gapLip = p.x > 22.9 && p.x < 24 // the lip of the gap
    jump = blocked || gapLip
  } else if (p.vy < 0) {
    jump = true // keep the jump button down while rising (releasing it would cut the jump short)
  } else if (p.airJumps > 0) {
    jump = frame % 2 === 0 // falling with jumps left: tap (the engine wants a fresh press)
  }
  return { ...none, right: true, jump }
}
let death = null
for (let f = 0; f < 60 * 25 && B.x < 58; f++) {
  const d = B.deaths
  stepGame(g, [blueInput(), none], SIM.STEP)
  if (B.deaths > d) death = `died at x=${B.x.toFixed(1)} (${B.lastDeath})`
}
check('Blue got past the wall and across the gap with the extra jumps', B.x >= 58 && B.deaths === 0, death || `x=${B.x.toFixed(1)}, deaths ${B.deaths}`)

// teleport to Pink (the default action), then both walk to the exit
stepGame(g, [{ ...none, teleport: true }, none], SIM.STEP)
check('Blue teleported into the sealed chamber', B.x > 61.5 && B.x < 71, `x=${B.x.toFixed(1)}`)
for (let f = 0; f < 60 * 8 && !g.complete; f++) {
  const dir = (p, x) => ({ ...none, right: x - p.x > 0.2, left: x - p.x < -0.2 })
  stepGame(g, [dir(B, 67.4), dir(P, 66.4)], SIM.STEP)
}
check('both reach the exit', g.complete, `blue ${B.x.toFixed(1)}, pink ${P.x.toFixed(1)}`)
console.log(failures ? `\n${failures} check(s) FAILED` : '\nRoom 9 checks passed')
process.exit(failures ? 1 : 0)
