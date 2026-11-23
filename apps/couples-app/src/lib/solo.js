import { readDemoList, writeDemoList } from './demoStore'

// Play Solo: a match against the computer, kept in this device's storage only —
// never in Firestore/RTDB — so it can't disturb (or notify) a partner match and
// isn't filed in Past Games. Each game keeps its own solo save under its own key.
export const COMPUTER_UID = 'computer'
export const COMPUTER_LABEL = 'Computer'

// The saved solo match for a game (null when there isn't one). Solo saves are
// stored as a one-item list, the same shape the preview-mode stores use.
export function readSolo(key) {
  return readDemoList(key)[0] || null
}

export function writeSolo(key, value) {
  writeDemoList(key, value ? [value] : [])
}

// Whether a solo match is still being played, so reopening a game drops
// straight back into it. `isLive` decides what counts as in progress.
export function soloInProgress(key, isLive = (match) => match?.status === 'playing') {
  return isLive(readSolo(key))
}
