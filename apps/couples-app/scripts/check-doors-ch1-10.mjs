// Scripted playthrough of chapter 1, room 10 (The Furnace, the chapter finale):
//   node scripts/check-doors-ch1-10.mjs
import { loadRoom, makeChecker } from './lib/pilot.mjs'
import { drawLine, duo, holdCross, slabCarry, tap } from './lib/routines.mjs'
import { fireRope } from '../src/doors/rope.js'

const { check, finish } = makeChecker()
const g = loadRoom('ch1-10-furnace', {
  blue: { jumpBoost: 1, lightEcho: 1, lightRope: 1, maxHearts: 5 },
  pink: { solidLight: 2, teleport: 1, maxHearts: 5 },
})
const d = duo(g, 'pink') // Pink leads
const { lead: P, follow: B, go, drive } = d
const sw = (id) => g.doors.switches.find((s) => s.id === id)
const door = (id) => g.doors.doors.find((x) => x.id === id)
const trap = (id) => g.traps.traps.find((t) => t.id === id)

// A: two plates
go(900, () => Math.abs(B.x - 9.5) < 0.2 && B.onGround && P.x > 13.5, drive(14.5, { autoJump: false }), drive(9.5, { tol: 0.1, autoJump: false }))
tap(d, B, 'echo')
go(300, () => Math.abs(B.x - 11.5) < 0.2, drive(14.5, { autoJump: false }), drive(11.5, { tol: 0.1, autoJump: false }))
check('A: echo + Blue hold both plates: the door is open', door('door-a').open)
go(900, () => sw('lv-a').on, drive(22.5, { tol: 0.1, interactAt: [22.5] }), drive(11.5, { tol: 0.1, autoJump: false }))
go(900, () => B.x > 25, drive(27, { autoJump: false }), drive(25.5, { autoJump: false }))
check('A: both through the first door', sw('lv-a').on && B.x > 24 && P.deaths + B.deaths === 0)

// B: boulders (Pink's heart is in the lane)
holdCross(d, { plateX: 32.5, leverX: 56.5, afterX: 59, label: 'B (boulders)' }, check)
check('B: Pink took the last extra heart: 6', P.maxHearts === 6 && B.maxHearts === 5 && P.deaths + B.deaths === 0)

// C: the wall. Pink draws a ramp over her own head for Blue then teleports to him.
go(900, () => P.x > 66 && B.x > 61 && B.x < 62.6, drive(66.5, { tol: 0.1, autoJump: false }), drive(62, { tol: 0.2, autoJump: false }))
const ramp = drawLine(d, P, 62.5, 18.0, 72.2, 12.6)
check('C: Pink draws a ramp', ramp && P.draw.mode === 'active')
go(900, () => B.x > 75.5, drive(66.5, { tol: 0.1, autoJump: false }), drive(77, { autoJump: false }))
check('C: Blue climbed over the wall ', B.x > 75.5 && B.deaths === 0, `blue (${B.x.toFixed(1)}, ${B.y.toFixed(1)}), hearts ${B.maxHearts}`)
go(900, () => P.draw.mode === 'idle', drive(66.5, { autoJump: false }), drive(76, { tol: 0.2, autoJump: false }))
tap(d, P, 'teleport')
check('C: Pink teleports to Blue, past the wall', P.x > 73.5 && P.deaths === 0, `pink (${P.x.toFixed(1)}, ${P.y.toFixed(1)})`)

// D: Blue's last heart is on a slab: Pink (now ahead, thanks to the teleport) lifts him; he lands ahead of her
go(900, () => Math.abs(P.x - 81.3) < 0.15 && B.x < 79.9 && B.onGround, drive(81.3, { tol: 0.1, autoJump: false }), drive(78.6, { autoJump: false }))
slabCarry(d, { carrier: P, rider: B, carrierX: 81.3, slabTop: 14, crystalX: 83.5, dropX: 88.5, label: 'D (slab)' }, check)
check('D: Blue took his last extra heart: 6, and is now ahead', B.maxHearts === 6 && B.x > 87 && B.x > P.x)

// E: the pit. Blue boosts across and ropes Pink over.
const d2 = duo(g, 'blue')
const { lead: B2, follow: P2, go: go2 } = d2
go2(900, () => B2.x > 95 && P2.x > 88.4, drive(95.6, { tol: 0.15, jumpEdge: [90.0] }), drive(88.8, { tol: 0.15, autoJump: false }))
check('E: Blue boosted across the pit; Pink waits at the edge', B2.x > 94.5 && B2.deaths === 0 && P2.deaths === 0 && P2.x < 89.6, `blue ${B2.x.toFixed(1)}, pink ${P2.x.toFixed(1)}`)
tap(d2, B2, 'rope')
const hit = fireRope(g, B2, { x: P2.x, y: 17 })
check('E: Blue’s rope catches Pink', hit === 'partner', String(hit))
go2(300, () => B2.rope.mode === 'idle', () => ({ crouch: true }))
go2(200, () => P2.onGround && P2.x > 94, () => ({}), () => ({}))
check('E: ...and reels her over the pit', P2.x > 94 && P2.deaths === 0, `pink (${P2.x.toFixed(1)}, ${P2.y.toFixed(1)})`)

// F: the 12-wide gap: Pink's long bridge for Blue; his lever closes the drawbridge for her
go2(1200, () => B2.x > 103.5 && P2.x > 100, drive(103.9, { tol: 0.15, autoJump: false }), drive(101, { tol: 0.15, autoJump: false }))
const bridge = drawLine(d2, P2, 103.8, 18.0, 116.0, 18.0)
check('F: Pink draws a 12-tile bridge (Solid Light II)', bridge && P2.draw.mode === 'active')
go2(500, () => B2.x > 116.5, drive(118, { autoJump: false }), drive(101, { autoJump: false }))
check('F: Blue crossed the gap on the line', B2.x > 116.5 && B2.deaths === 0, `blue (${B2.x.toFixed(1)}, ${B2.y.toFixed(1)})`)
go2(500, () => sw('lv-e').on, drive(117.5, { tol: 0.1, interactAt: [117.5] }), drive(101, { autoJump: false }))
check('F: Blue’s lever closed the drawbridge', sw('lv-e').on && trap('bridge-e').mode === 'sealed')
go2(900, () => P2.draw.mode === 'idle', drive(118.5, { autoJump: false }), drive(101, { autoJump: false }))
go2(1500, () => P2.x > 117.8, drive(119, { autoJump: false }), drive(118, { autoJump: false }))
check('F: ...and Pink walks across it', P2.x > 116.5 && P2.deaths === 0, `pink x=${P2.x.toFixed(1)}`)

// G: the crushers
holdCross(d2, { plateX: 120.5, leverX: 133.5, afterX: 135, label: 'G (crushers)' }, check)
d2.go(1800, () => g.complete, drive(141.4), drive(142.4))
check('both reach the exit, hearts full (6 each)', g.complete && B2.hearts === 6 && P2.hearts === 6, `deaths ${B2.deaths + P2.deaths}`)
finish('Chapter 1 room 10')
