// Scripted playthrough of chapter 1, room 1 (the tutorial), with each of the two characters in each role:
//   node scripts/check-doors-ch1-01.mjs
import { loadRoom, makeChecker, pilot } from './lib/pilot.mjs'

const { check, finish } = makeChecker()

function play(lowerIsPink) {
  const tag = lowerIsPink ? 'Pink falls' : 'Blue falls'
  const g = loadRoom('ch1-01-separated')
  const { B, P, idle, drive, until, wait, step } = pilot(g)
  const L = lowerIsPink ? P : B // falls through the trapdoor to the lower level
  const U = lowerIsPink ? B : P // stays on the upper level
  // map "lower player driver, upper player driver" onto (blue, pink)
  const go = (limit, cond, dL = idle, dU = idle) => until(limit, cond, lowerIsPink ? dU : dL, lowerIsPink ? dL : dU)
  const sw = (id) => g.doors.switches.find((s) => s.id === id)
  const door = (id) => g.doors.doors.find((d) => d.id === id)
  const plate = (id) => g.doors.plates.find((p) => p.id === id)

  // the leader is the one nearer the exit door: put the lower player ahead
  L.x = 12.5
  U.x = 9.5
  check(`[${tag}] the intro room is on the upper level, with the lower level beneath`, L.y === 9 && U.y === 9 && g.level.rows === 26)

  // 1. the trapdoor: whoever gets to the door first falls; it seals
  go(400, () => L.y > 17.5, drive(21.5, { autoJump: false }), drive(19.2, { autoJump: false }))
  check(`[${tag}] the first one to approach falls through the trapdoor`, L.y > 17.5 && U.y < 9.5, `lower y=${L.y.toFixed(1)}, upper y=${U.y.toFixed(1)}`)
  go(120, () => g.traps.traps[0].mode === 'sealed', idle, drive(19.2, { autoJump: false }))
  check(`[${tag}] ...and it seals, keeping them apart`, g.traps.traps[0].mode === 'sealed')
  go(200, () => U.x > 22.8, idle, drive(23.4, { autoJump: false }))
  check(`[${tag}] ...the upper player can walk over it (it only dropped the first)`, U.y < 9.5 && U.x > 22.5)
  check(`[${tag}] ...but the upper door is locked`, !door('door-up1').open)

  // 2. the lever below opens the upper door
  go(600, () => sw('lever-1').on, drive(30.0, { tol: 0.1, interactAt: [30] }), drive(23.4, { autoJump: false }))
  check(`[${tag}] the lower player's lever opens the upper door`, sw('lever-1').on && door('door-up1').open)

  // 3-4. the two levels' first obstacles, side by side
  go(2400, () => U.x > 60 && L.x > 57.8, drive(58.5, { tol: 0.1, jumpAt: [35.1], crouchIn: [[42.4, 47.6]] }), drive(60.5, { crouchIn: [[36.6, 43.5]] }))
  check(`[${tag}] both got past their pits, ledges and crawlspaces`, U.x > 60 && L.x > 57.8 && L.deaths + U.deaths === 0, `upper x=${U.x.toFixed(1)}, lower x=${L.x.toFixed(1)}, deaths ${L.deaths + U.deaths}`)
  go(200, () => plate('plate-L1').held, drive(58.5, { tol: 0.1 }), drive(60.5))
  check(`[${tag}] the lower player's plate opens the upper player's door`, plate('plate-L1').held && door('door-up2').open)

  // 5. the upper player passes and stands on THEIR plate, which opens the lower player's door
  go(600, () => plate('plate-U1').held, drive(58.5, { tol: 0.1 }), drive(66.5, { tol: 0.1 }))
  check(`[${tag}] the upper player gets through and holds their own plate`, plate('plate-U1').held && U.x > 63)
  go(500, () => L.x > 71.5, drive(72.5), drive(66.5, { tol: 0.1 }))
  check(`[${tag}] ...so the lower player can pass the door they hold open`, L.x > 71.5, `lower x=${L.x.toFixed(1)}`)

  // 6. a lever for each way
  go(500, () => sw('lever-2').on, drive(76.5, { tol: 0.1, interactAt: [76.5] }), drive(66.5, { tol: 0.1 }))
  check(`[${tag}] the lower player's second lever opens the next upper door`, sw('lever-2').on && door('door-up3').open)
  go(600, () => sw('lever-3').on, drive(86.5), drive(84.5, { tol: 0.1, interactAt: [84.5] }))
  check(`[${tag}] the upper player's lever opens the next lower door`, sw('lever-3').on && door('door-low2').open)

  // 7. the upper floor ends; the upper player drops down and they are reunited
  go(900, () => L.x > 99.5 && U.y > 17.5 && U.x > 96, drive(100.4), drive(99.0, { autoJump: false }))
  check(`[${tag}] the upper player drops down and they are reunited`, U.y > 17.5 && L.y > 17.5 && Math.abs(U.x - L.x) < 6, `upper (${U.x.toFixed(1)}, ${U.y.toFixed(1)}), lower (${L.x.toFixed(1)}, ${L.y.toFixed(1)})`)

  // 8. the last pit together, then the exit
  go(500, () => L.x > 106, drive(112.4, { jumpAt: [101.3] }), drive(99.0, { autoJump: false }))
  go(1500, () => g.complete, drive(112.4), drive(113.2, { jumpAt: [101.3] }))
  check(`[${tag}] they jump the last pit and leave together`, g.complete, `deaths ${L.deaths + U.deaths}, hearts ${B.hearts}/${P.hearts}`)
  void wait
  void step
}

play(true)
play(false)
finish('Chapter 1 room 1')
