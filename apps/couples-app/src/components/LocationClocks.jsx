import { useEffect, useState } from 'react'
import { LOCATIONS } from '../lib/locations'
import { useWeather } from '../hooks/useWeather'
import { describeWeatherCode } from '../lib/weatherCodes'
import { useAuth } from '../context/AuthContext'

function useClock(timezone) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  return now.toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })
}

function LocationCard({ location, unit }) {
  const time = useClock(location.timezone)
  const { weather, error } = useWeather({ ...location, unit })
  const condition = weather ? describeWeatherCode(weather.weather_code) : null
  const unitLabel = unit === 'fahrenheit' ? 'F' : 'C'

  // Fixed height + min-w-0 so the card never changes size with its content
  // (weather loading in, long condition labels) — the pair stays side by side.
  return (
    <div className="flex h-36 min-w-0 flex-col items-center gap-1 overflow-hidden rounded-2xl border border-ink/10 bg-white/50 px-2 py-3">
      <p className="max-w-full truncate font-body text-sm font-medium text-ink">{location.name}</p>
      <p className="max-w-full truncate font-body text-xs text-ink-soft">{location.city}</p>
      <p className="font-display text-xl text-rose">{time}</p>
      {weather && !error && (
        <p className="max-w-full truncate font-body text-sm text-ink-soft">
          {condition.icon} {Math.round(weather.temperature_2m)}°{unitLabel}
        </p>
      )}
      {weather && !error && condition.label && (
        <p className="max-w-full truncate font-body text-xs text-ink-soft">{condition.label}</p>
      )}
      {error && <p className="font-body text-xs text-ink-soft/60">weather unavailable</p>}
    </div>
  )
}

// Both temperatures show in the viewer's own unit: °C for Cristina, °F for
// Scott (and anyone else).
export default function LocationClocks() {
  const { user } = useAuth()
  const unit = user?.displayName === 'Cristina' ? 'celsius' : 'fahrenheit'

  return (
    <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:gap-4">
      {LOCATIONS.map((location) => (
        <LocationCard key={location.name} location={location} unit={unit} />
      ))}
    </div>
  )
}
