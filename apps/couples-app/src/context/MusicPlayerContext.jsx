import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { onValue, ref, serverTimestamp, set } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { TRACKS, trackById } from '../lib/musicLibrary'

const DRIFT_TOLERANCE_SECONDS = 1.5
const RECHECK_MS = 10_000

const MusicPlayerContext = createContext(null)

function expectedPosition(state, now) {
  if (!state || !state.trackId) return 0
  const base = state.positionAtStart || 0
  if (!state.playing) return base
  return base + (now - state.startedAt) / 1000
}

// Owns the single, always-mounted <audio> element and the shared playback
// state — one provider, high up (mounted in Shell.jsx), so both the mini bar
// and the Music page control the same live session instead of each spinning
// up their own (which would double the sound). Sync works the same way
// hooks/useDateNightSyncUp.js's countdown does: a shared serverTimestamp()
// anchor (`startedAt` + `positionAtStart`) that every device independently
// computes "where should playback be right now" from — so a device opening
// the app late reconciles through the exact same code path as a live update.
export function MusicPlayerProvider({ children }) {
  const audioRef = useRef(null)
  const loadedTrackIdRef = useRef(null)
  const [remoteState, setRemoteState] = useState(null)
  const [localState, setLocalState] = useState(null)
  const [needsGesture, setNeedsGesture] = useState(false)
  const remoteStateRef = useRef(null)

  const state = firebaseReady ? remoteState : localState
  useEffect(() => {
    remoteStateRef.current = state
  }, [state])

  useEffect(() => {
    if (!firebaseReady) return
    return onValue(ref(rtdb, 'musicPlayer'), (snap) => {
      setRemoteState(snap.val())
    })
  }, [])

  function writeState(next) {
    if (!firebaseReady) {
      setLocalState({ ...next, startedAt: Date.now() })
      return
    }
    set(ref(rtdb, 'musicPlayer'), { ...next, startedAt: serverTimestamp() })
  }

  function reconcile(currentState) {
    const audio = audioRef.current
    if (!audio || !currentState || !currentState.trackId) return
    const track = trackById(currentState.trackId)
    if (!track) return

    if (loadedTrackIdRef.current !== currentState.trackId) {
      audio.src = track.url
      loadedTrackIdRef.current = currentState.trackId
      audio.currentTime = expectedPosition(currentState, Date.now())
    } else {
      const expected = expectedPosition(currentState, Date.now())
      if (Math.abs(audio.currentTime - expected) > DRIFT_TOLERANCE_SECONDS) {
        audio.currentTime = expected
      }
    }

    if (currentState.playing) {
      if (audio.paused) {
        audio
          .play()
          .then(() => setNeedsGesture(false))
          .catch(() => setNeedsGesture(true))
      }
    } else if (!audio.paused) {
      audio.pause()
    }
  }

  // Runs before the reconcile/interval effects below (source order = mount
  // order for sibling effects) so audioRef.current is already populated by
  // the time they first run.
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audioRef.current = audio

    function handleEnded() {
      const current = remoteStateRef.current
      if (!current || current.trackId !== loadedTrackIdRef.current || TRACKS.length === 0) return
      const idx = TRACKS.findIndex((track) => track.id === current.trackId)
      const nextTrack = TRACKS[(idx + 1) % TRACKS.length]
      writeState({ trackId: nextTrack.id, playing: true, positionAtStart: 0 })
    }

    audio.addEventListener('ended', handleEnded)
    return () => {
      audio.removeEventListener('ended', handleEnded)
      audio.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    reconcile(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.trackId, state?.playing, state?.startedAt, state?.positionAtStart])

  // Corrects for each device's own audio-clock drift over a long track —
  // RTDB only pushes updates on writes, so nothing else re-checks this
  // continuously while a song is just playing out.
  useEffect(() => {
    const id = setInterval(() => reconcile(remoteStateRef.current), RECHECK_MS)
    return () => clearInterval(id)
  }, [])

  function play() {
    const current = remoteStateRef.current
    if (!current || !current.trackId) return
    writeState({ trackId: current.trackId, playing: true, positionAtStart: expectedPosition(current, Date.now()) })
  }

  function pause() {
    const current = remoteStateRef.current
    if (!current || !current.trackId) return
    writeState({ trackId: current.trackId, playing: false, positionAtStart: expectedPosition(current, Date.now()) })
  }

  function selectTrack(id) {
    writeState({ trackId: id, playing: true, positionAtStart: 0 })
  }

  function skip(delta) {
    const current = remoteStateRef.current
    if (TRACKS.length === 0) return
    const idx = current?.trackId ? TRACKS.findIndex((track) => track.id === current.trackId) : -1
    const nextIdx = ((idx === -1 ? 0 : idx + delta) % TRACKS.length + TRACKS.length) % TRACKS.length
    selectTrack(TRACKS[nextIdx].id)
  }

  function resume() {
    audioRef.current
      ?.play()
      .then(() => setNeedsGesture(false))
      .catch(() => {})
  }

  const value = {
    tracks: TRACKS,
    currentTrack: state?.trackId ? trackById(state.trackId) : null,
    playing: !!state?.playing,
    needsGesture,
    play,
    pause,
    next: () => skip(1),
    previous: () => skip(-1),
    selectTrack,
    resume,
  }

  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>
}

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext)
  if (!context) {
    throw new Error('useMusicPlayer must be used within a MusicPlayerProvider')
  }
  return context
}
