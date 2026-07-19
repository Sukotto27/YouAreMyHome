import { useState } from 'react'

export default function BottomActions({ onSave, saving, onClear, onUndo, canUndo }) {
  const [confirmingClear, setConfirmingClear] = useState(false)

  function handleClear() {
    onClear()
    setConfirmingClear(false)
  }

  if (confirmingClear) {
    return (
      <div className="flex items-center justify-center gap-3 border-t border-ink/10 px-3 py-2 font-body text-sm">
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
    <div className="flex items-center justify-center gap-6 border-t border-ink/10 px-3 py-2">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-1.5 font-body text-sm font-medium text-rose transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
          <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" />
        </svg>
        {saving ? 'Saving…' : 'Save to scrapbook'}
      </button>
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="flex items-center gap-1.5 font-body text-sm text-ink-soft transition-colors hover:text-rose disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        </svg>
        Undo
      </button>
      <button
        type="button"
        onClick={() => setConfirmingClear(true)}
        className="flex items-center gap-1.5 font-body text-sm text-ink-soft transition-colors hover:text-rose"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
          <path d="M4 7h16" />
          <path d="M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7" />
          <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
        Clear
      </button>
    </div>
  )
}
