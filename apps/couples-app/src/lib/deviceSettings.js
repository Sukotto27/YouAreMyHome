// Per-device preferences — unlike chat customization (settings/chat, shared
// by both of us), these are personal and read synchronously wherever
// they're needed (e.g. playSound) rather than through a hook, since they
// don't need to be "live" across components the way shared settings do.

const SOUNDS_KEY = 'you-are-my-home:sounds-enabled'
const AUTO_DOWNLOAD_KEY = 'you-are-my-home:auto-download-images'
const MUSIC_VOLUME_KEY = 'you-are-my-home:music-volume'
const MUSIC_PAUSED_KEY = 'you-are-my-home:music-paused'

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

function readNumber(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw === null ? NaN : Number(raw)
    return Number.isFinite(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeNumber(key, value) {
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

// Deliberately per-device, unlike the rest of the Music tab's playback
// state (track/play-pause/shuffle) — two people sharing a synced listening
// session still want independent volume for their own speakers/headphones.
export function musicVolume() {
  return Math.max(0, Math.min(1, readNumber(MUSIC_VOLUME_KEY, 1)))
}

export function setMusicVolume(volume) {
  writeNumber(MUSIC_VOLUME_KEY, Math.max(0, Math.min(1, volume)))
}

// Whether *this device* had itself paused out of the given live session —
// keyed by sessionId (not just a bare bool) so the preference only applies
// to the session it was set during; reopening the app onto a brand-new
// session always starts playing regardless of how a previous one was left.
// Without this, closing and reopening the app while paused mid-session
// resumed playback every time, since manualPaused is otherwise plain
// component state that doesn't survive a reload.
export function musicPausedFor(sessionId) {
  try {
    const raw = localStorage.getItem(MUSIC_PAUSED_KEY)
    if (!raw || !sessionId) return false
    const parsed = JSON.parse(raw)
    return parsed?.sessionId === sessionId && !!parsed?.paused
  } catch {
    return false
  }
}

export function setMusicPausedFor(sessionId, paused) {
  if (!sessionId) return
  try {
    localStorage.setItem(MUSIC_PAUSED_KEY, JSON.stringify({ sessionId, paused }))
  } catch {
    // storage full/unavailable — setting just won't persist this session
  }
}
