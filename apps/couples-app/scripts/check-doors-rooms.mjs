// Headless checks for player collision and the door system, plus an autopilot
// that PLAYS test room 2 as the two players would, to prove the room is
// solvable and that every door type behaves as specified:
//   node scripts/check-doors-rooms.mjs
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createGame, stepGame, resetGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { SIM } from '../src/doors/config.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const load = (name) => parseLevel(JSON.parse(fs.readFileSync(path.join(here, '../src/doors/levels', name), 'utf8')))
const room1 = load('room-1-movement.json')
const room2 = load('room-2-doors.json')

const none = { left: false, right: false, jump: false, crouch: false, interact: false }
let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

// ---------- a tiny autopilot ----------
const go = (x, tol = 0.3) => ({
  tick(p) {
    const dx = x - p.x
    const moving = Math.abs(dx) > tol
    // pressing into something while on the ground = jump (steps, ledges)
    const blocked = moving && p.onGround && Math.abs(p.vx) < 0.2
    return { ...none, left: moving && dx < 0, right: moving && dx > 0, jump: blocked }
  },
  done: (p) => Math.abs(x - p.x) <= tol,
})
const runJump = (takeoffX, targetX) => ({
  tick(p) {
    return { ...none, right: true, jump: p.x >= takeoffX && p.x < targetX }
  },
  done: (p) => p.x >= targetX && p.onGround,
})
const press = () => {
  let fired = false
  return {
    tick() {
      const input = { ...none, interact: !fired }
      fired = true
      return input
    },
    done: () => fired,
  }
}
const stay = () => ({ tick: () => none, done: () => false })

// runs both players' tasks until `until(game)` (default: every given task is done)
function phase(game, [blueTask, pinkTask], { until, seconds = 25 } = {}) {
  const tasks = [blueTask, pinkTask]
  for (let f = 0; f < seconds * 60; f++) {
    const inputs = tasks.map((t, i) => (t ? t.tick(game.players[i], game) : none))
    stepGame(game, inputs, SIM.STEP)
    const finished = until ? until(game) : tasks.every((t, i) => !t || t.done(game.players[i], game))
    if (finished) return true
  }
  return false
}
function settle(game, seconds = 1) {
  for (let f = 0; f < seconds * 60; f++) stepGame(game, [none, none], SIM.STEP)
}
const door = (game, id) => game.doors.doors.find((d) => d.id === id)

// =====================================================================
// PLAYER COLLISION (room 1's flat start area; blue x=4.5, pink x=7.5, ground y=22)
// =====================================================================
{
  const g = createGame(room1)
  settle(g, 1)
  const [blue, pink] = g.players
  phase(g, [{ tick: () => ({ ...none, right: true }), done: () => false }, stay()], { seconds: 3, until: () => false })
  check('walking into a standing partner stops you', blue.x < pink.x - 0.55 && Math.abs(pink.x - 7.5) < 0.05, `blue.x=${blue.x.toFixed(2)} pink.x=${pink.x.toFixed(2)}`)
  check('players never overlap', Math.abs(blue.x - pink.x) >= 0.59)

  // crouched partner is much lower: jumping over works
  const g2 = createGame(room1)
  settle(g2, 1)
  const b2 = g2.players[0]
  const p2 = g2.players[1]
  let crossed = false
  for (let f = 0; f < 240; f++) {
    const jump = b2.x > 6.2 && b2.x < 9 && f > 20
    stepGame(g2, [{ ...none, right: true, jump }, { ...none, crouch: true }], SIM.STEP)
    if (b2.x > p2.x + 0.65) crossed = true
  }
  check('one crouches + the other jumps = they swap sides', crossed && b2.x > p2.x, `blue.x=${b2.x.toFixed(2)} pink.x=${p2.x.toFixed(2)}`)

  // landing on the partner's head: you can stand on them
  const g3 = createGame(room1)
  settle(g3, 1)
  g3.players[0].x = 7.5
  g3.players[0].y = 18
  g3.players[0].vy = 0
  settle(g3, 1)
  check("you can land on the partner's head and stand there", g3.players[0].onGround && Math.abs(g3.players[0].y - (22 - 1.75)) < 0.02, `y=${g3.players[0].y.toFixed(2)}`)

  // the person underneath cannot stand up into someone... and can't jump into them
  g3.players[1].jumpHeldPrev = false
  stepGame(g3, [none, { ...none, jump: true }], SIM.STEP)
  settle(g3, 0.3)
  check("the person underneath can't jump through the one standing on them", g3.players[1].y >= 21.98)
}

// A 3-tall squeeze corridor: here you CAN'T hop over a standing partner (1.75 + 1.75 > 3),
// but you can over a crouched one (0.95 + 1.75 < 3) — so crouch + jump is required.
{
  const rows = 14
  const cols = 30
  const grid = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) {
      const wall = x === 0 || x === cols - 1 || y === 0 || y === rows - 1
      const ceiling = y <= 7 // opening rows 8..12 would be 5 tall; carve a 3-tall corridor instead
      line += wall || ceiling || y === 12 || y === 13 ? '#' : '.'
    }
    grid.push(line)
  }
  // rows 9..11 are open (3 tall); floor surface row 12
  grid[11] = grid[11].slice(0, 3) + 'B' + grid[11].slice(4, 7) + 'P' + grid[11].slice(8)
  grid[8] = '#'.repeat(cols)
  const squeeze = parseLevel({ name: 'squeeze', grid })
  const tryPass = (partnerCrouches) => {
    const g = createGame(squeeze)
    settle(g, 1)
    const b = g.players[0]
    const p = g.players[1]
    for (let f = 0; f < 300; f++) {
      const jump = b.x > 5.8 && b.x < 8.6 && f > 20
      stepGame(g, [{ ...none, right: true, jump }, { ...none, crouch: partnerCrouches }], SIM.STEP)
    }
    return b.x > p.x + 0.6
  }
  check('3-tall corridor: cannot hop over a STANDING partner', !tryPass(false))
  check('3-tall corridor: crouch + jump gets you past', tryPass(true))
}

// =====================================================================
// DOORS — focused behaviour checks in room 2
// =====================================================================
{
  // colored doors
  let g = createGame(room2)
  g.players[0].x = 20
  g.players[0].y = 15 // blue in the UPPER lane (pink's door)
  settle(g, 0.5)
  phase(g, [go(30), null], { seconds: 4, until: () => false })
  check("Blue can't pass the Pink door", g.players[0].x < 24, `x=${g.players[0].x.toFixed(2)}`)

  g = createGame(room2)
  g.players[1].x = 20
  g.players[1].y = 22 // pink in the LOWER lane (blue's door)
  settle(g, 0.5)
  phase(g, [null, go(30)], { seconds: 4, until: () => false })
  check("Pink can't pass the Blue door", g.players[1].x < 24, `x=${g.players[1].x.toFixed(2)}`)

  // plate door (either plate), closes when released, never on someone standing in it
  g = createGame(room2)
  g.players[0].x = 54.5
  g.players[0].y = 22
  g.players[1].x = 50
  g.players[1].y = 22
  settle(g, 0.5)
  check('standing on a plate holds its door open', door(g, 'plate-gate').open)
  g.players[0].x = 50.5 // blue steps off (teleport clear of the plate)
  g.players[1].x = 47
  settle(g, 0.3)
  check('door closes when the plate is released', !door(g, 'plate-gate').open)

  g = createGame(room2)
  g.players[0].x = 54.5
  g.players[0].y = 22
  g.players[1].x = 60.5
  g.players[1].y = 22 // pink waits INSIDE the doorway
  settle(g, 0.5)
  g.players[0].x = 50.5
  settle(g, 0.5)
  check('a door never closes on a player standing in it', door(g, 'plate-gate').open)
  g.players[1].x = 63
  settle(g, 0.3)
  check('...and shuts once they have left', !door(g, 'plate-gate').open)

  // coloured plate ignores the wrong player
  g = createGame(room2)
  g.players[1].x = 74.5 // pink on the BLUE plate
  g.players[1].y = 22
  g.players[0].x = 60
  g.players[0].y = 22
  settle(g, 0.5)
  check("a Blue plate isn't pressed by Pink", !g.doors.plates.find((p) => p.id === 'plate-blue').held)

  // both-players door + holdOpen
  g = createGame(room2)
  g.players[0].x = 74.5
  g.players[0].y = 22
  g.players[1].x = 76.5
  g.players[1].y = 22
  settle(g, 0.5)
  check('both-players door opens when BOTH stand on their plates', door(g, 'both-gate').open)
  g.players[0].x = 70 // blue steps off: the "both" condition is broken, the 4s hold starts
  settle(g, 1)
  check('after one player steps off, the door stays open for the hold time (1s in)', door(g, 'both-gate').open)
  g.players[1].x = 72
  settle(g, 2)
  check('...still open 3s after (hold is 4s)', door(g, 'both-gate').open)
  settle(g, 1.5)
  check('...and shuts once the hold-open time has run out', !door(g, 'both-gate').open)

  // switches
  g = createGame(room2)
  g.players[0].x = 94
  g.players[0].y = 22
  const interact = { ...none, interact: true }
  stepGame(g, [interact, none], SIM.STEP)
  stepGame(g, [none, none], SIM.STEP)
  check('toggle switch opens its door', g.doors.switches[0].on && door(g, 'toggle-gate').open)
  stepGame(g, [interact, none], SIM.STEP)
  stepGame(g, [none, none], SIM.STEP)
  check('toggle switch closes it again', !g.doors.switches[0].on && !door(g, 'toggle-gate').open)

  g = createGame(room2)
  g.players[1].x = 104
  g.players[1].y = 22
  for (let i = 0; i < 3; i++) {
    stepGame(g, [none, interact], SIM.STEP)
    stepGame(g, [none, none], SIM.STEP)
  }
  check('one-shot switch stays on however often it is pressed', g.doors.switches[1].on && g.doors.switches[1].used && door(g, 'once-gate').open)
  g.players[1].x = 60 // too far from any switch
  stepGame(g, [none, interact], SIM.STEP)
  check('a switch can only be flipped from nearby', g.doors.switches[1].on)

  // bypass switches (solo-testing aid)
  g = createGame(room2)
  g.players[0].x = 10
  g.players[0].y = 15
  stepGame(g, [interact, none], SIM.STEP)
  stepGame(g, [none, none], SIM.STEP)
  check('bypass switch unlocks the coloured doors for everyone', door(g, 'pink-door').unlocked && door(g, 'blue-door').unlocked)
  g.players[0].x = 20
  g.players[0].y = 15 // Blue in the upper lane — normally blocked by the Pink door
  settle(g, 0.3)
  phase(g, [go(30), null], { seconds: 4, until: () => false })
  check('...so Blue can now pass the Pink door', g.players[0].x > 26, `x=${g.players[0].x.toFixed(2)}`)

  g = createGame(room2)
  g.players[0].x = 57
  g.players[0].y = 22
  stepGame(g, [interact, none], SIM.STEP)
  stepGame(g, [none, none], SIM.STEP)
  check('bypass opens the plate door with no plate held', door(g, 'plate-gate').open && !g.doors.plates[0].held)
  g.players[0].x = 63 // stand in the doorway
  g.players[0].x = 60.5
  settle(g, 0.2)
  g.players[0].x = 58
  // switch the bypass off while standing close: door shuts only once nobody is inside it
  g.players[1].x = 60.5
  g.players[1].y = 22
  stepGame(g, [interact, none], SIM.STEP)
  stepGame(g, [none, none], SIM.STEP)
  check('switching bypass off never closes a door on someone inside it', door(g, 'plate-gate').open)
  g.players[1].x = 64
  settle(g, 0.3)
  check('...and it shuts once they leave', !door(g, 'plate-gate').open)

  // death must not reset door/switch state, but R must
  g = createGame(room2)
  g.doors.switches[0].on = true
  g.players[0].y = 60 // falls out of the room
  settle(g, 0.2)
  check('dying respawns the player but keeps switch state', g.players[0].deaths === 1 && g.doors.switches[0].on)
  resetGame(g)
  check('a full reset restores doors and switches', !g.doors.switches[0].on && !door(g, 'toggle-gate').open)
}

// =====================================================================
// SOLVABILITY — an autopilot plays test room 2 start to finish.
// The corridors are 3 tiles tall, so nobody can hop over a standing partner:
// Pink leads and Blue follows, which is the order the autopilot keeps.
// =====================================================================
{
  const g = createGame(room2)
  settle(g, 0.5)
  const log = (msg, ok) => {
    if (!ok) check(msg, false)
    return ok
  }
  let ok = true

  // 1. split: Pink jumps the shaft to the upper lane; Blue then drops in and takes the lower lane
  ok = ok && log('pink jumps the shaft onto the upper lane', phase(g, [null, runJump(12.3, 17.5)], { seconds: 8 }))
  ok = ok && log('both reach x=36 through their own coloured doors', phase(g, [go(36), go(36)], { seconds: 30 }))
  ok = ok && log('both reach the hall (pink drops down), pink ahead', phase(g, [go(44), go(46.5)], { seconds: 15 }))
  ok = ok && log('both pass the gray gate', phase(g, [go(51.5), go(53)], { seconds: 15 }))

  // 2. plate door: Pink walks on ahead, Blue holds plate A, Pink goes through to plate B; then Blue follows
  ok = ok && log('pink waits past plate A while blue stands on it', phase(g, [go(54.5), go(57)], { seconds: 15 }))
  ok = ok && log('pink reaches plate B through the open door', phase(g, [stay(), go(66.5)], { seconds: 15, until: (gm) => Math.abs(gm.players[1].x - 66.5) < 0.3 }))
  ok = ok && log('blue follows through (pink holds plate B)', phase(g, [go(64), stay()], { seconds: 15, until: (gm) => Math.abs(gm.players[0].x - 64) < 0.3 }))

  // 3. both-players door
  ok = ok && log('both walk on to the two coloured plates', phase(g, [go(74.5), go(76.5)], { seconds: 20, until: (gm) => door(gm, 'both-gate').open }))
  ok = ok && log('both run through the hold-open door before it shuts', phase(g, [go(92), go(96)], { seconds: 8 }))
  ok = ok && log('the both-gate was passed', g.players[0].x > 89 && g.players[1].x > 89)

  // 4. switches
  ok = ok && log('blue reaches the toggle switch', phase(g, [go(93.7), stay()], { seconds: 8, until: (gm) => Math.abs(gm.players[0].x - 93.7) < 0.4 }))
  settle(g, 0.6) // come to a stop first, like a person would
  phase(g, [press(), null], { seconds: 1 })
  ok = ok && log('toggle gate is open', door(g, 'toggle-gate').open)
  ok = ok && log('both pass the toggle gate', phase(g, [go(102), go(103)], { seconds: 15 }))
  ok = ok && log('pink reaches the one-shot switch', phase(g, [stay(), go(104.2)], { seconds: 8, until: (gm) => Math.abs(gm.players[1].x - 104.2) < 0.4 }))
  settle(g, 0.6)
  phase(g, [null, press()], { seconds: 1 })
  ok = ok && log('once-gate is open', door(g, 'once-gate').open)

  // 5. exit
  ok = ok && log('both reach the exit', phase(g, [go(110.5), go(111.5)], { seconds: 15, until: (gm) => gm.complete }))
  check('test room 2 is solvable start to finish (autopilot)', ok && g.complete, `finished at t=${g.time.toFixed(1)}s`)
}

// A lone tester can skip every co-op-only door using the bypass switches.
{
  const g = createGame(room2)
  settle(g, 0.5)
  // Blue alone, never touching a plate: bypass the split, the plate gate and the both-gate
  const interactAt = (x, y, id) => {
    const p = g.players[0]
    p.x = x
    p.y = y
    p.vx = 0
    settle(g, 0.2)
    stepGame(g, [{ ...none, interact: true }, none], SIM.STEP)
    stepGame(g, [none, none], SIM.STEP)
    return g.doors.switches.find((sw) => sw.id === id).on
  }
  const onA = interactAt(10, 15, 'bypass-split')
  g.players[1].x = 7.5 // pink stays out of the way
  const onB = interactAt(57, 22, 'bypass-plate')
  const onC = interactAt(84, 22, 'bypass-both')
  check('all three bypass switches can be flipped', onA && onB && onC)
  check('with bypass on, no plate is held and the co-op doors are open', door(g, 'plate-gate').open && door(g, 'both-gate').open && !g.doors.plates.some((p) => p.held))
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll door/room checks passed')
process.exit(failures ? 1 : 0)
