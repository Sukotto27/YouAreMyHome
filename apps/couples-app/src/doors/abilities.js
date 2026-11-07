// Unlockable abilities. Players find crystals; each crystal raises one ability of ONE player by a
// level (0 = not yet found, up to 3). Pure data and functions, no DOM, stepped by engine.js.
//
//   Solid Light  the line drawing (drawing.js). L1 short beam, 3s.  L2 longer, 5s.
//                L3 longer still, and it lasts until the caster moves (the caster is held
//                in place until they choose to move).
//   Jump Boost   L1 a small burst of light lifts the jump a little.  L2 a double jump off a brief
//                stepping stone of solid light.  L3 up to three stones: straight up, diagonal
//                (hold a direction) or straight forward (hold a direction and crouch).
//   Light Echo   leaves a translucent copy of you behind that holds down a pressure plate for you.
//                Higher levels keep it around longer (5s / 10s / 20s). One echo each.
//   Light Rope   click a spot (ideally the ceiling) and a rope of light shoots out and latches on: swing
//                from it, reel it in, pull your partner to you, or retrieve a loose key (rope.js).
//                Higher levels reach further (7 / 11 / 16 tiles) and last longer (4 / 7 / 12s).
//   Teleport     L1 to your partner.  L2 or swap places with them.  L3 or mark a spot and
//                teleport back to it from anywhere (the "marker" action places the mark, teleports
//                you to it from anywhere else, and picks it up again if you use it standing on it).
//                Which action the key performs is chosen with the "change" key.
//
// Level JSON: "abilities": { "solidLight": 1, ... } — the minimum each player has on entering the
//   room (rooms without the key give Solid Light 1, which is how the drawing rooms always worked);
//   "crystals": [{ "id", "x", "y", "ability": "solidLight"|"jumpBoost"|"teleport", "for": "blue"|"pink" }]
//   a crystal floating in cell (x,y) that only player `for` can take.
import { ABILITY, KEYS, PLAYER } from './config.js'
import { isSolid } from './levels.js'
import { doorBlocksCell } from './doors.js'
import { collapseSolid } from './traps.js'
import { bodyCenter, bodyBottom, bodyTop, headY } from './gravity.js'
import { buildRects, isFrozen } from './drawing.js'

export const ABILITY_IDS = ['solidLight', 'jumpBoost', 'teleport', 'lightEcho', 'lightRope']
export const ABILITY_NAMES = { solidLight: 'Solid Light', jumpBoost: 'Jump Boost', teleport: 'Teleport', lightEcho: 'Light Echo', lightRope: 'Light Rope' }
export const TELEPORT_LABEL = { partner: 'To partner', swap: 'Swap places' }
const ROMAN = ['', 'I', 'II', 'III']
export const levelName = (n) => ROMAN[n] || String(n)

export const abilityLevel = (p, name) => p.abilities?.[name] || 0
export const jumpMultiplier = (p) => (abilityLevel(p, 'jumpBoost') >= 1 ? ABILITY.JUMP_BOOST : 1)
export const extraJumps = (p) => ABILITY.EXTRA_JUMPS[Math.min(3, abilityLevel(p, 'jumpBoost'))]

export function teleportActions(p) {
  const level = abilityLevel(p, 'teleport')
  if (level <= 0) return []
  if (level === 1) return ['partner']
  if (level === 2) return ['partner', 'swap']
  return ['partner', 'swap', 'marker']
}
// what the teleport key will do right now, for the HUD
export function teleportLabel(p) {
  const action = currentTeleportAction(p)
  if (action !== 'marker') return TELEPORT_LABEL[action]
  if (!p.tpMarker) return 'Place a mark here'
  return atMarker(p) ? 'Pick up the mark' : 'Go to your mark'
}
export const atMarker = (p) => !!p.tpMarker && Math.abs(p.x - p.tpMarker.x) < 1 && Math.abs(p.y - p.tpMarker.y) < 1.5
export function currentTeleportAction(p) {
  const actions = teleportActions(p)
  return actions.length ? actions[Math.min(p.tpAction, actions.length - 1)] : null
}

// The abilities a new game starts with: what the players carry over from earlier rooms, raised to at
// least the room's own minimum.
export function startingAbilities(level, carried) {
  const out = {}
  for (const id of ['blue', 'pink']) {
    out[id] = {}
    for (const name of ABILITY_IDS) out[id][name] = Math.min(ABILITY.MAX_LEVEL, Math.max(carried?.[id]?.[name] || 0, level.abilities?.[name] || 0))
  }
  return out
}
export const exportAbilities = (game) => ({ blue: { ...game.players[0].abilities }, pink: { ...game.players[1].abilities } })

// ---------------------------------------------------------------------------
// effects and notices (pure data; view3d / overlay draw them)
// ---------------------------------------------------------------------------
export function addFx(game, type, x, y, color, life = 0.5) {
  game.fx.push({ id: game.nextFxId++, type, x, y, color, age: 0, life })
}
export function addNotice(game, playerId, text) {
  game.notices.push({ player: playerId, text, age: 0 })
}
export function updateFx(game, dt) {
  for (const f of game.fx) f.age += dt
  game.fx = game.fx.filter((f) => f.age < f.life)
  for (const n of game.notices) n.age += dt
  game.notices = game.notices.filter((n) => n.age < ABILITY.NOTICE_TIME)
}

// ---------------------------------------------------------------------------
// crystals
// ---------------------------------------------------------------------------
export function createCrystals(level) {
  return (level.objects.crystals || []).map((c) => {
    if (!ABILITY_IDS.includes(c.ability)) throw new Error(`Level "${level.name}": crystal "${c.id}" has unknown ability "${c.ability}"`)
    if (c.for !== 'blue' && c.for !== 'pink') throw new Error(`Level "${level.name}": crystal "${c.id}" must be "for" blue or pink`)
    return { id: c.id, x: c.x, y: c.y, ability: c.ability, for: c.for, taken: false }
  })
}

export function updateCrystals(game) {
  for (const c of game.crystals) {
    if (c.taken) continue
    const p = game.players.find((q) => q.id === c.for)
    if (Math.abs(p.x - (c.x + 0.5)) > ABILITY.CRYSTAL_REACH || Math.abs(bodyCenter(p) - (c.y + 0.5)) > ABILITY.CRYSTAL_REACH + 0.4) continue
    c.taken = true
    const before = abilityLevel(p, c.ability)
    const after = Math.min(ABILITY.MAX_LEVEL, before + 1)
    p.abilities[c.ability] = after
    if (c.ability === 'teleport') p.tpAction = Math.min(p.tpAction, teleportActions(p).length - 1)
    game.dialogs.push({ player: p.id, ability: c.ability, level: after, upgraded: before > 0 }) // the game pauses on this until it is read
    addFx(game, 'collect', c.x + 0.5, c.y + 0.5, c.ability, 0.9)
  }
}

// ---------------------------------------------------------------------------
// stepping stones (Jump Boost II and III): a short plank of solid light under the jumper's feet. It is a
// `line` like the ones Solid Light draws — solid to the partner and to hazards — that expires quickly
// and has nothing to do with the owner's drawing state.
// ---------------------------------------------------------------------------
export function spawnStone(game, ownerId, x, feetY, grav) {
  const half = ABILITY.STONE.width / 2
  const y = feetY + grav * 0.1 // just below the feet (above them, for someone on the ceiling)
  const points = [{ x: x - half, y }, { x: x + half, y }]
  game.lines.push({
    id: game.nextLineId++,
    owner: ownerId,
    stone: true,
    points,
    length: ABILITY.STONE.width,
    rects: buildRects(points),
    age: 0,
    life: ABILITY.STONE.life,
  })
}

// ---------------------------------------------------------------------------
// teleport
// ---------------------------------------------------------------------------
export function cycleTeleport(game, p) {
  const actions = teleportActions(p)
  if (actions.length < 2) return false
  p.tpAction = (Math.min(p.tpAction, actions.length - 1) + 1) % actions.length
  return true
}

const BODY_EPS = 1e-3

// Could `p` (with its current height) stand with its feet at (x, feetY), gravity `grav`? Not inside solid
// tiles, closed doors or collapsing floors, and (unless told to ignore it) not inside the partner.
export function boxFree(game, p, x, feetY, grav, ignorePartner = false) {
  const half = p.w / 2
  const top = grav < 0 ? feetY : feetY - p.h
  const bottom = top + p.h
  const solid = (tx, ty) => isSolid(game.level, tx, ty) || doorBlocksCell(game.doors, p, tx, ty) || collapseSolid(game.traps, tx, ty)
  for (let ty = Math.floor(top + BODY_EPS); ty <= Math.floor(bottom - BODY_EPS); ty++) {
    for (let tx = Math.floor(x - half + BODY_EPS); tx <= Math.floor(x + half - BODY_EPS); tx++) if (solid(tx, ty)) return false
  }
  if (!ignorePartner) {
    const q = game.players.find((o) => o !== p)
    if (x - half < q.x + q.w / 2 - BODY_EPS && x + half > q.x - q.w / 2 + BODY_EPS && top < bodyBottom(q) - BODY_EPS && bottom > bodyTop(q) + BODY_EPS) return false
  }
  return true
}

function unlinkCarry(game, p) {
  const q = game.players.find((o) => o !== p)
  if (p.carrying === q.id || p.carriedBy === q.id || q.carrying === p.id || q.carriedBy === p.id) {
    p.carrying = p.carriedBy = null
    q.carrying = q.carriedBy = null
  }
}

function place(game, p, x, feetY, grav) {
  unlinkCarry(game, p)
  if (p.grav !== grav) p.facing = -p.facing // keeps you facing the same way on your own (rolled) screen
  p.grav = grav
  p.x = x
  p.y = feetY
  p.vx = 0
  p.vy = 0
  p.onGround = false
  p.coyote = 0
  p.jumpBuffer = 0
  p.portalLock = true // if you arrive in a portal or gravity field it waits until you step out
  p.gravLock = null
  if (p.rope && p.rope.mode === 'attached') p.rope = { mode: 'idle', cooldown: ABILITY.ROPE_COOLDOWN } // you have left the rope behind
}

export function useTeleport(game, p) {
  const action = currentTeleportAction(p)
  if (!action || isFrozen(p)) return false
  const q = game.players.find((o) => o !== p)
  const color = p.id
  if (action === 'marker' && !p.tpMarker) {
    p.tpMarker = { x: p.x, y: p.y, grav: p.grav }
    addFx(game, 'mark', p.x, bodyCenter(p), color, 0.7)
    addNotice(game, p.id, 'Marked this spot')
    return true
  }
  if (action === 'marker' && atMarker(p)) {
    p.tpMarker = null // standing on it: pick it up so it can be placed somewhere new
    addFx(game, 'mark', p.x, bodyCenter(p), color, 0.5)
    addNotice(game, p.id, 'Picked up your mark')
    return true
  }
  if (p.tpCooldown > 0) return false
  const from = { x: p.x, y: bodyCenter(p) }
  const fail = () => {
    addFx(game, 'fail', p.x, bodyCenter(p), color, 0.35)
    addNotice(game, p.id, 'No room to teleport there')
    return false
  }
  if (action === 'partner') {
    const gap = p.w + 0.1
    const spots = [[q.x + gap, q.y], [q.x - gap, q.y], [q.x + 2 * gap, q.y], [q.x - 2 * gap, q.y]]
    let spot = spots.find(([x, y]) => boxFree(game, p, x, y, q.grav))
    if (!spot && q.grav === p.grav) spot = boxFree(game, p, q.x, headY(q), q.grav) ? [q.x, headY(q)] : null // on their shoulders
    if (!spot) return fail()
    place(game, p, spot[0], spot[1], q.grav)
  } else if (action === 'swap') {
    const a = { x: p.x, y: p.y, grav: p.grav }
    const b = { x: q.x, y: q.y, grav: q.grav }
    if (!boxFree(game, p, b.x, b.y, b.grav, true) || !boxFree(game, q, a.x, a.y, a.grav, true)) return fail()
    place(game, p, b.x, b.y, b.grav)
    place(game, q, a.x, a.y, a.grav)
    addFx(game, 'teleport', a.x, bodyCenter(q), q.id)
  } else {
    const m = p.tpMarker // action 'marker', and the mark is somewhere else: go there
    if (!boxFree(game, p, m.x, m.y, m.grav)) return fail()
    place(game, p, m.x, m.y, m.grav)
  }
  p.tpCooldown = ABILITY.TELEPORT_COOLDOWN
  addFx(game, 'teleport', from.x, from.y, color)
  addFx(game, 'teleport', p.x, bodyCenter(p), color)
  return true
}

// ---------------------------------------------------------------------------
// The "you have obtained" dialog: what it says and how to use the ability, with THIS player's keys.
// ---------------------------------------------------------------------------
const KEY_NAMES = { Period: '.', Comma: ',', Semicolon: ';', Quote: "'", Slash: '/', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Enter: 'Enter' }
export const keyLabel = (code) => KEY_NAMES[code] || code.replace(/^Key/, '').replace(/^Digit/, '')

export function abilityDialog(d, touch = false) {
  const keys = KEYS[d.player]
  const k = (name) => keyLabel(keys[name])
  const who = d.player === 'blue' ? 'Blue' : 'Pink'
  const L = d.level
  const lines = []
  // with the touch controls: the toolbelt selects, the USE and NEXT buttons act, the joystick and JUMP move
  const pick = (name) => `Select ${name} on the toolbelt and tap USE`
  switch (d.ability) {
    case 'solidLight': {
      const s = ABILITY.SOLID_LIGHT[L]
      if (L === 1) {
        lines.push(
          touch
            ? `${pick('Solid Light')} to aim, then drag your finger anywhere on the screen to draw a beam of solid light that your partner can stand on. You are frozen in place while it exists.`
            : `Press ${k('draw')} to aim, then drag the mouse anywhere (in either view) to draw a beam of solid light that your partner can stand on. You are frozen in place while it exists.`,
        )
      }
      lines.push(L === 3 ? `Now it reaches ${s.ink} tiles and lasts until you move.` : `The beam can be ${s.ink} tiles long and lasts ${s.life} seconds.`)
      break
    }
    case 'jumpBoost':
      if (L === 1) lines.push('A small burst of light now boosts your jump.')
      if (L === 2) lines.push(`${touch ? 'Tap JUMP' : 'Press jump'} again in mid-air: a stepping stone of solid light appears under your feet and you jump a second time.`)
      if (L === 3) {
        lines.push(
          touch
            ? 'You can jump up to three more times in mid-air. Hold nothing to go straight up, push the joystick sideways to jump diagonally, or sideways and down to dash straight forward.'
            : 'You can jump up to three more times in mid-air. Hold nothing to go straight up, hold a direction to jump diagonally, or hold a direction and crouch to dash straight forward.',
        )
      }
      break
    case 'teleport':
      if (L === 1) lines.push(touch ? `${pick('Teleport')} to teleport instantly to your partner.` : `Press ${k('teleport')} to teleport instantly to your partner.`)
      if (L === 2) lines.push(touch ? 'You can now swap places with your partner. Tap NEXT to choose between the two, then USE.' : `You can now swap places with your partner. Press ${k('cycle')} to choose between the two, then ${k('teleport')} to use it.`)
      if (L === 3) {
        lines.push(
          touch
            ? 'New action: Marker. Tap NEXT until it is selected, then USE to place a mark where you stand. Use it again from anywhere else to teleport back to the mark, or while standing on it to pick it up.'
            : `New action: Marker. Press ${k('cycle')} until it is selected, then ${k('teleport')} to place a mark where you stand. Use it again from anywhere else to teleport back to the mark, or while standing on it to pick it up.`,
        )
      }
      break
    case 'lightEcho':
      lines.push(touch ? `${pick('Light Echo')} while standing on the ground to leave a glowing copy of yourself, which holds down a pressure plate for you.` : `Press ${k('echo')} while standing on the ground to leave a glowing copy of yourself, which holds down a pressure plate for you.`)
      lines.push(`It stays for ${ABILITY.ECHO_LIFE[L]} seconds${L < 3 ? ', and longer at higher levels' : ''}.`)
      break
    case 'lightRope':
      if (L === 1) {
        lines.push(
          touch
            ? `${pick('Light Rope')}, then tap a spot on the screen (the ceiling is ideal). A rope of light shoots out and latches on to the first thing it meets: swing from it (push the joystick sideways to pump the swing, down to reel it in, JUMP to let go), or aim at a loose key or at your partner and pull the joystick down to reel them in.`
            : `Press ${k('rope')}, then click a spot in either view (the ceiling is ideal). A rope of light shoots out and latches on to the first thing it meets: swing from it (left/right pump the swing, crouch reels it in, jump lets go), or aim at a loose key or at your partner and crouch to reel them in.`,
        )
      }
      lines.push(`The rope reaches ${ABILITY.ROPE_RANGE[L]} tiles and lasts ${ABILITY.ROPE_LIFE[L]} seconds.`)
      break
    default:
  }
  return {
    title: `${who} has obtained ${ABILITY_NAMES[d.ability]}${d.upgraded ? ' ' + levelName(L) : ''}`,
    subtitle: d.upgraded ? `Upgraded to level ${levelName(L)}` : 'Level I',
    lines,
    color: ABILITY.COLORS[d.ability],
  }
}

// ---------------------------------------------------------------------------
// Light Echo: a copy of you, left standing where you cast it. It looks like a player to the pressure
// plates (same colour, same feet) and holds them down until it fades.
// ---------------------------------------------------------------------------
export function useEcho(game, p) {
  const level = Math.min(ABILITY.MAX_LEVEL, abilityLevel(p, 'lightEcho'))
  if (level < 1 || isFrozen(p) || !p.onGround || p.echoCooldown > 0) return false
  game.echoes = game.echoes.filter((e) => e.id !== p.id) // only one each: a new echo replaces the old
  game.echoes.push({
    id: p.id, // (the owner: plates check this like a player's id)
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    grav: p.grav,
    facing: p.facing,
    crouching: p.crouching,
    onGround: true,
    age: 0,
    life: ABILITY.ECHO_LIFE[level],
  })
  p.echoCooldown = ABILITY.ECHO_COOLDOWN
  addFx(game, 'burst', p.x, bodyCenter(p), 'lightEcho', 0.5)
  return true
}

export function updateEchoes(game, dt) {
  for (const e of game.echoes) e.age += dt
  game.echoes = game.echoes.filter((e) => e.age < e.life)
}

void PLAYER
