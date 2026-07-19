import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAssessment } from '../../hooks/useAssessment'
import {
  AGREEMENT_SCALE,
  MAX_SATISFACTION_TOTAL,
  OVERALL_HAPPINESS_SCALE,
  SATISFACTION_INDEX,
  SATISFACTION_ITEMS,
  scoreSatisfaction,
} from '../../lib/assessments/satisfactionIndex'
import AssessmentResult from './AssessmentResult'

export default function SatisfactionQuizView({ onClose }) {
  const { user } = useAuth()
  const { myResult, partnerResult, submitResult } = useAssessment(SATISFACTION_INDEX.id, SATISFACTION_INDEX.title)
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [retaking, setRetaking] = useState(false)
  const partnerName = user.displayName === 'Scott' ? 'Cristina' : 'Scott'

  const allAnswered = SATISFACTION_ITEMS.every((item) => answers[item.id] != null)
  const showForm = !myResult || retaking

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await submitResult(scoreSatisfaction(SATISFACTION_ITEMS, answers))
      setRetaking(false)
      setAnswers({})
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg italic text-ink">{SATISFACTION_INDEX.title}</p>
        <button type="button" onClick={onClose} className="font-body text-sm text-ink-soft hover:text-rose">
          Close
        </button>
      </div>
      <p className="font-body text-sm text-ink-soft">{SATISFACTION_INDEX.description}</p>

      {!showForm && myResult && (
        <div className="space-y-2">
          <AssessmentResult
            mineLabel={`${myResult.results.total}/${MAX_SATISFACTION_TOTAL}`}
            partnerLabel={partnerResult ? `${partnerResult.results.total}/${MAX_SATISFACTION_TOTAL}` : null}
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
          {SATISFACTION_ITEMS.map((item) => {
            const scale = item.scale === 'overall' ? OVERALL_HAPPINESS_SCALE : AGREEMENT_SCALE
            return (
              <div key={item.id} className="space-y-1.5">
                <p className="font-body text-sm text-ink">{item.text}</p>
                <div className="flex flex-wrap gap-1">
                  {scale.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [item.id]: opt.value }))}
                      title={opt.label}
                      className={`rounded-full border px-2.5 py-1 font-body text-xs transition-colors ${
                        answers[item.id] === opt.value
                          ? 'border-rose bg-rose text-paper'
                          : 'border-ink/15 text-ink-soft'
                      }`}
                    >
                      {opt.value}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
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
