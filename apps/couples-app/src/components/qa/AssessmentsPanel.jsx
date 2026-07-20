import { useState } from 'react'
import { LIKERT_ASSESSMENTS } from '../../lib/assessments/likertAssessments'
import { LOVE_LANGUAGE } from '../../lib/assessments/loveLanguage'
import { CORE_VALUES } from '../../lib/assessments/coreValues'
import { SATISFACTION_INDEX } from '../../lib/assessments/satisfactionIndex'
import LikertQuizView from './LikertQuizView'
import LoveLanguageQuizView from './LoveLanguageQuizView'
import CoreValuesQuizView from './CoreValuesQuizView'
import SatisfactionQuizView from './SatisfactionQuizView'

const CARDS = [
  { kind: 'love-language', ...LOVE_LANGUAGE },
  ...LIKERT_ASSESSMENTS.map((a) => ({ kind: 'likert', ...a })),
  { kind: 'core-values', ...CORE_VALUES },
  { kind: 'satisfaction-index', ...SATISFACTION_INDEX },
]

export default function AssessmentsPanel({ onBack }) {
  const [openId, setOpenId] = useState(null)
  const openCard = CARDS.find((c) => c.id === openId)

  if (openCard) {
    return <QuizView card={openCard} onClose={() => setOpenId(null)} />
  }

  return (
    <div className="space-y-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
        >
          ← All categories
        </button>
      )}
      <p className="font-hand text-lg text-ink-soft">
        A fun way to reflect together — not a clinical or diagnostic tool.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setOpenId(card.id)}
            className="rounded-2xl border border-ink/10 bg-white/50 p-4 text-left transition-colors hover:border-rose"
          >
            <p className="font-body font-medium text-ink">{card.title}</p>
            <p className="mt-1 font-body text-xs text-ink-soft">{card.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function QuizView({ card, onClose }) {
  if (card.kind === 'likert') return <LikertQuizView assessment={card} onClose={onClose} />
  if (card.kind === 'love-language') return <LoveLanguageQuizView onClose={onClose} />
  if (card.kind === 'core-values') return <CoreValuesQuizView onClose={onClose} />
  if (card.kind === 'satisfaction-index') return <SatisfactionQuizView onClose={onClose} />
  return null
}
