import { Jimp } from 'jimp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const sourceDir = path.join(root, 'images')
const outDir = path.join(root, 'src/assets/images/avatars')

// Alternate portrait illustrations dropped into /images to use as avatar
// picker presets, alongside the Scott/Cristina portraits already bundled
// from their _thumbnail versions. Cropped to a small square so each preset
// stays tiny (they end up embedded in a synced Firestore settings doc).
const SOURCE_FILES = [
  '20250118_220209.jpg',
  '20250118_232158.jpg',
  '20250118_232446.jpg',
  '20250118_232929.jpg',
  '20250118_232936.jpg',
  '20250118_233048.jpg',
  '20250118_233052.jpg',
  '20250118_233147.jpg',
  '20250118_233259.jpg',
  '20250118_234318.jpg',
  '20250118_234552.jpg',
]

await fs.mkdir(outDir, { recursive: true })

for (const [index, filename] of SOURCE_FILES.entries()) {
  const img = await Jimp.read(path.join(sourceDir, filename))
  img.cover({ w: 200, h: 200 })
  const outName = `portrait-${index + 1}.jpg`
  await img.write(path.join(outDir, outName), { quality: 75 })
  console.log('wrote', outName)
}

console.log('done')
