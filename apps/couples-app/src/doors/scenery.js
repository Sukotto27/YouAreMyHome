// Scenery: the dressing of a room, built only from simple shapes and painted textures (no new art files).
//
//   crates       things the players must jump over or onto (steps, low walls, tall walls) are STACKS OF CRATES instead of
//                bare brick: the level JSON lists them in "scenery": { "crates": [{x,y,w,h}], "shelves": [{x,y,w}] }.
//                They are the same solid cells the physics already uses, only drawn differently.
//                A "shelf" is a floating platform: its top row is crates in the playfield, held up by a pile of crates set
//                further back against the wall (the players walk in front of it, so nothing under it blocks them).
//   dressing     purely visual and out of the way, set back against the far wall: crates, barrels, pipes, hanging lamps,
//                cobwebs, shelves of jars, and a few things that suit each room (boilers, furnaces, mirrors, ropes...).
//                Placement is seeded by the room's name so a room always looks the same.
//
// Chapter 1 is the brick basement. Other themes can add their own kit later: `buildScenery` picks one by `level.theme`.
import * as THREE from 'three'
import { VIEW3D } from './config.js'
import { isSolid } from './levels.js'
import { getHaloTexture } from './world3d.js'

const BACK = VIEW3D.TILE_BACK // -1.6: the far face of the tiles
const WALL = VIEW3D.BACK_WALL_Z // -2.0: the brick wall behind everything
const FRONT = VIEW3D.TILE_FRONT

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
function hashString(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function mulberry32(seed) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra })
const canvasTexture = (size, draw) => {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d'), size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// a wooden crate face: boards, a frame and a cross brace
function crateTexture(base, dark) {
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, s, s)
    const boards = 5
    for (let i = 0; i < boards; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)'
      ctx.fillRect(0, (i * s) / boards, s, s / boards)
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillRect(0, (i * s) / boards - 1, s, 2)
    }
    ctx.strokeStyle = dark
    ctx.lineWidth = 12
    ctx.strokeRect(6, 6, s - 12, s - 12) // the frame
    ctx.lineWidth = 9
    ctx.beginPath()
    ctx.moveTo(10, 10)
    ctx.lineTo(s - 10, s - 10)
    ctx.moveTo(s - 10, 10)
    ctx.lineTo(10, s - 10)
    ctx.stroke() // the brace
    ctx.fillStyle = '#26190e'
    for (const [x, y] of [[12, 12], [s - 12, 12], [12, s - 12], [s - 12, s - 12]]) {
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, 7)
      ctx.fill()
    }
  })
}
const CRATE_LOOKS = [
  { base: '#a9773f', dark: '#6b4524' },
  { base: '#94683a', dark: '#583a1e' },
  { base: '#b88b52', dark: '#74502b' },
]

// ---------------------------------------------------------------------------
// crates (the real, solid ones)
// ---------------------------------------------------------------------------
function addCrateCells(group, cells) {
  if (!cells.length) return
  const depth = FRONT - BACK - 0.9 // shallower than the brick, so they read as boxes and not bricks
  const geo = new THREE.BoxGeometry(0.98, 0.98, depth)
  geo.translate(0, 0, FRONT - depth / 2 - 0.02)
  CRATE_LOOKS.forEach((look, k) => {
    const mine = cells.filter((c) => c.look === k)
    if (!mine.length) return
    const mesh = new THREE.InstancedMesh(geo, std('#ffffff', { map: crateTexture(look.base, look.dark), roughness: 0.9 }), mine.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    mine.forEach((c, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), c.tilt)
      m.compose(new THREE.Vector3(c.x + 0.5, -(c.y + 0.5), 0), q, new THREE.Vector3(1, 1, 1))
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  })
}

const crateMeshCache = []
/** One movable crate (crates.js): the same wooden box as the stacks, but a single mesh that world3d moves around. */
export function createCrateMesh(look = 0) {
  const depth = FRONT - BACK - 0.9
  const geo = new THREE.BoxGeometry(0.96, 0.96, depth)
  geo.translate(0, 0, FRONT - depth / 2 - 0.02)
  const k = look % CRATE_LOOKS.length
  crateMeshCache[k] ||= std('#ffffff', { map: crateTexture(CRATE_LOOKS[k].base, CRATE_LOOKS[k].dark), roughness: 0.9 })
  const mesh = new THREE.Mesh(geo, crateMeshCache[k])
  // a rope handle on the front face marks it as the kind you can shove
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.05), std('#2a1b0e'))
  grip.position.set(0, 0.12, FRONT + 0.01)
  mesh.add(grip)
  return mesh
}

/** The solid cells drawn as crates, for buildTiles to leave out of the brick. */
export function crateCellSet(level) {
  const set = new Set()
  const s = level.scenery || {}
  for (const r of s.crates || []) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set.add(`${x},${y}`)
  for (const r of s.shelves || []) for (let x = r.x; x < r.x + r.w; x++) set.add(`${x},${r.y}`)
  return set
}

// ---------------------------------------------------------------------------
// props (visual only)
// ---------------------------------------------------------------------------
const metal = () => std('#5e6672', { metalness: 0.55, roughness: 0.5 })
const rust = () => std('#7a5238', { metalness: 0.4, roughness: 0.7 })

function glowSprite(color, scale, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: getHaloTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity, fog: false }))
  s.scale.set(scale, scale, 1)
  return s
}

function backCrate(size, look = 0) {
  const geo = new THREE.BoxGeometry(size, size, size)
  return new THREE.Mesh(geo, std('#ffffff', { map: crateTexture(CRATE_LOOKS[look].base, CRATE_LOOKS[look].dark), roughness: 0.9 }))
}

// a little pile of loose crates against the wall: 1-3 on the floor and maybe one on top
function cratePile(rng, z) {
  const g = new THREE.Group()
  const n = 1 + Math.floor(rng() * 3)
  const sizes = []
  for (let i = 0; i < n; i++) {
    const s = 0.8 + rng() * 0.55
    const c = backCrate(s, Math.floor(rng() * 3))
    c.position.set(i * 0.95 - (n - 1) * 0.45 + (rng() - 0.5) * 0.15, s / 2, 0)
    c.rotation.y = (rng() - 0.5) * 0.25
    g.add(c)
    sizes.push(s)
  }
  if (n >= 2 && rng() < 0.7) {
    const s = 0.6 + rng() * 0.3
    const c = backCrate(s, Math.floor(rng() * 3))
    c.position.set((rng() - 0.5) * 0.5, Math.min(sizes[0], sizes[1]) + s / 2, 0)
    c.rotation.y = (rng() - 0.5) * 0.4
    g.add(c)
  }
  g.position.z = z
  return g
}

function barrel(rng, z) {
  const g = new THREE.Group()
  const wood = std('#6e4a2a', { roughness: 0.9 })
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 1.0, 14), wood)
  body.scale.set(1, 1, 1)
  body.position.y = 0.5
  g.add(body)
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.4), wood)
  belly.scale.set(1, 1.2, 1)
  belly.position.y = 0.5
  g.add(belly)
  const hoop = std('#2f343c', { metalness: 0.6, roughness: 0.45 })
  for (const y of [0.18, 0.5, 0.82]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.455, 0.028, 6, 18), hoop)
    h.rotation.x = Math.PI / 2
    h.position.y = y
    g.add(h)
  }
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 14), std('#5a3c22'))
  lid.position.y = 1.0
  g.add(lid)
  g.position.z = z
  g.rotation.y = rng() * Math.PI
  return g
}

function sack(rng, z) {
  const g = new THREE.Group()
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), std('#9a8a66'))
  s.scale.set(1, 0.95, 0.8)
  s.position.y = 0.4
  g.add(s)
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 8), std('#8a7a58'))
  top.position.y = 0.88
  g.add(top)
  g.position.z = z
  g.rotation.y = (rng() - 0.5) * 0.8
  return g
}

// wall shelf with boxes and jars
function shelf(rng, w = 2.6) {
  const g = new THREE.Group()
  const wood = std('#6a4a2c')
  const board = (y) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.55), wood)
    b.position.set(0, y, 0)
    g.add(b)
  }
  const shelves = [0.9, 1.7, 2.5]
  shelves.forEach(board)
  for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.5), wood)
    post.position.set(x, 1.3, 0)
    g.add(post)
  }
  shelves.forEach((y, row) => {
    let x = -w / 2 + 0.35
    while (x < w / 2 - 0.3) {
      const kind = rng()
      if (kind < 0.45) {
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3 + rng() * 0.15, 10), std(['#7da4a0', '#a88a5a', '#8f7aa8', '#a86a5a'][Math.floor(rng() * 4)], { transparent: true, opacity: 0.85, roughness: 0.3 }))
        jar.position.set(x, y + 0.05 + 0.18, 0)
        g.add(jar)
        x += 0.38
      } else if (kind < 0.8) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.3 + rng() * 0.2, 0.25 + rng() * 0.2, 0.3), std(['#8a6a40', '#6a5a4a', '#9a8060'][Math.floor(rng() * 3)]))
        box.position.set(x, y + 0.05 + box.geometry.parameters.height / 2, 0)
        g.add(box)
        x += box.geometry.parameters.width + 0.1
      } else x += 0.3
    }
    void row
  })
  return g
}

function hangingLamp(drop, warm = 0xffc27a) {
  const g = new THREE.Group()
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, drop, 5), std('#2b2f36', { metalness: 0.6 }))
  chain.position.y = -drop / 2
  g.add(chain)
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.32, 12, 1, true), std('#3a3f48', { metalness: 0.5, side: THREE.DoubleSide }))
  shade.position.y = -drop - 0.1
  g.add(shade)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: warm }))
  bulb.position.y = -drop - 0.22
  g.add(bulb)
  const halo = glowSprite(warm, 4.2, 0.55)
  halo.position.y = -drop - 0.4
  g.add(halo)
  return g
}

function cobweb(flip) {
  const tex = canvasTexture(128, (ctx, s) => {
    ctx.strokeStyle = 'rgba(230,230,240,0.75)'
    ctx.lineWidth = 1.4
    for (let a = 0; a <= 90; a += 18) {
      const r = (a * Math.PI) / 180
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(r) * s * 1.2, Math.sin(r) * s * 1.2)
      ctx.stroke()
    }
    for (let ring = 1; ring <= 5; ring++) {
      ctx.beginPath()
      for (let a = 0; a <= 90; a += 18) {
        const r = (a * Math.PI) / 180
        const rad = ring * 24 - (a % 36 ? 4 : 0)
        const x = Math.cos(r) * rad
        const y = Math.sin(r) * rad
        if (a === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 }))
  m.scale.x = flip ? -1 : 1
  return m
}

function pipeSegment(length, radius, horizontal = true, rusty = false) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), rusty ? rust() : metal())
  if (horizontal) body.rotation.z = Math.PI / 2
  g.add(body)
  const flangeMat = std('#3d434c', { metalness: 0.6, roughness: 0.5 })
  for (let t = 0.12; t < 1; t += 0.38) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.35, radius * 1.35, 0.1, 12), flangeMat)
    if (horizontal) {
      f.rotation.z = Math.PI / 2
      f.position.x = -length / 2 + t * length
    } else f.position.y = -length / 2 + t * length
    g.add(f)
  }
  return g
}

function valve() {
  const g = new THREE.Group()
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 14), std('#a33a2a', { metalness: 0.3 }))
  wheel.position.y = 0.32
  g.add(wheel)
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 6), metal())
  stem.position.y = 0.16
  g.add(stem)
  return g
}

function puddle(rng) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.5 + rng() * 0.6, 20), new THREE.MeshStandardMaterial({ color: '#1a2230', roughness: 0.05, metalness: 0.7, transparent: true, opacity: 0.8 }))
  m.rotation.x = -Math.PI / 2
  m.scale.z = 0.5
  m.position.y = 0.012
  return m
}

// big horizontal boiler tank with bands, gauge and a hatch
function boiler() {
  const g = new THREE.Group()
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.4, 20), std('#4a5260', { metalness: 0.6, roughness: 0.45 }))
  tank.rotation.z = Math.PI / 2
  tank.position.y = 1.55
  g.add(tank)
  for (const x of [-1.2, 0, 1.2]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.11, 0.06, 6, 24), std('#2a2f38', { metalness: 0.6 }))
    band.rotation.y = Math.PI / 2
    band.position.set(x, 1.55, 0)
    g.add(band)
  }
  for (const x of [-1.2, 1.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 1.1), std('#2a2f38'))
    leg.position.set(x, 0.25, 0)
    g.add(leg)
  }
  const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), new THREE.MeshBasicMaterial({ color: '#e8e2d0' }))
  gauge.position.set(-0.7, 1.9, 1.12)
  g.add(gauge)
  const needle = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.22), new THREE.MeshBasicMaterial({ color: '#b02020' }))
  needle.position.set(-0.7, 1.95, 1.125)
  needle.rotation.z = -0.6
  g.add(needle)
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 14), std('#3a404a', { metalness: 0.6 }))
  hatch.rotation.x = Math.PI / 2
  hatch.position.set(0.6, 1.4, 1.12)
  g.add(hatch)
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.4, 10), metal())
  stack.position.set(1.3, 2.9, 0)
  g.add(stack)
  return g
}

// an iron furnace with a glowing grate and a chimney pipe
function furnace(height) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 1.3), std('#2b2d33', { metalness: 0.5, roughness: 0.6 }))
  body.position.y = 1.2
  g.add(body)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), new THREE.MeshBasicMaterial({ color: 0xff7a1a }))
  glow.position.set(0, 0.95, 0.66)
  g.add(glow)
  for (let i = -2; i <= 2; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), std('#15161a'))
    bar.position.set(i * 0.3, 0.95, 0.68)
    g.add(bar)
  }
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, Math.max(1, height - 2.4), 12), metal())
  chimney.position.set(0.6, 2.4 + Math.max(1, height - 2.4) / 2, -0.1)
  g.add(chimney)
  const halo = glowSprite(0xff7a1a, 5, 0.6)
  halo.position.set(0, 1, 1)
  g.add(halo)
  return g
}

// a leaning mirror in a tarnished frame
function mirror(rng) {
  const g = new THREE.Group()
  const w = 1.2 + rng() * 0.4
  const h = 2.4 + rng() * 0.6
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.1), std('#6a5230', { metalness: 0.4, roughness: 0.5 }))
  frame.position.y = h / 2 + 0.1
  g.add(frame)
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ color: '#b9c9e6', metalness: 0.95, roughness: 0.12, transparent: true, opacity: 0.8, emissive: '#2a3550', emissiveIntensity: 0.4 }),
  )
  glass.position.set(0, h / 2 + 0.1, 0.06)
  g.add(glass)
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.02, h * 0.5), new THREE.MeshBasicMaterial({ color: '#eef3ff', transparent: true, opacity: 0.6 }))
  crack.position.set((rng() - 0.5) * w * 0.4, h * 0.55, 0.065)
  crack.rotation.z = (rng() - 0.5) * 0.8
  g.add(crack)
  g.rotation.x = -0.08
  return g
}

function ladder(height) {
  const g = new THREE.Group()
  const wood = std('#7a5a36')
  for (const x of [-0.3, 0.3]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, height, 0.07), wood)
    rail.position.set(x, height / 2, 0)
    g.add(rail)
  }
  for (let y = 0.4; y < height; y += 0.45) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), wood)
    rung.position.set(0, y, 0)
    g.add(rung)
  }
  g.rotation.x = -0.13
  return g
}

// a roof beam with ropes hanging from it
function beamWithRopes(rng, len) {
  const g = new THREE.Group()
  const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, 0.4), std('#4a3322'))
  g.add(beam)
  const n = 1 + Math.floor(rng() * 2)
  for (let i = 0; i < n; i++) {
    const drop = 1.2 + rng() * 2.2
    const x = (rng() - 0.5) * (len - 1)
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, drop, 6), std('#a89060'))
    rope.position.set(x, -0.2 - drop / 2, 0.05)
    g.add(rope)
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 6, 14), std('#a89060'))
    loop.position.set(x, -0.2 - drop - 0.2, 0.05)
    g.add(loop)
  }
  return g
}

// a high window with a pale shaft of light falling from it
function windowShaft(floorY, x, ceilingY) {
  const g = new THREE.Group()
  const y = ceilingY - 2.2
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.1, 0.12), std('#2f2a30'))
  frame.position.set(x, y, WALL + 0.06)
  g.add(frame)
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.85), new THREE.MeshBasicMaterial({ color: '#dfeeff' }))
  pane.position.set(x, y, WALL + 0.13)
  g.add(pane)
  for (const [dx, dy, w, h] of [[0, 0, 0.06, 1.85], [0, 0, 1.25, 0.06]]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: '#2f2a30' }))
    bar.position.set(x + dx, y + dy, WALL + 0.14)
    g.add(bar)
  }
  // the shaft: a slanted, soft-edged quad from the window to the floor
  const geo = new THREE.BufferGeometry()
  const top = y - 0.9
  const bot = floorY
  const shift = 3.2
  const v = [x - 0.62, top, x + 0.62, top, x - 0.62 + shift, bot, x + 0.62 + shift, bot]
  const pos = []
  const idx = [0, 1, 2, 1, 3, 2]
  for (let i = 0; i < 4; i++) pos.push(v[i * 2], v[i * 2 + 1], WALL + 0.2)
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.5, 0.58, 0.7, 0.5, 0.58, 0.7, 0, 0, 0, 0, 0, 0]), 3))
  geo.setIndex(idx)
  const shaft = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }))
  g.add(shaft)
  return g
}

// ---------------------------------------------------------------------------
// where things go
// ---------------------------------------------------------------------------
// what each room likes, by its number in the chapter: weights for the kinds of floor and ceiling props
const FLAVOR = {
  1: { floor: { cratePile: 3, barrel: 2, sack: 1, shelf: 1, puddle: 1 }, lamps: 0.5, pipes: 0.4, webs: 0.8 },
  2: { floor: { barrel: 2, valve: 3, puddle: 3, cratePile: 1 }, lamps: 0.35, pipes: 1.6, webs: 0.4 },
  3: { floor: { cratePile: 2, sack: 2, barrel: 1, puddle: 1 }, lamps: 0.2, pipes: 0.3, webs: 1.2, windows: 2 },
  4: { floor: { cratePile: 4, barrel: 1, sack: 1 }, lamps: 0.4, pipes: 0.4, webs: 0.8 },
  5: { floor: { cratePile: 2, barrel: 2, valve: 1, puddle: 1 }, lamps: 0.5, pipes: 0.9, webs: 0.6, tint: 0xff5a5a },
  6: { floor: { mirror: 4, shelf: 1, cratePile: 1 }, lamps: 0.3, pipes: 0.2, webs: 1.2 },
  7: { floor: { ladder: 2, cratePile: 2, barrel: 2, sack: 1 }, lamps: 0.4, pipes: 0.7, webs: 0.9 },
  8: { floor: { boiler: 3, valve: 2, barrel: 1, puddle: 1 }, lamps: 0.4, pipes: 1.8, webs: 0.3 },
  9: { floor: { cratePile: 2, barrel: 2, sack: 2, ladder: 1 }, lamps: 0.25, pipes: 0.3, webs: 1.0, beams: 1 },
  10: { floor: { furnace: 3, barrel: 1, valve: 1, cratePile: 1 }, lamps: 0.2, pipes: 1.2, webs: 0.2, tint: 0xff8a3a },
}

function pick(rng, weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (const [k, w] of Object.entries(weights)) {
    r -= w
    if (r <= 0) return k
  }
  return Object.keys(weights)[0]
}

// columns near anything the players use: dressing keeps clear of them
function busyColumns(level) {
  const busy = new Set()
  const o = level.objects
  const mark = (x, w = 1, pad = 1) => {
    for (let c = Math.floor(x) - pad; c <= Math.floor(x + w) + pad; c++) busy.add(c)
  }
  for (const d of o.doors) mark(d.x, 1, 1)
  for (const p of o.plates) mark(p.x, p.w || 1, 1)
  for (const s of o.switches) mark(s.x, 1, 1)
  for (const c of o.crystals) mark(c.x, 1, 1)
  for (const c of o.checkpoints) mark(c.x, 1, 1)
  for (const k of o.keys) mark(k.x, 1, 1)
  if (o.exit) mark(o.exit.x, o.exit.w || 1, 2)
  for (const t of o.traps) {
    if (t.type === 'crusher') mark(t.x, t.w, 1)
    else if (t.type === 'collapse' || t.type === 'trapdoor') mark(t.x, t.w, 0)
    else mark(t.x, 1, 1)
  }
  for (const pr of o.prompts) mark(pr.x, 1, 1)
  return busy
}

export function buildScenery(level, group) {
  const rng = mulberry32(hashString(level.name))
  const flavor = FLAVOR[level.campaign?.index] || FLAVOR[1]
  const s = level.scenery || {}

  // --- the solid crates the players jump over and onto ---
  const cells = []
  const look = () => Math.floor(rng() * CRATE_LOOKS.length)
  const tilt = () => (rng() - 0.5) * 0.02
  for (const r of s.crates || []) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.push({ x, y, look: look(), tilt: tilt() })
  for (const r of s.shelves || []) for (let x = r.x; x < r.x + r.w; x++) cells.push({ x, y: r.y, look: look(), tilt: tilt() })
  addCrateCells(group, cells)
  // a floating platform's support: a pile of crates set back against the wall, under the front row
  for (const r of s.shelves || []) {
    const floorY = (() => {
      let y = r.y + 1
      while (y < level.rows && !isSolid(level, r.x + 1, y)) y++
      return y
    })()
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y + 1; y < floorY; y++) {
        const c = backCrate(0.98, look())
        c.position.set(x + 0.5, -(y + 0.5), -1.35)
        group.add(c)
      }
    }
    // two iron brackets tie the front row to the stack
    for (const x of [r.x + 0.5, r.x + r.w - 0.5]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.6), metal())
      strap.position.set(x, -(r.y + 0.5), -0.8)
      group.add(strap)
    }
  }

  // --- dressing ---
  const busy = busyColumns(level)
  const floors = []
  const ceilings = []
  for (let x = 1; x < level.cols - 1; x++) {
    for (let y = 4; y < level.rows - 1; y++) {
      const solidHere = isSolid(level, x, y)
      if (solidHere && !isSolid(level, x, y - 1) && !isSolid(level, x, y - 2) && !isSolid(level, x, y - 3)) floors.push({ x, y })
      if (!solidHere && isSolid(level, x, y - 1) && !isSolid(level, x, y + 1) && !isSolid(level, x, y + 2) && !isSolid(level, x, y + 3)) ceilings.push({ x, y })
    }
  }
  const crateAt = (x, y) => cells.some((c) => c.x === x && c.y === y)
  const free = (x, w = 1) => {
    for (let c = Math.floor(x - w / 2); c <= Math.floor(x + w / 2); c++) if (busy.has(c)) return false
    return true
  }

  // floor props: walk each floor stretch and set things down with gaps between
  const byRow = new Map()
  for (const f of floors) (byRow.get(f.y) || byRow.set(f.y, []).get(f.y)).push(f.x)
  for (const [y, xs] of byRow) {
    xs.sort((a, b) => a - b)
    let nextAt = xs[0]
    for (const x of xs) {
      if (x < nextAt) continue
      if (rng() > 0.5) continue
      if (crateAt(x, y - 1) || crateAt(x, y)) continue
      const kind = pick(rng, flavor.floor)
      const widths = { cratePile: 2.2, barrel: 1, sack: 1, shelf: 3, puddle: 1.4, valve: 1, mirror: 2, ladder: 1, boiler: 4, furnace: 3 }
      const w = widths[kind] || 1
      if (!free(x + w / 2, w)) continue
      // the stretch of floor must reach that far
      let fits = true
      for (let c = x; c < x + w; c++) if (!xs.includes(Math.floor(c))) fits = false
      if (!fits) continue
      const cx = x + w / 2
      const deep = -1.15 - rng() * 0.45
      let obj
      switch (kind) {
        case 'cratePile': obj = cratePile(rng, deep); break
        case 'barrel': obj = barrel(rng, deep + 0.1); break
        case 'sack': obj = sack(rng, deep + 0.1); break
        case 'shelf': obj = shelf(rng, 2.6); obj.position.z = WALL + 0.3; break
        case 'puddle': obj = puddle(rng); obj.position.z = -0.9; break
        case 'valve': {
          obj = new THREE.Group()
          const pipe = pipeSegment(2.6, 0.13, false)
          pipe.position.y = 1.3
          obj.add(pipe, valve())
          obj.children[1].position.y = 1.2
          obj.position.z = WALL + 0.35
          break
        }
        case 'mirror': obj = mirror(rng); obj.position.z = WALL + 0.25; break
        case 'ladder': obj = ladder(3.6 + rng()); obj.position.z = WALL + 0.2; break
        case 'boiler': obj = boiler(); obj.position.z = -1.1; break
        case 'furnace': obj = furnace(6); obj.position.z = -1.1; break
        default: continue
      }
      obj.position.set(cx, -y + (kind === 'puddle' ? 0.03 : 0), obj.position.z)
      // (everything else is placed exactly as before: a prop in front of the opening scene's door is just left out)
      const doorX = level.intro?.doorX
      const behindDoor = doorX !== undefined && cx + w / 2 > doorX - 1.5 && cx - w / 2 < doorX + 1.5
      if (!behindDoor) group.add(obj)
      nextAt = x + w + 1 + Math.floor(rng() * 3)
    }
  }

  // ceilings: lamps, pipe runs, webs, beams
  const ceilByRow = new Map()
  for (const c of ceilings) (ceilByRow.get(c.y) || ceilByRow.set(c.y, []).get(c.y)).push(c.x)
  let lampCount = 0
  for (const [y, xs] of ceilByRow) {
    xs.sort((a, b) => a - b)
    // pipe runs along the ceiling for stretches of the room
    let x = xs[0]
    while (x < xs[xs.length - 1]) {
      if (xs.includes(x) && rng() < 0.09 * (flavor.pipes || 0.5) * 3) {
        let end = x
        while (xs.includes(end + 1) && end - x < 18) end++
        const len = end - x + 1
        if (len >= 4) {
          const run = pipeSegment(len, 0.17 + rng() * 0.06, true, rng() < 0.4)
          run.position.set(x + len / 2, -y - 0.35 - (rng() < 0.4 ? 0.45 : 0), WALL + 0.35)
          group.add(run)
          if (rng() < 0.6) {
            // a down-pipe that runs off to the floor behind
            const drop = pipeSegment(Math.min(8, 3 + rng() * 5), 0.14, false, rng() < 0.4)
            const dx = x + 1 + Math.floor(rng() * Math.max(1, len - 2))
            drop.position.set(dx + 0.5, -y - 0.35 - drop.children[0].geometry.parameters.height / 2, WALL + 0.35)
            group.add(drop)
          }
          x = end + 2
          continue
        }
      }
      x++
    }
    // hanging lamps
    for (const cx of xs) {
      if (busy.has(cx) && rng() > 0.15) continue
      if (rng() < 0.035 * (flavor.lamps || 0.4) * 3 && lampCount < 14) {
        const lamp = hangingLamp(0.6 + rng() * 1.2, flavor.tint || 0xffc27a)
        lamp.position.set(cx + 0.5, -y, -1.2)
        group.add(lamp)
        lampCount++
      }
    }
    // cobwebs in the corners where a ceiling meets a wall
    for (const cx of xs) {
      const leftWall = isSolid(level, cx - 1, y)
      const rightWall = isSolid(level, cx + 1, y)
      if ((leftWall || rightWall) && rng() < 0.5 * (flavor.webs || 0.5)) {
        const web = cobweb(rightWall)
        web.position.set(cx + (rightWall ? 1 - 0.75 : 0.75), -y - 0.75, -1.5)
        group.add(web)
      }
    }
    if (flavor.beams && xs.length > 8) {
      for (let bx = xs[0] + 6; bx < xs[xs.length - 1] - 4; bx += 14 + Math.floor(rng() * 8)) {
        if (!xs.includes(bx)) continue
        const beam = beamWithRopes(rng, 6)
        beam.position.set(bx, -y - 0.3, -1.1)
        group.add(beam)
      }
    }
  }

  // windows with a shaft of light (room 3)
  if (flavor.windows) {
    const lowFloors = floors.filter((f) => f.y >= level.rows - 8)
    const floorY = lowFloors.length ? -lowFloors[0].y : -18
    for (let i = 0; i < flavor.windows; i++) {
      const x = Math.floor(level.cols * (0.22 + 0.5 * i + rng() * 0.1))
      group.add(windowShaft(floorY, x, -4))
    }
  }
}

export function sceneryTheme(level) {
  return level.theme || 'basement'
}
