// Scripted playthrough of chapter 1, room 4 (Stepping Stones):
//   node scripts/check-doors-ch1-04.mjs
import { loadRoom, makeChecker } from './lib/pilot.mjs'
import { drawLine, duo, holdCross } from './lib/routines.mjs'

const { check, finish } = makeChecker()
// arrive carrying the abilities from room 3
const g = loadRoom('ch1-04-stepping-stones', { blue: { jumpBoost: 1, maxHearts: 3 }, pink: { solidLight: 1, maxHearts: 3 } })
const d = duo(g, 'blue') // Blue leads
const { lead: B, follow: P, go, drive } = d
const sw = (id) => g.doors.switches.find((s) => s.id === id)
const trap = (id) => g.traps.traps.find((t) => t.id === id)

check('they arrive with their abilities: Blue Jump Boost, Pink Solid Light', B.abilities.jumpBoost === 1 && P.abilities.solidLight === 1 && B.abilities.solidLight === 0 && P.abilities.jumpBoost === 0)

// A: the arrow corridor
holdCross(d, { plateX: 10.5, leverX: 32.5, afterX: 35, label: 'A (arrows)' }, check)
check('A: nobody was hit (the plate switched the arrows off)', B.deaths + P.deaths === 0)

// B: a 4-wide pit: Blue's boosted jump clears it; his lever closes a drawbridge for Pink
go(300, () => B.x > 38 && P.x > 34.5, drive(38.5, { autoJump: false }), drive(35.5, { autoJump: false }))
check('B: the pit is too wide for an ordinary jump (it is a drawbridge, open)', trap('bridge-b').mode === 'open')
go(900, () => sw('lv-b').on, drive(51.5, { tol: 0.1, jumpEdge: [44.0], interactAt: [51.5] }), drive(35.5, { autoJump: false }))
check('B: Blue jumped it and pulled the lever', sw('lv-b').on && B.deaths === 0 && trap('bridge-b').mode === 'sealed', `blue x=${B.x.toFixed(1)}, deaths ${B.deaths}, bridge ${trap('bridge-b').mode}`)
go(900, () => P.x > 53 && B.x > 56, drive(57.5, { tol: 0.1, autoJump: false }), drive(54, { autoJump: false }))
check('B: ...and Pink walked across the bridge', P.x > 53 && P.deaths === 0)

// C: falling spikes. Pink draws a roof over them, Blue walks underneath, and his lever switches them off for her
go(900, () => B.x > 57.4 && P.x > 56.4, drive(57.7, { tol: 0.1, autoJump: false }), drive(56.7, { tol: 0.1, autoJump: false }))
// running up sets the spikes off early (they fall AHEAD of a runner and stay deadly), so they wait for them to reset first
const spikes = g.traps.traps.filter((t) => t.type === 'spikes')
check('C: the field is deadly if you just run at it (they fell ahead of Blue and are still down)', spikes.some((t) => t.mode !== 'armed'))
go(1500, () => spikes.every((t) => t.mode === 'armed') && B.x < 59, drive(57.7, { tol: 0.1, autoJump: false }), drive(56.7, { tol: 0.1, autoJump: false }))
check('C: ...and Blue is still alive, waiting', B.deaths === 0)
const roof = drawLine(d, P, 61.0, 12.0, 64.0, 12.0)
check('C: Pink draws a 3-tile roof of light over the first part of the field', roof && P.draw.mode === 'active')
// (Blue walks to the end of the roof, waits for the uncovered spikes to land on the floor, then jumps the rest of the field)
go(400, () => spikes.every((t) => t.mode !== 'falling' && t.mode !== 'warn') && B.x > 63.2, drive(63.4, { tol: 0.1, autoJump: false }), drive(57.0, { autoJump: false }))
go(700, () => sw('lv-c').on, drive(74.5, { tol: 0.1, interactAt: [74.5], jumpEdge: [63.4] }), drive(57.0, { autoJump: false }))
check('C: Blue walked under the spikes and was not hurt (they landed on the roof)', B.deaths === 0 && sw('lv-c').on, `deaths ${B.deaths}`)
go(900, () => P.draw.mode === 'idle', drive(77.5, { tol: 0.1, autoJump: false }), drive(57.0, { autoJump: false }))
go(900, () => P.x > 76.5, drive(78.5, { tol: 0.1, autoJump: false }), drive(76.5, { tol: 0.3, autoJump: false }))
check('C: ...and Pink follows now the spikes are off for good', P.x > 75.5 && P.deaths === 0, `pink x=${P.x.toFixed(1)}`)

// D: the combined gate. Pink bridges the gap for Blue; Blue climbs the 3-tall door and pulls the lever for her
go(900, () => B.x > 84.7 && P.x > 82, drive(85.0, { tol: 0.1, autoJump: false }), drive(82.6, { tol: 0.1, autoJump: false }))
const bridge = drawLine(d, P, 88.0, 18.0, 91.0, 18.0)
check('D: Pink draws a stepping stone in the middle of the 6-wide gap', bridge && P.draw.mode === 'active')
go(500, () => B.x > 95.2, drive(98.0, { tol: 0.1, jumpEdge: [85.9, 90.4] }), drive(40, { autoJump: false }))
check('D: Blue crossed the bridge and climbed over the 3-tall door', B.x > 95.2 && B.deaths === 0, `blue x=${B.x.toFixed(1)}, deaths ${B.deaths}`)
go(500, () => sw('lv-d').on, drive(98.5, { tol: 0.1, interactAt: [98.5] }), drive(40, { autoJump: false }))
check('D: Blue’s lever closed the drawbridge and opened the door', sw('lv-d').on && trap('bridge-d').mode === 'sealed' && g.doors.doors[0].open)
go(900, () => P.draw.mode === 'idle', drive(101, { autoJump: false }), drive(40, { autoJump: false }))
go(1500, () => P.x > 96.5, drive(101, { autoJump: false }), drive(97.5, { autoJump: false }))
check('D: ...so Pink crosses the bridge and walks through', P.x > 96.5 && P.deaths === 0, `pink x=${P.x.toFixed(1)}`)
go(1200, () => g.complete, drive(106.4), drive(107.4))
check('both reach the exit with their hearts intact', g.complete && B.hearts === 3 && P.hearts === 3, `deaths ${B.deaths + P.deaths}`)
finish('Chapter 1 room 4')
