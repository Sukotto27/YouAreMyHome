import { useEffect, useRef } from 'react'
import { playSound } from '../lib/sounds'

const SETTLE_MS = 2500

// Plays the cheer when a game you are in finishes and a winner is declared.
// Only a live change counts: a finished match that was simply already there
// when you opened the game (or was still loading in) stays quiet.
export function useWinCheer(finished) {
  const mountedAt = useRef(Date.now())
  const wasFinished = useRef(!!finished)
  useEffect(() => {
    if (finished && !wasFinished.current && Date.now() - mountedAt.current > SETTLE_MS) playSound('cheering')
    wasFinished.current = !!finished
  }, [finished])
}
