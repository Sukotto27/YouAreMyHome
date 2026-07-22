import { useEffect, useRef, useState } from 'react'
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import {
  ON_BOARD_MIN,
  TARGET_SCORE,
  applyBank,
  applyFarkle,
  autoKeep,
  hasAnyScore,
  rollDice,
  scoreSelection,
} from '../lib/farkle'

export const DEMO_PARTNER_UID = 'demo-partner'
const DEMO_KEY = 'farkleGame'

// `db` is null in preview mode (no Firebase config) — this ref must only
// ever be constructed once firebaseReady has already been checked, never at
// module scope, or building it would throw before the demo fallback path
// even runs.
function gameDocRef() {
  return doc(db, 'farkleGame', 'match')
}

function freshGame(startingUid) {
  return {
    scores: {},
    currentTurnUid: startingUid,
    turnScore: 0,
    dicePool: 6,
    lastRoll: null,
    lastRollByUid: null,
    awaitingKeep: false,
    finalRoundUid: null,
    winnerUid: null,
    status: 'playing',
  }
}

function readDemoGame(uid) {
  const raw = readDemoList(DEMO_KEY)
  return Array.isArray(raw) ? freshGame(uid) : raw
}

// A single, ever-live shared match (one Firestore doc, not per-round docs)
// — both partners watch the same board update in real time, same "watch
// over their shoulder" feel as Draw's live canvas, just turn-gated instead
// of simultaneous. See lib/farkle.js for the scoring rules this enforces.
export function useFarkle() {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const effectivePartnerUid = firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const [game, setGame] = useState(firebaseReady ? null : readDemoGame(user?.uid))
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
    if (!user) return
    await write(freshGame(user.uid))
  }

  // Two different escapes from a stuck/unwanted match: startGame (above)
  // immediately begins a fresh one, while this one just ends the current
  // match with nobody's turn pending, dropping both of you back to the
  // "Start Farkle" screen — the only way out used to be finishing a match
  // normally, which left no exit if you were mid-game and just wanted out
  // (e.g. genuinely stuck waiting on a turn that isn't coming).
  async function cancelGame() {
    if (!firebaseReady) {
      setGame(null)
      writeDemoList(DEMO_KEY, [])
      return
    }
    await deleteDoc(gameDocRef())
  }

  async function roll() {
    if (!myTurn || game.awaitingKeep) return
    const values = rollDice(game.dicePool)
    if (!hasAnyScore(values)) {
      await write({
        ...applyFarkle(game, user.uid, effectivePartnerUid),
        lastRoll: values,
        lastRollByUid: user.uid,
      })
      return
    }
    await write({ ...game, lastRoll: values, lastRollByUid: user.uid, awaitingKeep: true })
  }

  // `selectedValues` is the multiset of dice (from game.lastRoll) the player
  // is setting aside as scored this round — validated fresh here rather
  // than trusted from an earlier client read.
  async function keepSelected(selectedValues) {
    if (!myTurn || !game.awaitingKeep) return
    const { valid, score } = scoreSelection(selectedValues)
    if (!valid) return

    const remaining = game.dicePool - selectedValues.length
    // Hot dice: every die on the table scored, so the next roll starts back
    // at a fresh six without ending the turn.
    const nextPool = remaining === 0 ? 6 : remaining

    await write({
      ...game,
      turnScore: game.turnScore + score,
      dicePool: nextPool,
      lastRoll: null,
      lastRollByUid: null,
      awaitingKeep: false,
    })
  }

  async function bank() {
    if (!myTurn || game.awaitingKeep || game.turnScore <= 0) return
    const alreadyOnBoard = (game.scores[user.uid] || 0) > 0
    if (!alreadyOnBoard && game.turnScore < ON_BOARD_MIN) return
    await write(applyBank(game, user.uid, effectivePartnerUid))
  }

  // Preview mode has no second device to play the opponent's turn, so once
  // it becomes DEMO_PARTNER_UID's turn, this plays it out with a simple
  // "keep everything that scores, bank once turnScore is decent" bot —
  // otherwise the board would just sit waiting forever with nothing to
  // preview. Mirrors the real actions above but writes directly, since the
  // real ones are gated on `myTurn` (the actual signed-in user, never the
  // demo stand-in).
  useEffect(() => {
    if (firebaseReady || !user) return
    if (!game || game.status !== 'playing' || game.currentTurnUid !== DEMO_PARTNER_UID) {
      demoPlayingRef.current = false
      return
    }
    if (demoPlayingRef.current) return
    demoPlayingRef.current = true
    let cancelled = false

    async function playTurn(current) {
      await new Promise((resolve) => setTimeout(resolve, 1100))
      if (cancelled) return

      const values = rollDice(current.dicePool)
      if (!hasAnyScore(values)) {
        const next = { ...applyFarkle(current, DEMO_PARTNER_UID, user.uid), lastRoll: values, lastRollByUid: DEMO_PARTNER_UID }
        setGame(next)
        writeDemoList(DEMO_KEY, next)
        demoPlayingRef.current = false
        return
      }

      const kept = autoKeep(values)
      const { score } = scoreSelection(kept)
      const remaining = current.dicePool - kept.length
      // lastRoll must be cleared (not left set to `values`) on a successful
      // keep — a populated lastRoll with awaitingKeep:false is exactly the
      // signal FarkleGame uses to show "you farkled," so leaving it set here
      // would make every ordinary demo-bot keep display as a bust.
      const afterKeep = {
        ...current,
        turnScore: current.turnScore + score,
        dicePool: remaining === 0 ? 6 : remaining,
        lastRoll: null,
        lastRollByUid: null,
        awaitingKeep: false,
      }
      setGame(afterKeep)
      writeDemoList(DEMO_KEY, afterKeep)

      await new Promise((resolve) => setTimeout(resolve, 900))
      if (cancelled) return

      const onBoard = (current.scores[DEMO_PARTNER_UID] || 0) > 0
      const canBank = onBoard || afterKeep.turnScore >= ON_BOARD_MIN
      const shouldBank = canBank && (afterKeep.turnScore >= 300 || afterKeep.dicePool <= 2)

      if (shouldBank) {
        const next = applyBank(afterKeep, DEMO_PARTNER_UID, user.uid)
        setGame(next)
        writeDemoList(DEMO_KEY, next)
        demoPlayingRef.current = false
        return
      }

      await playTurn(afterKeep)
    }

    playTurn(game)
    return () => {
      cancelled = true
    }
    // Deliberately NOT keyed on the whole `game` object — the bot's own
    // setGame calls (every roll/keep) would otherwise change `game` and
    // re-run this effect mid-turn, tearing down the in-flight recursive
    // playTurn loop (marking it cancelled) while demoPlayingRef stays stuck
    // true forever, since it's only ever reset on that loop's normal
    // completion path. currentTurnUid/status are the only things that
    // actually need to restart this effect (a turn changing hands, or the
    // match starting/finishing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.currentTurnUid, game?.status, user])

  return {
    game,
    myTurn,
    onBoardMin: ON_BOARD_MIN,
    targetScore: TARGET_SCORE,
    startGame,
    cancelGame,
    roll,
    keepSelected,
    bank,
  }
}
