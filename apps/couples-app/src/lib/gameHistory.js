import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { readDemoList, writeDemoList } from './demoStore'

// Every game that overwrites or deletes its match (Farkle, Uno, Cards Against
// Couples) first files a summary here, so nothing is lost when you start over
// or end a game. One flat `gameHistory` collection; `game` says which game.
// Never deleted — listed newest-first by PastGames.
//
//   farkle: { scores: {uid: n}, winnerUid, status }
//   uno:    { cards: {uid: handSize}, winnerUid, status }
//   cac:    { rounds: [{ prompt, answers: {uid: text}, comments: {uid: text} }] }
export async function archiveGame(game, summary) {
  const entry = { game, ...summary, endedAt: Date.now() }
  try {
    if (!firebaseReady) {
      writeDemoList('gameHistory', [entry, ...readDemoList('gameHistory')])
      return
    }
    await addDoc(collection(db, 'gameHistory'), { ...entry, createdAt: serverTimestamp() })
  } catch {
    // never let archiving block starting a new game
  }
}
