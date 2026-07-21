// Landing screen for Games — a small, growable menu of shared activities.
// Draw also holds the Scrapbook now (saved drawings live inside it as a
// tab), so it no longer needs its own top-level nav item.
export default function GamesMenu({ onSelectDraw, onSelectMadLibs }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-8 sm:px-6">
      <div className="text-center">
        <h1 className="font-display text-3xl italic text-ink">Games</h1>
        <p className="mt-1 font-hand text-xl text-ink-soft">something to play together</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onSelectDraw}
          className="rounded-2xl border border-teal/30 bg-white/60 px-4 py-4 text-left transition-colors hover:border-rose"
        >
          <p className="font-body font-medium text-ink">Draw</p>
          <p className="mt-1 font-body text-xs text-ink-soft">Sketch together on a shared canvas, save your favorites</p>
        </button>
        <button
          type="button"
          onClick={onSelectMadLibs}
          className="rounded-2xl border border-teal/30 bg-white/60 px-4 py-4 text-left transition-colors hover:border-rose"
        >
          <p className="font-body font-medium text-ink">Mad Libs</p>
          <p className="mt-1 font-body text-xs text-ink-soft">Fill in the blanks separately, then compare your stories</p>
        </button>
      </div>
    </div>
  )
}
