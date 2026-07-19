import { useEffect, useState } from 'react'
import { LOCATIONS } from '../lib/locations'
import { useWeather } from '../hooks/useWeather'
import { describeWeatherCode } from '../lib/weatherCodes'

function useClock(timezone) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  return now.toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })
}

function LocationCard({ location }) {
  const time = useClock(location.timezone)
  const { weather, error } = useWeather(location)
  const condition = weather ? describeWeatherCode(weather.weather_code) : null
  const unitLabel = location.unit === 'fahrenheit' ? 'F' : 'C'

  return (
    <div className="flex min-w-[9.5rem] flex-col items-center gap-1 rounded-2xl border border-ink/10 bg-white/50 px-4 py-3">
      <p className="font-body text-sm font-medium text-ink">{location.name}</p>
      <p className="font-body text-xs text-ink-soft">{location.city}</p>
      <p className="font-display text-xl text-rose">{time}</p>
      {weather && !error && (
        <p className="font-body text-sm text-ink-soft">
          {condition.icon} {Math.round(weather.temperature_2m)}°{unitLabel}
          {condition.label && ` · ${condition.label}`}
        </p>
      )}
      {error && <p className="font-body text-xs text-ink-soft/60">weather unavailable</p>}
    </div>
  )
}

export default function LocationClocks() {
  return (
    <div className="flex flex-wrap justify-center gap-4">
      {LOCATIONS.map((location) => (
        <LocationCard key={location.name} location={location} />
      ))}
    </div>
  )
}
