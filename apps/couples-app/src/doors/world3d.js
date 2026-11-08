// The 3D world: the room's tiles as solid blocks with real depth, a back wall,
// and the dynamic objects — doors (the household door model, tinted), pressure
// plates, switches and the exit. Characters are handled in view3d.js.
//
// Coordinates: world x = tile x, world y = -tile y (three.js is y-up), and
// players walk in the z = 0 plane. The tiles extend from z = TILE_BACK up to
// z = TILE_FRONT, so floors and walls have visible tops and sides.
import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { ABILITY, COLORS, VIEW3D } from './config.js'
import { doorClosedTo } from './doors.js'
import { isSolid } from './levels.js'
import { createTrapView } from './trapview.js'
import { buildScenery, crateCellSet, createCrateMesh } from './scenery.js'

const DOOR_URL = `${import.meta.env.BASE_URL}doors/models/door.fbx`
const OPEN_TIME = 0.4 // seconds for a door to swing fully open or shut
const OPEN_ANGLE = Math.PI / 2 // the leaf swings 90 degrees to lie flat against the back wall
const LEAF_THICKNESS = 0.16 // tiles
const LEAF_BRASS = new THREE.Color('#d6a84a')
const FRAME_COLOR = '#3b2412'
const EXIT_PAINT = '#7a4421'
const DOOR_PAINT = { gray: '#a1a7b0', blue: '#3b82f6', pink: '#ec4899' }
const GREEN = 0x4ade80
const RED = 0xf87171
const PURPLE = 0xa855f7
const LAMP_TYPES = new Set(['key', 'flip', 'linked', 'random'])
const PORTAL_COLORS = [0x38bdf8, 0xfb923c, 0xa3e635, 0xe879f9]
const BADGE_SIZE = 0.8 // tiles
// one colour per ability (config.js): the crystal, the HUD and the effects all use it
const ABILITY_TINT = Object.fromEntries(Object.entries(ABILITY.COLORS).map(([id, css]) => [id, new THREE.Color(css).getHex()]))

let haloTexture = null
export function getHaloTexture() {
  if (haloTexture) return haloTexture
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.3, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  haloTexture = new THREE.CanvasTexture(c)
  return haloTexture
}

// An ability crystal: a faceted shiny shard that spins in place and bobs, with two small shards orbiting
// it, a soft halo, and a ring on the ground in the colour of the player it is for.
function makeCrystal(c) {
  const tint = ABILITY_TINT[c.ability]
  const g = new THREE.Group()
  const spin = new THREE.Group()
  const glass = (scale = 1) =>
    new THREE.MeshPhysicalMaterial({ color: tint, emissive: tint, emissiveIntensity: 1.0 * scale, roughness: 0.05, metalness: 0.15, clearcoat: 1, flatShading: true, transparent: true, opacity: 0.95 })
  const main = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), glass())
  main.scale.set(0.72, 1.75, 0.72)
  spin.add(main)
  // the bright heart is the ability's own colour lightened, so each kind of crystal reads as its colour
  const bright = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).lerp(new THREE.Color(0xffffff), 0.4), transparent: true, opacity: 0.9 }))
  bright.scale.set(0.6, 1.5, 0.6)
  spin.add(bright)
  const orbit = []
  for (let i = 0; i < 2; i++) {
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), glass(1.2))
    shard.scale.set(0.7, 1.5, 0.7)
    orbit.push(shard)
    spin.add(shard)
  }
  g.add(spin)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: getHaloTexture(), color: tint, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }))
  halo.scale.set(1.9, 1.9, 1)
  g.add(halo)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.03, 8, 28), new THREE.MeshBasicMaterial({ color: COLORS[c.for] }))
  ring.rotation.x = Math.PI / 2
  ring.position.y = -0.5
  g.add(ring)
  g.position.set(c.x + 0.5, -(c.y + 0.5), 0.1)
  return { g, spin, orbit, halo }
}

// The spot a player has marked with Teleport 3: a ring on the ground and a faint beam of light.
function makeMarker(color) {
  const g = new THREE.Group()
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 28), new THREE.MeshBasicMaterial({ color }))
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.06
  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 3),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  )
  beam.position.y = 1.5
  g.add(ring, beam)
  g.visible = false
  return g
}

const FX_COLORS = { fail: 0xf87171, ...ABILITY_TINT }
function fxColor(c) {
  return new THREE.Color(FX_COLORS[c] ?? COLORS[c] ?? '#ffffff')
}
const GRAVITY_COLORS = { up: '#fb923c', down: '#38bdf8' }

// The shimmering field of a gravity door: edge lines and a column of chevrons that stream the way
// gravity will pull you (up / down).
function gravityFieldTexture(set) {
  const W = 64
  const H = 128
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const color = GRAVITY_COLORS[set]
  const grad = ctx.createLinearGradient(0, 0, W, 0)
  grad.addColorStop(0, color)
  grad.addColorStop(0.18, 'rgba(255,255,255,0.0)')
  grad.addColorStop(0.82, 'rgba(255,255,255,0.0)')
  grad.addColorStop(1, color)
  ctx.globalAlpha = 0.5
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)
  ctx.globalAlpha = 1
  ctx.strokeStyle = color
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const chevron = (cx, cy, up) => {
    ctx.beginPath()
    ctx.moveTo(cx - 14, cy + (up ? 8 : -8))
    ctx.lineTo(cx, cy + (up ? -8 : 8))
    ctx.lineTo(cx + 14, cy + (up ? 8 : -8))
    ctx.stroke()
  }
  for (const cy of [32, 96]) {
    chevron(32, cy, set === 'up')
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// ---------------------------------------------------------------------------
// Door symbols: one icon per door type, drawn as vector shapes on a canvas.
//   gray ring (anyone) · blue / pink person (that player only) · plate: arrow onto a pad ·
//   switch: lever · key: key · flip: opposing arrows · linked: two chain links ·
//   one-way: a single arrow · swap: two circling arrows, blue and pink · random: a die
// ---------------------------------------------------------------------------
const symbolCache = new Map()

function arrowHead(ctx, x, y, angle, size = 16) {
  ctx.beginPath()
  ctx.moveTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size)
  ctx.lineTo(x + Math.cos(angle + 2.5) * size, y + Math.sin(angle + 2.5) * size)
  ctx.lineTo(x + Math.cos(angle - 2.5) * size, y + Math.sin(angle - 2.5) * size)
  ctx.closePath()
  ctx.fill()
}

function drawDoorSymbol(type, dir) {
  const S = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = type === 'blue' ? '#2563eb' : type === 'pink' ? '#db2777' : '#1f2937'
  ctx.beginPath()
  ctx.arc(64, 64, 60, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.stroke()
  ctx.strokeStyle = '#ffffff'
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const line = (x0, y0, x1, y1) => {
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
  switch (type) {
    case 'gray': // a plain ring: anyone may pass
      ctx.beginPath()
      ctx.arc(64, 64, 24, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'blue':
    case 'pink': // a person: only this player
      ctx.beginPath()
      ctx.arc(64, 46, 15, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(34, 98)
      ctx.quadraticCurveTo(64, 48, 94, 98)
      ctx.closePath()
      ctx.fill()
      break
    case 'plate': // an arrow pressing down on a pad
      line(64, 28, 64, 62)
      arrowHead(ctx, 64, 78, Math.PI / 2, 20)
      ctx.beginPath()
      ctx.roundRect(32, 92, 64, 14, 5)
      ctx.fill()
      break
    case 'switch': // a lever
      ctx.beginPath()
      ctx.roundRect(38, 92, 52, 14, 5)
      ctx.fill()
      line(64, 92, 88, 44)
      ctx.beginPath()
      ctx.arc(90, 40, 11, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'key':
      ctx.beginPath()
      ctx.arc(44, 64, 17, 0, Math.PI * 2)
      ctx.stroke()
      line(61, 64, 104, 64)
      line(88, 64, 88, 82)
      line(102, 64, 102, 78)
      break
    case 'flip': // opposing arrows
      line(26, 46, 86, 46)
      arrowHead(ctx, 104, 46, 0, 20)
      line(102, 82, 42, 82)
      arrowHead(ctx, 24, 82, Math.PI, 20)
      break
    case 'linked': // two interlocked chain links
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.roundRect(22, 46, 52, 36, 18)
      ctx.stroke()
      ctx.beginPath()
      ctx.roundRect(54, 46, 52, 36, 18)
      ctx.stroke()
      break
    case 'oneway': // a single arrow, pointing the way you may go
      if (dir < 0) {
        ctx.translate(S, 0)
        ctx.scale(-1, 1)
      }
      ctx.lineWidth = 12
      line(24, 64, 84, 64)
      arrowHead(ctx, 108, 64, 0, 26)
      break
    case 'swap': {
      // two arrows chasing each other round a circle: one blue, one pink
      const tones = ['#93c5fd', '#f9a8d4']
      for (let i = 0; i < 2; i++) {
        const a0 = Math.PI * i + 0.35
        const a1 = Math.PI * i + Math.PI - 0.55
        ctx.strokeStyle = ctx.fillStyle = tones[i]
        ctx.beginPath()
        ctx.arc(64, 64, 30, a0, a1)
        ctx.stroke()
        arrowHead(ctx, 64 + Math.cos(a1) * 30, 64 + Math.sin(a1) * 30, a1 + Math.PI / 2 + 0.15, 18)
      }
      break
    }
    case 'random': // a die
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.roundRect(32, 32, 64, 64, 14)
      ctx.stroke()
      for (const [x, y] of [[50, 50], [78, 50], [64, 64], [50, 78], [78, 78]]) {
        ctx.beginPath()
        ctx.arc(x, y, 6, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    default:
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function doorSymbolTexture(d) {
  const key = d.type === 'oneway' ? `oneway${d.dir}` : d.type
  if (!symbolCache.has(key)) symbolCache.set(key, drawDoorSymbol(d.type, d.dir))
  return symbolCache.get(key)
}

// Loads the door model once. It is two meshes: the frame (the larger one) and
// the leaf with its two knobs. Both are baked into plain world-space geometry
// here; makeDoor() then fits copies of them to a doorway of any height.
async function loadDoorTemplate() {
  const fbx = await new FBXLoader().loadAsync(DOOR_URL)
  fbx.updateMatrixWorld(true)
  const meshes = []
  fbx.traverse((o) => {
    if (!o.isMesh) return
    const geometry = o.geometry.clone()
    geometry.applyMatrix4(o.matrixWorld)
    geometry.computeBoundingBox()
    const size = geometry.boundingBox.getSize(new THREE.Vector3())
    meshes.push({ geometry, box: geometry.boundingBox, area: size.x * size.y })
  })
  meshes.sort((p, q) => q.area - p.area)
  return { frame: meshes[0], leaf: meshes[1] }
}

const ease = (t) => t * t * (3 - 2 * t)

// One door, built ACROSS the corridor: players walk along x, so the leaf
// must block x — its face points along the corridor and it spans the tunnel's
// depth (z), the same depth as the surrounding blocks. Seen from the front
// camera it is therefore mostly edge-on: a slab with a brass knob each side,
// with a little of its painted face showing thanks to the slight camera angle.
// The leaf hangs on a hinge at the BACK edge (opposite its knob) and swings 90
// degrees to lie flat against the back wall, out of the way.
//
// The model's x (width) runs along the corridor's depth, its z (thickness)
// along the walking direction. `swing` (+1 / -1) picks which way it opens.
function makeDoor(model, h, paint, swing = 1) {
  const { frame, leaf } = model
  const frameW = frame.box.max.x - frame.box.min.x
  const frameH = frame.box.max.y - frame.box.min.y
  const cx = (frame.box.min.x + frame.box.max.x) / 2
  const baseY = frame.box.min.y
  const midZ = (VIEW3D.TILE_FRONT + VIEW3D.TILE_BACK) / 2
  const sz = (VIEW3D.TILE_FRONT - VIEW3D.TILE_BACK) / frameW // tiles per model unit along the corridor's depth
  const sy = h / frameH

  // find the knobs (they stick out of the slab) to learn which edge is the free edge
  const position = leaf.geometry.attributes.position
  const leafCenterZ = (leaf.box.min.z + leaf.box.max.z) / 2
  const slabHalf = 22
  let knobSum = 0
  let knobCount = 0
  let slabMin = Infinity
  let slabMax = -Infinity
  for (let i = 0; i < position.count; i++) {
    const dz = position.getZ(i) - leafCenterZ
    if (Math.abs(dz) > slabHalf) {
      knobSum += position.getX(i)
      knobCount++
    } else {
      slabMin = Math.min(slabMin, position.getZ(i))
      slabMax = Math.max(slabMax, position.getZ(i))
    }
  }
  const knobOnLeft = knobSum / Math.max(1, knobCount) < (leaf.box.min.x + leaf.box.max.x) / 2
  const st = LEAF_THICKNESS / (slabMax - slabMin) // tiles per model unit along the walking direction

  // model -> world: X (walking direction) from model z, Z (depth) from model x, with the
  // knob edge at the FRONT and the hinge edge at the BACK
  const c = knobOnLeft ? -sz : sz
  const fit = (centerZ, extra) => {
    const m = new THREE.Matrix4().set(
      0, 0, st, -st * centerZ,
      0, sy, 0, -sy * baseY,
      c, 0, 0, midZ - c * cx,
      0, 0, 0, 1,
    )
    return extra ? extra.multiply(m) : m
  }
  const proper = c < 0 // keeps triangle winding; otherwise draw both sides

  const frameGeo = frame.geometry.clone()
  frameGeo.applyMatrix4(fit((frame.box.min.z + frame.box.max.z) / 2))
  const frameMesh = new THREE.Mesh(frameGeo, new THREE.MeshStandardMaterial({ color: FRAME_COLOR, roughness: 0.8, side: proper ? THREE.FrontSide : THREE.DoubleSide }))

  const leafGeo = leaf.geometry.clone()
  const colors = new Float32Array(position.count * 3)
  const paintColor = new THREE.Color(paint)
  for (let i = 0; i < position.count; i++) {
    const knob = Math.abs(position.getZ(i) - leafCenterZ) > slabHalf
    const color = knob ? LEAF_BRASS : paintColor
    colors.set([color.r, color.g, color.b], i * 3)
  }
  leafGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  // swap doors change colour: repaint the leaf (not the brass knobs)
  const repaint = (hex) => {
    const c2 = new THREE.Color(hex)
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getZ(i) - leafCenterZ) > slabHalf) continue
      colors.set([c2.r, c2.g, c2.b], i * 3)
    }
    leafGeo.attributes.color.needsUpdate = true
  }
  const hingeEdge = knobOnLeft ? leaf.box.max.x : leaf.box.min.x
  const hingeZ = midZ + c * (hingeEdge - cx)
  leafGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, -hingeZ).multiply(fit(leafCenterZ)))
  const leafMesh = new THREE.Mesh(
    leafGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, side: proper ? THREE.FrontSide : THREE.DoubleSide }),
  )
  const pivot = new THREE.Group() // the hinge: a vertical axis at the back of the doorway
  pivot.position.set(0, 0, hingeZ)
  pivot.add(leafMesh)

  const group = new THREE.Group()
  group.add(frameMesh, pivot)
  return { group, pivot, swing, repaint, paint, open: [0, 0] } // `open` is each pane's own 0..1 swing (a coloured door may be open for one player only)
}

function makeLabel(text, color = '#ffffff', background = 'rgba(0,0,0,0.55)', width = 1.8) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = background
  ctx.beginPath()
  ctx.roundRect(2, 2, 252, 60, 14)
  ctx.fill()
  ctx.font = '700 34px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, 128, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(width, width / 4, 1)
  return sprite
}

function brickTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#6a5878'
  ctx.fillRect(0, 0, size, size)
  const rows = 4
  const bh = size / rows
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? size / 4 : 0
    for (let c = -1; c < 3; c++) {
      const x = c * (size / 2) + offset
      ctx.fillStyle = `rgba(0,0,0,${0.06 + ((r * 7 + c * 3) % 5) * 0.02})`
      ctx.fillRect(x + 2, r * bh + 2, size / 2 - 4, bh - 4)
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 3
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath()
    ctx.moveTo(0, r * bh)
    ctx.lineTo(size, r * bh)
    ctx.stroke()
    const offset = r % 2 ? size / 4 : 0
    for (let c = -1; c < 3; c++) {
      ctx.beginPath()
      ctx.moveTo(c * (size / 2) + offset, r * bh)
      ctx.lineTo(c * (size / 2) + offset, (r + 1) * bh)
      ctx.stroke()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export async function createWorld(scene) {
  const doorModel = await loadDoorTemplate()
  let root = null
  let dynamic = null

  function clear() {
    if (!root) return
    scene.remove(root)
    root.traverse((o) => {
      o.geometry?.dispose?.()
      for (const m of [].concat(o.material || [])) {
        m.map?.dispose?.()
        m.dispose?.()
      }
    })
    root = null
    dynamic = null
  }

  function buildTiles(level, group) {
    const depth = VIEW3D.TILE_FRONT - VIEW3D.TILE_BACK
    const midZ = (VIEW3D.TILE_FRONT + VIEW3D.TILE_BACK) / 2
    const cells = []
    const crates = crateCellSet(level) // drawn as crates (scenery.js), not brick
    const brick = (x, y) => isSolid(level, x, y) && !crates.has(`${x},${y}`)
    for (let ty = 0; ty < level.rows; ty++) {
      for (let tx = 0; tx < level.cols; tx++) {
        if (!brick(tx, ty)) continue
        // (a crate counts as open air here, so the floor under a stack still shows its top)
        const open = !brick(tx, ty - 1) || !brick(tx + 1, ty) || !brick(tx - 1, ty) || !brick(tx, ty + 1)
        if (open) cells.push({ tx, ty, top: !brick(tx, ty - 1) })
      }
    }

    const blockGeometry = new THREE.BoxGeometry(1, 1, depth)
    blockGeometry.translate(0, 0, midZ)
    const blocks = new THREE.InstancedMesh(blockGeometry, new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }), cells.length)
    const lipGeometry = new THREE.BoxGeometry(1.002, 0.15, depth + 0.02) // sits a hair proud of the block (no z-fighting)
    lipGeometry.translate(0, 0, midZ)
    const tops = cells.filter((c) => c.top)
    const lips = new THREE.InstancedMesh(lipGeometry, new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }), tops.length)

    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    cells.forEach((cell, i) => {
      matrix.makeTranslation(cell.tx + 0.5, -(cell.ty + 0.5), 0)
      blocks.setMatrixAt(i, matrix)
      const shade = 0.86 + (((cell.tx * 73856093) ^ (cell.ty * 19349663)) & 255) / 255 * 0.22
      color.set('#6a565c').multiplyScalar(shade)
      blocks.setColorAt(i, color)
    })
    tops.forEach((cell, i) => {
      matrix.makeTranslation(cell.tx + 0.5, -(cell.ty + 0.5) + 0.435, 0)
      lips.setMatrixAt(i, matrix)
      lips.setColorAt(i, color.set('#a68a74'))
    })
    blocks.instanceMatrix.needsUpdate = true
    lips.instanceMatrix.needsUpdate = true
    group.add(blocks, lips)
  }

  function buildBackdrop(level, group) {
    // far gradient, then a faint brick wall just behind the playfield
    const far = new THREE.PlaneGeometry(level.cols + 80, level.rows + 80)
    const top = new THREE.Color('#241a36')
    const bottom = new THREE.Color('#4a3350')
    far.setAttribute('color', new THREE.BufferAttribute(new Float32Array([...top.toArray(), ...top.toArray(), ...bottom.toArray(), ...bottom.toArray()]), 3))
    const farMesh = new THREE.Mesh(far, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }))
    farMesh.position.set(level.cols / 2, -level.rows / 2, -14)
    group.add(farMesh)

    const wallW = level.cols + 12
    const wallH = level.rows + 8
    const texture = brickTexture()
    texture.repeat.set(wallW / 4, wallH / 4)
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(wallW, wallH),
      new THREE.MeshBasicMaterial({ map: texture, color: 0xb9a9c8 }),
    )
    wall.position.set(level.cols / 2, -level.rows / 2, VIEW3D.BACK_WALL_Z)
    group.add(wall)
  }

  function buildObjects(game, group) {
    const { doors, plates, switches, exit } = game.doors
    const out = { doors: [], plates: [], switches: [], exit: null, keys: [], portals: [], gravity: [], crystals: [], markers: {}, fx: new Map() }

    for (const d of doors) {
      const door = makeDoor(doorModel, d.h, DOOR_PAINT[d.color], d.swing)
      door.group.position.set(d.x + 0.5, -(d.y + d.h), 0)
      // status lamp and hold-open timer sit on the front face of the frame, above the leaf
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: RED }))
      lamp.position.set(0, d.h - 0.22, VIEW3D.TILE_FRONT + 0.03)
      lamp.visible = !!d.control || LAMP_TYPES.has(d.type)
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.07), new THREE.MeshBasicMaterial({ color: 0xfacc15 }))
      bar.position.set(0, d.h - 0.42, VIEW3D.TILE_FRONT + 0.03)
      bar.visible = false
      door.group.add(lamp, bar)
      // the door's symbol: a badge on the front of the leaf, so it swings away with the door
      const badge = new THREE.Mesh(
        new THREE.PlaneGeometry(BADGE_SIZE, BADGE_SIZE),
        new THREE.MeshBasicMaterial({ map: doorSymbolTexture(d), transparent: true, depthWrite: false }),
      )
      badge.position.set(0, Math.min(d.h * 0.55, d.h - 0.9), VIEW3D.TILE_FRONT - door.pivot.position.z + 0.02)
      door.pivot.add(badge)
      group.add(door.group)
      out.doors.push({ door, lamp, bar })
    }

    for (const p of plates) {
      const color = p.color === 'any' ? '#d6d3d1' : DOOR_PAINT[p.color]
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(p.w - 0.1, 0.2, 0.9),
        new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0 }),
      )
      mesh.position.set(p.x + p.w / 2, p.ceiling ? -p.y - 0.1 : -(p.y + 1) + 0.1, 0)
      group.add(mesh)
      out.plates.push(mesh)
    }

    for (const s of switches) {
      const holder = new THREE.Group()
      holder.position.set(s.x + 0.5, s.ceiling ? -s.y : -(s.y + 1), 0)
      if (s.ceiling) holder.scale.y = -1 // hangs from the ceiling
      const tint = s.bypass ? '#a855f7' : '#e7e5e4'
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.5), new THREE.MeshStandardMaterial({ color: s.bypass ? '#6b21a8' : '#57534e' }))
      base.position.y = 0.1
      const pivot = new THREE.Group()
      pivot.position.y = 0.2
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 10), new THREE.MeshStandardMaterial({ color: '#a8a29e' }))
      stick.position.y = 0.31
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 16, 12),
        new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.25 }),
      )
      knob.position.y = 0.64
      pivot.add(stick, knob)
      holder.add(base, pivot)
      if (s.bypass) {
        const label = makeLabel('BYPASS (test)', '#e9d5ff', 'rgba(76,29,149,0.85)', 2.1)
        label.position.set(0, 2.0, 0.2)
        holder.add(label)
      }
      group.add(holder)
      out.switches.push({ pivot, knob })
    }

    for (const k of game.doors.keys) {
      const g = new THREE.Group()
      const gold = new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#a16207', emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.3 })
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 18), gold)
      ring.position.y = 0.26
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.07), gold)
      shaft.position.y = 0
      const tooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.07), gold)
      tooth1.position.set(0.1, -0.12, 0)
      const tooth2 = tooth1.clone()
      tooth2.position.set(0.08, -0.2, 0)
      g.add(ring, shaft, tooth1, tooth2)
      group.add(g)
      out.keys.push(g)
    }

    for (const c of game.crystals) {
      const crystal = makeCrystal(c)
      group.add(crystal.g)
      out.crystals.push(crystal)
    }
    for (const id of ['blue', 'pink']) {
      out.markers[id] = makeMarker(COLORS[id])
      group.add(out.markers[id])
    }
    out.fxGroup = group

    for (const gd of game.doors.gravity) {
      const texture = gravityFieldTexture(gd.set)
      texture.repeat.set(1, gd.h / 2)
      const field = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, gd.h),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      )
      field.position.set(gd.x + 0.5, -(gd.y + gd.h / 2), 0.1)
      group.add(field)
      out.gravity.push({ field, texture, gd })
    }

    game.doors.portals.forEach((po, i) => {
      // pairs share a colour: the colour index comes from the lower-numbered partner
      const partnerIndex = game.doors.portals.findIndex((o) => o.id === po.to)
      const color = PORTAL_COLORS[Math.min(i, partnerIndex) % PORTAL_COLORS.length]
      const g = new THREE.Group()
      g.position.set(po.x + 0.5, -(po.y + po.h / 2), 0.1)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 10, 28), new THREE.MeshBasicMaterial({ color }))
      ring.scale.y = po.h / 1.0
      const fill = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 28),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
      )
      fill.scale.y = po.h / 1.0
      g.add(fill, ring)
      group.add(g)
      out.portals.push({ g, fill })
    })

    if (exit) {
      // ONE door, centred in the exit area (which is two tiles wide only so that both
      // players have room to stand in it at once)
      const door = makeDoor(doorModel, exit.h, EXIT_PAINT, 1)
      door.group.position.set(exit.x + exit.w / 2, -(exit.y + exit.h), 0)
      group.add(door.group)
      const exitDoors = [door]
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(exit.w + 0.6, exit.h + 0.4),
        new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0, depthWrite: false }),
      )
      glow.position.set(exit.x + exit.w / 2, -(exit.y + exit.h / 2), -0.45)
      group.add(glow)
      const sign = makeLabel('EXIT', '#fde68a', 'rgba(60,35,12,0.9)', 1.5)
      sign.position.set(exit.x + exit.w / 2, -(exit.y) + 0.18, 0.55)
      group.add(sign)
      out.exit = { glow, doors: exitDoors }
    }
    return out
  }

  // Builds the static room and the dynamic objects for `level` / `game`.
  function build(level, game) {
    clear()
    root = new THREE.Group()
    buildBackdrop(level, root)
    buildTiles(level, root)
    buildScenery(level, root)
    dynamic = buildObjects(game, root)
    dynamic.traps = createTrapView(root, game)
    dynamic.crates = game.crates.map((c, i) => {
      const mesh = createCrateMesh(i)
      root.add(mesh)
      return mesh
    })
    scene.add(root)
  }

  // Poses the dynamic objects for the pane `paneIndex`, which belongs to
  // `focus`. Each pane keeps its own swing state per door, since a coloured
  // door is open for one player and shut for the other.
  function apply(game, focus, paneIndex, dt) {
    if (!dynamic) return
    game.crates.forEach((c, i) => {
      const m = dynamic.crates?.[i]
      if (!m) return
      m.visible = c.mode !== 'lost'
      const ease = c.t * c.t * (3 - 2 * c.t)
      const shake = c.mode === 'idle' && c.push.t > 0 ? Math.sin(performance.now() / 18) * 0.012 : 0
      m.position.set(c.x + 0.5 + (c.mode === 'slide' ? c.dx * ease : 0) + shake, -((c.mode === 'fall' ? c.fy : c.y) + 0.5), 0)
    })
    const sys = game.doors
    const swing = (door, shouldOpen) => {
      const open = door.open[paneIndex]
      const next = shouldOpen ? Math.min(1, open + dt / OPEN_TIME) : Math.max(0, open - dt / OPEN_TIME)
      door.open[paneIndex] = next
      door.pivot.rotation.y = door.swing * ease(next) * OPEN_ANGLE
    }
    sys.doors.forEach((d, i) => {
      const { door, lamp, bar } = dynamic.doors[i]
      swing(door, !doorClosedTo(d, focus))
      if (d.type === 'swap' && door.paint !== DOOR_PAINT[d.color]) {
        door.paint = DOOR_PAINT[d.color]
        door.repaint(door.paint)
      }
      // lamp: green/red for doors with a trigger; purple while a bypass switch is holding the door open
      lamp.visible = !!d.control || d.unlocked
      lamp.material.color.setHex(d.unlocked ? PURPLE : d.open ? GREEN : RED)
      const holding = d.control && d.control.holdOpen && d.holdTimer > 0
      bar.visible = !!holding
      if (holding) {
        bar.scale.x = Math.max(0.01, d.holdTimer / d.control.holdOpen)
        bar.position.x = -(0.35 * (1 - bar.scale.x))
      }
    })
    sys.keys.forEach((k, i) => {
      const g = dynamic.keys[i]
      g.visible = !k.used
      if (!k.used) {
        const bob = Math.sin(game.time * 3 + i) * 0.06
        g.position.set(k.px, -k.py + bob, 0.1)
        g.rotation.y = game.time * 2
      }
    })
    // ability crystals: spin in place, bob, and shimmer; gone once taken
    game.crystals.forEach((c, i) => {
      const m = dynamic.crystals[i]
      m.g.visible = !c.taken
      if (c.taken) return
      m.spin.rotation.y = game.time * 1.8 + i
      m.g.position.y = -(c.y + 0.5) + Math.sin(game.time * 2 + i) * 0.08
      m.orbit.forEach((o, k) => {
        const a = game.time * 2.4 + k * Math.PI
        o.position.set(Math.cos(a) * 0.5, Math.sin(a * 0.7) * 0.35, Math.sin(a) * 0.5)
        o.rotation.y = a
      })
      m.halo.material.opacity = 0.6 + 0.2 * Math.sin(game.time * 3 + i)
    })
    // teleport markers
    for (const p of game.players) {
      const mk = dynamic.markers[p.id]
      mk.visible = !!p.tpMarker
      if (p.tpMarker) {
        mk.position.set(p.tpMarker.x, -p.tpMarker.y, 0.1)
        mk.scale.y = p.tpMarker.grav < 0 ? -1 : 1
        mk.children[1].material.opacity = 0.18 + 0.08 * Math.sin(game.time * 4)
      }
    }
    // little light effects (jump bursts, teleports, collecting a crystal), synced once per frame
    if (paneIndex === 0) {
      const seen = new Set()
      for (const f of game.fx) {
        seen.add(f.id)
        let mesh = dynamic.fx.get(f.id)
        if (!mesh) {
          mesh = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 30), new THREE.MeshBasicMaterial({ color: fxColor(f.color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
          dynamic.fxGroup.add(mesh)
          dynamic.fx.set(f.id, mesh)
        }
        const t = f.age / f.life
        const size = f.type === 'burst' ? 0.25 + 0.7 * t : f.type === 'fail' ? 0.2 + 0.3 * t : 0.3 + 1.4 * t
        mesh.position.set(f.x, -f.y, 0.3)
        mesh.scale.setScalar(size)
        mesh.material.opacity = 0.85 * (1 - t)
      }
      for (const [id, mesh] of dynamic.fx) {
        if (seen.has(id)) continue
        dynamic.fxGroup.remove(mesh)
        mesh.geometry.dispose()
        mesh.material.dispose()
        dynamic.fx.delete(id)
      }
    }
    // gravity fields stream their chevrons the way gravity will pull you
    for (const f of dynamic.gravity) {
      const dir = f.gd.set === 'up' ? 1 : -1
      f.texture.offset.y = (dir * game.time * 0.6) % 1
      f.field.material.opacity = 0.75 + 0.25 * Math.sin(game.time * 5)
    }
    sys.portals.forEach((po, i) => {
      dynamic.portals[i].fill.material.opacity = 0.3 + 0.12 * Math.sin(game.time * 4 + i)
      dynamic.portals[i].g.rotation.z = 0
    })
    sys.plates.forEach((p, i) => {
      const mesh = dynamic.plates[i]
      mesh.scale.y = p.held ? 0.4 : 1
      mesh.position.y = p.ceiling ? -p.y - (p.held ? 0.04 : 0.1) : -(p.y + 1) + (p.held ? 0.04 : 0.1)
      mesh.material.emissiveIntensity = p.held ? 0.9 : 0
    })
    sys.switches.forEach((s, i) => {
      dynamic.switches[i].pivot.rotation.z = s.on ? -0.7 : 0.7
      dynamic.switches[i].knob.material.emissiveIntensity = s.on ? 0.9 : 0.25
    })
    dynamic.traps?.apply(focus.id)
    if (sys.exit && dynamic.exit) {
      const inside = sys.exit.inside.filter(Boolean).length
      dynamic.exit.glow.material.opacity = inside === 2 ? 0.5 : inside === 1 ? 0.2 : 0
      dynamic.exit.doors.forEach((door) => swing(door, inside > 0)) // the exit swings open as you reach it
    }
  }

  function setVisible(visible) {
    if (root) root.visible = visible
  }

  return { build, apply, setVisible, dispose: clear }
}

