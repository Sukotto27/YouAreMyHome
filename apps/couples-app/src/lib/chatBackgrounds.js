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

export const DEFAULT_CHAT_BACKGROUND = { type: 'preset', id: CHAT_BACKGROUNDS[0].id }

// `background` is either { type: 'preset', id } or { type: 'photo', url } (a
// gallery photo's data URL). Falls back to the default preset if the chosen
// preset id no longer exists.
export function backgroundStyleFor(background) {
  if (background?.type === 'photo' && background.url) {
    return {
      backgroundImage: `url(${background.url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  const id = background?.type === 'preset' ? background.id : DEFAULT_CHAT_BACKGROUND.id
  return (
    CHAT_BACKGROUNDS.find((bg) => bg.id === id)?.style ??
    CHAT_BACKGROUNDS.find((bg) => bg.id === DEFAULT_CHAT_BACKGROUND.id).style
  )
}
