import { useEffect, useState } from 'react'
import { ANNIVERSARY, getElapsedBreakdown } from '../lib/relationship'

export function useRelationshipElapsed() {
  const [elapsed, setElapsed] = useState(() => getElapsedBreakdown(ANNIVERSARY, new Date()))

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(getElapsedBreakdown(ANNIVERSARY, new Date()))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return elapsed
}
