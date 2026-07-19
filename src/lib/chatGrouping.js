const FIVE_MINUTES = 5 * 60 * 1000

export function toDate(timestamp) {
  return timestamp?.toDate ? timestamp.toDate() : new Date(timestamp || Date.now())
}

export function dateLabel(date) {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const sameDay = (a, b) => a.toDateString() === b.toDateString()

  if (sameDay(date, today)) return 'Today'
  if (sameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  })
}

// Builds a flat render list: date separators + messages, marking which
// messages should sit tight against the previous bubble (same sender, close
// in time) and which should show a timestamp (last in a tight cluster).
export function buildTimeline(messages) {
  const items = []
  let lastDateKey = null

  messages.forEach((message, index) => {
    const date = toDate(message.createdAt)
    const dateKey = date.toDateString()
    if (dateKey !== lastDateKey) {
      items.push({ type: 'separator', key: `sep-${dateKey}`, label: dateLabel(date) })
      lastDateKey = dateKey
    }

    const next = messages[index + 1]
    const nextDate = next ? toDate(next.createdAt) : null
    const tight =
      !!next &&
      next.senderUid === message.senderUid &&
      nextDate.toDateString() === dateKey &&
      nextDate - date < FIVE_MINUTES

    items.push({ type: 'message', key: message.id, message, tight })
  })

  return items
}
