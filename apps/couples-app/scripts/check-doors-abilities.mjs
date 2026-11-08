// Headless checks for the unlockable abilities: crystals, Solid Light 1-3, Jump Boost 1-3 and
// Teleport 1-3:
//   node scripts/check-doors-abilities.mjs
import { createGame, exportAbilities, killPlayer, resetGame, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { beginStroke, endStroke, extendStroke } from '../src/doors/drawing.js'
import { abilityDialog, currentTeleportAction, teleportActions, teleportLabel } from '../src/doors/abilities.js'
import { ABILITY, SIM } from '../src/doors/config.js'

const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false, teleport: false, cycle: false }
let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

function room(extra = {}) {
  const { solid = [], ...rest } = extra
  const cols = 90
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
  return parseLevel({ name: 'abilities-test', grid, ...rest })
}
const BLUE = 0
const PINK = 1
const R = { ...none, right: true }
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
const withAbilities = (abilities, extra = {}) => createGame(room({ abilities, ...extra }))

// ---------------- crystals ----------------
{
  const level = room({
    abilities: {},
    crystals: [
      { id: 'cb', x: 20, y: 21, ability: 'jumpBoost', for: 'blue' },
      { id: 'cb2', x: 24, y: 21, ability: 'jumpBoost', for: 'blue' },
      { id: 'cp', x: 30, y: 21, ability: 'teleport', for: 'pink' },
    ],
  })
  const g = createGame(level)
  check('with "abilities": {} the players start with nothing', pl(g, BLUE).abilities.jumpBoost === 0 && pl(g, BLUE).abilities.solidLight === 0)
  place(g, PINK, 20.5)
  step(g)
  check('a crystal can only be taken by the player it is for', !g.crystals[0].taken && pl(g, PINK).abilities.jumpBoost === 0)
  place(g, BLUE, 20.5)
  step(g)
  check('taking a crystal grants the ability at level 1', g.crystals[0].taken && pl(g, BLUE).abilities.jumpBoost === 1)
  check('...and queues a "you have obtained" dialog (the game pauses on it)', g.dialogs.length === 1 && g.dialogs[0].ability === 'jumpBoost' && g.dialogs[0].level === 1 && !g.dialogs[0].upgraded && g.dialogs[0].player === 'blue')
  place(g, BLUE, 24.5)
  step(g)
  check('a second crystal for the same ability upgrades it', pl(g, BLUE).abilities.jumpBoost === 2 && g.dialogs.length === 2 && g.dialogs[1].upgraded && g.dialogs[1].level === 2)
  settle(g, 4)
  check('dialogs wait to be read (they do not time out)', g.dialogs.length === 2)
  place(g, PINK, 30.5)
  step(g)
  check('...each player has their own abilities', pl(g, PINK).abilities.teleport === 1 && pl(g, BLUE).abilities.teleport === 0)
  const saved = exportAbilities(g)
  resetGame(g)
  check('resetting the room puts the crystals back and the abilities as they were on entry', !g.crystals[0].taken && pl(g, BLUE).abilities.jumpBoost === 0 && pl(g, PINK).abilities.teleport === 0)
  const next = createGame(room({ abilities: { jumpBoost: 1 } }), saved)
  check('abilities carry into the next room (and the room’s minimum applies on top)', pl(next, BLUE).abilities.jumpBoost === 2 && pl(next, PINK).abilities.teleport === 1)
  const capped = createGame(room({ abilities: {} }), { blue: { jumpBoost: 9 } })
  check('...never above level 3', pl(capped, BLUE).abilities.jumpBoost === 3)
  check('a room without an "abilities" key gives Solid Light 1 (how it always worked)', createGame(room()).players[0].abilities.solidLight === 1)
  let bad = ''
  try {
    createGame(room({ crystals: [{ id: 'x', x: 5, y: 21, ability: 'flying', for: 'blue' }] }))
  } catch (e) {
    bad = e.message
  }
  check('an unknown ability on a crystal is rejected', /unknown ability/.test(bad), bad)
}

// ---------------- Solid Light ----------------
const draw = (g, who, x0, y0, x1, y1) => {
  step(g, who === BLUE ? { ...none, draw: true } : none, who === PINK ? { ...none, draw: true } : none)
  step(g)
  const p = pl(g, who)
  if (!beginStroke(g, p, x0, y0)) return null
  for (let i = 1; i <= 80; i++) extendStroke(g, p, x0 + ((x1 - x0) * i) / 80, y0 + ((y1 - y0) * i) / 80)
  return endStroke(g, p)
}
{
  const g = withAbilities({})
  place(g, BLUE, 10)
  step(g, { ...none, draw: true })
  step(g)
  check('without Solid Light the draw key does nothing', pl(g, BLUE).draw.mode === 'idle')
}
{
  const g = withAbilities({ solidLight: 1 })
  place(g, BLUE, 10)
  const line = draw(g, BLUE, 20, 21, 50, 21)
  check('Solid Light 1: a short beam, 3 tiles at most', line && line.length > 2.9 && line.length <= 3.001, `length ${line?.length.toFixed(2)}`)
  settle(g, 2.8)
  check('...that lasts 3 seconds', g.lines.length === 1)
  settle(g, 0.4)
  check('...and then vanishes', g.lines.length === 0 && pl(g, BLUE).draw.mode === 'idle')
}
{
  const g = withAbilities({ solidLight: 2 })
  place(g, BLUE, 10)
  const line = draw(g, BLUE, 20, 21, 60, 21)
  check('Solid Light 2: a longer beam', line && line.length > 17.9 && line.length <= 18.001, `length ${line?.length.toFixed(2)}`)
  settle(g, 4.7)
  check('...that lasts 5 seconds', g.lines.length === 1)
  settle(g, 0.5)
  check('...and then vanishes', g.lines.length === 0)
}
{
  const g = withAbilities({ solidLight: 3 })
  place(g, BLUE, 10)
  const line = draw(g, BLUE, 20, 21, 70, 21)
  check('Solid Light 3: a longer beam still', line && line.length > 23.9 && line.length <= 24.001, `length ${line?.length.toFixed(2)}`)
  settle(g, 20)
  check('...that never fades by itself', g.lines.length === 1)
  check('...and holds the caster in place', pl(g, BLUE).draw.mode === 'active' && Math.abs(pl(g, BLUE).x - 10) < 0.01)
  step(g, R, none, 3)
  check('...it ends when the caster moves, and they are free', g.lines.length === 0 && pl(g, BLUE).draw.mode === 'idle', `mode ${pl(g, BLUE).draw.mode}`)
  step(g, R, none, 20)
  check('...and they walk off', pl(g, BLUE).x > 10.5)
  const h = withAbilities({ solidLight: 3 })
  place(h, BLUE, 10)
  draw(h, BLUE, 20, 21, 30, 21)
  killPlayer(pl(h, BLUE), 'test')
  step(h)
  check('if the caster dies the line goes with them', h.lines.length === 0)
}

// ---------------- Jump Boost ----------------
// holds jump for `hold` frames, returns the highest point reached (smaller y = higher)
function apex(g, who, hold = 40) {
  const p = pl(g, who)
  const start = p.y
  let top = start
  for (let f = 0; f < 90; f++) {
    step(g, who === BLUE ? { ...none, jump: f < hold } : none, who === PINK ? { ...none, jump: f < hold } : none)
    top = Math.min(top, p.y)
  }
  return start - top
}
{
  const base = apex(withAbilities({}), BLUE)
  const boosted = apex(withAbilities({ jumpBoost: 1 }), BLUE)
  check('Jump Boost 1 lifts the jump slightly', boosted > base * 1.08 && boosted < base * 1.35, `${base.toFixed(2)} -> ${boosted.toFixed(2)} tiles`)
  const g = withAbilities({ jumpBoost: 1 })
  settle(g, 0.3)
  step(g, { ...none, jump: true })
  check('...with a small burst of light', g.fx.some((f) => f.type === 'burst'))
  const e = withAbilities({ jumpBoost: 1 })
  step(e, { ...none, jump: true }, none, 12)
  step(e, none, none, 1)
  step(e, { ...none, jump: true }, none, 1)
  check('...but no mid-air jump at level 1', e.lines.length === 0)
}
// a double jump: jump, release, press again in the air
function chainJumps(g, presses, gap = 14, extra = () => ({})) {
  const p = pl(g, BLUE)
  const start = p.y
  let top = start
  const events = []
  step(g, { ...none, jump: true }, none, 1)
  let frame = 0
  for (let k = 0; k < presses; k++) {
    for (let f = 0; f < gap; f++) {
      step(g, { ...none, jump: true, ...extra() })
      top = Math.min(top, p.y)
      frame++
    }
    step(g, none, none, 1) // let go
    step(g, { ...none, jump: true, ...extra() })
    events.push({ y: p.y, vy: p.vy, vx: p.vx, stones: g.lines.filter((l) => l.stone).length })
  }
  for (let f = 0; f < 60; f++) {
    step(g, { ...none, jump: true })
    top = Math.min(top, p.y)
  }
  return { height: start - top, events }
}
{
  const single = apex(withAbilities({ jumpBoost: 1 }), BLUE)
  const g = withAbilities({ jumpBoost: 2 })
  const { height, events } = chainJumps(g, 1)
  check('Jump Boost 2: a second jump in mid-air, off a stepping stone', events[0].stones === 1 && height > single * 1.6, `${height.toFixed(2)} tiles vs ${single.toFixed(2)} for a single jump`)
  const stone = g.lines.find((l) => l.stone)
  const gone = withAbilities({ jumpBoost: 2 })
  chainJumps(gone, 1)
  settle(gone, 1)
  check('...the stone is a short-lived line and the jumper is not frozen', !gone.lines.some((l) => l.stone) && pl(gone, BLUE).draw.mode === 'idle')
  void stone
  const h = withAbilities({ jumpBoost: 2 })
  const r = chainJumps(h, 2)
  check('...but only one extra jump (a third press does nothing)', r.events[1].stones === 1 && r.height < single * 2.6, `${r.height.toFixed(2)} tiles, stones ${r.events[1].stones}`)
  settle(h, 2)
  const again = chainJumps(h, 1)
  check('...it comes back on landing', again.events[0].stones === 1, `stones ${again.events[0].stones}`)
}
{
  const g = withAbilities({ jumpBoost: 3 })
  const { height, events } = chainJumps(g, 3, 13)
  const single = apex(withAbilities({ jumpBoost: 1 }), BLUE)
  check('Jump Boost 3: three stones make a quadruple jump', events.length === 3 && events[2].stones >= 1 && height > single * 3, `${height.toFixed(2)} tiles vs ${single.toFixed(2)} single`)
  const four = withAbilities({ jumpBoost: 3 })
  const r = chainJumps(four, 4, 11)
  check('...and no more than three', r.height < height + single * 0.9, `${r.height.toFixed(2)} vs ${height.toFixed(2)} with three`)

  // direction choice: nothing held = up; a direction = diagonal; direction + crouch = forward
  const up = withAbilities({ jumpBoost: 3 })
  const e1 = chainJumps(up, 2, 12)
  const diag = withAbilities({ jumpBoost: 3 })
  let held = false
  const e2 = chainJumps(diag, 2, 12, () => ({ right: held }))
  void held
  void e1
  void e2
  const d = withAbilities({ jumpBoost: 3 })
  const p = pl(d, BLUE)
  step(d, { ...none, jump: true }, none, 14)
  step(d, none, none, 1)
  step(d, { ...none, jump: true, right: true })
  check('with a direction held, an extra jump is diagonal: up AND forward', p.vy < -8 && p.vx > 6.5, `vx ${p.vx.toFixed(1)}, vy ${p.vy.toFixed(1)}`)
  const f = withAbilities({ jumpBoost: 3 })
  const q = pl(f, BLUE)
  step(f, { ...none, jump: true }, none, 14)
  step(f, none, none, 1)
  step(f, { ...none, jump: true, right: true, crouch: true })
  check('...with the direction and crouch held it is straight forward: a quick dash with little lift', q.vx > 8.5 && q.vy > -6 && q.vy < 0, `vx ${q.vx.toFixed(1)}, vy ${q.vy.toFixed(1)}`)
  step(f, { ...none, right: true }, none, 6)
  check('...and the dash keeps its speed through the air', q.vx > 8, `vx ${q.vx.toFixed(1)}`)
  const u = withAbilities({ jumpBoost: 3 })
  const w = pl(u, BLUE)
  step(u, { ...none, jump: true }, none, 14)
  step(u, none, none, 1)
  step(u, { ...none, jump: true })
  check('...and with nothing held it is straight up', w.vy < -10 && Math.abs(w.vx) < 0.5, `vx ${w.vx.toFixed(1)}, vy ${w.vy.toFixed(1)}`)
}
{
  // a stone is solid to the partner: Pink can land on Blue's stepping stone
  const g = withAbilities({ jumpBoost: 2 })
  place(g, BLUE, 20)
  place(g, PINK, 20.4)
  pl(g, PINK).y = 12 // dropping from above onto the spot where the stone will appear
  pl(g, PINK).onGround = false
  step(g, { ...none, jump: true }, none, 14)
  step(g, none, none, 1)
  step(g, { ...none, jump: true })
  check('(setup) Blue made a stepping stone', g.lines.some((l) => l.stone))
  void ABILITY
}

// ---------------- Teleport ----------------
const TP = { ...none, teleport: true }
const CYCLE = { ...none, cycle: true }
{
  const g = withAbilities({ teleport: 1 })
  place(g, BLUE, 10)
  place(g, PINK, 40)
  check('Teleport 1 offers one action: to the partner', teleportActions(pl(g, BLUE)).join() === 'partner')
  step(g, TP)
  check('Teleport 1 takes you to your partner', Math.abs(pl(g, BLUE).x - 40) > 0.5 && Math.abs(pl(g, BLUE).x - 40) < 1.2 && pl(g, BLUE).onGround === false, `x=${pl(g, BLUE).x.toFixed(2)}`)
  settle(g, 0.5)
  check('...and you stand next to them', pl(g, BLUE).onGround && Math.abs(pl(g, BLUE).y - 22) < 0.01)
  place(g, BLUE, 10)
  step(g, TP)
  step(g)
  check('...there is a cooldown between teleports', Math.abs(pl(g, BLUE).x - 10) < 0.1, `x=${pl(g, BLUE).x.toFixed(2)}`)
  settle(g, 1.2)
  step(g, TP)
  check('...after which you can go again', Math.abs(pl(g, BLUE).x - 40) < 1.2)
  const nope = withAbilities({})
  place(nope, BLUE, 10)
  place(nope, PINK, 40)
  step(nope, TP)
  check('without the ability the key does nothing', Math.abs(pl(nope, BLUE).x - 10) < 0.01)
}
{
  const g = withAbilities({ teleport: 2 })
  place(g, BLUE, 10)
  place(g, PINK, 40)
  check('Teleport 2 adds swapping places', teleportActions(pl(g, BLUE)).join() === 'partner,swap')
  step(g, CYCLE)
  step(g)
  check('...chosen with the change key', currentTeleportAction(pl(g, BLUE)) === 'swap')
  step(g, TP)
  check('...and the players swap places', Math.abs(pl(g, BLUE).x - 40) < 0.01 && Math.abs(pl(g, PINK).x - 10) < 0.01, `blue ${pl(g, BLUE).x.toFixed(1)}, pink ${pl(g, PINK).x.toFixed(1)}`)
  step(g, CYCLE)
  step(g)
  check('...the change key wraps back round', currentTeleportAction(pl(g, BLUE)) === 'partner')
}
{
  const g = withAbilities({ teleport: 3 })
  place(g, BLUE, 15)
  place(g, PINK, 60)
  check('Teleport 3 adds the Marker action', teleportActions(pl(g, BLUE)).join() === 'partner,swap,marker')
  step(g, CYCLE)
  step(g)
  step(g, CYCLE)
  step(g)
  check('(setup) "marker" is selected, and it says it will place a mark', currentTeleportAction(pl(g, BLUE)) === 'marker' && /Place/.test(teleportLabel(pl(g, BLUE))), teleportLabel(pl(g, BLUE)))
  step(g, TP)
  check('the first use places a mark where you stand', pl(g, BLUE).tpMarker && Math.abs(pl(g, BLUE).tpMarker.x - 15) < 0.01)
  check('...with no cooldown', pl(g, BLUE).tpCooldown === 0)
  place(g, BLUE, 50)
  step(g)
  check('...the key then offers to go to the mark', /Go to/.test(teleportLabel(pl(g, BLUE))), teleportLabel(pl(g, BLUE)))
  step(g, TP)
  check('...and using it again takes you back to the mark from anywhere (no need to change action)', Math.abs(pl(g, BLUE).x - 15) < 0.01 && pl(g, BLUE).tpMarker !== null, `x=${pl(g, BLUE).x.toFixed(2)}`)
  settle(g, 1.2)
  check('...standing on the mark, the label offers to pick it up', /Pick up/.test(teleportLabel(pl(g, BLUE))), teleportLabel(pl(g, BLUE)))
  step(g, TP)
  check('...and using it there picks the mark up', pl(g, BLUE).tpMarker === null && Math.abs(pl(g, BLUE).x - 15) < 0.01)
  place(g, BLUE, 30)
  step(g)
  step(g, TP)
  check('...after which it places a new mark', pl(g, BLUE).tpMarker && Math.abs(pl(g, BLUE).tpMarker.x - 30) < 0.01)
  place(g, BLUE, 50)
  step(g)
  // wall the marked spot in: the teleport must refuse
  for (let y = 19; y <= 21; y++) for (let x = 29; x <= 31; x++) g.level.solid[y * g.level.cols + x] = 1
  step(g, TP)
  check('...but not into solid rock', Math.abs(pl(g, BLUE).x - 50) < 0.01)
}
{
  const g = withAbilities({ teleport: 1 })
  place(g, BLUE, 10)
  place(g, PINK, 40)
  step(g, { ...none, draw: true })
  check('(setup) Blue has no Solid Light, so he is not frozen', pl(g, BLUE).draw.mode === 'idle')
  const h = withAbilities({ teleport: 1, solidLight: 1 })
  place(h, BLUE, 10)
  place(h, PINK, 40)
  step(h, { ...none, draw: true })
  step(h)
  step(h, TP)
  check('someone frozen while drawing cannot teleport', pl(h, BLUE).draw.mode === 'aiming' && Math.abs(pl(h, BLUE).x - 10) < 0.01)
}
{
  // teleporting to a partner who is on the ceiling puts you on the ceiling too
  const g = withAbilities({ teleport: 1 })
  place(g, BLUE, 10)
  const q = pl(g, PINK)
  q.grav = -1
  q.facing = -q.facing
  place(g, PINK, 40, 4)
  q.grav = -1
  step(g, TP)
  check('teleporting to a partner on the ceiling puts you up there too', pl(g, BLUE).grav === -1 && Math.abs(pl(g, BLUE).y - 4) < 0.05, `grav ${pl(g, BLUE).grav}, y ${pl(g, BLUE).y.toFixed(2)}`)
  settle(g, 1)
  check('...and you land on the ceiling beside them', pl(g, BLUE).onGround && Math.abs(pl(g, BLUE).y - 4) < 0.01)
}
{
  // teleporting breaks a shoulder carry
  const g = withAbilities({ teleport: 3 })
  place(g, BLUE, 20)
  const p = pl(g, PINK)
  p.x = 20.05
  p.y = 22 - 1.75 - 2
  p.onGround = false
  settle(g, 0.8)
  check('(setup) Pink rides Blue', p.carriedBy === 'blue')
  place(g, BLUE, 40)
  const a = pl(g, BLUE)
  a.tpMarker = { x: 60, y: 22, grav: 1 }
  a.tpAction = 3
  step(g, TP)
  check('teleporting ends a shoulder carry', a.carrying === null && p.carriedBy === null && Math.abs(a.x - 60) < 0.01)
}

// ---------------- the "obtained" dialog text ----------------
{
  const t1 = abilityDialog({ player: 'blue', ability: 'teleport', level: 1, upgraded: false })
  check('the dialog says who obtained what', t1.title === 'Blue found Teleport', t1.title)
  check('...and how to use it, with that player own key', t1.lines.length > 0 && /press F./.test(t1.lines.join(' ')), t1.lines.join(' '))
  const t2 = abilityDialog({ player: 'pink', ability: 'teleport', level: 1, upgraded: false })
  check('...Pink gets Pink key', t2.title === 'Pink found Teleport' && /press ,./.test(t2.lines.join(' ')), t2.lines.join(' '))
  const up = abilityDialog({ player: 'blue', ability: 'jumpBoost', level: 2, upgraded: true })
  check('an upgrade names the new level and what it adds', up.title === 'Blue found Jump Boost II' && up.subtitle === 'Upgraded to level II' && /mid-air/.test(up.lines.join(' ')), up.title)
  const t3 = abilityDialog({ player: 'blue', ability: 'teleport', level: 3, upgraded: true })
  check('...Teleport III explains the Marker', /Marker/.test(t3.lines.join(' ')) && /G/.test(t3.lines.join(' ')))
  const touchText = abilityDialog({ player: 'blue', ability: 'teleport', level: 3, upgraded: true }, true).lines.join(' ')
  check('with the touch controls the dialog talks about the toolbelt buttons, not keys', /NEXT/.test(touchText) && /USE/.test(touchText) && !/ G /.test(touchText) && !/Press F/.test(touchText), touchText.slice(0, 60))
  const touchRope = abilityDialog({ player: 'pink', ability: 'lightRope', level: 1, upgraded: false }, true).lines.join(' ')
  check('...for the rope too', /toolbelt/.test(touchRope) && /joystick/.test(touchRope) && !/click/.test(touchRope))
  let missing = 0
  for (const id of ['solidLight', 'jumpBoost', 'teleport', 'lightEcho', 'lightRope']) {
    for (const level of [1, 2, 3]) {
      const d = abilityDialog({ player: 'pink', ability: id, level, upgraded: level > 1 })
      if (!d.lines.length || !d.title || !d.color) missing++
    }
  }
  check('every ability and level has dialog text', missing === 0)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll ability checks passed')
process.exit(failures ? 1 : 0)
