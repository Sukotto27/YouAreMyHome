import { useRelationshipElapsed } from '../../hooks/useRelationshipElapsed'

function pad(n) {
  return String(n).padStart(2, '0')
}

export default function CompactCounter() {
  const { years, months, days, hours, minutes, seconds } = useRelationshipElapsed()

  return (
    <span className="font-body text-xs tabular-nums text-ink-soft sm:text-sm">
      {years}y {months}m {days}d · {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </span>
  )
}
