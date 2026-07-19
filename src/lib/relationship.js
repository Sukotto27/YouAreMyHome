// Together since 3/30/24, 8:16pm (local time).
export const ANNIVERSARY = new Date(2024, 2, 30, 20, 16, 0)

export function getElapsedBreakdown(start, now) {
  let years = now.getFullYear() - start.getFullYear()
  let months = now.getMonth() - start.getMonth()
  let days = now.getDate() - start.getDate()
  let hours = now.getHours() - start.getHours()
  let minutes = now.getMinutes() - start.getMinutes()
  let seconds = now.getSeconds() - start.getSeconds()

  if (seconds < 0) {
    seconds += 60
    minutes -= 1
  }
  if (minutes < 0) {
    minutes += 60
    hours -= 1
  }
  if (hours < 0) {
    hours += 24
    days -= 1
  }
  if (days < 0) {
    const daysInPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
    days += daysInPrevMonth
    months -= 1
  }
  if (months < 0) {
    months += 12
    years -= 1
  }

  return { years, months, days, hours, minutes, seconds }
}
