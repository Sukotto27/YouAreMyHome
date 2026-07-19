import { useState } from 'react'
import { useMarkSeen } from '../hooks/useMarkSeen'
import JournalTimeline from '../components/journal/JournalTimeline'
import DailyGoalsPanel from '../components/journal/DailyGoalsPanel'
import AssessmentsPanel from '../components/journal/AssessmentsPanel'

const TABS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'goals', label: 'Daily Goals' },
  { id: 'assessments', label: 'Assessments' },
]

export default function Journal() {
  useMarkSeen('journal')
  const [tab, setTab] = useState('timeline')

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl italic text-ink">Our Journal</h1>

      <div className="flex gap-1 rounded-full bg-ink/5 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-full py-1.5 font-body text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-paper text-rose shadow-sm' : 'text-ink-soft'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'timeline' && <JournalTimeline />}
      {tab === 'goals' && <DailyGoalsPanel />}
      {tab === 'assessments' && <AssessmentsPanel />}
    </div>
  )
}
