// Headless checks for the milestone 5 doors: key, flip-on-pass, linked, one-way, swap,
// random and portals:
//   node scripts/check-doors-doors2.mjs
import { createGame, killPlayer, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { SIM } from '../src/doors/config.js'

const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false }
let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

// 90 x 28 room: floor rows 22.., ceiling rows 0..3. Doors are 3 tall at rows 19..21.
function room(extra = {}) {
  const cols = 90
  const rows = 28
  const grid = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) line += x === 0 || x === cols - 1 || y <= 3 || y >= 22 ? '#' : '.'
    grid.push(line)
  }
  grid[21] = grid[21].slice(0, 4) + 'B' + grid[21].slice(5, 7) + 'P' + grid[21].slice(8)
  return parseLevel({ name: 'doors2-test', grid, ...extra })
}
const BLUE = 0
const PINK = 1
const step = (g, blue = none, pink = none, frames = 1) => {
  for (let f = 0; f < frames; f++) stepGame(g, [blue, pink], SIM.STEP)
}
const settle = (g, seconds) => step(g, none, none, Math.round(seconds * 60))
function place(g, who, x, y = 22) {
  const p = g.players[who]
  p.x = x
  p.y = y
  p.vx = p.vy = 0
  p.onGround = true
  p.invuln = 0
}
const R = { ...none, right: true }
const L = { ...none, left: true }
const E = { ...none, interact: true }
// walk `who` until x reaches `target` (or `seconds` pass)
function walkTo(g, who, target, seconds = 6) {
  for (let f = 0; f < seconds * 60; f++) {
    const p = g.players[who]
    const dx = target - p.x
    if (Math.abs(dx) < 0.1) return
    const input = dx > 0 ? R : L
    step(g, who === BLUE ? input : none, who === PINK ? input : none)
  }
}
const door = (g, id) => g.doors.doors.find((d) => d.id === id)
const parseFails = (extra) => {
  try {
    createGame(room(extra))
    return null
  } catch (e) {
    return e.message
  }
}

// ---------------- key ----------------
{
  const level = { keys: [{ id: 'k', x: 20, y: 21 }], doors: [{ id: 'kd', type: 'key', key: 'k', x: 40, y: 19, h: 3 }] }
  const g = createGame(room(level))
  place(g, PINK, 20)
  step(g)
  check('walking onto a key picks it up', g.doors.keys[0].holder === 'pink')
  step(g)
  check('...it is carried above the holder’s head', Math.abs(g.doors.keys[0].px - g.players[PINK].x) < 0.01 && g.doors.keys[0].py < g.players[PINK].y - 1.75)
  check('a key door starts shut', !door(g, 'kd').open)
  walkTo(g, PINK, 38)
  check('...and is still shut a few tiles away', !door(g, 'kd').open)
  walkTo(g, PINK, 39.2)
  step(g, none, none, 2)
  check('...it opens when the key holder reaches it', door(g, 'kd').open && g.doors.keys[0].used)
  walkTo(g, PINK, 36)
  settle(g, 0.5)
  check('...and stays open for good (the key is spent)', door(g, 'kd').open)
  place(g, PINK, 20)
  place(g, BLUE, 33)
  walkTo(g, BLUE, 44)
  check('...so anyone can walk through it', g.players[BLUE].x > 43)
}
{
  const level = { keys: [{ id: 'k', x: 20, y: 21 }], doors: [{ id: 'kd', type: 'key', key: 'k', x: 40, y: 19, h: 3 }] }
  const g = createGame(room(level))
  place(g, BLUE, 38.5)
  settle(g, 0.5)
  check('without the key, standing at the door does nothing', !door(g, 'kd').open)

  const h = createGame(room(level))
  place(h, PINK, 20)
  place(h, BLUE, 21.5)
  step(h)
  step(h, none, E) // Pink hands the key to Blue, who is standing close by
  check('Interact next to your partner hands them the key', h.doors.keys[0].holder === 'blue')
  place(h, PINK, 20)
  step(h)
  check('...and the giver can’t pick it straight back up while Blue holds it', h.doors.keys[0].holder === 'blue')
  walkTo(h, BLUE, 39.3)
  step(h, none, none, 2)
  check('...Blue opens the door with it', door(h, 'kd').open)

  const far = createGame(room(level))
  place(far, PINK, 20)
  place(far, BLUE, 30)
  step(far)
  step(far, none, E)
  check('...but not across the room', far.doors.keys[0].holder === 'pink')

  const dead = createGame(room(level))
  place(dead, PINK, 20)
  step(dead)
  walkTo(dead, PINK, 30)
  killPlayer(dead.players[PINK], 'test')
  step(dead, none, none, 2)
  check('dying sends the key back where it started', dead.doors.keys[0].holder === null && dead.doors.keys[0].px === 20.5)
  settle(dead, 1)
  place(dead, PINK, 20)
  step(dead)
  check('...to be picked up again', dead.doors.keys[0].holder === 'pink')

  const two = createGame(room({ keys: [{ id: 'a', x: 20, y: 21 }, { id: 'b', x: 21, y: 21 }] }))
  place(two, PINK, 20.5)
  step(two, none, none, 3)
  check('you can only hold one key at a time', two.doors.keys.filter((k) => k.holder === 'pink').length === 1)
}

// ---------------- flip-on-pass ----------------
{
  const level = { doors: [{ id: 'f', type: 'flip', x: 30, y: 19, h: 3 }] }
  const g = createGame(room(level))
  check('a flip door starts open', door(g, 'f').open)
  walkTo(g, PINK, 28)
  step(g, none, R, 20) // into the doorway, centre not yet across
  step(g, none, { ...none }, 1)
  walkTo(g, PINK, 30.5)
  check('(setup) Pink is standing in the doorway', door(g, 'f').open)
  walkTo(g, PINK, 33)
  settle(g, 0.3)
  check('it shuts behind whoever passes through it', !door(g, 'f').open)
  walkTo(g, PINK, 29, 3)
  check('...and they cannot go back', g.players[PINK].x > 31, `x=${g.players[PINK].x.toFixed(2)}`)
}
{
  // never closes on someone: stop in the middle of the door after the centre has crossed
  const g = createGame(room({ doors: [{ id: 'f', type: 'flip', x: 30, y: 19, h: 3 }] }))
  place(g, PINK, 29)
  walkTo(g, PINK, 30.7)
  settle(g, 1)
  check('a flip door never closes on someone standing in it', door(g, 'f').open && g.players[PINK].x > 30.5 && g.players[PINK].x < 31)
  walkTo(g, PINK, 33)
  settle(g, 0.3)
  check('...it shuts once they have left', !door(g, 'f').open)
}
{
  const level = {
    doors: [
      { id: 'a', type: 'flip', x: 30, y: 19, h: 3, self: false, flips: ['b'] },
      { id: 'b', type: 'flip', x: 50, y: 19, h: 3, start: 'closed' },
    ],
  }
  const g = createGame(room(level))
  check('a flip door can start closed', !door(g, 'b').open)
  walkTo(g, PINK, 34)
  settle(g, 0.3)
  check('passing door A flips door B open (and A stays as it was)', door(g, 'b').open && door(g, 'a').open)
  walkTo(g, BLUE, 34)
  settle(g, 0.3)
  check('the next pass flips B shut again', !door(g, 'b').open)
  const once = createGame(room({ doors: [{ id: 'a', type: 'flip', x: 30, y: 19, h: 3, self: false, flips: ['b'], passes: 1 }, level.doors[1]] }))
  walkTo(once, PINK, 34)
  walkTo(once, BLUE, 34)
  settle(once, 0.3)
  check('"passes": 1 limits it to the first crossing', door(once, 'b').open)
}

// ---------------- linked ----------------
{
  const level = {
    switches: [{ id: 's', x: 20, y: 21, mode: 'toggle' }],
    doors: [
      { id: 'a', type: 'switch', switches: ['s'], x: 30, y: 19, h: 3 },
      { id: 'b', type: 'linked', of: 'a', x: 50, y: 19, h: 3 },
      { id: 'c', type: 'linked', of: 'a', mirror: false, x: 60, y: 19, h: 3 },
    ],
  }
  const g = createGame(room(level))
  check('a linked door is open while its partner is shut', !door(g, 'a').open && door(g, 'b').open)
  check('...and "mirror": false makes it follow instead', !door(g, 'c').open)
  place(g, PINK, 20.5)
  step(g, none, E)
  step(g, none, none, 3)
  check('flipping the switch swaps them over', door(g, 'a').open && !door(g, 'b').open && door(g, 'c').open)
  step(g, none, E)
  step(g, none, none, 3)
  check('...and back again', !door(g, 'a').open && door(g, 'b').open && !door(g, 'c').open)

  // a linked door doesn't shut on someone standing in it
  place(g, BLUE, 50.5)
  step(g, none, E)
  step(g, none, none, 5)
  check('a linked door waits for the doorway to be empty before shutting', door(g, 'b').open && !door(g, 'a').open === false)
  walkTo(g, BLUE, 54)
  settle(g, 0.3)
  check('...then shuts', !door(g, 'b').open)
}

// ---------------- one-way ----------------
{
  const g = createGame(room({ doors: [{ id: 'o', type: 'oneway', dir: 1, x: 30, y: 19, h: 3 }] }))
  place(g, PINK, 26)
  walkTo(g, PINK, 34)
  check('a one-way door lets you through in its direction', g.players[PINK].x > 33.5)
  walkTo(g, PINK, 28, 3)
  check('...but not back', g.players[PINK].x > 31, `x=${g.players[PINK].x.toFixed(2)}`)
  place(g, BLUE, 36)
  step(g)
  walkTo(g, BLUE, 28, 3)
  check('...nor from the far side to begin with', g.players[BLUE].x > 31, `x=${g.players[BLUE].x.toFixed(2)}`)
  const mid = createGame(room({ doors: [{ id: 'o', type: 'oneway', dir: 1, x: 30, y: 19, h: 3 }] }))
  place(mid, PINK, 27)
  walkTo(mid, PINK, 30.5)
  walkTo(mid, PINK, 28)
  check('...you can still turn round while you are in the doorway', mid.players[PINK].x < 29.5, `x=${mid.players[PINK].x.toFixed(2)}`)
  const left = createGame(room({ doors: [{ id: 'o', type: 'oneway', dir: -1, x: 30, y: 19, h: 3 }] }))
  place(left, PINK, 34)
  walkTo(left, PINK, 26)
  check('"dir": -1 works the other way', left.players[PINK].x < 27)
}

// ---------------- swap ----------------
{
  const g = createGame(room({ doors: [{ id: 'w', type: 'swap', x: 30, y: 19, h: 3 }] }))
  check('a swap door starts as Blue’s', door(g, 'w').color === 'blue')
  place(g, PINK, 26)
  walkTo(g, PINK, 34, 3)
  check('Pink cannot pass it while it is Blue’s', g.players[PINK].x < 30)
  place(g, BLUE, 26)
  place(g, PINK, 20)
  walkTo(g, BLUE, 34)
  settle(g, 0.3)
  check('Blue can; afterwards the door belongs to Pink', g.players[BLUE].x > 33 && door(g, 'w').color === 'pink')
  walkTo(g, BLUE, 28, 3)
  check('...so Blue can’t come back through', g.players[BLUE].x > 31)
  place(g, BLUE, 50)
  walkTo(g, PINK, 36)
  settle(g, 0.3)
  check('Pink passes, and it turns back into Blue’s', g.players[PINK].x > 35 && door(g, 'w').color === 'blue')
}

// ---------------- random ----------------
{
  const level = { doors: [{ id: 'r', type: 'random', period: 2, openChance: 0.5, x: 30, y: 19, h: 3 }] }
  const sequence = (lv) => {
    const g = createGame(room(lv))
    const out = []
    for (let i = 0; i < 20; i++) {
      out.push(door(g, 'r').open ? 1 : 0)
      settle(g, 2)
    }
    return out.join('')
  }
  const a = sequence(level)
  check('a random door opens and shuts unpredictably', a.includes('1') && a.includes('0'), a)
  check('...but identically on every run (seeded)', a === sequence(level))
  check('"openChance": 1 is always open', !sequence({ doors: [{ ...level.doors[0], openChance: 1 }] }).includes('0'))
  check('"openChance": 0 is always shut', !sequence({ doors: [{ ...level.doors[0], openChance: 0 }] }).includes('1'))

  const g = createGame(room({ doors: [{ ...level.doors[0], openChance: 0 }] }))
  const d = door(g, 'r')
  d.randOpen = true
  settle(g, 0.1)
  place(g, PINK, 30.5)
  d.randOpen = false
  settle(g, 0.5)
  check('a random door never shuts on someone standing in it', d.open)
  walkTo(g, PINK, 34)
  settle(g, 0.3)
  check('...but does once they leave', !d.open)
}

// ---------------- portals ----------------
{
  const level = {
    portals: [
      { id: 'a', x: 20, y: 20, h: 2, to: 'b' },
      { id: 'b', x: 60, y: 20, h: 2, to: 'a' },
    ],
  }
  const g = createGame(room(level))
  place(g, PINK, 16)
  step(g, none, R, 90)
  check('walking into a portal brings you out of its partner', g.players[PINK].x > 60 && g.players[PINK].onGround, `x=${g.players[PINK].x.toFixed(2)}`)
  settle(g, 1)
  check('...and you stay there (no ping-pong)', g.players[PINK].x > 60)
  step(g, none, L, 90)
  check('walking into the other portal sends you back', g.players[PINK].x < 21, `x=${g.players[PINK].x.toFixed(2)}`)

  // a carrying pair goes through together
  const c = createGame(room(level))
  place(c, BLUE, 12)
  c.players[PINK].x = 12.05
  c.players[PINK].y = 22 - 1.75 - 2
  c.players[PINK].onGround = false
  settle(c, 0.6)
  check('(setup) Pink is riding Blue', c.players[PINK].carriedBy === 'blue')
  step(c, R, none, 260)
  check('a carrier and rider go through a portal together and stay linked', c.players[BLUE].x > 60 && Math.abs(c.players[PINK].x - c.players[BLUE].x) < 0.3 && c.players[PINK].carriedBy === 'blue', `blue ${c.players[BLUE].x.toFixed(1)}, pink ${c.players[PINK].x.toFixed(1)}`)
}

// ---------------- bad level files are rejected clearly ----------------
check('a key door needs its key to exist', /missing key/.test(parseFails({ doors: [{ id: 'd', type: 'key', key: 'nope', x: 30, y: 19, h: 3 }] }) || ''))
check('a linked door needs its partner to exist', /missing door/.test(parseFails({ doors: [{ id: 'd', type: 'linked', of: 'nope', x: 30, y: 19, h: 3 }] }) || ''))
check('a flip door can only flip flip doors', /not a flip door/.test(parseFails({ doors: [{ id: 'g', type: 'gray', x: 40, y: 19, h: 3 }, { id: 'd', type: 'flip', flips: ['g'], x: 30, y: 19, h: 3 }] }) || ''))
check('a portal needs a partner', /missing portal/.test(parseFails({ portals: [{ id: 'a', x: 20, y: 20, to: 'zzz' }] }) || ''))

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll door (batch 2) checks passed')
process.exit(failures ? 1 : 0)
