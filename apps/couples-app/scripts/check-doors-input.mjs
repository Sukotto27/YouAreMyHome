// Headless check of the Doors keyboard input, including the solo-testing modes
// (Tab switches which character you control, ` returns to two players):
//   node scripts/check-doors-input.mjs
const handlers = {}
globalThis.window = { addEventListener: (t, f) => { handlers[t] = f }, removeEventListener() {} }
const { createInput } = await import('../src/doors/input.js')
const input = createInput()
const key = (type, code) => handlers[type]({ code, repeat: false, preventDefault() {} })

let failures = 0
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failures++
}

check('starts in two-player mode', input.mode === 'both')
key('keydown', 'KeyD')
key('keydown', 'ArrowLeft')
let [blue, pink] = input.players()
check('two players: WASD drives Blue, arrows drive Pink', blue.right && !blue.left && pink.left && !pink.right)
key('keyup', 'KeyD')
key('keyup', 'ArrowLeft')

key('keydown', 'Tab')
key('keyup', 'Tab')
check('Tab enters solo mode controlling Blue', input.mode === 'blue')
key('keydown', 'ArrowRight')
;[blue, pink] = input.players()
check('solo: the arrow keys drive Blue too, and Pink stands still', blue.right && !pink.right && !pink.left && !pink.jump)
key('keyup', 'ArrowRight')

key('keydown', 'Tab')
key('keyup', 'Tab')
check('Tab switches to Pink', input.mode === 'pink')
key('keydown', 'KeyQ')
;[blue, pink] = input.players()
key('keyup', 'KeyQ')
check("solo: either draw key draws as the active character", pink.draw && !blue.draw)

key('keydown', 'Backquote')
key('keyup', 'Backquote')
check('` returns to two players', input.mode === 'both')

// a tap shorter than a frame is still seen by exactly one step
key('keydown', 'KeyE')
key('keyup', 'KeyE')
const first = input.players()[0].interact
const second = input.players()[0].interact
check('a tap between two frames is seen by exactly one step', first && !second)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll input checks passed')
process.exit(failures ? 1 : 0)
