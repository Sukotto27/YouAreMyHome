// Scripted playthrough of chapter 1, room 6 (Mirror Mirror):
//   node scripts/check-doors-ch1-06.mjs
import { loadRoom, makeChecker } from './lib/pilot.mjs'
import { drawLine, duo, holdCross, slabCarry, tap } from './lib/routines.mjs'

const { check, finish } = makeChecker()
const g = loadRoom('ch1-06-mirror-mirror', { blue: { jumpBoost: 1, maxHearts: 4 }, pink: { solidLight: 1, maxHearts: 4 } })
const d = duo(g, 'blue') // Blue leads
const { lead: B, follow: P, go, drive } = d
const sw = (id) => g.doors.switches.find((s) => s.id === id)

// A: Blue's Light Echo crystal is behind a plate door Pink holds
holdCross(d, { plateX: 10.5, leverX: 23.5, afterX: 26.5, label: 'A (plate door)' }, check)
check('A: Blue took Light Echo (Pink could not have)', B.abilities.lightEcho === 1 && P.abilities.lightEcho === 0)

// B: Pink's Teleport is on a slab: Blue carries her up
slabCarry(d, { carrier: B, rider: P, carrierX: 30.3, slabTop: 14, crystalX: 32.5, dropX: 38, label: 'B (slab)' }, check)
check('B: Pink took Teleport, and is now ahead of Blue', P.abilities.teleport === 1 && B.abilities.teleport === 0 && P.x > 36.5)

// C: two plate doors in a row. Blue echoes onto the first plate and goes on to hold the second.
const d2 = duo(g, 'pink') // Pink leads now
const { lead: P2, follow: B2, go: go2 } = d2
go2(900, () => Math.abs(B2.x - 44.5) < 0.2 && B2.onGround && P2.x > 45.5, drive(46.2, { autoJump: false }), drive(44.5, { tol: 0.1, autoJump: false }))
tap(d2, B2, 'echo')
check('C: Blue leaves an echo on the plate, which holds the door open', g.echoes.length === 1 && g.doors.doors.find((x) => x.id === 'door-1').open)
go2(900, () => Math.abs(B2.x - 54.5) < 0.2 && P2.x > 55.5, drive(57.0, { autoJump: false }), drive(54.5, { tol: 0.1, autoJump: false }))
check('C: both passed door 1; Blue holds the second plate', Math.abs(B2.x - 54.5) < 0.3 && P2.x > 55.5 && P2.deaths + B2.deaths === 0)
go2(1500, () => sw('lv-c').on, drive(63.5, { tol: 0.1, interactAt: [63.5] }), drive(54.5, { tol: 0.1, autoJump: false }))
check('C: Pink got through door 2 and pulled the lever', sw('lv-c').on)
go2(1500, () => B2.x > 68 && P2.x > 63.8, drive(64.5, { tol: 0.1, autoJump: false }), drive(68.4, { tol: 0.1, autoJump: false })) // (Blue waits by the wall, Pink behind him)

// D: a 5-tall wall. Pink draws a ramp over her own head for Blue, who climbs over; then she teleports to him.
const ramp = drawLine(d2, P2, 69.4, 18.0, 71.8, 16.2)
check('D: Pink draws a ramp', ramp && P2.draw.mode === 'active')
go2(900, () => B2.x > 75.5, drive(64.5, { tol: 0.1, autoJump: false }), drive(77))
check('D: Blue climbed over the wall', B2.x > 75.5 && B2.deaths === 0, `blue (${B2.x.toFixed(1)}, ${B2.y.toFixed(1)})`)
go2(900, () => P2.draw.mode === 'idle', drive(64.5, { autoJump: false }), drive(77, { tol: 0.2, autoJump: false }))
tap(d2, P2, 'teleport')
check('D: Pink teleports to Blue, past the wall', P2.x > 73.5 && P2.deaths === 0, `pink (${P2.x.toFixed(1)}, ${P2.y.toFixed(1)})`)
go2(1500, () => g.complete, drive(88.4), drive(89.4))
check('both reach the exit, hearts full', g.complete && B.hearts === B.maxHearts && P2.hearts === P2.maxHearts)
finish('Chapter 1 room 6')
