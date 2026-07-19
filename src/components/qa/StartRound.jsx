import { useState } from 'react'
import { QUESTION_CATEGORIES, QUESTION_LIBRARY, randomQuestion } from '../../data/questionLibrary'

export default function StartRound({ onStart, starting, onRewind }) {
  const [suggestions, setSuggestions] = useState(() => pickThree())
  const [customText, setCustomText] = useState('')
  const [browsing, setBrowsing] = useState(false)

  function shuffle() {
    setSuggestions(pickThree())
  }

  function handleCustomSubmit(event) {
    event.preventDefault()
    const text = customText.trim()
    if (!text) return
    onStart({ text, source: 'custom' })
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <div className="text-center">
        <h1 className="font-display text-3xl italic text-ink">Ask each other something</h1>
        <p className="mt-1 font-hand text-xl text-ink-soft">
          you'll each answer on your own — no peeking until you're both done
        </p>
        <button
          type="button"
          onClick={onRewind}
          className="mt-3 font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 transition-colors hover:text-rose"
        >
          Rewind — revisit past questions
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-body text-sm font-medium text-ink-soft">A few ideas</h2>
          <button
            type="button"
            onClick={shuffle}
            className="font-body text-sm text-rose transition-colors hover:text-ink"
          >
            Shuffle
          </button>
        </div>
        <div className="grid gap-3">
          {suggestions.map((question) => (
            <button
              key={question.id}
              type="button"
              disabled={starting}
              onClick={() =>
                onStart({
                  text: question.text,
                  source: 'library',
                  questionId: question.id,
                  options: question.options,
                })
              }
              className="rounded-2xl border border-teal/30 bg-white/60 px-4 py-3 text-left font-body text-ink transition-colors hover:border-rose disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="mb-1 block font-hand text-sm text-teal">{question.category}</span>
              {question.text}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setBrowsing((v) => !v)}
          className="font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-ink"
        >
          {browsing ? 'Hide full list' : 'Browse all questions'}
        </button>
        {browsing && (
          <div className="max-h-64 space-y-4 overflow-y-auto rounded-2xl border border-ink/10 bg-white/40 p-4">
            {QUESTION_CATEGORIES.map((category) => (
              <div key={category} className="space-y-2">
                <h3 className="font-hand text-lg text-teal">{category}</h3>
                {QUESTION_LIBRARY.filter((q) => q.category === category).map((question) => (
                  <button
                    key={question.id}
                    type="button"
                    disabled={starting}
                    onClick={() =>
                      onStart({
                        text: question.text,
                        source: 'library',
                        questionId: question.id,
                        options: question.options,
                      })
                    }
                    className="block w-full rounded-xl px-3 py-1.5 text-left font-body text-sm text-ink transition-colors hover:bg-blush-soft disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {question.text}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleCustomSubmit} className="space-y-2">
        <h2 className="font-body text-sm font-medium text-ink-soft">Or write your own</h2>
        <textarea
          value={customText}
          onChange={(event) => setCustomText(event.target.value)}
          placeholder="What do you want to ask?"
          rows={2}
          className="w-full resize-none rounded-2xl border border-ink/15 bg-white/60 px-4 py-3 font-body text-ink outline-none transition-colors focus:border-rose"
        />
        <button
          type="submit"
          disabled={!customText.trim() || starting}
          className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          Ask this
        </button>
      </form>
    </div>
  )
}

function pickThree() {
  const chosen = []
  const excludeIds = []
  for (let i = 0; i < 3; i += 1) {
    const question = randomQuestion(excludeIds)
    chosen.push(question)
    excludeIds.push(question.id)
  }
  return chosen
}
