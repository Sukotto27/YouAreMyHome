// Scripted playthrough of chapter 1, room 5 (Heartbeat):
//   node scripts/check-doors-ch1-05.mjs
import { loadRoom, makeChecker } from './lib/pilot.mjs'
import { drawLine, duo, holdCross, slabCarry } from './lib/routines.mjs'

const { check, finish } = makeChecker()
const g = loadRoom('ch1-05-heartbeat', { blue: { jumpBoost: 1, maxHearts: 3 }, pink: { solidLight: 1, maxHearts: 3 } })
const d = duo(g) // Pink leads at first
const { lead: P, follow: B, go, drive } = d
const sw = (id) => g.doors.switches.find((s) => s.id === id)
const trap = (id) => g.traps.traps.find((t) => t.id === id)

// A: the boulder lane. Pink's extra heart lies in it.
holdCross(d, { plateX: 10.5, leverX: 34.5, afterX: 36.5, leaderOpts: { jumpEdge: [14.0] }, followerOpts: { jumpEdge: [14.0] }, label: 'A (boulders and the gap they roll into)' }, check)
check('A: Pink took her extra heart in the lane: 4 hearts', P.maxHearts === 4 && P.hearts === 4 && B.maxHearts === 3)
check('A: nobody was crushed', P.deaths + B.deaths === 0)

// B: Blue's heart is on a slab; Pink carries him up
go(500, () => P.x > 39.5 && B.x > 36, drive(40.3, { tol: 0.1, autoJump: false }), drive(37.2, { autoJump: false }))
slabCarry(d, { carrier: P, rider: B, carrierX: 40.3, slabTop: 14, crystalX: 42.6, dropX: 47, label: 'B (slab)' }, check)
check('B: Blue took his extra heart: 4 hearts, and is now ahead of Pink', B.maxHearts === 4 && B.x > 45.5 && B.y > 17.5)

// C: the collapsing floor. Blue leads now: Pink holds the plate that keeps it up.
const d2 = duo(g, 'blue')
const go2 = (limit, cond, dBlue, dPink) => d2.go(limit, cond, dBlue, dPink) // (Blue leads: first driver is Blue's)
// The floor gives way 1.5 s after someone steps on it, so one of them has to sprint across before it goes. Its plate is on the
// far side: Blue sprints over and holds it, which keeps the floor up once it is back for Pink to cross.
const floor = trap('collapse')
check('C: the plate that holds the floor up is on the far side', g.doors.plates.find((p) => p.id === 'pc').x > 63)
go2(900, () => Math.abs(B.x - 65.5) < 0.2 && B.onGround, drive(65.5, { tol: 0.1, autoJump: false }), drive(52, { autoJump: false }))
check('C: Blue sprinted across before the floor gave way and stands on the plate', g.doors.plates.find((p) => p.id === 'pc').held && B.deaths === 0, `blue x=${B.x.toFixed(1)}, deaths ${B.deaths}, floor ${floor.mode}`)
go2(900, () => floor.mode === 'solid' && g.doors.plates.find((p) => p.id === 'pc').held && P.x > 50, drive(65.5, { tol: 0.1, autoJump: false }), drive(52, { autoJump: false }))
go2(1500, () => P.x > 68, drive(65.5, { tol: 0.1, autoJump: false }), drive(70)) // (she hops over him)
check('C: ...and Pink crossed the restored floor while he held it', P.x > 68 && P.deaths === 0, `pink x=${P.x.toFixed(1)}`)
go2(600, () => sw('lv-c').on, drive(67.5, { tol: 0.1, interactAt: [67.5] }), drive(70, { autoJump: false }))
check('C: Blue pulled the lever to fix the floor for good', sw('lv-c').on && B.deaths + P.deaths === 0)

// D: the wall. Pink draws a ramp for Blue, who climbs over; his lever opens the door in it for her.
d2.go(900, () => B.x > 82.7 && P.x > 79, drive(83.0, { tol: 0.1, autoJump: false }), drive(79.8, { tol: 0.1, autoJump: false }))
const ramp = drawLine(d2, P, 87.4, 18.0, 89.8, 16.2)
check('D: Pink draws a ramp up the wall', ramp && P.draw.mode === 'active')
d2.go(600, () => B.x > 92, drive(98.0), drive(40, { autoJump: false }))
check('D: Blue climbed the ramp and jumped over the 4-tall wall', B.x > 92 && B.deaths === 0, `blue (${B.x.toFixed(1)}, ${B.y.toFixed(1)})`)
d2.go(500, () => sw('lv-d').on, drive(94.5, { tol: 0.1, interactAt: [94.5] }), drive(40, { autoJump: false }))
check('D: Blue’s lever opened the door in the wall', sw('lv-d').on && g.doors.doors[0].open)
d2.go(900, () => P.draw.mode === 'idle', drive(97, { autoJump: false }), drive(40, { autoJump: false }))
d2.go(1500, () => P.x > 92.5, drive(98, { autoJump: false }), drive(93.2, { autoJump: false }))
check('D: ...so Pink walks through', P.x > 92.5 && P.deaths === 0, `pink x=${P.x.toFixed(1)}`)
d2.go(1200, () => g.complete, drive(102.4), drive(103.4))
check('both reach the exit, and their hearts are refilled', g.complete && B.hearts === B.maxHearts && P.hearts === P.maxHearts)
finish('Chapter 1 room 5')
