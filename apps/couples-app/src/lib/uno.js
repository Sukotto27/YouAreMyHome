// Standard 108-card Uno deck, played 2-player. With only two players, Skip
// and Reverse are functionally identical (the "next" player is always the
// same one), so both just return the turn to whoever played the card.
export const COLORS = ['red', 'yellow', 'green', 'blue']

function makeCard(color, value, n) {
  return { id: `${color}-${value}-${n}`, color, value }
}

function buildDeck() {
  const deck = []
  let n = 0
  for (const color of COLORS) {
    deck.push(makeCard(color, '0', n++))
    for (let v = 1; v <= 9; v++) {
      deck.push(makeCard(color, String(v), n++))
      deck.push(makeCard(color, String(v), n++))
    }
    for (const action of ['skip', 'reverse', 'draw2']) {
      deck.push(makeCard(color, action, n++))
      deck.push(makeCard(color, action, n++))
    }
  }
  for (let i = 0; i < 4; i++) deck.push(makeCard('black', 'wild', n++))
  for (let i = 0; i < 4; i++) deck.push(makeCard('black', 'wild4', n++))
  return deck
}

function shuffle(cards) {
  const a = [...cards]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Deals a fresh 2-player game: 7 cards each, then flips a starting discard
// card — reshuffling and retrying if that flip is a wild or action card, so
// the very first turn always behaves like an ordinary one instead of needing
// special-cased "who does the opening skip/draw effect apply to" logic.
export function dealGame(myUid, partnerUid, startingUid) {
  let deck = shuffle(buildDeck())
  const hands = { [myUid]: [], [partnerUid]: [] }
  for (let i = 0; i < 7; i++) {
    hands[myUid].push(deck.pop())
    hands[partnerUid].push(deck.pop())
  }

  let topCard = deck.pop()
  while (topCard.color === 'black' || ['skip', 'reverse', 'draw2'].includes(topCard.value)) {
    deck = shuffle([...deck, topCard])
    topCard = deck.pop()
  }

  return {
    deck,
    discard: [topCard],
    hands,
    currentTurnUid: startingUid,
    currentColor: topCard.color,
    drawnThisTurn: false,
    awaitingColor: false,
    awaitingColorUid: null,
    status: 'playing',
    winnerUid: null,
  }
}

export function canPlayCard(card, topCard, currentColor) {
  if (card.color === 'black') return true
  return card.color === currentColor || card.value === topCard.value
}

// Draws `count` cards, reshuffling the discard pile (minus its top card)
// back into the deck if it runs dry mid-draw.
function takeCards(deck, discard, count) {
  let d = [...deck]
  let pile = [...discard]
  const taken = []
  for (let i = 0; i < count; i++) {
    if (d.length === 0) {
      if (pile.length <= 1) break
      const top = pile[pile.length - 1]
      d = shuffle(pile.slice(0, -1))
      pile = [top]
    }
    taken.push(d.pop())
  }
  return { deck: d, discard: pile, taken }
}

function resolveEffect(game, actingUid, rivalUid, card, chosenColor) {
  const currentColor = card.color === 'black' ? chosenColor : card.color
  let { deck, discard, hands } = game
  let nextTurnUid = rivalUid

  if (card.value === 'skip' || card.value === 'reverse') {
    nextTurnUid = actingUid
  } else if (card.value === 'draw2' || card.value === 'wild4') {
    const taken = takeCards(deck, discard, card.value === 'draw2' ? 2 : 4)
    deck = taken.deck
    discard = taken.discard
    hands = { ...hands, [rivalUid]: [...hands[rivalUid], ...taken.taken] }
    nextTurnUid = actingUid
  }

  return {
    ...game,
    deck,
    discard,
    hands,
    currentColor,
    currentTurnUid: nextTurnUid,
    drawnThisTurn: false,
    awaitingColor: false,
    awaitingColorUid: null,
  }
}

// Plays `cardId` from actingUid's hand. Returns the SAME `game` reference
// (not a clone) when the play is illegal, so callers can cheaply detect a
// no-op with `next === game`. Wild cards stop short of resolveEffect and
// instead set awaitingColor, since the color choice is a separate step.
export function playCard(game, actingUid, rivalUid, cardId, chosenColor) {
  const hand = game.hands[actingUid]
  const card = hand.find((c) => c.id === cardId)
  if (!card) return game
  const topCard = game.discard[game.discard.length - 1]
  if (!canPlayCard(card, topCard, game.currentColor)) return game

  const hands = { ...game.hands, [actingUid]: hand.filter((c) => c.id !== cardId) }
  const discard = [...game.discard, card]

  if (hands[actingUid].length === 0) {
    return { ...game, hands, discard, status: 'finished', winnerUid: actingUid, awaitingColor: false, awaitingColorUid: null }
  }

  if (card.color === 'black' && !chosenColor) {
    return { ...game, hands, discard, awaitingColor: true, awaitingColorUid: actingUid }
  }

  return resolveEffect({ ...game, hands, discard }, actingUid, rivalUid, card, chosenColor)
}

export function chooseColor(game, actingUid, rivalUid, color) {
  if (!game.awaitingColor || game.awaitingColorUid !== actingUid) return game
  const card = game.discard[game.discard.length - 1]
  return resolveEffect(game, actingUid, rivalUid, card, color)
}

export function drawCard(game, actingUid) {
  const taken = takeCards(game.deck, game.discard, 1)
  return {
    ...game,
    deck: taken.deck,
    discard: taken.discard,
    hands: { ...game.hands, [actingUid]: [...game.hands[actingUid], ...taken.taken] },
    drawnThisTurn: true,
  }
}

export function passTurn(game, actingUid, rivalUid) {
  return { ...game, currentTurnUid: rivalUid, drawnThisTurn: false }
}
