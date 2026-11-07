// Pure rules for Bananagrams — no React/Firebase imports (same reasoning as
// lib/farkle.js), so the same reducer drives both the Realtime Database
// transaction and the local demo mode, and is easy to test.
//
// Words are checked against a dictionary on the client (lib/wordList.js); the
// reducer only handles tile bookkeeping and who wins. A finished, connected,
// all-valid grid triggers Peel automatically, or the win once the pile is
// too small to peel.
export const GRID_SIZE = 19

// The real Bananagrams distribution (144 tiles).
const DISTRIBUTION = {
  A: 13, B: 3, C: 3, D: 6, E: 18, F: 3, G: 4, H: 3, I: 12, J: 2, K: 2, L: 5, M: 3,
  N: 8, O: 11, P: 3, Q: 2, R: 9, S: 6, T: 9, U: 6, V: 3, W: 3, X: 2, Y: 3, Z: 2,
}

export const GAME_SIZES = {
  short: { label: 'Short', total: 72, hand: 15 },
  full: { label: 'Full', total: 144, hand: 21 },
}
export const DEFAULT_SIZE = 'short'

export const DUMP_DRAW = 3

function shuffle(items, rand = Math.random) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function newMatch(hostUid, otherUid, sizeKey = DEFAULT_SIZE, rand = Math.random) {
  const size = GAME_SIZES[sizeKey] || GAME_SIZES[DEFAULT_SIZE]
  const all = shuffle(Object.entries(DISTRIBUTION).flatMap(([letter, n]) => Array(n).fill(letter)), rand)
  const bag = all.slice(0, size.total)
  const players = [hostUid, otherUid]
  const hands = {}
  let nextId = 0
  let cursor = 0
  for (const uid of players) {
    hands[uid] = {}
    for (let i = 0; i < size.hand; i++) hands[uid][nextId++] = bag[cursor++]
  }
  return {
    hostUid,
    players,
    sizeKey,
    startedAt: Date.now(),
    status: 'setup', // tiles dealt face-down until someone calls Split
    pool: bag.slice(cursor).join(''),
    hands,
    nextId,
    peels: 0,
    lastPeelUid: null,
    winnerUid: null,
  }
}

function handOf(match, uid) {
  return match.hands?.[uid] || {}
}

export function handSize(match, uid) {
  return Object.keys(handOf(match, uid)).length
}

// Returns the updated match, or null if the action isn't allowed right now
// (callers treat null as "reject / abort the transaction").
export function reduce(match, action, rand = Math.random) {
  if (!match) return null
  const pool = match.pool || ''
  const next = { ...match, hands: { ...(match.hands || {}) } }

  switch (action.type) {
    case 'split': {
      // Everyone flips their tiles at once and the race begins.
      if (match.status !== 'setup') return null
      next.status = 'playing'
      next.splitBy = action.uid
      return next
    }
    case 'peel': {
      // Everyone draws one; only possible while the pool can cover everybody.
      if (match.status !== 'playing' || pool.length < match.players.length) return null
      let id = match.nextId
      match.players.forEach((uid, i) => {
        next.hands[uid] = { ...handOf(match, uid), [id++]: pool[i] }
      })
      next.nextId = id
      next.pool = pool.slice(match.players.length)
      next.peels = (match.peels || 0) + 1
      next.lastPeelUid = action.uid
      return next
    }
    case 'dump': {
      // Swap one tile for three from the pool.
      const hand = handOf(match, action.uid)
      if (match.status !== 'playing' || !(action.tileId in hand) || pool.length < DUMP_DRAW) return null
      const { [action.tileId]: dumped, ...rest } = hand
      const poolArr = shuffle([...pool.slice(DUMP_DRAW), dumped], rand) // returned tile goes back in
      let id = match.nextId
      const drawn = pool.slice(0, DUMP_DRAW)
      for (const letter of drawn) rest[id++] = letter
      next.hands[action.uid] = rest
      next.nextId = id
      next.pool = poolArr.join('')
      return next
    }
    case 'win': {
      // "Bananas!" — only once the pile can no longer cover a peel.
      if (match.status !== 'playing' || pool.length >= match.players.length) return null
      next.status = 'finished'
      next.winnerUid = action.uid
      return next
    }
    default:
      return null
  }
}

// ---- Board analysis (client-side, honor-system helpers) ----

const key = (x, y) => `${x},${y}`

// placements: { [tileId]: { x, y } }, hand: { [tileId]: letter }
export function analyzeBoard(placements, hand) {
  const cells = new Map()
  for (const [id, pos] of Object.entries(placements)) {
    if (id in hand) cells.set(key(pos.x, pos.y), hand[id])
  }
  const runs = []
  for (const [k, letter] of cells) {
    const [x, y] = k.split(',').map(Number)
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      if (cells.has(key(x - dx, y - dy))) continue // not the start of a run
      let word = letter
      const runCells = [k]
      let cx = x + dx
      let cy = y + dy
      while (cells.has(key(cx, cy))) {
        word += cells.get(key(cx, cy))
        runCells.push(key(cx, cy))
        cx += dx
        cy += dy
      }
      if (word.length >= 2) runs.push({ word, cells: runCells })
    }
  }

  let connected = cells.size > 0
  if (cells.size > 1) {
    const [start] = cells.keys()
    const seen = new Set([start])
    const queue = [start]
    while (queue.length) {
      const [x, y] = queue.pop().split(',').map(Number)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = key(x + dx, y + dy)
        if (cells.has(nk) && !seen.has(nk)) {
          seen.add(nk)
          queue.push(nk)
        }
      }
    }
    connected = seen.size === cells.size
  }

  const placedCount = cells.size
  const total = Object.keys(hand).length
  return { runs, words: runs.map((r) => r.word), connected, placedCount, total, allPlaced: total > 0 && placedCount === total }
}
