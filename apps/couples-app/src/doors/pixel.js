// The old-school pixel look: the font, the palette, little 12x12 pixel-art icons and the stepped
// "pixel circle" clip-path the touch buttons use. DOM-only helpers; nothing here touches the game.

export const PIXEL_FONT = "'Press Start 2P', 'Courier New', monospace"

// classic console-ish palette
export const PAL = {
  ink: '#0b0820', // near-black navy: outlines and shadows
  panel: '#1c1a3c', // button / panel fill
  panelHi: '#3a3670', // its bevel highlight
  white: '#f8f8f8',
  gold: '#ffd23f',
  dim: '#6b6a8c',
  danger: '#ff5a5f',
}

// A pixel-art circle: the rim steps in instead of curving.
export const PIXEL_CIRCLE =
  'polygon(25% 0, 75% 0, 75% 8%, 87% 8%, 87% 16%, 92% 16%, 92% 25%, 100% 25%, 100% 75%, 92% 75%, 92% 84%, 87% 84%, 87% 92%, 75% 92%, 75% 100%, 25% 100%, 25% 92%, 13% 92%, 13% 84%, 8% 84%, 8% 75%, 0 75%, 0 25%, 8% 25%, 8% 16%, 13% 16%, 13% 8%, 25% 8%)'
// a square with its corners nibbled off
export const PIXEL_SQUARE = 'polygon(0 12%, 6% 12%, 6% 6%, 12% 6%, 12% 0, 88% 0, 88% 6%, 94% 6%, 94% 12%, 100% 12%, 100% 88%, 94% 88%, 94% 94%, 88% 94%, 88% 100%, 12% 100%, 12% 94%, 6% 94%, 6% 88%, 0 88%)'

// 12x12 icons. '.' empty, 'c' the icon's accent colour, 'w' white, 'k' dark, 'g' grey.
export const ICONS = {
  solidLight: [
    '..........w.',
    '.........wcw',
    '........wcw.',
    '.......wcw..',
    '......wcw...',
    '.....wcw....',
    '....wcw.....',
    '...wcw......',
    '..wcw.......',
    '.wcw........',
    'wkw.........',
    'k...........',
  ],
  jumpBoost: [
    '............',
    '.....cc.....',
    '....cccc....',
    '...cc..cc...',
    '..cc....cc..',
    '............',
    '.....cc.....',
    '....cccc....',
    '...cc..cc...',
    '..cc....cc..',
    '............',
    '............',
  ],
  teleport: [
    '....cccc....',
    '..cc....cc..',
    '.c..wwww..c.',
    '.c.w....w.c.',
    'c..w.cc.w..c',
    'c..w.cc.w..c',
    '.c.w....w.c.',
    '.c..wwww..c.',
    '..cc....cc..',
    '....cccc....',
    '............',
    '............',
  ],
  lightEcho: [
    '..cc....ww..',
    '.cccc..w..w.',
    '.cccc..w..w.',
    '..cc....ww..',
    '.cccc..wwww.',
    'cccccc.w..w.',
    'cccccc.w..w.',
    'cccccc.w..w.',
    '.cccc..wwww.',
    '.c..c..w..w.',
    '.c..c..w..w.',
    '............',
  ],
  lightRope: [
    '...ccc......',
    '..c...c.....',
    '..c...c.....',
    '...c.c......',
    '....cw......',
    '....w.......',
    '...w........',
    '..w.........',
    '..w.........',
    '...w........',
    '....w.......',
    '............',
  ],
  jump: [
    '.....ww.....',
    '....wwww....',
    '...wwwwww...',
    '..wwwwwwww..',
    '.wwwwwwwwww.',
    '....wwww....',
    '....wwww....',
    '....wwww....',
    '....wwww....',
    '....wwww....',
    '............',
    '............',
  ],
  use: [
    '.....ww.....',
    '.....ww.....',
    '....wwww....',
    'wwwwwwwwwwww',
    '.wwwwwwwwww.',
    '..wwwwwwww..',
    '...wwwwww...',
    '..www..www..',
    '.www....www.',
    '.ww......ww.',
    '............',
    '............',
  ],
  interact: [
    '........ww..',
    '.......wwww.',
    '........ww..',
    '.......w....',
    '......w.....',
    '.....w......',
    '....w.......',
    'wwwwwwwwwwww',
    'wwwwwwwwwwww',
    '............',
    '............',
    '............',
  ],
  cycle: [
    '............',
    '......w.....',
    '.......ww...',
    'wwwwwwwwww..',
    '.......ww...',
    '......w.....',
    '............',
    '.....w......',
    '...ww.......',
    '..wwwwwwwwww',
    '...ww.......',
    '.....w......',
  ],
  switchPlayer: [
    '............',
    '.ww....ww...',
    'wwww..wwww..',
    'wwww..wwww..',
    '.ww....ww...',
    'wwww..wwww..',
    'wwww..wwww..',
    'w..w..w..w..',
    '............',
    '............',
    '............',
    '............',
  ],
  reset: [
    '....wwww.ww.',
    '..ww....www.',
    '.ww......ww.',
    '.w........w.',
    '.w........w.',
    '.ww......ww.',
    '..ww....ww..',
    '....wwww....',
    '............',
    '............',
    '............',
    '............',
  ],
}

const cache = new Map()
// A data-URL PNG of an icon at 1 pixel per art pixel (the CSS scales it up with image-rendering: pixelated).
export function pixelIconURL(name, accent = '#ffffff') {
  const key = `${name}|${accent}`
  if (cache.has(key)) return cache.get(key)
  const rows = ICONS[name]
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 12
  const ctx = canvas.getContext('2d')
  const colors = { c: accent, w: PAL.white, k: PAL.ink, g: '#9ca3af' }
  rows.forEach((row, y) => {
    for (let x = 0; x < 12; x++) {
      const color = colors[row[x]]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
    }
  })
  const url = canvas.toDataURL()
  cache.set(key, url)
  return url
}

let injected = false
// Page-level CSS the pixel UI needs (button states, the toolbelt's hidden scrollbar).
export function injectPixelCss() {
  if (injected || typeof document === 'undefined') return
  injected = true
  const style = document.createElement('style')
  style.textContent = `
    .px-text { font-family: ${PIXEL_FONT}; letter-spacing: 0; -webkit-font-smoothing: none; font-smooth: never; text-rendering: optimizeSpeed; }
    .px-img { image-rendering: pixelated; image-rendering: crisp-edges; }
    .px-belt { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
    .px-belt::-webkit-scrollbar { display: none; }
    .px-press { transform: translateY(0.5vmin); filter: brightness(1.25); }
    .px-blink { animation: px-blink 1s steps(2, jump-none) infinite; }
    @keyframes px-blink { 50% { opacity: 0.35; } }
  `
  document.head.appendChild(style)
}
