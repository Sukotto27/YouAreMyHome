import { useEffect, useState } from 'react'

const REFRESH_MS = 15 * 60 * 1000

export function useWeather({ latitude, longitude, unit }) {
  const [weather, setWeather] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const params = new URLSearchParams({
          latitude,
          longitude,
          current: 'temperature_2m,weather_code',
          temperature_unit: unit,
        })
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
        if (!response.ok) throw new Error('weather request failed')
        const data = await response.json()
        if (!cancelled) setWeather(data.current)
      } catch {
        if (!cancelled) setError(true)
      }
    }

    load()
    const interval = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [latitude, longitude, unit])

  return { weather, error }
}
