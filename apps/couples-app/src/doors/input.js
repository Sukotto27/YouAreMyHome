import { KEYS } from './config.js'
import { createTouchState } from './touchstate.js'

const ROOM_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']

const GAME_KEYS = new Set([
  ...Object.values(KEYS.blue),
  ...Object.values(KEYS.pink),
  KEYS.reset,
  KEYS.debug,
  KEYS.hint,
  KEYS.switchCharacter,
  KEYS.twoPlayers,
  KEYS.nextRoom,
  KEYS.touchUi,
  ...ROOM_KEYS,
])

// Same-keyboard input for both players (WASD vs arrows). Returns plain
// per-player snapshots so the engine never touches the DOM. Reset and debug
// are edge-triggered ("was this pressed since you last asked").
//
// Control modes: 'both' (default: WASD = Blue, arrows = Pink) or, for testing
// alone, 'blue' / 'pink' — then EITHER key set (and both draw/interact keys)
// drives that one character and the other stands still. Tab flips between them.
export function createInput() {
  const down = new Set()
  // keys pressed since the simulation last looked: a tap that starts AND ends between two
  // frames (easy on a slow device) still counts for one step instead of being lost
  const tapped = new Set()
  let resetPressed = false
  let debugPressed = false
  let roomPressed = null
  let mode = 'both'
  let hintPressed = false
  let nextPressed = false
  let touchTogglePressed = false
  const touch = createTouchState() // the on-screen controls (touchui.js)

  function onKeyDown(event) {
    if (!GAME_KEYS.has(event.code)) return
    event.preventDefault() // arrows/F1 would otherwise scroll or open help
    if (event.repeat) return
    down.add(event.code)
    tapped.add(event.code)
    if (event.code === KEYS.reset) resetPressed = true
    if (event.code === KEYS.debug) debugPressed = true
    if (event.code === KEYS.hint) hintPressed = true
    if (event.code === KEYS.nextRoom) nextPressed = true
    if (event.code === KEYS.touchUi) touchTogglePressed = true
    if (event.code === KEYS.switchCharacter) mode = mode === 'blue' ? 'pink' : 'blue'
    if (event.code === KEYS.twoPlayers) mode = 'both'
    const roomIndex = ROOM_KEYS.indexOf(event.code)
    if (roomIndex !== -1) roomPressed = roomIndex
  }
  function onKeyUp(event) {
    if (!GAME_KEYS.has(event.code)) return
    event.preventDefault()
    down.delete(event.code)
  }
  function onBlur() {
    down.clear() // never leave a key "stuck" when the window loses focus
    tapped.clear()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  const held = (code) => down.has(code) || tapped.has(code)
  function snapshot(keys) {
    return {
      left: held(keys.left),
      right: held(keys.right),
      jump: held(keys.jump),
      crouch: held(keys.crouch),
      interact: held(keys.interact),
      draw: held(keys.draw),
      teleport: held(keys.teleport),
      cycle: held(keys.cycle),
      echo: held(keys.echo),
      rope: held(keys.rope),
    }
  }

  const idle = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false, teleport: false, cycle: false, echo: false, rope: false }
  const merged = (a, b) => ({
    left: a.left || b.left,
    right: a.right || b.right,
    jump: a.jump || b.jump,
    crouch: a.crouch || b.crouch,
    interact: a.interact || b.interact,
    draw: a.draw || b.draw,
    teleport: a.teleport || b.teleport,
    cycle: a.cycle || b.cycle,
    echo: a.echo || b.echo,
    rope: a.rope || b.rope,
  })

  return {
    get mode() {
      return mode
    },
    touch,
    setMode(next) {
      mode = next
    },
    // [blue, pink]
    players: () => {
      const blue = snapshot(KEYS.blue)
      const pink = snapshot(KEYS.pink)
      tapped.clear() // taps are seen by exactly one simulation step
      // with the touch controls up, one person on one device plays ONE character (the other stands still)
      const screen = touch.enabled ? touch.snapshot() : idle
      if (touch.enabled && mode === 'both') mode = 'blue'
      if (mode === 'blue') return [merged(merged(blue, pink), screen), idle]
      if (mode === 'pink') return [idle, merged(merged(blue, pink), screen)]
      return [blue, pink]
    },
    consumeReset() {
      const value = resetPressed
      resetPressed = false
      return value
    },
    // index of the room whose number key was pressed since last asked, or null
    consumeRoom() {
      const value = roomPressed
      roomPressed = null
      return value
    },
    consumeTouchToggle() {
      const value = touchTogglePressed
      touchTogglePressed = false
      return value
    },
    consumeNext() {
      const value = nextPressed
      nextPressed = false
      return value
    },
    consumeHint() {
      const value = hintPressed
      hintPressed = false
      return value
    },
    consumeDebug() {
      const value = debugPressed
      debugPressed = false
      return value
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}
