export default function AssessmentResult({ mineLabel, partnerLabel, partnerName, children }) {
  return (
    <div className="space-y-1 rounded-xl border border-ink/10 bg-blush-soft/40 p-3 font-body text-sm">
      <p className="text-ink">
        <span className="font-medium">Yours:</span> {mineLabel}
      </p>
      <p className="text-ink-soft">
        <span className="font-medium">{partnerName}'s:</span> {partnerLabel ?? "hasn't taken this yet"}
      </p>
      {children}
    </div>
  )
}
