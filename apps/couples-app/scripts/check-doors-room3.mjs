// Plays test room 3 (drawing + traps) start to finish with an autopilot that
// looks before it leaps: before each manoeuvre it rehearses it on a COPY of the
// game, and only performs it for real once the rehearsal survives — i.e. it
// waits for the right beat, like a person timing a trap. Proves the room can be
// completed using nothing but the drawing mechanic, and that every trap is
// survivable.
//   node scripts/check-doors-room3.mjs
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createGame, stepGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { beginStroke, endStroke, extendStroke } from '../src/doors/drawing.js'
import { SIM } from '../src/doors/config.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const room3 = parseLevel(JSON.parse(fs.readFileSync(path.join(here, '../src/doors/levels/room-3-drawing.json'), 'utf8')))
const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false }

// A person's reflex: hop over a boulder that is rolling at you. A boulder is 1.6 tall and a jump
// clears 2.4, but you are only above it for ~0.4s, so the hop must be timed to the moment it
// is about to arrive, not started as soon as it appears.
function dodge(g, i, input) {
  const p = g.players[i]
  if (!p.onGround) {
    if (!p.dodging) return input
    // hold the jump for full height; keep running at the boulder only until you are over it
    const over = g.traps.traps.some((t) => t.type === 'boulder' && t.boulders.some((b) => (b.x - p.x) * p.dodging < 0.3))
    return { ...input, jump: true, left: !over && p.dodging < 0, right: !over && p.dodging > 0 }
  }
  p.dodging = 0
  for (const trap of g.traps.traps) {
    if (trap.type !== 'boulder') continue
    for (const b of trap.boulders) {
      const dx = b.x - p.x
      if (Math.abs(b.y - (p.y - 0.8)) > 2 || b.vx * dx >= 0 || Math.abs(b.vx) < 0.5) continue
      const arrives = (Math.abs(dx) - 1.2) / Math.abs(b.vx) // seconds until it touches
      // jump AND run toward it, so you're over it in a fraction of a second (a slow boulder takes longer to pass than a jump lasts)
      if (arrives < 0.45 && arrives > -0.8) {
        p.dodging = Math.sign(dx)
        return { ...input, jump: true, left: dx < 0, right: dx > 0 }
      }
    }
  }
  return input
}

function makeRunner(g) {
  const step = (blue = none, pink = none, frames = 1) => {
    for (let f = 0; f < frames; f++) stepGame(g, [dodge(g, 0, blue), dodge(g, 1, pink)], SIM.STEP)
  }
  const settle = (seconds) => step(none, none, Math.round(seconds * 60))
  const go = (x, tol = 0.3) => ({
    tick(p) {
      const dx = x - p.x
      const moving = Math.abs(dx) > tol
      return { ...none, left: moving && dx < 0, right: moving && dx > 0, jump: moving && p.onGround && Math.abs(p.vx) < 0.2 }
    },
    done: (p) => Math.abs(x - p.x) <= tol,
  })
  const run = (blueTask, pinkTask, { seconds = 20, until } = {}) => {
    const tasks = [blueTask, pinkTask]
    for (let f = 0; f < seconds * 60; f++) {
      stepGame(g, tasks.map((t, i) => dodge(g, i, t ? t.tick(g.players[i], g) : none)), SIM.STEP)
      if (process.env.TRACE3 && g.__real && g.time > 41 && f % 4 === 0) { const q = g.players[1]; const bo = g.traps.traps.find((t) => t.type === 'boulder').boulders[0]; console.log(g.time.toFixed(2), 'pink', q.x.toFixed(2), q.y.toFixed(2), q.onGround, q.draw.mode, 'd', q.deaths, 'boulder', bo && bo.x.toFixed(2)) }
      const finished = until ? until(g) : tasks.every((t, i) => !t || t.done(g.players[i], g))
      if (finished) return true
    }
    return false
  }
  const pressDraw = (who) => {
    const press = { ...none, draw: true }
    step(who === 0 ? press : none, who === 1 ? press : none)
    step()
  }
  const lineFor = (who, a, b) => {
    pressDraw(who)
    const player = g.players[who]
    if (!beginStroke(g, player, a.x, a.y)) return null
    for (let i = 1; i <= 60; i++) extendStroke(g, player, a.x + ((b.x - a.x) * i) / 60, a.y + ((b.y - a.y) * i) / 60)
    return endStroke(g, player)
  }
  // free = not frozen (a line of theirs may still be alive); ready = also able to start drawing now
  const free = (who) => run(null, null, { seconds: 12, until: (gm) => gm.players[who].draw.mode === 'idle' && gm.players[who].onGround })
  const ready = (who) =>
    run(null, null, { seconds: 12, until: (gm) => gm.players[who].draw.mode === 'idle' && gm.players[who].draw.cooldown === 0 && gm.players[who].onGround })
  const deaths = () => g.players[0].deaths + g.players[1].deaths
  return { g, step, settle, go, run, lineFor, free, ready, deaths }
}

const game = createGame(room3)
game.__real = true
let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

// Rehearse `fn` on a copy; wait (on the real game) until a rehearsal comes through alive, then do it for real.
function manoeuvre(name, fn, { maxWait = 30 } = {}) {
  for (let waited = 0; waited <= maxWait; waited += 0.25) {
    const rehearsal = makeRunner(structuredClone(game))
    const d0 = rehearsal.deaths()
    // the aftermath counts too: a player frozen mid-line (or the pair standing around) must survive the next 3.5s
    const survives = fn(rehearsal) && (rehearsal.settle(3.5), rehearsal.deaths() === d0)
    if (survives) {
      const real = makeRunner(game)
      if (process.env.TRACE3) { const o = real.step; real.step = (...a) => { o(...a); const q = game.players[1]; const bo = game.traps.traps.find((t) => t.type === 'boulder').boulders[0]; if (game.time > 41) console.log(game.time.toFixed(2), 'pink', q.x.toFixed(2), q.y.toFixed(2), q.onGround, q.deaths, 'boulder', bo && bo.x.toFixed(2)) } }
      const baseline = real.deaths()
      const ok = fn(real) && (real.settle(3.5), real.deaths() === baseline)
      if (!ok) check(`${name} (performed for real)`, false, `the real run differed from the rehearsal; deaths: blue ${game.players[0].deaths} (${game.players[0].lastDeath}), pink ${game.players[1].deaths} (${game.players[1].lastDeath}); blue at x=${game.players[0].x.toFixed(1)}, pink at x=${game.players[1].x.toFixed(1)}`)
      return ok
    }
    const dBefore = game.players[0].deaths + game.players[1].deaths
    if (process.env.TRACE4) {
      const hist = []
      for (let f = 0; f < 15; f++) {
        const q = game.players[1]
        const bo = game.traps.traps.find((t) => t.type === 'boulder').boulders[0]
        const d = q.deaths
        hist.push(`${game.time.toFixed(2)} p=${q.x.toFixed(2)},${q.y.toFixed(2)} g=${q.onGround} ${q.draw.mode} dodg=${q.dodging} b=${bo ? bo.x.toFixed(2) + ',' + bo.y.toFixed(2) + ',' + bo.vx.toFixed(2) : '-'}`)
        makeRunner(game).step()
        if (game.players[1].deaths > d) { console.log(hist.slice(-12).join(String.fromCharCode(10)), 'DIED', game.players[1].lastDeath); break }
      }
      continue
    }
    makeRunner(game).settle(0.25)
    if (process.env.TRACE && game.players[0].deaths + game.players[1].deaths > dBefore) {
      const boulder = game.traps.traps.find((t) => t.type === 'boulder')?.boulders[0]
      console.log(`    (vx ${boulder?.vx?.toFixed(2)} died while waiting for a safe moment at t=${game.time.toFixed(2)}: pink x=${game.players[1].x.toFixed(2)} ${game.players[1].draw.mode}, boulder ${boulder ? boulder.x.toFixed(2) + ',' + boulder.y.toFixed(2) : 'none'})`)
    }
  }
  if (process.env.TRACE5) {
    const r = makeRunner(structuredClone(game))
    const res = fn(r)
    const q = r.g.players
    console.log('  last rehearsal ->', res, 'blue', q[0].x.toFixed(2), q[0].y.toFixed(2), 'pink', q[1].x.toFixed(2), q[1].y.toFixed(2), q[1].draw.mode, 'cooldown', q[1].draw.cooldown, 'complete', r.g.complete, 'deaths', r.deaths(), q[0].lastDeath, q[1].lastDeath, 'blue-start', game.players[0].x.toFixed(1), game.players[0].draw.mode)
  }
  check(name, false, `no safe moment found within ${maxWait}s`)
  return false
}

const G = 22.1 // a line this high has its top flush with the ground
const P = 17.1 // ...and with the first plateau
const T = 9.1 // ...and with the high plateau
const RAMP1 = [{ x: 37, y: G }, { x: 44.5, y: 16.4 }]
const RAMP2 = [{ x: 100.5, y: P }, { x: 107.9, y: 8.8 }]
const t0 = performance.now()
let ok = true
const S = (name, fn) => {
  if (!ok) return
  ok = manoeuvre(name, fn)
  if (ok) console.log(`  ok   ${name}   (t=${game.time.toFixed(1)}s, deaths ${game.players[0].deaths + game.players[1].deaths})`)
}

makeRunner(game).settle(0.5)

// 1. gap 1: no traps — bridge it for each other
S('gap 1: both at the edge', (R) => R.run(R.go(11.5), R.go(13)))
S('gap 1: blue bridges for pink', (R) => R.ready(0) && R.lineFor(0, { x: 14.6, y: G }, { x: 23.4, y: G }) && R.run(null, R.go(28), { seconds: 6 }))
S('gap 1: pink bridges for blue', (R) => R.free(0) && R.ready(1) && R.lineFor(1, { x: 14.6, y: G }, { x: 23.4, y: G }) && R.run(R.go(26), null, { seconds: 6 }))

// 2. wall 1 + arrow wall: wait out of arrow range, the ramp then shields the climb
S('wall 1: both wait out of the arrows\' reach', (R) => R.run(R.go(31), R.go(32.5)))
S('wall 1: blue draws a ramp, pink climbs', (R) => R.ready(0) && R.lineFor(0, ...RAMP1) && R.run(null, R.go(52), { seconds: 8 }))
S('wall 1: pink draws a ramp, blue climbs', (R) => R.free(0) && R.ready(1) && R.lineFor(1, ...RAMP1) && R.run(R.go(48), null, { seconds: 8 }))

// 3. gap 2: ceiling jets (cross on the beat), then collapsing floor (keep moving)
S('gap 2: both at the edge', (R) => R.run(R.go(59), R.go(60.5)))
S('gap 2: blue bridges, pink runs the jets and the collapsing floor', (R) =>
  R.ready(0) && R.lineFor(0, { x: 62.6, y: P }, { x: 73.4, y: P }) && R.run(null, R.go(79.5), { seconds: 6 }))
S('gap 2: pink bridges, blue follows', (R) =>
  R.free(0) && R.ready(1) && R.lineFor(1, { x: 62.6, y: P }, { x: 73.4, y: P }) && R.run(R.go(77.5), null, { seconds: 6 }))

// 4. stepping stones (no traps): two lines each way
S('stones: both at the edge', (R) => R.run(R.go(80.3), R.go(81.7)))
S('stones: blue bridges the first gap for pink', (R) => R.ready(0) && R.lineFor(0, { x: 82.6, y: P }, { x: 89.4, y: P }) && R.run(null, R.go(90.2), { seconds: 6 }))
S('stones: blue bridges the second gap for pink', (R) => R.ready(0) && R.lineFor(0, { x: 91.6, y: P }, { x: 98.4, y: P }) && R.run(null, R.go(99.2), { seconds: 6 }))
S('stones: pink bridges the first gap for blue', (R) =>
  R.free(0) && R.ready(1) && R.lineFor(1, { x: 82.6, y: P }, { x: 89.4, y: P }) && R.run(R.go(90.2), null, { seconds: 6 }))
S('stones: pink bridges the second gap for blue', (R) =>
  R.ready(1) && R.lineFor(1, { x: 91.6, y: P }, { x: 98.4, y: P }) && R.run(R.go(98.3), null, { seconds: 6 }))

// 5. wall 2: a low laser across the foot of the ramp and a boulder from the top — the ramp shields and deflects
S('wall 2: both wait clear of the laser', (R) => R.run(R.go(98.3), R.go(99.2)))
S('wall 2: blue draws the ramp, pink climbs', (R) => R.ready(0) && R.lineFor(0, ...RAMP2) && R.run(null, R.go(114), { seconds: 8 }))
S('wall 2: pink draws the ramp, blue climbs', (R) => R.free(0) && R.ready(1) && R.lineFor(1, ...RAMP2) && R.run(R.go(112), null, { seconds: 8 }))

// 6. the pit (jets in its walls guard the climb-down route; bridging above them is safe)
S('pit: both at the edge', (R) => R.run(R.go(129), R.go(130.6)))
S('pit: blue bridges for pink', (R) => R.ready(0) && R.lineFor(0, { x: 132.6, y: T }, { x: 139.4, y: T }) && R.run(null, R.go(142), { seconds: 6 }))
S('pit: pink bridges for blue', (R) => R.free(0) && R.ready(1) && R.lineFor(1, { x: 132.6, y: T }, { x: 139.4, y: T }) && R.run(R.go(140.6), null, { seconds: 6 }))

// 7. the exit approach: falling spikes, then a full-height laser that needs a drawn blocker
const SHIELD = [{ x: 146.5, y: 5.5 }, { x: 150.5, y: 5.5 }]
S('exit: blue shields the laser, pink goes through', (R) => R.ready(0) && R.lineFor(0, ...SHIELD) && R.run(null, R.go(153.2), { seconds: 8 }))
S('exit: pink shields the laser, blue goes through', (R) =>
  R.free(0) &&
  // the spikes aim where a runner WILL be, so don't run at them: stop short, let each one drop, then walk on
  R.run(R.go(142, 0.15), null, { seconds: 4 }) &&
  (R.settle(1.3), R.run(R.go(144, 0.15), null, { seconds: 4 })) &&
  (R.settle(1.3), R.run(R.go(147, 0.15), null, { seconds: 4 })) &&
  R.ready(1) &&
  R.lineFor(1, ...SHIELD) &&
  R.run(R.go(152.3), null, { seconds: 8, until: (gm) => gm.complete }))

check('room 3 (drawing + traps) can be completed with the drawing mechanic alone', ok && game.complete, `t=${game.time.toFixed(1)}s of game time, ${game.players[0].deaths + game.players[1].deaths} deaths, planned in ${((performance.now() - t0) / 1000).toFixed(1)}s`)
console.log(failures ? `\n${failures} check(s) FAILED` : '\nRoom 3 checks passed')
process.exit(failures ? 1 : 0)
