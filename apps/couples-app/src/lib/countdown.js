// Shared "time until" formatter for Date Night's Sync-Up panel and the Home
// page countdown icon — both show the same ±1h "about to start" window, just
// in different places, so they format the remaining time identically.
export function formatCountdown(ms) {
  if (ms <= 0) return 'Starting now'
  const totalMinutes = Math.max(1, Math.round(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${minutes}m`
}
