import { Jimp } from 'jimp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// Dark background to match the game's theme-color / body background (#111),
// unlike apps/couples-app's cream icons — these two PWAs share a family but
// are visually distinct apps.
const BG = 0x111111ff

async function composite(size, padFraction) {
  const source = await Jimp.read(path.join(root, 'public/src/icons/house.png'))

  const canvas = new Jimp({ width: size, height: size, color: BG })

  const artSize = Math.round(size * (1 - padFraction * 2))
  const offset = Math.round((size - artSize) / 2)

  source.resize({ w: artSize, h: artSize })
  canvas.composite(source, offset, offset)

  return canvas
}

const outDir = path.join(root, 'public/icons')

const jobs = [
  { name: 'icon-192.png', size: 192, padFraction: 0.14 },
  { name: 'icon-512.png', size: 512, padFraction: 0.14 },
  { name: 'apple-touch-icon.png', size: 180, padFraction: 0.16 },
  // Maskable icons get cropped to a circle by some launchers, so the safe
  // zone needs more padding than a regular icon.
  { name: 'maskable-512.png', size: 512, padFraction: 0.24 },
]

for (const job of jobs) {
  const img = await composite(job.size, job.padFraction)
  await img.write(path.join(outDir, job.name))
  console.log('wrote', job.name)
}

console.log('done')
