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

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-ink/10 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-1.5">
        {COLOR_PALETTE.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            aria-label={swatch.name}
            onClick={() => onColorChange(swatch.value)}
            className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-paper transition-transform hover:scale-110 ${
              color === swatch.value ? 'ring-2 ring-ink' : ''
            }`}
            style={{ backgroundColor: swatch.value }}
          />
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {BRUSH_PRESETS.map((preset) => {
          const fraction = preset.px / REFERENCE_WIDTH
          const active = Math.abs(fraction - brushFraction) < 1e-6
          return (
            <button
              key={preset.name}
              type="button"
              aria-label={preset.name}
              onClick={() => onBrushFractionChange(fraction)}
              className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                active ? 'border-rose bg-blush-soft' : 'border-ink/15 bg-white/50'
              }`}
            >
              <span
                className="rounded-full bg-ink"
                style={{ width: preset.px, height: preset.px }}
              />
            </button>
          )
        })}
      </div>

      <div className="ml-auto flex items-center gap-4">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="font-body text-sm font-medium text-rose transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save to scrapbook'}
        </button>
        {confirmingClear ? (
          <div className="flex items-center gap-2 font-body text-sm">
            <span className="text-ink-soft">Clear the whole canvas?</span>
            <button type="button" onClick={handleClear} className="font-medium text-rose">
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirmingClear(false)}
              className="text-ink-soft"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            className="font-body text-sm text-ink-soft transition-colors hover:text-rose"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
