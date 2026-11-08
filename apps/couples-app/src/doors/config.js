// Every tunable for the Doors game in one place. Units are TILES (1 tile =
// 1 metre, so the 3D character models are already roughly the right size),
// seconds, and tiles/second. Nothing else in the game hard-codes a number
// that a designer might want to tweak.

export const SIM = {
  // Gameplay runs at a fixed step so jump height and speed are identical on a
  // 60Hz phone and a 144Hz monitor.
  STEP: 1 / 60,
  MAX_STEPS_PER_FRAME: 5,
}

export const PLAYER = {
  WIDTH: 0.6,
  HEIGHT_STAND: 1.75,
  // Just under one tile, so a one-tile-high crawlspace is passable ONLY while
  // crouched (standing needs 1.75).
  HEIGHT_CROUCH: 0.95,

  RUN_SPEED: 6.0,
  CROUCH_SPEED: 2.2,
  GROUND_ACCEL: 70,
  GROUND_FRICTION: 80,
  AIR_ACCEL: 42,
  AIR_FRICTION: 14,

  GRAVITY: 40,
  MAX_FALL_SPEED: 24,
  // ~2.5 tiles of jump height (so a 2-tile ledge is comfortable, not marginal);
  // a 3-tile-wide gap is comfortably
  // jumpable at full run speed.
  JUMP_SPEED: 14.2,
  JUMP_CUT: 0.5, // letting go of jump early multiplies upward speed by this
  COYOTE_TIME: 0.1, // can still jump this long after walking off a ledge
  JUMP_BUFFER: 0.1, // a jump pressed this long before landing still counts
}

export const WORLD = {
  // A player who falls this far below the bottom of the room is respawned.
  VOID_MARGIN: 4,
}

export const CAMERA = {
  // How many tiles tall each player's view is — sets the zoom.
  VIEW_TILES_H: 12,
  FOLLOW_SPEED: 7, // higher = snappier
  LOOK_AHEAD: 1.5, // tiles the camera leads in the facing direction
  LOOK_AHEAD_SPEED: 3,
}

// The side view is a real 3D scene seen through a narrow-angle perspective
// camera that is swung slightly to the side and above — just enough that tile
// faces, doors and platforms read as solid objects with depth.
export const VIEW3D = {
  FOV: 24, // degrees; narrower = flatter, subtler perspective
  YAW_DEG: 7, // camera swings this far to the side: you see the sides of blocks
  PITCH_DEG: 4, // ...and slightly from above: you see their tops
  TILE_FRONT: 0.5, // front face of the tiles (players walk at z = 0)
  TILE_BACK: -1.6, // how far back the tiles extend
  BACK_WALL_Z: -2.0,
}

export const KEYS = {
  // `interact` flips a nearby switch (and, later, hands over keys etc.)
  // `draw` enters draw mode (press again to cancel); then use the mouse
  // `teleport` uses the Teleport ability; `cycle` changes which teleport action it performs;
  // `echo` leaves a Light Echo; `rope` starts aiming a Light Rope (then click a spot)
  blue: { left: 'KeyA', right: 'KeyD', jump: 'KeyW', crouch: 'KeyS', interact: 'KeyE', draw: 'KeyQ', teleport: 'KeyF', cycle: 'KeyG', echo: 'KeyX', rope: 'KeyC' },
  pink: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', crouch: 'ArrowDown', interact: 'Slash', draw: 'Period', teleport: 'Comma', cycle: 'KeyM', echo: 'Semicolon', rope: 'Quote' },
  reset: 'KeyR',
  debug: 'F1',
  // Solo testing: Tab switches which character you control (the other stands still);
  // ` goes back to two players on one keyboard.
  hint: 'KeyH', // show/hide the room's how-to hint
  switchCharacter: 'Tab',
  twoPlayers: 'Backquote',
  touchUi: 'KeyT', // show/hide the on-screen touch controls (they are on by default on a phone)
  nextRoom: 'KeyN', // after a room is complete: on to the next one, keeping your abilities
  // Digit1..Digit9 jump to that room (handy while testing)
}

export const DOORS = {
  SWITCH_REACH: 1.1, // how close (in tiles) you must stand to a switch to flip it
  PLATE_TOLERANCE: 0.06, // how exactly your feet must be on a plate's floor to press it
  EXIT_HOLD: 0.5, // seconds both players must stand in the exit to finish the room
  HANDOVER_REACH: 2.2, // how close (tiles) the partner must be for Interact to hand them your key
}

export const COLORS = {
  blue: '#3b82f6',
  pink: '#ec4899',
}

// Crates (crates.js): blocks the players push.
export const CRATES = {
  SLIDE_TIME: 0.3, // seconds to slide one cell
  PUSH_DELAY: 0.18, // seconds of pushing before it starts to move
  GRAVITY: 30,
  MAX_FALL: 20,
  RESPAWN: 3, // a crate lost down a pit comes back where it started after this long
}

// Traps (traps.js).
export const TRAPS = {
  TELEGRAPH: 0.4, // seconds of warning before a jet/laser pulse or an arrow shot
  FIRE_THICKNESS: 0.8, // how wide a flame is, in tiles
  LASER_THICKNESS: 0.12,
  ARROW_SPEED: 9, // tiles per second
  SPIKE_WARN: 0.4, // spikes shake this long before falling
  SPIKE_GRAVITY: 30,
  SPIKE_MAX_SPEED: 22,
  BOULDER_RADIUS: 0.8,
  BOULDER_GRAVITY: 30,
  BOULDER_BOUNCE: 0.25, // 0 = dead stop on impact, 1 = perfectly bouncy
  BOULDER_DRAG: 0.12, // rolling resistance, per second
  BOULDER_LIFE: 40, // a boulder that is still around after this long disappears
  LINE_RADIUS: 0.1, // half the thickness of a drawn line, for boulders to roll against
  RESPAWN_PROTECTION: 0.8, // seconds a respawned player can't be hurt
  CRUSHER_REST: 1.8, // a crusher waits this long at the top...
  CRUSHER_WARN: 0.5, // ...shakes this long...
  CRUSHER_SPEED: 20, // ...slams down at this speed (tiles/s)...
  CRUSHER_HOLD: 0.4, // ...stays down this long...
  CRUSHER_RISE: 8, // ...and rises back at this speed
  BLADE_RADIUS: 0.6, // swinging blade
  BLADE_STEP: 0.02, // radians per sub-step when sweeping a blade (so a line can stop it)
  WIND_SPEED: 4, // horizontal wind: extra tiles/s added to a player's own movement
  WIND_LIFT: 62, // an updraft's upward acceleration (gravity is 40, so net lift is 22)
  WIND_LIFT_CAP: 7, // ...and the fastest it can carry someone up
  WIND_DOWN: 40, // a downdraft's extra downward acceleration
}

// Shoulder carry (engine.js): stand on the partner's head and ride along.
export const CARRY = {
  SPEED_MULT: 0.7, // the carrier walks slower with someone on their shoulders
  CHAIN_INHERIT: 0.5, // a rider jumping off a RISING carrier adds this fraction of the carrier's upward speed
}

// The co-op drawing mechanic (drawing.js).
export const DRAW = {
  LINE_LIFETIME: 3, // seconds a drawn line lasts (it starts when you let go of the mouse)
  INK_MAX: 24, // the longest line any level of Solid Light can draw, in tiles (Solid Light I draws 3: see ABILITY.SOLID_LIGHT)
  DRAW_COOLDOWN: 2, // seconds before you can draw again after a line vanishes
  LINE_THICKNESS: 0.2, // how thick the solid line is, in tiles
  MIN_LINE: 0.4, // shorter scribbles are thrown away
  MIN_POINT_SPACING: 0.08, // mouse points closer than this are ignored
  RECT_STEP: 0.1, // spacing of the collision bricks along the line
  STEP_UP: 0.36, // players automatically step up ledges this small — it lets them walk up a ramp
  FADE_TIME: 0.6, // the last seconds of a line's life it fades out
}

// Unlockable abilities (abilities.js). Levels are 1..3; level 0 means "not found yet".
export const ABILITY = {
  MAX_LEVEL: 3,
  // Solid Light: the drawing. Level 1 is how the drawing has always worked here; Infinity = until the caster moves.
  SOLID_LIGHT: [null, { ink: 3, life: DRAW.LINE_LIFETIME }, { ink: 18, life: 5 }, { ink: 24, life: Infinity }],
  JUMP_BOOST: 1.15, // Jump Boost 1+: multiplier on the jump's launch speed (about a third higher: a 3-tile ledge becomes reachable)
  EXTRA_JUMPS: [0, 0, 1, 3], // mid-air jumps by Jump Boost level (each off a stone of solid light)
  STONE: { life: 0.5, width: 1.2 }, // the stepping stones
  DIAGONAL_SPEED: 7.5, // horizontal speed cap after a diagonal stone jump
  FORWARD_DASH: 9.5, // and after a forward one
  TELEPORT_COOLDOWN: 1, // seconds between teleports
  CRYSTAL_REACH: 0.8, // how close you must get to your crystal to take it
  NOTICE_TIME: 3.5, // seconds a "found X" message stays up
  // each ability has its own colour (crystal, HUD, effects)
  COLORS: { solidLight: '#22d3ee', jumpBoost: '#facc15', teleport: '#a855f7', lightEcho: '#4ade80', lightRope: '#fb923c', heart: '#ff4d6d' },
  MAX_HEARTS: 6, // three to start with, and extra-heart crystals add more
  // Light Echo: how long the copy stays, by level
  ECHO_LIFE: [0, 5, 10, 20],
  ECHO_COOLDOWN: 1.5,
  // Light Rope: how far it shoots and how long it lasts, by level
  ROPE_RANGE: [0, 7, 11, 16],
  ROPE_LIFE: [0, 4, 7, 12],
  ROPE_RETRACT: 8, // tiles/s when reeling the rope in (crouch)
  ROPE_PULL: 10, // tiles/s a reeled-in partner or key travels
  ROPE_MIN_LENGTH: 1.2,
  ROPE_COOLDOWN: 0.5,
}
