import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// The same tracks serve both this game's background music AND the
// couples-app Music tab — one shared source at the monorepo root
// (music/*.mp3), no separate "game" set. apps/couples-app reads the
// identical folder via a build-time glob + ID3-tag read (see
// lib/musicLibrary.js / scripts/generate-music-titles.mjs). This app can't
// glob-import from outside its own root the way couples-app does, since it
// plays tracks via plain runtime `src/music/${name}.mp3` paths (see
// src/main.js) served from its own public/ dir — so this copies the shared
// source in before each build/dev run instead. The filenames matter here
// (main.js picks tracks by exact systematic name like `dungeon3.mp3`); the
// couples-app side ignores filenames entirely and titles tracks from each
// file's embedded ID3 tag. The destination is gitignored — a build
// artifact, not a second committed copy.
const sourceDir = path.resolve(root, '../../music')
const destDir = path.join(root, 'public/src/music')

fs.rmSync(destDir, { recursive: true, force: true })
fs.mkdirSync(destDir, { recursive: true })

const files = fs.readdirSync(sourceDir).filter((name) => name.toLowerCase().endsWith('.mp3'))
for (const name of files) {
  fs.copyFileSync(path.join(sourceDir, name), path.join(destDir, name))
}

console.log(`synced ${files.length} game tracks into public/src/music`)
