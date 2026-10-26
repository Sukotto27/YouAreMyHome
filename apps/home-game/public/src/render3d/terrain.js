// Terrain + water for the overworld, built from the tile grid (state.world.tiles).
// Same recipe as City Builder's world, adapted from round lakes to tile-based ones:
//   - ground is a displaced heightfield: gentle seeded hills on land, water tiles dip into smooth basins
//   - one translucent water surface at a fixed level; where the ground crosses it is the shoreline
//   - sand/wet sand/shallows are painted in the ground's fragment shader from a blurred tile mask,
//     warped by noise so the shore is ragged instead of tile-shaped
import * as THREE from "three";
import { TILE_M, TERRAIN, COLORS } from "./config.js";

// ---------- noise ----------
function hash(ix, iz, seed) { let h = (ix * 374761393 + iz * 668265263 + seed * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// ---------- tile masks ----------
function gaussianBlur(src, w, h, sigma, outside) { // separable; samples outside the grid read `outside`
  const r = Math.ceil(sigma * 3), k = [];
  let sum = 0; for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const at = (a, x, y) => (x < 0 || y < 0 || x >= w || y >= h ? outside : a[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * at(src, x + i, y); tmp[y * w + x] = s; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * at(tmp, x, y + i); out[y * w + x] = s; }
  return out;
}

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildTerrain(world, scene, { seed = 7 } = {}) {
  const H = world.tiles.length, W = world.tiles[0].length;
  const sizeX = W * TILE_M, sizeZ = H * TILE_M;
  const water = new Float32Array(W * H), sand = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = world.tiles[y][x];
    water[y * W + x] = t === "water" ? 1 : 0;
    sand[y * W + x] = t === "sand" ? 1 : 0;
  }
  const waterB = gaussianBlur(water, W, H, TERRAIN.shoreBlur, 1).map((v) => Math.min(1, v * TERRAIN.waterGain));   // beyond the map edge is sea
  const sandB = gaussianBlur(sand, W, H, TERRAIN.shoreBlur * 0.9, 0);

  // bilinear sample of a tile-centred field at world (x, z)
  const sample = (f, x, z) => {
    const u = x / TILE_M - 0.5, v = z / TILE_M - 0.5;
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    const g = (xx, yy) => f[Math.min(H - 1, Math.max(0, yy)) * W + Math.min(W - 1, Math.max(0, xx))];
    return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
  };
  const outsideWater = (x, z) => x < 0 || z < 0 || x > sizeX || z > sizeZ;

  /** The natural ground, before any building pad is pressed into it. */
  function baseHeightAt(x, z) {
    const w = outsideWater(x, z) ? 1 : sample(waterB, x, z);
    const basin = smoothstep(0.35, 0.65, w);
    const hills = noise(x / 22, z / 22, seed) * 0.75 + noise(x / 7, z / 7, seed + 3) * 0.25;   // 0..1, so land never dips below the waterline
    const land = 0.14 + hills * TERRAIN.landNoiseAmp * 1.6 * (1 - smoothstep(0.0, 0.6, w));
    return land * (1 - basin) - TERRAIN.basinDepth * basin + TERRAIN.waterLevel * 0;
  }
  // Level pads under buildings: flat inside the rectangle, easing back into the natural ground over `blend` metres.
  let pads = [];
  /** Ground height at world (x, z), including building pads. */
  function heightAt(x, z) {
    let h = baseHeightAt(x, z);
    for (const p of pads) {
      const d = Math.hypot(Math.max(p.x0 - x, 0, x - p.x1), Math.max(p.z0 - z, 0, z - p.z1));
      if (d < p.blend) { const t = d <= 0 ? 1 : 1 - smoothstep(0, p.blend, d); h += (p.y - h) * t; }
    }
    return h;
  }
  const isWaterAt = (x, z) => heightAt(x, z) < TERRAIN.waterLevel - 0.02;

  // ---------- ground mesh: built in 16x16-tile chunks so the GPU can cull what the camera can't see ----------
  const vpt = TERRAIN.vertsPerTile, CHT = 16;
  const chunks = []; // { x0, z0, w, d }
  for (let cz = 0; cz < H; cz += CHT) for (let cx = 0; cx < W; cx += CHT) chunks.push({ x0: cx * TILE_M, z0: cz * TILE_M, w: Math.min(CHT, W - cx) * TILE_M, d: Math.min(CHT, H - cz) * TILE_M });
  const NE = 0.5; // normals from the height function itself, so chunk borders shade seamlessly
  function chunkGeometry(c, withDepth) {
    const g = new THREE.PlaneGeometry(c.w, c.d, Math.round(c.w / TILE_M) * vpt, Math.round(c.d / TILE_M) * vpt); g.rotateX(-Math.PI / 2); g.translate(c.x0 + c.w / 2, 0, c.z0 + c.d / 2);
    const pos = g.attributes.position, n = pos.count, nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), depth = withDepth ? new Float32Array(n) : null;
    let minH = 1e9;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z); pos.setY(i, h); minH = Math.min(minH, h);
      const dx = (heightAt(x - NE, z) - heightAt(x + NE, z)) / (2 * NE), dz = (heightAt(x, z - NE) - heightAt(x, z + NE)) / (2 * NE), l = Math.hypot(dx, 1, dz);
      nrm[i * 3] = dx / l; nrm[i * 3 + 1] = 1 / l; nrm[i * 3 + 2] = dz / l;
      uv[i * 2] = x / TERRAIN.grassRepeatM; uv[i * 2 + 1] = z / TERRAIN.grassRepeatM;
      if (depth) depth[i] = TERRAIN.waterLevel - h;
    }
    g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    if (depth) g.setAttribute("aDepth", new THREE.BufferAttribute(depth, 1));
    g.userData.minH = minH; g.computeBoundingSphere(); return g;
  }

  // mask texture: R = blurred water, G = blurred sand (both 0..1), covers the map exactly
  const maskData = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { maskData[i * 4] = Math.round(waterB[i] * 255); maskData[i * 4 + 1] = Math.round(sandB[i] * 255); maskData[i * 4 + 2] = 255; maskData[i * 4 + 3] = 255; }   // B = explored (fog of war): all explored until setExplored() says otherwise
  const maskTex = new THREE.DataTexture(maskData, W, H, THREE.RGBAFormat); maskTex.magFilter = THREE.LinearFilter; maskTex.minFilter = THREE.LinearFilter; maskTex.needsUpdate = true; maskTex.flipY = false;

  const grassTex = new THREE.TextureLoader().load(TERRAIN.grassTexture);
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.colorSpace = THREE.SRGBColorSpace; grassTex.anisotropy = 8;
  

  const groundMat = new THREE.MeshStandardMaterial({ map: grassTex, color: COLORS.grass, roughness: 1, metalness: 0 });
  const uniforms = {
    uMask: { value: maskTex }, uMapSize: { value: new THREE.Vector2(sizeX, sizeZ) },
    uSand: { value: new THREE.Color(COLORS.sand) }, uWet: { value: new THREE.Color(COLORS.wetSand) }, uShallow: { value: new THREE.Color(COLORS.shallow) },
  };
  // ---- fog of war: unexplored ground and water fade to near-black (applied after the scene fog, so haze doesn't lift it) ----
  const fow = { uFogCol: { value: new THREE.Color(0x06080d) }, uSeen: { value: [new THREE.Vector4(0, 0, 0, 1), new THREE.Vector4(0, 0, 0, 1)] }, uFow: { value: 1 }, uMask: uniforms.uMask, uMapSize: uniforms.uMapSize };
  const FOW_GLSL = `
uniform vec3 uFogCol; uniform vec4 uSeen[2]; uniform float uFow;
float fowH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fowN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(fowH(i), fowH(i + vec2(1.0, 0.0)), f.x), mix(fowH(i + vec2(0.0, 1.0)), fowH(i + vec2(1.0, 1.0)), f.x), f.y); }
float fowAmount(vec2 xz) {
  float e = texture2D(uMask, clamp(xz / uMapSize, 0.0, 1.0)).b + (fowN(xz * 0.55) - 0.5) * 0.34;
  float seen = smoothstep(0.38, 0.62, e);
  for (int i = 0; i < 2; i++) seen = max(seen, 1.0 - smoothstep(uSeen[i].z - 2.4, uSeen[i].z, distance(xz, uSeen[i].xy)));
  return (1.0 - seen) * uFow;
}`;
  /** Patch a material's shader so it darkens where the map is unexplored. `xzVar` = a vec2 varying holding world x,z. */
  function fowPatch(sh, xzVar, hasMask = false) {   // the ground shader already declares uMask / uMapSize
    Object.assign(sh.uniforms, fow);
    sh.fragmentShader = sh.fragmentShader
      .replace("void main()", `${hasMask ? "" : "uniform sampler2D uMask; uniform vec2 uMapSize;"}
${FOW_GLSL}
void main()`)
      .replace("#include <fog_fragment>", `#include <fog_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogCol, fowAmount(${xzVar}) * 0.985);`);
  }
  groundMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vWXZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWXZ = position.xz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec2 vWXZ;
uniform sampler2D uMask; uniform vec2 uMapSize; uniform vec3 uSand; uniform vec3 uWet; uniform vec3 uShallow;
float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }`)
      .replace("#include <map_fragment>", `#include <map_fragment>
{
  vec4 m = texture2D(uMask, vWXZ / uMapSize);
  float n = gn(vWXZ * 0.8) * 0.55 + gn(vWXZ * 0.31) * 0.45;
  float sandAmt = smoothstep(0.16, 0.42, m.g + m.r * 0.5 + (n - 0.5) * 0.34);
  float wet = smoothstep(0.30, 0.46, m.r + (n - 0.5) * 0.10);
  float shallow = smoothstep(0.50, 0.70, m.r);
  vec3 flatG = vec3(0.30, 0.46, 0.17);
  vec3 c = mix(flatG, diffuseColor.rgb * 1.5, 0.55) * (0.9 + 0.2 * gn(vWXZ * 0.12));
  c = mix(c, uSand * (0.92 + 0.16 * n), sandAmt);
  c = mix(c, uWet, wet);
  c = mix(c, uShallow * 0.8, shallow);
  diffuseColor.rgb = c;
}`);
  };
  groundMat.customProgramCacheKey = () => "r3d-ground";
  { const prev = groundMat.onBeforeCompile; groundMat.onBeforeCompile = (sh) => { prev(sh); fowPatch(sh, "vWXZ", true); }; }
  const ground = new THREE.Group(); ground.name = "ground";
  const groundChunks = [];
  for (const c of chunks) { const m = new THREE.Mesh(chunkGeometry(c, false), groundMat); m.receiveShadow = true; ground.add(m); groundChunks.push({ c, m }); }
  scene.add(ground);

  // ---------- water ----------
  const waterMat = new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.34, metalness: 0.0, transparent: true, depthWrite: false });
  const wu = { uTime: { value: 0 } };
  waterMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, wu, { uShallow: uniforms.uShallow });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aDepth; varying float vDepth; varying vec2 vWP;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvDepth = aDepth; vWP = position.xz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vDepth; varying vec2 vWP; uniform float uTime; uniform vec3 uShallow;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float dd = clamp(vDepth, 0.0, 1.4);
        diffuseColor.rgb = mix(uShallow, diffuseColor.rgb, smoothstep(0.0, 1.0, dd));
        diffuseColor.a = smoothstep(0.0, 0.07, vDepth) * mix(0.42, 0.9, smoothstep(0.0, 0.9, dd));`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        normal = normalize(normal + 0.018 * vec3(sin(vWP.x * 1.3 + vWP.y * 0.7 + uTime * 1.3) + sin(vWP.y * 2.1 - vWP.x * 0.9 - uTime), 0.0, cos(vWP.y * 1.7 - vWP.x * 0.6 + uTime * 1.1) + cos(vWP.x * 2.5 + vWP.y * 1.1 + uTime * 0.7)));`);
  };
  waterMat.customProgramCacheKey = () => "r3d-water";
  { const prev = waterMat.onBeforeCompile; waterMat.onBeforeCompile = (sh) => { prev(sh); fowPatch(sh, "vWP"); }; }
  const waterMesh = new THREE.Group(); waterMesh.name = "water";
  for (const c of chunks) {
    const g = chunkGeometry(c, true);
    if (g.userData.minH >= TERRAIN.waterLevel) { g.dispose(); continue; }       // no water under this chunk
    const wp = g.attributes.position; for (let i = 0; i < wp.count; i++) wp.setY(i, TERRAIN.waterLevel);
    const nrm = g.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, waterMat); m.renderOrder = 2; waterMesh.add(m);
  }
  scene.add(waterMesh);

  // open sea beyond the map: four big quads around it, same level
  const R = 700, seaMat = new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.34, metalness: 0.0, transparent: true, opacity: 0.9, depthWrite: false });
  const fowWorld = (m, key) => {      // materials with no custom shader of their own: add a world-xz varying and the fog
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
varying vec2 vFXZ;`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
vFXZ = (modelMatrix * vec4(position, 1.0)).xz;`);
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec2 vFXZ;`);
      fowPatch(sh, "vFXZ");
    };
    m.customProgramCacheKey = () => key;
  };
  fowWorld(seaMat, "r3d-sea");
  const addSea = (x0, z0, x1, z1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), seaMat); m.position.set((x0 + x1) / 2, TERRAIN.waterLevel, (z0 + z1) / 2); m.renderOrder = 1; scene.add(m); return m; };
  const sea = [addSea(-R, -R, sizeX + R, 0), addSea(-R, sizeZ, sizeX + R, sizeZ + R), addSea(-R, 0, 0, sizeZ), addSea(sizeX, 0, sizeX + R, sizeZ)];

  // a seabed plane under everything, coloured like the basin floor, so the sea beyond the map matches the water over it
  const seabed = new THREE.Mesh(new THREE.PlaneGeometry(R * 2 + sizeX, R * 2 + sizeZ).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.shallow).multiplyScalar(0.8 * 0.55) }));
  seabed.position.set(sizeX / 2, -TERRAIN.basinDepth - 0.02, sizeZ / 2); scene.add(seabed); fowWorld(seabed.material, "r3d-seabed");

  return {
    ground, water: waterMesh, sea, seabed, heightAt, isWaterAt, sizeX, sizeZ, W, H,
    tileToWorld: (tx, ty, out = new THREE.Vector3()) => { const x = (tx + 0.5) * TILE_M, z = (ty + 0.5) * TILE_M; return out.set(x, heightAt(x, z), z); },
    worldToTile: (x, z) => [Math.floor(x / TILE_M), Math.floor(z / TILE_M)],
    update(t) { wu.uTime.value = t; },
    baseHeightAt,
    /** Fog of war: explored[y][x] truthy = revealed. Pass null to reveal everything. */
    setExplored(ex) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) maskData[(y * W + x) * 4 + 2] = !ex || ex[y]?.[x] ? 255 : 0;
      maskTex.needsUpdate = true;
    },
    /** The circles of vision around the players (world x, z, radius in metres); radius 0 = none. */
    setSeen(i, x, z, r) { fow.uSeen.value[i].set(x, z, r, 1); },
    setFogOfWar(on) { fow.uFow.value = on ? 1 : 0; },
    /** Replace the building pads: [{ x0, z0, x1, z1, y, blend }] in world metres. Rebuilds the ground chunks they touch. */
    setPads(next) {
      const touched = [...pads, ...next].map((p) => ({ x0: p.x0 - p.blend, z0: p.z0 - p.blend, x1: p.x1 + p.blend, z1: p.z1 + p.blend }));
      pads = next.map((p) => ({ blend: 2.5, ...p }));
      for (const g of groundChunks) {
        const c = g.c; if (!touched.some((t) => t.x0 < c.x0 + c.w && t.x1 > c.x0 && t.z0 < c.z0 + c.d && t.z1 > c.z0)) continue;
        g.m.geometry.dispose(); g.m.geometry = chunkGeometry(c, false);
      }
    },
  };
}
