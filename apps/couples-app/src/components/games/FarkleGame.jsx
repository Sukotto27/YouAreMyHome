import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useWinCheer } from '../../hooks/useWinCheer'
import { useFarkle, hasSoloGameInProgress } from '../../hooks/useFarkle'
import { useFarkleChat, useFarkleLive } from '../../hooks/useFarkleLive'
import EndGameButton from './EndGameButton'
import GameIntro from './GameIntro'
import { scoreBreakdown, scoreSelection } from '../../lib/farkle'
import { myNameFor, partnerNameFor } from '../../lib/names'
import { playSound } from '../../lib/sounds'
import PastGames from './PastGames'
import StartPanel from './GameLobby'
import { DEFAULT_DICE_COLOR, DICE_COLORS } from './farkle/diceColors'

// The 3D table pulls in three.js and the dice model, so it loads on demand —
// only once a match is actually open.
const FarkleTable = lazy(() => import('./farkle/FarkleTable'))

const OVERLAY_MS = { keep: 1900, hot: 3200, bank: 3600, farkle: 3600 }

// Standard 6-dice Farkle (see lib/farkle.js for the exact scoring table) —
// a single ever-live shared match, not a library of separate rounds: both
// partners watch the same table update in real time, turn-gated the way you
// would passing dice back and forth in person. Every die you tap, drag, set
// aside or keep is mirrored live to the other screen (see useFarkleLive).
export default function FarkleGame({ onBack }) {
  const { user } = useAuth()
  // Solo = a match against the computer, kept on this device only.
  const [solo, setSolo] = useState(hasSoloGameInProgress)
  const { game, myTurn, opponentUid, onBoardMin, targetScore, startGame, cancelGame, roll, bank } = useFarkle(solo)
  const live = useFarkleLive(game?.rollId ?? 0, myTurn, solo)
  const chat = useFarkleChat()
  useWinCheer(game?.status === 'finished')
  const [confirmAction, setConfirmAction] = useState(null) // null | 'restart' | 'cancel'
  const [overlay, setOverlay] = useState(null)
  // Dice colour is a personal, per-device preference (the pack ships one texture per colour).
  const [diceColor, setDiceColor] = useState(() => {
    try {
      const saved = localStorage.getItem('farkleDiceColor')
      return DICE_COLORS.some((c) => c.key === saved) ? saved : DEFAULT_DICE_COLOR
    } catch {
      return DEFAULT_DICE_COLOR
    }
  })
  function chooseDiceColor(key) {
    setDiceColor(key)
    try {
      localStorage.setItem('farkleDiceColor', key)
    } catch {
      // storage unavailable — the choice just won't persist
    }
  }
  const seenHistoryRef = useRef(null)

  const effectivePartnerUid = opponentUid
  const mineLabel = myNameFor(user)
  const partnerLabel = solo ? 'Computer' : partnerNameFor(user)
  // Who someone is is always decided by uid, never by guessing from a name.
  const whoLabel = (uid) => (uid === user.uid ? 'You' : partnerLabel)

  // Arming "Start over"/"Cancel game" requires a second tap within a few
  // seconds — cheap insurance against a stray tap discarding a match that
  // both of you are still in, without needing a whole confirm modal.
  useEffect(() => {
    if (!confirmAction) return
    const timer = setTimeout(() => setConfirmAction(null), 4000)
    return () => clearTimeout(timer)
  }, [confirmAction])

  // A pop-up for each new keep / bank / farkle, on both screens. The first
  // snapshot of a match only records how much history already exists, so
  // opening the page never replays old events.
  const historyLength = game?.history?.length ?? null
  const latestEntry = historyLength ? game.history[historyLength - 1] : null
  useEffect(() => {
    if (historyLength === null) {
      seenHistoryRef.current = null
      return
    }
    const seen = seenHistoryRef.current
    seenHistoryRef.current = historyLength
    if (seen === null || historyLength <= seen || !latestEntry) return
    const who = latestEntry.uid === user.uid ? 'You' : partnerLabel
    let next
    if (latestEntry.kind === 'keep' && latestEntry.hot) {
      const name = latestEntry.uid === user.uid ? myNameFor(user) : partnerLabel
      next = {
        kind: 'hot',
        title: `${name} has ${latestEntry.turnScore.toLocaleString()} with all the dice!`,
        sub: 'Six fresh dice — roll them all again 🎲',
      }
    } else if (latestEntry.kind === 'keep') {
      next = {
        kind: 'keep',
        title: `${who} scored +${latestEntry.points.toLocaleString()}`,
        sub: scoreBreakdown(latestEntry.dice)
          .map((part) => part.label.toLowerCase())
          .join(' + '),
      }
    } else if (latestEntry.kind === 'bank') {
      next = {
        kind: 'bank',
        title: `${who} banked ${latestEntry.points.toLocaleString()}!`,
        sub:
          latestEntry.total >= targetScore
            ? `That's ${latestEntry.total.toLocaleString()} — past ${targetScore.toLocaleString()}!`
            : `Total: ${latestEntry.total.toLocaleString()}`,
      }
    } else {
      next = {
        kind: 'farkle',
        title: `${who} FARKLED!`,
        sub: latestEntry.lost > 0 ? `Lost ${latestEntry.lost.toLocaleString()} points` : 'Nothing scored on that roll',
      }
    }
    setOverlay({ ...next, id: `${historyLength}` })
    const timer = setTimeout(() => setOverlay((current) => (current?.id === `${historyLength}` ? null : current)), OVERLAY_MS[next.kind])
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLength])

  function handleResetClick(action) {
    if (confirmAction === action) {
      setConfirmAction(null)
      if (action === 'restart') (solo ? handleStartSolo() : handleStart())
      else handleCancel()
      return
    }
    setConfirmAction(action)
  }

  async function handleStart() {
    chat.clear()
    setSolo(false)
    await startGame(false)
  }

  async function handleStartSolo() {
    setSolo(true)
    await startGame(true)
  }

  async function handleCancel() {
    if (!solo) chat.clear()
    await cancelGame()
    setSolo(false)
  }

  // Dice pulled into the keep area (the live selection), as their values.
  function selectedValuesNow() {
    if (!game?.lastRoll) return []
    return live.sel.filter((i) => i >= 0 && i < game.lastRoll.length).map((i) => game.lastRoll[i])
  }

  // Rolling is also how you confirm what you set aside: the dice in the keep
  // area are kept, and the rest are rolled.
  async function handleRoll() {
    await roll(game.awaitingKeep ? selectedValuesNow() : undefined)
  }

  async function handleBank() {
    await bank(game.awaitingKeep ? selectedValuesNow() : undefined)
  }

  if (!game || game.status === 'finished') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-8 text-center sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="self-start font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
        >
          ← Games
        </button>
        {game?.status === 'finished' && (
          <FinishedBanner
            game={game}
            myUid={user.uid}
            partnerUid={effectivePartnerUid}
            mineLabel={mineLabel}
            partnerLabel={partnerLabel}
          />
        )}
        <h1 className="font-display text-3xl italic text-ink">Farkle</h1>
        <GameIntro gameKey="farkle" title="Farkle" defaultText={`Each player rolls a hand of 6 dice.
Set aside dice that score points, & reroll the rest if you dare.
Rolling no scoring dice cancels your score.
If all dice score, reroll the entire hand and stack your points.

Scoring:
1: 100 points.
5: 50 points.
3 of a kind: 100x dice value (except 1's).
3 1's: 1000 points.
Straight: 1500 points.
3 pairs: 1500 points.

First to ${targetScore.toLocaleString()} wins.`} />
        <StartPanel gameKey="farkle" label="Farkle" emoji="🎲" onStart={handleStart} onSolo={handleStartSolo} />
        {game?.history?.length > 0 && (
          <ScoreHistory game={game} myUid={user.uid} partnerUid={effectivePartnerUid} partnerLabel={partnerLabel} mineLabel={mineLabel} />
        )}
        <PastGames game="farkle" myUid={user.uid} partnerUid={effectivePartnerUid} partnerLabel={partnerLabel} />
      </div>
    )
  }

  const myScore = game.scores[user.uid] || 0
  const partnerScore = game.scores[effectivePartnerUid] || 0
  // The selection lives in the live channel (so your partner sees it too);
  // anything out of range for the current roll is ignored.
  const selectedIndices = game.lastRoll ? live.sel.filter((i) => i >= 0 && i < game.lastRoll.length) : []
  const selectionScore = game.lastRoll
    ? scoreSelection(selectedIndices.map((i) => game.lastRoll[i]))
    : { valid: false, score: 0 }
  const canKeep = myTurn && game.awaitingKeep && selectedIndices.length > 0 && selectionScore.valid
  const onBoard = myScore > 0
  // What the turn is worth right now, counting dice sitting in the keep area.
  const pendingScore = game.awaitingKeep && selectionScore.valid ? selectionScore.score : 0
  const turnTotal = game.turnScore + pendingScore
  const remainingDice = game.awaitingKeep ? game.dicePool - selectedIndices.length : game.dicePool
  const canBank =
    myTurn && (game.awaitingKeep ? canKeep : game.turnScore > 0) && turnTotal > 0 && (onBoard || turnTotal >= onBoardMin)
  // The row of mini dice under the active player's name: what they've kept
  // this turn, plus what's sitting in the keep area right now.
  const keptRow = game.keptDice || []
  const pendingRow = selectedValuesNow()
  // finalRoundUid is whoever gets the LAST turn — i.e. the player who has NOT
  // yet crossed the target. (This used to be read the other way round, which
  // announced that your partner had passed 10,000 when it was you.)
  const myFinalTurn = game.finalRoundUid === user.uid
  const turnerLabel = myTurn ? 'Your turn' : `${partnerLabel}'s turn`

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
        >
          ← Games
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleResetClick('restart')}
            className="font-body text-xs text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
          >
            {confirmAction === 'restart' ? 'Tap again to start over' : 'Start over'}
          </button>
          <EndGameButton onEnd={handleCancel} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ScoreCard
          label={mineLabel}
          score={myScore}
          active={game.currentTurnUid === user.uid}
          kept={keptRow}
          pending={pendingRow}
          turnTotal={turnTotal}
        />
        <ScoreCard
          label={partnerLabel}
          score={partnerScore}
          active={game.currentTurnUid === effectivePartnerUid}
          kept={keptRow}
          pending={pendingRow}
          turnTotal={turnTotal}
        />
      </div>

      <ScoreHistory game={game} myUid={user.uid} partnerUid={effectivePartnerUid} partnerLabel={partnerLabel} mineLabel={mineLabel} />

      {game.finalRoundUid && (
        <p className="text-center font-hand text-lg text-rose">
          {myFinalTurn
            ? `${partnerLabel} passed ${targetScore.toLocaleString()} — last shot: beat ${partnerScore.toLocaleString()} to win!`
            : `You passed ${targetScore.toLocaleString()}! ${partnerLabel} gets one last turn to beat ${myScore.toLocaleString()}.`}
        </p>
      )}

      <div className="rounded-3xl border border-ink/10 bg-white/50 p-6 text-center">
        <p className="font-hand text-lg text-ink-soft">
          {turnerLabel} · turn score {game.turnScore.toLocaleString()}
        </p>

        <div className="mt-4">
          <TableBoundary
            fallback={
              <FallbackDice
                game={game}
                selected={selectedIndices}
                canPick={myTurn && game.awaitingKeep}
                onToggle={(index) =>
                  live.mutate(
                    (state) => {
                      state.sel = state.sel.includes(index) ? state.sel.filter((i) => i !== index) : [...state.sel, index]
                    },
                    { immediate: true },
                  )
                }
              />
            }
          >
            <Suspense
              fallback={
                <div
                  className="flex w-full items-center justify-center rounded-2xl border border-ink/10 bg-white/40 font-hand text-ink-soft"
                  style={{ aspectRatio: '11 / 4' }}
                >
                  setting the table…
                </div>
              }
            >
              <FarkleTable
                game={game}
                canInteract={myTurn && game.awaitingKeep}
                liveRef={live.liveRef}
                mutate={live.mutate}
                onToss={() => playSound('dice_roll')}
                diceColor={diceColor}
              >
                {overlay && <EventOverlay overlay={overlay} />}
              </FarkleTable>
            </Suspense>
          </TableBoundary>
        </div>

        <div className="mt-2 flex items-center justify-center gap-1.5" role="radiogroup" aria-label="Dice colour">
          {DICE_COLORS.map((color) => (
            <button
              key={color.key}
              type="button"
              role="radio"
              aria-checked={diceColor === color.key}
              aria-label={`${color.label} dice`}
              title={color.label}
              onClick={() => chooseDiceColor(color.key)}
              className={`h-4 w-4 rounded-full border border-ink/30 transition-transform ${
                diceColor === color.key ? 'scale-125 ring-2 ring-rose ring-offset-1' : 'hover:scale-110'
              }`}
              style={{ backgroundColor: color.swatch }}
            />
          ))}
        </div>

        {game.lastRoll && !game.awaitingKeep && (
          <p className="mt-4 font-hand text-xl text-rose">
            {whoLabel(game.lastRollByUid)} farkled — nothing scored on that roll!
          </p>
        )}

        {game.awaitingKeep && (
          <p className="mt-3 font-body text-xs text-ink-soft">
            {!myTurn
              ? selectedIndices.length === 0
                ? `${partnerLabel} is deciding what to keep...`
                : selectionScore.valid
                  ? `${partnerLabel} has set aside dice worth ${selectionScore.score.toLocaleString()}...`
                  : `${partnerLabel} is picking dice to set aside...`
              : selectedIndices.length === 0
                ? 'Tap or drag the dice you want to keep into the bottom area, then press Roll'
                : selectionScore.valid
                  ? `Worth ${selectionScore.score.toLocaleString()} points — press Roll to keep them and roll the rest`
                  : "That selection doesn't score — only pick dice that form a valid combination"}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {myTurn && (
            <button
              type="button"
              onClick={handleRoll}
              disabled={game.awaitingKeep && !canKeep}
              className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {game.awaitingKeep
                ? remainingDice === 0
                  ? 'Roll all 6 again'
                  : `Roll ${remainingDice} ${remainingDice === 1 ? 'die' : 'dice'}`
                : game.turnScore > 0
                  ? 'Roll again'
                  : 'Roll'}
            </button>
          )}
          {canBank && (
            <button
              type="button"
              onClick={handleBank}
              className="rounded-full border border-rose px-6 py-2.5 font-body font-medium text-rose transition-colors hover:bg-blush-soft"
            >
              Bank {turnTotal.toLocaleString()} &amp; pass
            </button>
          )}
        </div>

        {!onBoard && myTurn && !game.awaitingKeep && game.turnScore > 0 && game.turnScore < onBoardMin && (
          <p className="mt-3 font-body text-xs text-ink-soft">
            Need {onBoardMin.toLocaleString()} in one turn to get on the board — keep rolling!
          </p>
        )}
        {!myTurn && !game.awaitingKeep && !game.lastRoll && (
          <p className="mt-4 font-hand text-lg text-ink-soft">waiting on {partnerLabel}...</p>
        )}
      </div>

      {!solo && <FarkleChat chat={chat} myUid={user.uid} partnerLabel={partnerLabel} />}
    </div>
  )
}

function FinishedBanner({ game, myUid, partnerUid, mineLabel, partnerLabel }) {
  const won = game.winnerUid === myUid
  return (
    <div className="rounded-3xl border border-rose/30 bg-blush-soft/50 px-6 py-4">
      <p className="font-display text-2xl italic text-ink">{won ? `${mineLabel} wins! 🎉` : `${partnerLabel} wins! 🎉`}</p>
      <p className="mt-1 font-body text-sm text-ink-soft">
        Final score — {mineLabel}: {(game.scores[myUid] || 0).toLocaleString()} · {partnerLabel}:{' '}
        {(game.scores[partnerUid] || 0).toLocaleString()}
      </p>
    </div>
  )
}

function ScoreCard({ label, score, active, kept, pending, turnTotal }) {
  const showRow = active && (kept.length > 0 || pending.length > 0)
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-center ${
        active ? 'border-rose bg-blush-soft/50' : 'border-ink/10 bg-white/50'
      }`}
    >
      <p className="font-body text-xs text-ink-soft">{label}</p>
      <p className="font-display text-2xl italic text-ink">{score.toLocaleString()}</p>
      <div className="mt-1 flex min-h-[22px] items-center justify-center gap-1">
        {showRow && (
          <>
            {kept.map((value, i) => (
              <MiniDie key={`k${i}`} value={value} />
            ))}
            {pending.map((value, i) => (
              <MiniDie key={`p${i}`} value={value} pending />
            ))}
            <span className="ml-1 font-body text-[11px] font-semibold text-ink-soft">{turnTotal.toLocaleString()}</span>
          </>
        )}
      </div>
    </div>
  )
}

// A tiny flat die for the "what they're keeping" row. Dice still in the keep
// area (not yet confirmed with Roll) get a rose outline.
function MiniDie({ value, pending }) {
  return (
    <span
      className={`grid h-[18px] w-[18px] shrink-0 grid-cols-3 grid-rows-3 gap-px rounded-[4px] border bg-white p-[2px] ${
        pending ? 'border-rose' : 'border-ink/25'
      }`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`rounded-full ${PIP_LAYOUTS[value]?.includes(i) ? 'bg-ink' : ''}`} />
      ))}
    </span>
  )
}

// ---- scoring history ------------------------------------------------------
// A score sheet, one column per player, worked out like you would on paper:
// each turn lists what was kept, adds it up, then (if it was banked) adds it
// to the running total as a column sum. A farkle just crosses the turn out.
function groupTurns(history) {
  const turns = []
  let current = null
  for (const entry of history) {
    if (!current || current.closed || current.uid !== entry.uid) {
      current = { uid: entry.uid, entries: [], closed: false }
      turns.push(current)
    }
    current.entries.push(entry)
    if (entry.kind === 'bank' || entry.kind === 'farkle') current.closed = true
  }
  return turns
}

function ScoreHistory({ game, myUid, partnerUid, partnerLabel, mineLabel }) {
  const [open, setOpen] = useState(false)
  const turns = groupTurns(game.history || [])
  const sheetFor = (uid) => turns.filter((turn) => turn.uid === uid).map((turn, i) => ({ ...turn, number: i + 1 }))
  const mine = sheetFor(myUid)
  // partnerUid can be unknown on the "finished" screen; fall back to "whoever isn't me".
  const partnerId = partnerUid || turns.find((turn) => turn.uid !== myUid)?.uid
  const theirs = partnerId ? sheetFor(partnerId) : []

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2 text-left font-body text-xs text-ink-soft"
      >
        <span>Scoring history{turns.length > 0 ? ` · ${turns.length} turn${turns.length === 1 ? '' : 's'}` : ''}</span>
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto border-t border-ink/10 px-3 py-3 text-left font-body text-xs text-ink">
          <SheetColumn
            name={mineLabel}
            sheet={mine}
            game={game}
            uid={myUid}
          />
          <SheetColumn name={partnerLabel} sheet={theirs} game={game} uid={partnerId} />
        </div>
      )}
    </div>
  )
}

function SheetColumn({ name, sheet, game, uid }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 border-b-2 border-ink/20 pb-1 text-center font-display text-sm italic">{name}</p>
      {sheet.length === 0 && <p className="text-center text-ink-soft">Nothing yet.</p>}
      <div className="space-y-3">
        {sheet.map((turn) => (
          <TurnSheet
            key={turn.number}
            turn={turn}
            inProgress={!turn.closed && game.status === 'playing' && game.currentTurnUid === uid}
          />
        ))}
      </div>
    </div>
  )
}

const num = (value) => value.toLocaleString()

function SumRow({ label, value, bold, tone }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 tabular-nums ${bold ? 'font-semibold' : ''} ${tone || ''}`}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0">{value}</span>
    </div>
  )
}

function TurnSheet({ turn, inProgress }) {
  const keeps = turn.entries.filter((entry) => entry.kind === 'keep')
  const end = turn.entries.find((entry) => entry.kind === 'bank' || entry.kind === 'farkle')
  const parts = keeps.flatMap((entry) => scoreBreakdown(entry.dice))
  const turnTotal = keeps.length ? keeps[keeps.length - 1].turnScore : 0

  return (
    <div className="rounded-xl border border-ink/10 bg-white/60 px-2.5 py-2">
      <p className="mb-1 text-[10px] uppercase tracking-wide text-ink-soft">
        Turn {turn.number}
        {inProgress && <span className="ml-1 normal-case">(in progress)</span>}
      </p>

      {/* what was kept, added up like a column of numbers */}
      <div className="space-y-0.5">
        {parts.map((part, i) => (
          <SumRow key={i} label={`${i === 0 ? '' : '+ '}${part.label}`} value={num(part.points)} />
        ))}
      </div>
      {parts.length > 1 && (
        <div className="mt-0.5 border-t border-ink/50 pt-0.5">
          <SumRow label="Turn" value={num(turnTotal)} bold />
        </div>
      )}
      {parts.length === 0 && !end && <p className="text-ink-soft">rolling…</p>}
      {inProgress && parts.length > 0 && <p className="mt-1 text-ink-soft">so far: {num(turnTotal)}</p>}

      {end?.kind === 'farkle' && (
        <div className="mt-1 border-t border-rose/40 pt-1 text-rose">
          <SumRow label="Farkle!" value="0" bold />
          {end.roll && <p className="text-[10px] opacity-80">rolled {end.roll.join(' · ')}</p>}
          {end.lost > 0 && <p className="text-[10px] opacity-80">lost {num(end.lost)}</p>}
        </div>
      )}

      {/* banked: the running total as a vertical sum */}
      {end?.kind === 'bank' && (
        <div className="mt-1.5 rounded-lg bg-gold/10 px-1.5 py-1">
          <SumRow label="" value={num(end.total - end.points)} />
          <SumRow label="+" value={num(end.points)} />
          <div className="my-0.5 border-t-2 border-ink/60" />
          <SumRow label="" value={num(end.total)} bold />
        </div>
      )}
    </div>
  )
}

// ---- pop-up for a score / farkle --------------------------------------------
function EventOverlay({ overlay }) {
  const tone =
    overlay.kind === 'farkle'
      ? 'border-rose bg-ink/85 text-paper'
      : overlay.kind === 'hot'
        ? 'border-gold bg-rose/90 text-paper'
        : overlay.kind === 'bank'
        ? 'border-gold bg-ink/85 text-paper'
        : 'border-white/40 bg-ink/70 text-paper'
  return (
    <div key={overlay.id} className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4">
      <div
        className={`rounded-2xl border px-6 py-4 text-center shadow-2xl backdrop-blur-sm ${tone}`}
        style={{ animation: 'farklePop 0.35s ease-out both' }}
      >
        <p className={`font-display italic ${overlay.kind === 'keep' ? 'text-xl' : overlay.kind === 'hot' ? 'text-2xl' : 'text-3xl'}`}>{overlay.title}</p>
        {overlay.sub && <p className="mt-1 font-body text-xs opacity-80">{overlay.sub}</p>}
      </div>
      <style>{`@keyframes farklePop { from { transform: scale(0.7); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>
    </div>
  )
}

// ---- in-game chat ---------------------------------------------------------------
function FarkleChat({ chat, myUid, partnerLabel }) {
  const [text, setText] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [chat.messages.length])

  async function submit(event) {
    event.preventDefault()
    const value = text
    setText('')
    await chat.send(value)
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-2">
      <div ref={listRef} className="max-h-28 min-h-10 space-y-1 overflow-y-auto px-1 font-body text-xs">
        {chat.messages.length === 0 && <p className="py-1 text-center text-ink-soft">say something sweet (or trash talk)…</p>}
        {chat.messages.map((message) => (
          <p key={message.id} className={message.uid === myUid ? 'text-right' : 'text-left'}>
            <span
              className={`inline-block max-w-[85%] break-words rounded-2xl px-3 py-1 ${
                message.uid === myUid ? 'bg-rose text-paper' : 'bg-ink/10 text-ink'
              }`}
              title={message.uid === myUid ? 'You' : partnerLabel}
            >
              {message.text}
            </span>
          </p>
        ))}
      </div>
      <form onSubmit={submit} className="mt-1 flex gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={300}
          placeholder="Message"
          className="min-w-0 flex-1 rounded-full border border-ink/15 bg-white/70 px-3 py-1.5 font-body text-sm text-ink outline-none focus:border-rose"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded-full bg-rose px-4 py-1.5 font-body text-sm font-medium text-paper disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}

// ---- fallback when WebGL isn't available -------------------------------------------
class TableBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const PIP_LAYOUTS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function FallbackDice({ game, selected, canPick, onToggle }) {
  const dice = game.awaitingKeep ? game.lastRoll : []
  return (
    <div>
      <div className="flex flex-wrap justify-center gap-3">
        {dice.map((value, index) => {
          const picked = selected.includes(index)
          return (
            <button
              key={index}
              type="button"
              disabled={!canPick}
              onClick={() => onToggle(index)}
              className={`grid h-12 w-12 shrink-0 grid-cols-3 grid-rows-3 gap-0.5 rounded-lg border p-1.5 ${
                picked ? 'border-rose bg-rose -translate-y-1 shadow-md' : 'border-ink/20 bg-white shadow-sm'
              }`}
            >
              {Array.from({ length: 9 }, (_, i) => (
                <span
                  key={i}
                  className={`rounded-full ${PIP_LAYOUTS[value].includes(i) ? (picked ? 'bg-paper' : 'bg-ink') : ''}`}
                />
              ))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
