// Placeholder page — just a spinning record and "coming soon" for now,
// ahead of an actual synced-listening feature.
export default function Music() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-4 py-8 text-center sm:px-6">
      <div className="relative h-48 w-48 sm:h-56 sm:w-56">
        <div
          className="h-full w-full animate-spin rounded-full shadow-xl [animation-duration:3s]"
          style={{
            background:
              'repeating-radial-gradient(circle at center, #1c1c1c 0px, #1c1c1c 3px, #2b2b2b 4px, #2b2b2b 5px)',
          }}
        />
        <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose shadow-inner" />
        <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper" />
      </div>

      <div>
        <h1 className="font-display text-2xl italic text-ink">Music</h1>
        <p className="mt-2 font-hand text-2xl text-rose">coming soon...</p>
        <p className="mt-1 font-body text-sm text-ink-soft">listen to something together, someday 🎶</p>
      </div>
    </div>
  )
}
