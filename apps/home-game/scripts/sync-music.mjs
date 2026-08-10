import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// The 58 systematic-name game tracks live once, at the monorepo root
// (music/game/), shared with nothing else — apps/couples-app's Music tab
// reads from the sibling music/*.mp3 (top level) instead, via a build-time
// ID3-tag read (see apps/couples-app/scripts/generate-music-titles.mjs).
// This app can't glob-import from outside its own root the way couples-app
// does, since it plays tracks via plain runtime `src/music/${name}.mp3`
// paths (see src/main.js) served from its own public/ dir — so this copies
// the shared source in before each build/dev run instead. The destination
// is gitignored; it's a build artifact now, not a second committed copy.
const sourceDir = path.resolve(root, '../../music/game')
const destDir = path.join(root, 'public/src/music')

fs.rmSync(destDir, { recursive: true, force: true })
fs.mkdirSync(destDir, { recursive: true })

const files = fs.readdirSync(sourceDir).filter((name) => name.toLowerCase().endsWith('.mp3'))
for (const name of files) {
  fs.copyFileSync(path.join(sourceDir, name), path.join(destDir, name))
}

console.log(`synced ${files.length} game tracks into public/src/music`)
