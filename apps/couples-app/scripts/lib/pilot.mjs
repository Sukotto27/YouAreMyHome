// A small toolkit for scripted playthroughs of the campaign rooms (used by scripts/check-doors-ch1-*.mjs).
// A "driver" decides ONE player's input each frame; until() runs both drivers until a condition holds.
import fs from 'node:fs'
import { createGame, stepGame } from '../../src/doors/engine.js'
import { parseLevel } from '../../src/doors/levels.js'
import { SIM } from '../../src/doors/config.js'

export const none = { left: false, right: false, jump: false, crouch: false, interact: false, draw: false, teleport: false, cycle: false, echo: false, rope: false }

export function loadRoom(name, carried = null) {
  const json = JSON.parse(fs.readFileSync(new URL(`../../src/doors/levels/${name}.json`, import.meta.url), 'utf8'))
  return createGame(parseLevel(json), carried)
}

export function makeChecker() {
  const state = { failures: 0 }
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
    if (!ok) state.failures++
  }
  const finish = (label) => {
    console.log(state.failures ? `\n${state.failures} check(s) FAILED` : `\n${label} checks passed`)
    process.exit(state.failures ? 1 : 0)
  }
  return { check, finish, state }
}

export function pilot(g) {
  const [B, P] = g.players
  const idle = () => ({})
  // walk toward x. opts: tol; autoJump (jump when blocked); jumpAt: [x...] (jump when on the ground at these);
  // crouchIn: [[x0,x1]...] (crouch while inside); interactAt: [x...] (press interact when standing at one)
  const drive = (x, opts = {}) => {
    const { tol = 0.2, autoJump = true, jumpAt = [], jumpEdge = [], crouchIn = [], interactAt = [] } = opts
    let stuck = 0 // frames spent pushing against something without moving
    return (p, f) => {
      const dx = x - p.x
      const away = Math.abs(dx) < tol
      stuck = !away && p.onGround && Math.abs(p.vx) < 0.3 ? stuck + 1 : 0
      const blocked = autoJump && stuck > 6 && Math.abs(dx) > 0.5
      const jumpHere = jumpAt.some((jx) => p.onGround && Math.abs(p.x - jx) < 0.3) || jumpEdge.some((ex) => p.onGround && p.x >= ex && p.x < ex + 0.4) // (jumpEdge: jump at the very lip of a pit)
      const crouch = crouchIn.some(([a, b]) => p.x > a && p.x < b)
      const interact = interactAt.some((ix) => Math.abs(p.x - ix) < 0.35) && f % 6 === 0
      return {
        left: !away && dx < 0,
        right: !away && dx > 0,
        jump: blocked || jumpHere || (!p.onGround && p.vy < 0),
        crouch,
        interact,
      }
    }
  }
  const step = (blue = idle, pink = idle, f = 0) => stepGame(g, [{ ...none, ...blue(B, f) }, { ...none, ...pink(P, f) }], SIM.STEP)
  // runs until cond() (or limit frames); returns whether cond() held
  const until = (limit, cond, blue = idle, pink = idle) => {
    for (let f = 0; f < limit; f++) {
      if (cond()) return true
      step(blue, pink, f)
    }
    return cond()
  }
  const wait = (frames, blue = idle, pink = idle) => until(frames, () => false, blue, pink)
  const press = (who) => {
    const input = { ...none, interact: true }
    stepGame(g, who === 'blue' ? [input, none] : [none, input], SIM.STEP)
    stepGame(g, [none, none], SIM.STEP)
  }
  return { g, B, P, idle, drive, step, until, wait, press }
}
