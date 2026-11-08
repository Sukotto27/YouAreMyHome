// Scripted playthrough of chapter 1, room 3 (First Light):
//   node scripts/check-doors-ch1-03.mjs
import { loadRoom, makeChecker, none } from './lib/pilot.mjs'
import { duo, holdCross } from './lib/routines.mjs'
import { beginStroke, endStroke, extendStroke } from '../src/doors/drawing.js'
import { stepGame } from '../src/doors/engine.js'
import { SIM } from '../src/doors/config.js'

const { check, finish } = makeChecker()
const g = loadRoom('ch1-03-first-light')
const d = duo(g)
const { lead: P, follow: B, go, drive, step } = d
const door = (id) => g.doors.doors.find((x) => x.id === id)
const sw = (id) => g.doors.switches.find((s) => s.id === id)

check('they start with no abilities', Object.values(P.abilities).every((v) => v === 0) && Object.values(B.abilities).every((v) => v === 0))

// --- A: Pink's crystal, on the path behind a plate door ---
holdCross(d, { plateX: 10.5, leverX: 23.5, afterX: 26.5, label: 'A (plate door)' }, check)
check("A: Pink took her crystal on the way: Solid Light", P.abilities.solidLight === 1 && g.dialogs.some((x) => x.player === 'pink' && x.ability === 'solidLight'))
check("A: ...and Blue could not have taken it", B.abilities.solidLight === 0)

// --- B: Blue's crystal, on a slab he reaches by climbing onto Pink ---
go(500, () => P.x > 30 && B.x > 27, drive(30.3, { tol: 0.1, autoJump: false }), drive(27.0, { autoJump: false }))
go(500, () => B.carriedBy === 'pink', drive(30.3, { tol: 0.1, autoJump: false }), (p) => {
  const dx = P.x - p.x
  return p.onGround ? { right: dx > 0.2, jump: dx > 2.4 && dx < 3.4 } : { right: dx > 0.15, jump: p.vy < 0 }
})
check('B: Blue is on Pink’s shoulders', B.carriedBy === 'pink')
let risen = false
go(160, () => B.onGround && B.y < 14.5 && B.x > 30.9, drive(30.3, { tol: 0.1, autoJump: false }), (p, f) => {
  if (p.y < 14.2) risen = true
  return { jump: f < 30, right: risen }
})
check('B: Blue jumped up onto the slab', B.onGround && B.y < 14.5, `blue (${B.x.toFixed(1)}, ${B.y.toFixed(1)})`)
go(300, () => B.abilities.jumpBoost === 1, drive(30.3, { tol: 0.1, autoJump: false }), drive(32.5, { tol: 0.1, autoJump: false }))
check('B: Blue took his crystal: Jump Boost', B.abilities.jumpBoost === 1 && P.abilities.jumpBoost === 0)
go(600, () => B.x > 37 && B.y > 17.5, drive(30.3, { tol: 0.1, autoJump: false }), drive(38.5, { autoJump: false }))
check('B: Blue dropped off the slab and is now ahead', B.x > 37 && B.y > 17.5)

// --- C: a 3-tall door. Blue (boosted) climbs it and pulls the lever; Pink then walks through ---
go(500, () => B.x > 44 && P.x > 36, drive(36.6, { autoJump: false }), drive(45.0, { autoJump: false }))
check('C: the door is shut and too tall for an ordinary jump', !door('door-j').open)
go(900, () => B.x > 47.5, drive(45.0, { autoJump: false }), drive(48.0, { tol: 0.1 }))
check('C: Blue climbed over it (only a boosted jump can)', B.x > 47.5 && B.deaths === 0, `blue x=${B.x.toFixed(1)}`)
go(600, () => sw('lv-j').on, drive(40, { autoJump: false }), drive(51.5, { tol: 0.1, interactAt: [51.5] }))
check('C: Blue pulled the lever on the far side', sw('lv-j').on && door('door-j').open)
// Blue goes on ahead to the lip of the gap; Pink follows through the door behind him
go(1500, () => P.x > 57.8 && B.x > 60.4, drive(58.0, { tol: 0.1, autoJump: false }), drive(60.7, { tol: 0.1, autoJump: false }))
check('C: ...so Pink could walk through, and they are at the gap with Blue ahead', P.x > 57.8 && B.x > 60.4 && P.x < B.x)

// --- D: the gap. Pink draws a bridge for Blue; Blue's lever then closes the drawbridge for her ---
// Pink presses the draw key (aiming), then draws a line across the gap
const press = { ...none, draw: true }
stepGame(g, [none, press], SIM.STEP)
stepGame(g, [none, none], SIM.STEP)
check('D: Pink is aiming a line', P.draw.mode === 'aiming')
beginStroke(g, P, 63.5, 18.0) // (Solid Light I is 3 tiles long: a stepping stone in the middle of the 6-wide gap)
for (let i = 1; i <= 40; i++) extendStroke(g, P, 63.5 + (3.0 * i) / 40, 18.0)
endStroke(g, P)
check('D: ...and the bridge of light holds her still', P.draw.mode === 'active' && g.lines.length === 1)
go(400, () => B.x > 69.3, drive(40, { autoJump: false }), drive(72.6, { autoJump: false, jumpEdge: [61.8, 66.3] }))
check('D: Blue crossed the gap by hopping on the line', B.x > 69.3 && B.deaths === 0 && g.traps.traps[0].mode === 'open', `blue x=${B.x.toFixed(1)}, deaths ${B.deaths}`)
go(500, () => sw('lv-br').on, drive(40, { autoJump: false }), drive(73.5, { tol: 0.1, interactAt: [73.5] }))
go(300, () => B.x > 77.5, drive(40, { autoJump: false }), drive(78.0, { tol: 0.1, autoJump: false })) // Blue steps on ahead
check('D: Blue pulled the lever: the drawbridge closes for good', sw('lv-br').on && g.traps.traps[0].mode === 'sealed')
go(700, () => P.draw.mode === 'idle', drive(40, { autoJump: false }), drive(75, { autoJump: false }))
go(900, () => P.x > 75.5, drive(75.8, { autoJump: false }), drive(78.0, { tol: 0.1, autoJump: false }))
check('D: ...and Pink walks across the drawbridge once her line fades', P.x > 75.5 && P.deaths === 0, `pink x=${P.x.toFixed(1)}`)

// --- E: a last plate gate with the roles reversed (Blue ahead, Pink holds), and a pit ---
const d2 = duo(g, 'blue')
holdCross(d2, { plateX: 80.5, leverX: 91.5, afterX: 93.5, label: 'E (roles reversed)' }, check)
go(900, () => B.x > 100 && P.x > 94, drive(100.4, { jumpAt: [95.0] }), drive(94.6, { autoJump: false }))
go(1500, () => g.complete, drive(106.6, { jumpAt: [95.0] }), drive(107.4, { jumpAt: [95.0] }))
check('both reach the exit with their hearts intact', g.complete && B.hearts === 3 && P.hearts === 3, `deaths ${B.deaths + P.deaths}`)
void step
void stepGame
finish('Chapter 1 room 3')
