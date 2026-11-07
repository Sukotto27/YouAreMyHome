import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useRpsMatch } from '../../hooks/useRpsMatch'
import { useGameInvite } from '../../hooks/useGameInvite'
import EndGameButton from './EndGameButton'
import GameIntro from './GameIntro'
import { playSound } from '../../lib/sounds'
import { CHOICES, CHOICE_EMOJI, COUNTDOWN_FROM, WINS_NEEDED } from '../../lib/rps'

const CHOICE_LABEL = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' }

// Best-of-3 Rock Paper Scissors. Both players preselect during a 3-2-1
// countdown (and can change their mind until it hits 0); on 0 both picks are
// revealed together. See useRpsMatch for the phase flow and who referees.
export default function RockPaperScissorsGame({ onBack }) {
  const { user } = useAuth()
  const { match, effectivePartnerUid, startMatch, pick, endGame } = useRpsMatch()
  const { sendInvite } = useGameInvite('rps', 'Rock Paper Scissors')
  const [inviting, setInviting] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')
  const [count, setCount] = useState(COUNTDOWN_FROM)

  const mineLabel = user.displayName === 'Cristina' ? 'Cristina' : 'Scott'
  const partnerLabel = mineLabel === 'Scott' ? 'Cristina' : 'Scott'
  const myScore = match?.scores?.[user.uid] || 0
  const partnerScore = match?.scores?.[effectivePartnerUid] || 0
  const myPick = match?.picks?.[user.uid]
  const phase = match?.phase
  const status = match?.status

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

  // Each round's on-screen countdown is local to each device, started when
  // the round's 'countdown' phase arrives.
  useEffect(() => {
    if (status !== 'playing' || phase !== 'countdown') return
    let n = COUNTDOWN_FROM
    setCount(n)
    playSound('chat_send')
    const interval = setInterval(() => {
      n -= 1
      setCount(n)
      if (n > 0) playSound('chat_send')
      else clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [status, phase, match?.round])

  // Reveal sound: a win for me, otherwise a softer tone.
  useEffect(() => {
    if (status !== 'playing' || phase !== 'reveal') return
    playSound(match.reveal?.winnerUid === user.uid ? 'notification' : 'bubble')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, phase, match?.round])

  if (!match || status === 'finished' || status === 'ended') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-8 text-center sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="self-start font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
        >
          ← Games
        </button>
        {status === 'ended' && (
          <p className="font-hand text-base text-ink-soft">
            {match.endedBy === user.uid ? 'You' : partnerLabel} ended the game.
          </p>
        )}
        {status === 'finished' && (
          <div className="rounded-3xl border border-rose/30 bg-blush-soft/50 px-6 py-4">
            <p className="font-display text-2xl italic text-ink">
              {match.winnerUid === user.uid ? `${mineLabel} wins! 🎉` : `${partnerLabel} wins! 🎉`}
            </p>
            <p className="mt-1 font-body text-sm text-ink-soft">
              Final score — {myScore} : {partnerScore}
            </p>
          </div>
        )}
        <h1 className="font-display text-3xl italic text-ink">Rock Paper Scissors</h1>
        <GameIntro gameKey="rps" title="Rock Paper Scissors" defaultText={"Pick your move during the 3-2-1 countdown — on 0, both picks are revealed. Best of 3 wins."} />
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={startMatch}
            className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            {match ? 'New match' : 'Start match'}
          </button>
          <button
            type="button"
            onClick={handleInvite}
            disabled={inviting}
            className="rounded-full border border-rose/40 px-6 py-2.5 font-body font-medium text-rose transition-colors hover:bg-blush-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {inviting ? 'Inviting…' : '✊ Invite partner'}
          </button>
        </div>
        {inviteMessage && <p className="font-hand text-sm text-rose">{inviteMessage}</p>}
      </div>
    )
  }

  const locked = phase !== 'countdown' || count <= 0
  const reveal = phase === 'reveal' ? match.reveal : null
  const myRevealPick = reveal ? (match.leftUid === user.uid ? reveal.leftPick : reveal.rightPick) : null
  const partnerRevealPick = reveal ? (match.leftUid === user.uid ? reveal.rightPick : reveal.leftPick) : null

  let banner = ''
  if (reveal) {
    if (!reveal.winnerUid) banner = "It's a tie — go again!"
    else banner = reveal.winnerUid === user.uid ? `${mineLabel} takes the round!` : `${partnerLabel} takes the round!`
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-6 overflow-y-auto px-4 py-4 text-center sm:px-6">
      <div className="flex w-full items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
        >
          ← Games
        </button>
        <div className="flex flex-1 items-center justify-center gap-4 font-body text-sm text-ink">
          <span style={{ color: '#2f9e94' }} className="font-semibold">
            {mineLabel}: {myScore}
          </span>
          <span className="text-ink-soft">best of 3 · round {match.round}</span>
          <span style={{ color: '#e27d7a' }} className="font-semibold">
            {partnerLabel}: {partnerScore}
          </span>
        </div>
        <EndGameButton onEnd={endGame} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        {phase === 'countdown' && (
          <>
            <style>{`@keyframes rpsPop { from { transform: scale(1.7); opacity: 0 } 30% { opacity: 1 } to { transform: scale(0.9); opacity: 0.3 } }`}</style>
            {count > 0 ? (
              <span
                key={count}
                className="font-display text-9xl italic text-rose"
                style={{ animation: 'rpsPop 1s ease-out forwards' }}
              >
                {count}
              </span>
            ) : (
              <span className="font-display text-4xl italic text-rose">…</span>
            )}
            <p className="font-hand text-xl text-ink-soft">
              {locked ? 'Locked in!' : myPick ? 'Change your mind any time before 0' : 'Pick your move!'}
            </p>
          </>
        )}

        {reveal && (
          <>
            <div className="flex items-center gap-8">
              <div className="flex flex-col items-center gap-1">
                <span className="text-7xl" style={{ opacity: reveal.winnerUid && reveal.winnerUid !== user.uid ? 0.45 : 1 }}>
                  {myRevealPick ? CHOICE_EMOJI[myRevealPick] : '❔'}
                </span>
                <span className="font-body text-xs text-ink-soft">{mineLabel}</span>
              </div>
              <span className="font-display text-2xl italic text-ink-soft">vs</span>
              <div className="flex flex-col items-center gap-1">
                <span className="text-7xl" style={{ opacity: reveal.winnerUid && reveal.winnerUid === user.uid ? 0.45 : 1 }}>
                  {partnerRevealPick ? CHOICE_EMOJI[partnerRevealPick] : '❔'}
                </span>
                <span className="font-body text-xs text-ink-soft">{partnerLabel}</span>
              </div>
            </div>
            <p className="font-display text-2xl italic text-ink">{banner}</p>
            {Math.max(myScore, partnerScore) >= WINS_NEEDED && (
              <p className="font-hand text-lg text-rose">That's the match! 🎉</p>
            )}
          </>
        )}
      </div>

      <div className="flex w-full justify-center gap-3 pb-4">
        {CHOICES.map((choice) => {
          const selected = phase === 'countdown' ? myPick === choice : myRevealPick === choice
          return (
            <button
              key={choice}
              type="button"
              disabled={locked}
              onClick={() => pick(choice)}
              className={`flex w-24 flex-col items-center gap-1 rounded-2xl border px-3 py-3 font-body transition-all ${
                selected ? 'scale-105 border-rose bg-blush-soft shadow-md' : 'border-teal/30 bg-white/60'
              } ${locked ? 'cursor-not-allowed' : 'hover:border-rose'} ${locked && !selected ? 'opacity-50' : ''}`}
            >
              <span className="text-4xl">{CHOICE_EMOJI[choice]}</span>
              <span className="text-xs font-medium text-ink">{CHOICE_LABEL[choice]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
