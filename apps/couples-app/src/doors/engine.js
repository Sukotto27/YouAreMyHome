// The Doors simulation: players, movement, collision and the door system.
// Pure data and functions — no DOM, no rendering — and stepped at a fixed
// rate, so it can be run headless (see scripts/check-doors-*.mjs).
//
// A player's position is (x = horizontal centre, y = feet), in tiles with y
// increasing downward. Their box spans [x - w/2, x + w/2] horizontally and
// [y - h, y] vertically.
import { ABILITY, CARRY, DRAW, PLAYER, TRAPS, WORLD } from './config.js'
import { isSolid } from './levels.js'
import { createDoorSystem, doorBlocksCell, tryInteract, updateDoorSystem } from './doors.js'
import { initDraw, initDrawingState, isFrozen, releaseOnMove, solidLinesFor, toggleDraw, updateDrawing } from './drawing.js'
import { addFx, createCrystals, cycleTeleport, exportAbilities, extraJumps, jumpMultiplier, spawnStone, startingAbilities, updateCrystals, updateEchoes, updateFx, useEcho, useTeleport, abilityLevel } from './abilities.js'
import { initRope, toggleRope, updateRopes } from './rope.js'
import { collapseSolid, createTrapSystem, updateCheckpoints, updateTraps } from './traps.js'
import { crateSolid, createCrates, updateCrates } from './crates.js'
import { updateFeedback } from './feedback.js'
import { bodyBottom, bodyTop, headY } from './gravity.js'

const EPS = 1e-4

function makePlayer(id, spawn) {
  return {
    id, // 'blue' | 'pink'
    spawn: { ...spawn }, // room start; becomes the last checkpoint later
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    w: PLAYER.WIDTH,
    h: PLAYER.HEIGHT_STAND,
    onGround: false,
    crouching: false,
    facing: id === 'blue' ? 1 : -1, // +1 right, -1 left
    coyote: 0, // seconds of "still counts as grounded" left
    jumpBuffer: 0, // seconds a pending jump press stays valid
    jumpHeldPrev: false,
    interactHeldPrev: false,
    invuln: 0, // seconds of protection after respawning
    push: { vx: 0, ay: 0, capUp: 0 }, // wind acting on this player this step (set by traps.js)
    drawHeldPrev: false,
    draw: initDraw(),
    landed: 0, // seconds since landing (for the landing animation)
    deaths: 0,
    abilities: { solidLight: 0, jumpBoost: 0, teleport: 0, lightEcho: 0, lightRope: 0 }, // levels found so far (abilities.js)
    rope: initRope(), // Light Rope state (rope.js)
    ropeJumpPrev: false,
    echoCooldown: 0,
    echoHeldPrev: false,
    ropeHeldPrev: false,
    airJumps: 0, // mid-air jumps left (Jump Boost 2+)
    airSpeedCap: 0, // sideways speed allowed in the air after a diagonal / forward stone jump
    tpCooldown: 0,
    tpAction: 0, // which teleport action the teleport key performs
    tpMarker: null, // Teleport 3: { x, y, grav } of the marked spot
    teleportHeldPrev: false,
    cycleHeldPrev: false,
    hearts: 3, // lives left in this room (campaign rooms only); reaching an exit refills them
    maxHearts: 3,
    heartsOn: false,
    grav: 1, // +1 walking on the floor, -1 flipped: walking on the ceiling (gravity.js)
    carriedBy: null, // id of the partner whose shoulders this player is riding (M3b)
    carrying: null, // id of the partner riding on this player's shoulders
  }
}

// `carried` ({ blue: {...levels}, pink: {...} }, from exportAbilities) brings the abilities the players
// found in earlier rooms along; the room's own minimum is applied on top.
export function createGame(level, carried = null) {
  const game = {
    level,
    time: 0,
    players: [makePlayer('blue', level.spawns.blue), makePlayer('pink', level.spawns.pink)],
    doors: createDoorSystem(level),
    traps: createTrapSystem(level),
    crates: createCrates(level), // pushable blocks (crates.js)
    crystals: createCrystals(level),
    echoes: [], // Light Echoes standing about (abilities.js)
    fx: [], // little visual events (jump bursts, teleports, ...): { id, type, x, y, color, age, life }
    notices: [], // short messages near the top of the screen: { player, text, age }
    dialogs: [], // "Blue has obtained ..." boxes waiting to be read; the game is paused while there is one
    nextFxId: 1,
    ...initDrawingState(), // lines, stroke, nextLineId
    complete: false, // both players reached the exit
  }
  game.startAbilities = startingAbilities(level, carried)
  game.startMaxHearts = {}
  for (const p of game.players) {
    Object.assign(p.abilities, game.startAbilities[p.id])
    p.maxHearts = Math.min(ABILITY.MAX_HEARTS, carried?.[p.id]?.maxHearts ?? 3)
    p.hearts = p.maxHearts
    p.heartsOn = !!level.campaign // the older test rooms never run out of hearts
    game.startMaxHearts[p.id] = p.maxHearts
  }
  game.outOfHearts = false // set when someone's last heart goes: the room restarts (index.js)
  return game
}
export { exportAbilities }

// Full room reset (the R key): everything back to the start, doors and
// switches included.
export function resetGame(game) {
  game.time = 0
  game.players = [makePlayer('blue', game.level.spawns.blue), makePlayer('pink', game.level.spawns.pink)]
  for (const p of game.players) {
    Object.assign(p.abilities, game.startAbilities[p.id]) // crystals respawn, so the abilities go back too
    p.maxHearts = game.startMaxHearts[p.id]
    p.hearts = p.maxHearts
    p.heartsOn = !!game.level.campaign
  }
  game.outOfHearts = false
  game.doors = createDoorSystem(game.level)
  game.traps = createTrapSystem(game.level)
  game.crates = createCrates(game.level)
  game._crateClear = null
  game.crystals = createCrystals(game.level)
  game.echoes = []
  game.fx = []
  game.notices = []
  game.feedbackPrev = null
  game.dialogs = []
  Object.assign(game, initDrawingState())
  game.complete = false
}

// A single player dying (falling out of the room now; traps later). Respawns at
// the room start / last checkpoint without touching door or switch state.
export function killPlayer(player, cause = 'fell') {
  player.x = player.spawn.x
  player.y = player.spawn.y
  player.grav = player.spawn.grav ?? 1 // checkpoints remember which way up you were
  player.vx = 0
  player.vy = 0
  player.h = PLAYER.HEIGHT_STAND
  player.crouching = false
  player.onGround = false
  player.coyote = 0
  player.jumpBuffer = 0
  player.draw = initDraw()
  player.push = { vx: 0, ay: 0, capUp: 0 }
  player.rope = initRope()
  player.carriedBy = null // (the partner's side of the link is tidied at the start of the next step)
  player.carrying = null
  player.invuln = TRAPS.RESPAWN_PROTECTION
  player.lastDeath = cause // what got them (a trap id, or 'fell'), for the debug panel
  player.deaths++
  if (player.heartsOn) player.hearts = Math.max(0, player.hearts - 1)
}

// What counts as solid for ONE player right now: the tile grid plus any door
// that is closed to them (wrong colour, or not yet opened). Doors that are
// open to a player are simply not there for that player.
function solidFor(game, player) {
  const { level, doors, traps } = game
  return (tx, ty) => isSolid(level, tx, ty) || doorBlocksCell(doors, player, tx, ty) || collapseSolid(traps, tx, ty, player) || crateSolid(game, tx, ty)
}

// Does an axis-aligned box overlap any solid tile?
function boxHitsSolid(solid, left, top, right, bottom) {
  const x0 = Math.floor(left)
  const x1 = Math.floor(right - EPS)
  const y0 = Math.floor(top)
  const y1 = Math.floor(bottom - EPS)
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (solid(tx, ty)) return true
    }
  }
  return false
}

// The highest solid tile edge inside a box (the row number of its topmost solid
// cell), or null — used to see how tall an obstacle in the way is.
function ledgeTop(solid, left, top, right, bottom) {
  let best = null
  for (let ty = Math.floor(top); ty <= Math.floor(bottom - EPS); ty++) {
    for (let tx = Math.floor(left); tx <= Math.floor(right - EPS); tx++) {
      if (solid(tx, ty) && (best === null || ty < best)) best = ty
    }
  }
  return best
}

// Does the box [left,right]x[top,bottom] overlap another player's body?
function boxHitsPlayer(other, left, top, right, bottom) {
  return (
    left < other.x + other.w / 2 - EPS &&
    right > other.x - other.w / 2 + EPS &&
    top < other.y - EPS &&
    bottom > other.y - other.h + EPS
  )
}

function playerHitsPlayer(p, other) {
  return boxHitsPlayer(other, p.x - p.w / 2, p.y - p.h, p.x + p.w / 2, p.y)
}

// --- drawn lines: chains of small bricks solid to the OTHER player ---
function boxHitsRect(r, left, top, right, bottom) {
  return left < r.x1 - EPS && right > r.x0 + EPS && top < r.y1 - EPS && bottom > r.y0 + EPS
}

// first brick of any of `lines` that the box overlaps (or null)
function firstLineHit(lines, left, top, right, bottom) {
  for (const line of lines) {
    for (const r of line.rects) if (boxHitsRect(r, left, top, right, bottom)) return r
  }
  return null
}

// The overlapped brick that reaches highest (smallest y0). Step-up must judge the TOP of what is in the way,
// not whichever brick happens to come first in drawing order — otherwise a vertical line drawn from the
// floor upward would be climbed like a staircase of tiny steps.
function topLineHit(lines, left, top, right, bottom) {
  let best = null
  for (const line of lines) {
    for (const r of line.rects) if (boxHitsRect(r, left, top, right, bottom) && (best === null || r.y0 < best.y0)) best = r
  }
  return best
}

function allLineHits(lines, left, top, right, bottom) {
  const hits = []
  for (const line of lines) for (const r of line.rects) if (boxHitsRect(r, left, top, right, bottom)) hits.push(r)
  return hits
}

function moveToward(value, target, amount) {
  if (value < target) return Math.min(value + amount, target)
  return Math.max(value - amount, target)
}

// Stand-in for the partner while a shoulder carry links the two: they are not obstacles to each other
const GHOST = { x: -1e6, y: -1e6, w: 0, h: 0 }

function stepPlayerCore(game, p, partner, rawInput, dt, env) {
  // While linked (one rides the other's shoulders) the pair move as one body: the carrier's
  // collision box is extended upward by the rider's height, and the rider ignores the carrier.
  const linked = p.carriedBy === partner.id || partner.carriedBy === p.id
  const other = linked ? GHOST : partner
  const riderH = p.carrying ? partner.h : 0
  const solid = env.solid
  // A player who is drawing (or whose line is still alive) is frozen in place.
  const input = isFrozen(p) ? { left: false, right: false, jump: false, crouch: p.crouching, interact: false, draw: false } : rawInput
  const lines = env.lines

  // --- crouch: lower hitbox; can only stand back up if there's headroom
  //     (no ceiling, and no partner on your shoulders either) ---
  const wantCrouch = input.crouch
  if (wantCrouch && !p.crouching) {
    p.crouching = true
    p.h = PLAYER.HEIGHT_CROUCH
  } else if (!wantCrouch && p.crouching) {
    const half = p.w / 2
    const top = p.y - PLAYER.HEIGHT_STAND - riderH // (standing up lifts the rider too)
    if (!boxHitsSolid(solid, p.x - half, top, p.x + half, p.y) && !boxHitsPlayer(other, p.x - half, top, p.x + half, p.y)) {
      p.crouching = false
      p.h = PLAYER.HEIGHT_STAND
    } // else: stuck under a low ceiling (or someone standing on you) — stay crouched until clear
  }

  // --- horizontal movement ---
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  if (p.onGround) p.airSpeedCap = 0
  const maxSpeed = Math.max((p.crouching ? PLAYER.CROUCH_SPEED : PLAYER.RUN_SPEED) * (p.carrying ? CARRY.SPEED_MULT : 1), p.onGround ? 0 : p.airSpeedCap)
  const accel = p.onGround ? PLAYER.GROUND_ACCEL : PLAYER.AIR_ACCEL
  const friction = p.onGround ? PLAYER.GROUND_FRICTION : PLAYER.AIR_FRICTION
  if (dir !== 0) {
    p.facing = dir
    // turning around brakes faster than plain acceleration
    const rate = Math.sign(p.vx) === -dir ? accel + friction : accel
    p.vx = moveToward(p.vx, dir * maxSpeed, rate * dt)
  } else {
    p.vx = moveToward(p.vx, 0, friction * dt)
  }
  if (Math.abs(p.vx) > maxSpeed && p.onGround) p.vx = moveToward(p.vx, Math.sign(p.vx) * maxSpeed, friction * dt)

  // --- jump (buffered + coyote, variable height) ---
  const jumpPressed = input.jump && !p.jumpHeldPrev
  p.jumpHeldPrev = input.jump
  p.coyote = p.onGround ? PLAYER.COYOTE_TIME : Math.max(0, p.coyote - dt)
  p.jumpBuffer = jumpPressed ? PLAYER.JUMP_BUFFER : Math.max(0, p.jumpBuffer - dt)
  if (p.onGround) p.airJumps = extraJumps(p)
  const boost = jumpMultiplier(p)
  const worldFeet = env.flipped ? env.R - p.y : p.y // (a flipped player is being simulated mirrored)
  if (p.jumpBuffer > 0 && p.coyote > 0 && !p.crouching) {
    p.vy = -PLAYER.JUMP_SPEED * boost
    p.onGround = false
    p.coyote = 0
    p.jumpBuffer = 0
    if (boost > 1) addFx(game, 'burst', p.x, worldFeet, p.id, 0.4) // Jump Boost: a small burst of light
  } else if (jumpPressed && !p.onGround && p.coyote <= 0 && p.airJumps > 0) {
    // a mid-air jump off a stepping stone of solid light (Jump Boost 2 and 3)
    const lean = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    const third = abilityLevel(p, 'jumpBoost') >= 3 && lean !== 0
    if (third && input.crouch) {
      // straight forward: a quick dash with only a little lift
      p.vy = -PLAYER.JUMP_SPEED * 0.3
      p.vx = lean * ABILITY.FORWARD_DASH
      p.airSpeedCap = ABILITY.FORWARD_DASH
      p.facing = lean
    } else if (third) {
      // diagonal: up and forward
      p.vy = -PLAYER.JUMP_SPEED * boost * 0.9
      p.vx = lean * Math.max(Math.abs(p.vx), ABILITY.DIAGONAL_SPEED)
      p.airSpeedCap = ABILITY.DIAGONAL_SPEED
      p.facing = lean
    } else {
      p.vy = -PLAYER.JUMP_SPEED * boost // straight up
    }
    p.airJumps--
    p.jumpBuffer = 0
    spawnStone(game, p.id, p.x, worldFeet, env.flipped ? -1 : 1)
    addFx(game, 'burst', p.x, worldFeet, p.id, 0.4)
  }
  if (!input.jump && p.vy < 0 && !p.push.ay) {
    p.vy *= PLAYER.JUMP_CUT // released early: shorter hop
    p.jumpHeldPrev = false
  }

  // --- gravity ---
  p.vy = Math.min(p.vy + PLAYER.GRAVITY * dt, PLAYER.MAX_FALL_SPEED)
  if (p.push.ay) {
    // wind: an updraft out-pushes gravity up to a cap; a downdraft adds to the fall
    p.vy += p.push.ay * dt
    if (p.push.ay < 0) p.vy = Math.max(p.vy, -p.push.capUp)
  }

  // --- move + collide, one axis at a time ---
  const half = p.w / 2
  const th = p.h + riderH // total height of whatever this player is carrying around

  // wind adds to the player's own horizontal movement without touching friction/acceleration
  const mvx = p.vx + p.push.vx
  p.x += mvx * dt
  if (mvx !== 0 && boxHitsSolid(solid, p.x - half, p.y - th, p.x + half, p.y)) {
    // a small ledge (only ever the end of a drawn ramp: tile ledges are whole tiles) is stepped up
    const ledge = ledgeTop(solid, p.x - half, p.y - th, p.x + half, p.y)
    const rise = ledge === null ? Infinity : p.y - ledge
    if (p.onGround && rise > EPS && rise <= DRAW.STEP_UP && !boxHitsSolid(solid, p.x - half, ledge - th, p.x + half, ledge)) {
      p.y = ledge
    } else if (mvx > 0) {
      p.x = Math.floor(p.x + half) - half - EPS
      p.vx = 0
    } else {
      p.x = Math.floor(p.x - half) + 1 + half + EPS
      p.vx = 0
    }
  }
  // the partner is a solid wall too: walking into them stops you
  if (playerHitsPlayer(p, other)) {
    if (mvx > 0) {
      p.x = other.x - other.w / 2 - half - EPS
      p.vx = 0
    } else if (mvx < 0) {
      p.x = other.x + other.w / 2 + half + EPS
      p.vx = 0
    }
  }

  // drawn lines: bricks of gentle slopes are stepped up, anything else is a wall
  for (let iteration = 0; lines.length && iteration < 6; iteration++) {
    const hit = topLineHit(lines, p.x - half, p.y - th, p.x + half, p.y)
    if (!hit) break
    const rise = p.y - hit.y0 // how far above the feet this brick's top is
    if ((p.onGround || p.vy >= 0) && rise > EPS && rise <= DRAW.STEP_UP) {
      const lifted = p.y - rise
      if (!boxHitsSolid(solid, p.x - half, lifted - th, p.x + half, lifted)) {
        p.y = lifted
        continue
      }
    }
    if (mvx > 0 || (mvx === 0 && p.x < (hit.x0 + hit.x1) / 2)) p.x = hit.x0 - half - EPS
    else p.x = hit.x1 + half + EPS
    p.vx = 0
  }

  const wasOnGround = p.onGround
  p.y += p.vy * dt
  p.onGround = false
  if (p.vy > 0 && boxHitsSolid(solid, p.x - half, p.y - th, p.x + half, p.y)) {
    p.y = Math.floor(p.y - EPS) // feet rest on top of the tile
    p.vy = 0
    p.onGround = true
  } else if (p.vy < 0 && boxHitsSolid(solid, p.x - half, p.y - th, p.x + half, p.y)) {
    p.y = Math.floor(p.y - th) + 1 + th + EPS // head against the underside of a tile
    p.vy = 0
  } else if (p.vy >= 0) {
    // standing exactly on a surface (vy is reset to ~gravity*dt each step)
    if (boxHitsSolid(solid, p.x - half, p.y, p.x + half, p.y + 0.02)) p.onGround = true
  }
  // landing on a drawn line, or bonking your head on its underside
  if (lines.length) {
    const hits = allLineHits(lines, p.x - half, p.y - th, p.x + half, p.y)
    if (hits.length && p.vy > 0) {
      p.y = Math.min(...hits.map((r) => r.y0))
      p.vy = 0
      p.onGround = true
    } else if (hits.length && p.vy < 0) {
      p.y = Math.max(...hits.map((r) => r.y1)) + th + EPS
      p.vy = 0
    } else if (p.vy >= 0 && !p.onGround && firstLineHit(lines, p.x - half, p.y, p.x + half, p.y + 0.02)) {
      p.onGround = true // resting on a line
    }
  }
  // landing on the partner's head (you can stand on them), or bonking your head on their feet
  if (playerHitsPlayer(p, other)) {
    if (p.vy > 0) {
      p.y = other.y - other.h
      p.vy = 0
      p.onGround = true
    } else if (p.vy < 0) {
      p.y = other.y + p.h + EPS
      p.vy = 0
    }
  } else if (p.vy >= 0 && !p.onGround && boxHitsPlayer(other, p.x - half, p.y, p.x + half, p.y + 0.02)) {
    p.onGround = true // resting on the partner's head
  }
  p.landed = p.onGround && !wasOnGround ? 0.001 : p.onGround ? p.landed + dt : 0

  // --- fell out of the room ---
  if (p.y > game.level.rows + WORLD.VOID_MARGIN) killPlayer(p)
}

// One player's step. A flipped player (grav -1) is simulated in a vertically MIRRORED copy of the
// room — y becomes rows - y, tiles, drawn lines and the partner's body are mirrored to match — where
// they are simply upright; the result is mirrored back. Left/right are swapped for them (their pane is
// rolled upside down, so screen-right is world-left).
function stepPlayer(game, p, partner, rawInput, dt) {
  const R = game.level.rows
  const base = solidFor(game, p)
  const flipped = p.grav < 0
  const riderH = p.carrying ? partner.h : 0
  const lines = solidLinesFor(game, p, p.x - p.w / 2, bodyTop(p) - (flipped ? 0 : riderH), p.x + p.w / 2, bodyBottom(p) + (flipped ? riderH : 0))
  if (!flipped) return stepPlayerCore(game, p, partner, rawInput, dt, { solid: base, lines, flipped: false, R })

  const deaths = p.deaths
  const mirroredLines = lines.map((line) => ({ ...line, rects: line.rects.map((r) => ({ ...r, y0: R - r.y1, y1: R - r.y0 })) }))
  const q = { ...partner, y: R - bodyTop(partner), vy: -partner.vy }
  const push = p.push
  p.y = R - p.y
  p.vy = -p.vy
  p.push = { vx: push.vx, ay: -push.ay, capUp: push.ay > 0 ? TRAPS.WIND_LIFT_CAP : 0 }
  const input = { ...rawInput, left: rawInput.right, right: rawInput.left }
  stepPlayerCore(game, p, q, input, dt, { solid: (tx, ty) => base(tx, R - 1 - ty), lines: mirroredLines, flipped: true, R })
  if (p.deaths !== deaths) return // they died and were put back at a checkpoint, in world coordinates already
  p.y = R - p.y
  p.vy = -p.vy
  p.push = push
}

// --- shoulder carry (M3b) -------------------------------------------------
// Landing on the partner's head (while they stand on solid ground and aren't drawing) LINKS
// the pair: the rider is carried wherever the carrier walks, jumps or crouches. The rider
// leaves by jumping (a jump off a RISING carrier inherits part of that upward speed — the
// chained boost) or by walking off the head. The link also ends if either player dies, or
// if the carrier starts drawing (a frozen drawer is just a platform, as before).
function tidyCarry(game) {
  const [a, b] = game.players
  for (const [p, q] of [[a, b], [b, a]]) {
    if (p.carriedBy && (q.id !== p.carriedBy || q.carrying !== p.id)) {
      p.carriedBy = null
      p.onGround = false
    }
    if (p.carrying && (q.id !== p.carrying || q.carriedBy !== p.id)) p.carrying = null
  }
  for (const rider of [a, b]) {
    const carrier = rider === a ? b : a
    if (rider.carriedBy && (isFrozen(carrier) || rider.grav !== carrier.grav)) {
      rider.carriedBy = null
      carrier.carrying = null
    }
  }
}

function unlink(rider, carrier) {
  rider.carriedBy = null
  carrier.carrying = null
}

function updateCarry(game, before) {
  const [a, b] = game.players
  // 1. move riders with their carriers
  for (const rider of [a, b]) {
    if (!rider.carriedBy) continue
    const carrier = rider === a ? b : a
    if (rider.vy * rider.grav < 0) {
      // jumped off: a rising carrier adds to the jump
      if (carrier.vy * carrier.grav < 0) rider.vy += carrier.vy * CARRY.CHAIN_INHERIT
      unlink(rider, carrier)
      continue
    }
    rider.y = headY(carrier)
    const half = rider.w / 2
    const nx = rider.x + (carrier.x - before[carrier.id].x)
    if (!boxHitsSolid(solidFor(game, rider), nx - half, bodyTop(rider), nx + half, bodyBottom(rider))) rider.x = nx
    rider.vy = 0
    rider.onGround = true
    if (Math.abs(rider.x - carrier.x) >= (rider.w + carrier.w) / 2 - 0.02) {
      unlink(rider, carrier) // walked off the edge of the shoulders
      rider.onGround = false
    }
  }
  // 2. new carries: a rider standing on the head of a grounded, non-drawing partner
  for (const [rider, carrier] of [[a, b], [b, a]]) {
    if (rider.carriedBy || rider.carrying || carrier.carriedBy || carrier.carrying) continue
    if (rider.grav !== carrier.grav) continue // upside-down and right-way-up players can't carry each other
    if (!rider.onGround || rider.vy * rider.grav < 0 || !carrier.onGround || isFrozen(carrier)) continue
    if (Math.abs(rider.y - headY(carrier)) > 0.06) continue
    if (Math.abs(rider.x - carrier.x) >= (rider.w + carrier.w) / 2 - 0.1) continue
    rider.carriedBy = carrier.id
    carrier.carrying = rider.id
  }
}

// Advance the whole game by one fixed step. `inputs` is [blue, pink] snapshots.
export function stepGame(game, inputs, dt) {
  game.time += dt
  const [blue, pink] = game.players
  tidyCarry(game) // a death or a draw freeze since last step may have broken a carry
  const before = { blue: { x: blue.x, y: blue.y }, pink: { x: pink.x, y: pink.y } }
  game.players.forEach((player, i) => releaseOnMove(game, player, inputs[i])) // Solid Light 3 ends when you move
  // crouch reels a Light Rope in rather than crouching while you hang from it
  const moves = inputs.map((input, i) => (game.players[i].rope.mode === 'attached' && input.crouch ? { ...input, crouch: false } : input))
  stepPlayer(game, blue, pink, moves[0], dt)
  stepPlayer(game, pink, blue, moves[1], dt)
  updateRopes(game, inputs, dt)
  updateCarry(game, before)
  updateCrates(game, inputs, dt)

  game.players.forEach((player, i) => {
    const pressed = !!inputs[i].interact && !player.interactHeldPrev
    player.interactHeldPrev = !!inputs[i].interact
    if (pressed && !isFrozen(player)) tryInteract(game, player)
    const drawPressed = !!inputs[i].draw && !player.drawHeldPrev
    player.drawHeldPrev = !!inputs[i].draw
    if (drawPressed) toggleDraw(game, player)
    const teleportPressed = !!inputs[i].teleport && !player.teleportHeldPrev
    player.teleportHeldPrev = !!inputs[i].teleport
    if (teleportPressed) useTeleport(game, player)
    const cyclePressed = !!inputs[i].cycle && !player.cycleHeldPrev
    player.cycleHeldPrev = !!inputs[i].cycle
    if (cyclePressed) cycleTeleport(game, player)
    const echoPressed = !!inputs[i].echo && !player.echoHeldPrev
    player.echoHeldPrev = !!inputs[i].echo
    if (echoPressed) useEcho(game, player)
    const ropePressed = !!inputs[i].rope && !player.ropeHeldPrev
    player.ropeHeldPrev = !!inputs[i].rope
    if (ropePressed) toggleRope(game, player)
    if (player.echoCooldown > 0) player.echoCooldown = Math.max(0, player.echoCooldown - dt)
    if (player.tpCooldown > 0) player.tpCooldown = Math.max(0, player.tpCooldown - dt)
  })
  updateCrystals(game)
  if (!game.outOfHearts && game.players.some((p) => p.heartsOn && p.hearts <= 0)) game.outOfHearts = true
  updateEchoes(game, dt)
  updateFx(game, dt)
  updateDrawing(game, dt)
  for (const p of game.players) if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt)
  updateTraps(game, dt, (player, cause) => killPlayer(player, cause))
  updateCheckpoints(game)
  updateDoorSystem(game, dt)
  updateFeedback(game)
}
