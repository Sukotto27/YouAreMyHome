// Definitions for the two flavors of "Send Love" note (see useLoveNotes and
// SendLoveMenu). `message` is a function of the sender's name so the exact
// wording lives in one place, used both for the in-app popup and (via the
// stored `message` field) the push notification body.
export const KISS_KINDS = {
  goodMorning: {
    emoji: '😘',
    label: 'Good morning kiss',
    message: (name) => `${name} sent you a good morning kiss!`,
  },
  goodNight: {
    emoji: '😘',
    label: 'Goodnight kiss',
    message: (name) => `${name} sent you a goodnight kiss!`,
  },
}

// Before noon reads as "good morning," everything else as "goodnight" —
// there's no third "good afternoon" option in the UI, so the day just splits
// in two.
export function currentKissKind() {
  return new Date().getHours() < 12 ? 'goodMorning' : 'goodNight'
}

// Each of these is limited to once per day per kind (see useLoveNotes'
// `usedToday`) — unlike the kiss, which can be sent any time.
export const LOVE_NOTE_KINDS = {
  thinking: {
    emoji: '💭',
    label: 'Thinking of you',
    message: (name) => `${name} is thinking of you 💭`,
  },
  wishYouWereHere: {
    emoji: '🏡',
    label: 'Wish you were here',
    message: (name) => `${name} wishes you were here 🏡`,
  },
  missYou: {
    emoji: '🥺',
    label: 'I miss you',
    message: (name) => `${name} misses you 🥺`,
  },
}

export function kindDef(category, kind) {
  return category === 'kiss' ? KISS_KINDS[kind] : LOVE_NOTE_KINDS[kind]
}
