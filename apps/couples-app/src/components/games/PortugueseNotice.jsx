// One-time note (per game, per device) telling Cristina the Portuguese
// subtext exists. Fixed to the bottom of the screen so it can be dropped into
// any view of a game without disturbing the layout.
export default function PortugueseNotice({ pt, how }) {
  if (!pt.showNotice) return null
  return (
    <div
      role="dialog"
      aria-label="Português subtext"
      className="fixed inset-x-3 bottom-4 z-50 mx-auto max-w-sm rounded-2xl border border-rose/30 bg-paper px-4 py-3 text-center shadow-xl"
    >
      <p className="font-body text-sm text-ink">
        🇧🇷 Querida, você pode ver este jogo com legendas em português! <span className="text-ink-soft">(You can turn on Brazilian Portuguese subtext for this game. {how})</span>
      </p>
      <p className="mt-1 font-body text-xs text-ink-soft">The 🇧🇷 PT button in the game turns it on or off any time.</p>
      <div className="mt-2 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => pt.dismissNotice(true)}
          className="rounded-full bg-rose px-4 py-1.5 font-body text-sm font-medium text-paper"
        >
          Ativar
        </button>
        <button
          type="button"
          onClick={() => pt.dismissNotice(false)}
          className="rounded-full border border-ink/15 px-4 py-1.5 font-body text-sm text-ink-soft"
        >
          Agora não
        </button>
      </div>
    </div>
  )
}
