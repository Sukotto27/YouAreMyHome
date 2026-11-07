// Doors, plates, switches and the exit. All of it is driven by the level JSON
// (see the project brief) and kept as plain data on `game.doors`, so a full
// room reset simply rebuilds it, and dying never touches it.
//
// Level JSON (all coordinates are tile cells; x,y is the TOP-LEFT cell):
//   "doors":    [{ "id", "type", "x", "y", "h", "color"?, "bypass"?, ...control params }]
//     "swing": 1 | -1 — which way its leaf opens along the corridor (default 1, to the right)
//     any door may name a "bypass" switch: while that switch is on the door is
//     open to EVERYONE (colour restrictions included). It's a testing aid for
//     solo play, so co-op-only doors can be skipped.
//     type "gray"          anyone passes
//     type "blue"|"pink"   only that player passes
//     type "plate"         open while its plates are held:
//                            "plates": ["id", ...], "mode": "all"|"any" (default all),
//                            "holdOpen": seconds it stays open after the plates are released
//     type "switch"        open while its switches are on:
//                            "switches": ["id", ...], "mode": "all"|"any" (default all)
//     plate/switch doors are gray unless a "color" is given, which then also
//     restricts who may pass once it's open.
//   "plates":   [{ "id", "x", "y", "w"?, "color"?: "any"|"blue"|"pink" }]
//                 a pad sitting on the floor in cell (x,y); held while a player
//                 of that colour stands on it
//   "switches": [{ "id", "x", "y", "mode": "toggle"|"once", "who"?: "any"|"blue"|"pink", "bypass"?: true }]
//                 ("bypass": true only changes how it is drawn — purple, labelled)
//                 flipped by pressing Interact next to it
//   "exit":     { "x", "y", "w"?, "h" }  the brown door; both players must be in it
//
// More door types (milestone 5):
//     type "key"     "key": "keyId" — opens for good when whoever holds that key reaches it
//     type "flip"    "start"?: "open"|"closed" (default open), "flips"?: ["doorId", ...],
//                    "self"?: false, "passes"?: n — toggles every time someone crosses it
//                    (so it shuts behind you) and toggles each listed flip door too
//     type "linked"  "of": "doorId", "mirror"?: false — a see-saw: open exactly while the
//                    other door is closed (mirror: false = open while it is open)
//     type "oneway"  "dir": 1|-1 — passable only travelling right (1) or left (-1)
//     type "swap"    "color"?: "blue"|"pink" (default blue) — only that player may pass,
//                    and once they have, it becomes the other player's door
//     type "random"  "period"?, "openChance"? — re-rolls open/closed every period seconds
//                    (seeded by the level and door id, so every run is identical)
//     Doors that change state never do it while someone is standing in them.
//   "keys":    [{ "id", "x", "y" }]  a key lying in cell (x,y). Walk onto it to pick it up
//                 (one key each); Interact near your partner hands it over; dying sends it home.
//   "gravity": [{ "id", "x", "y", "h"?, "set": "up"|"down", "who"? }]  a field that puts whoever
//                 walks into it on the ceiling ("up") or the floor ("down"): see gravity.js.
//                 Plates and switches also take "ceiling": true — they hang from the ceiling tile
//                 above cell (x,y) and are used by players walking on the ceiling.
//   "portals": [{ "id", "x", "y", "h"?, "to": "portalId" }]  walk into one and you come out
//                 of the other (keeping your speed). A carrying pair travels together.
//
// Doors occupy whole tile cells, so for collision a door that is closed to a
// player is just extra solid tiles for that player — the normal tile
// collision does the rest.
import { DOORS, PLAYER } from './config.js'
import { isSolid } from './levels.js'
import { bodyBottom, bodyCenter, bodyTop, headY, setGravity } from './gravity.js'

const DOOR_TYPES = new Set(['gray', 'blue', 'pink', 'plate', 'switch', 'key', 'flip', 'linked', 'oneway', 'swap', 'random'])

// small seeded generator so 'random' doors replay identically
function hashString(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function mulberry32(seed) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const COLORS = new Set(['gray', 'blue', 'pink'])

function fail(level, message) {
  throw new Error(`Level "${level.name}": ${message}`)
}

export function createDoorSystem(level) {
  const def = level.objects
  const plates = (def.plates || []).map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    w: p.w || 1,
    color: p.color || 'any',
    ceiling: !!p.ceiling,
    held: false,
  }))
  const switches = (def.switches || []).map((s) => ({
    id: s.id,
    x: s.x,
    y: s.y,
    mode: s.mode || 'toggle',
    who: s.who || 'any',
    ceiling: !!s.ceiling,
    on: false,
    used: false,
    bypass: !!s.bypass,
  }))
  const doors = (def.doors || []).map((d) => {
    if (!DOOR_TYPES.has(d.type)) fail(level, `door "${d.id}" has unknown type "${d.type}"`)
    const color = d.type === 'blue' || d.type === 'pink' ? d.type : d.type === 'swap' ? d.color || 'blue' : d.color || 'gray'
    if (!COLORS.has(color)) fail(level, `door "${d.id}" has unknown color "${color}"`)
    const door = {
      id: d.id,
      type: d.type,
      color,
      x: d.x,
      y: d.y,
      w: 1,
      h: d.h || 2,
      control: null,
      bypass: d.bypass || null,
      swing: d.swing === -1 ? -1 : 1, // which way the leaf opens along the corridor (+1 = right)
      unlocked: false, // true while its bypass switch is on
      open: d.type !== 'plate' && d.type !== 'switch', // controlled doors start shut
      holdTimer: 0,
      // --- milestone 5 doors ---
      key: d.type === 'key' ? d.key : null,
      keyUsed: false,
      flipOpen: d.start !== 'closed', // flip doors: their own state
      flips: d.flips || [], // flip doors toggled whenever this one is passed
      selfFlip: d.self !== false,
      maxPasses: d.passes ?? Infinity,
      passes: 0,
      pendingFlips: 0, // toggles waiting for the doorway to be empty
      pendingSwap: false,
      lastSide: {}, // which side of the door each player was last on (to spot a pass)
      dir: d.dir === -1 ? -1 : 1, // one-way: the allowed travel direction
      sides: {}, // one-way: which side each player last stood fully on
      of: d.of || null,
      mirror: d.mirror !== false,
      period: d.period ?? 3,
      openChance: d.openChance ?? 0.5,
      rng: mulberry32(hashString(`${level.name}/${d.id}`)),
      randOpen: false,
      timer: 0,
    }
    if (d.type === 'random') door.randOpen = door.rng() < door.openChance
    if (d.type === 'plate') door.control = { kind: 'plates', ids: d.plates || [], mode: d.mode || 'all', holdOpen: d.holdOpen || 0 }
    if (d.type === 'switch') door.control = { kind: 'switches', ids: d.switches || [], mode: d.mode || 'all', holdOpen: 0 }
    for (let ty = door.y; ty < door.y + door.h; ty++) {
      if (isSolid(level, door.x, ty)) fail(level, `door "${door.id}" overlaps a solid tile at (${door.x},${ty})`)
    }
    if (door.bypass && !switches.some((sw) => sw.id === door.bypass)) {
      fail(level, `door "${door.id}" refers to missing bypass switch "${door.bypass}"`)
    }
    if (door.control) {
      if (!door.control.ids.length) fail(level, `door "${door.id}" has no ${door.control.kind} to control it`)
      const pool = door.control.kind === 'plates' ? plates : switches
      for (const id of door.control.ids) {
        if (!pool.some((item) => item.id === id)) fail(level, `door "${door.id}" refers to missing ${door.control.kind.slice(0, -1)} "${id}"`)
      }
    }
    return door
  })
  for (const plate of plates) {
    if (!isSolid(level, plate.x, plate.ceiling ? plate.y - 1 : plate.y + 1)) fail(level, `plate "${plate.id}" is not ${plate.ceiling ? 'hanging from' : 'sitting on'} a solid ${plate.ceiling ? 'ceiling' : 'floor'}`)
  }

  const keys = (def.keys || []).map((k) => ({ id: k.id, x: k.x, y: k.y, home: { x: k.x, y: k.y }, px: k.x + 0.5, py: k.y + 0.5, holder: null, deaths: 0, used: false }))
  const gravity = (def.gravity || []).map((g) => ({ id: g.id, x: g.x, y: g.y, h: g.h || 3, set: g.set, who: g.who || 'any' }))
  for (const g of gravity) if (g.set !== 'up' && g.set !== 'down') fail(level, `gravity door "${g.id}" needs "set": "up" or "down" (there are no toggling gravity doors)`)
  const portals = (def.portals || []).map((p) => ({ id: p.id, x: p.x, y: p.y, h: p.h || 2, to: p.to }))
  for (const portal of portals) {
    if (!portals.some((o) => o.id === portal.to && o !== portal)) fail(level, `portal "${portal.id}" leads to missing portal "${portal.to}"`)
  }
  for (const door of doors) {
    if (door.type === 'key' && !keys.some((k) => k.id === door.key)) fail(level, `key door "${door.id}" refers to missing key "${door.key}"`)
    if (door.type === 'linked') {
      const partner = doors.find((o) => o.id === door.of)
      if (!partner || partner === door) fail(level, `linked door "${door.id}" refers to missing door "${door.of}"`)
      if (partner.type === 'linked') fail(level, `linked door "${door.id}" may not be linked to another linked door`)
    }
    for (const id of door.flips) {
      const target = doors.find((o) => o.id === id)
      if (!target || target.type !== 'flip') fail(level, `door "${door.id}" flips "${id}", which is not a flip door`)
    }
  }

  const exit = def.exit
    ? { x: def.exit.x, y: def.exit.y, w: def.exit.w || 1, h: def.exit.h || 3, inside: [false, false], timer: 0 }
    : null

  const system = { doors, plates, switches, keys, portals, gravity, exit }
  settleDoors(system, [], 0) // doors with no control are open; controlled ones start shut
  return system
}

// Is this tile cell part of a door that is closed to `player`?
export function doorBlocksCell(system, player, tx, ty) {
  for (const door of system.doors) {
    if (tx !== door.x || ty < door.y || ty >= door.y + door.h) continue
    if (doorClosedTo(door, player)) return true
  }
  return false
}

export function doorClosedTo(door, player) {
  if (!door.open) return true
  if (door.unlocked) return false
  if (door.type === 'oneway' && door.sides[player.id] === door.dir) return true // already through it: no way back
  return door.color !== 'gray' && door.color !== player.id
}

function overlapsRect(player, x, y, w, h) {
  return (
    player.x + player.w / 2 > x &&
    player.x - player.w / 2 < x + w &&
    bodyBottom(player) > y &&
    bodyTop(player) < y + h
  )
}

function controlMet(system, door) {
  const pool = door.control.kind === 'plates' ? system.plates : system.switches
  const states = door.control.ids.map((id) => {
    const item = pool.find((entry) => entry.id === id)
    return door.control.kind === 'plates' ? item.held : item.on
  })
  return door.control.mode === 'any' ? states.some(Boolean) : states.every(Boolean)
}

// Opens/closes every door from the current plate and switch states. A door
// that has just lost its trigger stays open while anyone is standing in it
// (and for its `holdOpen` time), so it can never close on a player.
function settleDoors(system, players, dt) {
  const settleOne = (door) => {
    const bypassOn = door.bypass && system.switches.find((sw) => sw.id === door.bypass).on
    const occupied = players.some((p) => overlapsRect(p, door.x, door.y, door.w, door.h))
    if (bypassOn) {
      door.unlocked = true
      door.open = true
      door.holdTimer = 0
      return
    }
    // bypass just switched off: stay passable while someone is still inside, so a door never re-locks on a player
    if (door.unlocked && occupied) return
    door.unlocked = false
    switch (door.type) {
      case 'key':
        door.open = door.keyUsed
        return
      case 'flip':
        if (door.pendingFlips && !occupied) {
          if (door.pendingFlips % 2) door.flipOpen = !door.flipOpen
          door.pendingFlips = 0
        }
        door.open = door.flipOpen || (door.open && occupied)
        return
      case 'oneway':
        door.open = true
        return
      case 'swap':
        if (door.pendingSwap && !occupied) {
          door.color = door.color === 'blue' ? 'pink' : 'blue'
          door.pendingSwap = false
        }
        door.open = true
        return
      case 'random':
        door.open = door.randOpen || (door.open && occupied)
        return
      case 'linked': {
        const partner = system.doors.find((o) => o.id === door.of)
        const want = door.mirror ? !partner.open : partner.open
        door.open = want || (door.open && occupied)
        return
      }
      default:
    }
    if (!door.control) {
      door.open = true
      return
    }
    if (controlMet(system, door)) {
      door.open = true
      door.holdTimer = door.control.holdOpen
    } else {
      door.holdTimer = Math.max(0, door.holdTimer - dt)
      if (door.open && door.holdTimer <= 0 && !occupied) door.open = false
    }
  }
  // linked doors read their partner's state, so they settle last
  for (const door of system.doors) if (door.type !== 'linked') settleOne(door)
  for (const door of system.doors) if (door.type === 'linked') settleOne(door)
}

function playerOnPlate(player, plate) {
  if (plate.color !== 'any' && plate.color !== player.id) return false
  // a floor plate is pressed by someone standing on it; a ceiling plate by someone standing on the ceiling
  const standing = player.onGround && (player.grav < 0) === plate.ceiling && Math.abs(player.y - (plate.ceiling ? plate.y : plate.y + 1)) < DOORS.PLATE_TOLERANCE
  return standing && player.x + player.w / 2 > plate.x && player.x - player.w / 2 < plate.x + plate.w
}

// A press of Interact: flips the closest switch in reach that this player may use.
export function tryInteract(game, player) {
  const centerY = bodyCenter(player)
  let best = null
  let bestDistance = Infinity
  for (const sw of game.doors.switches) {
    if (sw.who !== 'any' && sw.who !== player.id) continue
    const dx = Math.abs(player.x - (sw.x + 0.5))
    const dy = Math.abs(centerY - (sw.y + 0.5))
    if (dx > DOORS.SWITCH_REACH || dy > DOORS.SWITCH_REACH + 0.5) continue
    if (dx < bestDistance) {
      best = sw
      bestDistance = dx
    }
  }
  if (!best) {
    handOverKey(game, player)
    return
  }
  if (best.mode === 'once') {
    if (best.used) return
    best.used = true
    best.on = true
  } else {
    best.on = !best.on
  }
}

// Interact with no switch in reach: give your key to the partner standing close by.
function handOverKey(game, player) {
  const keys = game.doors.keys
  const mine = keys.find((k) => k.holder === player.id && !k.used)
  const other = game.players.find((q) => q.id !== player.id)
  if (!mine || keys.some((k) => k.holder === other.id)) return
  const reach = Math.hypot(other.x - player.x, bodyCenter(other) - bodyCenter(player))
  if (reach > DOORS.HANDOVER_REACH) return
  mine.holder = other.id
  mine.deaths = other.deaths
}

// Keys: picked up by walking onto them, carried above the head, dropped back home when their holder dies,
// and spent when the holder reaches the door they open.
function updateKeys(system, players) {
  for (const key of system.keys) {
    if (key.used) continue
    if (key.holder) {
      const holder = players.find((q) => q.id === key.holder)
      if (holder.deaths !== key.deaths) {
        key.holder = null
        key.px = key.home.x + 0.5
        key.py = key.home.y + 0.5
      } else {
        key.px = holder.x
        key.py = headY(holder) - holder.grav * 0.4
      }
    }
    if (!key.holder) {
      for (const p of players) {
        if (system.keys.some((o) => o.holder === p.id)) continue // one key at a time
        if (Math.abs(p.x - key.px) < 0.6 && key.py > bodyTop(p) - 0.2 && key.py < bodyBottom(p) + 0.2) {
          key.holder = p.id
          key.deaths = p.deaths
          break
        }
      }
    }
  }
  for (const door of system.doors) {
    if (door.type !== 'key' || door.keyUsed) continue
    const key = system.keys.find((k) => k.id === door.key)
    const holder = key && key.holder && players.find((q) => q.id === key.holder)
    if (holder && Math.abs(holder.x - (door.x + 0.5)) <= 1.4 && bodyBottom(holder) > door.y && bodyTop(holder) < door.y + door.h) {
      door.keyUsed = true
      key.used = true
      key.holder = null
    }
  }
}

// Spots players crossing flip and swap doors, and keeps one-way doors' notion of which side each player is on.
function updatePasses(system, players) {
  for (const door of system.doors) {
    const cx = door.x + 0.5
    if (door.type === 'oneway') {
      for (const p of players) {
        const half = p.w / 2
        if (p.x - half >= door.x + 1 - 1e-6) door.sides[p.id] = 1
        else if (p.x + half <= door.x + 1e-6) door.sides[p.id] = -1
        else if (door.sides[p.id] === undefined) door.sides[p.id] = p.x >= cx ? 1 : -1
      }
      continue
    }
    if (door.type !== 'flip' && door.type !== 'swap') continue
    for (const p of players) {
      const near = bodyBottom(p) > door.y && bodyTop(p) < door.y + door.h && Math.abs(p.x - cx) < 1.2
      if (!near) {
        delete door.lastSide[p.id]
        continue
      }
      const side = p.x >= cx ? 1 : -1
      const before = door.lastSide[p.id]
      door.lastSide[p.id] = side
      if (before === undefined || before === side) continue
      // p just crossed the door
      if (door.type === 'swap') {
        if (p.id === door.color) door.pendingSwap = true
      } else if (door.passes < door.maxPasses) {
        door.passes++
        if (door.selfFlip) door.pendingFlips++
        for (const id of door.flips) system.doors.find((o) => o.id === id).pendingFlips++
      }
    }
  }
}

// Random doors re-roll on a timer.
function updateRandomDoors(system, dt) {
  for (const door of system.doors) {
    if (door.type !== 'random') continue
    door.timer += dt
    if (door.timer >= door.period) {
      door.timer -= door.period
      door.randOpen = door.rng() < door.openChance
    }
  }
}

// Portals: walk into one, come out of its partner. A carrying pair goes through together.
function updatePortals(game) {
  const { portals } = game.doors
  for (const p of game.players) {
    const centerY = bodyCenter(p)
    const inside = portals.find((po) => Math.abs(p.x - (po.x + 0.5)) < 0.45 && centerY > po.y && centerY < po.y + po.h)
    if (!inside) {
      p.portalLock = false
      continue
    }
    if (p.portalLock) continue
    const target = portals.find((o) => o.id === inside.to)
    const partner = game.players.find((q) => q.id !== p.id)
    const standY = p.grav < 0 ? target.y : target.y + target.h // where their feet go (floor or ceiling of the portal)
    p.x = target.x + 0.5
    p.y = standY
    p.portalLock = true
    if (p.carrying === partner.id) {
      partner.x = p.x
      partner.y = headY(p)
      partner.portalLock = true
    } else if (p.carriedBy === partner.id) {
      partner.x = p.x
      partner.y = standY
      p.y = headY(partner)
      partner.portalLock = true
    }
  }
}

// Gravity doors: walking into the field (once per entry) sets you to the ceiling ("up") or the floor ("down").
function updateGravityDoors(game) {
  for (const p of game.players) {
    const centerY = bodyCenter(p)
    const inside = game.doors.gravity.find((g) => (g.who === 'any' || g.who === p.id) && Math.abs(p.x - (g.x + 0.5)) < 0.45 && centerY > g.y && centerY < g.y + g.h)
    if (!inside) {
      p.gravLock = null
      continue
    }
    if (p.gravLock === inside.id) continue
    p.gravLock = inside.id
    setGravity(game, p, inside.set === 'up' ? -1 : 1)
  }
}

export function updateDoorSystem(game, dt) {
  const system = game.doors
  const { players } = game

  // a Light Echo presses plates just like a player (it has the owner's id and stands where it was cast)
  for (const plate of system.plates) plate.held = players.some((p) => playerOnPlate(p, plate)) || (game.echoes || []).some((e) => playerOnPlate(e, plate))
  updateKeys(system, players)
  updatePasses(system, players)
  updateRandomDoors(system, dt)
  updatePortals(game)
  updateGravityDoors(game)
  settleDoors(system, players, dt)

  const exit = system.exit
  if (exit) {
    exit.inside = players.map((p) => {
      const cx = p.x
      const cy = p.y - (p.grav * PLAYER.HEIGHT_STAND) / 2
      return cx > exit.x && cx < exit.x + exit.w && cy > exit.y && cy < exit.y + exit.h
    })
    if (exit.inside.every(Boolean)) {
      exit.timer += dt
      if (exit.timer >= DOORS.EXIT_HOLD) game.complete = true
    } else {
      exit.timer = 0
    }
  }
}

// Lines for the F1 debug overlay.
export function doorDebugLines(system) {
  const lines = []
  for (const door of system.doors) {
    const hold = door.control && door.control.holdOpen ? ` hold ${door.holdTimer.toFixed(1)}/${door.control.holdOpen}s` : ''
    const control = door.control ? ` ${controlLabel(system, door)}${hold}` : ''
    const bypass = door.bypass ? ` bypass:${door.unlocked ? 'ON' : 'off'}` : ''
    const extra =
      door.type === 'key' ? ` key:${door.key}${door.keyUsed ? ' (used)' : ''}`
      : door.type === 'flip' ? ` flip ${door.passes} pass(es)${door.pendingFlips ? ' (toggle pending)' : ''}`
      : door.type === 'linked' ? ` ${door.mirror ? 'opposite of' : 'same as'} ${door.of}`
      : door.type === 'oneway' ? ` one-way ${door.dir > 0 ? '->' : '<-'}`
      : door.type === 'swap' ? ' swap'
      : door.type === 'random' ? ` random ${door.timer.toFixed(1)}/${door.period}s`
      : ''
    lines.push(`door ${door.id.padEnd(12)} ${door.color.padEnd(4)} ${door.open ? 'OPEN  ' : 'closed'}${control}${bypass}${extra}`)
  }
  for (const k of system.keys) lines.push(`key ${k.id.padEnd(8)} ${k.used ? 'used' : k.holder ? `held by ${k.holder}` : 'lying about'}`)
  for (const po of system.portals) lines.push(`portal ${po.id.padEnd(8)} -> ${po.to}`)
  for (const g of system.gravity) lines.push(`gravity ${g.id.padEnd(8)} ${g.set}`)
  for (const plate of system.plates) lines.push(`plate ${plate.id.padEnd(11)} ${plate.color.padEnd(4)} ${plate.held ? 'HELD' : '-'}`)
  for (const sw of system.switches) {
    lines.push(`switch ${sw.id.padEnd(10)} ${sw.mode.padEnd(6)} ${sw.on ? 'ON' : 'off'}${sw.used ? ' (used)' : ''}`)
  }
  if (system.exit) {
    const e = system.exit
    lines.push(`exit  blue ${e.inside[0] ? 'IN' : '-'}  pink ${e.inside[1] ? 'IN' : '-'}  ${e.timer.toFixed(2)}s`)
  }
  return lines
}

function controlLabel(system, door) {
  const pool = door.control.kind === 'plates' ? system.plates : system.switches
  const states = door.control.ids.map((id) => {
    const item = pool.find((entry) => entry.id === id)
    return `${id}:${(door.control.kind === 'plates' ? item.held : item.on) ? '1' : '0'}`
  })
  return `[${door.control.mode} ${states.join(' ')}]`
}
