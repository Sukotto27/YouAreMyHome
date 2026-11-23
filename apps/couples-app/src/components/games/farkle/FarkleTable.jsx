import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import diceObj from '../../../assets/farkle/dice-pack/dice_white.obj?raw'
import { diceColorUrl } from './diceColors'
import woodUrl from '../../../assets/farkle/wood.png'

// The dice tray: a small wooden board with six real 3D dice. Nothing here
// decides a result — the roll values come from the match doc and each die is
// *oriented so that value faces up*, so what you see is exactly what scores.
//
// One board, two zones (world units, +x right, +z toward the player):
//   upper area: where the dice are tossed
//   bottom strip, under a separator line: dice you've pulled aside to keep
// Pressing Roll confirms the strip and rolls the rest.
//
// Both players run this same component. The player whose roll it is can tap
// or drag dice (state flows out through `mutate`); the other player just
// renders whatever arrives in `liveRef`, so every move shows on both screens.

const DIE = 0.6 // edge length in world units
const REST_Y = DIE / 2
const TABLE_HALF_W = 5.5
const TABLE_HALF_D = 2.0
const SPLIT_Z = 0.85 // the separator line; below it is the keep area
const STRIP_Z = 1.42
const SLOT_DX = 0.86
const SELECT_X0 = -2.7 // kept dice line up from the left of the strip
const PICK_RADIUS = 0.55
const DRAG_PX = 7
const TOSS_MS = 1000

// Which way each value's face points in the model's own coordinates. Worked
// out from the mesh itself (pip dimples per side of dice_white.obj): opposite
// faces add to seven, so these six directions are the whole mapping.
const FACE_NORMAL = {
  1: new THREE.Vector3(-1, 0, 0),
  2: new THREE.Vector3(0, 0, 1),
  3: new THREE.Vector3(0, -1, 0),
  4: new THREE.Vector3(0, 1, 0),
  5: new THREE.Vector3(0, 0, -1),
  6: new THREE.Vector3(1, 0, 0),
}
const UP = new THREE.Vector3(0, 1, 0)

// Orientation that leaves `value` on top, then turned `yaw` about the vertical.
function upQuaternion(value, yaw = 0) {
  const face = new THREE.Quaternion().setFromUnitVectors(FACE_NORMAL[value] || FACE_NORMAL[1], UP)
  return new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(face)
}

const selectX = (k) => SELECT_X0 + k * SLOT_DX
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const easeOut = (t) => 1 - (1 - t) * (1 - t)

export default function FarkleTable({ game, canInteract, liveRef, mutate, onToss, diceColor, children }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const [labels, setLabels] = useState(null)
  const propsRef = useRef({})
  const applyColorRef = useRef(null)
  propsRef.current = { game, canInteract, mutate, onToss, diceColor }

  useEffect(() => {
    applyColorRef.current?.(diceColor)
  }, [diceColor])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)

    scene.add(new THREE.HemisphereLight(0xfff1dc, 0x4a2f1c, 1.05))
    const sun = new THREE.DirectionalLight(0xffffff, 2.1)
    sun.position.set(-3, 10, -2)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 5, bottom: -5, near: 1, far: 26 })
    sun.shadow.bias = -0.0004
    scene.add(sun)

    // ---- board ------------------------------------------------------------
    // The wood itself is the container's CSS background; this invisible plane
    // only catches the dice's shadows, and the thin bar marks the keep area.
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.32 })
    const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_HALF_W * 2 + 4, TABLE_HALF_D * 2 + 4), shadowMat)
    shadowCatcher.rotation.x = -Math.PI / 2
    shadowCatcher.receiveShadow = true
    scene.add(shadowCatcher)

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf3e3c8, transparent: true, opacity: 0.7 })
    const line = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_HALF_W * 2 - 0.5, 0.06), lineMat)
    line.rotation.x = -Math.PI / 2
    line.position.set(0, 0.01, SPLIT_Z)
    scene.add(line)

    // ---- dice ------------------------------------------------------------
    // One texture per colour on the same model; swapping colour swaps the map.
    const loader = new THREE.TextureLoader()
    const texCache = {}
    const textureFor = (key) => {
      if (!texCache[key]) {
        const tex = loader.load(diceColorUrl(key))
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 4
        texCache[key] = tex
      }
      return texCache[key]
    }
    const startTex = textureFor(propsRef.current.diceColor)
    const rollMat = new THREE.MeshStandardMaterial({ map: startTex, roughness: 0.32, metalness: 0.05 })
    const grabMat = new THREE.MeshStandardMaterial({
      map: startTex,
      roughness: 0.32,
      metalness: 0.05,
      emissive: new THREE.Color(0xe27d7a),
      emissiveIntensity: 0.35,
    })

    applyColorRef.current = (key) => {
      const tex = textureFor(key)
      rollMat.map = tex
      grabMat.map = tex
      rollMat.needsUpdate = true
      grabMat.needsUpdate = true
    }

    const template = new OBJLoader().parse(diceObj)
    let baseGeometry = null
    template.traverse((node) => {
      if (node.isMesh && !baseGeometry) baseGeometry = node.geometry
    })
    if (!baseGeometry.attributes.normal) baseGeometry.computeVertexNormals()

    const dice = Array.from({ length: 6 }, (_, id) => {
      const mesh = new THREE.Mesh(baseGeometry, rollMat)
      mesh.scale.setScalar(0)
      mesh.castShadow = true
      mesh.visible = false
      mesh.position.set(0, REST_Y, 0)
      scene.add(mesh)
      return { id, mesh, mode: 'hidden', value: 1, index: -1, scale: 0, quat: new THREE.Quaternion(), toss: null }
    })

    // The dice currently on the board (kept in sync with the match doc).
    const S = { rollId: undefined, rollDice: [] }

    function startToss(die, index, layout, now) {
      const to = new THREE.Vector3(layout.x, REST_Y, layout.z)
      const from = new THREE.Vector3(-3.5 + index * 1.4 + Math.random() * 0.8, REST_Y + 1.6, -(TABLE_HALF_D + 1.6 + Math.random() * 0.8))
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      die.toss = {
        t0: now + index * 55,
        dur: TOSS_MS + index * 30,
        from,
        to,
        axis,
        spin: (3 + Math.random() * 2.5) * Math.PI,
        end: upQuaternion(die.value, layout.yaw),
      }
      die.mesh.visible = false
    }

    // Brings the dice in line with the match doc: a new rollId throws the
    // dice; no roll on the doc (turn over, or after a bank) clears the board.
    function reconcile(g, now) {
      const first = S.rollId === undefined

      if (g.rollId !== S.rollId) {
        for (const d of S.rollDice) d.mode = 'hidden'
        S.rollDice = []
        if (g.lastRoll) {
          g.lastRoll.forEach((value, i) => {
            const die = dice[i]
            if (!die) return
            die.mode = 'roll'
            die.value = value
            die.index = i
            die.mesh.visible = true
            const layout = g.layout?.[i] || { x: 0, z: 0, yaw: 0 }
            if (first) {
              die.toss = null
              die.pos = new THREE.Vector3(layout.x, REST_Y, layout.z)
              die.mesh.position.copy(die.pos)
              die.quat.copy(upQuaternion(value, layout.yaw))
              die.scale = 1
            } else {
              startToss(die, i, layout, now)
              die.scale = 1
            }
            S.rollDice.push(die)
          })
          if (!first) propsRef.current.onToss?.()
        }
        S.rollId = g.rollId
        return
      }

      if (!g.lastRoll && S.rollDice.length) {
        for (const d of S.rollDice) d.mode = 'hidden'
        S.rollDice = []
      }
    }

    function targetFor(die, live) {
      const layout = propsRef.current.game.layout?.[die.index] || { x: 0, z: 0, yaw: 0 }
      const selectedAt = live.sel.indexOf(die.index)
      if (selectedAt >= 0 && !(live.drag && live.drag.i === die.index)) {
        return { pos: new THREE.Vector3(selectX(selectedAt), REST_Y, STRIP_Z), quat: upQuaternion(die.value, 0), lift: 0 }
      }
      if (live.drag && live.drag.i === die.index) {
        return { pos: new THREE.Vector3(live.drag.x, REST_Y + 0.3, live.drag.z), quat: upQuaternion(die.value, layout.yaw), lift: 1 }
      }
      const moved = live.pos[die.index]
      const x = moved ? moved.x : layout.x
      const z = moved ? moved.z : layout.z
      return { pos: new THREE.Vector3(x, REST_Y, z), quat: upQuaternion(die.value, layout.yaw), lift: 0 }
    }

    // ---- frame loop ------------------------------------------------------
    let signature = ''
    let last = performance.now()
    let rafId
    const tmpQ = new THREE.Quaternion()

    function frame(time) {
      const dt = Math.min(0.05, (time - last) / 1000)
      last = time
      const g = propsRef.current.game
      const sig = `${g.rollId}|${g.lastRoll ? g.lastRoll.join('') : '-'}`
      if (sig !== signature) {
        signature = sig
        reconcile(g, time)
      }

      const live = liveRef.current
      const follow = 1 - Math.exp(-dt * 13)
      for (const die of dice) {
        const { mesh } = die
        if (die.mode === 'hidden') {
          die.scale += (0 - die.scale) * (1 - Math.exp(-dt * 16))
          if (die.scale < 0.02) mesh.visible = false
          mesh.scale.setScalar((DIE / 500) * die.scale)
          continue
        }
        mesh.material = live.drag && live.drag.i === die.index ? grabMat : rollMat

        if (die.toss) {
          const t = die.toss
          const u = (time - t.t0) / t.dur
          if (u < 0) continue
          mesh.visible = true
          if (u >= 1) {
            die.toss = null
            die.pos = t.to.clone()
            die.quat.copy(t.end)
            mesh.position.copy(die.pos)
            mesh.quaternion.copy(die.quat)
            mesh.scale.setScalar(DIE / 500)
            continue
          }
          const slide = easeOut(u)
          mesh.position.set(
            t.from.x + (t.to.x - t.from.x) * slide,
            REST_Y + 1.0 * (1 - u) * (1 - u) * Math.abs(Math.cos(u * Math.PI * 2.5)),
            t.from.z + (t.to.z - t.from.z) * slide,
          )
          tmpQ.setFromAxisAngle(t.axis, t.spin * (1 - u) * (1 - u))
          mesh.quaternion.copy(t.end).multiply(tmpQ)
          mesh.scale.setScalar(DIE / 500)
          die.pos = mesh.position.clone()
          continue
        }

        const target = targetFor(die, live)
        if (!die.pos) die.pos = target.pos.clone()
        die.pos.lerp(target.pos, follow)
        die.quat.slerp(target.quat, follow)
        die.scale += (1 + target.lift * 0.1 - die.scale) * follow
        mesh.visible = true
        mesh.position.copy(die.pos)
        mesh.quaternion.copy(die.quat)
        mesh.scale.setScalar((DIE / 500) * die.scale)
      }

      renderer.render(scene, camera)
      rafId = requestAnimationFrame(frame)
    }

    // ---- sizing: fit the whole board in view --------------------------------
    const tilt = (72 * Math.PI) / 180
    function fit() {
      const rect = container.getBoundingClientRect()
      const w = Math.max(1, rect.width)
      const h = Math.max(1, rect.height)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      const lookAt = new THREE.Vector3(0, 0, 0)
      const corners = [
        [-TABLE_HALF_W, 0, -TABLE_HALF_D],
        [TABLE_HALF_W, 0, -TABLE_HALF_D],
        [-TABLE_HALF_W, 0, TABLE_HALF_D],
        [TABLE_HALF_W, 0, TABLE_HALF_D],
      ].map((c) => new THREE.Vector3(...c))
      for (let d = 8; d < 60; d += 0.2) {
        camera.position.set(lookAt.x, Math.sin(tilt) * d, lookAt.z + Math.cos(tilt) * d)
        camera.lookAt(lookAt)
        camera.updateProjectionMatrix()
        camera.updateMatrixWorld()
        const inside = corners.every((c) => {
          const p = c.clone().project(camera)
          return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1
        })
        if (inside) break
      }
      const p = new THREE.Vector3(-TABLE_HALF_W + 0.35, 0, SPLIT_Z + 0.12).project(camera)
      setLabels({ keep: { left: ((p.x + 1) / 2) * w, top: ((1 - p.y) / 2) * h } })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(container)

    // ---- pointer: tap a die to set it aside, or drag it ---------------------
    const raycaster = new THREE.Raycaster()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -REST_Y)
    const hit = new THREE.Vector3()
    let drag = null

    function worldPoint(event) {
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null
    }

    function onDown(event) {
      const { canInteract: allowed } = propsRef.current
      if (!allowed || S.rollDice.some((d) => d.toss)) return
      const point = worldPoint(event)
      if (!point) return
      let best = null
      let bestDist = PICK_RADIUS
      for (const die of S.rollDice) {
        if (!die.pos) continue
        const dist = Math.hypot(die.pos.x - point.x, die.pos.z - point.z)
        if (dist < bestDist) {
          best = die
          bestDist = dist
        }
      }
      if (!best) return
      event.preventDefault()
      canvas.setPointerCapture(event.pointerId)
      drag = {
        die: best,
        startX: event.clientX,
        startY: event.clientY,
        offX: best.pos.x - point.x,
        offZ: best.pos.z - point.z,
        moved: false,
      }
    }

    function onMove(event) {
      if (!drag) return
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_PX) return
      drag.moved = true
      const point = worldPoint(event)
      if (!point) return
      const x = clamp(point.x + drag.offX, -TABLE_HALF_W + 0.5, TABLE_HALF_W - 0.5)
      const z = clamp(point.z + drag.offZ, -TABLE_HALF_D + 0.45, TABLE_HALF_D - 0.4)
      drag.x = x
      drag.z = z
      propsRef.current.mutate((live) => {
        live.drag = { i: drag.die.index, x, z }
      })
    }

    function onUp(event) {
      if (!drag) return
      const { die, moved, x, z } = drag
      drag = null
      try {
        canvas.releasePointerCapture(event.pointerId)
      } catch {
        // capture already gone
      }
      const index = die.index
      propsRef.current.mutate(
        (live) => {
          live.drag = null
          const picked = live.sel.includes(index)
          if (!moved) {
            // a tap: pull it into the keep area, or put it back where it was thrown
            live.sel = picked ? live.sel.filter((i) => i !== index) : [...live.sel, index]
            return
          }
          if (z > SPLIT_Z) {
            if (!picked) live.sel = [...live.sel, index]
          } else {
            live.sel = live.sel.filter((i) => i !== index)
            live.pos = { ...live.pos, [index]: { x: +x.toFixed(2), z: +z.toFixed(2) } }
          }
        },
        { immediate: true },
      )
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      applyColorRef.current = null
      Object.values(texCache).forEach((tex) => tex.dispose())
      shadowMat.dispose()
      lineMat.dispose()
      rollMat.dispose()
      grabMat.dispose()
      shadowCatcher.geometry.dispose()
      line.geometry.dispose()
      baseGeometry.dispose()
      renderer.dispose()
    }
    // liveRef is a stable ref; everything else is read through propsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden rounded-2xl border border-ink/25 shadow-inner"
      style={{
        aspectRatio: '11 / 4',
        backgroundColor: '#7a4a2c',
        backgroundImage: `radial-gradient(ellipse at center, transparent 55%, rgba(40,20,5,0.35) 100%), url(${woodUrl})`,
        backgroundSize: '100% 100%, 256px 256px',
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      {labels && (
        <span
          className="pointer-events-none absolute rounded-full bg-black/35 px-2 py-0.5 font-body text-[10px] uppercase tracking-wide text-white/80"
          style={{ left: labels.keep.left, top: labels.keep.top }}
        >
          Keep
        </span>
      )}
      {children}
    </div>
  )
}
