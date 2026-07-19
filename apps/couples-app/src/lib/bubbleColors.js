export const BUBBLE_COLORS = [
  '#e27d7a', // rose (default "own" color)
  '#6fb8b5', // teal (default "their" color)
  '#c89b3c', // gold
  '#9b8de2', // lavender
  '#e2a37d', // amber
  '#7d9be2', // periwinkle
  '#e27dbb', // orchid
  '#5fae74', // sage
]

// Picks readable text color (dark ink vs. light paper) against a bubble color.
export function textColorFor(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#362521' : '#fbf2e9'
}
