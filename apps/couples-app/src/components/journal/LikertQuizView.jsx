import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAssessment } from '../../hooks/useAssessment'
import { LIKERT_SCALE, scoreLikert } from '../../lib/assessments/likertAssessments'
import AssessmentResult from './AssessmentResult'

// Reused for all 3 Likert-style assessments (Attachment/Communication/
// Conflict Resolution) — they share one mechanic, so one component.
export default function LikertQuizView({ assessment, onClose }) {
  const { user } = useAuth()
  const { myResult, partnerResult, submitResult } = useAssessment(assessment.id, assessment.title)
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [retaking, setRetaking] = useState(false)
  const partnerName = user.displayName === 'Scott' ? 'Cristina' : 'Scott'

  const allAnswered = assessment.questions.every((q) => answers[q.id] != null)
  const showForm = !myResult || retaking

  function styleLabel(key) {
    return assessment.styles.find((s) => s.key === key)?.label ?? key
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await submitResult(scoreLikert(assessment.questions, answers))
      setRetaking(false)
      setAnswers({})
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg italic text-ink">{assessment.title}</p>
        <button type="button" onClick={onClose} className="font-body text-sm text-ink-soft hover:text-rose">
          Close
        </button>
      </div>
      <p className="font-body text-sm text-ink-soft">{assessment.description}</p>

      {!showForm && myResult && (
        <div className="space-y-2">
          <AssessmentResult
            mineLabel={styleLabel(myResult.results.primary)}
            partnerLabel={partnerResult ? styleLabel(partnerResult.results.primary) : null}
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
          {assessment.questions.map((q) => (
            <div key={q.id} className="space-y-1.5">
              <p className="font-body text-sm text-ink">{q.text}</p>
              <div className="flex gap-1">
                {LIKERT_SCALE.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.value }))}
                    title={opt.label}
                    className={`h-8 w-8 rounded-full border font-body text-xs transition-colors ${
                      answers[q.id] === opt.value ? 'border-rose bg-rose text-paper' : 'border-ink/15 text-ink-soft'
                    }`}
                  >
                    {opt.value}
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
