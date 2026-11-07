// The 3D view: one WebGL renderer drawing the whole scene (world + characters)
// once per pane, each through its own slightly-angled perspective camera.
// Loaded lazily (it pulls in three.js and the character rig).
import * as THREE from 'three'
import { ABILITY, CAMERA, COLORS, DRAW, PLAYER, VIEW3D } from './config.js'
import { isSolid } from './levels.js'
import { createWorld, getHaloTexture } from './world3d.js'
import { ropeEnd, ropeHand } from './rope.js'
import { loadCharacters } from './characterRig.js'
import { bodyCenter } from './gravity.js'

const CHARACTER_FOR = { blue: 'scott', pink: 'cristina' }

// Which animation clip fits what a player is doing right now.
function clipFor(p) {
  const speed = Math.abs(p.vx)
  if (p.crouching) return speed > 0.4 ? { name: 'Crouch_Fwd_Loop', rate: Math.max(0.6, speed / 1.6) } : { name: 'Crouch_Idle_Loop' }
  if (!p.onGround) return p.vy * p.grav < 0 ? { name: 'Jump_Start', once: true } : { name: 'Jump_Loop' }
  if (speed < 0.4) return { name: 'Idle_Loop' }
  if (speed < 2.8) return { name: 'Walk_Loop', rate: speed / 1.5 }
  if (speed < 5.2) return { name: 'Jog_Fwd_Loop', rate: speed / 3.4 }
  return { name: 'Sprint_Loop', rate: speed / 5.6 }
}

export async function createView3D(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x0d0a12, 1)
  const canvas = renderer.domElement
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0'
  container.insertBefore(canvas, container.firstChild)

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xd9ccff, 0x5a4a52, 1.5))
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.4)
  sun.position.set(-7, 12, 14) // from the upper left, in front: tops and left faces catch the light
  scene.add(sun)
  // a softer fill from the camera's side so faces turned toward the camera's slight angle (door faces, block sides) aren't left dark
  const fill = new THREE.DirectionalLight(0xffffff, 1.3)
  fill.position.set(14, 3, 8)
  scene.add(fill)

  const world = await createWorld(scene)

  // --- players: stand-in capsules until the real models have loaded ---
  const players = {}
  for (const id of ['blue', 'pink']) {
    const capsule = new THREE.Mesh(
      new THREE.CapsuleGeometry(PLAYER.WIDTH / 2, PLAYER.HEIGHT_STAND - PLAYER.WIDTH, 6, 12),
      new THREE.MeshStandardMaterial({ color: COLORS[id] }),
    )
    capsule.position.y = PLAYER.HEIGHT_STAND / 2
    const root = new THREE.Group()
    root.add(capsule)
    scene.add(root)
    // a soft blob on the floor below them: tells you where they will land
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }),
    )
    shadow.rotation.x = -Math.PI / 2
    scene.add(shadow)
    players[id] = { root, capsule, shadow, actor: null, roll: 0 } // roll: 0 upright .. PI upside down (eased)
  }

  // --- cameras, one per pane ---
  const cameras = [0, 1].map(() => new THREE.PerspectiveCamera(VIEW3D.FOV, 1, 0.5, 200))
  const yaw = (VIEW3D.YAW_DEG * Math.PI) / 180
  const pitch = (VIEW3D.PITCH_DEG * Math.PI) / 180
  const distance = CAMERA.VIEW_TILES_H / 2 / Math.tan((VIEW3D.FOV * Math.PI) / 360)
  const offset = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(distance)
  const target = new THREE.Vector3()
  const rigOffset = new THREE.Vector3()
  const AXIS_Z = new THREE.Vector3(0, 0, 1)

  let width = 1
  let height = 1
  let currentLevel = null

  function resize(w, h) {
    width = w
    height = h
    renderer.setSize(w, h, false)
  }

  function setLevel(level, game) {
    currentLevel = level
    world.build(level, game)
  }

  // Replaces the stand-in capsules with Scott and Cristina once they're ready.
  // fits a freshly built character to player height, standing with its feet at the origin
  function prepareActor(actor) {
    actor.root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(actor.root)
    actor.model.position.y -= box.min.y
    actor.root.scale.setScalar(PLAYER.HEIGHT_STAND / (box.max.y - box.min.y))
  }

  // Light Echo copies: a second set of the characters, drawn as translucent glowing ghosts
  const echoViews = {}
  function makeGhost(actor, color) {
    const tint = new THREE.Color(color)
    const ghostMaterial = (m) => {
      const c = m.clone()
      c.transparent = true
      c.depthWrite = false
      c.opacity = 0.5
      if (c.color) c.color.lerp(tint, 0.35)
      if (c.emissive) {
        c.emissive.set(ABILITY.COLORS.lightEcho)
        c.emissiveIntensity = 0.9
      }
      return c
    }
    const materials = []
    actor.root.traverse((o) => {
      if (!o.isMesh) return
      o.material = Array.isArray(o.material) ? o.material.map(ghostMaterial) : ghostMaterial(o.material)
      materials.push(...(Array.isArray(o.material) ? o.material : [o.material]))
    })
    return materials
  }

  async function loadModels() {
    const { actors } = await loadCharacters()
    for (const [id, key] of Object.entries(CHARACTER_FOR)) {
      const actor = actors[key]
      prepareActor(actor)
      actor.root.traverse((o) => {
        if (o.isSkinnedMesh && o.visible && o.material?.emissive) {
          o.material.emissive.set(COLORS[id])
          o.material.emissiveIntensity = 0.1
        }
      })
      players[id].root.add(actor.root)
      players[id].capsule.visible = false
      players[id].actor = actor
    }
    try {
      const { actors: ghosts } = await loadCharacters()
      for (const [id, key] of Object.entries(CHARACTER_FOR)) {
        const actor = ghosts[key]
        prepareActor(actor)
        const materials = makeGhost(actor, COLORS[id])
        const root = new THREE.Group()
        root.add(actor.root)
        root.visible = false
        scene.add(root)
        echoViews[id] = { root, actor, materials }
      }
    } catch (error) {
      console.warn('[doors] echo figures unavailable', error)
    }
  }

  // The row of the first solid tile below the player's feet (for the blob shadow).
  function floorBelow(p) {
    if (!currentLevel) return p.y
    for (let ty = Math.floor(p.y - 0.01); ty < currentLevel.rows; ty++) {
      if (isSolid(currentLevel, Math.floor(p.x), ty)) return ty
    }
    return null
  }

  // A carrier holds their arms up (up and a little forward) to support the partner on their shoulders.
  // The animation set has no such clip, so after the mixer has posed the body the two upper-arm bones
  // are swung about the character's lateral axis; the amount eases in and out.
  const LATERAL = new THREE.Vector3(0, 0, 1)
  const ARMS_UP = (150 * Math.PI) / 180
  const _pq = new THREE.Quaternion()
  const _r = new THREE.Quaternion()
  function raiseArms(view, p, dt) {
    const target = p.carrying ? 1 : 0
    view.armsUp = (view.armsUp || 0) + (target - (view.armsUp || 0)) * Math.min(1, dt * 12)
    if (view.armsUp < 0.01) return
    const angle = p.facing * p.grav * ARMS_UP * view.armsUp // 'up' is the player's own up
    view.actor.root.updateMatrixWorld(true)
    for (const name of ['upperarm_l', 'upperarm_r']) {
      const bone = view.actor.model.getObjectByName(name)
      if (!bone || !bone.parent) continue
      bone.parent.getWorldQuaternion(_pq)
      _r.setFromAxisAngle(LATERAL, angle)
      // newLocal = parentWorld^-1 * R * parentWorld * oldLocal
      bone.quaternion.premultiply(_pq).premultiply(_r).premultiply(_pq.clone().invert())
      bone.updateMatrixWorld(true)
    }
  }

  // While drawing a line (or hanging from a rope) the caster extends an arm toward it: the upper arm and
  // forearm of whichever arm faces the camera are swung so they point at the target, and a glow of the
  // ability's colour gathers at the hand.
  const _p1 = new THREE.Vector3()
  const _p2 = new THREE.Vector3()
  const _d0 = new THREE.Vector3()
  const _d1 = new THREE.Vector3()
  const _qa = new THREE.Quaternion()
  const _qb = new THREE.Quaternion()
  const _qc = new THREE.Quaternion()
  const _qi = new THREE.Quaternion()
  function pointBone(bone, child, target, amount) {
    bone.getWorldPosition(_p1)
    child.getWorldPosition(_p2)
    _d0.subVectors(_p2, _p1).normalize()
    _d1.subVectors(target, _p1).normalize()
    _qa.setFromUnitVectors(_d0, _d1)
    _qb.slerpQuaternions(_qi.identity(), _qa, amount)
    bone.parent.getWorldQuaternion(_qc)
    bone.quaternion.premultiply(_qc).premultiply(_qb).premultiply(_qc.clone().invert())
    bone.updateMatrixWorld(true)
  }
  const handGlows = {}
  function extendArm(view, p, aim, amount, color) {
    view.actor.root.updateMatrixWorld(true)
    const get = (n) => view.actor.model.getObjectByName(n)
    const zOf = (bone) => (bone ? bone.getWorldPosition(_p1).z : -Infinity)
    const side = zOf(get('upperarm_l')) >= zOf(get('upperarm_r')) ? 'l' : 'r' // the arm nearer the camera
    const upper = get(`upperarm_${side}`)
    const lower = get(`lowerarm_${side}`)
    const hand = get(`hand_${side}`)
    if (!upper || !lower || !hand || !upper.parent || !lower.parent) return
    const target = new THREE.Vector3(aim.x, -aim.y, 0)
    pointBone(upper, lower, target, amount)
    pointBone(lower, hand, target, amount)
    let glow = handGlows[p.id]
    if (!glow) {
      glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getHaloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
      scene.add(glow)
      handGlows[p.id] = glow
    }
    hand.getWorldPosition(glow.position)
    glow.position.z += 0.05
    glow.material.color.set(color)
    glow.material.opacity = 0.9 * amount
    glow.scale.setScalar(0.5 + 0.1 * Math.sin(performance.now() / 90))
    glow.visible = true
  }

  function poseCharacters(game, dt) {
    for (const p of game.players) {
      const view = players[p.id]
      // A flipped player is the upright pose rolled half a turn about the view axis (z), pivoting on the
      // centre of their body so the flip tumbles. The facing sign is flipped with gravity (setGravity), so
      // `grav * facing` keeps them facing the same way on their own screen.
      const target = p.grav < 0 ? Math.PI : 0
      view.roll += (target - view.roll) * Math.min(1, dt * 10)
      if (Math.abs(target - view.roll) < 0.002) view.roll = target
      const half = p.h / 2
      view.root.rotation.order = 'ZYX'
      view.root.rotation.set(0, (p.grav * p.facing * Math.PI) / 2, view.roll)
      view.root.position.set(p.x + half * Math.sin(view.roll), -bodyCenter(p) - half * Math.cos(view.roll), 0)
      if (view.actor) {
        const clip = clipFor(p)
        view.actor.play(clip.name, { once: !!clip.once, speed: clip.rate || 1 })
        view.actor.mixer.update(dt)
        raiseArms(view, p, dt)
        // the arm: out toward the line being drawn, or toward whatever the rope is attached to
        let aim = null
        let color = ABILITY.COLORS.solidLight
        if (p.draw.mode !== 'idle' && p.aim) aim = p.aim
        else if (p.rope.mode === 'attached') {
          aim = ropeEnd(game, p)
          color = ABILITY.COLORS.lightRope
        }
        view.aimAmt = (view.aimAmt || 0) + ((aim ? 1 : 0) - (view.aimAmt || 0)) * Math.min(1, dt * 14)
        if (aim && view.aimAmt > 0.02) extendArm(view, p, aim, view.aimAmt, color)
        else if (handGlows[p.id]) handGlows[p.id].visible = false
      } else {
        view.capsule.scale.y = p.h / PLAYER.HEIGHT_STAND
        view.capsule.position.y = p.h / 2
      }
      const floor = p.grav > 0 && view.roll < 0.05 ? floorBelow(p) : null // (no blob shadow on the ceiling)
      view.shadow.visible = floor !== null
      if (floor !== null) {
        const fall = Math.max(0, floor - p.y) // how far above the floor they are
        view.shadow.position.set(p.x, -floor + 0.03, 0)
        view.shadow.scale.setScalar(Math.max(0.35, 1 - fall * 0.09))
        view.shadow.material.opacity = Math.max(0.12, 0.42 - fall * 0.04)
      }
    }
  }

  // Light Echo copies: standing where they were cast, translucent, fading out over their last second
  function poseEchoes(game, dt) {
    for (const id of ['blue', 'pink']) {
      const ev = echoViews[id]
      if (!ev) continue
      const e = game.echoes.find((x) => x.id === id)
      ev.root.visible = !!e
      if (!e) continue
      const roll = e.grav < 0 ? Math.PI : 0
      const half = e.h / 2
      const center = e.y - (e.grav < 0 ? -e.h : e.h) / 2
      ev.root.rotation.order = 'ZYX'
      ev.root.rotation.set(0, (e.grav * e.facing * Math.PI) / 2, roll)
      ev.root.position.set(e.x + half * Math.sin(roll), -center - half * Math.cos(roll), 0)
      ev.actor.play(e.crouching ? 'Crouch_Idle_Loop' : 'Idle_Loop')
      ev.actor.mixer.update(dt)
      const fade = Math.min(1, Math.max(0, e.life - e.age))
      const opacity = fade * (0.5 + 0.1 * Math.sin(game.time * 6))
      for (const m of ev.materials) m.opacity = opacity
    }
  }

  // Light Rope: a glowing line from the caster's hand to where it caught, with a small glow at the end
  const ropeMeshes = {}
  function poseRopes(game) {
    for (const p of game.players) {
      let rope = ropeMeshes[p.id]
      if (!rope) {
        rope = {
          line: new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), new THREE.MeshBasicMaterial({ color: ABILITY.COLORS.lightRope })),
          tip: new THREE.Sprite(new THREE.SpriteMaterial({ map: getHaloTexture(), color: ABILITY.COLORS.lightRope, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })),
        }
        rope.tip.scale.setScalar(0.55)
        scene.add(rope.line, rope.tip)
        ropeMeshes[p.id] = rope
      }
      const end = p.rope.mode === 'attached' ? ropeEnd(game, p) : null
      rope.line.visible = rope.tip.visible = !!end
      if (!end) continue
      const hand = ropeHand(p)
      const ax = hand.x
      const ay = -hand.y
      const bx = end.x
      const by = -end.y
      const dx = bx - ax
      const dy = by - ay
      const len = Math.hypot(dx, dy) || 1e-3
      rope.line.position.set((ax + bx) / 2, (ay + by) / 2, 0.15)
      rope.line.rotation.z = Math.atan2(-dx, dy)
      const fade = Math.min(1, (p.rope.life - p.rope.age) / 0.6) // it fades out over its last moments
      rope.line.scale.set(1 + 0.25 * Math.sin(game.time * 20), len, 1)
      rope.line.material.opacity = 1
      rope.line.material.transparent = true
      rope.line.material.opacity = 0.35 + 0.65 * Math.max(0, fade)
      rope.tip.position.set(bx, by, 0.2)
      rope.tip.material.opacity = 0.4 + 0.6 * Math.max(0, fade)
    }
  }

  // --- drawn lines: a glowing tube per line (and one for the stroke being drawn) ---
  const LINE_LIGHT = { blue: '#7db4ff', pink: '#ff8cc6' }
  const lineMeshes = new Map() // key -> { mesh, count, item }

  function syncLines(game) {
    const items = game.lines.map((l) => ({ key: l.id, owner: l.owner, points: l.points, age: l.age, life: l.life }))
    if (game.stroke && game.stroke.points.length >= 2) {
      items.push({ key: 'stroke', owner: game.stroke.owner, points: game.stroke.points, age: 0, life: Infinity, stroke: true })
    }
    const keep = new Set()
    for (const item of items) {
      keep.add(item.key)
      let entry = lineMeshes.get(item.key)
      if (!entry || entry.count !== item.points.length) {
        if (entry) {
          entry.mesh.geometry.dispose()
        } else {
          const material = new THREE.MeshStandardMaterial({
            color: LINE_LIGHT[item.owner],
            emissive: LINE_LIGHT[item.owner],
            emissiveIntensity: 0.55,
            roughness: 0.35,
            transparent: true,
          })
          entry = { mesh: new THREE.Mesh(undefined, material), count: 0, item }
          scene.add(entry.mesh)
          lineMeshes.set(item.key, entry)
        }
        const curve = new THREE.CatmullRomCurve3(item.points.map((p) => new THREE.Vector3(p.x, -p.y, -0.05)), false, 'centripetal')
        entry.mesh.geometry = new THREE.TubeGeometry(curve, Math.min(500, item.points.length * 3), (DRAW.LINE_THICKNESS / 2) * 0.9, 8, false)
        entry.count = item.points.length
      }
      entry.item = item
    }
    for (const [key, entry] of lineMeshes) {
      if (keep.has(key)) continue
      scene.remove(entry.mesh)
      entry.mesh.geometry.dispose()
      entry.mesh.material.dispose()
      lineMeshes.delete(key)
    }
  }

  // A line looks ghostly to the player who drew it (they can't stand on it) and
  // solid to their partner; every line fades out over its last moments.
  function poseLines(viewer) {
    for (const { mesh, item } of lineMeshes.values()) {
      let opacity = item.stroke ? 0.75 : item.owner === viewer.id ? 0.35 : 1
      const left = item.life - item.age
      if (left < DRAW.FADE_TIME) opacity *= Math.max(0, left / DRAW.FADE_TIME)
      mesh.material.opacity = opacity
    }
  }

  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  // The point in the players' plane (z = 0) under a screen position — what the
  // mouse is pointing at — in tile coordinates (null if the view can't see it).
  function unproject(paneIndex, pane, x, y) {
    ndc.set(((x - pane.x) / pane.w) * 2 - 1, -(((y - pane.y) / pane.h) * 2 - 1))
    ray.setFromCamera(ndc, cameras[paneIndex])
    const { origin, direction } = ray.ray
    if (Math.abs(direction.z) < 1e-6) return null
    const t = -origin.z / direction.z
    return { x: origin.x + direction.x * t, y: -(origin.y + direction.y * t) }
  }

  // panes: [{x,y,w,h}] in CSS px; cams: the follow-cameras ({x,y} in tiles)
  function render(game, panes, cams, dt) {
    poseCharacters(game, dt)
    poseEchoes(game, dt)
    poseRopes(game)
    syncLines(game)

    renderer.setScissorTest(true)
    renderer.setScissor(0, 0, width, height)
    renderer.setViewport(0, 0, width, height)
    renderer.clear()
    panes.forEach((pane, i) => {
      if (pane.w < 1 || pane.h < 1) return // (this device is playing the other character)
      const camera = cameras[i]
      camera.aspect = pane.w / pane.h
      camera.updateProjectionMatrix()
      target.set(cams[i].x, -cams[i].y, 0)
      // the pane rolls with its player: upside-down on the ceiling, the ceiling is their floor
      const roll = players[game.players[i].id].roll
      rigOffset.copy(offset).applyAxisAngle(AXIS_Z, roll)
      camera.up.set(-Math.sin(roll), Math.cos(roll), 0)
      camera.position.copy(target).add(rigOffset)
      camera.lookAt(target)
      camera.updateMatrixWorld(true)

      world.apply(game, game.players[i], i, dt)
      poseLines(game.players[i])
      const glY = height - pane.y - pane.h // WebGL's origin is the bottom-left
      renderer.setViewport(pane.x, glY, pane.w, pane.h)
      renderer.setScissor(pane.x, glY, pane.w, pane.h)
      renderer.render(scene, camera)
    })
  }

  const point = new THREE.Vector3()
  // Where a world point (tile x, tile y; z = 0 plane) lands on screen for a pane, in CSS px.
  function project(paneIndex, pane, x, y, z = 0) {
    point.set(x, -y, z).project(cameras[paneIndex])
    return { x: pane.x + (point.x * 0.5 + 0.5) * pane.w, y: pane.y + (1 - (point.y * 0.5 + 0.5)) * pane.h }
  }

  function dispose() {
    for (const { mesh } of lineMeshes.values()) {
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
    world.dispose()
    renderer.dispose()
    canvas.remove()
  }

  return { resize, setLevel, loadModels, render, project, unproject, dispose }
}
