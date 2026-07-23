// Client-side AES-256-GCM via the browser's native Web Crypto API. The key
// never leaves the two devices it's entered on — nothing here ever talks to
// Firebase. `encryptJson`/`decryptJson` bundle a message/photo's entire
// content into one ciphertext blob so callers don't have to encrypt each
// field separately.
//
// Base64<->bytes conversion avoids `String.fromCharCode(...bytes)` — spreading
// an image-sized (~1MB) typed array as call arguments can throw
// `RangeError: Maximum call stack size exceeded` in some engines, so this
// chunks the conversion instead.

const KEY_BYTE_LENGTH = 32 // AES-256
const IV_BYTE_LENGTH = 12 // 96 bits, the standard/recommended AES-GCM IV size
const CHUNK_SIZE = 0x8000

export function generateRawKey() {
  return crypto.getRandomValues(new Uint8Array(KEY_BYTE_LENGTH))
}

export function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE))
  }
  return btoa(binary)
}

export function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Raw key bytes are managed as base64 by callers (for display/localStorage);
// this is only ever imported into a non-extractable CryptoKey for use.
export async function importCryptoKey(rawKeyBase64) {
  const bytes = base64ToBytes(rawKeyBase64)
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptJson(value, cryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH))
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const ciphertextBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plaintext)
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertextBuf)) }
}

// Rejects (throws) if the key is wrong or the data is corrupt/tampered —
// GCM's auth tag verification fails closed. Callers must catch this.
export async function decryptJson(blob, cryptoKey) {
  const iv = base64ToBytes(blob.iv)
  const ciphertext = base64ToBytes(blob.ciphertext)
  const plaintextBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext)
  return JSON.parse(new TextDecoder().decode(plaintextBuf))
}

export function isValidRawKey(base64) {
  try {
    return base64ToBytes(base64).length === KEY_BYTE_LENGTH
  } catch {
    return false
  }
}
