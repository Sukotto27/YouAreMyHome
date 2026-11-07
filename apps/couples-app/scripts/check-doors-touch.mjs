// Headless checks for the touch controls' logic (joystick, toolbelt, USE button, labels), the icon
// bitmaps, and how touch merges into the input and drives a real game:
//   node scripts/check-doors-touch.mjs
const handlers = {}
globalThis.window = { addEventListener: (t, f) => { handlers[t] = f }, removeEventListener() {} }
const { createInput } = await import('../src/doors/input.js')
const { beltAbilities, createTouchState, joystick, useLabel, isActive, USE_FLAG } = await import('../src/doors/touchstate.js')
const { ICONS } = await import('../src/doors/pixel.js')
const { createGame, stepGame } = await import('../src/doors/engine.js')
const { parseLevel } = await import('../src/doors/levels.js')
const { SIM } = await import('../src/doors/config.js')
const { ABILITY_IDS } = await import('../src/doors/abilities.js')

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}
const key = (type, code) => handlers[type]({ code, repeat: false, preventDefault() {} })

// ---------------- the joystick ----------------
{
  const rest = { left: false, right: false, crouch: false }
  check('a drag to the right moves right', joystick(rest, 0.8, 0).right && !joystick(rest, 0.8, 0).left)
  check('a drag to the left moves left', joystick(rest, -0.8, 0).left && !joystick(rest, -0.8, 0).right)
  check('a drag down crouches', joystick(rest, 0, 0.8).crouch)
  check('a drag up does nothing (jump is its own button)', !Object.values(joystick(rest, 0, -1)).some(Boolean))
  check('a tiny nudge does not start moving', !joystick(rest, 0.2, 0.2).right && !joystick(rest, -0.25, 0).left)
  const diag = joystick(rest, 0.7, 0.7)
  check('down and sideways crouch-walks', diag.right && diag.crouch)
  const held = joystick({ left: false, right: true, crouch: false }, 0.27, 0)
  check('once moving, a thumb easing back stays on the move until it is well inside (no flicker)', held.right)
  check('...and stops when it comes back to the middle', !joystick({ left: false, right: true, crouch: false }, 0.15, 0).right)
  const sneaking = joystick({ left: false, right: false, crouch: true }, 0, 0.42)
  check('crouch has hysteresis too', sneaking.crouch && !joystick({ left: false, right: false, crouch: true }, 0, 0.3).crouch)
  const t = createTouchState()
  t.setStick(1, 0)
  t.releaseStick()
  check('letting go of the stick stops everything', !Object.values(t.stick).some(Boolean))
}

// ---------------- the toolbelt and the USE button ----------------
const level = (abilities) => {
  const grid = []
  for (let y = 0; y < 28; y++) {
    let line = ''
    for (let x = 0; x < 60; x++) line += x === 0 || x === 59 || y <= 3 || y >= 22 ? '#' : '.'
    grid.push(line)
  }
  grid[21] = grid[21].slice(0, 4) + 'B' + grid[21].slice(5, 7) + 'P' + grid[21].slice(8)
  return parseLevel({ name: 'touch-test', grid, abilities })
}
{
  const g = createGame(level({ solidLight: 1, jumpBoost: 2, teleport: 3, lightEcho: 1, lightRope: 2 }))
  const blue = g.players[0]
  const belt = beltAbilities(blue)
  check('the toolbelt lists every ability the player has', belt.length === 5 && belt.map((b) => b.id).join() === ABILITY_IDS.join())
  check('...Jump Boost is shown as passive (nothing to use), the others are not', belt.find((b) => b.id === 'jumpBoost').passive && belt.filter((b) => !b.passive).length === 4)
  check('...and shows each level', belt.find((b) => b.id === 'teleport').level === 3)
  const none = createGame(level({}))
  check('with no abilities the belt is empty', beltAbilities(none.players[0]).length === 0)

  const t = createTouchState()
  t.ensureSelection(blue)
  check('the first usable ability is selected to begin with', t.selected === 'solidLight')
  t.select('jumpBoost')
  check('a passive ability cannot be selected', t.selected === 'solidLight')
  t.select('lightRope')
  check('tapping another one selects it', t.selected === 'lightRope')
  t.ensureSelection(blue)
  check('...and it stays selected', t.selected === 'lightRope')
  none.players[0].abilities.lightRope = 0
  t.ensureSelection(none.players[0])
  check('with nothing usable nothing is selected', t.selected === null)

  t.select('teleport')
  t.ensureSelection(blue)
  t.setJump(true)
  t.setStick(1, 0)
  t.pressUse()
  let s = t.snapshot()
  check('USE presses the selected ability’s key (teleport) for exactly one step', s.teleport && !s.draw && !s.echo && !s.rope)
  check('...while jump and the stick stay held', s.jump && s.right)
  s = t.snapshot()
  check('...and is gone on the next step', !s.teleport && s.jump && s.right)
  t.select('lightEcho')
  t.pressUse()
  check('USE with the echo selected leaves an echo', t.snapshot().echo)
  t.select('solidLight')
  t.pressUse()
  check('...with Solid Light it starts drawing', t.snapshot().draw)
  t.pressCycle()
  t.pressInteract()
  s = t.snapshot()
  check('the NEXT and ACT buttons press cycle and interact once', s.cycle && s.interact && !t.snapshot().cycle)
  check('every usable ability has a key mapping', Object.keys(USE_FLAG).every((id) => isActive(id)) && !isActive('jumpBoost'))
}

// ---------------- the USE button's label ----------------
{
  const g = createGame(level({ solidLight: 1, teleport: 3, lightEcho: 1, lightRope: 3 }))
  const p = g.players[0]
  check('Solid Light says DRAW, then CANCEL while aiming', useLabel(p, 'solidLight') === 'DRAW' && ((p.draw.mode = 'aiming'), useLabel(p, 'solidLight') === 'CANCEL'))
  p.draw.mode = 'idle'
  check('Teleport says what it will do', useLabel(p, 'teleport') === 'GO TO PARTNER')
  p.tpAction = 2
  check('...the Marker says MARK, then RETURN, then PICK UP when you stand on it', useLabel(p, 'teleport') === 'MARK' && ((p.tpMarker = { x: 40, y: 22, grav: 1 }), /RETURN/.test(useLabel(p, 'teleport'))) && ((p.tpMarker = { x: p.x, y: p.y, grav: 1 }), useLabel(p, 'teleport') === 'PICK UP'))
  p.echoCooldown = 1.2
  check('the echo shows its cooldown', /WAIT 1.2/.test(useLabel(p, 'lightEcho')))
  check('the rope says ROPE, CANCEL while aiming, LET GO while attached', useLabel(p, 'lightRope') === 'ROPE' && ((p.rope.mode = 'aiming'), useLabel(p, 'lightRope') === 'CANCEL') && ((p.rope.mode = 'attached'), useLabel(p, 'lightRope') === 'LET GO'))
}

// ---------------- merging into the input ----------------
{
  const input = createInput()
  check('starts in two-player keyboard mode', input.mode === 'both')
  input.touch.enabled = true
  input.touch.setStick(1, 0)
  let [blue, pink] = input.players()
  check('with the touch controls up, one device plays one character: Blue moves, Pink stands still', blue.right && !pink.right && !pink.left && input.mode === 'blue')
  input.touch.setJump(true)
  ;[blue, pink] = input.players()
  check('the jump button jumps', blue.jump && !pink.jump)
  key('keydown', 'Tab')
  key('keyup', 'Tab')
  input.touch.releaseStick()
  input.touch.setJump(false)
  input.touch.setStick(-1, 0)
  ;[blue, pink] = input.players()
  check('Tab (or the switch button) hands the controls to Pink', input.mode === 'pink' && pink.left && !blue.left)
  input.touch.select('lightEcho')
  input.touch.pressUse()
  ;[blue, pink] = input.players()
  check('USE reaches the controlled character', pink.echo && !blue.echo)
  key('keydown', 'KeyD')
  ;[blue, pink] = input.players()
  key('keyup', 'KeyD')
  check('the keyboard still works alongside it', pink.right)
  key('keydown', 'KeyT')
  key('keyup', 'KeyT')
  check('the T key asks to toggle the touch controls', input.consumeTouchToggle() && !input.consumeTouchToggle())
  input.touch.enabled = false
  input.setMode('both')
  input.touch.setStick(1, 0)
  ;[blue, pink] = input.players()
  check('with the controls off, touch does nothing', !blue.right && !pink.right)
}

// ---------------- driving a real game from touch ----------------
{
  const g = createGame(level({ solidLight: 1, teleport: 1 }))
  const t = createTouchState()
  t.ensureSelection(g.players[0])
  for (let f = 0; f < 5; f++) stepGame(g, [{}, {}], SIM.STEP)
  t.setStick(1, 0)
  const x0 = g.players[0].x
  for (let f = 0; f < 30; f++) stepGame(g, [t.snapshot(), {}], SIM.STEP)
  check('holding the joystick right walks the character right', g.players[0].x > x0 + 2, `${x0.toFixed(1)} -> ${g.players[0].x.toFixed(1)}`)
  t.releaseStick()
  t.setStick(0, 1)
  stepGame(g, [t.snapshot(), {}], SIM.STEP)
  check('pulling it down crouches', g.players[0].crouching)
  t.releaseStick()
  t.setJump(true)
  for (let f = 0; f < 10; f++) stepGame(g, [t.snapshot(), {}], SIM.STEP)
  check('the jump button jumps', g.players[0].y < 21.8, `y=${g.players[0].y.toFixed(2)}`)
  t.setJump(false)
  for (let f = 0; f < 80; f++) stepGame(g, [t.snapshot(), {}], SIM.STEP)
  t.select('solidLight')
  t.pressUse()
  stepGame(g, [t.snapshot(), {}], SIM.STEP)
  check('USE with Solid Light selected starts aiming a line', g.players[0].draw.mode === 'aiming')
  stepGame(g, [t.snapshot(), {}], SIM.STEP) // (a tap is always followed by frames with the button up)
  t.pressUse()
  stepGame(g, [t.snapshot(), {}], SIM.STEP)
  check('...and USE again cancels it', g.players[0].draw.mode === 'idle')
}

// ---------------- the pixel icons ----------------
{
  const names = [...ABILITY_IDS, 'jump', 'use', 'interact', 'cycle', 'switchPlayer', 'reset']
  check('there is an icon for every ability and control', names.every((n) => ICONS[n]), names.filter((n) => !ICONS[n]).join())
  const bad = Object.entries(ICONS).filter(([, rows]) => rows.length !== 12 || rows.some((r) => r.length !== 12 || /[^.cwkg]/.test(r)))
  check('every icon is a 12x12 bitmap of known pixels', bad.length === 0, bad.map(([n]) => n).join())
  const blank = Object.entries(ICONS).filter(([, rows]) => !rows.some((r) => /[cwkg]/.test(r)))
  check('...and none is blank', blank.length === 0)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll touch checks passed')
process.exit(failures ? 1 : 0)
