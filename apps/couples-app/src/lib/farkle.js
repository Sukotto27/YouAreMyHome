// Standard 6-dice Farkle rules (the common ruleset — house variants exist,
// but this is the one this implementation follows throughout):
//   Single 1                          = 100
//   Single 5                          = 50
//   Three 1s                          = 1000
//   Three of any other value v        = v * 100
//   Four/five/six of a kind           = double the three-of-a-kind value for
//                                        each extra die (four = x2, five = x4,
//                                        six = x8)
//   Straight (1-2-3-4-5-6, all six)    = 1500
//   Three pairs (all six dice)        = 1500
// First entry onto the board requires banking >= ON_BOARD_MIN in one turn.
// The game ends once someone banks a total >= TARGET_SCORE; every other
// player gets exactly one more turn to try to beat it.
export const TARGET_SCORE = 10000
export const ON_BOARD_MIN = 500

export function rollDice(count) {
  return Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6))
}

function countByFace(diceValues) {
  const counts = [0, 0, 0, 0, 0, 0, 0] // index 1..6
  diceValues.forEach((v) => counts[v]++)
  return counts
}

function isStraight(diceValues) {
  if (diceValues.length !== 6) return false
  const counts = countByFace(diceValues)
  return counts.slice(1).every((c) => c === 1)
}

function isThreePairs(diceValues) {
  if (diceValues.length !== 6) return false
  const counts = countByFace(diceValues).slice(1).filter((c) => c > 0)
  return counts.length === 3 && counts.every((c) => c === 2)
}

// Scores a full multiset of dice, requiring every die to contribute (no
// leftover non-scoring dice) — used both to score a player's chosen
// selection and, via hasAnyScore, to detect a Farkle in a fresh roll.
export function scoreSelection(diceValues) {
  if (diceValues.length === 0) return { valid: false, score: 0 }
  if (isStraight(diceValues) || isThreePairs(diceValues)) return { valid: true, score: 1500 }

  const counts = countByFace(diceValues)
  let score = 0
  let accounted = 0

  for (let face = 1; face <= 6; face++) {
    const c = counts[face]
    if (c === 0) continue
    if (c >= 3) {
      const base = face === 1 ? 1000 : face * 100
      score += base * 2 ** (c - 3)
      accounted += c
    } else if (face === 1) {
      score += c * 100
      accounted += c
    } else if (face === 5) {
      score += c * 50
      accounted += c
    }
    // Any other leftover count (1-2 dice of a value that isn't 1/5 and
    // hasn't hit three-of-a-kind) scores nothing and stays unaccounted —
    // which invalidates the whole selection below.
  }

  return { valid: accounted === diceValues.length, score }
}

// Whether ANY non-empty subset of a fresh roll scores at all — a roll with
// no scoring subset is a Farkle, ending the turn immediately.
export function hasAnyScore(diceValues) {
  if (isStraight(diceValues) || isThreePairs(diceValues)) return true
  const counts = countByFace(diceValues)
  if (counts[1] > 0 || counts[5] > 0) return true
  return counts.slice(1).some((c) => c >= 3)
}

// Pure state transitions shared by the real player's actions and the
// preview-mode stand-in partner (see useFarkle) — keeping the final-round/
// winner logic in one place rather than duplicated for both.
export function applyFarkle(game, actingUid, rivalUid) {
  const isFinalRoundBust = game.finalRoundUid === actingUid
  return {
    ...game,
    turnScore: 0,
    dicePool: 6,
    awaitingKeep: false,
    currentTurnUid: isFinalRoundBust ? game.currentTurnUid : rivalUid,
    status: isFinalRoundBust ? 'finished' : game.status,
    winnerUid: isFinalRoundBust ? rivalUid : null,
  }
}

export function applyBank(game, actingUid, rivalUid) {
  const myTotal = game.scores[actingUid] || 0
  const newTotal = myTotal + game.turnScore
  const scores = { ...game.scores, [actingUid]: newTotal }

  // Once someone crosses the target, the rival gets exactly one more turn
  // (2-player only, so "everyone else" is just the one rival uid) to try to
  // beat it before the match ends.
  let finalRoundUid = game.finalRoundUid
  let status = game.status
  let winnerUid = null

  if (game.finalRoundUid === actingUid) {
    status = 'finished'
    const rivalScore = scores[rivalUid] || 0
    winnerUid = newTotal > rivalScore ? actingUid : rivalUid
  } else if (newTotal >= TARGET_SCORE && !finalRoundUid) {
    finalRoundUid = rivalUid
  }

  return {
    ...game,
    scores,
    turnScore: 0,
    dicePool: 6,
    lastRoll: null,
    lastRollByUid: null,
    awaitingKeep: false,
    currentTurnUid: rivalUid,
    finalRoundUid,
    status,
    winnerUid,
  }
}

// Greedy "keep everything that scores" selection — only used to drive the
// preview-mode stand-in partner's turn (see useFarkle), never to decide a
// real player's selection for them.
export function autoKeep(diceValues) {
  if (scoreSelection(diceValues).valid) return diceValues
  const counts = countByFace(diceValues)
  const kept = []
  for (let face = 1; face <= 6; face++) {
    const c = counts[face]
    if (c >= 3 || face === 1 || face === 5) {
      for (let i = 0; i < c; i++) kept.push(face)
    }
  }
  return kept
}
