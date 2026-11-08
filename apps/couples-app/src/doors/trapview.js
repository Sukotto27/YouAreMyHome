// 3D look of the traps and checkpoints (the rules live in traps.js). Built once
// per room by createTrapView(), then posed each frame from the trap state.
// World coordinates as in world3d.js: x = tile x, y = -tile y, gameplay at z = 0.
import * as THREE from 'three'
import { VIEW3D } from './config.js'
import { crusherBox } from './traps.js'
import { createFlame } from './vfx.js'

const DEPTH = VIEW3D.TILE_FRONT - VIEW3D.TILE_BACK
const MID_Z = (VIEW3D.TILE_FRONT + VIEW3D.TILE_BACK) / 2
const glow = (color, opacity = 0.9) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })
const DIR_VEC = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] } // world y is up
const solid = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.2, ...extra })

export function createTrapView(group, game) {
  const views = []
  const flags = []

  for (const trap of game.traps.traps) {
    const view = { trap }
    switch (trap.type) {
      case 'fire':
      case 'laser': {
        const fire = trap.type === 'fire'
        const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), solid(fire ? '#44403c' : '#1f2937'))
        nozzle.position.set(trap.x, -trap.y, 0.1)
        group.add(nozzle)
        const eye = new THREE.Mesh(new THREE.SphereGeometry(fire ? 0.16 : 0.12, 10, 8), new THREE.MeshBasicMaterial({ color: fire ? 0xf97316 : 0xef4444 }))
        eye.position.set(trap.x, -trap.y, 0.58)
        group.add(eye)
        const beam = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glow(fire ? 0xff7a1a : 0xff2d2d))
        const core = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glow(fire ? 0xfff2a8 : 0xffffff, 0.9))
        beam.visible = false
        core.visible = false
        // a fire jet burns with the game's flame sprite (vfx.js): a row of flames along the jet, each turned the way it points
        const flames = []
        if (fire) {
          const [fx, fy] = DIR_VEC[trap.dir]
          for (let i = 0; i < Math.ceil((trap.length ?? 12) / 0.7) + 1; i++) {
            const f = createFlame({ w: 1.5, h: 1.5, offset: i * 9.7 })
            f.userData.setDirection(fx, fy)
            f.visible = false
            f.position.z = 0.35
            group.add(f)
            flames.push(f)
          }
        } else group.add(beam, core)
        Object.assign(view, { eye, beam, core, fire, flames })
        break
      }
      case 'arrow': {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.9), solid('#111827'))
        slot.position.set(trap.x + (trap.dir === 'left' ? 0.25 : -0.25), -trap.y, 0.1)
        group.add(slot)
        // the home game's arrow: a wooden shaft, a steel head and pale fletching (see render3d/pose.js there)
        const wood = new THREE.MeshStandardMaterial({ color: 0xb58a55, roughness: 0.8 })
        const steel = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.5, metalness: 0.4 })
        const feather = new THREE.MeshStandardMaterial({ color: 0xe8e0d0 })
        const shaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6).rotateZ(Math.PI / 2)
        const tipGeo = new THREE.ConeGeometry(0.07, 0.2, 6).rotateZ(-Math.PI / 2).translate(0.5, 0, 0)
        const fletchGeo = new THREE.BoxGeometry(0.2, 0.2, 0.012).translate(-0.34, 0, 0)
        const pool = []
        for (let i = 0; i < 8; i++) {
          const a = new THREE.Group()
          a.add(new THREE.Mesh(shaftGeo, wood), new THREE.Mesh(tipGeo, steel))
          const f1 = new THREE.Mesh(fletchGeo, feather)
          const f2 = f1.clone()
          f2.rotation.x = Math.PI / 2
          a.add(f1, f2)
          a.visible = false
          group.add(a)
          pool.push(a)
        }
        Object.assign(view, { slot, pool })
        break
      }
      case 'spikes': {
        const g = new THREE.Group()
        const cone = new THREE.ConeGeometry(0.16, 0.7, 8)
        const metal = solid('#cbd5e1', { metalness: 0.7, roughness: 0.35 })
        for (let i = -1; i <= 1; i++) {
          const c = new THREE.Mesh(cone, metal)
          c.rotation.z = Math.PI
          c.position.set(i * 0.26, -0.05, 0)
          g.add(c)
        }
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.5), solid('#475569'))
        bar.position.y = 0.38
        g.add(bar)
        group.add(g)
        Object.assign(view, { g })
        break
      }
      case 'collapse': {
        const tiles = []
        for (let i = 0; i < trap.w; i++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.98, DEPTH), solid('#a8794a', { roughness: 0.95 }))
          m.position.set(trap.x + i + 0.5, -(trap.y + 0.5), MID_Z)
          group.add(m)
          tiles.push(m)
        }
        Object.assign(view, { tiles })
        break
      }
      case 'trapdoor': {
        // one hinged panel the width of the opening; it swings down on its left edge, then is bolted shut
        const pivot = new THREE.Group()
        pivot.position.set(trap.x, -trap.y, 0)
        const panel = new THREE.Mesh(new THREE.BoxGeometry(trap.w, 0.9, DEPTH), solid('#8a5a2b', { roughness: 0.95 }))
        panel.position.set(trap.w / 2, -0.455, MID_Z) // (a hair below the floor's top and the stripe a hair above, so the faces are never at the same height and cannot z-fight)
        pivot.add(panel)
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(trap.w * 0.96, 0.12, DEPTH * 0.9), solid('#f2c14e', { roughness: 0.6 }))
        stripe.position.set(trap.w / 2, -0.045, MID_Z + 0.02)
        pivot.add(stripe)
        group.add(pivot)
        Object.assign(view, { pivot, panel })
        break
      }
      case 'boulder': {
        const g = new THREE.Group()
        g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(trap.radius, 1), solid('#78716c', { flatShading: true, roughness: 1 })))
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(trap.radius * 1.4, 0.12, 0.12), solid('#44403c'))
        stripe.position.z = trap.radius * 0.85
        g.add(stripe)
        g.visible = false
        // the hole in the ceiling the boulders come out of, and the iron lid that seals it while its plate is held
        const ceilingY = trap.y - trap.radius
        const hole = new THREE.Mesh(new THREE.BoxGeometry(trap.radius * 2.1, 0.5, DEPTH * 0.9), solid('#050408'))
        hole.position.set(trap.x, -ceilingY + 0.05, MID_Z)
        const lid = new THREE.Mesh(new THREE.BoxGeometry(trap.radius * 2.3, 0.22, DEPTH * 0.95), solid('#4b5563', { metalness: 0.6, roughness: 0.5 }))
        lid.position.set(trap.x, -ceilingY - 0.12, MID_Z + 0.02)
        lid.visible = false
        group.add(hole, lid)
        Object.assign(view, { g, pool: [], lid })
        break
      }
      case 'crusher': {
        const g = new THREE.Group()
        const body = new THREE.Mesh(new THREE.BoxGeometry(trap.w, trap.h, DEPTH * 0.6), solid('#3f4752', { metalness: 0.5 }))
        g.add(body)
        // hazard-yellow bar on the leading face, and a row of teeth
        const horizontal = trap.dir === 'left' || trap.dir === 'right'
        const [vx, vy] = DIR_VEC[trap.dir]
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(horizontal ? 0.18 : trap.w * 0.96, horizontal ? trap.h * 0.96 : 0.18, DEPTH * 0.62),
          solid('#facc15', { roughness: 0.6 }),
        )
        bar.position.set(vx * (trap.w / 2 - 0.09), vy * (trap.h / 2 - 0.09), 0)
        g.add(bar)
        const teeth = horizontal ? Math.round(trap.h) : Math.round(trap.w)
        const cone = new THREE.ConeGeometry(0.14, 0.4, 6)
        const metal = solid('#cbd5e1', { metalness: 0.7, roughness: 0.35 })
        for (let i = 0; i < teeth; i++) {
          const c = new THREE.Mesh(cone, metal)
          const along = (i + 0.5) / teeth - 0.5
          c.position.set(horizontal ? vx * (trap.w / 2 + 0.2) : along * trap.w, horizontal ? along * trap.h : vy * (trap.h / 2 + 0.2), 0.3)
          c.rotation.z = horizontal ? (vx > 0 ? -Math.PI / 2 : Math.PI / 2) : vy < 0 ? Math.PI : 0
          g.add(c)
        }
        group.add(g)
        // guide rail along the travel path (only as far as it can really go, capped for display)
        const reach = Math.min(trap.travel, 40)
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(horizontal ? reach : 0.1, horizontal ? 0.1 : reach, 0.1),
          solid('#1f2937'),
        )
        rail.position.set(trap.x + trap.w / 2 + (vx * reach) / 2, -(trap.y + trap.h / 2) + (vy * reach) / 2, MID_Z - 0.3)
        group.add(rail)
        Object.assign(view, { g, vx, vy })
        break
      }
      case 'blade': {
        const g = new THREE.Group() // origin at the pivot; rotated about z, hangs along -y
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, trap.length, 0.07), solid('#6b7280', { metalness: 0.6 }))
        arm.position.y = -trap.length / 2
        g.add(arm)
        const blade = new THREE.Group()
        const discGeo = new THREE.CylinderGeometry(trap.radius, trap.radius, 0.1, 20)
        discGeo.rotateX(Math.PI / 2)
        blade.add(new THREE.Mesh(discGeo, solid('#d1d5db', { metalness: 0.8, roughness: 0.3 })))
        const tooth = new THREE.BoxGeometry(0.16, 0.16, 0.12)
        const toothMat = solid('#9ca3af', { metalness: 0.8 })
        for (let i = 0; i < 8; i++) {
          const t = new THREE.Mesh(tooth, toothMat)
          const a = (i / 8) * Math.PI * 2
          t.position.set(Math.cos(a) * trap.radius, Math.sin(a) * trap.radius, 0)
          t.rotation.z = a + Math.PI / 4
          blade.add(t)
        }
        blade.position.y = -trap.length
        g.add(blade)
        const hub = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), solid('#374151'))
        g.add(hub)
        g.position.set(trap.x, -trap.y, 0.05)
        group.add(g)
        Object.assign(view, { g, blade })
        break
      }
      case 'wind': {
        const [vx, vy] = DIR_VEC[trap.dir]
        const g = new THREE.Group()
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), solid('#475569'))
        g.add(housing)
        const rotor = new THREE.Group()
        const bladeGeo = new THREE.BoxGeometry(0.08, 0.7, 0.08)
        for (let i = 0; i < 4; i++) {
          const b = new THREE.Mesh(bladeGeo, solid('#e2e8f0'))
          b.rotation.z = (i * Math.PI) / 4
          rotor.add(b)
        }
        rotor.position.set(vx * 0.3, vy * 0.3, 0.5)
        g.add(rotor)
        g.position.set(trap.x - vx * 0.0, -trap.y, 0.1)
        group.add(g)
        const streakMat = new THREE.MeshBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.5, depthWrite: false })
        const streaks = []
        for (let i = 0; i < 16; i++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), streakMat)
          m.visible = false
          group.add(m)
          streaks.push(m)
        }
        Object.assign(view, { g, rotor, streaks, vx, vy })
        break
      }
      default:
    }
    views.push(view)
  }

  for (const cp of game.traps.checkpoints) {
    const g = new THREE.Group()
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), solid('#d1d5db'))
    pole.position.y = 0.8
    g.add(pole)
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshBasicMaterial({ color: 0x9ca3af, side: THREE.DoubleSide }))
    cloth.position.set(0.32, 1.38, 0)
    g.add(cloth)
    g.position.set(cp.x + 0.5, -(cp.ceiling ? cp.y : cp.y + 1), 0)
    if (cp.ceiling) g.scale.y = -1 // hangs from the ceiling
    group.add(g)
    flags.push({ cp, cloth })
  }

  // Poses everything for the pane that belongs to `focus` ('blue' | 'pink').
  function apply(focus) {
    const time = game.traps.time
    for (const v of views) {
      const t = v.trap
      switch (t.type) {
        case 'fire':
        case 'laser': {
          const warn = t.phase === 'warn'
          v.eye.material.color.setHex(t.phase === 'on' ? 0xffffff : warn ? (Math.floor(time * 20) % 2 ? 0xffffff : 0xf97316) : v.fire ? 0x7c2d12 : 0x7f1d1d)
          const b = t.beam
          v.beam.visible = v.core.visible = !!b && !v.fire
          if (v.fire) {
            // the jet: flames along its length while it is on, a small pilot flame while it warns
            const [fx, fy] = DIR_VEC[t.dir]
            const len = b ? Math.hypot(b.x1 - b.x0, b.y1 - b.y0) : 0
            v.flames.forEach((f, i) => {
              const along = i * 0.7
              const live = !!b && along <= len + 0.35
              const pilot = !b && t.phase === 'warn' && i === 0
              f.visible = live || pilot
              if (!f.visible) return
              f.position.set(t.x + fx * along, -t.y + fy * along, 0.35)
              f.userData.tick(time)
              const k = pilot ? 0.4 : 1 + 0.08 * Math.sin(time * 25 + i)
              f.userData.setSize(t.thickness * 2.1 * k, 1.5 * k)
            })
          }
          if (b && !v.fire) {
            const horizontal = t.dir === 'left' || t.dir === 'right'
            const len = Math.max(0.01, Math.hypot(b.x1 - b.x0, b.y1 - b.y0))
            const cx = (b.x0 + b.x1) / 2
            const cy = -(b.y0 + b.y1) / 2
            const flicker = v.fire ? 0.85 + 0.15 * Math.sin(time * 40) : 1
            const w = t.thickness * (v.fire ? 1 : 1.6) * flicker
            v.beam.position.set(cx, cy, 0)
            v.core.position.set(cx, cy, 0)
            v.beam.scale.set(horizontal ? len : w, horizontal ? w : len, v.fire ? 0.7 : 0.2)
            v.core.scale.set(horizontal ? len : w * 0.4, horizontal ? w * 0.4 : len, v.fire ? 0.3 : 0.1)
          }
          break
        }
        case 'arrow': {
          v.slot.material.emissive.setHex(t.phase === 'warn' ? 0x7f1d1d : 0x000000)
          v.pool.forEach((m, i) => {
            const a = t.arrows[i]
            m.visible = !!a
            if (a) {
              m.position.set(a.x, -a.y, 0)
              m.scale.x = t.dir === 'left' ? -1 : 1 // (the head points along +x)
            }
          })
          break
        }
        case 'spikes': {
          v.g.position.set(t.x + (t.mode === 'warn' ? Math.sin(time * 70) * 0.05 : 0), -t.cy, 0.05)
          break
        }
        case 'collapse': {
          v.tiles.forEach((m, i) => {
            m.visible = t.mode !== 'gone'
            const shake = t.mode === 'shaking' ? 0.04 : 0
            m.position.set(t.x + i + 0.5 + Math.sin(time * 90 + i) * shake, -(t.y + 0.5) + Math.cos(time * 80 + i) * shake, MID_Z)
            m.material.color.setHex(t.mode === 'shaking' ? 0xc2410c : 0xa8794a)
          })
          break
        }
        case 'trapdoor': {
          const target = t.mode === 'open' ? -1.45 : 0 // radians: swings down about the left edge
          v.angle = (v.angle ?? 0) + (target - (v.angle ?? 0)) * 0.35
          v.pivot.rotation.z = v.angle
          const shake = t.mode === 'warn' ? 0.04 : 0
          v.pivot.position.set(t.x + Math.sin(time * 90) * shake, -t.y, 0)
          v.panel.material.color.setHex(t.mode === 'sealed' ? 0x4b5563 : t.mode === 'warn' ? 0xc2410c : 0x8a5a2b)
          break
        }
        case 'boulder': {
          while (v.pool.length < t.boulders.length) {
            const clone = v.g.clone()
            group.add(clone)
            v.pool.push(clone)
          }
          v.lid.visible = !!t.off
          v.pool.forEach((m, i) => {
            const b = t.boulders[i]
            m.visible = !!b
            if (b) {
              m.position.set(b.x, -b.y, 0)
              m.rotation.z = -b.ang
              m.scale.setScalar(b.dying ? Math.max(0.05, 1 - b.dying / 0.4) : 1) // a sealed hole: the ones still rolling crumble away
            }
          })
          break
        }
        case 'crusher': {
          const [x0, y0, x1, y1] = crusherBox(t)
          const shake = t.mode === 'warn' ? 0.05 : 0
          v.g.position.set((x0 + x1) / 2 + Math.sin(time * 80) * shake, -((y0 + y1) / 2) + Math.cos(time * 70) * shake, MID_Z)
          break
        }
        case 'blade': {
          v.g.rotation.z = t.ang
          v.blade.rotation.z = -t.ang + time * 6
          break
        }
        case 'wind': {
          const b = t.beam
          const spin = b ? 22 : t.phase === 'warn' ? 6 : 1.5
          v.rotor.rotation.z += spin * 0.016
          v.streaks.forEach((m, i) => {
            m.visible = !!b
            if (!b) return
            const len = Math.hypot(b.x1 - b.x0, b.y1 - b.y0)
            if (len < 0.5) {
              m.visible = false
              return
            }
            const speed = 9
            const along = (((time * speed + (i * len) / v.streaks.length) % len) + len) % len
            const lateral = (((i * 0.618) % 1) - 0.5) * (t.thickness * 0.85)
            const horizontal = t.dir === 'left' || t.dir === 'right'
            const px = horizontal ? b.x0 + v.vx * along : t.x + lateral
            const py = horizontal ? -t.y + lateral : -t.y + v.vy * along
            m.position.set(px, py, 0.15)
            m.scale.set(horizontal ? 0.9 : 0.04, horizontal ? 0.04 : 0.9, 0.04)
          })
          break
        }
        default:
      }
    }
    for (const f of flags) f.cloth.material.color.setHex(f.cp.reached[focus] ? 0x4ade80 : 0x9ca3af)
  }

  return { apply }
}
