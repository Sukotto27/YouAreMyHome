import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAssessment } from '../../hooks/useAssessment'
import { CORE_VALUES, MAX_CORE_VALUES } from '../../lib/assessments/coreValues'
import AssessmentResult from './AssessmentResult'

export default function CoreValuesQuizView({ onClose }) {
  const { user } = useAuth()
  const { myResult, partnerResult, submitResult } = useAssessment(CORE_VALUES.id, CORE_VALUES.title)
  const [selected, setSelected] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [retaking, setRetaking] = useState(false)
  const partnerName = user.displayName === 'Scott' ? 'Cristina' : 'Scott'

  const showForm = !myResult || retaking

  function valueLabel(key) {
    return CORE_VALUES.values.find((v) => v.key === key)?.label ?? key
  }

  function toggle(key) {
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key)
      if (prev.length >= MAX_CORE_VALUES) return prev
      return [...prev, key]
    })
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await submitResult({ topValues: selected })
      setRetaking(false)
      setSelected([])
    } finally {
      setSubmitting(false)
    }
  }

  const sharedValues =
    myResult && partnerResult
      ? myResult.results.topValues.filter((k) => partnerResult.results.topValues.includes(k))
      : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg italic text-ink">{CORE_VALUES.title}</p>
        <button type="button" onClick={onClose} className="font-body text-sm text-ink-soft hover:text-rose">
          Close
        </button>
      </div>
      <p className="font-body text-sm text-ink-soft">{CORE_VALUES.description}</p>

      {!showForm && myResult && (
        <div className="space-y-2">
          <AssessmentResult
            mineLabel={myResult.results.topValues.map(valueLabel).join(', ')}
            partnerLabel={partnerResult ? partnerResult.results.topValues.map(valueLabel).join(', ') : null}
            partnerName={partnerName}
          >
            {partnerResult && (
              <p className="mt-1 text-rose">
                {sharedValues.length > 0
                  ? `You share: ${sharedValues.map(valueLabel).join(', ')}`
                  : 'No overlap in your top 5 — worth talking about!'}
              </p>
            )}
          </AssessmentResult>
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
        <div className="space-y-3">
          <p className="font-body text-xs text-ink-soft">
            {selected.length}/{MAX_CORE_VALUES} selected
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CORE_VALUES.values.map((v) => {
              const index = selected.indexOf(v.key)
              const isSelected = index !== -1
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => toggle(v.key)}
                  disabled={!isSelected && selected.length >= MAX_CORE_VALUES}
                  className={`rounded-xl border px-3 py-2 font-body text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    isSelected ? 'border-rose bg-blush-soft text-ink' : 'border-ink/15 text-ink-soft'
                  }`}
                >
                  {isSelected && <span className="mr-1 text-rose">{index + 1}.</span>}
                  {v.label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selected.length === 0 || submitting}
            className="rounded-full bg-rose px-5 py-2 font-body text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'See my result'}
          </button>
        </div>
      )}
    </div>
  )
}
