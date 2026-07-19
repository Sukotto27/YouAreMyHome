import scott from '../assets/images/scott.jpg'
import cristina from '../assets/images/cristina.jpg'

function defaultAvatarFor(name) {
  if (/scott/i.test(name || '')) return scott
  if (/cristina/i.test(name || '')) return cristina
  return null
}

// `avatars` is the shared { [displayName]: url } map from chat settings —
// whatever someone last picked in the avatar tab, synced for both of us.
export function avatarFor(name, avatars) {
  return avatars?.[name] || defaultAvatarFor(name)
}
