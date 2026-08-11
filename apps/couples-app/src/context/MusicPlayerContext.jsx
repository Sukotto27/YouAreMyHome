import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { onValue, ref, serverTimestamp, set, update } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { TRACKS, trackById } from '../lib/musicLibrary'
import { musicVolume, setMusicVolume } from '../lib/deviceSettings'
import { useMusicFavorites } from '../hooks/useMusicFavorites'
import { useAuth } from './AuthContext'
import { usePartnerUid } from '../hooks/usePartnerUid'

const DRIFT_TOLERANCE_SECONDS = 1.5
const RECHECK_MS = 10_000
const POSITION_TICK_MS = 500
const BOTH_PAUSED_CHECK_MS = 30_000
const BOTH_PAUSED_TIMEOUT_MS = 10 * 60 * 1000

const MusicPlayerContext = createContext(null)

// The shared session is a "radio station": once active it keeps advancing
// (base + elapsed) regardless of whether either device is actually playing
// audio locally — pausing is a per-device decision (see `manualPaused`
// below) and never touches this shared anchor. That's what makes "pause
// here, still playing there, resume back in sync" possible: resuming just
// re-reads this same always-advancing position instead of a frozen one.
function expectedPosition(state, now) {
  if (!state || !state.trackId) return 0
  const base = state.positionAtStart || 0
  if (!state.active) return base
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
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
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

  // Both of these are "this device has stopped listening" — a manual pause
  // and a sleep-timer pause — but neither is shared playback state (see
  // expectedPosition above): they only stop *this* device's <audio>, so the
  // partner's stream is untouched. Combined into `locallyPaused` for every
  // check below; the ref mirror exists because reconcile() runs from
  // mount-only effects that would otherwise close over a stale value.
  const [manualPaused, setManualPaused] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  const locallyPaused = manualPaused || sleeping
  const locallyPausedRef = useRef(false)
  useEffect(() => {
    locallyPausedRef.current = locallyPaused
  }, [locallyPaused])
  const [sleepTimerEndsAt, setSleepTimerEndsAt] = useState(null)
  const sleepTimeoutRef = useRef(null)

  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)

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

  // Starts a brand-new session — the caller becomes host, and the session
  // plays as a radio station (see expectedPosition) until the host ends it
  // or both of you sit paused past BOTH_PAUSED_TIMEOUT_MS.
  function startSession(trackId) {
    const shuffle = remoteStateRef.current?.shuffle ?? true
    if (!firebaseReady) {
      setLocalState({ trackId, positionAtStart: 0, startedAt: Date.now(), shuffle, active: true, hostId: 'local' })
      return
    }
    set(ref(rtdb, 'musicPlayer'), {
      active: true,
      hostId: user?.uid ?? null,
      trackId,
      positionAtStart: 0,
      startedAt: serverTimestamp(),
      shuffle,
    })
  }

  // Moves an already-active session to a new track (skip/select/auto-advance)
  // via update() rather than set(), so it never clobbers hostId/active/
  // pausedAt — only writeState-equivalent fields change here.
  function updateTrack(trackId, positionAtStart) {
    if (!firebaseReady) {
      setLocalState((prev) => (prev ? { ...prev, trackId, positionAtStart, startedAt: Date.now() } : prev))
      return
    }
    update(ref(rtdb, 'musicPlayer'), { trackId, positionAtStart, startedAt: serverTimestamp() })
  }

  function endSession() {
    if (!firebaseReady) {
      setLocalState(null)
      return
    }
    set(ref(rtdb, 'musicPlayer'), null)
  }

  function reconcile(currentState) {
    const audio = audioRef.current
    if (!audio) return

    if (!currentState || !currentState.active || !currentState.trackId) {
      if (!audio.paused) audio.pause()
      return
    }

    const track = trackById(currentState.trackId)
    if (!track) return

    if (loadedTrackIdRef.current !== currentState.trackId) {
      setDuration(0)
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

    if (!locallyPausedRef.current) {
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
    audio.volume = volumeRef.current
    audioRef.current = audio

    function handleEnded() {
      const current = remoteStateRef.current
      if (!current || current.trackId !== loadedTrackIdRef.current) return
      const nextId = resolveNextTrackId(current, 1)
      if (nextId) updateTrack(nextId, 0)
    }

    function handleLoadedMetadata() {
      setDuration(audio.duration || 0)
    }

    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    return () => {
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    reconcile(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.trackId, state?.active, state?.startedAt, state?.positionAtStart])

  // Local pause/resume needs to take effect immediately (not wait for the
  // next drift-correction tick), so it re-runs reconcile() as soon as either
  // flag flips.
  useEffect(() => {
    reconcile(remoteStateRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locallyPaused])

  // Corrects for each device's own audio-clock drift over a long track —
  // RTDB only pushes updates on writes, so nothing else re-checks this
  // continuously while a song is just playing out.
  useEffect(() => {
    const id = setInterval(() => reconcile(remoteStateRef.current), RECHECK_MS)
    return () => clearInterval(id)
  }, [])

  // Drives the progress bars off the shared session anchor, not this
  // device's <audio>.currentTime — so a locally-paused listener still sees
  // the track advance in real time, matching what's actually playing for
  // their partner.
  useEffect(() => {
    const id = setInterval(() => {
      setPosition(expectedPosition(remoteStateRef.current, Date.now()))
    }, POSITION_TICK_MS)
    return () => clearInterval(id)
  }, [])

  // Publishes "I've stopped listening, as of this moment" so any device can
  // detect "both of you are paused" below — presence-keyed by uid the same
  // way useDateNightSyncUp.js's ready-state is.
  useEffect(() => {
    if (!firebaseReady || !user || !state?.active) return
    set(ref(rtdb, `musicPlayer/pausedAt/${user.uid}`), locallyPaused ? serverTimestamp() : null)
  }, [user, state?.active, locallyPaused])

  // Ends the session if both of you have been paused for too long — a radio
  // station nobody's listening to. Whichever device's tick notices first
  // just ends it; a near-simultaneous double-write from both devices is
  // harmless since they'd both write the same `null`.
  useEffect(() => {
    if (!firebaseReady) return
    const id = setInterval(() => {
      const current = remoteStateRef.current
      if (!current?.active || !user || !partnerUid) return
      const mine = current.pausedAt?.[user.uid]
      const theirs = current.pausedAt?.[partnerUid]
      if (!mine || !theirs) return
      const bothPausedSince = Math.max(mine, theirs)
      if (Date.now() - bothPausedSince > BOTH_PAUSED_TIMEOUT_MS) {
        set(ref(rtdb, 'musicPlayer'), null)
      }
    }, BOTH_PAUSED_CHECK_MS)
    return () => clearInterval(id)
  }, [user, partnerUid])

  function play() {
    setManualPaused(false)
    setSleeping(false)
    reconcile(remoteStateRef.current)
  }

  function pause() {
    setManualPaused(true)
    audioRef.current?.pause()
  }

  function selectTrack(id) {
    setManualPaused(false)
    setSleeping(false)
    if (remoteStateRef.current?.active) {
      updateTrack(id, 0)
    } else {
      startSession(id)
    }
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
    // Reflects actual local playback, not just the shared session — while
    // this device is locally paused (manually or via sleep timer) the
    // play/pause button should show "play" (tap to resume) even though the
    // session is still live and audible for the partner.
    playing: !!state?.active && !!state?.trackId && !locallyPaused,
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
    isHost: firebaseReady ? !!user && state?.hostId === user.uid : true,
    endSession,
    duration,
    position,
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
