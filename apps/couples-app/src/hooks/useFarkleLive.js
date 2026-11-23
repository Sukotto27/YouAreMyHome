import { useCallback, useEffect, useRef, useState } from 'react'
import { limitToLast, onValue, push, query, ref, remove, set } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'

// Everything about a Farkle roll that is "in motion" rather than a finished
// move: which dice are pulled aside, where a die was dragged to, and which die
// is in someone's fingers right now. It lives in Realtime Database (cheap,
// fast, throwaway) instead of the match doc, so your partner watches the dice
// move without every wiggle being a Firestore write.
//
// Shape of `farkle/live`:  { rollId, sel: "2,0,5" (order = rail order),
//                            pos: { [dieIndex]: { x, z } }, drag: { i, x, z } | null }
// `rollId` ties it to one roll of the match doc — anything stamped with a
// different rollId is ignored, so a leftover from the last roll never shows.
const LIVE_PATH = 'farkle/live'
const CHAT_PATH = 'farkle/chat'
const PUSH_MS = 45

const emptyLive = (rollId) => ({ rollId, sel: [], pos: {}, drag: null })

function parseRemote(raw, rollId) {
  if (!raw || raw.rollId !== rollId) return emptyLive(rollId)
  return {
    rollId,
    sel: raw.sel ? String(raw.sel).split(',').map(Number) : [],
    pos: raw.pos || {},
    drag: raw.drag || null,
  }
}

// `isActive` is true for whoever's roll it is: they own the state and publish
// it; the other player just mirrors it. `liveRef` is read every frame by the
// 3D table (no React re-render per drag move); `sel` is the same selection as
// React state, for the parts of the UI that show the selected score.
export function useFarkleLive(rollId, isActive) {
  const liveRef = useRef(emptyLive(rollId))
  const remoteRef = useRef(null)
  const rollIdRef = useRef(rollId)
  const activeRef = useRef(isActive)
  const timerRef = useRef(null)
  const [sel, setSel] = useState([])

  activeRef.current = isActive

  const applyRemote = useCallback(() => {
    if (activeRef.current) return
    const next = parseRemote(remoteRef.current, rollIdRef.current)
    liveRef.current = next
    setSel((prev) => (prev.join(',') === next.sel.join(',') ? prev : next.sel))
  }, [])

  useEffect(() => {
    if (!firebaseReady) return
    return onValue(ref(rtdb, LIVE_PATH), (snap) => {
      remoteRef.current = snap.val()
      applyRemote()
    })
  }, [applyRemote])

  // A new roll (or a change of whose roll it is) starts from a clean slate.
  useEffect(() => {
    rollIdRef.current = rollId
    if (isActive) {
      liveRef.current = emptyLive(rollId)
      setSel([])
    } else {
      applyRemote()
    }
  }, [rollId, isActive, applyRemote])

  const publish = useCallback(() => {
    timerRef.current = null
    if (!firebaseReady || !activeRef.current) return
    const live = liveRef.current
    set(ref(rtdb, LIVE_PATH), {
      rollId: live.rollId,
      sel: live.sel.join(','),
      pos: live.pos,
      drag: live.drag,
    }).catch(() => {})
  }, [])

  // Active player only. `change` mutates liveRef.current; `immediate` skips the
  // throttle (selection changes and drops, as opposed to a drag in progress).
  const mutate = useCallback(
    (change, { immediate = false } = {}) => {
      if (!activeRef.current) return
      const live = liveRef.current
      if (live.rollId !== rollIdRef.current) {
        liveRef.current = emptyLive(rollIdRef.current)
      }
      change(liveRef.current)
      setSel((prev) => (prev.join(',') === liveRef.current.sel.join(',') ? prev : [...liveRef.current.sel]))
      if (immediate) {
        if (timerRef.current) clearTimeout(timerRef.current)
        publish()
      } else if (!timerRef.current) {
        timerRef.current = setTimeout(publish, PUSH_MS)
      }
    },
    [publish],
  )

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  return { liveRef, sel, mutate }
}

// The little in-game chat under the table. Messages are throwaway (a match's
// banter, not part of the main chat), so they live in RTDB and are wiped when
// a new match starts.
export function useFarkleChat() {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])

  useEffect(() => {
    if (!firebaseReady) return
    return onValue(query(ref(rtdb, CHAT_PATH), limitToLast(60)), (snap) => {
      const next = []
      snap.forEach((child) => {
        next.push({ id: child.key, ...child.val() })
      })
      setMessages(next)
    })
  }, [])

  async function send(text) {
    const trimmed = text.trim().slice(0, 300)
    if (!trimmed || !user) return
    const message = { uid: user.uid, text: trimmed, at: Date.now() }
    if (!firebaseReady) {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), ...message }])
      return
    }
    await push(ref(rtdb, CHAT_PATH), message)
  }

  async function clear() {
    if (!firebaseReady) {
      setMessages([])
      return
    }
    await remove(ref(rtdb, CHAT_PATH)).catch(() => {})
    await remove(ref(rtdb, LIVE_PATH)).catch(() => {})
  }

  return { messages, send, clear }
}
