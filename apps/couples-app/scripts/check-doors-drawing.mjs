// Headless checks for the co-op drawing mechanic (freeze, lifetime, ink limit,


//   node scripts/check-doors-drawing.mjs
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createGame, stepGame, resetGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { beginStroke, endStroke, extendStroke } from '../src/doors/drawing.js'
import { DRAW, SIM } from '../src/doors/config.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false }
let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

// A synthetic test level: ground, a 9-wide gap (x 15..23), more ground, and a
// 7-tall plateau starting at x=41 (surface row 15).
function testLevel() {
  const cols = 80
  const rows = 28
  const grid = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) {
      let ch = '.'
      if (x === 0 || x === cols - 1 || y === 0) ch = '#'
      if (y >= 22 && !(x >= 15 && x <= 23)) ch = '#'
      if (x >= 41 && y >= 15) ch = '#'
      line += ch
    }
    grid.push(line)
  }
  grid[21] = grid[21].slice(0, 4) + 'B' + grid[21].slice(5, 7) + 'P' + grid[21].slice(8)
  return parseLevel({ name: 'draw-test', grid })
}

function step(game, blue = none, pink = none, frames = 1) {
  for (let f = 0; f < frames; f++) stepGame(game, [blue, pink], SIM.STEP)
}
const settle = (game, seconds = 1) => step(game, none, none, Math.round(seconds * 60))

// press the draw key for one step
const pressDraw = (game, who) => {
  const press = { ...none, draw: true }
  step(game, who === 0 ? press : none, who === 1 ? press : none)
  step(game)
}
// draw a polyline "with the mouse" for player `who`
function drawLine(game, who, points) {
  const player = game.players[who]
  const [first, ...rest] = points
  if (!beginStroke(game, player, first.x, first.y)) return null
  for (const p of rest) extendStroke(game, player, p.x, p.y)
  return endStroke(game, player)
}
// a straight line made of many small mouse moves
function straight(a, b, n = 40) {
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }))
}

const level = testLevel()
const BLUE = 0
const PINK = 1

// ---------- entering, freezing, cancelling ----------
{
  const g = createGame(level)
  settle(g)
  pressDraw(g, BLUE)
  check('the draw key enters aiming mode', g.players[BLUE].draw.mode === 'aiming')
  const x0 = g.players[BLUE].x
  step(g, { ...none, right: true, jump: true }, none, 60)
  check('a drawer is frozen in place (no moving, no jumping)', Math.abs(g.players[BLUE].x - x0) < 0.001 && g.players[BLUE].onGround)
  pressDraw(g, BLUE)
  check('pressing the key again cancels with no cooldown', g.players[BLUE].draw.mode === 'idle' && g.players[BLUE].draw.cooldown === 0)
  step(g, { ...none, right: true }, none, 30)
  check('...and the player is free to move again', g.players[BLUE].x > x0 + 0.5)

  const air = createGame(level)
  settle(air)
  step(air, { ...none, jump: true }, none, 8) // in mid-air
  pressDraw(air, BLUE)
  check("you can't start drawing in mid-air", air.players[BLUE].draw.mode === 'idle')
}

// ---------- ink, lifetime, cooldown ----------
{
  const g = createGame(level)
  settle(g)
  pressDraw(g, BLUE)
  const line = drawLine(g, BLUE, straight({ x: 5, y: 20 }, { x: 40, y: 20 }, 200))
  check('the ink limit caps the length of a line', line && line.length <= DRAW.INK_MAX + 1e-6 && line.length > DRAW.INK_MAX - 0.2, `${line?.length.toFixed(2)} tiles (max ${DRAW.INK_MAX})`)
  check('after drawing, the line exists and the drawer is frozen', g.lines.length === 1 && g.players[BLUE].draw.mode === 'active')
  settle(g, DRAW.LINE_LIFETIME - 0.5)
  check('the line is still there before its lifetime is up', g.lines.length === 1 && g.players[BLUE].draw.mode === 'active')
  settle(g, 0.7)
  check('the line vanishes after its lifetime', g.lines.length === 0)
  check('...which frees the drawer and starts the cooldown', g.players[BLUE].draw.mode === 'idle' && g.players[BLUE].draw.cooldown > DRAW.DRAW_COOLDOWN - 0.8)
  pressDraw(g, BLUE)
  check("can't draw again during the cooldown", g.players[BLUE].draw.mode === 'idle')
  settle(g, DRAW.DRAW_COOLDOWN)
  pressDraw(g, BLUE)
  check('...but can once it is over', g.players[BLUE].draw.mode === 'aiming')

  const tiny = createGame(level)
  settle(tiny)
  pressDraw(tiny, BLUE)
  drawLine(tiny, BLUE, [{ x: 5, y: 20 }, { x: 5.1, y: 20 }])
  check('a tiny scribble is discarded (back to aiming)', tiny.lines.length === 0 && tiny.players[BLUE].draw.mode === 'aiming')
}

// ---------- one mouse ----------
{
  const g = createGame(level)
  settle(g)
  pressDraw(g, BLUE)
  pressDraw(g, PINK)
  check("only one player can be drawing at a time (one mouse)", g.players[PINK].draw.mode === 'idle')
  drawLine(g, BLUE, straight({ x: 10, y: 19 }, { x: 14, y: 19 }))
  pressDraw(g, PINK)
  check('...but once the first line is drawn the other may draw too', g.players[PINK].draw.mode === 'aiming')
}

// ---------- solid only to the other player ----------
{
  // Blue draws a bridge over the gap; Pink walks across it
  const g = createGame(level)
  g.players[PINK].x = 12
  settle(g)
  pressDraw(g, BLUE)
  drawLine(g, BLUE, straight({ x: 13.6, y: 22.1 }, { x: 24.4, y: 22.1 }))
  let crossed = false
  for (let f = 0; f < 150; f++) {
    step(g, none, { ...none, right: true })
    if (g.players[PINK].x > 26 && g.players[PINK].onGround) crossed = true
  }
  check('Pink walks across a bridge that Blue drew over the gap', crossed && g.players[PINK].deaths === 0, `pink.x=${g.players[PINK].x.toFixed(1)}`)

  // walking into the gap WITHOUT a line falls
  const h = createGame(level)
  h.players[PINK].x = 12
  settle(h)
  step(h, none, { ...none, right: true }, 200)
  check('without a bridge Pink falls into the gap and respawns', h.players[PINK].deaths >= 1)

  // the bridge disappears under someone standing on it
  const k = createGame(level)
  k.players[PINK].x = 18
  k.players[PINK].y = 22
  k.players[PINK].onGround = true
  k.players[PINK].vy = 0
  pressDraw(k, BLUE)
  drawLine(k, BLUE, straight({ x: 13.6, y: 22.1 }, { x: 24.4, y: 22.1 }))
  settle(k, 0.5)
  check('Pink stands on the bridge while it lasts', k.players[PINK].onGround && Math.abs(k.players[PINK].y - 22) < 0.02)
  settle(k, DRAW.LINE_LIFETIME)
  check('...and falls when it fades', k.players[PINK].deaths >= 1 || k.players[PINK].y > 23)
}

// the drawer's own line never pushes them, and lines don't trap whoever they are drawn on
{
  const g = createGame(level)
  settle(g)
  const x0 = g.players[BLUE].x
  pressDraw(g, BLUE)
  drawLine(g, BLUE, straight({ x: x0, y: 19 }, { x: x0, y: 22.5 })) // straight through Blue's own body
  settle(g, 0.5)
  check("the drawer isn't pushed by their own line", Math.abs(g.players[BLUE].x - x0) < 0.001)

  const h = createGame(level)
  settle(h)
  const px = h.players[PINK].x
  pressDraw(h, BLUE)
  drawLine(h, BLUE, straight({ x: px, y: 19 }, { x: px, y: 22.5 })) // a wall drawn right through Pink
  step(h, none, none, 30)
  check('a line drawn through the partner does not shove or trap them', Math.abs(h.players[PINK].x - px) < 0.001)
  step(h, none, { ...none, right: true }, 40)
  const outX = h.players[PINK].x
  check('...they can walk out of it', outX > px + 0.6, `x=${outX.toFixed(2)}`)
  step(h, none, { ...none, left: true }, 40)
  check('...and once out, the wall is solid and keeps them out', h.players[PINK].x > px + 0.3, `x=${h.players[PINK].x.toFixed(2)}`)
}

// a wall drawn in front of the partner stops them
{
  const g = createGame(level)
  g.players[PINK].x = 10
  settle(g)
  pressDraw(g, BLUE)
  drawLine(g, BLUE, straight({ x: 12, y: 17 }, { x: 12, y: 22.5 }))
  step(g, none, { ...none, right: true }, 90)
  check("a drawn wall blocks the partner (it's solid to them)", g.players[PINK].x < 12 - 0.2, `x=${g.players[PINK].x.toFixed(2)}`)
}

// ---------- ramp ----------
{
  const g = createGame(level)
  g.players[PINK].x = 30
  settle(g)
  pressDraw(g, BLUE)
  drawLine(g, BLUE, straight({ x: 33.5, y: 22.1 }, { x: 41.5, y: 14.7 }, 60)) // ~10 tiles of ink, ending just above the plateau top
  let top = false
  for (let f = 0; f < 200; f++) {
    step(g, none, { ...none, right: true })
    if (g.players[PINK].onGround && Math.abs(g.players[PINK].y - 15) < 0.02 && g.players[PINK].x > 42) top = true
  }
  check('Pink can walk up a ramp that Blue drew, onto a 7-tall plateau', top, `pink at (${g.players[PINK].x.toFixed(1)}, ${g.players[PINK].y.toFixed(1)})`)
}

// ---------- reset ----------
{
  const g = createGame(level)
  settle(g)
  pressDraw(g, BLUE)
  drawLine(g, BLUE, straight({ x: 10, y: 19 }, { x: 14, y: 19 }))
  resetGame(g)
  check('reset clears lines and draw state', g.lines.length === 0 && g.players[BLUE].draw.mode === 'idle' && g.players[BLUE].draw.cooldown === 0)
}

// =====================================================================
// THE OBSTACLES REALLY NEED DRAWING — none can be beaten by jumping alone
// =====================================================================
{
  const room3Path = path.join(here, '../src/doors/levels/room-3-drawing.json')
  if (fs.existsSync(room3Path)) {
    const room3 = parseLevel(JSON.parse(fs.readFileSync(room3Path, 'utf8')))
    // run-and-jump toward +x from (startX, surfaceY) and report how far the player got / whether they died
    const tryJump = (startX, surfaceY, seconds = 3) => {
      const g = createGame(room3)
      const p = g.players[1]
      p.x = startX
      p.y = surfaceY
      p.vx = 0
      p.vy = 0
      step(g, none, none, 30)
      let best = p.x
      for (let f = 0; f < seconds * 60; f++) {
        const jump = f > 4 && f < 50 // hold jump the whole way
        stepGame(g, [none, { ...none, right: true, jump }], SIM.STEP)
        if (p.deaths > 0) break
        best = Math.max(best, p.x)
      }
      return { x: best, died: p.deaths > 0, onGround: p.onGround, y: p.y }
    }
    const jumpGap1 = tryJump(14.6, 22)
    check('gap 1 (8 wide) cannot be jumped', jumpGap1.died, `reached x=${jumpGap1.x.toFixed(1)}`)
    const jumpWall1 = tryJump(41.5, 22)
    check('wall 1 (5 tall) cannot be jumped', jumpWall1.x < 44.3 && !(jumpWall1.onGround && jumpWall1.y < 20), `y=${jumpWall1.y.toFixed(1)}`)
    const jumpGap2 = tryJump(62.5, 17)
    check('gap 2 (10 wide) cannot be jumped', jumpGap2.died)
    const jumpStones = tryJump(82.5, 17)
    check('the first stepping gap (6 wide) cannot be jumped', jumpStones.died, `reached x=${jumpStones.x.toFixed(1)}`)
    const jumpStones2 = tryJump(90.9, 17)
    check('the second stepping gap (6 wide) cannot be jumped', jumpStones2.died)
    const jumpWall2 = tryJump(105.8, 17)
    check('wall 2 (8 tall) cannot be jumped', jumpWall2.x < 108.3 && !(jumpWall2.onGround && jumpWall2.y < 15), `y=${jumpWall2.y.toFixed(1)}`)
    const jumpPit = tryJump(132.5, 9)
    check('the pit (6 wide) cannot be jumped across', jumpPit.x < 139 || jumpPit.died, `reached x=${jumpPit.x.toFixed(1)}`)

    // a single bridge over BOTH stepping gaps would need more ink than you have
    const g = createGame(room3)
    step(g, none, none, 30)
    pressDraw(g, BLUE)
    const long = drawLine(g, BLUE, straight({ x: 82.6, y: 17.1 }, { x: 98.4, y: 17.1 }, 80))
    const reach = long.points[long.points.length - 1].x
    check('one line cannot span both stepping gaps (ink runs out short of the landing)', reach < 98, `line ends at x=${reach.toFixed(1)} (landing starts at x=98)`)
  }
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll drawing checks passed')
process.exit(failures ? 1 : 0)
