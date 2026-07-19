// Reuses the app's existing loaded font families instead of pulling in new
// Google Fonts just for this — Mono is the one exception, using a system
// stack that needs no network font at all.
export const CHAT_FONTS = [
  { id: 'body', name: 'Sans', className: 'font-body' },
  { id: 'display', name: 'Serif', className: 'font-display' },
  { id: 'hand', name: 'Handwritten', className: 'font-hand' },
  { id: 'mono', name: 'Mono', className: 'font-mono' },
]

export const DEFAULT_CHAT_FONT = CHAT_FONTS[0].id

export function chatFontClassName(fontId) {
  return CHAT_FONTS.find((font) => font.id === fontId)?.className ?? CHAT_FONTS[0].className
}
