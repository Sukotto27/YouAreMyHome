import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { usePartnerUid } from '../../hooks/usePartnerUid'
import { useFarkle, DEMO_PARTNER_UID } from '../../hooks/useFarkle'
import { useGameInvite } from '../../hooks/useGameInvite'
import { firebaseReady } from '../../firebase'
import { scoreSelection } from '../../lib/farkle'
import { playSound } from '../../lib/sounds'

// Standard 6-dice Farkle (see lib/farkle.js for the exact scoring table) —
// a single ever-live shared match, not a library of separate rounds: both
// partners watch the same board update in real time, turn-gated the way you
// would passing dice back and forth in person.
export default function FarkleGame({ onBack }) {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const { game, myTurn, onBoardMin, targetScore, startGame, cancelGame, roll, keepSelected, bank } = useFarkle()
  const [selected, setSelected] = useState([])
  const [confirmAction, setConfirmAction] = useState(null) // null | 'restart' | 'cancel'
  const { sendInvite } = useGameInvite('farkle', 'Farkle')
  const [inviting, setInviting] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')

  const effectivePartnerUid = firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const mineLabel = user.displayName === 'Cristina' ? 'Cristina' : 'Scott'
  const partnerLabel = mineLabel === 'Scott' ? 'Cristina' : 'Scott'

  // Selection resets whenever a new roll comes in (or the round moves on).
  useEffect(() => {
    setSelected([])
  }, [game?.lastRoll, game?.awaitingKeep])

  // Arming "Start over"/"Cancel game" requires a second tap within a few
  // seconds — cheap insurance against a stray tap discarding a match that
  // both of you are still in, without needing a whole confirm modal.
  useEffect(() => {
    if (!confirmAction) return
    const timer = setTimeout(() => setConfirmAction(null), 4000)
    return () => clearTimeout(timer)
  }, [confirmAction])

  function handleResetClick(action) {
    if (confirmAction === action) {
      setConfirmAction(null)
      if (action === 'restart') startGame()
      else cancelGame()
      return
    }
    setConfirmAction(action)
  }

  async function handleInvite() {
    setInviting(true)
    try {
      await sendInvite()
      setInviteMessage("Invite sent — they'll get a notification!")
      setTimeout(() => setInviteMessage(''), 2500)
    } finally {
      setInviting(false)
    }
  }

  async function handleRoll() {
    playSound('dice_roll')
    await roll()
  }

  function toggleDie(index) {
    setSelected((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]))
  }

  async function handleKeep() {
    const values = selected.map((i) => game.lastRoll[i])
    await keepSelected(values)
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
          <FinishedBanner game={game} myUid={user.uid} mineLabel={mineLabel} partnerLabel={partnerLabel} />
        )}
        <h1 className="font-display text-3xl italic text-ink">Farkle</h1>
        <p className="max-w-sm font-body text-sm text-ink-soft">
          Roll six dice, set aside anything that scores, and either bank your points or push your luck with another
          roll — but a roll with nothing scoring wipes out everything you haven't banked yet. First to{' '}
          {targetScore.toLocaleString()} wins, though the other person always gets one last turn to catch up.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={startGame}
            className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            {game ? 'New game' : 'Start Farkle'}
          </button>
          <button
            type="button"
            onClick={handleInvite}
            disabled={inviting}
            className="rounded-full border border-rose/40 px-6 py-2.5 font-body font-medium text-rose transition-colors hover:bg-blush-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {inviting ? 'Inviting…' : '🎲 Invite partner'}
          </button>
        </div>
        {inviteMessage && <p className="font-hand text-sm text-rose">{inviteMessage}</p>}
      </div>
    )
  }

  const myScore = game.scores[user.uid] || 0
  const partnerScore = game.scores[effectivePartnerUid] || 0
  // `selected` is component state, reset via an effect keyed on
  // game.lastRoll/awaitingKeep — that effect runs after the commit that
  // clears lastRoll (e.g. right after Keep selected), so there's one render
  // where `selected` still holds stale indices against a `lastRoll` that's
  // already null. Guard here rather than assume they're always in sync.
  const selectionScore = game.lastRoll ? scoreSelection(selected.map((i) => game.lastRoll[i])) : { valid: false, score: 0 }
  const canKeep = game.awaitingKeep && selected.length > 0 && selectionScore.valid
  const onBoard = myScore > 0
  const canBank = myTurn && !game.awaitingKeep && game.turnScore > 0 && (onBoard || game.turnScore >= onBoardMin)

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
          <button
            type="button"
            onClick={() => handleResetClick('cancel')}
            className="font-body text-xs text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
          >
            {confirmAction === 'cancel' ? 'Tap again to cancel' : 'Cancel game'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ScoreCard label={mineLabel} score={myScore} active={game.currentTurnUid === user.uid} />
        <ScoreCard label={partnerLabel} score={partnerScore} active={game.currentTurnUid === effectivePartnerUid} />
      </div>

      {game.finalRoundUid && (
        <p className="text-center font-hand text-lg text-rose">
          {game.finalRoundUid === user.uid
            ? `Final round — beat ${partnerScore.toLocaleString()} to win!`
            : `${partnerLabel} crossed ${targetScore.toLocaleString()} — this is your last shot to beat them.`}
        </p>
      )}

      <div className="rounded-3xl border border-ink/10 bg-white/50 p-6 text-center">
        <p className="font-hand text-lg text-ink-soft">
          {myTurn ? "your turn" : `${partnerLabel}'s turn`} · turn score {game.turnScore.toLocaleString()}
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {game.awaitingKeep
            ? game.lastRoll.map((value, index) => (
                <Die
                  key={index}
                  value={value}
                  selected={selected.includes(index)}
                  onClick={myTurn ? () => toggleDie(index) : undefined}
                />
              ))
            : Array.from({ length: game.dicePool }, (_, index) => <Die key={index} idle />)}
        </div>

        {game.lastRoll && !game.awaitingKeep && (
          <p className="mt-4 font-hand text-xl text-rose">
            {game.lastRollByUid === user.uid ? 'You' : partnerLabel} farkled — nothing scored on that roll!
          </p>
        )}

        {game.awaitingKeep && (
          <p className="mt-3 font-body text-xs text-ink-soft">
            {!myTurn
              ? `${partnerLabel} is deciding what to keep...`
              : selected.length === 0
                ? 'Tap the dice you want to set aside for points'
                : selectionScore.valid
                  ? `Worth ${selectionScore.score.toLocaleString()} points`
                  : "That selection doesn't score — only pick dice that form a valid combination"}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {myTurn && !game.awaitingKeep && (
            <button
              type="button"
              onClick={handleRoll}
              className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
            >
              {game.turnScore > 0 ? 'Roll again' : 'Roll'}
            </button>
          )}
          {myTurn && game.awaitingKeep && (
            <button
              type="button"
              onClick={handleKeep}
              disabled={!canKeep}
              className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Keep selected
            </button>
          )}
          {canBank && (
            <button
              type="button"
              onClick={bank}
              className="rounded-full border border-rose px-6 py-2.5 font-body font-medium text-rose transition-colors hover:bg-blush-soft"
            >
              Bank {game.turnScore.toLocaleString()} &amp; pass
            </button>
          )}
        </div>

        {!onBoard && myTurn && !game.awaitingKeep && game.turnScore > 0 && game.turnScore < onBoardMin && (
          <p className="mt-3 font-body text-xs text-ink-soft">
            Need {onBoardMin.toLocaleString()} in one turn to get on the board — keep rolling!
          </p>
        )}
        {!myTurn && !game.awaitingKeep && (
          <p className="mt-4 font-hand text-lg text-ink-soft">waiting on {partnerLabel}...</p>
        )}
      </div>
    </div>
  )
}

function FinishedBanner({ game, myUid, mineLabel, partnerLabel }) {
  const won = game.winnerUid === myUid
  return (
    <div className="rounded-3xl border border-rose/30 bg-blush-soft/50 px-6 py-4">
      <p className="font-display text-2xl italic text-ink">{won ? `${mineLabel} wins! 🎉` : `${partnerLabel} wins! 🎉`}</p>
      <p className="mt-1 font-body text-sm text-ink-soft">
        Final score — {mineLabel}: {(game.scores[myUid] || 0).toLocaleString()}
      </p>
    </div>
  )
}

function ScoreCard({ label, score, active }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-center ${
        active ? 'border-rose bg-blush-soft/50' : 'border-ink/10 bg-white/50'
      }`}
    >
      <p className="font-body text-xs text-ink-soft">{label}</p>
      <p className="font-display text-2xl italic text-ink">{score.toLocaleString()}</p>
    </div>
  )
}

const PIP_LAYOUTS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function Die({ value, selected, idle, onClick }) {
  const pips = idle ? [] : PIP_LAYOUTS[value] || []
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={`grid h-12 w-12 shrink-0 grid-cols-3 grid-rows-3 gap-0.5 rounded-lg border p-1.5 transition-transform ${
        idle
          ? 'border-ink/10 bg-white/30'
          : selected
            ? 'border-rose bg-rose -translate-y-1 shadow-md'
            : 'border-ink/20 bg-white shadow-sm'
      } ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`rounded-full ${pips.includes(i) ? (selected ? 'bg-paper' : 'bg-ink') : ''}`} />
      ))}
    </button>
  )
}
