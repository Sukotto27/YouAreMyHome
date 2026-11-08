// Scripted playthrough of chapter 1, room 7 (The Long Fall):
//   node scripts/check-doors-ch1-07.mjs
import { loadRoom, makeChecker } from './lib/pilot.mjs'
import { duo, holdCross, slabCarry, tap } from './lib/routines.mjs'

const { check, finish } = makeChecker()
const g = loadRoom('ch1-07-long-fall', {
  blue: { jumpBoost: 1, lightEcho: 1, maxHearts: 4 },
  pink: { solidLight: 1, teleport: 1, maxHearts: 4 },
})
const d = duo(g, 'pink') // Pink leads
const { lead: P, follow: B, go, drive } = d
const sw = (id) => g.doors.switches.find((s) => s.id === id)
const door = (id) => g.doors.doors.find((x) => x.id === id)
const trap = (id) => g.traps.traps.find((t) => t.id === id)

// A: a door that needs two plates. Pink waits ahead; Blue echoes onto the first plate and stands on the second.
go(900, () => Math.abs(B.x - 9.5) < 0.2 && B.onGround && P.x > 13.5, drive(14.5, { autoJump: false }), drive(9.5, { tol: 0.1, autoJump: false }))
tap(d, B, 'echo')
go(300, () => Math.abs(B.x - 11.5) < 0.2, drive(14.5, { autoJump: false }), drive(11.5, { tol: 0.1, autoJump: false }))
check('A: both plates held (echo + Blue): the door is open', g.doors.plates.filter((p) => p.held).length >= 2 && door('door-a').open)
go(900, () => sw('lv-a').on, drive(22.5, { tol: 0.1, interactAt: [22.5] }), drive(11.5, { tol: 0.1, autoJump: false }))
check('A: Pink got through and pulled the lever', sw('lv-a').on && P.deaths + B.deaths === 0)
go(900, () => B.x > 24, drive(26, { autoJump: false }), drive(24.5, { autoJump: false }))

// B: Blue rides Pink up the slab and lands ahead
go(500, () => P.x > 28.9 && B.x > 24.5, drive(29.3, { tol: 0.1, autoJump: false }), drive(26.2, { autoJump: false }))
slabCarry(d, { carrier: P, rider: B, carrierX: 29.3, slabTop: 14, crystalX: 31.5, dropX: 36.5, label: 'B (slab)' }, check)
check('B: Blue is now ahead of Pink', B.x > 35.5 && P.x < 31)

// C: crushers. Pink holds the plate (she is behind now), Blue crosses and pulls the lever.
const d2 = duo(g, 'blue')
holdCross(d2, { plateX: 38.5, leverX: 52.5, afterX: 54, label: 'C (crushers)' }, check)
check('C: nobody was crushed', P.deaths + B.deaths === 0)
// ...and a 4-wide pit
const { lead: B2, follow: P2, go: go2 } = d2
go2(500, () => B2.x > 54.5 && P2.x > 52.5, drive(55.0, { autoJump: false }), drive(53.0, { autoJump: false }))
check('C: the pit is open', trap('bridge').mode === 'open')
go2(900, () => sw('lv-p').on, drive(63.5, { tol: 0.1, jumpEdge: [56.0], interactAt: [63.5] }), drive(53.0, { autoJump: false }))
check('C: Blue boosted across and pulled the lever', sw('lv-p').on && B2.deaths === 0 && trap('bridge').mode === 'sealed', `blue x=${B2.x.toFixed(1)}, bridge ${trap('bridge').mode}`)
go2(900, () => P2.x > 62 && B2.x > 66, drive(67, { tol: 0.2, autoJump: false }), drive(62.5, { autoJump: false }))
check('C: ...and Pink crossed the bridge', P2.x > 61.5 && P2.deaths === 0)

// D: a 4-tall door. Pink rides Blue over it and pulls the lever for him.
go2(500, () => B2.x > 69.2 && P2.x > 64, drive(69.3, { tol: 0.1, autoJump: false }), drive(66.2, { autoJump: false }))
slabCarry(d2, { carrier: B2, rider: P2, carrierX: 69.3, slabTop: 14, crystalX: 71.5, dropX: 73.5, label: 'D (door)' }, check)
check('D: Pink is over the door', P2.x > 72.5 && P2.y > 17.5)
go2(600, () => sw('lv-d').on, drive(69.3, { tol: 0.1, autoJump: false }), drive(74.5, { tol: 0.1, interactAt: [74.5] }))
check('D: her lever opened the door for Blue', sw('lv-d').on && door('door-d').open)

// E: a laser curtain. Blue (behind) holds the plate; Pink crosses and pulls the lever.
const d3 = duo(g, 'pink')
holdCross(d3, { plateX: 76.5, leverX: 84.5, afterX: 86.5, label: 'E (laser)' }, check)
d3.go(1200, () => g.complete, drive(92.4), drive(93.4))
check('both reach the exit, hearts full', g.complete && B.hearts === B.maxHearts && P.hearts === P.maxHearts, `deaths ${B.deaths + P.deaths}`)
finish('Chapter 1 room 7')
