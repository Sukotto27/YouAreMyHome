// A player's input snapshot packed into one small number for the network (and back).
export const INPUT_KEYS = ['left', 'right', 'jump', 'crouch', 'interact', 'draw', 'teleport', 'cycle', 'echo', 'rope']
export const IDLE_INPUT = Object.fromEntries(INPUT_KEYS.map((k) => [k, false]))

export function maskOf(snapshot) {
  let mask = 0
  INPUT_KEYS.forEach((key, i) => {
    if (snapshot[key]) mask |= 1 << i
  })
  return mask
}

export function inputOf(mask) {
  return Object.fromEntries(INPUT_KEYS.map((key, i) => [key, !!(mask & (1 << i))]))
}
