import { useState } from 'react'
import { firebaseReady } from '../../firebase'

// The how-to-play paragraph on a game's start screen. In the real app it's
// just text. In preview/demo mode (no Firebase) it can be edited in place —
// edits are saved in this browser, and "Copy all my edits" gathers every
// game's edited wording so it can be handed over and made official in the
// code. Edits are ignored outside demo mode, so a stale one can never
// override the real wording.
const EDITS_KEY = 'you-are-my-home:demo-game-instructions'

function loadEdits() {
  try {
    return JSON.parse(localStorage.getItem(EDITS_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveEdits(edits) {
  try {
    localStorage.setItem(EDITS_KEY, JSON.stringify(edits))
  } catch {
    // storage unavailable — edits just won't survive a reload
  }
}

export default function GameIntro({ gameKey, title, defaultText }) {
  const canEdit = !firebaseReady
  const [edits, setEdits] = useState(loadEdits)
  const [editing, setEditing] = useState(false)
  const [exportText, setExportText] = useState('')

  const text = canEdit && edits[gameKey] !== undefined ? edits[gameKey] : defaultText

  function change(value) {
    const next = { ...edits, [gameKey]: value }
    setEdits(next)
    saveEdits(next)
  }

  function resetThis() {
    const { [gameKey]: _removed, ...rest } = edits
    setEdits(rest)
    saveEdits(rest)
  }

  function copyAll() {
    // Re-read storage so edits made on other games' screens are included too.
    const all = loadEdits()
    const lines = Object.entries(all).map(([key, value]) => `${key} | ${value}`)
    const out = lines.length ? lines.join('\n\n') : '(no edits yet)'
    setExportText(out)
    navigator.clipboard?.writeText(out).catch(() => {
      // clipboard blocked — the box below is still selectable
    })
  }

  if (!canEdit) {
    return <p className="max-w-sm whitespace-pre-line font-body text-sm text-ink-soft">{text}</p>
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-2">
      {editing ? (
        <textarea
          value={text}
          onChange={(event) => change(event.target.value)}
          rows={6}
          className="w-full rounded-xl border border-rose/40 bg-white px-3 py-2 text-left font-body text-sm text-ink focus:border-rose focus:outline-none"
        />
      ) : (
        <p className="whitespace-pre-line font-body text-sm text-ink-soft">{text}</p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3 font-body text-xs">
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="rounded-full border border-rose/40 px-3 py-1 font-medium text-rose transition-colors hover:bg-blush-soft"
        >
          {editing ? 'Done editing' : '✏️ Edit instructions'}
        </button>
        {editing && (
          <>
            <button type="button" onClick={copyAll} className="rounded-full bg-rose px-3 py-1 font-medium text-paper">
              Copy all my edits
            </button>
            {edits[gameKey] !== undefined && (
              <button
                type="button"
                onClick={resetThis}
                className="text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
              >
                Reset {title || 'this one'}
              </button>
            )}
          </>
        )}
      </div>
      {editing && exportText && (
        <textarea
          readOnly
          value={exportText}
          rows={Math.min(14, exportText.split('\n').length + 1)}
          onFocus={(event) => event.target.select()}
          className="w-full resize-none rounded-lg border border-ink/15 bg-white px-2 py-1 text-left font-mono text-[11px] text-ink"
        />
      )}
    </div>
  )
}
