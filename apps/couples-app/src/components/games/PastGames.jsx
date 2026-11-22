import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db, firebaseReady } from '../../firebase'
import { readDemoList } from '../../lib/demoStore'

// Archived matches for one game (see lib/gameHistory.js), newest first,
// collapsed until asked for. Renders nothing when there's no history.
export default function PastGames({ game, myUid, partnerUid, partnerLabel }) {
  const [entries, setEntries] = useState(() =>
    firebaseReady ? [] : readDemoList('gameHistory').filter((e) => e.game === game),
  )
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!firebaseReady) return
    // Single-field filter + client-side sort: no composite index needed.
    return onSnapshot(query(collection(db, 'gameHistory'), where('game', '==', game)), (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.endedAt - a.endedAt))
    })
  }, [game])

  if (entries.length === 0) return null
  const who = (uid) => (uid === myUid ? 'You' : partnerLabel)

  return (
    <div className="w-full space-y-3 text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="block font-body text-xs text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
      >
        {open ? 'Hide' : 'Show'} past games ({entries.length})
      </button>
      {open &&
        entries.map((e) => (
          <div key={e.id || e.endedAt} className="space-y-1.5 rounded-2xl border border-dashed border-ink/15 p-3">
            <p className="font-body text-xs text-ink-soft">
              {new Date(e.endedAt).toLocaleString()}
              {e.status === 'playing' ? ' · ended early' : ''}
            </p>
            {e.game === 'farkle' && (
              <p className="font-body text-sm text-ink">
                {[myUid, partnerUid].map((uid) => `${who(uid)} ${(e.scores?.[uid] || 0).toLocaleString()}`).join(' · ')}
                {e.winnerUid ? ` — ${who(e.winnerUid)} won` : ''}
              </p>
            )}
            {e.game === 'uno' && (
              <p className="font-body text-sm text-ink">
                {e.winnerUid ? `${who(e.winnerUid)} won` : 'No winner'}
                {' · cards left: '}
                {[myUid, partnerUid].map((uid) => `${who(uid)} ${e.cards?.[uid] ?? '?'}`).join(', ')}
              </p>
            )}
            {e.game === 'cac' &&
              (e.rounds || []).map((r, i) => (
                <div key={i} className="font-body text-sm text-ink">
                  <p className="text-ink-soft">{r.prompt}</p>
                  {[myUid, partnerUid].map(
                    (uid) =>
                      r.answers?.[uid] && (
                        <p key={uid}>
                          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{who(uid)}</span>{' '}
                          {r.answers[uid]}
                          {r.comments?.[uid] ? <span className="text-ink-soft"> — “{r.comments[uid]}”</span> : null}
                        </p>
                      ),
                  )}
                </div>
              ))}
          </div>
        ))}
    </div>
  )
}
