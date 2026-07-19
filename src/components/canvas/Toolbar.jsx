import { BRUSH_PRESETS, CANVAS_BACKGROUNDS, COLOR_PALETTE, REFERENCE_WIDTH } from './palette'

export default function Toolbar({
  color,
  onColorChange,
  brushFraction,
  onBrushFractionChange,
  background,
  onBackgroundChange,
}) {
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

      <div className="mx-1 h-5 w-px shrink-0 bg-ink/10" />

      <div className="flex shrink-0 items-center gap-1">
        {CANVAS_BACKGROUNDS.map((bg) => (
          <button
            key={bg.value}
            type="button"
            aria-label={`${bg.name} background`}
            onClick={() => onBackgroundChange(bg.value)}
            className={`h-6 w-6 shrink-0 rounded-full border border-ink/10 ring-offset-2 ring-offset-paper transition-transform hover:scale-110 ${
              background === bg.value ? 'ring-2 ring-ink' : ''
            }`}
            style={{ backgroundColor: bg.value }}
          />
        ))}
      </div>
    </div>
  )
}
