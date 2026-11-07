import { createContext, useContext, useEffect, useState } from 'react'
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { onValue, ref } from 'firebase/database'
import { db, rtdb, firebaseReady } from '../firebase'
import { useAuth } from './AuthContext'
import { useGameInvite } from '../hooks/useGameInvite'
import { usePartnerUid } from '../hooks/usePartnerUid'
import { readDemoList } from '../lib/demoStore'

// "Does either game need me right now?" — one place that watches every game
// for the two things worth a badge, so the Games nav icon, each game's card
// and the partner's avatar on Home all agree:
//   • an invite — your partner tapped "Invite partner" for a game
//   • a turn   — your partner is waiting on you inside a game (Farkle/Uno
//     turn, a blank to fill in the Story, a line to add to the Song, a Mad Lib
//     they've answered that you haven't, a Cards Against Couples card to play)
// Live realtime games (Pong, Rock Paper Scissors, ...) only get the invite
// badge — a match left running isn't "waiting on you" in a useful way.
//
// Mounted once in Shell (like useGameInvite's popup) so it holds a single set
// of listeners no matter how many components read it.
const GameAttentionContext = createContext({ byGame: {}, any: false, invite: null, markGameOpened: () => {} })

const INVITE_STALE_MS = 30 * 60 * 1000
const SEEN_KEY = 'you-are-my-home:game-invites-seen'
const DEMO_POLL_MS = 1500

function toMillis(value) {
  if (!value) return null
  if (typeof value.toMillis === 'function') return value.toMillis()
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

function loadSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

const asObject = (value) => (value && !Array.isArray(value) ? value : null)

// Reads the demo-mode (localStorage) copy of every game so the badges can be
// tried without Firebase. Polled, since localStorage isn't reactive.
function readDemoRaw() {
  const cac = readDemoList('cardsAgainstCouplesMatch')
  const story = readDemoList('storyTurns')
  const song = readDemoList('songTurns')
  return {
    farkle: asObject(readDemoList('farkleGame')),
    uno: asObject(readDemoList('unoGame')),
    storyLast: Array.isArray(story) ? story[story.length - 1] || null : null,
    songLast: Array.isArray(song) ? song[song.length - 1] || null : null,
    madLibs: asObject(readDemoList('madLibs')) || {},
    cac: Array.isArray(cac) ? cac[0] || null : null,
  }
}

function deriveTurns(raw, me, partner) {
  const turns = {}
  if (!me) return turns
  if (raw.farkle?.status === 'playing' && raw.farkle.currentTurnUid === me) turns.farkle = true
  if (raw.uno?.status === 'playing' && raw.uno.currentTurnUid === me) turns.uno = true
  // Story: the latest turn still has an unfilled blank that isn't mine to leave.
  if (raw.storyLast && !raw.storyLast.filledWord && raw.storyLast.authorUid !== me) turns.story = true
  // Song: the last line was my partner's, so it's my line next.
  if (raw.songLast && raw.songLast.authorUid !== me) turns.song = true
  // Mad Libs: they've filled one in that I haven't answered yet.
  if (partner && Object.values(raw.madLibs || {}).some((s) => s?.answers?.[partner] && !s.answers?.[me])) {
    turns.madlibs = true
  }
  const cac = raw.cac
  if (cac && cac.status !== 'ended' && partner) {
    if (cac.phase === 'pick' && cac.picks?.[partner] !== undefined && cac.picks?.[me] === undefined) turns.cac = true
    if (cac.phase === 'reveal' && cac.ready?.[partner] && !cac.ready?.[me]) turns.cac = true
  }
  return turns
}

export function GameAttentionProvider({ children }) {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const { incoming } = useGameInvite()
  const [raw, setRaw] = useState(() => (firebaseReady ? {} : readDemoRaw()))
  const [seen, setSeen] = useState(loadSeen)

  useEffect(() => {
    if (!user) return
    if (!firebaseReady) {
      const timer = setInterval(() => setRaw(readDemoRaw()), DEMO_POLL_MS)
      return () => clearInterval(timer)
    }
    const patch = (key) => (value) => setRaw((prev) => ({ ...prev, [key]: value }))
    const lastOf = (name, key) =>
      onSnapshot(query(collection(db, name), orderBy('order', 'desc'), limit(1)), (snap) =>
        patch(key)(snap.docs[0]?.data() || null),
      )
    const unsubscribers = [
      onSnapshot(doc(db, 'farkleGame', 'match'), (snap) => patch('farkle')(snap.exists() ? snap.data() : null)),
      onSnapshot(doc(db, 'unoGame', 'match'), (snap) => patch('uno')(snap.exists() ? snap.data() : null)),
      lastOf('storyTurns', 'storyLast'),
      lastOf('songTurns', 'songLast'),
      onSnapshot(collection(db, 'madLibs'), (snap) => {
        const next = {}
        snap.docs.forEach((d) => {
          next[d.id] = d.data()
        })
        patch('madLibs')(next)
      }),
      onValue(ref(rtdb, 'cardsAgainstCouples/match'), (snap) => patch('cac')(snap.val())),
    ]
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [user])

  // The invite still counts until you open that game, or it goes stale —
  // "Not now" on the popup deliberately leaves the badge as a reminder.
  const createdMs = toMillis(incoming?.createdAt)
  const pendingInvite =
    incoming && createdMs && Date.now() - createdMs < INVITE_STALE_MS && !seen.has(incoming.id) ? incoming : null

  function markGameOpened(game) {
    if (!incoming || incoming.game !== game || seen.has(incoming.id)) return
    const next = new Set(seen).add(incoming.id)
    setSeen(next)
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...next].slice(-50)))
    } catch {
      // storage unavailable — the badge just reappears on reload
    }
  }

  const byGame = {}
  for (const game of Object.keys(deriveTurns(raw, user?.uid, partnerUid))) byGame[game] = 'turn'
  if (pendingInvite?.game) byGame[pendingInvite.game] = 'invite' // an invite outranks a turn

  const value = { byGame, any: Object.keys(byGame).length > 0, invite: pendingInvite, markGameOpened }
  return <GameAttentionContext.Provider value={value}>{children}</GameAttentionContext.Provider>
}

export function useGameAttention() {
  return useContext(GameAttentionContext)
}
