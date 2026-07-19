export default function Wordmark({ animated = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center font-display text-lg tracking-wide text-ink-soft ${className}`}
    >
      {animated && (
        <span className="inline-block max-w-[130px] origin-right overflow-hidden whitespace-nowrap animate-wordmark-tuck motion-reduce:hidden">
          You Are My&nbsp;
        </span>
      )}
      <span className="inline-block">Home</span>
    </span>
  )
}
