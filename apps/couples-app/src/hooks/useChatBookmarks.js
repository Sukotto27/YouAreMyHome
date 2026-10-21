import { useEffect, useState } from 'react'
import { deleteField, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { toDate } from '../lib/chatGrouping'
import { nextBookmarkColorIndex } from '../lib/bookmarkColors'

// One doc per person, `chatBookmarks/{uid}`, holding a flat
// { [messageId]: { color, at } } map — `color` is the palette index the
// bookmark was given, `at` is the bookmarked message's own timestamp (ms) so
// banners can be ordered oldest → newest even before that message is loaded.
// Unlike musicFavorites, nothing ever reads the partner's doc: your bookmarks
// are yours alone. Only message ids and these two numbers are stored — never
// message content.
const STORAGE_KEY = 'you-are-my-home:chat-bookmarks'

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
}

function writeLocal(bookmarks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks))
  } catch {
    // storage full/unavailable — preview-only, safe to ignore
  }
}

export function useChatBookmarks() {
  const { user } = useAuth()
  const uid = user?.uid
  const [bookmarks, setBookmarks] = useState(firebaseReady ? {} : readLocal)

  useEffect(() => {
    if (!firebaseReady || !uid) return
    return onSnapshot(doc(db, 'chatBookmarks', uid), (snap) => {
      setBookmarks(snap.data() || {})
    })
  }, [uid])

  function removeBookmark(messageId) {
    if (!firebaseReady) {
      setBookmarks((prev) => {
        const next = { ...prev }
        delete next[messageId]
        writeLocal(next)
        return next
      })
      return
    }
    if (!uid) return
    setDoc(doc(db, 'chatBookmarks', uid), { [messageId]: deleteField() }, { merge: true })
  }

  // Same action adds and removes, so a bookmark is taken off the same way it
  // was put on (long-press the message → Bookmark / Remove bookmark).
  function toggleBookmark(message) {
    if (bookmarks[message.id]) {
      removeBookmark(message.id)
      return
    }
    const entry = { color: nextBookmarkColorIndex(bookmarks), at: toDate(message.createdAt).getTime() }
    if (!firebaseReady) {
      setBookmarks((prev) => {
        const next = { ...prev, [message.id]: entry }
        writeLocal(next)
        return next
      })
      return
    }
    if (!uid) return
    setDoc(doc(db, 'chatBookmarks', uid), { [message.id]: entry }, { merge: true })
  }

  return { bookmarks, toggleBookmark, removeBookmark }
}
