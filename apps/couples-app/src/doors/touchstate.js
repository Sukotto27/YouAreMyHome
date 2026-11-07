// The logic of the on-screen touch controls, with no DOM, so it can be tested headless:
//   - the virtual joystick: a drag left/right moves, a drag down crouches
//   - the toolbelt: which abilities the player has, which one is selected, what the USE button does
//   - the buttons' one-shot taps, merged into the same per-step input the keyboard produces
// touchui.js is the thin DOM layer on top; input.js merges snapshot() into the controlled player.
import { ABILITY_IDS, abilityLevel, atMarker, currentTeleportAction } from './abilities.js'

// Joystick thresholds, as a fraction of its radius. Pushing past ENGAGE starts a direction and it only stops
// once you are back inside RELEASE (so a thumb hovering at the edge doesn't flicker).
export const JOY = { ENGAGE: 0.34, RELEASE: 0.22, CROUCH_ON: 0.5, CROUCH_OFF: 0.38 }

// nx, ny: the knob's offset from the centre in -1..1 (y down). Returns { left, right, crouch }.
export function joystick(prev, nx, ny) {
  const past = (was, v, on, off) => (was ? v > off : v > on)
  return {
    left: nx < 0 && past(prev.left, -nx, JOY.ENGAGE, JOY.RELEASE),
    right: nx > 0 && past(prev.right, nx, JOY.ENGAGE, JOY.RELEASE),
    crouch: ny > 0 && past(prev.crouch, ny, JOY.CROUCH_ON, JOY.CROUCH_OFF),
  }
}

// The abilities that have a USE action and the key each one stands for.
export const USE_FLAG = { solidLight: 'draw', teleport: 'teleport', lightEcho: 'echo', lightRope: 'rope' }
export const isActive = (id) => id in USE_FLAG

// The toolbelt: every ability the player has found (passive ones are shown, but cannot be selected).
export function beltAbilities(player) {
  return ABILITY_IDS.filter((id) => abilityLevel(player, id) > 0).map((id) => ({ id, level: abilityLevel(player, id), passive: !isActive(id) }))
}

const secs = (n) => (n > 0 ? ` ${n.toFixed(1)}` : '')

// The text on the USE button: what pressing it will do right now.
export function useLabel(player, id) {
  switch (id) {
    case 'solidLight':
      if (player.draw.mode === 'aiming' || player.draw.mode === 'drawing') return 'CANCEL'
      if (player.draw.mode === 'active') return 'HELD'
      return player.draw.cooldown > 0 ? `WAIT${secs(player.draw.cooldown)}` : 'DRAW'
    case 'teleport': {
      const action = currentTeleportAction(player)
      const wait = player.tpCooldown > 0 ? ` ${player.tpCooldown.toFixed(1)}` : ''
      if (action === 'partner') return 'GO TO PARTNER' + wait
      if (action === 'swap') return 'SWAP' + wait
      if (!player.tpMarker) return 'MARK'
      return atMarker(player) ? 'PICK UP' : 'RETURN' + wait
    }
    case 'lightEcho':
      return player.echoCooldown > 0 ? `WAIT${secs(player.echoCooldown)}` : 'ECHO'
    case 'lightRope':
      if (player.rope.mode === 'aiming') return 'CANCEL'
      if (player.rope.mode === 'attached') return 'LET GO'
      return player.rope.cooldown > 0 ? `WAIT${secs(player.rope.cooldown)}` : 'ROPE'
    default:
      return ''
  }
}

export function createTouchState() {
  const state = {
    enabled: false, // the touch UI is on (set by index.js: a touch device, or the T key on a desktop)
    stick: { left: false, right: false, crouch: false },
    jump: false,
    selected: null, // the ability id the USE button works
    tapUse: false,
    tapCycle: false,
    tapInteract: false,
    setStick(nx, ny) {
      state.stick = joystick(state.stick, nx, ny)
    },
    releaseStick() {
      state.stick = { left: false, right: false, crouch: false }
    },
    setJump(down) {
      state.jump = !!down
    },
    select(id) {
      if (isActive(id)) state.selected = id
    },
    // Keeps the selection pointing at an ability the player really has (the first one, if not).
    ensureSelection(player) {
      const belt = beltAbilities(player).filter((a) => !a.passive)
      if (!belt.length) state.selected = null
      else if (!belt.some((a) => a.id === state.selected)) state.selected = belt[0].id
    },
    pressUse() {
      state.tapUse = true
    },
    pressCycle() {
      state.tapCycle = true
    },
    pressInteract() {
      state.tapInteract = true
    },
    // The same shape the keyboard gives the engine. Taps are seen by exactly one step.
    snapshot() {
      const out = {
        left: state.stick.left,
        right: state.stick.right,
        crouch: state.stick.crouch,
        jump: state.jump,
        interact: state.tapInteract,
        draw: false,
        teleport: false,
        cycle: state.tapCycle,
        echo: false,
        rope: false,
      }
      if (state.tapUse && state.selected) out[USE_FLAG[state.selected]] = true
      state.tapUse = state.tapCycle = state.tapInteract = false
      return out
    },
  }
  return state
}
