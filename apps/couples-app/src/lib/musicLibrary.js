import titles from './musicTitles.generated.json'

// music/ (monorepo root, top level) is the single shared source for the
// couple's songs — scripts/generate-music-titles.mjs reads each file's
// embedded ID3 Title tag at build/dev time into musicTitles.generated.json
// (browsers can't read ID3 tags themselves, and doing it at runtime would
// mean fetching every track's bytes just to populate the picker list). This
// glob only supplies the actual playable URL per file. music/game/ (the RPG
// soundtrack — a sibling folder of fixed, systematic names with no
// meaningful titles) is excluded automatically, since `*` doesn't match
// into subfolders.
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
