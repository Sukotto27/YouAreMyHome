// Cards Against Couples — a two-player, no-judge, no-score take on the
// fill-in-the-blank card game. Each round both players get the same prompt,
// secretly play one answer card from their hand, and both answers are
// revealed together. Pure rules + card text here (no React/Firebase), same
// pattern as lib/bananagrams.js: one reducer drives both the Realtime
// Database transaction and the local demo mode.
//
// Prompts with "____" get the answer dropped into the blank; prompts that are
// questions just show the answer beneath them.
export const BLANK = '____'
export const HAND_SIZE = 7

export const PROMPTS = [
  'The real reason we are always late is ____.',
  'My love language is ____.',
  'Our most frequent argument is secretly about ____.',
  'On our next date night, I want ____.',
  "Nothing says “I love you” like ____.",
  'The first thing I noticed about you was ____.',
  "If our relationship had a theme song, it would be ____.",
  'The way to my heart is ____.',
  'I pretend to like ____ just to make you happy.',
  "In 50 years, we'll still be arguing about ____.",
  "Tonight's dinner is cancelled because of ____.",
  'My secret talent is ____.',
  'You could never leave me because of ____.',
  'Honey, we need to talk about ____.',
  'Why do I put up with you? ____.',
  'The last thing I want to hear during a romantic moment is ____.',
  'My idea of a perfect lazy Sunday is ____.',
  'Behind every great couple is ____.',
  "I'd sacrifice anything for you, except ____.",
  'This relationship would fall apart without ____.',
  'The most romantic thing you have ever done was ____.',
  'We never remember to buy ____ at the store.',
  'Your most annoying habit is ____, and I secretly love it.',
  'On our honeymoon, we will mostly be doing ____.',
  'Instead of flowers, I got you ____.',
  'My toxic trait is ____.',
  "Our couples' therapist says the real problem is ____.",
  "When you're mad at me, I know it's because of ____.",
  "The group chat doesn't know about ____.",
  'Our next vacation: ____!',
  'Why are you smiling like that? ____.',
  'The thermostat war is really about ____.',
  "I'd trade you for ____. (Just kidding.)",
  "Babe, don't be mad, but ____.",
  'I knew you were the one when I saw ____.',
  'The most embarrassing thing in our camera roll is ____.',
  "Our wedding toast should definitely mention ____.",
  "I'm only pretending to listen when you talk about ____.",
  'Our house rules: no ____ after 10 p.m.',
  'Coming soon to our living room: ____.',
  'What would our reality show be called?',
  "What's the weirdest thing we've ever done together?",
  "What's the best thing about waking up next to me?",
  "What's something you secretly love about us?",
  'What should we name our future pet?',
  'What do you want carved on our anniversary cake?',
  "What's the most chaotic thing we could do on a Tuesday?",
  'What is the dumbest thing we have ever fought about?',
  'What would you be like as my personal assistant?',
  'What are we absolutely not allowed to bring up at your family dinner?',
]

export const ANSWERS = [
  'Stealing the blankets',
  'Your ice-cold feet',
  'Loudly chewing ice',
  'An unreasonable number of throw pillows',
  'Leaving one sip of milk in the carton',
  'Spooning, but aggressively',
  'A passive-aggressive sticky note',
  'The last slice of pizza',
  'Our shared playlist',
  'Matching pajamas',
  'Googling symptoms at 2 a.m.',
  'A suspicious amount of snacks',
  "Your mother's opinion",
  'Saying “I’m fine”',
  'Whatever you’re having',
  'Dishes in the sink for three days',
  'A mildly threatening love note',
  'Wet towels on the bed',
  'Breakfast in bed (crumbs included)',
  'Napping instead of adulting',
  'A tiny dramatic sigh',
  'Unsolicited back massages',
  'Cereal for dinner',
  'Dancing in the kitchen',
  'Forehead kisses',
  'A very long hug',
  'That one embarrassing nickname',
  'Forgetting where we parked',
  'Your “five more minutes”',
  'Binge-watching until sunrise',
  'Buying a plant we will definitely kill',
  'Being hangry',
  'Seventeen unread texts',
  'Cuddling during a horror movie',
  'Spoiling the ending',
  'Singing in the shower, off-key',
  'A questionable tattoo idea',
  'A full-on tickle fight',
  'Snoring like a chainsaw',
  'Hogging the remote',
  'An oddly specific pizza order',
  'Stealing fries off my plate',
  'Sneaking dessert before dinner',
  'Pretending to be asleep',
  'Aggressively competitive board games',
  'A spontaneous road trip',
  'Impromptu karaoke',
  'Cold pizza for breakfast',
  'Dad jokes',
  'Arguing about directions',
  'Blaming the dog',
  'Dramatic reenactments',
  'A fort made entirely of pillows',
  'Wearing your hoodie forever',
  'The good side of the bed',
  'Chaotic good energy',
  'Awkward silences',
  'Texting “k”',
  'A weirdly passionate debate about pineapple pizza',
  'Emotional support snacks',
  'Midnight fridge raids',
  'Crying at commercials',
  'Lukewarm coffee',
  'A pile of laundry we call “the chair”',
  'Mismatched socks',
  'Slow dancing in our socks',
  'Mystery leftovers',
  'Your questionable parallel parking',
  'Over-explaining the plot of a movie',
  'Saying “we should totally do that” and never doing it',
  'A trip to IKEA (and the fight after)',
  'Our dumbest inside joke',
  'Making out in the car',
  'A hickey we will blame on allergies',
  'A bubble bath for two',
  'Whispering sweet nothings',
  'A spontaneous kiss in the grocery store',
  'A weekend with absolutely no plans',
  'Foot rubs, with strings attached',
  'Sending a spicy text to the wrong chat',
  'Role-playing as pirates',
  'Very serious pillow talk',
  'Morning breath',
  'A candlelit dinner (microwaved)',
  'Handcuffs from the costume drawer',
  'The look you give me across the room',
  'A tragic haircut',
  'Eight alarms and zero waking up',
  "Accidentally saying your ex's name",
  'Doing taxes together',
  'A sassy voicemail',
  'Crumbs in the bed',
  'The cold side of the pillow',
  'A mildly dramatic eye roll',
  'Making fun of my cooking',
  'Falling asleep mid-sentence',
  'Sliding across the kitchen floor in socks',
  'Terrible pick-up lines',
  'Puns nobody asked for',
  'Whispered promises',
  'Being the little spoon',
  'Being the big spoon',
  'A sunset I pretended to care about',
  'Taking forever to pick a restaurant',
  '“I’m not mad” (I’m mad)',
  'A cheesy anniversary card',
  'Googling “how to fix this”',
  'A surprise party that was not a surprise',
  'Picking out a couples’ costume',
  'Hiding snacks from each other',
  'Snuggling the dog instead of me',
  'Third-wheeling the cat',
  'Reading the last page first',
  'Sharing a toothbrush (accidentally)',
  'Skinny dipping',
  'A very awkward family photo',
  'A hot tub of regret',
  'Matching tattoos in a bad font',
  'Making a pact to be 90 and still silly',
]

function shuffle(items, rand = Math.random) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function promptForRound(match) {
  const order = match.promptOrder
  return PROMPTS[order[(match.round - 1) % order.length]]
}

export function answerText(index) {
  return ANSWERS[index]
}

// Splits a prompt around its blank so the UI can highlight the filled-in
// answer. Question prompts (no blank) come back with `before` only.
export function splitPrompt(prompt) {
  const at = prompt.indexOf(BLANK)
  if (at === -1) return { before: prompt, after: null }
  return { before: prompt.slice(0, at), after: prompt.slice(at + BLANK.length) }
}

export function newMatch(hostUid, otherUid, rand = Math.random) {
  const players = [hostUid, otherUid]
  const answerOrder = shuffle(ANSWERS.map((_, i) => i), rand)
  const hands = {}
  let cursor = 0
  for (const uid of players) {
    hands[uid] = answerOrder.slice(cursor, cursor + HAND_SIZE)
    cursor += HAND_SIZE
  }
  return {
    hostUid,
    players,
    promptOrder: shuffle(PROMPTS.map((_, i) => i), rand),
    answerOrder,
    cursor,
    hands,
    round: 1,
    phase: 'pick', // 'pick' | 'reveal'
    picks: null,
    ready: null,
    reactions: null,
  }
}

// Returns the updated match, or null if the action isn't allowed right now.
export function reduce(match, action) {
  if (!match) return null
  const picks = match.picks || {}
  const ready = match.ready || {}

  switch (action.type) {
    case 'play': {
      const hand = match.hands?.[action.uid] || []
      if (match.phase !== 'pick' || action.uid in picks || !hand.includes(action.card)) return null
      const nextPicks = { ...picks, [action.uid]: action.card }
      const both = match.players.every((uid) => uid in nextPicks)
      return { ...match, picks: nextPicks, phase: both ? 'reveal' : 'pick' }
    }
    case 'react': {
      if (match.phase !== 'reveal') return null
      return { ...match, reactions: { ...(match.reactions || {}), [action.uid]: action.emoji } }
    }
    case 'ready': {
      if (match.phase !== 'reveal') return null
      const nextReady = { ...ready, [action.uid]: true }
      if (!match.players.every((uid) => nextReady[uid])) return { ...match, ready: nextReady }

      // Both ready: discard the played cards, deal replacements, next prompt.
      const hands = {}
      let cursor = match.cursor
      for (const uid of match.players) {
        const hand = [...(match.hands?.[uid] || [])]
        const played = hand.indexOf(picks[uid])
        if (played !== -1) hand.splice(played, 1)
        hand.push(match.answerOrder[cursor % match.answerOrder.length])
        cursor += 1
        hands[uid] = hand
      }
      return { ...match, hands, cursor, round: match.round + 1, phase: 'pick', picks: null, ready: null, reactions: null }
    }
    default:
      return null
  }
}
