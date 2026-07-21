import { useState } from 'react'

export default function AnswerForm({ questionText, options, partnerHasAnswered, onSubmit, submitting }) {
  const [answer, setAnswer] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const text = answer.trim()
    if (!text) return
    onSubmit(text)
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 overflow-y-auto px-4 py-8 sm:px-6">
      {partnerHasAnswered && (
        <p className="text-center font-hand text-lg text-teal">
          your partner has already answered — your turn!
        </p>
      )}
      <div className="rounded-3xl border border-ink/10 bg-white/50 p-6 text-center">
        <p className="font-display text-2xl italic text-ink">{questionText}</p>
      </div>

      {options ? (
        <div className="grid grid-cols-2 gap-3">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={submitting}
              onClick={() => onSubmit(option)}
              className="rounded-2xl border border-teal/30 bg-white/60 px-4 py-6 text-center font-body font-medium text-ink transition-colors hover:border-rose hover:bg-blush-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Take your time..."
            rows={4}
            autoFocus
            className="w-full resize-none rounded-2xl border border-ink/15 bg-white/60 px-4 py-3 font-body text-ink outline-none transition-colors focus:border-rose"
          />
          <button
            type="submit"
            disabled={!answer.trim() || submitting}
            className="w-full rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {submitting ? 'Sending…' : 'Submit answer'}
          </button>
        </form>
      )}
    </div>
  )
}
