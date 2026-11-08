// The game's fire effect: the same 8x8 flipbook sprite sheet (Brackeys VFX bundle, CC0) the home game uses for its campfire.
// A flame is a camera-facing quad whose base sits at its origin and grows along its own "up", which can be turned to any
// direction, so one flame can burn upward out of a floor jet or sideways out of a wall nozzle.
import * as THREE from 'three'
import { TGALoader } from 'three/addons/loaders/TGALoader.js'

const FIRE_URL = `${import.meta.env.BASE_URL}doors/vfx/fire_01_8x8.tga`
let sheet = null
function fireSheet() {
  if (!sheet) {
    sheet = new TGALoader().load(FIRE_URL)
    sheet.colorSpace = THREE.SRGBColorSpace
    sheet.generateMipmaps = false
    sheet.minFilter = THREE.LinearFilter
  }
  return sheet
}

const VERT = `
uniform vec2 uSize; uniform float uAngle; varying vec2 vUv;
void main() {
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float c = cos(uAngle), s = sin(uAngle);
  vec2 p = position.xy * uSize;
  mv.xy += vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  vUv = uv;
  gl_Position = projectionMatrix * mv;
}`
const FRAG = `
uniform sampler2D uMap; uniform float uTime, uFps, uOffset, uIntensity, uAlpha; uniform vec3 uTint; varying vec2 vUv;
vec4 frameAt(float f) {
  float g = 8.0, row = floor(f / g), col = f - row * g;
  return texture2D(uMap, (vec2(col, row) + vUv) / g);
}
void main() {
  float t = uTime * uFps + uOffset, f0 = mod(floor(t), 64.0), f1 = mod(f0 + 1.0, 64.0);
  vec4 c = mix(frameAt(f0), frameAt(f1), fract(t));
  float a = max(c.a, max(c.r, max(c.g, c.b)));
  gl_FragColor = vec4(c.rgb * uTint * uIntensity, a * uAlpha);
}`

/** A flame `w` wide and `h` long. Turn it with setDirection(dx, dy) (world, y up); call tick(seconds) every frame. */
export function createFlame({ w = 1.2, h = 1.4, fps = 30, offset = 0, intensity = 1.2, tint = [1, 0.8, 0.5] } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: fireSheet() },
      uTime: { value: 0 },
      uFps: { value: fps },
      uOffset: { value: offset },
      uIntensity: { value: intensity },
      uAlpha: { value: 1 },
      uTint: { value: new THREE.Color(...tint) },
      uSize: { value: new THREE.Vector2(w, h) },
      uAngle: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), mat) // base at the origin, growing up
  mesh.frustumCulled = false
  mesh.renderOrder = 7
  mesh.userData.setDirection = (dx, dy) => {
    mat.uniforms.uAngle.value = Math.atan2(-dx, dy)
  }
  mesh.userData.setSize = (sw, sh) => mat.uniforms.uSize.value.set(sw, sh)
  mesh.userData.tick = (t) => {
    mat.uniforms.uTime.value = t
  }
  return mesh
}
