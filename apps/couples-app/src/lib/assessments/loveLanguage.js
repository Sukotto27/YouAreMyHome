// Chapman's 5 love languages, as a forced-choice quiz — 10 pairs, one for
// every combination of the 5 categories, so each category appears in
// exactly 4 pairs (max possible score per category = 4).
export const LOVE_LANGUAGE = {
  id: 'love-language',
  title: 'Love Language',
  description: 'How you most naturally feel loved — based on Gary Chapman\'s 5 love languages.',
  categories: [
    { key: 'words', label: 'Words of Affirmation' },
    { key: 'time', label: 'Quality Time' },
    { key: 'gifts', label: 'Receiving Gifts' },
    { key: 'service', label: 'Acts of Service' },
    { key: 'touch', label: 'Physical Touch' },
  ],
}

const PROMPT = 'I feel most loved when...'

export const LOVE_LANGUAGE_PAIRS = [
  { id: 'll-1', a: { key: 'words', text: 'you tell me how much you appreciate me' }, b: { key: 'time', text: 'we spend uninterrupted time together' } },
  { id: 'll-2', a: { key: 'words', text: 'you compliment me or say something kind' }, b: { key: 'gifts', text: 'you surprise me with a thoughtful gift' } },
  { id: 'll-3', a: { key: 'words', text: "you tell me you're proud of me" }, b: { key: 'service', text: 'you take care of something for me without being asked' } },
  { id: 'll-4', a: { key: 'words', text: "you say \"I love you\" out loud" }, b: { key: 'touch', text: 'you hold my hand or hug me' } },
  { id: 'll-5', a: { key: 'time', text: 'we do something together, just the two of us' }, b: { key: 'gifts', text: 'you bring home something that reminds you of me' } },
  { id: 'll-6', a: { key: 'time', text: 'we set aside time with no distractions' }, b: { key: 'service', text: "you help me finish something I've been putting off" } },
  { id: 'll-7', a: { key: 'time', text: "we're fully present with each other" }, b: { key: 'touch', text: "we're physically close, even just sitting together" } },
  { id: 'll-8', a: { key: 'gifts', text: 'you give me something you picked out just for me' }, b: { key: 'service', text: 'you do something practical to make my day easier' } },
  { id: 'll-9', a: { key: 'gifts', text: 'you hand me something thoughtful you got for me' }, b: { key: 'touch', text: 'you reach for my hand or pull me in for a hug' } },
  { id: 'll-10', a: { key: 'service', text: "you handle a chore so I don't have to" }, b: { key: 'touch', text: "you're affectionate with me physically" } },
]

export const LOVE_LANGUAGE_PROMPT = PROMPT

export function scoreLoveLanguage(pairs, answers) {
  const scores = {}
  for (const pair of pairs) {
    const chosenKey = answers[pair.id]
    if (!chosenKey) continue
    scores[chosenKey] = (scores[chosenKey] || 0) + 1
  }
  const primary = Object.keys(scores).reduce(
    (best, key) => (best === null || scores[key] > scores[best] ? key : best),
    null,
  )
  return { scores, primary }
}
