import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { usePartnerUid } from '../../hooks/usePartnerUid'
import { useUno, DEMO_PARTNER_UID } from '../../hooks/useUno'
import { useGameInvite } from '../../hooks/useGameInvite'
import { firebaseReady } from '../../firebase'
import { COLORS, canPlayCard } from '../../lib/uno'

const COLOR_HEX = {
  red: '#e6291f',
  yellow: '#f2b705',
  green: '#12a150',
  blue: '#0b6dc7',
  black: '#2b2b2b',
}

const VALUE_LABEL = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '★', wild4: '+4' }

// Standard 2-player Uno on a single ever-live shared match (same "one live
// Firestore doc, turn-gated" pattern as Farkle) — see lib/uno.js for the
// deck/rules and useUno for the realtime wiring + preview-mode bot.
export default function UnoGame({ onBack }) {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const { game, myTurn, startGame, cancelGame, play, chooseColor, draw, pass } = useUno()
  const [confirmAction, setConfirmAction] = useState(null) // null | 'restart' | 'cancel'
  const { sendInvite } = useGameInvite('uno', 'Uno')
  const [inviting, setInviting] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')

  const effectivePartnerUid = firebaseReady ? partnerUid : DEMO_PARTNER_UID
  const mineLabel = user.displayName === 'Cristina' ? 'Cristina' : 'Scott'
  const partnerLabel = mineLabel === 'Scott' ? 'Cristina' : 'Scott'

  // Arming "Start over"/"Cancel game" requires a second tap within a few
  // seconds — cheap insurance against a stray tap discarding a match that
  // both of you are still in.
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
        <h1 className="font-display text-3xl italic text-ink">Uno</h1>
        <p className="max-w-sm font-body text-sm text-ink-soft">
          Match the color or number on top of the pile, or play a Wild. Skips and Reverses just hand the turn right
          back to you with two players. First to empty their hand wins.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={startGame}
            className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            {game ? 'New game' : 'Start Uno'}
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

  const myHand = game.hands[user.uid] || []
  const partnerHand = game.hands[effectivePartnerUid] || []
  const topCard = game.discard[game.discard.length - 1]
  const pickingColor = game.awaitingColor && game.awaitingColorUid === user.uid
  const waitingOnPartnerColor = game.awaitingColor && game.awaitingColorUid !== user.uid

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

      <div className="flex items-center justify-center gap-2">
        <p className="font-hand text-lg text-ink-soft">
          {partnerLabel} · {partnerHand.length} card{partnerHand.length === 1 ? '' : 's'}
        </p>
        {partnerHand.length === 1 && <span className="font-display text-sm italic text-rose">UNO!</span>}
      </div>
      <div className="flex justify-center gap-1.5">
        {partnerHand.map((card) => (
          <UnoCard key={card.id} faceDown />
        ))}
      </div>

      <div className="rounded-3xl border border-ink/10 bg-white/50 p-6 text-center">
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <p className="mb-1 font-body text-xs text-ink-soft">deck</p>
            <UnoCard faceDown />
          </div>
          <div className="text-center">
            <p className="mb-1 font-body text-xs text-ink-soft">
              in play {game.currentColor && <ColorDot color={game.currentColor} />}
            </p>
            <UnoCard card={topCard} />
          </div>
        </div>

        <p className="mt-4 font-hand text-lg text-ink-soft">
          {pickingColor
            ? 'pick a color'
            : waitingOnPartnerColor
              ? `${partnerLabel} is picking a color...`
              : myTurn
                ? 'your turn'
                : `${partnerLabel}'s turn`}
        </p>

        {pickingColor && (
          <div className="mt-3 flex justify-center gap-3">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => chooseColor(color)}
                style={{ background: COLOR_HEX[color] }}
                className="h-10 w-10 rounded-full border-2 border-white shadow-md transition-transform hover:-translate-y-0.5"
                aria-label={color}
              />
            ))}
          </div>
        )}

        {!pickingColor && (
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={draw}
              disabled={!myTurn || game.drawnThisTurn}
              className="rounded-full border border-rose px-6 py-2.5 font-body font-medium text-rose transition-colors hover:bg-blush-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              Draw
            </button>
            {myTurn && game.drawnThisTurn && (
              <button
                type="button"
                onClick={pass}
                className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
              >
                Pass
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <p className="font-hand text-lg text-ink-soft">
          {mineLabel} · {myHand.length} card{myHand.length === 1 ? '' : 's'}
        </p>
        {myHand.length === 1 && <span className="font-display text-sm italic text-rose">UNO!</span>}
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {myHand.map((card) => {
          const playable = myTurn && !game.awaitingColor && canPlayCard(card, topCard, game.currentColor)
          return (
            <UnoCard
              key={card.id}
              card={card}
              dimmed={myTurn && !game.awaitingColor && !playable}
              onClick={playable ? () => play(card.id) : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}

function FinishedBanner({ game, myUid, mineLabel, partnerLabel }) {
  const won = game.winnerUid === myUid
  return (
    <div className="rounded-3xl border border-rose/30 bg-blush-soft/50 px-6 py-4">
      <p className="font-display text-2xl italic text-ink">{won ? `${mineLabel} wins! 🎉` : `${partnerLabel} wins! 🎉`}</p>
    </div>
  )
}

function ColorDot({ color }) {
  return (
    <span
      className="ml-1 inline-block h-2.5 w-2.5 rounded-full align-middle"
      style={{ background: COLOR_HEX[color] }}
    />
  )
}

function UnoCard({ card, faceDown, dimmed, onClick }) {
  if (faceDown) {
    return <div className="h-16 w-11 shrink-0 rounded-lg border-2 border-white/70 bg-ink shadow-sm" />
  }
  const label = VALUE_LABEL[card.value] ?? card.value
  const background =
    card.color === 'black'
      ? 'linear-gradient(135deg, #e6291f, #f2b705, #12a150, #0b6dc7)'
      : COLOR_HEX[card.color]
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      style={{ background }}
      className={`flex h-16 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-white/80 font-display text-lg font-bold text-white shadow-md transition-transform ${
        onClick ? 'cursor-pointer hover:-translate-y-1' : ''
      } ${dimmed ? 'opacity-40' : ''}`}
    >
      {label}
    </button>
  )
}
