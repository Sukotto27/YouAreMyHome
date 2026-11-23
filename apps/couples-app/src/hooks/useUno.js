import { useEffect, useRef, useState } from 'react'
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { COMPUTER_UID, readSolo, writeSolo } from '../lib/solo'
import { archiveGame } from '../lib/gameHistory'
import { COLORS, canPlayCard, chooseColor as chooseColorPure, dealGame, drawCard, passTurn, playCard } from '../lib/uno'

export const DEMO_PARTNER_UID = 'demo-partner'
const DEMO_KEY = 'unoGame'
export const SOLO_KEY = 'unoSolo'

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
export function useUno(solo = false) {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  // Solo and preview mode both play on this device, against a bot.
  const local = solo || !firebaseReady
  const botUid = solo ? COMPUTER_UID : DEMO_PARTNER_UID
  const effectivePartnerUid = solo ? COMPUTER_UID : firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const [game, setGame] = useState(solo ? readSolo(SOLO_KEY) : firebaseReady ? null : readDemoGame())
  const demoPlayingRef = useRef(false)

  useEffect(() => {
    if (solo) {
      setGame(readSolo(SOLO_KEY))
      return
    }
    if (!firebaseReady) {
      setGame(readDemoGame())
      return
    }
    setGame(null)
    return onSnapshot(gameDocRef(), (snap) => {
      setGame(snap.exists() ? snap.data() : null)
    })
  }, [solo])

  function saveLocal(next, toSolo = solo) {
    setGame(next)
    if (toSolo) writeSolo(SOLO_KEY, next)
    else writeDemoList(DEMO_KEY, next)
  }

  // `toSolo` lets a start target the solo store before `solo` has flipped.
  async function write(next, toSolo = solo, actorUid = user.uid) {
    // lastActorUid: who just acted — a turn only waits on you once your partner
    // handed it over (see GameAttentionContext).
    if (toSolo || !firebaseReady) {
      saveLocal({ ...next, lastActorUid: actorUid }, toSolo)
      return
    }
    await setDoc(gameDocRef(), { ...next, lastActorUid: user.uid, updatedAt: serverTimestamp() })
  }

  const myTurn = !!game && game.status === 'playing' && game.currentTurnUid === user?.uid

  // Files the current match in game history before it is replaced/deleted.
  function archiveCurrent() {
    if (solo || !game?.hands) return
    archiveGame('uno', {
      cards: Object.fromEntries(Object.entries(game.hands).map(([uid, hand]) => [uid, hand.length])),
      winnerUid: game.winnerUid || null,
      status: game.status,
    })
  }

  async function startGame(asSolo = solo) {
    const rivalUid = asSolo ? COMPUTER_UID : effectivePartnerUid
    if (!user || !rivalUid) return
    archiveCurrent()
    await write(dealGame(user.uid, rivalUid, user.uid), asSolo)
  }

  async function cancelGame() {
    archiveCurrent()
    if (solo) {
      setGame(null)
      writeSolo(SOLO_KEY, null)
      return
    }
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
    if (!local || !user) return
    if (!game || game.status !== 'playing' || game.currentTurnUid !== botUid) {
      demoPlayingRef.current = false
      return
    }
    if (demoPlayingRef.current) return
    demoPlayingRef.current = true
    let cancelled = false

    function commit(next) {
      saveLocal({ ...next, lastActorUid: botUid })
    }

    async function playTurn(current) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      if (cancelled) return

      const topCard = current.discard[current.discard.length - 1]
      const hand = current.hands[botUid]
      const playable = hand.find((c) => canPlayCard(c, topCard, current.currentColor))

      let afterPlay
      if (playable) {
        afterPlay = playCard(current, botUid, user.uid, playable.id)
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500))
        if (cancelled) return
        const drawn = drawCard(current, botUid)
        const drawnHand = drawn.hands[botUid]
        const newCard = drawnHand[drawnHand.length - 1]
        if (canPlayCard(newCard, topCard, current.currentColor)) {
          afterPlay = playCard(drawn, botUid, user.uid, newCard.id)
        } else {
          commit(passTurn(drawn, botUid, user.uid))
          demoPlayingRef.current = false
          return
        }
      }

      if (afterPlay.awaitingColor && afterPlay.awaitingColorUid === botUid) {
        // Pick the colour the bot holds the most of.
        const held = afterPlay.hands[botUid]
        const color = COLORS.reduce((best, c) => {
          const count = held.filter((card) => card.color === c).length
          return count > best.count ? { c, count } : best
        }, { c: COLORS[Math.floor(Math.random() * COLORS.length)], count: 0 }).c
        afterPlay = chooseColorPure(afterPlay, botUid, user.uid, color)
      }
      commit(afterPlay)

      if (afterPlay.status === 'finished') {
        demoPlayingRef.current = false
        return
      }
      if (afterPlay.currentTurnUid === botUid) {
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
  }, [game?.currentTurnUid, game?.status, user, solo])

  return {
    game,
    myTurn,
    opponentUid: effectivePartnerUid,
    startGame,
    cancelGame,
    play,
    chooseColor,
    draw,
    pass,
  }
}
