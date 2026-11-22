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
  // added later: append-only, saved matches refer to cards by index
  "What's that smell?",
  "What ended my last diet?",
  "What's the next big thing at the Olympics?",
  "What did I find in the back of the fridge?",
  "What's the worst thing to hear from your dentist?",
  "What's my guilty pleasure?",
  "What gets better with age?",
  "What would grandma find disturbing, yet oddly charming?",
  "What's the secret ingredient in my famous chili?",
  "What did the raccoon in our yard run off with?",
  "What will they find in my browser history after I'm gone?",
  "What did I just get banned from the library for?",
  "What's the real reason the dinosaurs died out?",
  "What's the worst possible thing to yell on a crowded elevator?",
  "What's the first rule of Fight Club in our house?",
  "What do I keep in my glove compartment?",
  "What's the worst name for a boat?",
  "What's the most overrated thing on a first date?",
  "What's the CEO's secret to success?",
  "What did the fortune cookie say this time?",
  "A wise man once said: ____.",
  "The new self-help bestseller is called “Get Rich With ____.”",
  "Breaking news: scientists have finally discovered ____.",
  "I never go anywhere without ____.",
  "I got fired from my last job because of ____.",
  "The mayor just declared ____ the official city mascot.",
  "My therapist says I should stop bringing ____ up at parties.",
  "Step 1: ____. Step 2: profit.",
  "The airline lost my luggage, but at least I still have ____.",
  "No one told me ____ was a requirement for adulthood.",
  "The kids' menu now comes with ____.",
  "Ladies and gentlemen, the cause of the delay is ____.",
  "In a shocking twist, the butler did it with ____.",
  "I bring ____ to every potluck, and I'm not sorry.",
  "In the future, all cars will be powered by ____.",
  "Welcome to Costco. I love you. Would you like to try ____?",
  "The one thing I would save from a burning building is ____.",
  "Science says ____ is the key to a long life.",
  "Next on the Food Network: ____ Wars.",
  "My only New Year's resolution is ____.",
  "Why am I sticky? ____.",
  "The haunted house was scary until I found out it was ____.",
  "According to the HR department, ____ is not appropriate for the office.",
  "Please do not feed the animals ____.",
  "Back in my day, we had ____ and we liked it.",
  "My evil twin's only weakness is ____.",
  "I would walk 500 miles for ____.",
  "The secret to a good nap is ____.",
  "The sign on the bathroom door said, “Out of order because of ____.”",
  "The GPS keeps rerouting us because of ____.",
  // nerd expansion (LOTR, Harry Potter, Marvel, Zelda; the franchises hidden in Our Little Paradise): append-only
  "One does not simply ____.",
  "Gandalf's real reason for showing up late was ____.",
  "The Fellowship's group chat is mostly about ____.",
  "The Shire's top export is ____.",
  "Sauron's secret weakness is ____.",
  "What did Gollum do with the precious this time?",
  "Second breakfast, third breakfast, and now ____.",
  "The eagles could have flown us to Mordor, but they were busy with ____.",
  "Frodo's therapist says the real burden is ____.",
  "The Sorting Hat took one look at me and said ____.",
  "The newest class at Hogwarts: Defense Against ____.",
  "What's the real reason Snape hates us?",
  "Fred and George's latest invention is ____.",
  "The Room of Requirement just turned into ____.",
  "I would trade my wand for ____.",
  "Dumbledore's final prank was ____.",
  "The Marauder's Map just revealed ____.",
  "The Weasley twins got detention for ____.",
  "I am Iron Man, and I am powered by ____.",
  "Thanos snapped his fingers and suddenly there was ____.",
  "The Avengers have a strict no ____ policy in the tower.",
  "Doctor Strange saw 14 million futures, and every one included ____.",
  "I can do this all day, but not ____.",
  "What does Groot say after learning how to ____?",
  "Tony Stark's next billion-dollar invention: ____.",
  "The Hulk is only angry because of ____.",
  "What did Thor bring to Earth this time?",
  "Nick Fury has been secretly monitoring ____.",
  "It's dangerous to go alone! Take ____.",
  "Link opened a chest and got ____.",
  "Hey! Listen! ____!",
  "Why is Epona stuck in the lake? ____.",
  "I've spent 200 hours in Hyrule and all I have is ____.",
  "Cucco revenge was caused by ____.",
  "What did Link find in every pot?",
  "The Master Sword is stuck in the stone because of ____.",
  "Korok seeds are actually ____.",
  "Princess Zelda's next big research project: ____.",
  "In a battle of nerds, my secret weapon is ____.",
  "My Comic-Con cosplay was ruined by ____.",
  "Roll for initiative: you are attacked by ____.",
  "The prophecy foretold of ____.",
  "I would give up the One Ring for ____.",
  "Tonight's movie marathon will be interrupted by ____.",
  "My fantasy kingdom's national anthem is about ____.",
  "The chosen one has been chosen for ____.",
  "In the next trailer: a dark secret about ____.",
  "Our nerdy couple name is ____.",
  // Life is Strange: append-only
  "Max rewound time just to avoid ____.",
  "Chloe's bedroom wall is covered in ____.",
  "Blackwell Academy's newest scandal involves ____.",
  "Hella ____, dude.",
  "The Prescott family's dark secret is ____.",
  "Max's Polaroid captured ____.",
  "The storm in Arcadia Bay was caused by ____.",
  "What did Chloe do to Principal Wells' car?",
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
  // added later: append-only
  "A tiny, angry goose",
  "Aggressively average karaoke",
  "A raccoon in a trench coat",
  "Dad jokes at a funeral",
  "Whatever is in Gary's cooler",
  "A cursed Furby",
  "Three hamsters in a trench coat",
  "An overly firm handshake",
  "A mild case of the Mondays",
  "Free samples, but all of them",
  "A suspiciously warm chair",
  "Passive-aggressive yodeling",
  "Emotional support nachos",
  "Eleven unread group chats",
  "A haunted Roomba",
  "The wrong twin",
  "Arguing with a self-checkout machine",
  "Pretending to know wine",
  "A very confident pigeon",
  "Crying in the Target parking lot",
  "A comically large spoon",
  "Sneezing at the worst possible moment",
  "A 45-minute voicemail",
  "Competitive napping",
  "My ex's new haircut",
  "Fourteen open browser tabs",
  "An uncomfortably long hug",
  "Beige",
  "Ordering dessert first",
  "A walrus with a mortgage",
  "Bubble wrap, popped in public",
  "Unsolicited life advice from a toddler",
  "The ghost of a Blockbuster",
  "A flaming bag of expired coupons",
  "Inexplicably owning a unicycle",
  "Tax season",
  "A sentient toaster",
  "Yelling “NICE” at strangers",
  "A casserole of unknown origin",
  "Reply-all",
  "Karen from accounting",
  "Sweatpants with a zipper",
  "The Wi-Fi password",
  "Wearing socks with sandals, confidently",
  "A very polite burglar",
  "Fake it till you make it",
  "The entire cheese aisle",
  "A pirate with a spreadsheet",
  "An unlicensed bounce house",
  "Laughing at my own joke first",
  "Questionable gas station sushi",
  "A tragic piñata accident",
  "Interpretive dance, uninvited",
  "The last working pen",
  "Seventeen identical phone chargers",
  "Googling “is this normal?”",
  "A fridge full of condiments",
  "Moonwalking into a meeting",
  "Murder podcasts at bedtime",
  "A sloth with a dream",
  "Reheated fish in the office microwave",
  "A small, ungrateful horse",
  "Parallel parking, but emotionally",
  "Accidentally liking a photo from 2014",
  // nerd expansion: append-only
  "Second breakfast",
  "Pipe-weed",
  "An eagle that showed up too late",
  "A very dramatic ring",
  "Elevenses",
  "Gollum's fish",
  "Boiled potatoes",
  "Gandalf's pointy hat",
  "A balrog on a Monday",
  "The Eye of Sauron, but make it creepy",
  "Walking to Mordor, barefoot",
  "A suspiciously long extended edition",
  "Tom Bombadil, unexplained",
  "A dwarf with a battle axe and no chill",
  "Legolas surfing on a shield",
  "A Sorting Hat with trust issues",
  "Butterbeer foam moustache",
  "A Hippogriff with attitude",
  "Peeves, causing chaos",
  "A Weasley sweater",
  "A Howler in public",
  "Seven Horcruxes and a dream",
  "A very strict house elf",
  "Unlimited Bertie Bott's Every Flavour Beans",
  "A Quidditch injury",
  "Wingardium Leviosa, pronounced wrong",
  "The Whomping Willow",
  "A time-turner and poor decisions",
  "Parseltongue at dinner",
  "A love potion, accidentally",
  "An Infinity Gauntlet made of foam",
  "Shawarma after the apocalypse",
  "Groot, saying the same thing again",
  "A very passive-aggressive Nick Fury",
  "A Hulk-sized tantrum",
  "Thor's hammer, but I can't lift it",
  "A snap that goes wrong",
  "Spider-Man hanging upside down for no reason",
  "A Vibranium spoon",
  "Loki's “glorious purpose”",
  "A multiverse of me, all arguing",
  "Cap's shield, used as a frisbee",
  "Rocket Raccoon's enormous gun",
  "Iron Man's sassy AI",
  "A wormhole in the kitchen",
  "A pot full of rupees",
  "A really loud Cucco",
  "Epona, stuck on a fence",
  "A Korok seed up my nose",
  "The Triforce, divided unevenly",
  "A fairy in a bottle",
  "Hylian shield surfing",
  "The Master Sword, in the wrong stone",
  "Talking to a Deku Tree",
  "A heart container, unprompted",
  "Navi, saying “Hey! Listen!”",
  "Hearts dropped from grass",
  "A chest with only 5 rupees",
  "Bomb flowers",
  "Ocarina solos at midnight",
  "A natural 20 at the worst time",
  "A character sheet longer than the book",
  "A lightsaber that's just a flashlight",
  "A 4-hour director's cut",
  "An unnecessarily epic montage",
  "A sidequest I'll never finish",
  "Gatekeeping my favorite fandom",
  "The One Ring, wedding edition",
  "A bard, singing about me",
  "A cosplay that took six months",
  // Life is Strange: append-only
  "A Polaroid, taken at the worst time",
  "Rewinding just to hear it again",
  "Chloe's “hella” everything",
  "A butterfly with bad intentions",
  "Hella rewinding",
  "A bottle on the junkyard fence",
  "Blackwell's dumbest rule",
  "A tornado with a vendetta",
  "A mysterious blue butterfly",
  "Sharing one pair of headphones with Chloe",
  "Mark Jefferson's photo studio, avoided",
  "A very sassy Rachel Amber poster",
]

function shuffle(items, rand = Math.random) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function promptIndexForRound(match) {
  const order = match.promptOrder
  return order[(match.round - 1) % order.length]
}

export function promptForRound(match) {
  return PROMPTS[promptIndexForRound(match)]
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
    comments: null,
  }
}

// A finished round as plain text, kept in `match.log` and filed in game
// history when the match ends or is restarted.
export function roundRecord(match) {
  const answers = {}
  for (const [uid, card] of Object.entries(match.picks || {})) answers[uid] = answerText(card)
  return { prompt: promptForRound(match), answers, comments: match.comments || {} }
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
    case 'comment': {
      if (match.phase !== 'reveal') return null
      const text = String(action.text || '').trim().slice(0, 300)
      const comments = { ...(match.comments || {}) }
      if (text) comments[action.uid] = text
      else delete comments[action.uid]
      return { ...match, comments: Object.keys(comments).length ? comments : null }
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
      return {
        ...match,
        hands,
        cursor,
        round: match.round + 1,
        phase: 'pick',
        picks: null,
        ready: null,
        reactions: null,
        comments: null,
        log: [...(match.log || []), roundRecord(match)],
      }
    }
    default:
      return null
  }
}
