export const COLOR_PALETTE = [
  { name: 'Ink', value: '#362521' },
  { name: 'Rose', value: '#e27d7a' },
  { name: 'Blush', value: '#f6b8b6' },
  { name: 'Teal', value: '#6fb8b5' },
  { name: 'Gold', value: '#c89b3c' },
  { name: 'Plum', value: '#7a4b62' },
  { name: 'Sky', value: '#7ea8c9' },
  { name: 'Sage', value: '#8fae7c' },
]

// Brush sizes are stored as a fraction of a reference canvas width so strokes
// look the same relative thickness on a phone as they do on a desktop.
export const REFERENCE_WIDTH = 800

export const BRUSH_PRESETS = [
  { name: 'Fine', px: 3 },
  { name: 'Medium', px: 7 },
  { name: 'Bold', px: 14 },
]

export const DEFAULT_COLOR = COLOR_PALETTE[1].value
export const DEFAULT_BRUSH_FRACTION = BRUSH_PRESETS[1].px / REFERENCE_WIDTH

// The canvas itself is shared, so its background is synced (RTDB) rather
// than a personal per-device preference like Chat's wallpaper.
export const CANVAS_BACKGROUNDS = [
  { name: 'Paper', value: '#fbf2e9' },
  { name: 'White', value: '#ffffff' },
  { name: 'Blush', value: '#fbdad7' },
  { name: 'Sky', value: '#e4f0ef' },
  { name: 'Dusk', value: '#efe6ec' },
  { name: 'Black', value: '#1c1614' },
]

export const DEFAULT_CANVAS_BACKGROUND = CANVAS_BACKGROUNDS[0].value
