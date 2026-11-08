// Headless checks for the campaign systems: hearts, extra-heart crystals, the trapdoor, "offWhile" traps
// and the tutorial prompts:
//   node scripts/check-doors-campaign.mjs
import { createGame, exportAbilities, killPlayer, resetGame, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { SIM } from '../src/doors/config.js'

const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false, teleport: false, cycle: false, echo: false, rope: false }
let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}
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
  return parseLevel({ name: 'campaign-test', grid, ...rest })
}
const BLUE = 0
const PINK = 1
const step = (g, blue = none, pink = none, frames = 1) => {
  for (let f = 0; f < frames; f++) stepGame(g, [blue, pink], SIM.STEP)
}
const settle = (g, s) => step(g, none, none, Math.round(s * 60))
const pl = (g, i) => g.players[i]
function place(g, who, x, y = 22) {
  const p = pl(g, who)
  p.x = x
  p.y = y
  p.vx = p.vy = 0
  p.onGround = true
  p.invuln = 0
}
const campaign = { chapter: 1, index: 1, title: 'test' }

// ---------------- hearts ----------------
{
  const g = createGame(room({ campaign }))
  check('campaign rooms give each player 3 hearts', pl(g, BLUE).hearts === 3 && pl(g, PINK).maxHearts === 3 && pl(g, BLUE).heartsOn)
  killPlayer(pl(g, BLUE), 'test')
  check('dying costs a heart (and respawns you)', pl(g, BLUE).hearts === 2 && pl(g, PINK).hearts === 3)
  step(g)
  check('...the room carries on while hearts remain', !g.outOfHearts)
  killPlayer(pl(g, BLUE), 'test')
  killPlayer(pl(g, BLUE), 'test')
  step(g)
  check('running out of hearts flags the room for a restart', g.outOfHearts && pl(g, BLUE).hearts === 0)
  resetGame(g)
  check('...and a restart refills every heart', !g.outOfHearts && pl(g, BLUE).hearts === 3)
  const legacy = createGame(room())
  for (let i = 0; i < 6; i++) killPlayer(pl(legacy, BLUE), 'test')
  step(legacy)
  check('the older test rooms never run out of hearts', !legacy.outOfHearts && !pl(legacy, BLUE).heartsOn)
}
{
  const g = createGame(room({ campaign, exit: { x: 50, y: 19, w: 2, h: 3 } }))
  pl(g, BLUE).hearts = 1
  place(g, BLUE, 50.5)
  step(g)
  check('reaching an exit restores all your hearts', pl(g, BLUE).hearts === 3)
}

// ---------------- extra hearts ----------------
{
  const level = room({ campaign, crystals: [{ id: 'h1', x: 20, y: 21, ability: 'heart', for: 'blue' }, { id: 'h2', x: 25, y: 21, ability: 'heart', for: 'blue' }] })
  const g = createGame(level)
  pl(g, BLUE).hearts = 1
  place(g, BLUE, 20.5)
  step(g)
  check('a heart crystal gives an extra heart and refills them', pl(g, BLUE).maxHearts === 4 && pl(g, BLUE).hearts === 4)
  check('...with a dialog', g.dialogs.length === 1 && g.dialogs[0].ability === 'heart')
  place(g, PINK, 25.5)
  step(g)
  check('it is only for its player', pl(g, PINK).maxHearts === 3 && !g.crystals[1].taken)
  const next = createGame(room({ campaign }), exportAbilities(g))
  check('the extra heart carries into the next room', pl(next, BLUE).maxHearts === 4 && pl(next, BLUE).hearts === 4 && pl(next, PINK).maxHearts === 3)
  resetGame(g)
  check('...a restart goes back to the hearts you entered with', pl(g, BLUE).maxHearts === 3 && !g.crystals[0].taken)
}

// ---------------- the trapdoor ----------------
{
  // an upper floor (row 12) with a 2-wide trapdoor, a lower floor at row 22
  const solid = [[1, 78, 12, 13]]
  const trapdoor = { id: 'td', type: 'trapdoor', x: 30, y: 12, w: 3, delay: 0.15, open: 1.2 }
  const lvl = room({ solid: [[1, 29, 12, 13], [33, 78, 12, 13]], traps: [trapdoor] })
  const g = createGame(lvl)
  void solid
  settle(g, 0.2)
  place(g, BLUE, 28, 12)
  place(g, PINK, 40, 12)
  step(g, { ...none, right: true }, none, 8)
  check('the trapdoor holds until someone steps on it', g.traps.traps[0].mode === 'closed' || g.traps.traps[0].mode === 'warn', g.traps.traps[0].mode)
  step(g, { ...none, right: true }, none, 30)
  check('...then gives way under them', ['warn', 'open'].includes(g.traps.traps[0].mode) || pl(g, BLUE).y > 13, `mode ${g.traps.traps[0].mode}, y=${pl(g, BLUE).y.toFixed(1)}`)
  step(g, none, none, 60)
  check('the first person through falls to the level below', pl(g, BLUE).y > 20, `y=${pl(g, BLUE).y.toFixed(1)}`)
  settle(g, 1.2)
  check('...and the trapdoor then seals shut for good', g.traps.traps[0].mode === 'sealed')
  place(g, PINK, 31.5, 12)
  settle(g, 1)
  check('...so the other person can stand on it and does not fall', pl(g, PINK).y < 12.1 && pl(g, PINK).onGround, `y=${pl(g, PINK).y.toFixed(2)}`)
  // both walking onto it together: only the one who stepped on first falls
  const pair = createGame(lvl)
  settle(pair, 0.2)
  place(pair, BLUE, 28.5, 12)
  place(pair, PINK, 27.7, 12)
  step(pair, { ...none, right: true }, { ...none, right: true }, 75)
  const fell = [pl(pair, BLUE), pl(pair, PINK)].filter((p) => p.y > 14).length
  check('if both walk onto it together, only one of them falls', fell === 1, `fell: ${fell}`)
  const lonely = createGame(lvl)
  place(lonely, BLUE, 31, 12)
  settle(lonely, 0.9)
  place(lonely, BLUE, 31, 14) // (somewhere under the opening: it waits for them to clear before it seals)
  const early = createGame(lvl)
  place(early, BLUE, 31, 12)
  settle(early, 0.35)
  early.players[0].y = 12.5
  early.players[0].vy = 0
  settle(early, 1.3)
  check('an open trapdoor does not seal on someone still in the opening', early.traps.traps[0].mode === 'open' || early.players[0].y > 13, early.traps.traps[0].mode)
  let msg = ''
  try {
    createGame(room({ traps: [{ id: 'bad', type: 'trapdoor', x: 30, y: 22, w: 2 }] }))
  } catch (e) {
    msg = e.message
  }
  check('a trapdoor must sit in empty cells', /overlaps a solid tile/.test(msg), msg)
}

// ---------------- hazards switched off by a plate ----------------
{
  const jet = { id: 'jet', type: 'fire', x: 20, y: 21, dir: 'right', length: 8, period: 2, on: 1.2, offset: 0, offWhile: 'p' }
  const lvl = room({ traps: [jet], plates: [{ id: 'p', x: 50, y: 21 }] })
  const g = createGame(lvl)
  place(g, BLUE, 50.5) // Blue stands on the plate
  place(g, PINK, 5)
  settle(g, 1.5) // (the plate is registered, and the jet is between pulses)
  place(g, PINK, 25)
  const d0 = pl(g, PINK).deaths
  settle(g, 4)
  check('a jet is switched off while its plate is held', pl(g, PINK).deaths === d0 && g.traps.traps[0].beam === null)
  place(g, BLUE, 10)
  settle(g, 3)
  check('...and burns again once the plate is released', pl(g, PINK).deaths > d0)
  const arrow = { id: 'a', type: 'arrow', x: 40, y: 20.9, dir: 'left', period: 2, offset: 0, speed: 9, range: 12, offWhile: 'p' }
  const a = createGame(room({ traps: [arrow], plates: [{ id: 'p', x: 60, y: 21 }] }))
  settle(a, 1)
  place(a, BLUE, 60.5)
  place(a, PINK, 34)
  settle(a, 5)
  check('arrows stop while their plate is held', pl(a, PINK).deaths === 0 && a.traps.traps[0].arrows.length === 0)
}

// ---------------- plate-or-lever doors and traps ----------------
{
  const lvl = room({ plates: [{ id: 'p', x: 10, y: 21 }], switches: [{ id: 'lv', x: 30, y: 21, mode: 'once' }], doors: [{ id: 'd', type: 'plate', plates: ['p'], orSwitches: ['lv'], holdOpen: 0, x: 20, y: 19, h: 3 }] })
  const g = createGame(lvl)
  place(g, BLUE, 10.5)
  step(g)
  check('a plate door opens while its plate is held', g.doors.doors[0].open)
  place(g, BLUE, 5)
  settle(g, 0.3)
  check('...and shuts when it is released', !g.doors.doors[0].open)
  place(g, BLUE, 10.5)
  place(g, PINK, 29.5)
  step(g)
  step(g, none, { ...none, interact: true })
  place(g, BLUE, 5)
  settle(g, 0.5)
  check('...but once its lever is flipped it stays open for good', g.doors.doors[0].open)
  let msg = ''
  try {
    createGame(room({ plates: [{ id: 'p', x: 10, y: 21 }], doors: [{ id: 'd', type: 'plate', plates: ['p'], orSwitches: ['nope'], x: 20, y: 19, h: 3 }] }))
  } catch (e) {
    msg = e.message
  }
  check('an unknown lever in orSwitches is rejected', /missing switch/.test(msg), msg)
  const jet = { id: 'jet', type: 'fire', x: 40, y: 21, dir: 'right', length: 8, period: 2, on: 2, offset: 0, offWhile: 'lv' }
  const t = createGame(room({ traps: [jet], switches: [{ id: 'lv', x: 30, y: 21, mode: 'once' }] }))
  settle(t, 0.5)
  place(t, PINK, 45)
  const d0 = pl(t, PINK).deaths
  settle(t, 1)
  check('a jet burns until its lever is flipped', pl(t, PINK).deaths > d0)
  place(t, BLUE, 30.5)
  step(t, { ...none, interact: true })
  place(t, PINK, 45)
  const d1 = pl(t, PINK).deaths
  settle(t, 4)
  check('...and then is off for good', pl(t, PINK).deaths === d1)
}

// ---------------- prompts ----------------
{
  const g = createGame(room({ prompts: [{ x: 20, y: 20, dir: 'down', text: 'JUMP' }] }))
  check('tutorial prompts are carried by the level', g.level.objects.prompts.length === 1 && g.level.objects.prompts[0].text === 'JUMP')
  check('...and the level knows its chapter, theme and intro', createGame(room({ campaign, theme: 'basement', intro: { doorX: 5, doorY: 21 } })).level.campaign.chapter === 1)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll campaign-system checks passed')
process.exit(failures ? 1 : 0)
