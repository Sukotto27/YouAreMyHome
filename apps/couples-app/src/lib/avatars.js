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

// `preferredNames` is the shared { [displayName]: nickname } map from chat
// settings — a cosmetic-only rename set from the Profile page. The
// underlying `displayName` ('Scott'/'Cristina') stays the identity key every
// other feature matches against; this is purely what gets shown for it.
export function preferredNameFor(name, preferredNames) {
  return preferredNames?.[name] || name
}
