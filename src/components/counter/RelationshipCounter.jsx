import { useRelationshipElapsed } from '../../hooks/useRelationshipElapsed'

const UNITS = [
  { key: 'years', label: 'years' },
  { key: 'months', label: 'months' },
  { key: 'days', label: 'days' },
  { key: 'hours', label: 'hrs' },
  { key: 'minutes', label: 'min' },
  { key: 'seconds', label: 'sec' },
]

export default function RelationshipCounter() {
  const elapsed = useRelationshipElapsed()

  return (
    <div className="w-full rounded-3xl border border-ink/10 bg-white/50 px-4 py-5 sm:px-8 sm:py-6">
      <p className="text-center font-hand text-lg text-rose sm:text-xl">
        together since March 30, 2024 · 8:16pm
      </p>
      <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-6 sm:gap-x-4">
        {UNITS.map((unit) => (
          <div key={unit.key} className="flex flex-col items-center">
            <span className="font-display text-3xl tabular-nums text-ink sm:text-4xl">
              {elapsed[unit.key]}
            </span>
            <span className="font-body text-xs uppercase tracking-wide text-ink-soft">
              {unit.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
