// Headless checks for every trap type and for checkpoints — and, for each, how a
// drawn line answers it (lines are solid to hazards whoever drew them):
//   node scripts/check-doors-traps.mjs
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
// put a player somewhere, grounded
function place(g, who, x, y = 22) {
  const p = g.players[who]
  p.x = x
  p.y = y
  p.vx = 0
  p.vy = 0
  p.onGround = true
  p.invuln = 0
}
// let spawn-protection and the opening moments pass
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
// run until `who` dies (deaths increases) or `seconds` pass; returns the time of death or null
function runUntilDeath(g, who, seconds, pinkInput = none) {
  const before = g.players[who].deaths
  for (let f = 0; f < seconds * 60; f++) {
    step(g, none, pinkInput)
    if (g.players[who].deaths > before) return g.time
  }
  return null
}

// ---------------- fire jet ----------------
{
  const fire = { id: 'f', type: 'fire', x: 20, y: 21, dir: 'right', length: 6, period: 3, on: 1.0, offset: 0, telegraph: 0.4 }
  const g = createGame(room([fire]))
  start(g) // t = 1.0: just after the first pulse
  place(g, PINK, 23)
  const died = runUntilDeath(g, PINK, 3)
  check('a fire jet burns whoever stands in it when it pulses on', died !== null && Math.abs(died - 3.0) < 0.1, `died at t=${died?.toFixed(2)} (the jet turns on at t=3.0)`)

  const w = createGame(room([fire]))
  start(w)
  place(w, PINK, 23)
  settle(w, 1.3) // t=2.3: off, then the telegraph window (2.6-3.0): still harmless
  settle(w, 0.6)
  check('...but it is harmless between pulses and while it is only warning', w.players[PINK].deaths === 0, `t=${w.time.toFixed(1)}`)

  const s = createGame(room([fire]))
  start(s)
  place(s, PINK, 23)
  shield(s, { x: 21.4, y: 19 }, { x: 21.4, y: 22.4 })
  check('a drawn line blocks the flame (and shields whoever is behind it)', runUntilDeath(s, PINK, 2.5) === null)
  const beam = s.traps.traps[0].beam
  check('...the flame stops at the line', beam === null || beam.x1 < 21.5, beam ? `ends at x=${beam.x1.toFixed(2)}` : 'off at this moment')
}

// ---------------- laser ----------------
{
  const low = { id: 'l', type: 'laser', x: 20, y: 20.7, dir: 'right', length: 8 } // always on, at crouch clearance
  const g = createGame(room([low]))
  start(g)
  place(g, PINK, 23)
  check('a low laser kills a standing player', runUntilDeath(g, PINK, 1) !== null)

  const c = createGame(room([low]))
  start(c)
  place(c, PINK, 23)
  c.players[PINK].crouching = true
  c.players[PINK].h = 0.95
  step(c, none, { ...none, crouch: true }, 60)
  check('...but not one who crouches under it', c.players[PINK].deaths === 0)

  const tall = { id: 'v', type: 'laser', x: 30.5, y: 4, dir: 'down', length: 20 } // a full-height beam from the ceiling
  const t = createGame(room([tall]))
  start(t)
  place(t, PINK, 30.5)
  check('a full-height laser kills anyone who walks into it', runUntilDeath(t, PINK, 1) !== null)

  const b = createGame(room([tall]))
  start(b)
  place(b, PINK, 30.5)
  shield(b, { x: 28.5, y: 6 }, { x: 32.5, y: 6 })
  check('...and it needs a drawn blocker: a line across the beam protects whoever is below', runUntilDeath(b, PINK, 2) === null)
  check('...the beam is cut off at the line', b.traps.traps[0].beam.y1 < 6, `ends at y=${b.traps.traps[0].beam.y1.toFixed(2)}`)
}

// ---------------- arrow wall ----------------
{
  const arrow = { id: 'a', type: 'arrow', x: 40, y: 20.9, dir: 'left', period: 3, offset: 0, speed: 9, range: 12 }
  const g = createGame(room([arrow]))
  start(g)
  place(g, PINK, 34)
  const died = runUntilDeath(g, PINK, 4)
  check('an arrow kills someone in its path', died !== null, `died at t=${died?.toFixed(2)}`)

  const far = createGame(room([arrow]))
  start(far)
  place(far, PINK, 26) // 14 tiles away: beyond the arrow range of 12
  check('...but arrows only fly their range', runUntilDeath(far, PINK, 4) === null)

  const crouch = createGame(room([arrow]))
  start(crouch)
  place(crouch, PINK, 34)
  crouch.players[PINK].crouching = true
  crouch.players[PINK].h = 0.95
  check('...and pass over someone who crouches', runUntilDeath(crouch, PINK, 4, { ...none, crouch: true }) === null)

  const s = createGame(room([arrow]))
  start(s)
  place(s, PINK, 34)
  shield(s, { x: 37, y: 19 }, { x: 37, y: 22.4 })
  check('a drawn line stops arrows (whoever drew it)', runUntilDeath(s, PINK, 4) === null)
}

// ---------------- falling spikes ----------------
{
  const spikes = { id: 's', type: 'spikes', x: 50.5, y: 4.5, trigger: 1.0, warn: 0.4 }
  const g = createGame(room([spikes]))
  start(g)
  place(g, PINK, 50.5)
  check('stand under falling spikes and they drop on you', runUntilDeath(g, PINK, 3) !== null)
  const away = createGame(room([spikes]))
  start(away)
  place(away, PINK, 44)
  settle(away, 2)
  check('...they only drop for someone underneath', away.traps.traps[0].mode === 'armed' && away.players[PINK].deaths === 0)

  const run = createGame(room([spikes]))
  start(run)
  place(run, PINK, 40)
  const diedRunning = runUntilDeath(run, PINK, 5, { ...none, right: true })
  check('...a runner heading for them is caught too (the trigger leads the target)', diedRunning !== null)

  const s = createGame(room([spikes]))
  start(s)
  place(s, PINK, 50.5)
  shield(s, { x: 48.5, y: 14 }, { x: 52.5, y: 14 })
  check("a drawn line above catches the spikes — and the person below is safe", runUntilDeath(s, PINK, 3) === null)
  check('...the spikes land on the line', s.traps.traps[0].mode === 'landed' || s.traps.traps[0].mode === 'resetting' || s.traps.traps[0].mode === 'armed', s.traps.traps[0].mode)

  const re = createGame(room([spikes]))
  start(re)
  place(re, PINK, 50.5)
  runUntilDeath(re, PINK, 3)
  place(re, PINK, 20)
  settle(re, 6)
  check('spikes put themselves back and re-arm', re.traps.traps[0].mode === 'armed' && re.traps.traps[0].cy === 4.5)
}

// ---------------- collapsing floor ----------------
{
  const collapse = { id: 'c', type: 'collapse', x: 60, y: 22, w: 3, delay: 0.6, respawn: 4 }
  const holes = [[60, 62]]
  const g = createGame(room([collapse], [], holes))
  start(g)
  place(g, PINK, 61.5)
  settle(g, 0.3)
  check('a collapsing floor holds you at first', g.players[PINK].onGround && g.traps.traps[0].mode === 'shaking')
  const died = runUntilDeath(g, PINK, 2)
  check('...then gives way after its delay, and you fall', died !== null && g.traps.traps[0].mode !== 'solid')

  const run = createGame(room([collapse], [], holes))
  start(run)
  place(run, PINK, 57)
  step(run, none, { ...none, right: true }, 120)
  check('a runner is across before it goes', run.players[PINK].x > 64 && run.players[PINK].deaths === 0, `x=${run.players[PINK].x.toFixed(1)}`)

  const back = createGame(room([collapse], [], holes))
  start(back)
  place(back, PINK, 61.5)
  runUntilDeath(back, PINK, 2)
  place(back, PINK, 70)
  settle(back, 5)
  check('the floor comes back after its respawn time', back.traps.traps[0].mode === 'solid')
}

// ---------------- boulder ----------------
{
  const boulder = { id: 'b', type: 'boulder', x: 70, y: 21.2, dir: -1, speed: 3, radius: 0.8, period: 100, offset: 0 }
  const g = createGame(room([boulder]))
  start(g)
  place(g, PINK, 60)
  const died = runUntilDeath(g, PINK, 8)
  check('a rolling boulder crushes whoever is in its way', died !== null, `hit at t=${died?.toFixed(1)}`)

  const s = createGame(room([boulder]))
  start(s)
  place(s, PINK, 60)
  shield(s, { x: 66, y: 17 }, { x: 66, y: 22.4 }) // a drawn wall in front of it
  check('a drawn wall stops the boulder', runUntilDeath(s, PINK, 3) === null)
  check('...it is held at the wall', s.traps.traps[0].boulders[0].x > 66, `x=${s.traps.traps[0].boulders[0].x.toFixed(1)}`)

  // a boulder dropped on a drawn ramp rolls down it
  const slow = { id: 'r', type: 'boulder', x: 69.5, y: 14.2, dir: -1, speed: 0.3, radius: 0.8, period: 100, offset: 1.3 }
  const r = createGame(room([slow]))
  start(r)
  place(r, BLUE, 40) // the drawer stands well clear
  pressDraw(r, BLUE)
  drawLine(r, BLUE, { x: 63, y: 22.1 }, { x: 70.5, y: 15.1 }, 60)
  // watch it: it appears at t=1.3 above the ramp (the ramp is already up), lands on it and rolls down
  let rodeRamp = false
  for (let f = 0; f < 150; f++) {
    step(r)
    const bb = r.traps.traps[0].boulders[0]
    if (bb && bb.x > 64 && bb.x < 70 && bb.y < 20) rodeRamp = true // centre well above the floor (21.2) while over the ramp
  }
  const last = r.traps.traps[0].boulders[0]
  check('a drawn ramp deflects a boulder: it lands on it and rolls down the slope', rodeRamp && last && last.x < 64, last ? `ends at x=${last.x.toFixed(1)}` : 'gone')

  // and on a flat floor a boulder just lands and rolls on at its own speed (no sideways kick)
  const flat = createGame(room([{ ...slow, offset: 0 }]))
  settle(flat, 1.5)
  const fb = flat.traps.traps[0].boulders[0]
  check('a boulder landing on a flat floor keeps its own speed (no ghost-edge kick)', fb && Math.abs(fb.vx) < 1, fb ? `vx=${fb.vx.toFixed(2)}` : 'gone')
}

// ---------------- checkpoints & respawn ----------------
{
  const g = createGame(room([], [{ id: 'cp', x: 30, y: 21 }]))
  start(g)
  place(g, BLUE, 30.5)
  step(g)
  check('touching a checkpoint makes you respawn there', g.players[BLUE].spawn.x === 30.5 && g.traps.checkpoints[0].reached.blue)
  check("...for that player only", g.players[PINK].spawn.x === 7.5 && !g.traps.checkpoints[0].reached.pink)
  g.players[BLUE].y = 60 // falls out of the room
  step(g, none, none, 5)
  check('dying sends you back to your last checkpoint', Math.abs(g.players[BLUE].x - 30.5) < 0.5 && g.players[BLUE].deaths === 1, `x=${g.players[BLUE].x.toFixed(1)}`)

  // a flame that is off while you arrive at the checkpoint, then comes on (t = 2..3)
  const fire = { id: 'f', type: 'fire', x: 29, y: 21, dir: 'right', length: 5, period: 4, on: 1, offset: 2 }
  const p = createGame(room([fire], [{ id: 'cp', x: 30, y: 21 }]))
  start(p) // t = 1.0
  place(p, BLUE, 30.5)
  step(p)
  check('(setup) the checkpoint was reached before the flame came on', p.traps.checkpoints[0].reached.blue)
  settle(p, 1.05) // t ~ 2.05: the flame has just come on
  check('a flame on the checkpoint kills at first...', p.players[BLUE].deaths === 1, `deaths=${p.players[BLUE].deaths}`)
  settle(p, 0.5) // t ~ 2.55: still inside the 0.8s of protection, flame still on (until t=3)
  check('...but a respawned player has a moment of protection', p.players[BLUE].deaths === 1 && p.players[BLUE].invuln > 0, `invuln ${p.players[BLUE].invuln.toFixed(2)}s`)
  settle(p, 0.5) // t ~ 3.05: protection ran out at ~2.85, flame was still on until 3.0
  check('...which runs out (the flame can hurt again)', p.players[BLUE].deaths === 2, `deaths=${p.players[BLUE].deaths}`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll trap checks passed')
process.exit(failures ? 1 : 0)
