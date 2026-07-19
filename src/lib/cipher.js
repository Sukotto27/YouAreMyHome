// A little cipher that's ours: not real cryptography, just a formula only
// this app's source knows. Each character's ASCII code gets shifted by a
// digit pulled from our anniversary (3/30/24, 8:16pm -> "33020242016"),
// cycling through the digits like a one-time-pad-ish house recipe. Running
// the same formula with subtraction instead of addition undoes it exactly.
//
// This keeps casual eyes (or anyone just browsing raw Firestore data) from
// reading letters at a glance. It is NOT a substitute for real encryption —
// anyone with this source code can decode it instantly.

const KEY_DIGITS = '33020242016'.split('').map(Number)

const PRINTABLE_MIN = 32 // space
const PRINTABLE_MAX = 126 // ~
const RANGE = PRINTABLE_MAX - PRINTABLE_MIN + 1

function shiftAt(index) {
  return KEY_DIGITS[index % KEY_DIGITS.length]
}

function transform(text, sign) {
  return text
    .split('')
    .map((char, index) => {
      const code = char.charCodeAt(0)
      if (code < PRINTABLE_MIN || code > PRINTABLE_MAX) return char
      const shifted = (((code - PRINTABLE_MIN + sign * shiftAt(index)) % RANGE) + RANGE) % RANGE
      return String.fromCharCode(shifted + PRINTABLE_MIN)
    })
    .join('')
}

export function encodeSecret(text) {
  return transform(text, 1)
}

export function decodeSecret(text) {
  return transform(text, -1)
}
