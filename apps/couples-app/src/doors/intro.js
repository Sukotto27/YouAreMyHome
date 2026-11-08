// The opening scene (after "Tap to start"). Pure data and functions, stepped from index.js; view3d.js and the
// DOM layer in index.js turn the numbers into pictures.
//
//   title    black screen: TAP TO START
//   door     still black: a door opens and a bright white light grows from it
//   walk     the pair walk out of the light, toward the camera (front view)
//   turn     the camera swings round to the side view; the room appears out of the white
//   bubbles  a chat bubble over each head: tap one and they say "Where are we?"; tap the other's for the reply
//   lock     the door they came through closes, and locks
//   zoom     the camera (zoomed in more than a game ever is) pulls back to reveal the whole room
//   done     the game begins: whoever walks to the far door first falls through the trapdoor
//
// level.intro = { doorX, doorY, focusX?, focusY? }: the cutscene door's position (feet y) and where the camera
// settles.
const ease = (t) => {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}
const lerp = (a, b, t) => a + (b - a) * t

export const INTRO = {
  DOOR: 3.8, // seconds for the door to swing open (the light grows with it)
  WALK: 3.0,
  WALK_WAIT: 0.2,
  WALK_FROM: -3.4, // depth (z) they start at: behind the lit doorway, so they walk out of the light into view
  STRIDE_SPEED: 1.5, // tiles/s one Walk_Loop cycle covers at rate 1 (the same figure the game uses in view3d.js)
  TURN: 2.6,
  LINE: 2.4, // how long each line of dialogue stays up
  LOCK: 2.2,
  ZOOM: 3.0,
  VIEW_FRONT: 8, // tiles of height in the front view
  VIEW_CLOSE: 6, // the zoomed-in side view
  VIEW_FULL: 12, // the game's normal zoom
}

export const LINES = { first: 'Where are we?', second: "I'm not sure..." }

export function createIntro(game) {
  const { doorX, doorY } = game.level.intro
  for (const p of game.players) p.cine = { front: true, z: -1.7, yaw: 0, clip: 'Idle_Loop', rate: 1, hidden: true } // (nobody in the black void yet)
  return {
    phase: 'title',
    t: 0,
    doorX,
    doorY,
    focus: { x: game.level.intro.focusX ?? doorX + 1.5, y: game.level.intro.focusY ?? doorY + 3.5 },
    door: 0, // 0 shut .. 1 wide open
    light: 0, // 0 .. 1: how much white is pouring out
    lock: 0, // the padlock popping on
    flash: 0, // (unused: the room now fades in through its lighting)
    reveal: 0, // 0 .. 1: how much of the room's own light has come up
    front: 1, // 1 = looking at the door head on, 0 = the side view
    viewTiles: INTRO.VIEW_FRONT,
    target: { x: doorX, y: doorY - 1.6 },
    world: false, // the room itself is visible
    bubbles: false, // chat bubbles over the heads
    first: null, // who spoke first
    second: null,
    dialog: null, // { who, text, t }
    done: false,
  }
}

const xOf = (intro, id, spread = 0.9) => intro.doorX + (id === 'blue' ? -spread : spread)

// places the pair and tells the renderer how to draw them (p.cine: front-on, depth, turn, animation)
function pose(intro, game, { z, yaw, clip, rate = 1, hidden = false, front = true, spread = 0.9 }) {
  for (const p of game.players) {
    p.x = xOf(intro, p.id, spread)
    p.y = intro.doorY
    p.vx = p.vy = 0
    p.onGround = true
    p.grav = 1
    p.facing = 1
    p.cine = { front, z, yaw, clip, rate, hidden }
  }
}

export function startIntro(intro, game) {
  intro.phase = 'door'
  intro.t = 0
  pose(intro, game, { z: -1.7, yaw: 0, clip: 'Idle_Loop', hidden: true })
}

export function updateIntro(intro, game, dt) {
  if (intro.phase === 'title' || intro.phase === 'done') return
  intro.t += dt
  const t = intro.t
  const { doorX, doorY } = intro
  const mid = { x: doorX, y: doorY - 1.0 }
  switch (intro.phase) {
    case 'door': {
      intro.door = ease(t / INTRO.DOOR)
      intro.light = Math.min(1, intro.door * 4) // bright from the very first crack
      if (t >= INTRO.DOOR) {
        intro.phase = 'walk'
        intro.t = 0
      }
      break
    }
    case 'walk': {
      // constant pace, with the animation sped to match so the feet land where the body goes (no sliding)
      const k = Math.max(0, Math.min(1, (t - INTRO.WALK_WAIT) / (INTRO.WALK - INTRO.WALK_WAIT)))
      intro.light = 1
      const speed = Math.abs(0 - INTRO.WALK_FROM) / (INTRO.WALK - INTRO.WALK_WAIT)
      const walking = k > 0 && k < 1
      pose(intro, game, { z: lerp(INTRO.WALK_FROM, 0, k), yaw: 0, clip: walking ? 'Walk_Loop' : 'Idle_Loop', rate: walking ? speed / INTRO.STRIDE_SPEED : 1, spread: 0.42 }) // (close together, side by side)
      if (t >= INTRO.WALK) {
        intro.phase = 'turn'
        intro.t = 0
        intro.world = true // the room appears under the white as the camera moves
      }
      break
    }
    case 'turn': {
      const k = Math.min(1, t / INTRO.TURN)
      intro.reveal = ease(t / INTRO.TURN) // the room fades in while the camera swings round; the doorway stays white
      intro.light = 1
      intro.front = 1 - ease(k)
      intro.viewTiles = lerp(INTRO.VIEW_FRONT, INTRO.VIEW_CLOSE, ease(k))
      intro.target = { x: lerp(doorX, mid.x, ease(k)), y: lerp(doorY - 1.6, mid.y, ease(k)) }
      pose(intro, game, { z: 0, yaw: (Math.PI / 2) * ease(k), clip: 'Idle_Loop', front: k < 1, spread: lerp(0.42, 0.9, ease(k)) })
      if (t >= INTRO.TURN) {
        intro.phase = 'bubbles'
        intro.t = 0
        intro.reveal = 1
        intro.front = 0
        intro.bubbles = true
        pose(intro, game, { z: 0, yaw: Math.PI / 2, clip: 'Idle_Loop', front: false })
      }
      break
    }
    case 'bubbles': {
      intro.target = mid
      if (intro.dialog) {
        intro.dialog.t += dt
        if (intro.dialog.t >= INTRO.LINE) {
          const wasSecond = intro.dialog.who === intro.second
          intro.dialog = null
          if (wasSecond) {
            intro.phase = 'lock'
            intro.t = 0
            intro.bubbles = false
          }
        }
      }
      break
    }
    case 'lock': {
      intro.door = 1 - ease(t / 1.2)
      intro.light = intro.door // the white in the doorway goes as the door shuts
      intro.lock = ease((t - 1.2) / 0.5)
      if (t >= INTRO.LOCK) {
        intro.phase = 'zoom'
        intro.t = 0
      }
      break
    }
    case 'zoom': {
      const k = ease(t / INTRO.ZOOM)
      intro.viewTiles = lerp(INTRO.VIEW_CLOSE, INTRO.VIEW_FULL, k)
      intro.target = { x: lerp(mid.x, intro.focus.x, k), y: lerp(mid.y, intro.focus.y, k) }
      if (t >= INTRO.ZOOM) {
        intro.phase = 'done'
        intro.done = true
        for (const p of game.players) p.cine = undefined // the pair are free: the game begins
        game.players[0].x = doorX - 0.9
        game.players[1].x = doorX + 0.9
      }
      break
    }
    default:
  }
}

// Tap to start.
export function tapToStart(intro, game) {
  if (intro.phase === 'title') startIntro(intro, game)
}

// A tap on a chat bubble. The first bubble tapped says the first line; then the OTHER one answers.
export function introClick(intro, who) {
  if (intro.phase !== 'bubbles' || intro.dialog) return false
  if (!intro.first) {
    intro.first = who
    intro.dialog = { who, text: LINES.first, t: 0 }
    return true
  }
  if (!intro.second && who !== intro.first) {
    intro.second = who
    intro.dialog = { who, text: LINES.second, t: 0 }
    return true
  }
  return false
}

// Which bubbles are showing, and whether each is waiting to be tapped.
export function bubbleState(intro) {
  if (!intro.bubbles) return []
  return ['blue', 'pink'].map((who) => ({
    who,
    visible: !intro.dialog && who !== intro.first && who !== intro.second,
    // the second speaker's bubble pulses once the first line has been said
    ready: !!intro.first && who !== intro.first && !intro.second,
  }))
}

// What the renderer needs.
export function cineParams(intro) {
  return {
    front: intro.front,
    viewTiles: intro.viewTiles,
    target: intro.target,
    world: intro.world,
    flash: intro.flash,
    reveal: intro.reveal,
    door: intro.door,
    light: intro.light,
    lock: intro.lock,
    doorX: intro.doorX,
    doorY: intro.doorY,
  }
}
