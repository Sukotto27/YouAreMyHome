// Headless checks for the second batch of traps — crushers, swinging blades and
// wind fans — and how a drawn line answers each of them:
//   node scripts/check-doors-traps2.mjs
import fs from 'node:fs'
import { createGame, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { beginStroke, endStroke, extendStroke } from '../src/doors/drawing.js'
import { SIM } from '../src/doors/config.js'

const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false }
let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

// 100 x 28 test room: floor rows 22.., cave ceiling rows 0..3
function room(traps = [], checkpoints = [], holes = []) {
  const cols = 100
  const rows = 28
  const grid = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) {
      let ch = '.'
      if (x === 0 || x === cols - 1 || y <= 3) ch = '#'
      if (y >= 22 && !holes.some((h) => x >= h[0] && x <= h[1])) ch = '#'
      line += ch
    }
    grid.push(line)
  }
  grid[21] = grid[21].slice(0, 4) + 'B' + grid[21].slice(5, 7) + 'P' + grid[21].slice(8)
  return parseLevel({ name: 'trap-test', grid, traps, checkpoints })
}
const step = (g, blue = none, pink = none, frames = 1) => {
  for (let f = 0; f < frames; f++) stepGame(g, [blue, pink], SIM.STEP)
}
const settle = (g, seconds) => step(g, none, none, Math.round(seconds * 60))
const BLUE = 0
const PINK = 1
function place(g, who, x, y = 22) {
  const p = g.players[who]
  p.x = x
  p.y = y
  p.vx = 0
  p.vy = 0
  p.onGround = true
  p.invuln = 0
}
const start = (g) => {
  settle(g, 1)
  g.players.forEach((p) => (p.invuln = 0))
}
const pressDraw = (g, who) => {
  const press = { ...none, draw: true }
  step(g, who === 0 ? press : none, who === 1 ? press : none)
  step(g)
}
const drawLine = (g, who, a, b, n = 30) => {
  const player = g.players[who]
  if (!beginStroke(g, player, a.x, a.y)) return null
  for (let i = 1; i <= n; i++) extendStroke(g, player, a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)
  return endStroke(g, player)
}
const shield = (g, a, b) => {
  pressDraw(g, BLUE)
  return drawLine(g, BLUE, a, b)
}
function runUntilDeath(g, who, seconds, pinkInput = none) {
  const before = g.players[who].deaths
  for (let f = 0; f < seconds * 60; f++) {
    step(g, none, pinkInput)
    if (g.players[who].deaths > before) return g.time
  }
  return null
}

// ---------------- crusher ----------------
{
  // rests 1.8s, shakes 0.5s, slams at t = 2.3 (from t = 0); head box x 50..52, y 4..6; travels to the floor
  const crusher = { id: 'c', type: 'crusher', x: 50, y: 4, w: 2, h: 2, dir: 'down', travel: 16, offset: 0 }
  const g = createGame(room([crusher]))
  start(g)
  place(g, PINK, 51)
  const died = runUntilDeath(g, PINK, 3)
  check('a crusher slams down on whoever is under it', died !== null && died > 2.6 && died < 3.3, `died at t=${died?.toFixed(2)} (the slam starts at t=2.30 and takes ~0.7s to reach the floor)`)

  const away = createGame(room([crusher]))
  start(away)
  place(away, PINK, 56)
  settle(away, 6)
  check('...it leaves someone beside it alone', away.players[PINK].deaths === 0)

  const waiting = createGame(room([crusher]))
  start(waiting)
  place(waiting, PINK, 51)
  settle(waiting, 1.0) // t = 2.0: still resting, then shaking from 1.8
  check('...and it only warns (shakes) before it comes down', waiting.players[PINK].deaths === 0 && waiting.traps.traps[0].mode === 'warn', waiting.traps.traps[0].mode)

  const cycle = createGame(room([crusher]))
  start(cycle)
  place(cycle, PINK, 70)
  const modes = new Set()
  let bottom = 0
  for (let f = 0; f < 60 * 8; f++) {
    step(cycle)
    modes.add(cycle.traps.traps[0].mode)
    bottom = Math.max(bottom, cycle.traps.traps[0].dist)
  }
  check('it goes rest -> warn -> slam -> hold -> rise and repeats', ['rest', 'warn', 'slam', 'hold', 'rise'].every((m) => modes.has(m)), [...modes].join(','))
  check('...and stops at the floor, not inside it', Math.abs(bottom - 16) < 0.06, `reached ${bottom.toFixed(2)} of 16`)

  const timing = createGame(room([crusher]))
  start(timing)
  place(timing, PINK, 51)
  // walking in while the head is up (t = 3.6 onwards the head is rising/risen): wait out the first slam
  timing.players[PINK].x = 70
  settle(timing, 3.0) // t = 4.0: slam done, rising
  settle(timing, 1.5) // head risen: rest
  place(timing, PINK, 51)
  settle(timing, 0.5)
  check('...with the head up the space under it is safe to stand in', timing.players[PINK].deaths === 0 && timing.traps.traps[0].mode === 'rest')

  const s = createGame(room([crusher]))
  start(s)
  place(s, PINK, 51)
  shield(s, { x: 48.5, y: 12 }, { x: 53.5, y: 12 })
  let deepest = 0
  const before = s.players[PINK].deaths
  for (let f = 0; f < 60 * 2.8; f++) {
    step(s)
    deepest = Math.max(deepest, s.traps.traps[0].dist)
  }
  check('a drawn line under the crusher props it up: the person below is safe', s.players[PINK].deaths === before)
  check('...the head stops on the line', deepest < 8 && deepest > 5, `deepest ${deepest.toFixed(2)} (the line is 6 below its rest)`)

  // a sideways crusher
  const side = { id: 'cs', type: 'crusher', x: 60, y: 19, w: 2, h: 3, dir: 'right', travel: 10, offset: 0 }
  const sg = createGame(room([side]))
  start(sg)
  place(sg, PINK, 65)
  check('a crusher can slam sideways too', runUntilDeath(sg, PINK, 3) !== null)
}

// ---------------- swinging blade ----------------
{
  // pivot at (60, 8); arm 13.4 so the blade just clears the floor at the bottom of its swing
  const blade = { id: 'b', type: 'blade', x: 60, y: 8, length: 13.4, amplitude: 40, period: 4, offset: 0 }
  const g = createGame(room([blade]))
  start(g) // t = 1.0: the blade is far to the right, swinging back
  place(g, PINK, 60)
  const died = runUntilDeath(g, PINK, 2)
  check('a swinging blade cuts down whoever is under the bottom of its swing', died !== null && died > 1.6 && died < 2.3, `died at t=${died?.toFixed(2)} (it passes the middle at t=2.0)`)

  const far = createGame(room([blade]))
  start(far)
  place(far, PINK, 45)
  settle(far, 8)
  check('...but not someone well outside its arc', far.players[PINK].deaths === 0)

  let reach = 0
  const sweep = createGame(room([blade]))
  for (let f = 0; f < 60 * 8; f++) {
    step(sweep)
    reach = Math.max(reach, Math.abs(sweep.traps.traps[0].cx - 60))
  }
  check('the blade swings out to its amplitude and back', Math.abs(reach - 13.4 * Math.sin((40 * Math.PI) / 180)) < 0.2, `reached ${reach.toFixed(2)} sideways`)

  const open = createGame(room([blade]))
  start(open)
  place(open, PINK, 57)
  check('(setup) without a line, a player 3 tiles to the side is cut down as the blade swings back', runUntilDeath(open, PINK, 3) !== null)

  const s = createGame(room([blade]))
  start(s)
  place(s, PINK, 57)
  shield(s, { x: 63, y: 10.5 }, { x: 63, y: 22.4 }) // the blade is out on the right at this moment and swinging back
  check('a drawn line in the swing protects whoever stands behind it', runUntilDeath(s, PINK, 2.8) === null)
  check('...the blade is held against the line', s.traps.traps[0].cx > 63, `blade at x=${s.traps.traps[0].cx.toFixed(2)}`)
}

// ---------------- wind ----------------
{
  const tail = { id: 'w', type: 'wind', x: 30, y: 20, dir: 'right', length: 10, width: 4, speed: 4 }
  const g = createGame(room([tail]))
  start(g)
  place(g, PINK, 34)
  settle(g, 1.0)
  const moved = g.players[PINK].x - 34
  check('a sideways wind pushes someone standing still along', moved > 3.0 && moved < 5.0, `moved ${moved.toFixed(2)} in 1s (speed 4)`)
  check('...and never hurts', g.players[PINK].deaths === 0)

  const out = createGame(room([tail]))
  start(out)
  place(out, PINK, 45) // beyond the 10-tile stream
  settle(out, 1)
  check('...someone out of the stream is untouched', Math.abs(out.players[PINK].x - 45) < 0.01)

  const against = createGame(room([tail]))
  start(against)
  place(against, PINK, 34)
  step(against, none, { ...none, left: true }, 60)
  check('running into the wind is slower than normal', 34 - against.players[PINK].x < 3.5 && 34 - against.players[PINK].x > 1.0, `ran ${(34 - against.players[PINK].x).toFixed(2)} in 1s (6 would be unopposed)`)

  const s = createGame(room([tail]))
  start(s)
  place(s, PINK, 34)
  shield(s, { x: 32, y: 17 }, { x: 32, y: 22.4 })
  settle(s, 1.0)
  check('a drawn line cuts the stream: behind it the air is still', Math.abs(s.players[PINK].x - 34) < 0.4, `x=${s.players[PINK].x.toFixed(2)} (a few frames of wind before the line existed)`)
  const beam = s.traps.traps[0].beam
  check('...the stream stops at the line', beam && beam.x1 < 32.2, beam ? `ends at x=${beam.x1.toFixed(2)}` : 'off')

  const pulsing = { ...tail, period: 4, on: 2, offset: 0 }
  const p = createGame(room([pulsing]))
  settle(p, 2.5) // t = 2.5: off (on until 2.0)
  place(p, PINK, 34)
  settle(p, 0.5)
  check('a pulsing fan only blows during its on-time', Math.abs(p.players[PINK].x - 34) < 0.01, `x=${p.players[PINK].x.toFixed(2)}`)

  // an updraft lifts a player off the floor
  const up = { id: 'u', type: 'wind', x: 40, y: 22, dir: 'up', length: 12, width: 2 }
  const u = createGame(room([up]))
  start(u)
  place(u, PINK, 40)
  let top = 22
  for (let f = 0; f < 120; f++) {
    step(u)
    top = Math.min(top, u.players[PINK].y)
  }
  check('an updraft carries a player well off the ground', top < 17, `highest feet y=${top.toFixed(1)} (stream tops out at 10)`)
  step(u, none, { ...none, right: true }, 90)
  check('...and walking out of the stream, they drop back down', u.players[PINK].onGround && u.players[PINK].y > 21, `y=${u.players[PINK].y.toFixed(1)}`)

  // an updraft lets a player clear a wall they could never jump
  const wallGrid = room([up])
  for (let y = 12; y < 22; y++) for (let x = 43; x <= 45; x++) wallGrid.solid[y * wallGrid.cols + x] = 1 // a 10-tall wall, 3 wide
  const w = createGame(wallGrid)
  start(w)
  place(w, PINK, 39)
  let over = false
  let risen = false
  for (let f = 0; f < 60 * 5 && !over; f++) {
    if (w.players[PINK].y < 11) risen = true // once lifted clear, run for the wall
    step(w, none, { ...none, right: risen })
    if (w.players[PINK].x > 46) over = true
  }
  check('an updraft lifts you over a wall far too tall to jump', over, `x=${w.players[PINK].x.toFixed(1)}`)
}

// ---------------- the real room parses and runs ----------------
{
  const json = JSON.parse(fs.readFileSync(new URL('../src/doors/levels/room-4-crushers-wind.json', import.meta.url), 'utf8'))
  const g = createGame(parseLevel(json))
  let threw = null
  try {
    settle(g, 10)
  } catch (e) {
    threw = e
  }
  check('room 4 loads and runs for 10 seconds', !threw, threw ? String(threw) : `${g.traps.traps.length} traps, ${g.traps.checkpoints.length} checkpoints`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll trap (batch 2) checks passed')
process.exit(failures ? 1 : 0)
