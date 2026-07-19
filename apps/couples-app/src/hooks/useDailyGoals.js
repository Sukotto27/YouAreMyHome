import { useEffect, useState } from 'react'
import { addDoc, arrayUnion, collection, deleteField, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { GOAL_CATEGORIES, todayKey } from '../lib/dailyGoals'

function readDemoMap(key) {
  const raw = readDemoList(key)
  return Array.isArray(raw) ? {} : raw
}

// Daily Goals are personal to each person (checking off "napped" is
// something only one of you did), but both partners can see each other's
// progress — so this reads/writes "my" checklist and separately
// read-subscribes to the partner's, discovered via the `presence`
// collection the same way usePartnerSeenAt.js already does.
export function useDailyGoals() {
  const { user } = useAuth()
  const date = todayKey()
  const [myChecked, setMyChecked] = useState(() => (user ? readDemoMap(`dailyGoals:${user.uid}:${date}`) : {}))
  const [partnerChecked, setPartnerChecked] = useState({})
  const partnerUid = usePartnerUid()
  const [customItems, setCustomItems] = useState(() => (user ? readDemoMap(`dailyGoalsCustom:${user.uid}`) : {}))
  const [partnerCustomItems, setPartnerCustomItems] = useState({})

  useEffect(() => {
    if (!firebaseReady || !user) return
    return onSnapshot(doc(db, 'dailyGoals', `${user.uid}_${date}`), (snap) => {
      setMyChecked(snap.data() || {})
    })
  }, [user, date])

  useEffect(() => {
    if (!firebaseReady || !partnerUid) {
      setPartnerChecked({})
      return
    }
    return onSnapshot(doc(db, 'dailyGoals', `${partnerUid}_${date}`), (snap) => {
      setPartnerChecked(snap.data() || {})
    })
  }, [partnerUid, date])

  useEffect(() => {
    if (!firebaseReady || !user) return
    return onSnapshot(doc(db, 'dailyGoalsCustom', user.uid), (snap) => {
      setCustomItems(snap.data() || {})
    })
  }, [user])

  useEffect(() => {
    if (!firebaseReady || !partnerUid) {
      setPartnerCustomItems({})
      return
    }
    return onSnapshot(doc(db, 'dailyGoalsCustom', partnerUid), (snap) => {
      setPartnerCustomItems(snap.data() || {})
    })
  }, [partnerUid])

  async function toggleItem(categoryId, itemId) {
    if (!user) return
    const key = `${categoryId}:${itemId}`
    const next = !myChecked[key]

    if (!firebaseReady) {
      const updated = { ...myChecked }
      if (next) updated[key] = true
      else delete updated[key]
      setMyChecked(updated)
      writeDemoList(`dailyGoals:${user.uid}:${date}`, updated)
      return
    }

    await setDoc(
      doc(db, 'dailyGoals', `${user.uid}_${date}`),
      { [key]: next ? true : deleteField() },
      { merge: true },
    )
  }

  async function addCustomItem(categoryId, label) {
    const trimmed = label.trim()
    if (!user || !trimmed) return
    const entry = { id: crypto.randomUUID(), label: trimmed }

    if (!firebaseReady) {
      const next = { ...customItems, [categoryId]: [...(customItems[categoryId] || []), entry] }
      setCustomItems(next)
      writeDemoList(`dailyGoalsCustom:${user.uid}`, next)
      return
    }

    await setDoc(doc(db, 'dailyGoalsCustom', user.uid), { [categoryId]: arrayUnion(entry) }, { merge: true })
  }

  // Marks the Nightly Routine "Daily Gratitude" item checked and logs the
  // actual text to the Journal timeline — unlike a plain checkbox, you can
  // add more than one gratitude entry per day, each becomes its own
  // Timeline entry (checking the box just means "at least one so far").
  async function addGratitudeEntry(text) {
    const trimmed = text.trim()
    if (!user || !trimmed) return
    const authorName = user.displayName || user.email
    const key = 'nightly-routine:gratitude'

    if (!firebaseReady) {
      const updated = { ...myChecked, [key]: true }
      setMyChecked(updated)
      writeDemoList(`dailyGoals:${user.uid}:${date}`, updated)
      const entries = readDemoList('journalEvents')
      writeDemoList('journalEvents', [
        {
          id: crypto.randomUUID(),
          type: 'gratitude',
          text: trimmed,
          authorUid: user.uid,
          authorName,
          createdAt: new Date().toISOString(),
        },
        ...entries,
      ])
      return
    }

    await Promise.all([
      setDoc(doc(db, 'dailyGoals', `${user.uid}_${date}`), { [key]: true }, { merge: true }),
      addDoc(collection(db, 'journalEvents'), {
        type: 'gratitude',
        text: trimmed,
        authorUid: user.uid,
        authorName,
        createdAt: serverTimestamp(),
      }),
    ])
  }

  function itemsForCategory(categoryId, mine = true) {
    const preset = GOAL_CATEGORIES.find((c) => c.id === categoryId)?.items || []
    const custom = (mine ? customItems : partnerCustomItems)[categoryId] || []
    return [...preset, ...custom]
  }

  return { myChecked, partnerChecked, toggleItem, addCustomItem, addGratitudeEntry, itemsForCategory }
}
