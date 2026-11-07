// Headless physics checks for the Doors engine (no browser needed):
//   node scripts/check-doors-physics.mjs
// Verifies the movement numbers the test room was built around: the jump
// clears 2 tiles and a 3-tile gap, a 1-tile crawlspace needs a crouch, and you
// stay crouched under a low ceiling until there's room to stand.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createGame, stepGame, resetGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { SIM, PLAYER } from '../src/doors/config.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const json = JSON.parse(fs.readFileSync(path.join(here, '../src/doors/levels/room-1-movement.json'), 'utf8'))
const level = parseLevel(json)

const none = { left: false, right: false, jump: false, crouch: false }
let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}
// runs `frames` steps, with `inputFn(frame)` giving blue's input (pink idles)
function run(game, frames, inputFn) {
  for (let f = 0; f < frames; f++) stepGame(game, [inputFn(f), none], SIM.STEP)
}

// 1. settles on the ground
let g = createGame(level)
run(g, 60, () => none)
const blue = g.players[0]
check('spawns and settles on the ground', blue.onGround && Math.abs(blue.y - 22) < 0.01, `y=${blue.y.toFixed(3)}`)

// 2. jump height
let top = blue.y
run(g, 1, () => ({ ...none, jump: true }))
for (let f = 0; f < 120; f++) {
  stepGame(g, [{ ...none, jump: true }, none], SIM.STEP)
  top = Math.min(top, blue.y)
}
const jumpH = 22 - top
check('full jump rises about 2.5 tiles (2-tile ledges are comfortable)', jumpH > 2.35 && jumpH < 2.7, `${jumpH.toFixed(2)} tiles`)

// 3. short hop when jump is released early
g = createGame(level)
run(g, 60, () => none)
run(g, 3, () => ({ ...none, jump: true }))
let hopTop = g.players[0].y
for (let f = 0; f < 120; f++) {
  stepGame(g, [none, none], SIM.STEP)
  hopTop = Math.min(hopTop, g.players[0].y)
}
check('releasing jump early gives a shorter hop', 22 - hopTop < jumpH * 0.8, `${(22 - hopTop).toFixed(2)} tiles`)

// 4. crosses the 3-tile gap at x=15..17 (running jump from the edge)
g = createGame(level)
g.players[0].x = 12
run(g, 60, () => none)
run(g, 150, (f) => ({ left: false, right: true, jump: f > 25 && f < 45, crouch: false }))
check('running jump clears the first 3-tile gap', g.players[0].x > 18 && g.players[0].deaths === 0, `x=${g.players[0].x.toFixed(2)}`)

// 5. a 3-wide gap is NOT crossed by just walking (falls and respawns)
g = createGame(level)
g.players[0].x = 12
run(g, 60, () => none)
run(g, 300, () => ({ ...none, right: true }))
check('walking into the gap falls and respawns the player', g.players[0].deaths >= 1)

// 6. climbs a 2-high block (x=27-28, surface row 20) by jumping while pushing right
g = createGame(level)
g.players[0].x = 26.5
run(g, 40, () => none)
let stoodOnBlock = false
for (let f = 0; f < 120; f++) {
  stepGame(g, [{ left: false, right: true, jump: f > 5 && f < 45, crouch: false }, none], SIM.STEP)
  const p = g.players[0]
  if (p.onGround && p.y === 20 && p.x > 27 && p.x < 29) stoodOnBlock = true
}
check('can jump up onto a 2-high block (x=27-28)', stoodOnBlock)

// 7. crawl tunnel (x=40..48): blocked standing, passable crouched
g = createGame(level)
g.players[0].x = 38
run(g, 60, () => none)
run(g, 200, () => ({ ...none, right: true }))
check('cannot walk into the one-tile tunnel while standing', g.players[0].x < 40, `x=${g.players[0].x.toFixed(2)}`)
g = createGame(level)
g.players[0].x = 38
run(g, 60, () => none)
run(g, 480, () => ({ ...none, right: true, crouch: true }))
check('can crawl through the tunnel while crouched', g.players[0].x > 49, `x=${g.players[0].x.toFixed(2)}`)

// 8. stays crouched under the ceiling after releasing crouch
g = createGame(level)
g.players[0].x = 38
run(g, 60, () => none)
run(g, 90, () => ({ ...none, right: true, crouch: true }))
run(g, 20, () => none) // release crouch inside the tunnel
check('stays crouched under the low ceiling', g.players[0].crouching && g.players[0].h < 1, `h=${g.players[0].h}`)
run(g, 300, () => ({ ...none, right: true }))
check('stands up again once clear of the ceiling', !g.players[0].crouching && g.players[0].h === PLAYER.HEIGHT_STAND)

// 8b. the widest gap a perfect running jump (best takeoff, coyote time) can clear is 5 tiles —
//     rooms that need a bridge (drawing) must use gaps of 6 or more
{
  const flatGapLevel = (width) => {
    const cols = 60
    const rows = 28
    const grid = []
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        let ch = '.'
        if (x === 0 || x === cols - 1 || y === 0) ch = '#'
        if (y >= 22 && !(x >= 20 && x <= 20 + width - 1)) ch = '#'
        line += ch
      }
      grid.push(line)
    }
    grid[21] = grid[21].slice(0, 4) + 'B' + grid[21].slice(5, 7) + 'P' + grid[21].slice(8)
    return parseLevel({ name: 'gap-test', grid })
  }
  const bestJumpClears = (width) => {
    const lv = flatGapLevel(width)
    for (let takeoff = 17; takeoff <= 20.6; takeoff += 0.02) {
      const gm = createGame(lv)
      const pl = gm.players[1]
      pl.x = 8
      run(gm, 30, () => none)
      for (let f = 0; f < 400; f++) {
        stepGame(gm, [none, { ...none, right: true, jump: pl.x >= takeoff }], SIM.STEP)
        if (pl.deaths > 0) break
        if (pl.x > 20 + width + 0.3 && pl.onGround) return true
      }
    }
    return false
  }
  check('a perfect running jump clears a 5-wide gap', bestJumpClears(5))
  check('...but no jump clears a 6-wide gap (so 6+ gaps truly need a bridge)', !bestJumpClears(6))
}

// 9. reset restores the start
resetGame(g)
check('reset puts players back at their spawns', g.players[0].x === level.spawns.blue.x && g.players[1].x === level.spawns.pink.x)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll physics checks passed')
process.exit(failures ? 1 : 0)
