// Headless checks for the shoulder carry (milestone 3b):
//   node scripts/check-doors-carry.mjs
import { createGame, killPlayer, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { SIM } from '../src/doors/config.js'

const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false }
let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

// 60 x 28 room: floor rows 22.., ceiling rows 0..3 (optionally a lower ceiling slab)
function room(slab = null) {
  const cols = 60
  const rows = 28
  const grid = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) {
      let ch = '.'
      if (x === 0 || x === cols - 1 || y <= 3 || y >= 22) ch = '#'
      if (slab && x >= slab.x0 && x <= slab.x1 && y >= slab.y0 && y <= slab.y1) ch = '#'
      line += ch
    }
    grid.push(line)
  }
  grid[21] = grid[21].slice(0, 4) + 'B' + grid[21].slice(5, 7) + 'P' + grid[21].slice(8)
  return parseLevel({ name: 'carry-test', grid })
}
const BLUE = 0
const PINK = 1
const step = (g, blue = none, pink = none, frames = 1) => {
  for (let f = 0; f < frames; f++) stepGame(g, [blue, pink], SIM.STEP)
}
const settle = (g, seconds) => step(g, none, none, Math.round(seconds * 60))

// Blue stands at x = 20; Pink is dropped onto Blue's head and the pair settle: a carry
function stacked(level = room()) {
  const g = createGame(level)
  settle(g, 0.5)
  const b = g.players[BLUE]
  const p = g.players[PINK]
  b.x = 20
  b.y = 22
  b.vx = b.vy = 0
  p.x = 20.05
  p.y = 22 - 1.75 - 3 // 3 tiles above Blue's head
  p.vx = p.vy = 0
  p.onGround = false
  b.invuln = p.invuln = 0
  settle(g, 0.6)
  return g
}

{
  const g = stacked()
  const [b, p] = g.players
  check('landing on the partner’s head starts a carry', p.carriedBy === 'blue' && b.carrying === 'pink')
  check('...the rider stands on the carrier’s head', Math.abs(p.y - (b.y - b.h)) < 0.01 && p.onGround, `rider feet ${p.y.toFixed(2)}, head ${(b.y - b.h).toFixed(2)}`)
}

{
  const g = stacked()
  const [b, p] = g.players
  const x0 = b.x
  step(g, { ...none, right: true }, none, 60)
  check('the carrier walks and the rider goes along', Math.abs(p.x - b.x) < 0.1 && b.x - x0 > 3, `blue moved ${(b.x - x0).toFixed(2)}, pink offset ${(p.x - b.x).toFixed(2)}`)
  check('...but slower than a lone runner (6 tiles/s)', b.x - x0 < 4.6, `${(b.x - x0).toFixed(2)} tiles in 1s`)
  check('...still carrying afterwards', p.carriedBy === 'blue')
}

{
  const g = stacked()
  const [b, p] = g.players
  let high = 99
  for (let f = 0; f < 30; f++) {
    step(g, { ...none, jump: true })
    high = Math.min(high, p.y)
    if (f > 3 && p.carriedBy) if (Math.abs(p.y - (b.y - b.h)) > 0.01) high = -1
  }
  check('the carrier can jump with the rider on their shoulders', b.vy !== 0 || b.y < 22, `blue y=${b.y.toFixed(2)}`)
  check('...and the rider rises with them, staying on the shoulders', high > 0 && high < 22 - 1.75 - 1, `rider’s highest feet y=${high.toFixed(2)} (standing is ${(22 - 1.75).toFixed(2)})`)
}

{
  const g = stacked()
  const [b, p] = g.players
  const top0 = p.y
  let apex = top0
  step(g, none, { ...none, jump: true })
  check('the rider jumps off the shoulders and the link ends', p.carriedBy === null && b.carrying === null)
  for (let f = 0; f < 50; f++) {
    step(g, none, { ...none, jump: f < 30 })
    apex = Math.min(apex, p.y)
  }
  check('...jumping from the higher starting point', top0 - apex > 2.2, `rose ${(top0 - apex).toFixed(2)} tiles above Blue’s head`)
}

{
  // chained boost: Blue jumps, Pink jumps off the rising partner
  const plain = stacked()
  const base = plain.players[PINK].y
  step(plain, none, { ...none, jump: true })
  let plainApex = base
  for (let f = 0; f < 60; f++) {
    step(plain, none, { ...none, jump: f < 30 })
    plainApex = Math.min(plainApex, plain.players[PINK].y)
  }
  const g = stacked()
  const [b, p] = g.players
  step(g, { ...none, jump: true })
  step(g, { ...none, jump: true }, none, 5)
  step(g, { ...none, jump: true }, { ...none, jump: true })
  let apex = p.y
  for (let f = 0; f < 80; f++) {
    step(g, { ...none, jump: true }, { ...none, jump: f < 30 })
    apex = Math.min(apex, p.y)
  }
  check('the chained boost: jumping off a RISING carrier goes much higher', base - apex > base - plainApex + 1.5, `${(base - apex).toFixed(2)} tiles vs ${(base - plainApex).toFixed(2)} from a standing carrier`)
  void b
}

{
  const g = stacked()
  const [b, p] = g.players
  step(g, none, { ...none, left: true }, 30)
  check('walking off the edge of the shoulders ends the carry', p.carriedBy === null && b.carrying === null)
  settle(g, 0.8)
  check('...and the rider drops to the floor', p.onGround && Math.abs(p.y - 22) < 0.01, `y=${p.y.toFixed(2)}`)
}

{
  const g = stacked()
  const [b, p] = g.players
  step(g, { ...none, crouch: true }, none, 10)
  check('a crouching carrier lowers the rider with them', b.crouching && Math.abs(p.y - (b.y - b.h)) < 0.01 && p.carriedBy === 'blue', `rider feet ${p.y.toFixed(2)}`)
  step(g, none, none, 10)
  check('...and standing up lifts them again', !b.crouching && Math.abs(p.y - (22 - 1.75)) < 0.02, `rider feet ${p.y.toFixed(2)}`)
}

{
  const g = stacked()
  const [b, p] = g.players
  killPlayer(b, 'test')
  step(g, none, none, 1)
  check('if the carrier dies the carry ends', p.carriedBy === null && b.carrying === null)
  settle(g, 1)
  check('...and the rider drops to the floor', p.onGround && Math.abs(p.y - 22) < 0.01)
  const h = stacked()
  killPlayer(h.players[PINK], 'test')
  step(h, none, none, 1)
  check('if the rider dies the carry ends too', h.players[BLUE].carrying === null)
}

{
  const g = stacked()
  const [b, p] = g.players
  step(g, { ...none, draw: true }) // Blue starts drawing: frozen
  step(g, none, none, 3)
  check('a carrier who starts drawing is frozen and no longer carries', b.carrying === null && p.carriedBy === null)
  check('...but the rider still stands on their head like on any platform', p.onGround && Math.abs(p.y - (b.y - b.h)) < 0.02, `rider feet ${p.y.toFixed(2)}`)
}

{
  // a slab hanging at head height of the stack: rows 18..19 above x = 30 (feet at 22, stack top at 18.5)
  const g = stacked(room({ x0: 30, x1: 40, y0: 18, y1: 19 }))
  const [b, p] = g.players
  step(g, { ...none, right: true }, none, 150)
  check('the stack can’t walk into a ceiling the rider can’t fit under', b.x < 30 && p.carriedBy === 'blue', `blue stopped at x=${b.x.toFixed(2)}`)
  const lone = createGame(room({ x0: 30, x1: 40, y0: 18, y1: 19 }))
  settle(lone, 0.5)
  lone.players[BLUE].x = 20
  step(lone, { ...none, right: true }, none, 300)
  check('...although Blue alone walks under it fine', lone.players[BLUE].x > 41, `x=${lone.players[BLUE].x.toFixed(2)}`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll carry checks passed')
process.exit(failures ? 1 : 0)
