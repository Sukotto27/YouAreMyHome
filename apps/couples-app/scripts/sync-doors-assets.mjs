import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

// The Doors game reuses Scott's and Cristina's 3D models (and the shared
// animation clips) that already live in apps/home-game. Rather than commit a
// second ~10 MB copy, this copies the few files it needs into
// public/doors (git-ignored) before every dev/build run — the
// same pattern as home-game's sync-music script.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const source = path.resolve(root, '../home-game/public/characters3d')

// [path under home-game/public/characters3d or assets3d, destination under public/doors]
const doorModels = path.resolve(root, '../home-game/public/assets3d/models/household/Doors')
const FILES = [
  [path.join(source, 'scott_lod.glb'), 'characters3d/scott_lod.glb'],
  [path.join(source, 'cristina_lod.glb'), 'characters3d/cristina_lod.glb'],
  [path.join(source, 'assets/chars/UAL1_Standard.glb'), 'characters3d/assets/chars/UAL1_Standard.glb'],
  [path.join(source, 'assets/chars/UAL2_Clips.glb'), 'characters3d/assets/chars/UAL2_Clips.glb'],
  // the plain household door used for every door in the game
  [path.join(doorModels, 'Door B.fbx'), 'models/door.fbx'],
  // the fire sprite sheet (the home game's campfire flame), used for the flame jets
  [path.resolve(root, '../home-game/public/assets3d/VFX/flipbooks/fire_01_8x8.tga'), 'vfx/fire_01_8x8.tga'],
]

let copied = 0
for (const [from, relativeTarget] of FILES) {
  const to = path.join(root, 'public/doors', relativeTarget)
  if (!fs.existsSync(from)) {
    console.warn(`[doors assets] missing ${from} — the 3D characters will fall back to placeholders`)
    continue
  }
  const upToDate = fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size
  if (upToDate) continue
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
  copied++
}
console.log(`[doors assets] ${copied} file(s) copied`)
