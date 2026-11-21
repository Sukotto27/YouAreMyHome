// Sound effects. Like feedback.js it only WATCHES the game (arrows fired, doors that just opened or shut, levers
// flipped, jumps boosted, teleports...) and plays a sound for each change, so none of the puzzle rules live here.
// Browsers only allow audio after a tap or key press; the title screen's "tap to start" provides it.
const BASE = `${import.meta.env.BASE_URL}doors/sounds/`
const FILES = {
  arrow: 'arrow.mp3',
  doorClose: 'chest.mp3',
  ui: 'interact.mp3',
  unlock: 'unlock.mp3',
  doorOpen: 'door_open.mp3',
  emit: 'emit.mp3',
  boost: 'boost.mp3',
  teleport: 'teleport.mp3',
  plate: 'collect.mp3',
  mark: 'pop.mp3',
  ropeHit: 'click.mp3',
  pickup: 'crystal.mp3',
  die: 'fall.mp3',
  spawn: 'spawn.mp3',
  land: 'step1.mp3',
  push: 'push.mp3',
}
const VOICES = 4 // copies of each sound, so quick repeats overlap instead of cutting each other off
const HEARING = 14 // tiles: sounds in the world fade out with distance from the nearest player

export function createSfx() {
  const pools = {}
  for (const [name, file] of Object.entries(FILES)) {
    pools[name] = { i: 0, voices: Array.from({ length: VOICES }, () => Object.assign(new Audio(BASE + file), { preload: 'auto' })) }
  }
  const beam = new Audio(BASE + FILES.emit) // the Solid Light hum: its own looping copy
  beam.loop = true
  beam.preload = 'auto'
  let beamOn = false

  function play(name, volume = 1) {
    if (volume <= 0.01) return
    const pool = pools[name]
    const a = pool.voices[pool.i++ % VOICES]
    try {
      a.volume = Math.min(1, volume)
      a.currentTime = 0
      a.play()?.catch(() => {})
    } catch {
      /* audio not available yet */
    }
  }
  function setBeam(on) {
    if (on === beamOn) return
    beamOn = on
    try {
      if (on) {
        beam.volume = 0.6
        beam.currentTime = 0
        beam.play()?.catch(() => {})
      } else beam.pause()
    } catch {
      /* audio not available yet */
    }
  }

  // sounds from a spot in the room get quieter the further the nearest player is
  const near = (game, x, y) => {
    let d = Infinity
    for (const p of game.players) d = Math.min(d, Math.hypot(p.x - x, p.y - y))
    return Math.max(0, 1 - d / HEARING)
  }

  let respawnTimer = 0
  let state = null // what the game looked like last step
  let stateGame = null

  /** Call once per simulation step. */
  function update(game) {
    const doorsNow = {}
    const trapsNow = {}
    for (const d of game.doors.doors) doorsNow[d.id] = { open: !!d.open, used: !!d.keyUsed }
    for (const t of game.traps.traps) {
      if (t.type === 'trapdoor') trapsNow[t.id] = t.mode
      else if (t.type === 'arrow') trapsNow[t.id] = t.arrows
    }
    const switchesNow = {}
    for (const s of game.doors.switches) switchesNow[s.id] = !!s.on

    // a new room (or a reset) starts a new baseline: nothing that is already so makes a sound
    if (!state || stateGame !== game || state.doorsRef !== game.doors || state.trapsRef !== game.traps) {
      state = { doorsRef: game.doors, trapsRef: game.traps, doors: doorsNow, switches: switchesNow, arrows: new Map(), fx: game.nextFxId, traps: {}, plates: {}, exit: 0, keys: {}, crates: {}, players: {}, ropes: {} }
      stateGame = game
      for (const t of game.traps.traps) {
        if (t.type === 'trapdoor') state.traps[t.id] = t.mode
        else if (t.type === 'arrow') for (const a of t.arrows) state.arrows.set(a, true)
      }
      state.exit = game.doors.exit ? game.doors.exit.inside.filter(Boolean).length : 0
      for (const pl of game.doors.plates) state.plates[pl.id] = !!pl.held
      for (const k of game.doors.keys) state.keys[k.id] = k.holder
      for (const c of game.crates) state.crates[c.id] = c.mode
      for (const pl of game.players) state.players[pl.id] = { deaths: pl.deaths, vy: 0 }
      for (const pl of game.players) state.ropes[pl.id] = pl.rope.mode
      clearTimeout(respawnTimer)
      setBeam(false)
    }

    let doorOpen = 0
    let doorClose = 0
    let unlock = 0
    for (const d of game.doors.doors) {
      const was = state.doors[d.id]
      if (!was) continue
      const cell = near(game, d.x + 0.5, d.y + d.h / 2)
      if (d.open && !was.open) doorOpen = Math.max(doorOpen, cell)
      if (!d.open && was.open) doorClose = Math.max(doorClose, cell)
      if (d.keyUsed && !was.used) unlock = Math.max(unlock, cell)
    }
    for (const s of game.doors.switches) {
      if (s.id in state.switches && !!s.on !== state.switches[s.id]) unlock = Math.max(unlock, near(game, s.x + 0.5, s.y + 0.5))
    }
    let arrowVol = 0
    for (const t of game.traps.traps) {
      if (t.type === 'trapdoor') {
        const was = state.traps[t.id]
        const cell = near(game, t.x + t.w / 2, t.y)
        if (was && was !== t.mode) {
          if (t.mode === 'open') doorOpen = Math.max(doorOpen, cell)
          else if (t.mode === 'sealed' || (t.mode === 'closed' && was === 'open')) doorClose = Math.max(doorClose, cell)
        }
      } else if (t.type === 'arrow') {
        for (const a of t.arrows) {
          if (!state.arrows.has(a)) arrowVol = Math.max(arrowVol, near(game, a.x, a.y))
          state.arrows.set(a, true)
        }
      }
    }
    // (arrows that have flown off are forgotten once nothing refers to them any more)
    if (state.arrows.size > 64) {
      const live = new Set()
      for (const t of game.traps.traps) if (t.type === 'arrow') for (const a of t.arrows) live.add(a)
      for (const a of state.arrows.keys()) if (!live.has(a)) state.arrows.delete(a)
    }

    let plate = 0
    for (const pl of game.doors.plates) {
      if (pl.held && state.plates[pl.id] === false) plate = Math.max(plate, near(game, pl.x + 0.5, pl.y + 0.5))
      state.plates[pl.id] = !!pl.held
    }
    let pickup = false
    for (const k of game.doors.keys) {
      if (k.holder && state.keys[k.id] !== k.holder) pickup = true
      state.keys[k.id] = k.holder
    }
    let push = 0
    for (const c of game.crates) {
      if (c.mode === 'slide' && state.crates[c.id] !== 'slide') push = Math.max(push, near(game, c.x + 0.5, c.y + 0.5))
      state.crates[c.id] = c.mode
    }
    let died = false
    let land = 0
    let ropeHit = false
    for (const pl of game.players) {
      const was = state.players[pl.id] || { deaths: pl.deaths, vy: 0 }
      if (pl.deaths > was.deaths) died = true
      else if (pl.landed === 0.001 && Math.abs(was.vy) > 5) land = Math.max(land, Math.min(1, Math.abs(was.vy) / 20))
      state.players[pl.id] = { deaths: pl.deaths, vy: pl.vy }
      if (pl.rope.mode === 'attached' && state.ropes[pl.id] !== 'attached') ropeHit = true
      state.ropes[pl.id] = pl.rope.mode
    }
    // the exit door swings open when someone reaches it, and shuts again if they all leave
    if (game.doors.exit) {
      const e = game.doors.exit
      const inside = e.inside.filter(Boolean).length
      const cell = near(game, e.x + e.w / 2, e.y + e.h / 2)
      if (inside > 0 && state.exit === 0) doorOpen = Math.max(doorOpen, cell)
      else if (inside === 0 && state.exit > 0) doorClose = Math.max(doorClose, cell)
      state.exit = inside
    }
    let boost = false
    let teleport = false
    let mark = false
    let echo = false
    for (const f of game.fx) {
      if (f.id < state.fx) continue
      if (f.type === 'burst') {
        if (f.color === 'lightEcho') echo = true
        else boost = true
      } else if (f.type === 'mark') mark = true
      else if (f.type === 'collect') pickup = true
      else if (f.type === 'teleport') teleport = true
    }
    state.fx = game.nextFxId

    if (doorOpen) play('doorOpen', 0.3 + 0.7 * doorOpen)
    if (doorClose) play('doorClose', 0.3 + 0.7 * doorClose)
    if (unlock) play('unlock', 0.3 + 0.7 * unlock)
    if (arrowVol) play('arrow', 0.2 + 0.8 * arrowVol)
    if (boost || echo) play('boost', 0.7)
    if (plate) play('plate', 0.3 + 0.7 * plate)
    if (mark) play('mark', 0.8)
    if (pickup) play('pickup', 0.9)
    if (push) play('push', 0.2 + 0.6 * push)
    if (ropeHit) play('ropeHit', 0.8)
    if (land) play('land', 0.15 + 0.25 * land)
    if (died) {
      play('die', 0.9)
      clearTimeout(respawnTimer)
      respawnTimer = setTimeout(() => play('spawn', 0.9), 700) // (they come back at once in the simulation; the sound waits for the fall to finish)
    }
    if (teleport) play('teleport', 0.9)
    // the light hum plays for as long as a beam is being drawn or is standing, or a rope of light is out
    setBeam(game.players.some((p) => p.draw.mode === 'drawing' || p.draw.mode === 'active' || p.rope.mode === 'attached'))

    state.doors = doorsNow
    state.switches = switchesNow
    for (const t of game.traps.traps) if (t.type === 'trapdoor') state.traps[t.id] = t.mode
  }

  return {
    update,
    /** Menu clicks: start, confirm a message, next room. */
    ui: () => play('ui', 0.7),
    /** Silence anything still looping (leaving the game). */
    stop: () => {
      setBeam(false)
      clearTimeout(respawnTimer)
    },
  }
}
