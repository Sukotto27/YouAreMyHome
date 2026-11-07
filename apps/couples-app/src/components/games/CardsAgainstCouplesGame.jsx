import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useCardsMatch } from '../../hooks/useCardsMatch'
import { useGameInvite } from '../../hooks/useGameInvite'
import EndGameButton from './EndGameButton'
import GameIntro from './GameIntro'
import { playSound } from '../../lib/sounds'
import { answerText, promptForRound, splitPrompt } from '../../lib/cardsAgainstCouples'

const REACTIONS = ['😂', '😍', '💀', '🙈', '🔥']

// The dark "prompt" card. With a blank, `answer` (if given) is dropped into
// it in bold; question prompts show the answer beneath.
function PromptCard({ prompt, answer }) {
  const { before, after } = splitPrompt(prompt)
  return (
    <div className="w-full rounded-2xl bg-ink px-5 py-5 text-left font-display text-xl italic leading-snug text-paper shadow-lg">
      {before}
      {after !== null && (
        <>
          {answer ? <span className="not-italic font-body font-bold text-gold underline decoration-gold/50">{answer}</span> : '____'}
          {after}
        </>
      )}
      {after === null && answer && (
        <p className="mt-3 border-t border-paper/20 pt-3 font-body text-lg font-bold not-italic text-gold">{answer}</p>
      )}
    </div>
  )
}

function AnswerCard({ text, selected, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[84px] rounded-xl border bg-white px-3 py-2 text-left font-body text-sm font-semibold leading-snug text-ink shadow-sm transition-all ${
        selected ? '-translate-y-1 border-rose ring-2 ring-rose' : 'border-ink/15'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-rose'}`}
    >
      {text}
    </button>
  )
}

// Two-player, no-judge, no-score fill-in-the-blank: both of you get the same
// prompt, secretly play a card, and the answers are revealed together — just
// for laughs. See lib/cardsAgainstCouples.js for the rules and the cards.
export default function CardsAgainstCouplesGame({ onBack }) {
  const { user } = useAuth()
  const { match, effectivePartnerUid, startMatch, act, endGame } = useCardsMatch()
  const { sendInvite } = useGameInvite('cac', 'Cards Against Couples')
  const [selected, setSelected] = useState(null)
  const [inviting, setInviting] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')

  const mineLabel = user.displayName === 'Cristina' ? 'Cristina' : 'Scott'
  const partnerLabel = mineLabel === 'Scott' ? 'Cristina' : 'Scott'
  const phase = match?.phase
  const round = match?.round

  // Fresh selection each round; a little sound when the answers are revealed.
  useEffect(() => {
    setSelected(null)
  }, [round])
  useEffect(() => {
    if (phase === 'reveal') playSound('notification')
  }, [phase, round])

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

  if (!match || match.status === 'ended') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-8 text-center sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="self-start font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
        >
          ← Games
        </button>
        {match?.status === 'ended' && (
          <p className="font-hand text-base text-ink-soft">
            {match.endedBy === user.uid ? 'You' : partnerLabel} ended the game.
          </p>
        )}
        <h1 className="font-display text-3xl italic text-ink">Cards Against Couples</h1>
        <GameIntro gameKey="cac" title="Cards Against Couples" defaultText={"Every round you both get the same prompt and secretly play your funniest card from a hand of 7. Both answers are revealed together. No judge, no score — it's just for laughs."} />
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={startMatch}
            className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            Deal the cards
          </button>
          <button
            type="button"
            onClick={handleInvite}
            disabled={inviting}
            className="rounded-full border border-rose/40 px-6 py-2.5 font-body font-medium text-rose transition-colors hover:bg-blush-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {inviting ? 'Inviting…' : '🃏 Invite partner'}
          </button>
        </div>
        {inviteMessage && <p className="font-hand text-sm text-rose">{inviteMessage}</p>}
      </div>
    )
  }

  const prompt = promptForRound(match)
  const picks = match.picks || {}
  const hand = match.hands?.[user.uid] || []
  const myPick = picks[user.uid]
  const partnerPlayed = effectivePartnerUid in picks
  const reactions = match.reactions || {}
  const iAmReady = !!match.ready?.[user.uid]

  async function handlePlay() {
    if (selected === null) return
    playSound('chat_send')
    await act({ type: 'play', card: selected })
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
        >
          ← Games
        </button>
        <span className="flex-1 text-center font-body text-xs text-ink-soft">Round {round}</span>
        <button
          type="button"
          onClick={startMatch}
          className="font-body text-xs text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
        >
          Reshuffle
        </button>
        <EndGameButton onEnd={endGame} />
      </div>

      {phase === 'pick' && (
        <>
          <PromptCard prompt={prompt} />
          <p className="text-center font-hand text-base text-ink-soft">
            {myPick !== undefined
              ? partnerPlayed
                ? 'Revealing…'
                : `Card played — waiting for ${partnerLabel}…`
              : partnerPlayed
                ? `${partnerLabel} has played — your turn!`
                : 'Pick your funniest card'}
          </p>
          {myPick !== undefined ? (
            <div className="flex justify-center">
              <div className="w-48">
                <AnswerCard text={answerText(myPick)} selected disabled />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {hand.map((card, i) => (
                  <AnswerCard
                    key={`${card}-${i}`}
                    text={answerText(card)}
                    selected={selected === card}
                    onClick={() => setSelected(selected === card ? null : card)}
                  />
                ))}
              </div>
              <button
                type="button"
                disabled={selected === null}
                onClick={handlePlay}
                className="mx-auto rounded-full bg-rose px-8 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-opacity disabled:opacity-40"
              >
                Play card
              </button>
            </>
          )}
        </>
      )}

      {phase === 'reveal' && (
        <>
          {[
            { uid: user.uid, label: mineLabel },
            { uid: effectivePartnerUid, label: partnerLabel },
          ].map(({ uid, label }) => (
            <div key={uid} className="flex flex-col gap-1">
              <div className="flex items-center justify-between px-1">
                <span className="font-body text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</span>
                {/* each card shows the reaction the OTHER player gave it */}
                <span className="text-2xl">{reactions[uid === user.uid ? effectivePartnerUid : user.uid]}</span>
              </div>
              <PromptCard prompt={prompt} answer={answerText(picks[uid])} />
            </div>
          ))}
          <div className="flex flex-col items-center gap-1">
            <p className="font-hand text-sm text-ink-soft">React to their card:</p>
            <div className="flex gap-2">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    playSound('bubble')
                    act({ type: 'react', emoji })
                  }}
                  className={`rounded-full border px-3 py-1 text-xl transition-transform hover:scale-110 ${
                    reactions[user.uid] === emoji ? 'border-rose bg-blush-soft' : 'border-ink/15 bg-white/60'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={iAmReady}
            onClick={() => act({ type: 'ready' })}
            className="mx-auto rounded-full bg-rose px-8 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] disabled:opacity-60"
          >
            {iAmReady ? `Waiting for ${partnerLabel}…` : 'Next card →'}
          </button>
        </>
      )}
    </div>
  )
}
