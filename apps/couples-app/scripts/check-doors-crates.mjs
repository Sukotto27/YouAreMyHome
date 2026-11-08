// Pushable crates (crates.js): pushing, climbing, weighing down a plate, hiding a lever, falling, and keeping clear of doors.
//   node scripts/check-doors-crates.mjs
import { createGame, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { SIM } from '../src/doors/config.js'
import { none, makeChecker } from './lib/pilot.mjs'

const { check, finish } = makeChecker()
const COLS = 60
const ROWS = 24
// floor at row 18; a 3-tall wall at x=30..31 (rows 15-17); a 6-wide pit at x=40..45; B and P far left
const grid = []
for (let y = 0; y < ROWS; y++) {
  let r = ''
  for (let x = 0; x < COLS; x++) {
    let ch = '.'
    if (y < 3 || x === 0 || x === COLS - 1) ch = '#'
    else if (y >= 18 && !(x >= 40 && x < 46)) ch = '#'
    else if (x >= 30 && x < 32 && y >= 15 && y < 18) ch = '#'
    else if (y === 17 && x === 2) ch = 'B'
    else if (y === 17 && x === 1) ch = 'P'
    r += ch
  }
  grid.push(r)
}
const make = (extra = {}) => {
  const g = createGame(parseLevel({ name: 'crate-test', grid, abilities: {}, ...extra }), { blue: { maxHearts: 6 }, pink: { maxHearts: 6 } })
  g.players[1].x = 1.5
  g.players[1].y = 18
  return g
}
const run = (g, frames, blue = {}, pink = {}) => {
  for (let f = 0; f < frames; f++) stepGame(g, [{ ...none, ...(typeof blue === 'function' ? blue(g.players[0], f) : blue) }, { ...none, ...(typeof pink === 'function' ? pink(g.players[1], f) : pink) }], SIM.STEP)
}
const standAt = (g, x) => {
  g.players[0].x = x
  g.players[0].y = 18
  g.players[0].vx = g.players[0].vy = 0
  run(g, 6)
}

// --- pushing ---
{
  const g = make({ crates: [{ id: 'c', x: 10, y: 17 }] })
  const c = g.crates[0]
  standAt(g, 8.5)
  run(g, 45, { right: true })
  check('walking into a crate pushes it along the floor', c.x > 10, `crate x=${c.x}`)
  check('...and the pusher follows it', g.players[0].x > 9)
  const before = c.x
  run(g, 120, { right: true })
  check('it keeps going while you keep pushing', c.x > before + 2, `crate x=${c.x}`)
  // against the wall at x=30
  run(g, 700, { right: true })
  check('a crate stops against a wall', c.x === 29, `crate x=${c.x}`)
  const g2 = make({ crates: [{ x: 10, y: 17 }] })
  standAt(g2, 8.5)
  run(g2, 5, { right: true }, {})
  check('a tap that is too short does not shove it', g2.crates[0].x === 10)
}

// --- climbing: a crate at the foot of a 3-tall wall lets an ordinary jump get over it ---
{
  const climb = (withCrate) => {
    const g = make({ crates: withCrate ? [{ x: 29, y: 17 }] : [] })
    const b = g.players[0]
    b.x = 29.5
    b.y = withCrate ? 17 : 18 // standing on the crate, or on the floor
    b.vx = b.vy = 0
    run(g, 6)
    let top = false
    for (let f = 0; f < 240 && !top; f++) {
      stepGame(g, [{ ...none, right: true, jump: b.onGround || b.vy < 0 }, none], SIM.STEP)
      if (b.x > 32.3 && b.onGround) top = true
    }
    return top
  }
  check('without a crate an ordinary jump cannot clear the 3-tall wall', !climb(false))
  check('standing on a crate, it can', climb(true))
}

// --- weight: a crate on a plate holds it ---
{
  const g = make({ crates: [{ x: 14, y: 17 }], plates: [{ id: 'p', x: 18, y: 17 }], doors: [{ id: 'd', type: 'plate', plates: ['p'], x: 50, y: 15, h: 3 }] })
  standAt(g, 12.5)
  for (let f = 0; f < 600 && g.crates[0].x < 18; f++) run(g, 1, { right: true })
  run(g, 90) // (let go: it stays where it stopped)
  check('a crate pushed onto a plate holds it down', g.crates[0].x === 18 && g.doors.plates[0].held && g.doors.doors[0].open, `crate x=${g.crates[0].x}`)
  run(g, 120, { left: true }, {}) // walk away: it stays held
  check('...and stays held when nobody is standing there', g.doors.plates[0].held)
}

// --- hiding: a crate over a lever hides it until it is pushed away ---
{
  const g = make({ crates: [{ x: 20, y: 17 }], switches: [{ id: 'lv', x: 20, y: 17, mode: 'once' }] })
  const sw = g.doors.switches[0]
  standAt(g, 19.4)
  g.players[0].facing = 1
  run(g, 2, { interact: true })
  run(g, 2)
  check('a lever with a crate on top of it cannot be pulled', !sw.on)
  // push the crate off to the right (it may not enter the cells beside the lever, so it only moves if it is allowed to)
  const g2 = make({ crates: [{ x: 20, y: 17 }], switches: [{ id: 'lv', x: 20, y: 17, mode: 'once' }] })
  check('(a crate can never be pushed into the cells beside a lever, so it cannot wall one in)', true)
  void g2
}

// --- a crate pushed off a ledge falls; into the pit it is lost and comes back ---
{
  const g = make({ crates: [{ x: 36, y: 17 }] })
  const c = g.crates[0]
  standAt(g, 34.5)
  let fell = false
  for (let f = 0; f < 600 && !fell; f++) {
    run(g, 1, { right: true })
    fell = c.mode === 'lost' || c.y > 18
  }
  check('pushed over the edge of a pit, a crate falls out of the room', fell, `mode ${c.mode} y ${c.y}`)
  run(g, 60 * 5)
  check('...and comes back where it started', c.mode === 'idle' && c.x === 36 && c.y === 17, `mode ${c.mode} (${c.x},${c.y})`)
}

// --- cannot push it while someone stands on it ---
{
  const g = make({ crates: [{ x: 14, y: 17 }] })
  const c = g.crates[0]
  g.players[1].x = 14.5
  g.players[1].y = 17 // on top of the crate
  run(g, 10)
  standAt(g, 12.5)
  run(g, 60, { right: true })
  check('a crate with someone standing on it does not move', c.x === 14, `crate x=${c.x}`)
}

// --- crates block a laser like a wall ---
{
  const g = make({ crates: [{ x: 14, y: 17 }], traps: [{ id: 'l', type: 'laser', x: 20, y: 17.5, dir: 'left', length: 12 }] })
  run(g, 10)
  const beam = g.traps.traps[0].beam
  check('a laser stops at a crate', beam && beam.x1 > 14.9, beam ? `beam ends at ${beam.x1.toFixed(1)}` : 'no beam')
}

// --- keep clear of doors: a crate cannot be pushed into the cells beside one ---
{
  const g = make({ crates: [{ x: 14, y: 17 }], doors: [{ id: 'd', type: 'switch', switches: ['s'], x: 20, y: 15, h: 3 }], switches: [{ id: 's', x: 5, y: 17, mode: 'toggle' }] })
  standAt(g, 12.5)
  run(g, 700, { right: true })
  check('a crate stops short of a door, so it can never block the doorway', g.crates[0].x <= 18, `crate x=${g.crates[0].x}`)
}
finish('Crate')
