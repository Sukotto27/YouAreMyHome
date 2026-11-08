// Scripted playthrough of chapter 1, room 8 (Boiler Room):
//   node scripts/check-doors-ch1-08.mjs
import { loadRoom, makeChecker } from './lib/pilot.mjs'
import { duo, holdCross } from './lib/routines.mjs'

const { check, finish } = makeChecker()
const g = loadRoom('ch1-08-boiler-room', {
  blue: { jumpBoost: 1, lightEcho: 1, maxHearts: 4 },
  pink: { solidLight: 1, teleport: 1, maxHearts: 4 },
})
const d = duo(g, 'pink') // Pink leads
const { lead: P, follow: B, go, drive } = d
const sw = (id) => g.doors.switches.find((s) => s.id === id)

// A: the blade. Blue holds the plate; Pink crosses (and takes her heart on the way) and pulls the lever.
holdCross(d, { plateX: 10.5, leverX: 33.5, afterX: 36, label: 'A (blade)' }, check)
check('A: Pink took her extra heart: 5 hearts', P.maxHearts === 5 && P.hearts === 5 && B.maxHearts === 4)
check('A: nobody was cut', P.deaths + B.deaths === 0)

// B: the updraft over the wall, with a laser across it. Blue holds pb; Pink walks into the stream and floats over.
go(900, () => Math.abs(B.x - 44.5) < 0.2 && B.onGround && P.x > 41, drive(43.0, { autoJump: false }), drive(44.5, { tol: 0.1, autoJump: false }))
let risen = false
go(900, () => P.x > 56, (p) => {
  if (p.y < 7.2) risen = true
  return risen ? { right: true } : { right: p.x < 47.9 }
}, drive(44.5, { tol: 0.1, autoJump: false }))
check('B: Pink floated over the wall (the laser was off)', P.x > 55 && P.deaths === 0, `pink (${P.x.toFixed(1)}, ${P.y.toFixed(1)}), deaths ${P.deaths} (${P.lastDeath})`)
go(500, () => sw('lv-b').on, drive(57.5, { tol: 0.1, interactAt: [57.5] }), drive(44.5, { tol: 0.1, autoJump: false }))
check('B: Pink pulled the lever on the far side', sw('lv-b').on)
// Blue follows by the same route and takes his heart over the wall
risen = false
go(1200, () => B.x > 56, drive(60, { autoJump: false }), (p) => {
  if (p.y < 7.2) risen = true
  return risen ? { right: true } : { right: p.x < 47.9 }
})
check('B: Blue floated over too, taking his extra heart above the wall: 5 hearts', B.x > 55 && B.maxHearts === 5 && B.deaths === 0, `blue (${B.x.toFixed(1)}, ${B.y.toFixed(1)}), hearts ${B.maxHearts}`)

// C: two blades, a plate and a lever
holdCross(d, { plateX: 62.5, leverX: 80.5, afterX: 83, label: 'C (blades)' }, check)
d.go(1200, () => g.complete, drive(90.4), drive(91.4))
check('both reach the exit, hearts full', g.complete && B.hearts === B.maxHearts && P.hearts === P.maxHearts, `deaths ${B.deaths + P.deaths}`)
finish('Chapter 1 room 8')
