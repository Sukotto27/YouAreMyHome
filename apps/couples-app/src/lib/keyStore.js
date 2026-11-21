// The shared AES-256 chat/gallery key, plus the optional "app lock" around it.
//
// Without a lock the raw key sits in localStorage in the clear (that's the
// original behaviour). With the lock on, the key is stored *wrapped*: AES-GCM
// encrypted under a key derived from the user's PIN/passphrase with PBKDF2
// (600k rounds of SHA-256). The plaintext copy is removed, so someone who
// picks up an unlocked phone — or copies this device's stored data — can't read
// chats or photos without the PIN. While the app is unlocked the key lives only
// in memory; locking drops it again.
//
// What this does NOT do: stop someone who copies the stored data from guessing
// a *short* PIN offline (PBKDF2 slows that down, it doesn't prevent it — use a
// long passphrase if that's a concern), or protect against malware on an
// already-unlocked device.
//
// This module is plain state + functions (no React) so every component sees
// the same key and lock state; hooks/useEncryptionKey.js subscribes to it.

import { base64ToBytes, bytesToBase64, isValidRawKey } from './e2ee'

const KEY_STORAGE = 'you-are-my-home:e2ee-key'
const LOCK_STORAGE = 'you-are-my-home:app-lock'

export const PBKDF2_ITERATIONS = 600_000
export const MIN_PIN_LENGTH = 6
export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30] // minutes
export const DEFAULT_AUTO_LOCK_MINUTES = 5

// ---- storage helpers (every access guarded: storage can be blocked) ----

function readPlainKey() {
  try {
    return localStorage.getItem(KEY_STORAGE)
  } catch {
    return null
  }
}

function readLock() {
  try {
    const record = JSON.parse(localStorage.getItem(LOCK_STORAGE) || 'null')
    if (record && record.v === 1 && typeof record.salt === 'string' && typeof record.iv === 'string' && typeof record.wrapped === 'string') {
      return record
    }
  } catch {
    // fall through
  }
  return null
}

// ---- state ----

function initialState() {
  if (readLock()) return { rawKeyBase64: null, locked: true, lockEnabled: true }
  return { rawKeyBase64: readPlainKey(), locked: false, lockEnabled: false }
}

let state = initialState()
const listeners = new Set()

function setState(patch) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

export function getKeyState() {
  return state
}

export function subscribeKeyState(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// ---- wrapping ----

async function deriveWrapKey(pin, saltBytes, iterations) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function wrapKey(pin, rawKeyBase64) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrapKeyObj = await deriveWrapKey(pin, salt, PBKDF2_ITERATIONS)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKeyObj, new TextEncoder().encode(rawKeyBase64))
  return {
    v: 1,
    iter: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    wrapped: bytesToBase64(new Uint8Array(ciphertext)),
  }
}

// Throws Error('wrong-pin') on a wrong PIN — GCM's auth tag fails closed.
async function unwrapKey(pin, record) {
  try {
    const wrapKeyObj = await deriveWrapKey(pin, base64ToBytes(record.salt), record.iter || PBKDF2_ITERATIONS)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(record.iv) },
      wrapKeyObj,
      base64ToBytes(record.wrapped),
    )
    const raw = new TextDecoder().decode(plaintext)
    if (!isValidRawKey(raw)) throw new Error('bad-key')
    return raw
  } catch {
    throw new Error('wrong-pin')
  }
}

function assertPin(pin) {
  if (typeof pin !== 'string' || pin.length < MIN_PIN_LENGTH) {
    throw new Error(`Use at least ${MIN_PIN_LENGTH} characters.`)
  }
}

// ---- key (no lock involved) ----

export function setRawKey(base64) {
  if (!isValidRawKey(base64)) {
    throw new Error('That doesn’t look like a valid key.')
  }
  // With the lock on, never write the plaintext back to disk.
  if (!state.lockEnabled) {
    try {
      localStorage.setItem(KEY_STORAGE, base64)
    } catch {
      // storage full/unavailable — key still works for this session via state
    }
  }
  setState({ rawKeyBase64: base64 })
}

export function clearKey() {
  try {
    localStorage.removeItem(KEY_STORAGE)
    localStorage.removeItem(LOCK_STORAGE)
  } catch {
    // ignore
  }
  setState({ rawKeyBase64: null, locked: false, lockEnabled: false })
}

// ---- app lock ----

export function getAutoLockMinutes() {
  const minutes = readLock()?.autoLockMinutes
  return AUTO_LOCK_OPTIONS.includes(minutes) ? minutes : DEFAULT_AUTO_LOCK_MINUTES
}

export function setAutoLockMinutes(minutes) {
  const record = readLock()
  if (!record || !AUTO_LOCK_OPTIONS.includes(minutes)) return
  try {
    localStorage.setItem(LOCK_STORAGE, JSON.stringify({ ...record, autoLockMinutes: minutes }))
  } catch {
    // ignore
  }
}

// Turns the lock on. The app stays unlocked for now (the key is in memory).
// Verifies the wrapped copy decrypts before removing the plaintext one, so a
// failure can never strand you without a key.
export async function enableAppLock(pin, autoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES) {
  assertPin(pin)
  const raw = state.rawKeyBase64
  if (!raw) throw new Error('Set up encryption first.')

  const record = { ...(await wrapKey(pin, raw)), autoLockMinutes }
  if ((await unwrapKey(pin, record)) !== raw) throw new Error('Couldn’t verify the lock — nothing was changed.')

  localStorage.setItem(LOCK_STORAGE, JSON.stringify(record)) // throws if storage is blocked; plaintext untouched
  try {
    localStorage.removeItem(KEY_STORAGE)
  } catch {
    // ignore
  }
  setState({ lockEnabled: true, locked: false })
}

export async function unlockWithPin(pin) {
  const record = readLock()
  if (!record) throw new Error('wrong-pin')
  const raw = await unwrapKey(pin, record)
  setState({ rawKeyBase64: raw, locked: false })
}

// Drops the key from memory and shows the lock screen. No-op if the lock is off.
export function lockNow() {
  if (!state.lockEnabled || state.locked) return
  setState({ rawKeyBase64: null, locked: true })
}

export async function changeAppLockPin(oldPin, newPin) {
  const record = readLock()
  if (!record) throw new Error('App lock is off.')
  assertPin(newPin)
  const raw = await unwrapKey(oldPin, record)
  const next = { ...(await wrapKey(newPin, raw)), autoLockMinutes: getAutoLockMinutes() }
  if ((await unwrapKey(newPin, next)) !== raw) throw new Error('Couldn’t verify the new PIN — nothing was changed.')
  localStorage.setItem(LOCK_STORAGE, JSON.stringify(next))
}

// Turns the lock off: the key goes back to being stored plainly. Needs the PIN.
export async function disableAppLock(pin) {
  const record = readLock()
  if (!record) return
  const raw = await unwrapKey(pin, record)
  localStorage.setItem(KEY_STORAGE, raw) // write the plaintext FIRST; only then drop the lock
  try {
    localStorage.removeItem(LOCK_STORAGE)
  } catch {
    // ignore
  }
  setState({ rawKeyBase64: raw, locked: false, lockEnabled: false })
}

// "Forgot my PIN": removes the lock AND the stored key from this device. The
// shared key still exists on your partner's device — enter it again from there.
export function resetAppLock() {
  clearKey()
}
