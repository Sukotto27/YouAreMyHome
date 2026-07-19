export const CHAT_BACKGROUNDS = [
  { id: 'paper', name: 'Paper', style: { backgroundColor: '#fbf2e9' } },
  { id: 'blush', name: 'Blush', style: { backgroundColor: '#fbdad7' } },
  { id: 'sky', name: 'Sky', style: { backgroundColor: '#e4f0ef' } },
  { id: 'dusk', name: 'Dusk', style: { backgroundColor: '#efe6ec' } },
  {
    id: 'dotted',
    name: 'Dotted',
    style: {
      backgroundColor: '#fbf2e9',
      backgroundImage: 'radial-gradient(rgba(54,37,33,0.14) 1px, transparent 1px)',
      backgroundSize: '14px 14px',
    },
  },
  {
    id: 'hearts',
    name: 'Hearts',
    style: {
      backgroundColor: '#fbf2e9',
      backgroundImage:
        "radial-gradient(rgba(226,125,122,0.16) 40%, transparent 42%), radial-gradient(rgba(226,125,122,0.16) 40%, transparent 42%)",
      backgroundSize: '28px 28px',
      backgroundPosition: '0 0, 14px 14px',
    },
  },
]

export const DEFAULT_CHAT_BACKGROUND = CHAT_BACKGROUNDS[0].id
const STORAGE_KEY = 'you-are-my-home:chat-bg'

export function getSavedChatBackground() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_CHAT_BACKGROUND
  } catch {
    return DEFAULT_CHAT_BACKGROUND
  }
}

export function saveChatBackground(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // localStorage unavailable — background choice just won't persist
  }
}
