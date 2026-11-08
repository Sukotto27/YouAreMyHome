// Footstep sounds: a step every stride while someone walks or runs on the ground (slower and quieter when crouching).
// Browsers only allow audio after a tap or key press; the title screen's "tap to start" provides it.
const FILES = [1, 2, 3, 4, 5, 6].map((n) => `${import.meta.env.BASE_URL}doors/sounds/step${n}.mp3`)
const STRIDE = 1.5 // distance walked between steps, in tiles
const STRIDE_CROUCH = 1.0

export function createFootsteps() {
  const pool = FILES.map((src) => {
    const a = new Audio(src)
    a.preload = 'auto'
    return a
  })
  const walked = new Map() // player id -> distance since the last step
  let last = -1

  function play(volume) {
    let i
    do i = Math.floor(Math.random() * pool.length)
    while (i === last && pool.length > 1)
    last = i
    const a = pool[i]
    try {
      a.volume = volume
      a.currentTime = 0
      a.playbackRate = 0.92 + Math.random() * 0.16
      a.play()?.catch(() => {})
    } catch {
      /* audio not available yet */
    }
  }

  return {
    /** Call once per simulation step. */
    update(game, dt) {
      for (const p of game.players) {
        if (!p.onGround || Math.abs(p.vx) < 0.8 || p.dead) {
          // standing still or in the air: the next step comes after a full stride
          walked.set(p.id, 0)
          continue
        }
        const d = (walked.get(p.id) ?? 0) + Math.abs(p.vx) * dt
        if (d >= (p.crouching ? STRIDE_CROUCH : STRIDE)) {
          walked.set(p.id, d % STRIDE)
          play(p.crouching ? 0.12 : 0.3)
        } else walked.set(p.id, d)
      }
    },
  }
}
