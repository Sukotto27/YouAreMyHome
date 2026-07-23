import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { DEFAULT_CHAT_BACKGROUND } from '../lib/chatBackgrounds'
import { DEFAULT_CHAT_FONT } from '../lib/chatFonts'

// A single shared document, not per-device localStorage — chat background,
// font, bubble colors, avatars, and preferred names are things the two of us
// each set for ourselves but that the other should see live, so one shared
// doc (rather than per-account state) is what both Chat and Settings read from.
const STORAGE_KEY = 'you-are-my-home:chat-settings'
const DEFAULT_SETTINGS = {
  background: DEFAULT_CHAT_BACKGROUND,
  font: DEFAULT_CHAT_FONT,
  bubbleColors: {},
  avatars: {},
  preferredNames: {},
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

function writeLocal(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // storage full or unavailable — preview-only, safe to ignore
  }
}

export function useChatSettings() {
  const [settings, setSettings] = useState(firebaseReady ? DEFAULT_SETTINGS : readLocal)

  useEffect(() => {
    if (!firebaseReady) return
    return onSnapshot(doc(db, 'settings', 'chat'), (snap) => {
      setSettings(snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : DEFAULT_SETTINGS)
    })
  }, [])

  async function updateSettings(partial) {
    const next = {
      ...settings,
      ...partial,
      bubbleColors: partial.bubbleColors
        ? { ...settings.bubbleColors, ...partial.bubbleColors }
        : settings.bubbleColors,
      avatars: partial.avatars ? { ...settings.avatars, ...partial.avatars } : settings.avatars,
      preferredNames: partial.preferredNames
        ? { ...settings.preferredNames, ...partial.preferredNames }
        : settings.preferredNames,
    }
    setSettings(next)
    if (!firebaseReady) {
      writeLocal(next)
      return
    }
    await setDoc(doc(db, 'settings', 'chat'), partial, { merge: true })
  }

  return [settings, updateSettings]
}
