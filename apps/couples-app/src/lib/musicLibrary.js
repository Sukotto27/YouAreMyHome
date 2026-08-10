import titles from './musicTitles.generated.json'

// music/ (monorepo root) is the single shared source for every track — the
// same files also serve as apps/home-game's background music (see
// apps/home-game/scripts/sync-music.mjs), so filenames here stay whatever
// that game's code needs (fixed, systematic names like `dungeon3.mp3`, see
// src/main.js there); this app ignores filenames entirely and titles each
// track from its embedded ID3 Title tag instead. scripts/generate-music-
// titles.mjs reads those tags at build/dev time into
// musicTitles.generated.json (browsers can't read ID3 tags themselves, and
// doing it at runtime would mean fetching every track's bytes just to
// populate the picker list). This glob only supplies the actual playable
// URL per file.
const trackModules = import.meta.glob('../../../../music/*.mp3', {
  eager: true,
  import: 'default',
})

// Fallback only for a file that genuinely has no embedded title — not the
// primary path, just keeps a stray untagged file from showing up blank.
function titleFromFilename(filename) {
  return filename
    .replace(/\.mp3$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
}

// Sorted by filename so every device (built from the same source) resolves
// an identical track order — next/previous and end-of-track auto-advance
// depend on that agreement without the two devices ever exchanging it.
export const TRACKS = Object.keys(trackModules)
  .sort()
  .map((path) => {
    const filename = path.split('/').pop()
    return {
      id: filename.replace(/\.mp3$/i, ''),
      title: titles[filename] || titleFromFilename(filename),
      url: trackModules[path],
    }
  })

export function trackById(id) {
  return TRACKS.find((track) => track.id === id) || null
}
