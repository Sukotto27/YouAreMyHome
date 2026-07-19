import { Jimp } from 'jimp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const PAPER = 0xfbf2e9ff

async function composite(size, { padFraction, background }) {
  const left = await Jimp.read(path.join(root, 'images/heart_left.png'))
  const right = await Jimp.read(path.join(root, 'images/heart_right.png'))

  const canvas = new Jimp({ width: size, height: size, color: background })

  const heartSize = Math.round(size * (1 - padFraction * 2))
  const offset = Math.round((size - heartSize) / 2)
  const halfW = Math.round(heartSize / 2)

  left.resize({ w: halfW, h: heartSize })
  right.resize({ w: halfW, h: heartSize })

  canvas.composite(left, offset, offset)
  canvas.composite(right, offset + halfW, offset)

  return canvas
}

const outDir = path.join(root, 'public/icons')

const jobs = [
  { name: 'icon-192.png', size: 192, padFraction: 0.14 },
  { name: 'icon-512.png', size: 512, padFraction: 0.14 },
  { name: 'apple-touch-icon.png', size: 180, padFraction: 0.16 },
  { name: 'maskable-512.png', size: 512, padFraction: 0.24 },
]

for (const job of jobs) {
  const img = await composite(job.size, { padFraction: job.padFraction, background: PAPER })
  await img.write(path.join(outDir, job.name))
  console.log('wrote', job.name)
}

console.log('done')
