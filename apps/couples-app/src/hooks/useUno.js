import { useEffect, useRef, useState } from 'react'
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { COLORS, canPlayCard, chooseColor as chooseColorPure, dealGame, drawCard, passTurn, playCard } from '../lib/uno'

export const DEMO_PARTNER_UID = 'demo-partner'
const DEMO_KEY = 'unoGame'

// `db` is null in preview mode — this ref must only ever be constructed
// once firebaseReady has already been checked, never at module scope.
function gameDocRef() {
  return doc(db, 'unoGame', 'match')
}

function readDemoGame() {
  const raw = readDemoList(DEMO_KEY)
  return Array.isArray(raw) ? null : raw
}

// A single ever-live shared match, same pattern as useFarkle: one Firestore
// doc both partners watch update in real time, turn-gated.
export function useUno() {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const effectivePartnerUid = firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const [game, setGame] = useState(firebaseReady ? null : readDemoGame())
  const demoPlayingRef = useRef(false)

  useEffect(() => {
    if (!firebaseReady) return
    return onSnapshot(gameDocRef(), (snap) => {
      setGame(snap.exists() ? snap.data() : null)
    })
  }, [])

  async function write(next) {
    if (!firebaseReady) {
      setGame(next)
      writeDemoList(DEMO_KEY, next)
      return
    }
    await setDoc(gameDocRef(), { ...next, updatedAt: serverTimestamp() })
  }

  const myTurn = !!game && game.status === 'playing' && game.currentTurnUid === user?.uid

  async function startGame() {
    if (!user || !effectivePartnerUid) return
    await write(dealGame(user.uid, effectivePartnerUid, user.uid))
  }

  async function cancelGame() {
    if (!firebaseReady) {
      setGame(null)
      writeDemoList(DEMO_KEY, null)
      return
    }
    await deleteDoc(gameDocRef())
  }

  async function play(cardId) {
    if (!myTurn || game.awaitingColor) return
    const next = playCard(game, user.uid, effectivePartnerUid, cardId)
    if (next === game) return
    await write(next)
  }

  async function chooseColor(color) {
    if (!game || game.awaitingColorUid !== user?.uid) return
    const next = chooseColorPure(game, user.uid, effectivePartnerUid, color)
    if (next === game) return
    await write(next)
  }

  async function draw() {
    if (!myTurn || game.awaitingColor || game.drawnThisTurn) return
    await write(drawCard(game, user.uid))
  }

  async function pass() {
    if (!myTurn || game.awaitingColor || !game.drawnThisTurn) return
    await write(passTurn(game, user.uid, effectivePartnerUid))
  }

  // Preview mode has no second device to play the opponent's turn — this
  // plays it out with a simple "play the first legal card, otherwise draw
  // and try that" bot, mirroring useFarkle's stand-in partner. Writes
  // directly (bypassing the myTurn-gated actions above, which are gated on
  // the real signed-in user, never the demo stand-in).
  useEffect(() => {
    if (firebaseReady || !user) return
    if (!game || game.status !== 'playing' || game.currentTurnUid !== DEMO_PARTNER_UID) {
      demoPlayingRef.current = false
      return
    }
    if (demoPlayingRef.current) return
    demoPlayingRef.current = true
    let cancelled = false

    function commit(next) {
      setGame(next)
      writeDemoList(DEMO_KEY, next)
    }

    async function playTurn(current) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      if (cancelled) return

      const topCard = current.discard[current.discard.length - 1]
      const hand = current.hands[DEMO_PARTNER_UID]
      const playable = hand.find((c) => canPlayCard(c, topCard, current.currentColor))

      let afterPlay
      if (playable) {
        afterPlay = playCard(current, DEMO_PARTNER_UID, user.uid, playable.id)
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500))
        if (cancelled) return
        const drawn = drawCard(current, DEMO_PARTNER_UID)
        const drawnHand = drawn.hands[DEMO_PARTNER_UID]
        const newCard = drawnHand[drawnHand.length - 1]
        if (canPlayCard(newCard, topCard, current.currentColor)) {
          afterPlay = playCard(drawn, DEMO_PARTNER_UID, user.uid, newCard.id)
        } else {
          commit(passTurn(drawn, DEMO_PARTNER_UID, user.uid))
          demoPlayingRef.current = false
          return
        }
      }

      if (afterPlay.awaitingColor && afterPlay.awaitingColorUid === DEMO_PARTNER_UID) {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)]
        afterPlay = chooseColorPure(afterPlay, DEMO_PARTNER_UID, user.uid, color)
      }
      commit(afterPlay)

      if (afterPlay.status === 'finished') {
        demoPlayingRef.current = false
        return
      }
      if (afterPlay.currentTurnUid === DEMO_PARTNER_UID) {
        await playTurn(afterPlay)
        return
      }
      demoPlayingRef.current = false
    }

    playTurn(game)
    return () => {
      cancelled = true
    }
    // Deliberately NOT keyed on the whole `game` object — see useFarkle's
    // identical guard for why (the bot's own commits would otherwise tear
    // down its in-flight recursive loop mid-turn).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.currentTurnUid, game?.status, user])

  return {
    game,
    myTurn,
    startGame,
    cancelGame,
    play,
    chooseColor,
    draw,
    pass,
  }
}
