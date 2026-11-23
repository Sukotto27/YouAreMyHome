import { useEffect, useRef, useState } from 'react'
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from './usePartnerUid'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { archiveGame } from '../lib/gameHistory'
import {
  ON_BOARD_MIN,
  TARGET_SCORE,
  applyBank,
  applyFarkle,
  autoKeep,
  hasAnyScore,
  keepHistoryEntry,
  layoutDice,
  rollDice,
  scoreSelection,
} from '../lib/farkle'

export const DEMO_PARTNER_UID = 'demo-partner'
// The computer opponent in Play Solo. A solo match lives only in this device's
// storage (never Firestore), so it can't disturb — or notify — a partner match.
export const COMPUTER_UID = 'computer'
const DEMO_KEY = 'farkleGame'
const SOLO_KEY = 'farkleSoloGame'

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
    // Bumped on every roll: both screens toss the dice when it changes, and
    // the live (drag/select) channel is tied to it so a stale selection from
    // the previous roll is never shown on the new one.
    rollId: 0,
    layout: [],
    // Dice already set aside this turn (their values), shown in the kept column.
    keptDice: [],
    // Who made the last write. A turn only "waits on you" once your PARTNER
    // handed it over — starting a match yourself leaves the turn pointed at
    // you too, which used to read as "Cristina played — your turn".
    lastActorUid: startingUid,
    history: [],
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

function readSoloGame() {
  const raw = readDemoList(SOLO_KEY)
  return Array.isArray(raw) ? null : raw
}

// True when a solo match is in progress, so reopening Farkle drops straight back into it.
export function hasSoloGameInProgress() {
  return readSoloGame()?.status === 'playing'
}

// A single, ever-live shared match (one Firestore doc, not per-round docs)
// — both partners watch the same board update in real time, same "watch
// over their shoulder" feel as Draw's live canvas, just turn-gated instead
// of simultaneous. See lib/farkle.js for the scoring rules this enforces.
export function useFarkle(solo = false) {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  // Solo and preview mode both play on this device, against a bot.
  const local = solo || !firebaseReady
  const storeKey = solo ? SOLO_KEY : DEMO_KEY
  const botUid = solo ? COMPUTER_UID : DEMO_PARTNER_UID
  const effectivePartnerUid = solo ? COMPUTER_UID : firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const [game, setGame] = useState(solo ? readSoloGame() : firebaseReady ? null : readDemoGame(user?.uid))
  const demoPlayingRef = useRef(false)

  useEffect(() => {
    if (solo) {
      setGame(readSoloGame())
      return
    }
    if (!firebaseReady) {
      setGame(readDemoGame(user?.uid))
      return
    }
    setGame(null)
    return onSnapshot(gameDocRef(), (snap) => {
      setGame(snap.exists() ? snap.data() : null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solo])

  // `toSolo` lets a start/cancel target the solo store before the `solo` flag
  // itself has flipped on the next render.
  async function write(next, toSolo = solo) {
    if (toSolo || !firebaseReady) {
      setGame(next)
      writeDemoList(toSolo ? SOLO_KEY : DEMO_KEY, next)
      return
    }
    await setDoc(gameDocRef(), { ...next, updatedAt: serverTimestamp() })
  }

  const myTurn = !!game && game.status === 'playing' && game.currentTurnUid === user?.uid

  // Files the current match in game history before it is replaced/deleted.
  function archiveCurrent() {
    if (solo || !game || !Object.values(game.scores || {}).some((s) => s > 0)) return
    archiveGame('farkle', { scores: game.scores, winnerUid: game.winnerUid || null, status: game.status })
  }

  async function startGame(asSolo = solo) {
    if (!user) return
    archiveCurrent()
    await write(freshGame(user.uid), asSolo)
  }

  // Two different escapes from a stuck/unwanted match: startGame (above)
  // immediately begins a fresh one, while this one just ends the current
  // match with nobody's turn pending, dropping both of you back to the
  // "Start Farkle" screen — the only way out used to be finishing a match
  // normally, which left no exit if you were mid-game and just wanted out
  // (e.g. genuinely stuck waiting on a turn that isn't coming).
  async function cancelGame() {
    archiveCurrent()
    if (!firebaseReady || solo) {
      setGame(null)
      writeDemoList(storeKey, [])
      return
    }
    await deleteDoc(gameDocRef())
  }

  // Sets the chosen dice aside as scored this roll, returning the next game
  // state (or null if the choice doesn't score). Validated fresh here rather
  // than trusted from an earlier client read.
  function commitKeep(from, selectedValues) {
    const { valid, score } = scoreSelection(selectedValues)
    if (!valid || selectedValues.length === 0) return null
    const remaining = from.dicePool - selectedValues.length
    // Hot dice: every die on the table scored, so the next roll starts back
    // at a fresh six without ending the turn.
    const nextPool = remaining === 0 ? 6 : remaining
    const turnScore = from.turnScore + score
    return {
      ...from,
      turnScore,
      dicePool: nextPool,
      keptDice: [...(from.keptDice || []), ...selectedValues],
      history: [...(from.history || []), keepHistoryEntry(user.uid, selectedValues, turnScore, remaining === 0)],
      lastRoll: null,
      lastRollByUid: null,
      lastActorUid: user.uid,
      awaitingKeep: false,
    }
  }

  // Rolling is also how you confirm what you set aside: with dice waiting to
  // be kept, `selectedValues` (the dice you pulled to the keep area) are kept
  // and the rest are rolled in the same move.
  async function roll(selectedValues) {
    if (!myTurn) return
    let base = game
    if (game.awaitingKeep) {
      base = commitKeep(game, selectedValues || [])
      if (!base) return
    }
    const values = rollDice(base.dicePool)
    const rolled = {
      lastRoll: values,
      lastRollByUid: user.uid,
      rollId: (game.rollId || 0) + 1,
      layout: layoutDice(values.length),
    }
    // Hot dice (all six scored last time) start a fresh set, so the kept
    // dice are emptied the moment the next roll is thrown.
    const keptDice = base.dicePool === 6 ? [] : base.keptDice || []
    if (!hasAnyScore(values)) {
      await write({ ...applyFarkle({ ...base, keptDice }, user.uid, effectivePartnerUid, values), ...rolled })
      return
    }
    await write({ ...base, ...rolled, keptDice, lastActorUid: user.uid, awaitingKeep: true })
  }

  // Bank the turn. With dice waiting to be kept, the dice you pulled to the
  // keep area count too.
  async function bank(selectedValues) {
    if (!myTurn) return
    let base = game
    if (game.awaitingKeep) {
      base = commitKeep(game, selectedValues || [])
      if (!base) return
    }
    if (base.turnScore <= 0) return
    const alreadyOnBoard = (game.scores[user.uid] || 0) > 0
    if (!alreadyOnBoard && base.turnScore < ON_BOARD_MIN) return
    await write(applyBank(base, user.uid, effectivePartnerUid))
  }

  // Preview mode has no second device to play the opponent's turn, so once
  // it becomes DEMO_PARTNER_UID's turn, this plays it out with a simple
  // "keep everything that scores, bank once turnScore is decent" bot —
  // otherwise the board would just sit waiting forever with nothing to
  // preview. Mirrors the real actions above but writes directly, since the
  // real ones are gated on `myTurn` (the actual signed-in user, never the
  // demo stand-in).
  useEffect(() => {
    if (!local || !user) return
    if (!game || game.status !== 'playing' || game.currentTurnUid !== botUid) {
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
      const keptSoFar = current.dicePool === 6 ? [] : current.keptDice || []
      const rolled = {
        lastRoll: values,
        lastRollByUid: botUid,
        rollId: (current.rollId || 0) + 1,
        layout: layoutDice(values.length),
      }
      if (!hasAnyScore(values)) {
        const next = { ...applyFarkle({ ...current, keptDice: keptSoFar }, botUid, user.uid, values), ...rolled }
        setGame(next)
        writeDemoList(storeKey, next)
        demoPlayingRef.current = false
        return
      }

      // Show the toss first, then set the scoring dice aside a moment later.
      const tossed = { ...current, ...rolled, keptDice: keptSoFar, lastActorUid: botUid, awaitingKeep: true }
      setGame(tossed)
      writeDemoList(storeKey, tossed)
      await new Promise((resolve) => setTimeout(resolve, 1600))
      if (cancelled) return

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
        keptDice: [...keptSoFar, ...kept],
        history: [
          ...(current.history || []),
          keepHistoryEntry(botUid, kept, current.turnScore + score, remaining === 0),
        ],
        lastRoll: null,
        lastRollByUid: null,
        lastActorUid: botUid,
        awaitingKeep: false,
      }
      setGame(afterKeep)
      writeDemoList(storeKey, afterKeep)

      await new Promise((resolve) => setTimeout(resolve, 900))
      if (cancelled) return

      const onBoard = (current.scores[botUid] || 0) > 0
      const canBank = onBoard || afterKeep.turnScore >= ON_BOARD_MIN
      const shouldBank = canBank && (afterKeep.turnScore >= 300 || afterKeep.dicePool <= 2)

      if (shouldBank) {
        const next = applyBank(afterKeep, botUid, user.uid)
        setGame(next)
        writeDemoList(storeKey, next)
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
  }, [game?.currentTurnUid, game?.status, user, solo])

  return {
    game,
    myTurn,
    opponentUid: effectivePartnerUid,
    onBoardMin: ON_BOARD_MIN,
    targetScore: TARGET_SCORE,
    startGame,
    cancelGame,
    roll,
    bank,
  }
}
