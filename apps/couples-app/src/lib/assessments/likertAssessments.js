// Three assessments share one mechanic: agree/disagree statements grouped
// by style, averaged per style, highest average wins. Original questions
// inspired by well-known public psychology frameworks — not a reproduction
// of any specific licensed instrument.
export const LIKERT_ASSESSMENTS = [
  {
    id: 'attachment-style',
    title: 'Attachment Style',
    description: 'How you tend to bond and feel secure in close relationships.',
    styles: [
      { key: 'secure', label: 'Secure' },
      { key: 'anxious', label: 'Anxious' },
      { key: 'avoidant', label: 'Avoidant' },
      { key: 'fearful', label: 'Fearful-Avoidant' },
    ],
    questions: [
      { id: 'att-1', styleKey: 'secure', text: 'I find it easy to depend on my partner and have them depend on me.' },
      {
        id: 'att-2',
        styleKey: 'secure',
        text: "I'm comfortable being close to my partner without worrying about losing my independence.",
      },
      { id: 'att-3', styleKey: 'anxious', text: "I often worry my partner doesn't love me as much as I love them." },
      { id: 'att-4', styleKey: 'anxious', text: 'I need frequent reassurance that my partner cares about me.' },
      {
        id: 'att-5',
        styleKey: 'avoidant',
        text: 'I prefer to handle problems on my own rather than lean on my partner.',
      },
      { id: 'att-6', styleKey: 'avoidant', text: 'I feel uncomfortable when my partner wants to get too close.' },
      { id: 'att-7', styleKey: 'fearful', text: "I want to be close to my partner, but I'm afraid of getting hurt." },
      { id: 'att-8', styleKey: 'fearful', text: 'I have mixed feelings about being emotionally close to my partner.' },
    ],
  },
  {
    id: 'communication-style',
    title: 'Communication Style',
    description: 'How you tend to express needs and handle friction day-to-day.',
    styles: [
      { key: 'assertive', label: 'Assertive' },
      { key: 'passive', label: 'Passive' },
      { key: 'aggressive', label: 'Aggressive' },
      { key: 'passive-aggressive', label: 'Passive-Aggressive' },
    ],
    questions: [
      {
        id: 'comm-1',
        styleKey: 'assertive',
        text: 'I express my needs directly and respectfully, even when it\'s uncomfortable.',
      },
      { id: 'comm-2', styleKey: 'assertive', text: 'I can say no without feeling guilty.' },
      {
        id: 'comm-3',
        styleKey: 'passive',
        text: 'I often go along with what my partner wants, even if I disagree.',
      },
      { id: 'comm-4', styleKey: 'passive', text: "I have trouble expressing my needs until I'm overwhelmed." },
      { id: 'comm-5', styleKey: 'aggressive', text: "I tend to raise my voice or get sharp when I'm frustrated." },
      {
        id: 'comm-6',
        styleKey: 'aggressive',
        text: 'I find myself trying to win arguments rather than resolve them.',
      },
      {
        id: 'comm-7',
        styleKey: 'passive-aggressive',
        text: "I sometimes give the silent treatment instead of saying what's bothering me.",
      },
      {
        id: 'comm-8',
        styleKey: 'passive-aggressive',
        text: 'I express frustration through sarcasm or subtle jabs rather than saying it directly.',
      },
    ],
  },
  {
    id: 'conflict-resolution',
    title: 'Conflict Resolution Style',
    description: 'What you naturally reach for when you and your partner disagree.',
    styles: [
      { key: 'competing', label: 'Competing' },
      { key: 'collaborating', label: 'Collaborating' },
      { key: 'compromising', label: 'Compromising' },
      { key: 'avoiding', label: 'Avoiding' },
      { key: 'accommodating', label: 'Accommodating' },
    ],
    questions: [
      { id: 'conf-1', styleKey: 'competing', text: 'In an argument, I want to make sure my point of view wins.' },
      { id: 'conf-2', styleKey: 'competing', text: 'I hold firm to my position even when my partner pushes back.' },
      {
        id: 'conf-3',
        styleKey: 'collaborating',
        text: 'I try to find a solution that fully satisfies both of us, even if it takes longer.',
      },
      {
        id: 'conf-4',
        styleKey: 'collaborating',
        text: 'I see conflict as a chance to understand each other better.',
      },
      { id: 'conf-5', styleKey: 'compromising', text: 'I look for a middle ground where we both give a little.' },
      {
        id: 'conf-6',
        styleKey: 'compromising',
        text: "I'd rather settle quickly with a fair trade-off than keep debating.",
      },
      {
        id: 'conf-7',
        styleKey: 'avoiding',
        text: "I'd rather let an issue go than bring up something that might start a fight.",
      },
      { id: 'conf-8', styleKey: 'avoiding', text: 'I tend to postpone difficult conversations until later.' },
      {
        id: 'conf-9',
        styleKey: 'accommodating',
        text: "I often give in to keep the peace, even if I don't fully agree.",
      },
      {
        id: 'conf-10',
        styleKey: 'accommodating',
        text: "My partner's comfort matters more to me than winning the point.",
      },
    ],
  },
]

export const LIKERT_SCALE = [
  { value: 1, label: 'Strongly disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly agree' },
]

export function scoreLikert(questions, answers) {
  const totals = {}
  const counts = {}
  for (const q of questions) {
    const value = answers[q.id]
    if (value == null) continue
    totals[q.styleKey] = (totals[q.styleKey] || 0) + value
    counts[q.styleKey] = (counts[q.styleKey] || 0) + 1
  }
  const scores = {}
  for (const key of Object.keys(totals)) {
    scores[key] = totals[key] / counts[key]
  }
  const primary = Object.keys(scores).reduce(
    (best, key) => (best === null || scores[key] > scores[best] ? key : best),
    null,
  )
  return { scores, primary }
}
