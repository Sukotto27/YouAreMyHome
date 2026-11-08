// The cutscene's door: a front-facing door set in the room's back wall (the one the pair walk out of), the
// white light that pours from it, and the padlock that appears when it closes. It stays in the room afterwards,
// shut and locked. (The game's other doors are built edge-on for the side view: see world3d.js.)
import * as THREE from 'three'
import { VIEW3D } from './config.js'
import { getHaloTexture } from './world3d.js'

const DOOR_W = 2.4
const DOOR_H = 3.6

export function createIntroRig(scene) {
  const group = new THREE.Group()
  group.visible = false
  scene.add(group)
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra })

  // frame
  const frameMat = std('#2e1b0d')
  const post = (x, w, h, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), frameMat)
    m.position.set(x, y, 0.02)
    group.add(m)
  }
  post(-DOOR_W / 2 - 0.08, 0.2, DOOR_H + 0.2, DOOR_H / 2)
  post(DOOR_W / 2 + 0.08, 0.2, DOOR_H + 0.2, DOOR_H / 2)
  post(0, DOOR_W + 0.36, 0.2, DOOR_H + 0.1)

  // the white light: a plane just inside the doorway that grows to fill the screen, and a glow
  const light = new THREE.Mesh(
    new THREE.PlaneGeometry(DOOR_W, DOOR_H),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false }),
  )
  light.position.set(0, DOOR_H / 2, -0.02)
  light.renderOrder = -1
  group.add(light)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: getHaloTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  halo.position.set(0, DOOR_H / 2, 0.03)
  group.add(halo)
  // the doorway lights whoever steps out of it (the rest of the scene is dark until the room appears)
  // (a spotlight from the gap into the room: its cone starts as wide as the gap, so the light is shaped by the door)
  const spill = new THREE.SpotLight(0xfff4e6, 0, 14, 0.62, 0.85, 1.2)
  spill.position.set(0, DOOR_H * 0.55, 0.3)
  spill.target.position.set(0, 0.9, 5)
  group.add(spill, spill.target)
  // the patch of light on the floor: a wedge from the gap, widening and fading as it comes into the room
  const WEDGE_LEN = 5.5
  const wedgeGeo = new THREE.BufferGeometry()
  wedgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3))
  wedgeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 0.97, 0.9, 1, 0.97, 0.9, 0, 0, 0, 0, 0, 0]), 3))
  wedgeGeo.setIndex([0, 2, 1, 1, 2, 3])
  const wedge = new THREE.Mesh(wedgeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }))
  wedge.renderOrder = 1
  group.add(wedge)

  // the leaf, hinged on its left edge, with four raised panels, a knob and (when shut) a padlock
  const pivot = new THREE.Group()
  pivot.position.set(-DOOR_W / 2, 0, 0.1)
  group.add(pivot)
  const leafW = DOOR_W - 0.02
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, DOOR_H - 0.04, 0.14), std('#6b4423'))
  leaf.position.set(leafW / 2, (DOOR_H - 0.04) / 2, 0)
  pivot.add(leaf)
  const panelMat = std('#85552b')
  for (const px of [0.3, 0.7]) {
    for (const py of [0.28, 0.72]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(leafW * 0.34, DOOR_H * 0.3, 0.05), panelMat)
      panel.position.set(leafW * px, DOOR_H * py, 0.08)
      pivot.add(panel)
    }
  }
  const brass = std('#d6a84a', { metalness: 0.6, roughness: 0.35 })
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), brass)
  knob.position.set(leafW - 0.22, DOOR_H * 0.5, 0.16)
  pivot.add(knob)
  const lock = new THREE.Group()
  lock.position.set(leafW - 0.22, DOOR_H * 0.5 - 0.42, 0.16)
  const lockBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.12), brass)
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 12, Math.PI), brass)
  shackle.position.y = 0.16
  lock.add(lockBody, shackle)
  lock.visible = false
  pivot.add(lock)

  return {
    group,
    setLevel(level) {
      const intro = level.intro
      group.visible = !!intro
      if (intro) group.position.set(intro.doorX, -intro.doorY, VIEW3D.BACK_WALL_Z + 0.07)
    },
    // c: { door: 0 shut..1 open, light: 0..1, lock: 0..1 } — or null for the resting state (shut and locked)
    apply(c) {
      const door = c ? c.door : 0
      const glow = c ? c.light : 0
      const locked = c ? c.lock : 1
      pivot.rotation.y = -door * 1.75 // swings toward the camera
      light.visible = glow > 0.001
      light.scale.setScalar(1)
      // the leaf swings toward the room from its left hinge, so the gap is what it uncovers on the right
      const angle = Math.min(door * 1.75, Math.PI / 2)
      const gapL = -DOOR_W / 2 + DOOR_W * Math.cos(angle), gapR = DOOR_W / 2, gapMid = (gapL + gapR) / 2, gapHalf = (gapR - gapL) / 2
      light.scale.set(Math.max(0.02, gapR - gapL) / DOOR_W, 1, 1)
      light.position.x = gapMid
      spill.intensity = glow * 34
      spill.position.x = gapMid
      spill.angle = 0.2 + 0.45 * Math.min(1, (gapR - gapL) / DOOR_W)
      const spread = gapHalf + WEDGE_LEN * (0.1 + 0.4 * Math.min(1, (gapR - gapL) / DOOR_W))
      const pos = wedgeGeo.attributes.position
      pos.setXYZ(0, gapL, 0.03, 0.05)
      pos.setXYZ(1, gapR, 0.03, 0.05)
      pos.setXYZ(2, gapMid - spread, 0.03, WEDGE_LEN)
      pos.setXYZ(3, gapMid + spread, 0.03, WEDGE_LEN)
      pos.needsUpdate = true
      wedge.visible = glow > 0.001
      wedge.material.opacity = Math.min(1, glow) * 0.8
      light.position.y = DOOR_H / 2
      light.material.opacity = Math.min(1, glow * 1.6)
      halo.visible = glow > 0.001
      halo.position.x = gapMid
      halo.scale.set(0.8 + gapHalf * 2.2, 3.2, 1) // a soft glow around the gap, not a flood
      halo.material.opacity = glow * 0.5
      lock.visible = locked > 0.001
      lock.scale.setScalar(0.3 + 0.7 * locked)
    },
  }
}
