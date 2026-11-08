// Scripted playthrough of chapter 1, room 9 (Hangman's Walk):
//   node scripts/check-doors-ch1-09.mjs
import { loadRoom, makeChecker } from './lib/pilot.mjs'
import { drawLine, duo, holdCross, slabCarry, tap } from './lib/routines.mjs'
import { fireRope } from '../src/doors/rope.js'

const { check, finish } = makeChecker()
const g = loadRoom('ch1-09-hangmans-walk', {
  blue: { jumpBoost: 1, lightEcho: 1, maxHearts: 5 },
  pink: { solidLight: 1, teleport: 1, maxHearts: 5 },
})
const d = duo(g, 'pink') // Pink leads
const { lead: P, follow: B, go, drive } = d
const sw = (id) => g.doors.switches.find((s) => s.id === id)
const trap = (id) => g.traps.traps.find((t) => t.id === id)

// A: Pink's upgrade, behind a plate door Blue holds
holdCross(d, { plateX: 10.5, leverX: 23.5, afterX: 26.5, label: 'A (plate door)' }, check)
check('A: Pink upgraded to Solid Light II', P.abilities.solidLight === 2 && B.abilities.solidLight === 0)

// B: Blue's Light Rope, on a slab Pink lifts him to
go(500, () => P.x > 30 && B.x > 27, drive(30.3, { tol: 0.1, autoJump: false }), drive(27.0, { autoJump: false }))
slabCarry(d, { carrier: P, rider: B, carrierX: 30.3, slabTop: 14, crystalX: 32.5, dropX: 38.5, label: 'B (slab)' }, check)
check('B: Blue took Light Rope, and is now ahead of Pink', B.abilities.lightRope === 1 && P.abilities.lightRope === 0 && B.x > 37)

// C: the 4-wide pit: Blue boosts across, then ropes Pink over
const d2 = duo(g, 'blue') // Blue leads
const { lead: B2, follow: P2, go: go2 } = d2
go2(900, () => B2.x > 49 && P2.x > 42.4, drive(49.6, { tol: 0.15, jumpEdge: [44.0] }), drive(42.8, { tol: 0.15, autoJump: false }))
check('C: Blue boosted across the pit; Pink waits at the edge', B2.x > 48.5 && B2.deaths === 0 && P2.x < 43.6 && P2.deaths === 0, `blue ${B2.x.toFixed(1)}, pink ${P2.x.toFixed(1)}, deaths ${B2.deaths}/${P2.deaths}`)
tap(d2, B2, 'rope')
const hit = fireRope(g, B2, { x: P2.x, y: 17 })
check('C: Blue’s rope catches Pink', hit === 'partner', String(hit))
go2(300, () => B2.rope.mode === 'idle', () => ({ crouch: true }))
go2(200, () => P2.onGround && P2.x > 48, () => ({}), () => ({}))
check('C: ...and reels her over the pit', P2.x > 48 && P2.deaths === 0, `pink (${P2.x.toFixed(1)}, ${P2.y.toFixed(1)})`)

// D: the 14-wide gap: Pink draws a long bridge for Blue; his lever then closes the drawbridge for her
go2(1200, () => B2.x > 59.5 && P2.x > 56, drive(60.0, { tol: 0.15, autoJump: false }), drive(57.0, { tol: 0.15, autoJump: false }))
const bridge = drawLine(d2, P2, 59.8, 18.0, 73.9, 18.0)
check('D: Pink draws a 14-tile bridge (Solid Light II)', bridge && P2.draw.mode === 'active')
go2(500, () => B2.x > 74.5, drive(76, { autoJump: false }), drive(57, { autoJump: false }))
check('D: Blue crossed the gap on the line', B2.x > 74.5 && B2.deaths === 0, `blue (${B2.x.toFixed(1)}, ${B2.y.toFixed(1)})`)
go2(500, () => sw('lv-d').on, drive(75.5, { tol: 0.1, interactAt: [75.5] }), drive(57, { autoJump: false }))
check('D: Blue’s lever closed the drawbridge', sw('lv-d').on && trap('bridge-d').mode === 'sealed')
go2(900, () => P2.draw.mode === 'idle', drive(77, { autoJump: false }), drive(57, { autoJump: false }))
go2(1500, () => P2.x > 76, drive(80, { autoJump: false }), drive(77, { autoJump: false }))
check('D: ...and Pink walks across it', P2.x > 75.5 && P2.deaths === 0, `pink x=${P2.x.toFixed(1)}`)

// E: crushers
holdCross(d2, { plateX: 78.5, leverX: 93.5, afterX: 95, label: 'E (crushers)' }, check)
d2.go(1500, () => g.complete, drive(101.4), drive(102.4))
check('both reach the exit, hearts full', g.complete && B2.hearts === B2.maxHearts && P2.hearts === P2.maxHearts, `deaths ${B2.deaths + P2.deaths}`)
finish('Chapter 1 room 9')
