import { useState } from 'react'
import { useTreeEvents } from '../hooks/useTreeEvents'
import { firebaseReady } from '../firebase'
import { backfillTreeEvents } from '../lib/treeBackfill'
import TreeCanvas from '../components/tree/TreeCanvas'

// A living log of everything the two of you do in the app (besides Chat,
// which is an ever-flowing conversation rather than a discrete "thing that
// happened") — see lib/tree.js, lib/treeGeometry.js, and
// functions/index.js's logTreeEvent triggers for how a branch gets there.
export default function Tree() {
  const { loading, byFeature } = useTreeEvents()
  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildStatus, setRebuildStatus] = useState('')

  async function handleRebuild() {
    if (!firebaseReady) return
    setRebuilding(true)
    setRebuildStatus('')
    try {
      const total = await backfillTreeEvents((line) => setRebuildStatus(line))
      setRebuildStatus(`Done — ${total} branch${total === 1 ? '' : 'es'} up to date.`)
    } catch (error) {
      setRebuildStatus(`Something went wrong: ${error.message}`)
    } finally {
      setRebuilding(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-8 sm:px-6">
      <div className="text-center">
        <h1 className="font-display text-3xl italic text-ink">Tree of Union</h1>
        <p className="mt-1 font-hand text-xl text-ink-soft">planted the day we began, growing with everything we do</p>
      </div>

      {loading ? (
        <p className="pt-6 text-center font-hand text-lg text-ink-soft">just a moment...</p>
      ) : (
        <TreeCanvas byFeature={byFeature} />
      )}

      {firebaseReady && (
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={handleRebuild}
            disabled={rebuilding}
            className="font-body text-xs text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose disabled:cursor-not-allowed disabled:opacity-60"
          >
            {rebuilding ? 'Rebuilding from history...' : 'Rebuild from history'}
          </button>
          {rebuildStatus && <p className="mt-1 font-body text-xs text-ink-soft">{rebuildStatus}</p>}
        </div>
      )}
    </div>
  )
}
