import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { parseFile } from 'music-metadata'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// music/ (monorepo root, top level only — the game's tracks live in the
// music/game/ subfolder and are irrelevant here) is the single shared
// source for the couple's songs. Browsers can't read ID3 tags on their own,
// and reading them at runtime would mean fetching every track's bytes just
// to populate the picker list — so this reads each file's embedded Title
// tag once, at build time, and writes a small lookup lib/musicLibrary.js
// merges with the actual playable URLs (from a build-time glob).
const musicDir = path.resolve(root, '../../music')
const outFile = path.join(root, 'src/lib/musicTitles.generated.json')

const files = fs.existsSync(musicDir)
  ? fs.readdirSync(musicDir).filter((name) => name.toLowerCase().endsWith('.mp3'))
  : []

const titles = {}
for (const name of files) {
  const metadata = await parseFile(path.join(musicDir, name))
  titles[name] = metadata.common.title || null
}

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, JSON.stringify(titles, null, 2))

console.log(`wrote ${Object.keys(titles).length} track titles to ${path.relative(root, outFile)}`)
