import { useEffect, useRef, useState } from 'react'
import { onValue, push, ref, serverTimestamp as rtdbServerTimestamp, set } from 'firebase/database'
import { rtdb, firebaseReady } from '../firebase'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import {
  MAX_OBSTACLES_PER_PLAYER,
  activeObstacleCount,
  clipStrokeAroundHoles,
  isObstacleExpired,
} from '../lib/obstacleDrop'

const DEMO_KEY = 'obstacleDropObstacles'
const TICK_MS = 250

// Obstacles never get an explicit "remove" write for expiring — per-obstacle
// expiry is purely a local wall-clock comparison against the shared
// `createdAt` (server timestamp, so both clients agree on when "10 seconds
// ago" was), which is what lets the host's physics world and both clients'
// rendering drop the same obstacle at the same moment without any extra
// sync traffic. The `now` tick below exists only to force a re-filter on a
// timer, since nothing else would otherwise cause a re-render at the exact
// moment an obstacle ages out.
export function useObstacleDropObstacles() {
  const [obstacles, setObstacles] = useState(firebaseReady ? [] : readDemoList(DEMO_KEY))
  const [now, setNow] = useState(() => Date.now())
  const obstaclesRef = useRef(obstacles)
  obstaclesRef.current = obstacles

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!firebaseReady) return
    return onValue(ref(rtdb, 'obstacleDrop/obstacles'), (snap) => {
      const value = snap.val() || {}
      setObstacles(Object.entries(value).map(([id, data]) => ({ id, ...data })))
    })
  }, [])

  const activeObstacles = obstacles.filter((o) => !isObstacleExpired(o, now))

  function canDraw(uid) {
    return activeObstacleCount(obstaclesRef.current, uid, Date.now()) < MAX_OBSTACLES_PER_PLAYER
  }

  // `points` are the raw drawn points (normalized fractions) before hole
  // clipping — returns false if the whole stroke had to be rejected (fully
  // inside a protected zone, or the player's already at their cap).
  async function addObstacle(uid, points) {
    if (!canDraw(uid)) return false
    const runs = clipStrokeAroundHoles(points)
    if (runs.length === 0) return false

    if (!firebaseReady) {
      const next = [...obstaclesRef.current, { id: crypto.randomUUID(), uid, runs, createdAt: Date.now() }]
      writeDemoList(DEMO_KEY, next)
      setObstacles(next)
      return true
    }

    const obstacleRef = push(ref(rtdb, 'obstacleDrop/obstacles'))
    await set(obstacleRef, { uid, runs, createdAt: rtdbServerTimestamp() })
    return true
  }

  return { obstacles, activeObstacles, canDraw, addObstacle }
}
