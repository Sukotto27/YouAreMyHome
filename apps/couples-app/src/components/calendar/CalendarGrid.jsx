import { useState } from 'react'
import { holidaysForYear } from '../../lib/holidays'
import { recurrenceTypeOf } from '../../lib/milestones'
import SendCardModal from './SendCardModal'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const GIFT_ELIGIBLE_HOLIDAYS = new Set(["Valentine's Day"])

function eventsForDay(items, date) {
  return items.filter((item) => {
    if (!item.date) return false
    const [y, m, d] = item.date.split('-').map(Number)
    const recurrenceType = recurrenceTypeOf(item)

    if (recurrenceType === 'none') {
      return y === date.getFullYear() && m - 1 === date.getMonth() && d === date.getDate()
    }
    if (recurrenceType === 'yearly') {
      return m - 1 === date.getMonth() && d === date.getDate()
    }
    const original = new Date(y, m - 1, d)
    if (date < original) return false
    const diffDays = Math.round((date - original) / 86400000)
    if (recurrenceType === 'weekly') return diffDays % 7 === 0
    if (recurrenceType === 'biweekly') return diffDays % 14 === 0
    if (recurrenceType === 'monthly') return date.getDate() === d
    return false
  })
}

function holidaysForDay(date) {
  return holidaysForYear(date.getFullYear()).filter((holiday) => {
    const [, m, d] = holiday.date.split('-').map(Number)
    return m - 1 === date.getMonth() && d === date.getDate()
  })
}

function buildGridDays(year, month) {
  const firstOfMonth = new Date(year, month, 1)
  const start = new Date(year, month, 1 - firstOfMonth.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    return date
  })
}

export default function CalendarGrid({ items }) {
  const [viewDate, setViewDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [giftHoliday, setGiftHoliday] = useState(null)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const gridDays = buildGridDays(year, month)
  const today = new Date()

  function changeMonth(delta) {
    setViewDate(new Date(year, month + delta, 1))
    setSelectedDate(null)
  }

  const selectedEvents = selectedDate ? eventsForDay(items, selectedDate) : []
  const selectedHolidays = selectedDate ? holidaysForDay(selectedDate) : []

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => changeMonth(-1)} className="px-2 font-body text-ink-soft hover:text-rose">
          ←
        </button>
        <p className="font-display text-lg italic text-ink">
          {viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </p>
        <button type="button" onClick={() => changeMonth(1)} className="px-2 font-body text-ink-soft hover:text-rose">
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map((label, index) => (
          <div key={index} className="font-body text-xs text-ink-soft/70">
            {label}
          </div>
        ))}
        {gridDays.map((date) => {
          const isCurrentMonth = date.getMonth() === month
          const isToday = date.toDateString() === today.toDateString()
          const dayEvents = eventsForDay(items, date)
          const dayHolidays = holidaysForDay(date)
          const hasMarkers = dayEvents.length > 0 || dayHolidays.length > 0

          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => setSelectedDate(date)}
              className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 font-body text-sm transition-colors ${
                isCurrentMonth ? 'text-ink' : 'text-ink-soft/40'
              } ${isToday ? 'bg-rose text-paper' : 'hover:bg-blush-soft/50'}`}
            >
              <span>{date.getDate()}</span>
              <span className="flex h-1.5 gap-0.5">
                {dayEvents.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-teal" />}
                {dayHolidays.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
              </span>
              {!hasMarkers && <span className="h-1.5" />}
            </button>
          )
        })}
      </div>

      {selectedDate && (
        <div className="mt-4 rounded-2xl border border-ink/10 bg-white/50 p-4">
          <p className="mb-2 font-body text-sm font-medium text-ink">
            {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          {selectedEvents.length === 0 && selectedHolidays.length === 0 ? (
            <p className="font-body text-sm text-ink-soft/70">Nothing on the calendar this day.</p>
          ) : (
            <ul className="space-y-1 font-body text-sm text-ink-soft">
              {selectedEvents.map((event) => (
                <li key={event.id}>🗓️ {event.title}</li>
              ))}
              {selectedHolidays.map((holiday) => (
                <li key={holiday.name} className="flex items-center gap-2">
                  <span>
                    🎉 {holiday.name} <span className="text-xs text-ink-soft/60">({holiday.region})</span>
                  </span>
                  {GIFT_ELIGIBLE_HOLIDAYS.has(holiday.name) && (
                    <button
                      type="button"
                      onClick={() => setGiftHoliday(holiday.name)}
                      className="font-body text-xs text-rose hover:text-ink"
                    >
                      💐 Send a card
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {giftHoliday && <SendCardModal occasion={giftHoliday} onClose={() => setGiftHoliday(null)} />}
    </div>
  )
}
