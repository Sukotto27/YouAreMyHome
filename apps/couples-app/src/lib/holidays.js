// Rule-based, not a flat hardcoded date list — a fixed list would go stale
// the moment the calendar grid is navigated past whatever years were
// hardcoded. Fixed-date holidays are computed directly; floating US
// holidays use nth-weekday-of-month rules. Brazil's Easter-relative
// holidays (Carnaval, Good Friday) are skipped for v1.

function fmt(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(year, month, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  return new Date(year, month, 1 + offset + (n - 1) * 7)
}

function lastWeekdayOfMonth(year, month, weekday) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  const last = new Date(year, month, lastDay)
  const offset = (last.getDay() - weekday + 7) % 7
  return new Date(year, month, lastDay - offset)
}

export function holidaysForYear(year) {
  const holidays = []
  const add = (date, name, region) => holidays.push({ date: fmt(date), name, region })

  // US — fixed dates
  add(new Date(year, 0, 1), "New Year's Day", 'US')
  add(new Date(year, 1, 14), "Valentine's Day", 'US')
  add(new Date(year, 5, 19), 'Juneteenth', 'US')
  add(new Date(year, 6, 4), 'Independence Day', 'US')
  add(new Date(year, 10, 11), 'Veterans Day', 'US')
  add(new Date(year, 11, 25), 'Christmas Day', 'US')

  // US — floating (nth-weekday-of-month rules)
  add(nthWeekdayOfMonth(year, 0, 1, 3), 'Martin Luther King Jr. Day', 'US')
  add(nthWeekdayOfMonth(year, 1, 1, 3), "Presidents' Day", 'US')
  add(lastWeekdayOfMonth(year, 4, 1), 'Memorial Day', 'US')
  add(nthWeekdayOfMonth(year, 8, 1, 1), 'Labor Day', 'US')
  add(nthWeekdayOfMonth(year, 9, 1, 2), 'Columbus Day', 'US')
  add(nthWeekdayOfMonth(year, 10, 4, 4), 'Thanksgiving', 'US')

  // Brazil — fixed dates only (no Easter-relative Carnaval/Good Friday for v1)
  add(new Date(year, 0, 1), 'Confraternização Universal', 'BR')
  add(new Date(year, 3, 21), 'Tiradentes', 'BR')
  add(new Date(year, 4, 1), 'Dia do Trabalho', 'BR')
  add(new Date(year, 8, 7), 'Independência do Brasil', 'BR')
  add(new Date(year, 9, 12), 'Nossa Senhora Aparecida', 'BR')
  add(new Date(year, 10, 2), 'Finados', 'BR')
  add(new Date(year, 10, 15), 'Proclamação da República', 'BR')
  add(new Date(year, 10, 20), 'Consciência Negra', 'BR')
  add(new Date(year, 11, 25), 'Natal', 'BR')

  return holidays
}
