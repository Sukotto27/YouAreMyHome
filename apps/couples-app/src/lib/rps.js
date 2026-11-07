// Pure rules for Rock Paper Scissors — kept free of Firebase/React imports
// (same reasoning as lib/farkle.js) so the outcome logic is trivially testable.
export const CHOICES = ['rock', 'paper', 'scissors']
export const CHOICE_EMOJI = { rock: '✊', paper: '✋', scissors: '✌️' }

export const COUNTDOWN_FROM = 3
export const REVEAL_MS = 2600
export const WINS_NEEDED = 2 // best of 3
// The host resolves a little after the on-screen countdown hits 0 so a pick
// tapped in the final instant still has time to land in the database.
export const RESOLVE_GRACE_MS = 450

const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' }

// Returns 'left', 'right', or null for a tie. A missing pick (didn't choose
// in time) loses to any pick; two missing picks tie.
export function roundWinner(leftPick, rightPick) {
  if (leftPick === rightPick) return null
  if (!leftPick) return 'right'
  if (!rightPick) return 'left'
  return BEATS[leftPick] === rightPick ? 'left' : 'right'
}
