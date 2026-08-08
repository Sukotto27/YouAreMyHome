import { useMemo, useState } from 'react'
import { FEATURE_BY_KEY, FEATURES, eventDate, fractionOfCurrentYear, yearIndexFor } from '../../lib/tree'
import { layoutEvents } from '../../lib/treeGeometry'

const SECTION_HEIGHT = 240
const TRUNK_X = 400
const CANVAS_WIDTH = 800
const MARGIN_TOP = 60
const MARGIN_BOTTOM = 40
const TRUNK_COLOR = '#7a5c47'

// Stacks one section per anniversary year (oldest at the bottom, the
// current/partial year at the top — the tree grows upward), then chains
// each feature's events into branches sprouting from that section's span of
// trunk. See lib/treeGeometry.js for the actual branch math.
function buildTree(byFeature) {
  const now = new Date()
  const currentYearIndex = yearIndexFor(now)
  const fraction = fractionOfCurrentYear(now)

  const sectionHeights = []
  for (let i = 0; i <= currentYearIndex; i++) {
    sectionHeights.push(i < currentYearIndex ? SECTION_HEIGHT : SECTION_HEIGHT * fraction)
  }
  const trunkHeight = sectionHeights.reduce((a, b) => a + b, 0)
  const totalHeight = MARGIN_TOP + trunkHeight + MARGIN_BOTTOM
  const baseY = totalHeight - MARGIN_BOTTOM

  let cursor = baseY
  const sections = sectionHeights.map((height, yearIndex) => {
    const bottom = cursor
    const top = cursor - height
    cursor = top
    return { yearIndex, bottom, top, height }
  })

  const branches = []
  for (const section of sections) {
    const featuresHere = FEATURES.filter((f) => (byFeature[f.key]?.[section.yearIndex]?.length ?? 0) > 0)
    featuresHere.forEach((feature, i) => {
      const attachY = section.bottom - ((i + 1) / (featuresHere.length + 1)) * section.height
      const events = byFeature[feature.key][section.yearIndex]
      branches.push(...layoutEvents(TRUNK_X, attachY, feature.angle, events))
    })
  }

  return { totalHeight, baseY, sections, branches }
}

export default function TreeCanvas({ byFeature }) {
  const [active, setActive] = useState(null)
  const { totalHeight, baseY, sections, branches } = useMemo(() => buildTree(byFeature), [byFeature])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {FEATURES.map((f) => (
          <span key={f.key} className="flex items-center gap-1.5 font-body text-xs text-ink-soft">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: f.color }} />
            {f.label}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${CANVAS_WIDTH} ${totalHeight}`} className="w-full" role="img" aria-label="Tree of Union">
        <ellipse cx={TRUNK_X} cy={baseY + 8} rx={80} ry={11} fill="rgba(54,37,33,0.08)" />

        {sections.map(
          (section) =>
            section.yearIndex > 0 && (
              <g key={section.yearIndex}>
                <ellipse cx={TRUNK_X} cy={section.bottom} rx={10} ry={4} fill={TRUNK_COLOR} opacity={0.55} />
                <text x={TRUNK_X + 16} y={section.bottom - 8} className="fill-ink-soft font-hand" fontSize="13">
                  Year {section.yearIndex + 1}
                </text>
              </g>
            ),
        )}
        <text x={TRUNK_X + 16} y={baseY - 8} className="fill-ink-soft font-hand" fontSize="13">
          Year 1
        </text>

        <line x1={TRUNK_X} y1={baseY} x2={TRUNK_X} y2={MARGIN_TOP} stroke={TRUNK_COLOR} strokeWidth={14} strokeLinecap="round" />

        {branches.map((b) => {
          const color = FEATURE_BY_KEY[b.event.feature]?.color || TRUNK_COLOR
          const isActive = active?.id === b.event.id
          return (
            <g key={b.event.id}>
              <path d={b.d} fill="none" stroke={color} strokeWidth={b.width} strokeLinecap="round" opacity={0.85} />
              <circle
                cx={b.end.x}
                cy={b.end.y}
                r={Math.max(3, b.width * 1.4) * (isActive ? 1.3 : 1)}
                fill={color}
                stroke={isActive ? '#362521' : 'transparent'}
                strokeWidth={1.5}
                pointerEvents="none"
              />
              {/* Generously larger than the visible dot — the leaf itself is
                  only a few SVG units across, far below a usable touch
                  target once scaled down to screen size. */}
              <circle
                cx={b.end.x}
                cy={b.end.y}
                r={14}
                fill="transparent"
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={b.event.summary || b.event.lastSummary}
                onMouseEnter={() => setActive(b.event)}
                onFocus={() => setActive(b.event)}
                onClick={() => setActive((current) => (current?.id === b.event.id ? null : b.event))}
              />
            </g>
          )
        })}
      </svg>

      <TreeDetail event={active} onClose={() => setActive(null)} />
    </div>
  )
}

function TreeDetail({ event, onClose }) {
  if (!event) {
    return (
      <p className="text-center font-hand text-lg text-ink-soft">tap or hover a branch to see what it was</p>
    )
  }

  const feature = FEATURE_BY_KEY[event.feature]
  const date = eventDate(event)
  const summary = event.count > 1 ? `${event.lastSummary} (×${event.count} that day)` : event.summary || event.lastSummary

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: feature?.color }} />
          <p className="font-body text-xs font-medium uppercase tracking-wide text-ink-soft">{feature?.label}</p>
        </div>
        <button type="button" onClick={onClose} className="font-body text-xs text-ink-soft hover:text-rose">
          ✕
        </button>
      </div>
      <p className="mt-1 font-body text-sm text-ink">{summary}</p>
      <p className="mt-1 font-body text-xs text-ink-soft">
        {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        {event.category ? ` · ${event.category}` : ''}
        {event.children?.length ? ` · ${event.children.length} comment${event.children.length === 1 ? '' : 's'}` : ''}
      </p>
    </div>
  )
}
