// Per-player camera following: eases toward the player, leads slightly in the
// direction they face, and never shows past the edges of the room. The
// camera's world position is (x, y) in tiles (y down); view3d.js turns that
// into a real 3D camera position.
import { CAMERA } from './config.js'
import { bodyCenter } from './gravity.js'

export function makeCamera() {
  return { x: 0, y: 0, lead: 0 }
}

export function updateCamera(cam, player, pane, level, dt, snap = false) {
  const halfH = CAMERA.VIEW_TILES_H / 2
  const halfW = (halfH * pane.w) / pane.h

  const targetLead = player.facing * CAMERA.LOOK_AHEAD
  cam.lead = snap ? targetLead : cam.lead + (targetLead - cam.lead) * Math.min(1, CAMERA.LOOK_AHEAD_SPEED * dt)
  const tx = player.x + cam.lead
  const ty = bodyCenter(player)

  const k = snap ? 1 : Math.min(1, CAMERA.FOLLOW_SPEED * dt)
  cam.x += (tx - cam.x) * k
  cam.y += (ty - cam.y) * k

  // keep the view inside the room (centre it if the room is smaller than the view)
  cam.x = level.cols <= halfW * 2 ? level.cols / 2 : Math.min(level.cols - halfW, Math.max(halfW, cam.x))
  cam.y = level.rows <= halfH * 2 ? level.rows / 2 : Math.min(level.rows - halfH + 2, Math.max(halfH, cam.y))
}
