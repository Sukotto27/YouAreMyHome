export default function WaitingView({ questionText, ownAnswer }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-4 py-8 text-center sm:px-6">
      <div className="rounded-3xl border border-ink/10 bg-white/50 p-6">
        <p className="font-display text-2xl italic text-ink">{questionText}</p>
      </div>
      <div className="max-w-md rounded-2xl border border-blush bg-blush-soft/60 px-4 py-3 font-body text-ink">
        {ownAnswer}
      </div>
      <p className="animate-pulse font-hand text-2xl text-rose">waiting on your partner...</p>
    </div>
  )
}
