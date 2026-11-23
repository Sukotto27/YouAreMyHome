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
export function applyFarkle(game, actingUid, rivalUid, roll = null) {
  const isFinalRoundBust = game.finalRoundUid === actingUid
  return {
    ...game,
    history: [...(game.history || []), { kind: 'farkle', uid: actingUid, roll, lost: game.turnScore || 0, at: Date.now() }],
    turnScore: 0,
    dicePool: 6,
    keptDice: [],
    awaitingKeep: false,
    lastActorUid: actingUid,
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
    history: [
      ...(game.history || []),
      { kind: 'bank', uid: actingUid, points: game.turnScore, total: newTotal, at: Date.now() },
    ],
    scores,
    turnScore: 0,
    dicePool: 6,
    lastRoll: null,
    lastRollByUid: null,
    keptDice: [],
    awaitingKeep: false,
    lastActorUid: actingUid,
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

// ---- "Show the math" breakdown -------------------------------------------
// Splits a valid selection into the scoring pieces that add up to its total,
// the way someone tallying on paper would write it. Mirrors scoreSelection
// exactly (same table) — the parts always sum to its `score`.
const COUNT_WORD = { 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six' }

export function scoreBreakdown(diceValues) {
  if (diceValues.length === 0) return []
  if (isStraight(diceValues)) return [{ label: 'Straight 1-2-3-4-5-6', math: '1,500', points: 1500 }]
  if (isThreePairs(diceValues)) {
    const pairs = countByFace(diceValues)
      .map((c, face) => (c === 2 ? face : null))
      .filter(Boolean)
    return [{ label: `Three pairs (${pairs.join(', ')})`, math: '1,500', points: 1500 }]
  }

  const counts = countByFace(diceValues)
  const parts = []
  for (let face = 1; face <= 6; face++) {
    const c = counts[face]
    if (c === 0) continue
    if (c >= 3) {
      const base = face === 1 ? 1000 : face * 100
      const mult = 2 ** (c - 3)
      parts.push({
        label: `${COUNT_WORD[c]} ${face}s`,
        math: mult === 1 ? base.toLocaleString() : `${base.toLocaleString()} × ${mult}`,
        points: base * mult,
      })
    } else if (face === 1 || face === 5) {
      const each = face === 1 ? 100 : 50
      parts.push({
        label: c === 1 ? `Single ${face}` : `Two ${face}s`,
        math: c === 1 ? each.toString() : `${each} × ${c}`,
        points: each * c,
      })
    }
  }
  return parts
}

// Entry recorded in game.history each time dice are set aside.
export function keepHistoryEntry(uid, diceValues, turnScoreAfter, hot = false) {
  const { score } = scoreSelection(diceValues)
  return { kind: 'keep', uid, dice: diceValues, points: score, turnScore: turnScoreAfter, hot, at: Date.now() }
}

// ---- Table layout ---------------------------------------------------------
// World units shared with the 3D dice tray (components/games/farkle). The play
// area is the upper part of the tray; pulled-aside and kept dice sit in the
// strip below it.
export const PLAY_AREA = { minX: -4.6, maxX: 4.6, minZ: -1.25, maxZ: 0.1 }

// Scatter positions + a random yaw for a fresh roll, kept apart so dice never
// land on top of each other. Decided once by the roller and stored on the
// game doc, so both screens toss the dice to the very same spots.
export function layoutDice(count) {
  const result = []
  let minGap = 1.0
  for (let i = 0; i < count; i++) {
    let spot = null
    for (let attempt = 0; attempt < 60 && !spot; attempt++) {
      if (attempt > 0 && attempt % 20 === 0) minGap *= 0.85
      const x = PLAY_AREA.minX + Math.random() * (PLAY_AREA.maxX - PLAY_AREA.minX)
      const z = PLAY_AREA.minZ + Math.random() * (PLAY_AREA.maxZ - PLAY_AREA.minZ)
      if (result.every((p) => Math.hypot(p.x - x, p.z - z) >= minGap)) spot = { x, z }
    }
    if (!spot) spot = { x: PLAY_AREA.minX + i * 1.6, z: PLAY_AREA.minZ + (i % 2) * 1.2 }
    result.push({ x: +spot.x.toFixed(3), z: +spot.z.toFixed(3), yaw: +(Math.random() * Math.PI * 2).toFixed(3) })
  }
  return result
}
