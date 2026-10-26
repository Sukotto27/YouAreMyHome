// Flipbook billboards: an NxN sprite sheet played as an animation on a camera-facing quad (campfire flame, smoke).
// Brackeys VFX bundle (CC0): assets3d/VFX/flipbooks, 8x8 frames. Frames are blended so slow playback stays smooth.
import * as THREE from "three";
import { TGALoader } from "three/addons/loaders/TGALoader.js";

const cache = new Map();
function sheet(url) {
  if (!cache.has(url)) { const t = new TGALoader().load(url); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; cache.set(url, t); }
  return cache.get(url);
}
const VERT = `
uniform vec2 uSize; varying vec2 vUv;
void main() { vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * uSize; vUv = uv; gl_Position = projectionMatrix * mv; }`;
const FRAG = `
uniform sampler2D uMap; uniform float uTime, uFps, uOffset, uGrid, uIntensity, uAlpha; uniform vec3 uTint; uniform float uFlipY; uniform float uAdditive;
varying vec2 vUv;
vec4 frameAt(float f) {
  float g = uGrid, row = floor(f / g), col = f - row * g; if (uFlipY > 0.5) row = g - 1.0 - row;
  return texture2D(uMap, (vec2(col, row) + vUv) / g);
}
void main() {
  float total = uGrid * uGrid, t = uTime * uFps + uOffset, f0 = mod(floor(t), total), f1 = mod(f0 + 1.0, total);
  vec4 c = mix(frameAt(f0), frameAt(f1), fract(t));
  float a = uAdditive > 0.5 ? max(c.a, max(c.r, max(c.g, c.b))) : c.a;
  gl_FragColor = vec4(c.rgb * uTint * uIntensity, a * uAlpha);
}`;

/** opts: { file, w, h, additive, fps, tint, intensity, alpha, offset, flipY } */
export function createFlipbook({ file, w = 1, h = 1, additive = true, fps = 20, tint = [1, 1, 1], intensity = 1, alpha = 1, offset = 0, flipY = false, grid = 8 }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: sheet("assets3d/VFX/flipbooks/" + file) }, uTime: { value: 0 }, uFps: { value: fps }, uOffset: { value: offset }, uGrid: { value: grid }, uIntensity: { value: intensity }, uAlpha: { value: alpha }, uTint: { value: new THREE.Color(...tint) }, uFlipY: { value: flipY ? 1 : 0 }, uAdditive: { value: additive ? 1 : 0 }, uSize: { value: new THREE.Vector2(w, h) } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
  });
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);      // base at the origin, growing upward
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 7;
  mesh.userData.tick = (t) => { mat.uniforms.uTime.value = t; };
  return mesh;
}

/**
 * Wood smoke, ported from City Builder's FireVfx: a puff of the `wispy_smoke` flipbook every ~0.45 s that rises, drifts
 * downwind, swells from a wisp to a haze, fades in fast and out slow. Add `.group` to the scene (position it at the fire);
 * call `.update(dt)` each frame.
 */
export function createSmokeEmitter({ interval = 0.45, life = 6, rise = 0.75, height = 1.1 } = {}) {
  const group = new THREE.Group(), puffs = [], base = sheet("assets3d/VFX/flipbooks/wispy_smoke_01_8x8.tga");
  const WIND = new THREE.Vector3(0.35, 0, -0.15), GRID = 8;
  let timer = Math.random() * interval;
  const setFrame = (t, i) => { const f = ((Math.floor(i) % 64) + 64) % 64, col = f % GRID, row = Math.floor(f / GRID); t.offset.set(col / GRID, t.flipY ? 1 - (row + 1) / GRID : row / GRID); };
  const kill = (p) => { group.remove(p.sprite); p.sprite.material.map.dispose(); p.sprite.material.dispose(); };
  return {
    group,
    update(dt) {
      if (dt <= 0) return;
      timer -= dt;
      for (let n = 0; timer <= 0 && n < 6; n++) {
        timer += interval * (0.7 + Math.random() * 0.6);
        const map = base.clone(); map.needsUpdate = true; map.repeat.set(1 / GRID, 1 / GRID); setFrame(map, Math.random() * 64);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0, fog: true }));
        sprite.material.color.setScalar(1.7); sprite.material.rotation = Math.random() * Math.PI * 2; sprite.renderOrder = 6;
        sprite.position.set((Math.random() - 0.5) * 0.2, height, (Math.random() - 0.5) * 0.2);
        group.add(sprite);
        puffs.push({ sprite, age: 0, life: life * (0.8 + Math.random() * 0.4), spin: (Math.random() - 0.5) * 0.4, drift: new THREE.Vector3((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.15) });
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i]; p.age += dt; const t = p.age / p.life;
        if (t >= 1) { kill(p); puffs.splice(i, 1); continue; }
        p.sprite.position.y += rise * (1 - t * 0.5) * dt; p.sprite.position.addScaledVector(WIND, dt * t); p.sprite.position.addScaledVector(p.drift, dt);
        const size = 0.45 + 2.4 * t; p.sprite.scale.set(size, size, 1); p.sprite.material.rotation += p.spin * dt;
        p.sprite.material.opacity = 0.7 * Math.min(1, t * 6) * (1 - t) ** 1.4;
      }
    },
    dispose() { for (const p of puffs) kill(p); puffs.length = 0; },
  };
}
