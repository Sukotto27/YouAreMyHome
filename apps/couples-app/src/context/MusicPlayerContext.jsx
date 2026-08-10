import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { onValue, ref, serverTimestamp, set, update } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { TRACKS, trackById } from '../lib/musicLibrary'
import { musicVolume, setMusicVolume } from '../lib/deviceSettings'
import { useMusicFavorites } from '../hooks/useMusicFavorites'

const DRIFT_TOLERANCE_SECONDS = 1.5
const RECHECK_MS = 10_000

const MusicPlayerContext = createContext(null)

function expectedPosition(state, now) {
  if (!state || !state.trackId) return 0
  const base = state.positionAtStart || 0
  if (!state.playing) return base
  return base + (now - state.startedAt) / 1000
}

// Resolves a concrete target track id for next/previous/auto-advance —
// shuffled or sequential, but always a specific id written straight to
// shared state (never a relative "skip forward" instruction), so there's no
// ordering-agreement problem between devices: whichever device acts first
// just picks, and the other follows.
function resolveNextTrackId(current, delta) {
  if (TRACKS.length === 0) return null
  const shuffle = current?.shuffle ?? true
  const idx = current?.trackId ? TRACKS.findIndex((track) => track.id === current.trackId) : -1

  if (shuffle && TRACKS.length > 1) {
    let nextIdx
    do {
      nextIdx = Math.floor(Math.random() * TRACKS.length)
    } while (nextIdx === idx)
    return TRACKS[nextIdx].id
  }

  const nextIdx = (((idx === -1 ? 0 : idx + delta) % TRACKS.length) + TRACKS.length) % TRACKS.length
  return TRACKS[nextIdx].id
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

  // Volume is deliberately per-device (see lib/deviceSettings.js) — never
  // written to shared state, unlike everything else here. The ref mirror is
  // needed because reconcile() gets called from effects that only ever run
  // once (mount), so a plain closure over `volume` would go stale.
  const [volume, setVolumeState] = useState(() => musicVolume())
  const volumeRef = useRef(volume)
  useEffect(() => {
    volumeRef.current = volume
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // Sleep timer is also local-only, on purpose — it must not pause a
  // partner who's still listening. `sleeping` overrides reconcile()'s
  // auto-play so a local pause sticks instead of being un-paused by the
  // next drift-correction tick (which otherwise re-asserts shared state).
  const [sleeping, setSleeping] = useState(false)
  const sleepingRef = useRef(false)
  const [sleepTimerEndsAt, setSleepTimerEndsAt] = useState(null)
  const sleepTimeoutRef = useRef(null)
  useEffect(() => {
    sleepingRef.current = sleeping
  }, [sleeping])

  const favorites = useMusicFavorites()

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

  // Always carries the current shuffle setting forward — every caller here
  // (play/pause/selectTrack/skip) only ever specifies trackId/playing/
  // positionAtStart, so without this a plain set() would silently wipe
  // shuffle back to unset on every unrelated action.
  function writeState(next) {
    const shuffle = remoteStateRef.current?.shuffle ?? true
    if (!firebaseReady) {
      setLocalState({ ...next, shuffle, startedAt: Date.now() })
      return
    }
    set(ref(rtdb, 'musicPlayer'), { ...next, shuffle, startedAt: serverTimestamp() })
  }

  function reconcile(currentState) {
    const audio = audioRef.current
    if (!audio || !currentState || !currentState.trackId) return
    const track = trackById(currentState.trackId)
    if (!track) return

    if (loadedTrackIdRef.current !== currentState.trackId) {
      audio.src = track.url
      audio.volume = volumeRef.current
      loadedTrackIdRef.current = currentState.trackId
      audio.currentTime = expectedPosition(currentState, Date.now())
    } else {
      const expected = expectedPosition(currentState, Date.now())
      if (Math.abs(audio.currentTime - expected) > DRIFT_TOLERANCE_SECONDS) {
        audio.currentTime = expected
      }
    }

    if (currentState.playing) {
      if (audio.paused && !sleepingRef.current) {
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
    audio.volume = volumeRef.current
    audioRef.current = audio

    function handleEnded() {
      const current = remoteStateRef.current
      if (!current || current.trackId !== loadedTrackIdRef.current) return
      const nextId = resolveNextTrackId(current, 1)
      if (nextId) writeState({ trackId: nextId, playing: true, positionAtStart: 0 })
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
    setSleeping(false)
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
    setSleeping(false)
    writeState({ trackId: id, playing: true, positionAtStart: 0 })
  }

  function skip(delta) {
    const nextId = resolveNextTrackId(remoteStateRef.current, delta)
    if (nextId) selectTrack(nextId)
  }

  function resume() {
    setSleeping(false)
    audioRef.current
      ?.play()
      .then(() => setNeedsGesture(false))
      .catch(() => {})
  }

  function toggleShuffle() {
    const nextShuffle = !(remoteStateRef.current?.shuffle ?? true)
    if (!firebaseReady) {
      setLocalState((prev) => (prev ? { ...prev, shuffle: nextShuffle } : prev))
      return
    }
    update(ref(rtdb, 'musicPlayer'), { shuffle: nextShuffle })
  }

  function setVolume(next) {
    const clamped = Math.max(0, Math.min(1, next))
    setVolumeState(clamped)
    setMusicVolume(clamped)
  }

  function startSleepTimer(minutes) {
    if (sleepTimeoutRef.current) clearTimeout(sleepTimeoutRef.current)
    const ms = minutes * 60 * 1000
    setSleepTimerEndsAt(Date.now() + ms)
    sleepTimeoutRef.current = setTimeout(() => {
      setSleeping(true)
      audioRef.current?.pause()
      setSleepTimerEndsAt(null)
      sleepTimeoutRef.current = null
    }, ms)
  }

  function cancelSleepTimer() {
    if (sleepTimeoutRef.current) {
      clearTimeout(sleepTimeoutRef.current)
      sleepTimeoutRef.current = null
    }
    setSleepTimerEndsAt(null)
  }

  const value = {
    tracks: TRACKS,
    currentTrack: state?.trackId ? trackById(state.trackId) : null,
    // Reflects actual local playback, not just the shared intent — while a
    // sleep timer has this device intentionally paused, the play/pause
    // button should show "play" (tap to resume) rather than implying it's
    // still audibly playing, even though shared state still says it is.
    playing: !!state?.playing && !sleeping,
    needsGesture,
    play,
    pause,
    next: () => skip(1),
    previous: () => skip(-1),
    selectTrack,
    resume,
    shuffle: state?.shuffle ?? true,
    toggleShuffle,
    volume,
    setVolume,
    sleepTimerEndsAt,
    startSleepTimer,
    cancelSleepTimer,
    ...favorites,
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
