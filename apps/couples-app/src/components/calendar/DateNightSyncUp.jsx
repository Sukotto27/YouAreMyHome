import { useAuth } from '../../context/AuthContext'
import { useDateNightSyncUp } from '../../hooks/useDateNightSyncUp'
import { LOCATIONS } from '../../lib/locations'
import { zonedTimeToUtc } from '../../lib/timezone'
import { formatCountdown } from '../../lib/countdown'

function bothTimesFor(item) {
  if (!item.time || !item.timezone) return null
  const occurrenceDate = item.nextOccurrenceDate || item.date
  const utcInstant = zonedTimeToUtc(occurrenceDate, item.time, item.timezone)
  return LOCATIONS.map((loc) => ({
    name: loc.name,
    time: utcInstant.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: loc.timezone }),
  }))
}

// Lets both partners confirm they're ready and then get a synchronized
// 5-second countdown to start something (a movie, etc.) at the same moment —
// shown on a Date Night's Calendar row once its scheduled time is within an
// hour either way. See hooks/useDateNightSyncUp.js for the RTDB-backed
// ready/countdown coordination this renders.
export default function DateNightSyncUp({ item }) {
  const { user } = useAuth()
  const sync = useDateNightSyncUp(item)
  if (!sync.isAboutToStart) return null

  const partnerName = user.displayName === 'Scott' ? 'Cristina' : 'Scott'
  const bothTimes = bothTimesFor(item)

  return (
    <div className="mt-3 rounded-2xl border border-rose/30 bg-blush-soft/50 p-3">
      <p className="font-body text-xs font-semibold uppercase tracking-wide text-rose">🎬 Sync-Up</p>

      {!sync.hasReachedStartTime ? (
        <p className="mt-1.5 font-body text-sm text-ink-soft">
          Starts in <span className="font-medium text-ink">{formatCountdown(sync.msUntilStart)}</span> — Start
          Together unlocks then.
        </p>
      ) : sync.syncComplete ? (
        <p className="mt-2 text-center font-display text-2xl italic text-rose">🎬 Go!</p>
      ) : sync.secondsRemaining !== null ? (
        <p className="mt-1 text-center font-display text-5xl text-rose">{sync.secondsRemaining}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {bothTimes && (
            <p className="font-body text-xs text-ink-soft">
              {bothTimes.map((entry, index) => (
                <span key={entry.name}>
                  {index > 0 && ' · '}
                  {entry.name}: {entry.time}
                </span>
              ))}
            </p>
          )}
          <button
            type="button"
            onClick={sync.toggleReady}
            className={`w-full rounded-full px-4 py-2 font-body text-sm font-medium transition-transform duration-200 ease-out hover:-translate-y-0.5 ${
              sync.myReady ? 'bg-white/70 text-rose ring-1 ring-rose' : 'bg-rose text-paper'
            }`}
          >
            {sync.myReady ? "You're ready ✓ (tap to cancel)" : 'Start Together'}
          </button>
          <p className="font-body text-xs text-ink-soft">
            {sync.partnerReady ? `✓ ${partnerName} is ready` : `Waiting for ${partnerName}…`}
          </p>
        </div>
      )}
    </div>
  )
}
