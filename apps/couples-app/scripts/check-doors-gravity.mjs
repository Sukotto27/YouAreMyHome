// Headless checks for gravity doors and the ceiling "second floor" (milestone 6):
//   node scripts/check-doors-gravity.mjs
import { createGame, killPlayer, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { beginStroke, endStroke, extendStroke } from '../src/doors/drawing.js'
import { bodyBottom, bodyTop, setGravity } from '../src/doors/gravity.js'
import { SIM } from '../src/doors/config.js'

const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false }
let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

// 80 x 28 room: floor rows 22.., ceiling rows 0..3 (its underside, y = 4, is the second floor).
// extra.solid = [[x0,x1,y0,y1], ...] adds blocks.
function room(extra = {}) {
  const { solid = [], ...rest } = extra
  const cols = 80
  const rows = 28
  const grid = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) {
      let ch = x === 0 || x === cols - 1 || y <= 3 || y >= 22 ? '#' : '.'
      for (const [x0, x1, y0, y1] of solid) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) ch = '#'
      line += ch
    }
    grid.push(line)
  }
  grid[21] = grid[21].slice(0, 4) + 'B' + grid[21].slice(5, 7) + 'P' + grid[21].slice(8)
  return parseLevel({ name: 'gravity-test', grid, ...rest })
}
const BLUE = 0
const PINK = 1
const R = { ...none, right: true }
const L = { ...none, left: true }
const step = (g, blue = none, pink = none, frames = 1) => {
  for (let f = 0; f < frames; f++) stepGame(g, [blue, pink], SIM.STEP)
}
const settle = (g, seconds) => step(g, none, none, Math.round(seconds * 60))
const pl = (g, who) => g.players[who]
function place(g, who, x, y = 22) {
  const p = pl(g, who)
  p.x = x
  p.y = y
  p.vx = p.vy = 0
  p.onGround = true
  p.invuln = 0
}
// put a player on the ceiling (feet at the underside of the top slab, y = 4)
function placeCeiling(g, who, x) {
  const p = pl(g, who)
  p.grav = -1
  p.facing = -p.facing
  place(g, who, x, 4)
  p.grav = -1
}
const gate = (id, x, set = 'up', extra = {}) => ({ id, x, y: 4, h: 18, set, ...extra }) // a field the whole height of the room

// ---------------- going up ----------------
{
  const g = createGame(room({ gravity: [gate('g1', 20)] }))
  place(g, PINK, 17)
  step(g, none, R, 60)
  check('walking into an "up" gravity door puts you on the ceiling', pl(g, PINK).grav === -1)
  settle(g, 1.5)
  const p = pl(g, PINK)
  check('...you fall UP and land on the underside of the ceiling', p.onGround && Math.abs(p.y - 4) < 0.01, `feet y=${p.y.toFixed(2)}`)
  check('...your body hangs below your feet', Math.abs(bodyTop(p) - 4) < 0.01 && Math.abs(bodyBottom(p) - (4 + 1.75)) < 0.01)
}
{
  const h = createGame(room({ gravity: [gate('g1', 20)] }))
  place(h, PINK, 19.8)
  const top0 = bodyTop(pl(h, PINK))
  const bottom0 = bodyBottom(pl(h, PINK))
  step(h, none, R, 8)
  check('the body stays exactly where it is at the moment of the flip (only the feet move)', pl(h, PINK).grav === -1 && Math.abs(bodyTop(pl(h, PINK)) - top0) < 0.3 && Math.abs(bodyBottom(pl(h, PINK)) - bottom0) < 0.3, `top ${top0.toFixed(2)} -> ${bodyTop(pl(h, PINK)).toFixed(2)}, bottom ${bottom0.toFixed(2)} -> ${bodyBottom(pl(h, PINK)).toFixed(2)}`)
}
{
  const g = createGame(room({ gravity: [gate('g1', 20)] }))
  place(g, PINK, 17)
  step(g, none, R, 60)
  settle(g, 1.5)
  const x0 = pl(g, PINK).x
  step(g, none, R, 30)
  check('upside down, "right" moves you screen-right, which is world-LEFT', pl(g, PINK).x < x0 - 1.5, `x ${x0.toFixed(1)} -> ${pl(g, PINK).x.toFixed(1)}`)
  check('...and walking leaves you on the ceiling', pl(g, PINK).onGround && Math.abs(pl(g, PINK).y - 4) < 0.01)
}

// ---------------- flipping back, and the other settings ----------------
{
  const g = createGame(room({ gravity: [gate('up', 20, 'up'), gate('down', 30, 'down')] }))
  place(g, PINK, 17)
  step(g, none, R, 60)
  check('"up" puts you on the ceiling', pl(g, PINK).grav === -1)
  settle(g, 1.5)
  // walk toward +x world = "left" key, through the "down" door at x=30? it's at +x: go left key
  step(g, none, L, 140)
  check('walking (upside down) through a "down" door puts you back on the floor', pl(g, PINK).grav === 1, `x=${pl(g, PINK).x.toFixed(1)}`)
  settle(g, 1.5)
  check('...and you fall back down to the floor', pl(g, PINK).onGround && Math.abs(pl(g, PINK).y - 22) < 0.01)
  step(g, none, L, 160)
  check('...and the "up" door sends you up again when you walk back through it', pl(g, PINK).grav === -1, `x=${pl(g, PINK).x.toFixed(1)}`)
  const h = createGame(room({ gravity: [gate('up', 20, 'up')] }))
  place(h, PINK, 17)
  step(h, none, R, 200)
  check('an "up" door does nothing to someone already up there', pl(h, PINK).grav === -1)
  const w = createGame(room({ gravity: [gate('blueonly', 20, 'up', { who: 'blue' })] }))
  place(w, PINK, 17)
  step(w, none, R, 60)
  check('"who": "blue" leaves Pink alone', pl(w, PINK).grav === 1)
}
{
  // one flip per entry: standing inside the field doesn't keep flipping you
  const g = createGame(room({ gravity: [gate('g1', 20)] }))
  place(g, PINK, 20.5)
  settle(g, 1)
  check('standing in a gravity door flips you once, not every frame', pl(g, PINK).grav === -1)
}

// ---------------- the ceiling is a real second floor ----------------
{
  const g = createGame(room({ solid: [[30, 31, 4, 8]] })) // a stalactite hanging from the ceiling
  placeCeiling(g, PINK, 36)
  step(g, none, L, 60) // "left" is world-right, away from it: go the other way
  const x1 = pl(g, PINK).x
  placeCeiling(g, PINK, 36)
  step(g, none, R, 90) // world-left, toward the stalactite
  check('a hanging block stops a player on the ceiling', pl(g, PINK).x > 32.2 && pl(g, PINK).x < 33.5, `x=${pl(g, PINK).x.toFixed(2)} (block ends at 32)`)
  void x1

  const floorBlock = createGame(room({ solid: [[30, 31, 19, 21]] })) // a block on the floor
  placeCeiling(floorBlock, PINK, 36)
  step(floorBlock, none, R, 90)
  check('...but a block on the floor is no obstacle up there', pl(floorBlock, PINK).x < 30, `x=${pl(floorBlock, PINK).x.toFixed(2)}`)
}
{
  const g = createGame(room())
  placeCeiling(g, PINK, 20)
  let lowest = 4
  step(g, none, { ...none, jump: true }, 1)
  for (let f = 0; f < 40; f++) {
    step(g, none, { ...none, jump: f < 25 })
    lowest = Math.max(lowest, pl(g, PINK).y)
  }
  check('jumping on the ceiling goes DOWN (away from it) about as far as a normal jump', lowest - 4 > 2.0 && lowest - 4 < 3.0, `${(lowest - 4).toFixed(2)} tiles`)
  settle(g, 1)
  check('...and you land back on the ceiling', pl(g, PINK).onGround && Math.abs(pl(g, PINK).y - 4) < 0.01)
  placeCeiling(g, PINK, 20)
  step(g, none, { ...none, crouch: true }, 5)
  check('crouching on the ceiling shortens the body downward from the ceiling', pl(g, PINK).crouching && Math.abs(bodyTop(pl(g, PINK)) - 4) < 0.01 && pl(g, PINK).h < 1.2)
}

// ---------------- deaths and checkpoints ----------------
{
  const g = createGame(room({ gravity: [gate('g1', 20)] }))
  place(g, PINK, 17)
  step(g, none, R, 60)
  settle(g, 1)
  killPlayer(pl(g, PINK), 'test')
  check('dying sends you back right-way-up to the start', pl(g, PINK).grav === 1 && Math.abs(pl(g, PINK).y - 22) < 0.1)
}
{
  const g = createGame(room({ checkpoints: [{ id: 'cp', x: 40, y: 4, ceiling: true }, { id: 'cpf', x: 50, y: 21 }] }))
  placeCeiling(g, PINK, 40.5)
  step(g)
  check('a ceiling flag is picked up by someone standing on the ceiling', g.traps.checkpoints[0].reached.pink && pl(g, PINK).spawn.grav === -1)
  place(g, BLUE, 40.5)
  step(g)
  check('...but not by someone walking on the floor below it', !g.traps.checkpoints[0].reached.blue)
  killPlayer(pl(g, PINK), 'test')
  step(g)
  check('...and dying there respawns you on the ceiling', pl(g, PINK).grav === -1 && Math.abs(pl(g, PINK).y - 4) < 0.01, `y=${pl(g, PINK).y.toFixed(2)}`)
  settle(g, 0.5)
  check('...where you stay put', pl(g, PINK).onGround && pl(g, PINK).grav === -1)
}

// ---------------- hazards see the flipped body ----------------
{
  const high = { id: 'l', type: 'laser', x: 30, y: 5, dir: 'right', length: 10 } // a beam at ceiling-walker height
  const low = { id: 'l2', type: 'laser', x: 30, y: 21, dir: 'right', length: 10 } // a beam at floor height
  const g = createGame(room({ traps: [high] }))
  placeCeiling(g, PINK, 34)
  const d0 = pl(g, PINK).deaths
  step(g, none, none, 90)
  check('a laser at head height up on the ceiling kills the flipped player', pl(g, PINK).deaths > d0)
  const h = createGame(room({ traps: [low] }))
  placeCeiling(h, PINK, 34)
  step(h, none, none, 90)
  check('...but a floor-level laser does not', pl(h, PINK).deaths === 0)
  const i = createGame(room({ traps: [high] }))
  place(i, PINK, 34)
  step(i, none, none, 90)
  check('...and the ceiling laser does not touch someone on the floor', pl(i, PINK).deaths === 0)
}

// ---------------- plates and switches up there ----------------
{
  const g = createGame(room({ plates: [{ id: 'cp', x: 25, y: 4, ceiling: true }, { id: 'fp', x: 35, y: 21 }] }))
  placeCeiling(g, PINK, 25.5)
  step(g)
  check('a ceiling plate is pressed by someone standing on the ceiling', g.doors.plates[0].held)
  place(g, PINK, 35.5)
  pl(g, PINK).grav = 1
  step(g)
  check('...and a floor plate by someone on the floor', g.doors.plates[1].held && !g.doors.plates[0].held)
  placeCeiling(g, BLUE, 35.5)
  place(g, PINK, 50)
  step(g)
  check('...but an upside-down player cannot press a floor plate', !g.doors.plates[1].held)
  let message = null
  try {
    createGame(room({ plates: [{ id: 'bad', x: 25, y: 10, ceiling: true }] }))
  } catch (e) {
    message = e.message
  }
  check('a ceiling plate must hang from a solid ceiling', /hanging from a solid ceiling/.test(message || ''), message || '')
}
{
  const g = createGame(room({ switches: [{ id: 's', x: 25, y: 4, mode: 'toggle', ceiling: true }] }))
  placeCeiling(g, PINK, 25.5)
  step(g, none, { ...none, interact: true })
  check('a switch on the ceiling can be flipped by someone up there', g.doors.switches[0].on)
}

// ---------------- drawn lines, the partner, the exit ----------------
{
  const g = createGame(room())
  const press = { ...none, draw: true }
  place(g, BLUE, 10)
  step(g, press)
  step(g)
  beginStroke(g, pl(g, BLUE), 40, 3.6)
  for (let i = 1; i <= 30; i++) extendStroke(g, pl(g, BLUE), 40, 3.6 + (i * 8) / 30)
  endStroke(g, pl(g, BLUE))
  placeCeiling(g, PINK, 46)
  step(g, none, R, 120) // screen-right = world-left, toward the line
  check('a line drawn by the partner is a wall to a player on the ceiling', pl(g, PINK).x > 40.3 && pl(g, PINK).x < 42, `x=${pl(g, PINK).x.toFixed(2)}`)
}
{
  const g = createGame(room({ exit: { x: 50, y: 4, w: 2, h: 3 } }))
  placeCeiling(g, BLUE, 50.6)
  placeCeiling(g, PINK, 51.4)
  settle(g, 1)
  check('players on the ceiling can finish a room whose exit is up there', g.complete)
}

// ---------------- a vertical line is a wall whichever way it was drawn (regression) ----------------
for (const upward of [true, false]) {
  const g = createGame(room())
  place(g, BLUE, 10)
  step(g, { ...none, draw: true })
  step(g)
  const [y0, y1] = upward ? [22.4, 14.4] : [14.4, 22.4]
  beginStroke(g, pl(g, BLUE), 40, y0)
  for (let i = 1; i <= 30; i++) extendStroke(g, pl(g, BLUE), 40, y0 + ((y1 - y0) * i) / 30)
  endStroke(g, pl(g, BLUE))
  place(g, PINK, 34)
  step(g, none, R, 120)
  check(`a vertical line drawn ${upward ? 'upward from below the floor' : 'downward to below the floor'} stops a walker (it is not a staircase)`, pl(g, PINK).x < 40 && pl(g, PINK).y > 21.9, `x=${pl(g, PINK).x.toFixed(2)}, y=${pl(g, PINK).y.toFixed(2)}`)
}

// ---------------- shoulder carry with gravity ----------------
{
  const g = createGame(room())
  placeCeiling(g, BLUE, 20)
  const p = pl(g, PINK)
  p.grav = -1
  p.x = 20.05
  p.y = 12 // hanging well below Blue; gravity pulls it up onto Blue's head
  p.vx = p.vy = 0
  p.onGround = false
  settle(g, 1)
  check('two players on the ceiling can still carry (the rider hangs from the carrier’s head)', p.carriedBy === 'blue' && Math.abs(p.y - (4 + 1.75)) < 0.02, `rider feet y=${p.y.toFixed(2)}`)
  const x0 = pl(g, BLUE).x
  step(g, L, none, 40)
  check('...and goes wherever the carrier walks', Math.abs(p.x - pl(g, BLUE).x) < 0.1 && pl(g, BLUE).x > x0 + 1, `blue x ${x0.toFixed(1)} -> ${pl(g, BLUE).x.toFixed(1)}`)
  setGravity(g, pl(g, BLUE), 1)
  step(g)
  check('flipping either player ends the carry', p.carriedBy === null && pl(g, BLUE).carrying === null)
}
{
  const g = createGame(room())
  placeCeiling(g, BLUE, 20)
  place(g, PINK, 20)
  step(g, none, none, 90)
  check('players with opposite gravity cannot carry each other', pl(g, PINK).carriedBy === null && pl(g, BLUE).carrying === null)
}

// ---------------- bad level files ----------------
{
  let message = null
  try {
    createGame(room({ gravity: [{ id: 'x', x: 20, y: 12, set: 'sideways' }] }))
  } catch (e) {
    message = e.message
  }
  check('a gravity door with an unknown "set" is rejected', /needs "set"/.test(message || ''), message || '')
  message = null
  try {
    createGame(room({ gravity: [{ id: 'x', x: 20, y: 12, set: 'flip' }] }))
  } catch (e) {
    message = e.message
  }
  check('...and there is no toggling ("flip") gravity door any more', /no toggling/.test(message || ''), message || '')
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll gravity checks passed')
process.exit(failures ? 1 : 0)
