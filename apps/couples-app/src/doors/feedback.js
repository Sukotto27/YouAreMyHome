// Small on-screen confirmations when something the players did has an effect: "Door unlocked", "Spikes disarmed"...
// It only WATCHES the game (doors that just opened, hazards that just switched off) and posts a short notice, so none of
// the puzzle rules live here. Pure data, stepped from engine.js.
import { addNotice } from './abilities.js'
import { bodyCenter } from './gravity.js'

const TRAP_TEXT = {
  fire: 'Flames out',
  laser: 'Laser off',
  arrow: 'Arrows stopped',
  spikes: 'Spikes disarmed',
  boulder: 'Boulder hole sealed',
  crusher: 'Crushers stopped',
  blade: 'Blades stopped',
  wind: 'Wind stopped',
  collapse: 'Floor held up',
}
const LIFE = 2.2 // seconds a confirmation stays up

// the player standing closest to the plates / levers with these ids (they get the credit, and the colour)
function whoDidIt(game, ids) {
  const spots = []
  for (const id of [].concat(ids || [])) {
    const item = game.doors.plates.find((p) => p.id === id && p.held) || game.doors.switches.find((s) => s.id === id && s.on)
    if (item) spots.push(item)
  }
  if (!spots.length) return game.players[0].id
  const s = spots[0]
  let best = game.players[0]
  let bestD = Infinity
  for (const p of game.players) {
    const d = Math.hypot(p.x - (s.x + 0.5), bodyCenter(p) - (s.y + 0.5))
    if (d < bestD) {
      best = p
      bestD = d
    }
  }
  return best.id
}

export function updateFeedback(game) {
  const prev = (game.feedbackPrev ||= { doors: {}, traps: {}, ready: false })
  const say = (who, text) => {
    if (game.notices.some((n) => n.text === text && n.age < 1.2)) return // (not the same message twice in a row)
    addNotice(game, who, text)
    game.notices[game.notices.length - 1].life = LIFE
  }
  const ready = prev.ready
  const heard = new Set()
  for (const door of game.doors.doors) {
    const controlled = door.control || door.type === 'key'
    const open = door.type === 'key' ? door.keyUsed : door.open
    if (ready && controlled && open && !prev.doors[door.id] && !heard.has('door')) {
      heard.add('door')
      const ids = door.control ? [...door.control.ids, ...(door.control.orSwitches || [])] : null
      say(ids ? whoDidIt(game, ids) : game.players[0].id, 'Door unlocked')
    }
    prev.doors[door.id] = !!open
  }
  for (const trap of game.traps.traps) {
    if (trap.type === 'trapdoor') {
      const sealed = trap.mode === 'sealed'
      if (ready && trap.startOpen && sealed && !prev.traps[trap.id]) say(whoDidIt(game, trap.closeWhen), 'Bridge lowered')
      prev.traps[trap.id] = sealed
      continue
    }
    if (!trap.offWhile) continue
    if (ready && trap.off && !prev.traps[trap.id]) {
      const text = TRAP_TEXT[trap.type] || 'Trap disarmed'
      if (!heard.has(text)) {
        heard.add(text)
        say(whoDidIt(game, trap.offWhile), text)
      }
    }
    prev.traps[trap.id] = !!trap.off
  }
  prev.ready = true
}
