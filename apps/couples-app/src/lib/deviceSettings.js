// Per-device preferences — unlike chat customization (settings/chat, shared
// by both of us), these are personal and read synchronously wherever
// they're needed (e.g. playSound) rather than through a hook, since they
// don't need to be "live" across components the way shared settings do.

const SOUNDS_KEY = 'you-are-my-home:sounds-enabled'
const AUTO_DOWNLOAD_KEY = 'you-are-my-home:auto-download-images'

function readBool(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : raw === 'true'
  } catch {
    return fallback
  }
}

function writeBool(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // storage full/unavailable — setting just won't persist this session
  }
}

// Default on, so this is purely an opt-out for people who don't touch it.
export function soundsEnabled() {
  return readBool(SOUNDS_KEY, true)
}

export function setSoundsEnabled(enabled) {
  writeBool(SOUNDS_KEY, enabled)
}

// Default off — auto-saving files to someone's device shouldn't happen
// until they've deliberately opted in.
export function autoDownloadImagesEnabled() {
  return readBool(AUTO_DOWNLOAD_KEY, false)
}

export function setAutoDownloadImagesEnabled(enabled) {
  writeBool(AUTO_DOWNLOAD_KEY, enabled)
}
