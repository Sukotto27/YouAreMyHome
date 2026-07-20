import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAssessment } from '../../hooks/useAssessment'
import {
  LOVE_LANGUAGE,
  LOVE_LANGUAGE_PAIRS,
  LOVE_LANGUAGE_PROMPT,
  scoreLoveLanguage,
} from '../../lib/assessments/loveLanguage'
import AssessmentResult from './AssessmentResult'

export default function LoveLanguageQuizView({ onClose }) {
  const { user } = useAuth()
  const { myResult, partnerResult, submitResult } = useAssessment(LOVE_LANGUAGE.id, LOVE_LANGUAGE.title)
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [retaking, setRetaking] = useState(false)
  const partnerName = user.displayName === 'Scott' ? 'Cristina' : 'Scott'

  const allAnswered = LOVE_LANGUAGE_PAIRS.every((p) => answers[p.id])
  const showForm = !myResult || retaking

  function categoryLabel(key) {
    return LOVE_LANGUAGE.categories.find((c) => c.key === key)?.label ?? key
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await submitResult(scoreLoveLanguage(LOVE_LANGUAGE_PAIRS, answers))
      setRetaking(false)
      setAnswers({})
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg italic text-ink">{LOVE_LANGUAGE.title}</p>
        <button type="button" onClick={onClose} className="font-body text-sm text-ink-soft hover:text-rose">
          Close
        </button>
      </div>
      <p className="font-body text-sm text-ink-soft">{LOVE_LANGUAGE.description}</p>

      {!showForm && myResult && (
        <div className="space-y-2">
          <AssessmentResult
            mineLabel={categoryLabel(myResult.results.primary)}
            partnerLabel={partnerResult ? categoryLabel(partnerResult.results.primary) : null}
            partnerName={partnerName}
          />
          <button
            type="button"
            onClick={() => setRetaking(true)}
            className="font-body text-sm text-rose hover:text-ink"
          >
            Retake
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {LOVE_LANGUAGE_PAIRS.map((pair) => (
            <div key={pair.id} className="space-y-1.5">
              <p className="font-body text-xs text-ink-soft">{LOVE_LANGUAGE_PROMPT}</p>
              <div className="grid gap-2">
                {[pair.a, pair.b].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [pair.id]: option.key }))}
                    className={`rounded-xl border px-3 py-2 text-left font-body text-sm transition-colors ${
                      answers[pair.id] === option.key
                        ? 'border-rose bg-blush-soft text-ink'
                        : 'border-ink/15 text-ink-soft'
                    }`}
                  >
                    {option.text}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            type="submit"
            disabled={!allAnswered || submitting}
            className="rounded-full bg-rose px-5 py-2 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'See my result'}
          </button>
        </form>
      )}
    </div>
  )
}
