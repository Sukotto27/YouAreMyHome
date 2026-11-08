// Scripted playthrough of chapter 1, room 2 (Pipe Dreams):
//   node scripts/check-doors-ch1-02.mjs
import { loadRoom, makeChecker } from './lib/pilot.mjs'
import { duo, holdCross } from './lib/routines.mjs'

const { check, finish } = makeChecker()
const g = loadRoom('ch1-02-pipe-dreams')
const d = duo(g)
const { lead, follow, go, drive } = d
const door = (id) => g.doors.doors.find((x) => x.id === id)
const sw = (id) => g.doors.switches.find((s) => s.id === id)
const flames = () => g.traps.traps.filter((t) => t.id.startsWith('jet-') && t.id !== 'jet-pit')

check('both start with 3 hearts, and the doors are shut', lead.hearts === 3 && follow.hearts === 3 && !door('kd2').open && !door('door-a').open)

// gate 1: plate door + lever
holdCross(d, { plateX: 10.5, leverX: 22.5, afterX: 25, label: 'gate 1 (plate door)' }, check)

// gate 2: flames
go(300, () => follow.x > 28 && lead.x > 30, drive(31, { autoJump: false }), drive(28.5, { autoJump: false }))
check('gate 2: a corridor of flames lies ahead', flames().length === 4)
holdCross(d, { plateX: 32.5, leverX: 50.5, afterX: 52.5, label: 'gate 2 (flames)' }, check)
check('gate 2: nobody was burned (the plate switched the flames off)', lead.deaths + follow.deaths === 0)
check('gate 2: ...and the lever put them out for good', flames().every((j) => j.off))

// gate 3: key behind a plate door
go(600, () => follow.x > 54 && lead.x > 55.5, drive(57.5, { autoJump: false }), drive(54.5, { autoJump: false }))
go(900, () => Math.abs(follow.x - 56.5) < 0.25, drive(58.6, { autoJump: false }), drive(56.5, { tol: 0.1, autoJump: false }))
go(1200, () => g.doors.keys[0].holder === lead.id, drive(66.5, { tol: 0.1, autoJump: false }), drive(56.5, { tol: 0.1, autoJump: false })) // (the key is under a crate: walk into it to push it off)
check('gate 3: the leader reached the key behind the door the follower holds open', g.doors.keys[0].holder === lead.id)
go(900, () => sw('lv-k').on, drive(69.5, { tol: 0.1, interactAt: [69.5] }), drive(56.5, { tol: 0.1, autoJump: false }))
check('gate 3: ...and pulled the lever that keeps it open for good', door('kd1').open && sw('lv-k').on)
go(1500, () => follow.x > 71 && lead.x > 75, drive(76), drive(71.5))
check("gate 3: the follower followed through, and the leader's key opened the key door", door('kd2').open && lead.x > 74 && follow.x > 70.5, `lead ${lead.x.toFixed(1)}, follow ${follow.x.toFixed(1)}`)
check('gate 3: ...which spent the key', g.doors.keys[0].used)

// gate 4: the pit under the flame
go(500, () => follow.x > 74 && lead.x > 76, drive(77.5, { autoJump: false }), drive(75, { autoJump: false }))
holdCross(d, { plateX: 79.5, leverX: 90.5, afterX: 91.2, leaderOpts: { jumpAt: [83.3] }, followerOpts: { jumpAt: [83.3] }, label: 'gate 4 (pit and flame)' }, check)
go(900, () => g.complete, drive(94.4), drive(95.4))
check('both reach the exit with all their hearts', g.complete && lead.hearts === 3 && follow.hearts === 3, `deaths ${lead.deaths + follow.deaths}`)
finish('Chapter 1 room 2')
