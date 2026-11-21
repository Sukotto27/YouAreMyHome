// Who "this device" is, for device trust (see functions/security.js).
//
// A device has a public id (shown in the device list, embedded in its token)
// and a private secret (never leaves this device except over TLS to prove who
// it is — the server stores only a hash). Both live in localStorage, next to
// the E2EE key, so clearing site data makes this a brand-new device that has to
// be approved again. That's the safe direction to fail in.

const ID_KEY = 'you-are-my-home:device-id'
const SECRET_KEY = 'you-are-my-home:device-secret'

const ID_RE = /^[a-f0-9]{32}$/
const SECRET_RE = /^[a-f0-9]{64}$/

let cached = null

function randomHex(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function getDeviceIdentity() {
  if (cached) return cached

  let deviceId = null
  let secret = null
  try {
    deviceId = localStorage.getItem(ID_KEY)
    secret = localStorage.getItem(SECRET_KEY)
  } catch {
    // storage blocked — falls through to an in-memory identity for this session
  }

  // Both or neither: a half-present pair can't prove anything, so start over.
  if (!ID_RE.test(deviceId || '') || !SECRET_RE.test(secret || '')) {
    deviceId = randomHex(16)
    secret = randomHex(32)
    try {
      localStorage.setItem(ID_KEY, deviceId)
      localStorage.setItem(SECRET_KEY, secret)
    } catch {
      // ignore — this session still works, the device just won't be remembered
    }
  }

  cached = { deviceId, secret }
  return cached
}

// A short human label for the device list and the alert, e.g. "Chrome on
// Windows" or "Safari on iPhone (installed app)". Best-effort from the user
// agent — it's for recognition, not security.
export function describeDevice() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || ''

  let os = 'unknown device'
  if (/iPhone/.test(ua)) os = 'iPhone'
  else if (/iPad/.test(ua)) os = 'iPad'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'Mac'
  else if (/CrOS/.test(ua)) os = 'ChromeOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  let browser = 'Browser'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera'
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet'
  else if (/Firefox|FxiOS/.test(ua)) browser = 'Firefox'
  else if (/Chrome|CriOS/.test(ua)) browser = 'Chrome'
  else if (/Safari/.test(ua)) browser = 'Safari'

  let installed = false
  try {
    installed = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
  } catch {
    // ignore
  }

  return `${browser} on ${os}${installed ? ' (installed app)' : ''}`
}
