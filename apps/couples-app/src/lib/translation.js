// English -> Brazilian Portuguese lookup for single words (Bananagrams
// tap-and-hold). There's no bundled dictionary, so a word is looked up once
// from the free MyMemory service and remembered on this device. Only the bare
// word is sent (e.g. "rotten") — nothing about us or the game. Failures just
// resolve to null (offline, rate-limited, no answer) and the UI says so.

const CACHE_KEY = 'you-are-my-home:pt-word-cache'
const ENDPOINT = 'https://api.mymemory.translated.net/get'

let cache = null
const inflight = new Map()

function loadCache() {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    cache = {}
  }
  return cache
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // storage unavailable — it'll just be looked up again next time
  }
}

// Returns the Portuguese for `word`, or null if it couldn't be found.
export function translateWord(word) {
  const key = word.toLowerCase()
  const known = loadCache()[key]
  if (known) return Promise.resolve(known)
  if (inflight.has(key)) return inflight.get(key)

  const request = fetch(`${ENDPOINT}?q=${encodeURIComponent(key)}&langpair=en|pt-BR`)
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const text = data?.responseData?.translatedText?.trim().toLowerCase()
      // the service answers errors/limits as plain text, so reject those (an echo is fine: some words are spelled the same)
      if (!text || data.responseStatus !== 200 || /mymemory|invalid|quota/i.test(text)) return null
      loadCache()[key] = text
      saveCache()
      return text
    })
    .catch(() => null)
    .finally(() => inflight.delete(key))
  inflight.set(key, request)
  return request
}
