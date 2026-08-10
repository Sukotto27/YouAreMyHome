import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useMarkSeen } from '../hooks/useMarkSeen'
import { useUnreadBadges } from '../hooks/useUnreadBadges'
import JournalTimeline from '../components/journal/JournalTimeline'
import PersonalStatusPanel from '../components/journal/PersonalStatusPanel'
import DailyGoalsPanel from '../components/journal/DailyGoalsPanel'

const TABS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'status', label: 'Status' },
  { id: 'goals', label: 'Daily Goals' },
]

// Maps the `type` of the latest unread journalEvents entry to the tab it's
// most relevant to — most entry types (mood/mail/scrapbook/dateNight/...)
// are Timeline-only mirrors, so only checkin/gratitude get their own tab.
const JOURNAL_TAB_FOR_TYPE = { checkin: 'status', gratitude: 'goals' }

export default function Journal() {
  useMarkSeen('journal')
  const location = useLocation()
  const [tab, setTab] = useState(location.state?.tab || 'timeline')
  const { unread, detail } = useUnreadBadges()
  const unreadTab = unread.journal ? JOURNAL_TAB_FOR_TYPE[detail.journal] || 'timeline' : null

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl italic text-ink">Our Journal</h1>

      <div className="flex gap-1 rounded-full bg-ink/5 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 font-body text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-paper text-rose shadow-sm' : 'text-ink-soft'
            }`}
          >
            {t.label}
            {unreadTab === t.id && <span className="h-1.5 w-1.5 rounded-full bg-rose" />}
          </button>
        ))}
      </div>

      {tab === 'timeline' && <JournalTimeline />}
      {tab === 'status' && <PersonalStatusPanel />}
      {tab === 'goals' && <DailyGoalsPanel />}
    </div>
  )
}
