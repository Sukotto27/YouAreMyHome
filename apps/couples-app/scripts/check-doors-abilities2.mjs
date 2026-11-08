// Headless checks for Light Echo and Light Rope (and the drawing arm aim, and the crystal colours):
//   node scripts/check-doors-abilities2.mjs
import { createGame, killPlayer, resetGame, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { beginStroke, endStroke, extendStroke } from '../src/doors/drawing.js'
import { fireRope } from '../src/doors/rope.js'
import { ABILITY, SIM } from '../src/doors/config.js'
import { ABILITY_IDS } from '../src/doors/abilities.js'

const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false, teleport: false, cycle: false, echo: false, rope: false }
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
  return parseLevel({ name: 'abilities2-test', grid, ...rest })
}
const BLUE = 0
const PINK = 1
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
const ECHO = { ...none, echo: true }
const ROPE = { ...none, rope: true }

// ---------------- colours ----------------
{
  const colors = ABILITY_IDS.map((id) => ABILITY.COLORS[id])
  check('every ability has its own crystal colour', colors.every(Boolean) && new Set(colors).size === ABILITY_IDS.length, colors.join(' '))
  const g = createGame(
    room({
      abilities: {},
      crystals: [
        { id: 'e', x: 20, y: 21, ability: 'lightEcho', for: 'blue' },
        { id: 'r', x: 25, y: 21, ability: 'lightRope', for: 'pink' },
      ],
    }),
  )
  place(g, BLUE, 20.5)
  place(g, PINK, 25.5)
  step(g)
  check('crystals can grant Light Echo and Light Rope', pl(g, BLUE).abilities.lightEcho === 1 && pl(g, PINK).abilities.lightRope === 1)
}

// ---------------- drawing: the caster turns toward the line and points at it ----------------
{
  const g = withAbilities({ solidLight: 2 })
  place(g, BLUE, 30)
  step(g, { ...none, draw: true })
  step(g)
  beginStroke(g, pl(g, BLUE), 20, 21)
  check('while drawing, the caster faces the line and aims at it', pl(g, BLUE).facing === -1 && pl(g, BLUE).aim.x === 20 && pl(g, BLUE).aim.y === 21)
  extendStroke(g, pl(g, BLUE), 20, 17)
  check('...and keeps aiming at the end of the stroke', pl(g, BLUE).aim.y === 17)
  endStroke(g, pl(g, BLUE))
  check('...and at the line while it holds them', pl(g, BLUE).draw.mode === 'active' && pl(g, BLUE).aim.y === 17)
}

// ---------------- Light Echo ----------------
{
  const level = { plates: [{ id: 'p', x: 30, y: 21 }], doors: [{ id: 'd', type: 'plate', plates: ['p'], x: 40, y: 19, h: 3 }] }
  for (const [lvl, seconds] of [[1, 5], [2, 10], [3, 20]]) {
    const g = withAbilities({ lightEcho: lvl }, level)
    place(g, BLUE, 30.5)
    step(g, ECHO)
    check(`Light Echo ${lvl}: casting leaves a copy behind`, g.echoes.length === 1 && Math.abs(g.echoes[0].x - 30.5) < 0.01)
    place(g, BLUE, 10)
    settle(g, seconds - 0.5)
    check(`...it holds the plate (and the door open) for ${seconds}s`, g.doors.plates[0].held && g.doors.doors[0].open, `t=${(seconds - 0.5).toFixed(1)}s`)
    settle(g, 1)
    check('...then fades and the door shuts', !g.doors.plates[0].held && !g.doors.doors[0].open && g.echoes.length === 0)
  }
  const g = withAbilities({ lightEcho: 3 }, level)
  place(g, BLUE, 30.5)
  step(g, ECHO)
  place(g, BLUE, 50)
  settle(g, 2)
  step(g, ECHO)
  check('a new echo replaces the old one (one each)', g.echoes.length === 1 && Math.abs(g.echoes[0].x - 50) < 0.01 && !g.doors.plates[0].held)
  place(g, BLUE, 60)
  step(g, ECHO)
  check('...there is a cooldown between casts', Math.abs(g.echoes[0].x - 50) < 0.01)
  const air = withAbilities({ lightEcho: 1 }, level)
  place(air, BLUE, 30.5, 15)
  pl(air, BLUE).onGround = false
  step(air, ECHO)
  check('you cannot cast in mid-air', air.echoes.length === 0)
  const none1 = withAbilities({}, level)
  place(none1, BLUE, 30.5)
  step(none1, ECHO)
  check('without the ability nothing happens', none1.echoes.length === 0)
  resetGame(g)
  check('resetting the room clears echoes', g.echoes.length === 0)
}
{
  const colored = { plates: [{ id: 'p', x: 30, y: 21, color: 'pink' }] }
  const g = withAbilities({ lightEcho: 2 }, colored)
  place(g, BLUE, 30.5)
  step(g, ECHO)
  check('a plate for Pink is not pressed by Blue’s echo', !g.doors.plates[0].held)
  place(g, PINK, 30.5)
  step(g, none, ECHO)
  place(g, PINK, 10)
  step(g)
  check('...but is by Pink’s', g.doors.plates[0].held)
}
{
  const g = withAbilities({ lightEcho: 1 }, { plates: [{ id: 'cp', x: 30, y: 4, ceiling: true }] })
  const p = pl(g, BLUE)
  p.grav = -1
  p.facing = -p.facing
  place(g, BLUE, 30.5, 4)
  p.grav = -1
  step(g, ECHO)
  place(g, BLUE, 10)
  pl(g, BLUE).grav = 1
  step(g)
  check('an echo cast on the ceiling holds a ceiling plate', g.doors.plates[0].held && g.echoes[0].grav === -1)
  const h = withAbilities({ lightEcho: 1, solidLight: 1 })
  place(h, BLUE, 30)
  step(h, { ...none, draw: true })
  step(h)
  step(h, ECHO)
  check('someone frozen drawing cannot cast', h.echoes.length === 0)
}

// ---------------- Light Rope ----------------
const aimed = (g, who) => pl(g, who).rope.mode === 'aiming'
{
  const g = withAbilities({})
  place(g, BLUE, 30)
  step(g, ROPE)
  check('without the ability the rope key does nothing', pl(g, BLUE).rope.mode === 'idle')
  const h = withAbilities({ lightRope: 1 })
  place(h, BLUE, 30)
  step(h, ROPE)
  check('the rope key starts aiming', aimed(h, BLUE))
  step(h)
  step(h, ROPE)
  check('...and cancels it', pl(h, BLUE).rope.mode === 'idle')
  // one mouse
  const m = withAbilities({ lightRope: 1, solidLight: 1 })
  place(m, BLUE, 30)
  place(m, PINK, 50)
  step(m, ROPE)
  step(m, none, { ...none, draw: true })
  step(m)
  check('only one of you can use the mouse: Pink cannot start drawing while Blue aims a rope', pl(m, PINK).draw.mode === 'idle')
  const m2 = withAbilities({ lightRope: 1, solidLight: 1 })
  place(m2, BLUE, 30)
  place(m2, PINK, 50)
  step(m2, none, { ...none, draw: true })
  step(m2)
  step(m2, ROPE)
  check('...and Blue cannot aim a rope while Pink is aiming a line', pl(m2, BLUE).rope.mode === 'idle')
}
{
  // a block hanging from the ceiling (rows 4..14 at x=30..44): its underside is at y=15
  const solid = [[30, 44, 4, 14]]
  const reach = (lvl, ax, ay) => {
    const g = withAbilities({ lightRope: lvl }, { solid })
    place(g, BLUE, 30.5)
    step(g, ROPE)
    return { g, hit: fireRope(g, pl(g, BLUE), { x: ax, y: ay }) }
  }
  check('Light Rope 1 reaches a nearby ceiling', reach(1, 30.5, 14).hit === 'solid')
  const far = reach(1, 30.5, 4.5) // straight up, 17 tiles: the ceiling is out of range ... but the block is in the way
  check('...the first solid thing it meets is what it catches', far.hit === 'solid' && Math.abs(far.g.players[0].rope.anchor.y - 15) < 0.2, `anchor y=${far.g.players[0].rope.anchor?.y.toFixed(2)}`)
  const open = withAbilities({ lightRope: 1 })
  place(open, BLUE, 30.5)
  step(open, ROPE)
  check('...but nothing is caught beyond its range (7 tiles at level 1)', fireRope(open, pl(open, BLUE), { x: 30.5, y: 4.5 }) === null && pl(open, BLUE).rope.mode === 'idle')
  const l2 = withAbilities({ lightRope: 2 })
  place(l2, BLUE, 30.5)
  step(l2, ROPE)
  check('...level 2 reaches further (11)', fireRope(l2, pl(l2, BLUE), { x: 30.5, y: 11 }) === null)
  const l2b = withAbilities({ lightRope: 2 }, { solid: [[30, 44, 4, 10]] })
  place(l2b, BLUE, 30.5)
  step(l2b, ROPE)
  check('...a surface 9 tiles up is within level 2 but not 1', fireRope(l2b, pl(l2b, BLUE), { x: 30.5, y: 10 }) === 'solid')
  const l1b = withAbilities({ lightRope: 1 }, { solid: [[30, 44, 4, 10]] })
  place(l1b, BLUE, 30.5)
  step(l1b, ROPE)
  check('...(level 1 cannot: 12 tiles)', fireRope(l1b, pl(l1b, BLUE), { x: 30.5, y: 10 }) === null)
  const l3 = withAbilities({ lightRope: 3 })
  place(l3, BLUE, 30.5, 18) // (a room whose floor is at 18, like most of the test rooms)
  step(l3, ROPE)
  check('...and level 3 reaches the ceiling of such a room from the floor (13 tiles up)', fireRope(l3, pl(l3, BLUE), { x: 30.5, y: 4 }) === 'solid')
}
{
  // swinging from a block overhead
  const solid = [[28, 44, 4, 14]]
  const g = withAbilities({ lightRope: 2 }, { solid })
  const p = pl(g, BLUE)
  place(g, BLUE, 24, 17)
  p.onGround = false
  p.vx = 3
  step(g, ROPE)
  const type = fireRope(g, p, { x: 31, y: 14.5 })
  check('(setup) a rope latched onto the overhang while Blue was in the air', type === 'solid')
  const anchor = p.rope.anchor
  const len = p.rope.length
  let maxDist = 0
  let maxX = -1e9
  let minX = 1e9
  for (let f = 0; f < 180; f++) {
    step(g)
    const d = Math.hypot(p.x - anchor.x, p.y - p.h / 2 - anchor.y)
    maxDist = Math.max(maxDist, d)
    maxX = Math.max(maxX, p.x)
    minX = Math.min(minX, p.x)
  }
  check('a hanging player swings like a pendulum: never further from the anchor than the rope is long', maxDist < len + 0.12, `max ${maxDist.toFixed(2)} vs length ${len.toFixed(2)}`)
  check('...swinging out past the anchor on both sides', maxX > anchor.x + 0.3 && minX < anchor.x - 0.3, `x from ${minX.toFixed(1)} to ${maxX.toFixed(1)} (anchor ${anchor.x.toFixed(1)})`)
}
{
  const solid = [[28, 44, 4, 14]]
  const make = () => {
    const g = withAbilities({ lightRope: 3 }, { solid })
    const p = pl(g, BLUE)
    place(g, BLUE, 24, 17)
    p.onGround = false
    step(g, ROPE)
    fireRope(g, p, { x: 31, y: 14.5 })
    return { g, p }
  }
  const { g, p } = make()
  const l0 = p.rope.length
  step(g, { ...none, crouch: true }, none, 30)
  check('crouch reels the rope in (and does not crouch you)', p.rope.length < l0 - 3 && !p.crouching, `${l0.toFixed(1)} -> ${p.rope.length.toFixed(1)}`)
  step(g, { ...none, crouch: true }, none, 120)
  check('...down to a minimum length', p.rope.length >= ABILITY.ROPE_MIN_LENGTH - 1e-6 && p.rope.length < 1.5, `${p.rope.length.toFixed(2)}`)
  const j = make()
  step(j.g, none, none, 20)
  const vx = j.p.vx
  step(j.g, { ...none, jump: true })
  check('jump lets go of the rope (and you keep your speed)', j.p.rope.mode === 'idle' && Math.abs(j.p.vx - vx) < 4, `vx ${vx.toFixed(1)} -> ${j.p.vx.toFixed(1)}`)
  const r2 = withAbilities({ lightRope: 3 }, { solid })
  const q = pl(r2, BLUE)
  place(r2, BLUE, 24, 17)
  q.onGround = false
  step(r2, ROPE)
  fireRope(r2, q, { x: 31, y: 14.5 })
  step(r2) // (the key comes up)
  step(r2, ROPE)
  check('pressing the rope key again lets go too', q.rope.mode === 'idle')
  // it lasts a limited time: level 1 is 4s
  const t = withAbilities({ lightRope: 1 }, { solid: [[28, 44, 4, 17]] })
  const tp = pl(t, BLUE)
  place(t, BLUE, 26, 17)
  tp.onGround = false
  step(t, ROPE)
  fireRope(t, tp, { x: 31, y: 16.5 })
  check('(setup) a level 1 rope is out', tp.rope.mode === 'attached' && Math.abs(tp.rope.life - 4) < 1e-6, `life ${tp.rope.life}`)
  settle(t, 3.9)
  const still = tp.rope.mode
  settle(t, 0.3)
  check('Light Rope 1 lasts 4 seconds', still === 'attached' && tp.rope.mode === 'idle')
  for (const [lvl, life] of [[2, 7], [3, 12]]) check(`...level ${lvl} lasts ${life}`, ABILITY.ROPE_LIFE[lvl] === life)
}
{
  // pulling the partner across
  const g = withAbilities({ lightRope: 2 })
  place(g, BLUE, 20)
  place(g, PINK, 28)
  step(g, ROPE)
  const type = fireRope(g, pl(g, BLUE), { x: 28, y: 21 })
  check('a rope aimed at your partner latches onto them', type === 'partner')
  step(g, { ...none, crouch: true }, none, 70)
  check('...and crouch reels them in to you', Math.abs(pl(g, PINK).x - 20) < 2.5 && pl(g, BLUE).rope.mode === 'idle', `pink x=${pl(g, PINK).x.toFixed(1)}, rope ${pl(g, BLUE).rope.mode}`)
  const w = withAbilities({ lightRope: 2 }, { solid: [[24, 24, 4, 21]] })
  place(w, BLUE, 20)
  place(w, PINK, 28)
  step(w, ROPE)
  check('a wall between you gets the rope first', fireRope(w, pl(w, BLUE), { x: 28, y: 21 }) === 'solid')
}
{
  // retrieving a key
  const g = withAbilities({ lightRope: 2 }, { keys: [{ id: 'k', x: 28, y: 21 }] })
  place(g, BLUE, 20)
  place(g, PINK, 60)
  step(g, ROPE)
  const type = fireRope(g, pl(g, BLUE), { x: 28.5, y: 21.5 })
  check('a rope aimed at a loose key latches onto it', type === 'key')
  step(g, { ...none, crouch: true }, none, 80)
  check('...and crouch reels it in to you', g.doors.keys[0].holder === 'blue', `holder ${g.doors.keys[0].holder}`)
}
{
  const g = withAbilities({ lightRope: 2 }, { solid: [[28, 44, 4, 14]] })
  const p = pl(g, BLUE)
  place(g, BLUE, 24, 17)
  p.onGround = false
  step(g, ROPE)
  fireRope(g, p, { x: 31, y: 14.5 })
  killPlayer(p, 'test')
  check('dying lets go of the rope', p.rope.mode === 'idle')
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll Light Echo / Light Rope checks passed')
process.exit(failures ? 1 : 0)
