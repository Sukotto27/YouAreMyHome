import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { useChatSettings } from '../hooks/useChatSettings'
import { preferredNameFor } from '../lib/avatars'

// Live invite for a session someone *just* started, distinct from a session
// that was already running when this device opened the app (that case gets
// the passive Music-tab badge + avatar emoji on Home instead — see
// Shell.jsx / Home.jsx). Told apart by `sessionId`: the first value seen is
// taken as a baseline (nothing to invite to, it was already there), and only
// a later change to a *new* sessionId hosted by the partner pops this.
export default function MusicInvitePopup() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { currentTrack, sessionActive, sessionId, hostId, hasJoined, joinSession } = useMusicPlayer()
  const [chatSettings] = useChatSettings()
  const baselineRef = useRef(undefined)
  const [invite, setInvite] = useState(null)

  useEffect(() => {
    if (baselineRef.current === undefined) {
      baselineRef.current = sessionId ?? null
      return
    }
    if (sessionId && sessionId !== baselineRef.current && hostId && hostId !== user?.uid) {
      setInvite({ sessionId, trackTitle: currentTrack?.title })
    }
    baselineRef.current = sessionId ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, hostId])

  if (!user || !invite || invite.sessionId !== sessionId || !sessionActive || hasJoined) return null

  const myName = user.displayName
  const partnerName = myName === 'Scott' ? 'Cristina' : 'Scott'
  const hostName = preferredNameFor(partnerName, chatSettings.preferredNames)

  function accept() {
    joinSession()
    setInvite(null)
    navigate('/music')
  }

  function decline() {
    setInvite(null)
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 text-center shadow-xl">
        <h2 className="font-display text-2xl italic text-ink">🎧 Join the music?</h2>
        <p className="mt-1 font-body text-sm text-ink-soft">
          {hostName} just started {invite.trackTitle ? `listening to "${invite.trackTitle}"` : 'a session'}.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={accept}
            className="rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            Join session
          </button>
          <button
            type="button"
            onClick={decline}
            className="rounded-full border border-ink/15 px-6 py-2.5 font-body font-medium text-ink-soft transition-colors hover:border-rose hover:text-rose"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
