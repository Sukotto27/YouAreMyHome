import { useState } from 'react'
import { holidaysForYear } from '../../lib/holidays'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function eventsForDay(items, date) {
  return items.filter((item) => {
    if (!item.date) return false
    const [y, m, d] = item.date.split('-').map(Number)
    if (item.recurring !== false) {
      return m - 1 === date.getMonth() && d === date.getDate()
    }
    return y === date.getFullYear() && m - 1 === date.getMonth() && d === date.getDate()
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
                <li key={holiday.name}>
                  🎉 {holiday.name} <span className="text-xs text-ink-soft/60">({holiday.region})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
