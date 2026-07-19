// Firebase-free persistence for preview mode, so things saved on one page
// (like a scrapbook drawing) are still there after navigating to another
// page or reloading. Only used while firebaseReady is false.
const PREFIX = 'you-are-my-home:demo:'

export function readDemoList(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function writeDemoList(key, list) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(list))
  } catch {
    // storage full or unavailable — preview-only, safe to ignore
  }
}
