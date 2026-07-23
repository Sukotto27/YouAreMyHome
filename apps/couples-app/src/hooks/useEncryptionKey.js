import { useCallback, useEffect, useState } from 'react'
import { importCryptoKey, isValidRawKey } from '../lib/e2ee'

const STORAGE_KEY = 'you-are-my-home:e2ee-key'

function readLocalKey() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

// Manages the single shared AES-256 key used for Chat/Gallery encryption.
// The raw key lives only in localStorage on each device — nothing here ever
// writes it to Firestore. The imported CryptoKey is cached in state rather
// than re-imported on every encrypt/decrypt call.
export function useEncryptionKey() {
  const [rawKeyBase64, setRawKeyBase64] = useState(readLocalKey)
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

  // Doesn't persist until the caller (EncryptionGate) has shown the key and
  // gotten an explicit "I've saved this" confirmation — see saveKey.
  const saveKey = useCallback((base64) => {
    if (!isValidRawKey(base64)) {
      throw new Error('That doesn’t look like a valid key.')
    }
    try {
      localStorage.setItem(STORAGE_KEY, base64)
    } catch {
      // storage full/unavailable — key still works for this session via state
    }
    setRawKeyBase64(base64)
  }, [])

  const clearKey = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setRawKeyBase64(null)
  }, [])

  return {
    hasKey: Boolean(cryptoKey),
    cryptoKey,
    rawKeyBase64,
    saveKey,
    clearKey,
  }
}
