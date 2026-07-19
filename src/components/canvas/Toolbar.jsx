import { useState } from 'react'
import { COLOR_PALETTE, BRUSH_PRESETS, REFERENCE_WIDTH } from './palette'

export default function Toolbar({
  color,
  onColorChange,
  brushFraction,
  onBrushFractionChange,
  onClear,
  onSave,
  saving,
}) {
  const [confirmingClear, setConfirmingClear] = useState(false)

  function handleClear() {
    onClear()
    setConfirmingClear(false)
  }

  if (confirmingClear) {
    return (
      <div className="flex items-center justify-center gap-3 border-b border-ink/10 px-3 py-2 font-body text-sm">
        <span className="text-ink-soft">Clear the whole canvas?</span>
        <button type="button" onClick={handleClear} className="font-medium text-rose">
          Yes
        </button>
        <button type="button" onClick={() => setConfirmingClear(false)} className="text-ink-soft">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-ink/10 px-3 py-1.5 sm:px-4">
      <div className="flex shrink-0 items-center gap-1">
        {COLOR_PALETTE.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            aria-label={swatch.name}
            onClick={() => onColorChange(swatch.value)}
            className={`h-6 w-6 shrink-0 rounded-full ring-offset-2 ring-offset-paper transition-transform hover:scale-110 ${
              color === swatch.value ? 'ring-2 ring-ink' : ''
            }`}
            style={{ backgroundColor: swatch.value }}
          />
        ))}
      </div>

      <div className="mx-1 h-5 w-px shrink-0 bg-ink/10" />

      <div className="flex shrink-0 items-center gap-1">
        {BRUSH_PRESETS.map((preset) => {
          const fraction = preset.px / REFERENCE_WIDTH
          const active = Math.abs(fraction - brushFraction) < 1e-6
          return (
            <button
              key={preset.name}
              type="button"
              aria-label={preset.name}
              onClick={() => onBrushFractionChange(fraction)}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
                active ? 'border-rose bg-blush-soft' : 'border-ink/15 bg-white/50'
              }`}
            >
              <span className="rounded-full bg-ink" style={{ width: preset.px, height: preset.px }} />
            </button>
          )
        })}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          aria-label="Save to scrapbook"
          className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-rose disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
            <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setConfirmingClear(true)}
          aria-label="Clear canvas"
          className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-rose"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
            <path d="M4 7h16" />
            <path d="M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7" />
            <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
