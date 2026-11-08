// Reusable scripted routines for the campaign rooms' playthroughs: the repeating teamwork patterns.
// A "duo" has a LEADER (the one nearer the exit; Pink spawns ahead) and a FOLLOWER (Blue).
import { pilot, none } from './pilot.mjs'
import { beginStroke, endStroke, extendStroke } from '../../src/doors/drawing.js'
import { stepGame } from '../../src/doors/engine.js'
import { SIM } from '../../src/doors/config.js'

export function duo(g, leadName = 'pink') {
  const p = pilot(g)
  const { B, P } = p
  const lead = leadName === 'pink' ? P : B
  const follow = leadName === 'pink' ? B : P
  // run until cond with a driver for the leader and one for the follower
  const go = (limit, cond, dLead = p.idle, dFollow = p.idle) => (leadName === 'pink' ? p.until(limit, cond, dFollow, dLead) : p.until(limit, cond, dLead, dFollow))
  // run with explicit drivers per colour: run(limit, cond, { blue, pink })
  const run = (limit, cond, map) => p.until(limit, cond, map.blue || p.idle, map.pink || p.idle)
  return { ...p, lead, follow, go, run, deathsBefore: 0 }
}

// The pattern behind most gates: the FOLLOWER stands on a plate (holding a door open, or a hazard off) while the
// LEADER crosses and flips a lever beyond it (which keeps the way open for good); then the follower follows.
//   plateX, leverX, afterX: where the plate, the lever and the far side are.
//   leaderOpts / followerOpts: extra driver options for the crossing (jumps, crouches).
export function holdCross(d, { plateX, leverX, afterX, leaderOpts = {}, followerOpts = {}, label = 'gate' }, check) {
  const { lead, follow, go, drive } = d
  // the follower takes the plate while the leader waits just ahead of it
  go(900, () => Math.abs(follow.x - plateX) < 0.25 && follow.onGround, drive(plateX + 2.2, { autoJump: false }), drive(plateX, { tol: 0.1, autoJump: false }))
  // the leader crosses (doors open for them, hazards are off) and pulls the lever
  const lever = d.g.doors.switches.find((s) => Math.abs(s.x + 0.5 - leverX) < 1)
  go(2600, () => lever.on, drive(leverX, { tol: 0.1, interactAt: [leverX], ...leaderOpts }), drive(plateX, { tol: 0.1, autoJump: false }))
  check(`${label}: the leader got across and pulled the lever`, lever.on && lead.x > plateX + 3, `leader x=${lead.x.toFixed(1)}`)
  // the follower may now leave the plate and follow
  go(2600, () => follow.x > afterX - 0.3, drive(afterX + 1.2, { autoJump: false }), drive(afterX, { tol: 0.2, ...followerOpts }))
  check(`${label}: ...and the follower followed`, follow.x > afterX - 0.5 && lead.deaths + follow.deaths === d.deathsBefore, `follower x=${follow.x.toFixed(1)}, deaths: leader ${lead.deaths} (${lead.lastDeath}), follower ${follow.deaths} (${follow.lastDeath})`)
}

// Presses the draw key for `who` (so they are aiming), then draws a straight line with the "mouse".
// Returns the line (or null if they could not draw).
export function drawLine(d, who, x0, y0, x1, y1) {
  const idx = who === d.g.players[0] ? 0 : 1
  const press = { ...none, draw: true }
  stepGame(d.g, idx === 0 ? [press, none] : [none, press], SIM.STEP)
  stepGame(d.g, [none, none], SIM.STEP)
  if (!beginStroke(d.g, who, x0, y0)) return null
  const n = 50
  for (let i = 1; i <= n; i++) extendStroke(d.g, who, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)
  return endStroke(d.g, who)
}

// Pressing a one-shot ability key (echo / teleport / rope ...) for one step
export function tap(d, who, key) {
  const idx = who === d.g.players[0] ? 0 : 1
  const input = { ...none, [key]: true }
  stepGame(d.g, idx === 0 ? [input, none] : [none, input], SIM.STEP)
  stepGame(d.g, [none, none], SIM.STEP)
}

// The CARRY climb: `rider` climbs onto `carrier`'s head (the carrier stands at carrierX, just left of a floating
// slab) and jumps up onto the slab, takes the crystal, and walks off its far side; the carrier waits.
//   slabLeft/slabRight: the slab's x range; slabTop: its top y; crystalX: where the crystal is; dropX: where to land.
export function slabCarry(d, { carrier, rider, carrierX, slabTop, crystalX, dropX, label = 'slab' }, check) {
  const { run, drive } = d
  const key = (p) => (p === d.g.players[0] ? 'blue' : 'pink')
  const map = (carrierDriver, riderDriver) => ({ [key(carrier)]: carrierDriver, [key(rider)]: riderDriver })
  run(600, () => Math.abs(carrier.x - carrierX) < 0.15 && carrier.onGround && rider.x < carrierX - 1.5, map(drive(carrierX, { tol: 0.1, autoJump: false }), drive(carrierX - 3.1, { tol: 0.15, autoJump: false })))
  run(500, () => rider.carriedBy === carrier.id, map(drive(carrierX, { tol: 0.1, autoJump: false }), (p) => {
    const dx = carrier.x - p.x
    return p.onGround ? { right: dx > 0.2, jump: dx > 2.4 && dx < 3.4 } : { right: dx > 0.15, jump: p.vy < 0 }
  }))
  check(`${label}: the rider is standing on the carrier's shoulders`, rider.carriedBy === carrier.id)
  let risen = false
  run(160, () => rider.onGround && rider.y < slabTop + 0.5 && rider.x > carrierX + 0.6, map(drive(carrierX, { tol: 0.1, autoJump: false }), (p, f) => {
    if (p.y < slabTop + 0.2) risen = true
    return { jump: f < 30, right: risen }
  }))
  check(`${label}: ...and jumps up onto the slab`, rider.onGround && rider.y < slabTop + 0.5, `rider (${rider.x.toFixed(1)}, ${rider.y.toFixed(1)})`)
  run(400, () => d.g.crystals.every((c) => c.taken || c.for !== rider.id) , map(drive(carrierX, { tol: 0.1, autoJump: false }), drive(crystalX, { tol: 0.2, autoJump: false })))
  run(700, () => rider.x > dropX - 0.3 && rider.y > 17.5, map(drive(carrierX, { tol: 0.1, autoJump: false }), drive(dropX, { autoJump: false })))
}
