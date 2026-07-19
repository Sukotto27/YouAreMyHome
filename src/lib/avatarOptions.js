import scott from '../assets/images/scott.jpg'
import cristina from '../assets/images/cristina.jpg'

// Additional illustrated portrait variants dropped into /images and
// pre-cropped to small squares by scripts/generate-avatars.mjs — picked up
// automatically so adding more later needs no code change here.
const portraitModules = import.meta.glob('../assets/images/avatars/*.jpg', {
  eager: true,
  import: 'default',
})

const portraits = Object.keys(portraitModules)
  .sort()
  .map((path, index) => ({
    id: `portrait-${index + 1}`,
    url: portraitModules[path],
  }))

export const AVATAR_PRESETS = [
  { id: 'scott', url: scott },
  { id: 'cristina', url: cristina },
  ...portraits,
]
