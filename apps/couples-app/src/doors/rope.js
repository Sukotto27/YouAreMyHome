// Light Rope. Press the rope key, then click a spot in either view: a rope of light shoots out of the
// caster's hand toward it, as far as the ability's range, and latches onto the FIRST thing it meets:
//   - a solid surface (ideally the ceiling): the caster can swing from it like a pendulum. Left/right
//     pump the swing, crouch reels the rope in (climbing it), jump lets go and keeps your speed;
//   - the partner: crouch reels them in to the caster (they fly across the gap), jump or the rope
//     key lets go;
//   - a loose key: crouch reels it in, and it lands in the caster's hands.
// The rope fades after a few seconds (longer at higher levels) and reaches further too.
//   L1 7 tiles / 4s   L2 11 tiles / 7s   L3 16 tiles / 12s
//
// player.rope: { mode: 'idle'|'aiming'|'attached', cooldown, type, anchor, length, key, age, life, reach }
import { ABILITY, PLAYER } from './config.js'
import { isSolid } from './levels.js'
import { doorBlocksCell } from './doors.js'
import { collapseSolid } from './traps.js'
import { bodyBottom, bodyCenter, bodyTop } from './gravity.js'
import { isFrozen } from './drawing.js'
import { abilityLevel, addFx, addNotice, boxFree } from './abilities.js'

export const initRope = () => ({ mode: 'idle', cooldown: 0 })
const lvl = (p) => Math.min(ABILITY.MAX_LEVEL, abilityLevel(p, 'lightRope'))
export const ropeRange = (p) => ABILITY.ROPE_RANGE[lvl(p)]
export const ropeLife = (p) => ABILITY.ROPE_LIFE[lvl(p)]
// where the rope leaves the caster: up near the shoulders
export const ropeHand = (p) => ({ x: p.x, y: bodyCenter(p) - p.grav * 0.3 })

export function releaseRope(p) {
  p.rope = { mode: 'idle', cooldown: ABILITY.ROPE_COOLDOWN }
}

// There is one mouse: not while someone else is aiming or drawing with it.
const mouseBusy = (game, except) => game.players.some((q) => q !== except && (q.draw.mode === 'aiming' || q.draw.mode === 'drawing' || q.rope.mode === 'aiming'))

// The rope key: start aiming, cancel aiming, or let go of a rope you are hanging from.
export function toggleRope(game, p) {
  if (lvl(p) < 1) return false
  const r = p.rope
  if (r.mode === 'attached') {
    releaseRope(p)
    return true
  }
  if (r.mode === 'aiming') {
    r.mode = 'idle'
    return true
  }
  if (isFrozen(p) || r.cooldown > 0 || mouseBusy(game, p)) return false
  r.mode = 'aiming'
  return true
}

// A click while aiming: shoot toward the point. Returns what the rope caught ('solid', 'partner', 'key') or null.
export function fireRope(game, p, point) {
  const r = p.rope
  if (r.mode !== 'aiming') return null
  const from = ropeHand(p)
  const dx = point.x - from.x
  const dy = point.y - from.y
  const dist = Math.hypot(dx, dy)
  const range = ropeRange(p)
  r.mode = 'idle'
  if (dist < 0.3) return null
  const ux = dx / dist
  const uy = dy / dist
  const q = game.players.find((o) => o !== p)
  const solidAt = (x, y) => {
    const tx = Math.floor(x)
    const ty = Math.floor(y)
    return isSolid(game.level, tx, ty) || doorBlocksCell(game.doors, p, tx, ty) || collapseSolid(game.traps, tx, ty)
  }
  const keys = game.doors.keys.filter((k) => !k.holder && !k.used)
  let hit = null
  for (let s = 0.1; s <= range && !hit; s += 0.06) {
    const x = from.x + ux * s
    const y = from.y + uy * s
    if (solidAt(x, y)) hit = { type: 'solid', anchor: { x, y }, length: s }
    else if (Math.abs(x - q.x) < q.w / 2 + 0.15 && y > bodyTop(q) - 0.15 && y < bodyBottom(q) + 0.15) hit = { type: 'partner', length: s }
    else {
      const k = keys.find((o) => Math.hypot(o.px - x, o.py - y) < 0.55)
      if (k) hit = { type: 'key', key: k.id, length: s }
    }
  }
  if (!hit) {
    r.cooldown = ABILITY.ROPE_COOLDOWN
    addFx(game, 'fail', from.x + ux * Math.min(range, 2), from.y + uy * Math.min(range, 2), 'fail', 0.35)
    addNotice(game, p.id, 'The rope found nothing to catch')
    return null
  }
  // swinging or being pulled ends any shoulder carry the caster is in
  for (const o of game.players) {
    if (o.carrying || o.carriedBy) o.carrying = o.carriedBy = null
  }
  p.rope = { mode: 'attached', cooldown: 0, age: 0, life: ropeLife(p), reach: hit.length, ...hit }
  return hit.type
}

// Per step, after everyone has moved: rope physics for every attached rope.
export function updateRopes(game, inputs, dt) {
  game.players.forEach((p, i) => {
    const r = p.rope
    if (r.mode === 'idle') {
      r.cooldown = Math.max(0, r.cooldown - dt)
      return
    }
    if (r.mode !== 'attached') return
    r.age += dt
    const jumpEdge = !!inputs[i].jump && !p.ropeJumpPrev
    if (r.age >= r.life || jumpEdge) {
      releaseRope(p)
      return
    }
    const reeling = !!inputs[i].crouch
    const center = { x: p.x, y: bodyCenter(p) }
    const q = game.players.find((o) => o !== p)

    if (r.type === 'solid') {
      if (reeling) r.length = Math.max(ABILITY.ROPE_MIN_LENGTH, r.length - ABILITY.ROPE_RETRACT * dt)
      const dx = center.x - r.anchor.x
      const dy = center.y - r.anchor.y
      const d = Math.hypot(dx, dy) || 1e-6
      if (d > r.length) {
        // taut: the caster can only be on the circle the rope allows (a pendulum): pull them in and
        // take away the speed that would carry them further out
        const nx = dx / d
        const ny = dy / d
        const x = p.x - nx * (d - r.length)
        const cy = center.y - ny * (d - r.length)
        const feet = cy + (p.grav < 0 ? -p.h : p.h) / 2
        if (boxFree(game, p, x, feet, p.grav, true)) {
          p.x = x
          p.y = feet
        }
        const outward = p.vx * nx + p.vy * ny
        if (outward > 0) {
          p.vx -= outward * nx
          p.vy -= outward * ny
        }
      }
    } else if (r.type === 'partner') {
      // they are drawn toward the caster's head, so a level pull carries them over a gap rather than dragging along it
      const dx = center.x - q.x
      const dy = center.y - p.grav * 0.6 - bodyCenter(q)
      const d = Math.hypot(dx, dy) || 1e-6
      if (reeling) {
        if (Math.hypot(center.x - q.x, center.y - bodyCenter(q)) <= 1.4) {
          releaseRope(p)
          return
        }
        q.vx = (dx / d) * ABILITY.ROPE_PULL
        // (their own step adds gravity before they move, so cancel it: the pull is then what they travel at)
        q.vy = (dy / d) * ABILITY.ROPE_PULL - q.grav * PLAYER.GRAVITY * dt
        q.onGround = false
        q.coyote = 0
        if (q.carrying || q.carriedBy) q.carrying = q.carriedBy = null
      }
      if (d > ropeRange(p) * 1.6) releaseRope(p)
    } else {
      const k = game.doors.keys.find((o) => o.id === r.key)
      if (!k || k.holder || k.used) {
        releaseRope(p)
        return
      }
      if (reeling) {
        const dx = center.x - k.px
        const dy = center.y - k.py
        const d = Math.hypot(dx, dy) || 1e-6
        const step = Math.min(d, ABILITY.ROPE_PULL * dt)
        k.px += (dx / d) * step
        k.py += (dy / d) * step
        if (d - step < 0.5) releaseRope(p) // it is in your hands (updateKeys picks it up)
      }
    }
  })
  game.players.forEach((p, i) => (p.ropeJumpPrev = !!inputs[i].jump))
}

// the world point at the far end of a rope, for drawing it (animated as it shoots out)
export function ropeEnd(game, p) {
  const r = p.rope
  if (r.mode !== 'attached') return null
  let end
  if (r.type === 'solid') end = r.anchor
  else if (r.type === 'partner') {
    const q = game.players.find((o) => o !== p)
    end = { x: q.x, y: bodyCenter(q) }
  } else {
    const k = game.doors.keys.find((o) => o.id === r.key)
    end = k ? { x: k.px, y: k.py } : ropeHand(p)
  }
  const hand = ropeHand(p)
  const t = Math.min(1, r.age / 0.12) // it shoots out in a moment
  return { x: hand.x + (end.x - hand.x) * t, y: hand.y + (end.y - hand.y) * t, latched: t >= 1 }
}
