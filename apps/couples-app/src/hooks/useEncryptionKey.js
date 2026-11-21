import { useEffect, useState, useSyncExternalStore } from 'react'
import { importCryptoKey } from '../lib/e2ee'
import { clearKey, getKeyState, setRawKey, subscribeKeyState } from '../lib/keyStore'

// Just the lock/key presence state — for components (the lock gate) that don't
// need the imported CryptoKey.
export function useKeyLockState() {
  return useSyncExternalStore(subscribeKeyState, getKeyState)
}

// Manages the single shared AES-256 key used for Chat/Gallery encryption.
// The raw key lives only on each device — nothing here ever writes it to
// Firestore. It's held in lib/keyStore (shared across every component, and
// optionally wrapped under an app-lock PIN); the imported CryptoKey is cached
// in state rather than re-imported on every encrypt/decrypt call.
export function useEncryptionKey() {
  const { rawKeyBase64, locked, lockEnabled } = useKeyLockState()
  const [cryptoKey, setCryptoKey] = useState(null)

  useEffect(() => {
    if (!rawKeyBase64) {
      setCryptoKey(null)
      return
    }
    let cancelled = false
    importCryptoKey(rawKeyBase64).then((key) => {
      if (!cancelled) setCryptoKey(key)
    })
    return () => {
      cancelled = true
    }
  }, [rawKeyBase64])

  return {
    hasKey: Boolean(cryptoKey),
    cryptoKey,
    rawKeyBase64,
    locked,
    lockEnabled,
    // Doesn't persist until the caller (EncryptionGate) has shown the key and
    // gotten an explicit "I've saved this" confirmation.
    saveKey: setRawKey,
    clearKey,
  }
}
