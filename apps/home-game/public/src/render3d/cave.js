// The overworld cave entrance, built from procedural pieces (no asset packs): a mound of noise-displaced boulders around an
// arched mouth, with a hollow tunnel going back into darkness. The mouth faces +z (south), the side the players walk up from.
//   - boulders: icosahedra pushed in and out by value noise, box-projected stone texture, vertex colours for tint, contact
//     shadow near the ground and moss on upward faces; all merged into ONE mesh (one draw call per cave)
//   - arch: a ring of stones along a semicircle plus stacked jamb stones, with a larger keystone on top
//   - tunnel: the arch outline extruded back, drawn from the inside only, fading to black
//   - a dirt patch in front so the entrance reads as a place people walk to
// The template is built once; each cave on the map is a clone (mirrored / scaled per tile) sharing geometry and texture.
import * as THREE from "three";
import { mergeVertices, mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const STONE = "assets3d/textures/stone/stone-rock.png";

// ---- value noise ----
function h3(x, y, z, s) { let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t, c = (i, j, k) => h3(xi + i, yi + j, zi + k, s);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const fbm = (x, y, z, s) => vnoise(x, y, z, s) * 0.6 + vnoise(x * 2.1, y * 2.1, z * 2.1, s + 7) * 0.28 + vnoise(x * 4.3, y * 4.3, z * 4.3, s + 13) * 0.12;

const STONE_TINT = new THREE.Color(0xf0d2ac), DEEP_TINT = new THREE.Color(0x8a7260), MOSS = new THREE.Color(0x8fb04a);
const UV_SCALE = 1 / 2.4;   // one texture repeat per 2.4 m

/** A rock: displaced icosphere with radii (rx,ry,rz), centred at (x,y,z), tilted by rotation (rx,ry,rz Euler). Returns an indexed geometry with position/normal/uv/color. */
function boulder(radii, pos, seed, { rough = 0.55, rot = [0, 0, 0], flatBottom = true } = {}) {
  let g = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute("normal"); g.deleteAttribute("uv");
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = fbm(v.x * 1.7 + seed, v.y * 1.7 + seed * 0.37, v.z * 1.7 - seed, seed);
    const k = 1 + (n - 0.5) * rough;
    p.setXYZ(i, v.x * k * radii[0], v.y * k * radii[1], v.z * k * radii[2]);
  }
  if (flatBottom) for (let i = 0; i < p.count; i++) if (p.getY(i) < -radii[1] * 0.35) p.setY(i, -radii[1] * 0.35);
  g.rotateX(rot[0]); g.rotateY(rot[1]); g.rotateZ(rot[2]); g.translate(pos[0], pos[1], pos[2]);
  g.computeVertexNormals();
  // box-projected uvs and vertex colours (computed after placement so textures line up in world space)
  const nrm = g.attributes.normal, uv = new Float32Array(p.count * 2), col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
    if (ny > nx && ny > nz) { uv[i * 2] = x * UV_SCALE; uv[i * 2 + 1] = z * UV_SCALE; } else if (nx > nz) { uv[i * 2] = z * UV_SCALE; uv[i * 2 + 1] = y * UV_SCALE; } else { uv[i * 2] = x * UV_SCALE; uv[i * 2 + 1] = y * UV_SCALE; }
    const patch = vnoise(x * 3.1, y * 3.1, z * 3.1, 91);
    c.copy(STONE_TINT).multiplyScalar(0.82 + patch * 0.36);
    c.lerp(DEEP_TINT, THREE.MathUtils.clamp((0.55 - y) / 0.9, 0, 1) * 0.65);                         // contact shadow near the ground
    const up = nrm.getY(i); if (up > 0.55 && y > 0.25) c.lerp(MOSS, THREE.MathUtils.clamp((up - 0.55) * 1.6, 0, 1) * (0.25 + patch * 0.55));   // moss on top faces
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

// ---- the arch: mouth radius R, jambs rise JAMB metres before the curve starts ----
const R = 0.72, JAMB = 0.5, MOUTH_Z = 1.05, TUNNEL = 1.7;

function buildMound() {
  const parts = [];
  const add = (...a) => parts.push(boulder(...a));
  // arch ring: stones along the semicircle, each turned to follow it, plus stacked jamb stones
  const ring = R + 0.3, N = 9;
  for (let i = 0; i < N; i++) {
    const th = (i + 0.5) / N * Math.PI, last = i === (N - 1) >> 1;
    const s = last ? 0.5 : 0.34 + (i % 3) * 0.03;
    add([s * 1.15, s * 0.9, 0.42], [Math.cos(th) * ring, JAMB + Math.sin(th) * ring, MOUTH_Z], 10 + i, { rough: 0.4, rot: [0, 0, th - Math.PI / 2 + (i % 2 ? 0.08 : -0.06)], flatBottom: false });
  }
  for (const sx of [-1, 1]) for (let j = 0; j < 3; j++) add([0.34 + j * 0.02, 0.27, 0.42], [sx * ring, 0.08 + j * 0.22, MOUTH_Z], 40 + j + (sx > 0 ? 5 : 0), { rough: 0.35, rot: [0, 0, sx * 0.1], flatBottom: j === 0 });
  // the heap around and above the mouth
  add([1.0, 0.95, 1.0], [-1.25, 0.6, 0.1], 61, { rot: [0, 0.4, 0] });
  add([0.95, 1.0, 1.05], [1.3, 0.65, 0.05], 62, { rot: [0, -0.5, 0] });
  add([1.4, 0.75, 0.85], [0, 1.85, -0.15], 63, { rot: [0.08, 0.1, 0] });
  add([1.7, 1.25, 1.0], [0, 1.05, -0.75], 64, { rot: [0, 0.2, 0] });
  add([0.9, 0.7, 0.8], [-0.65, 1.7, -0.3], 65);
  add([0.8, 0.65, 0.8], [0.7, 1.75, -0.25], 66);
  add([0.5, 0.38, 0.5], [-1.85, 0.2, 0.9], 67); add([0.42, 0.32, 0.46], [1.8, 0.18, 1.0], 68); add([0.38, 0.28, 0.4], [-1.55, 0.14, 1.5], 69); add([0.3, 0.22, 0.34], [1.4, 0.12, 1.65], 70);
  return mergeGeometries(parts, false);
}

/** The hollow tunnel: the arch outline extruded back from the mouth, to be seen from inside only. Vertex colours fade it to black. */
function buildTunnel() {
  const r = R * 0.97, s = new THREE.Shape();
  s.moveTo(-r, 0); s.lineTo(-r, JAMB); s.absarc(0, JAMB, r, Math.PI, 0, true); s.lineTo(r, 0); s.lineTo(-r, 0);
  let g = new THREE.ExtrudeGeometry(s, { depth: TUNNEL, bevelEnabled: false, curveSegments: 14 });
  g.translate(0, 0, -TUNNEL);                       // front cap at z=0, back cap at z=-TUNNEL
  g.translate(0, 0.12, MOUTH_Z + 0.12);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const d = THREE.MathUtils.clamp((MOUTH_Z + 0.12 - p.getZ(i)) / TUNNEL, 0, 1);     // 0 at the mouth, 1 at the far end
    c.setRGB(0.16, 0.12, 0.1).multiplyScalar(Math.pow(1 - d * 1.6 < 0 ? 0 : 1 - d * 1.6, 2.2) * 0.32);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function dirtTexture() {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128; const x = cv.getContext("2d");
  const grd = x.createRadialGradient(64, 64, 6, 64, 64, 62); grd.addColorStop(0, "rgba(96,78,58,0.95)"); grd.addColorStop(0.65, "rgba(110,90,66,0.7)"); grd.addColorStop(1, "rgba(110,90,66,0)");
  x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(${60 + Math.random() * 50},${50 + Math.random() * 40},40,0.25)`; x.beginPath(); x.arc(20 + Math.random() * 88, 20 + Math.random() * 88, 1 + Math.random() * 3, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

let shared = null;
function sharedParts() {
  if (shared) return shared;
  const map = new THREE.TextureLoader().load(STONE); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24).rotateX(-Math.PI / 2).translate(0, 0.16, MOUTH_Z + 0.9), new THREE.MeshBasicMaterial({ map: dirtTexture(), transparent: true, depthWrite: false }));
  const tunnel = new THREE.Mesh(buildTunnel(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  shared = { mound: buildMound(), map, dirtGeo: dirt.geometry, dirtMat: dirt.material, tunnelGeo: tunnel.geometry, tunnelMat: tunnel.material };
  return shared;
}

/**
 * One cave at (x, z) on ground height y. `variant` (0..1) picks mirroring and a little size change.
 * Returns { root, setFade(f), dispose(), occ }.  setFade dithers the rock away (1 = solid) like trees do when they hide a player.
 */
export function createCave(x, y, z, variant = 0) {
  const S = sharedParts();
  const root = new THREE.Group(); root.position.set(x, y - 0.1, z);
  const k = 0.95 + variant * 0.12; root.scale.set((variant > 0.5 ? -1 : 1) * k, k, k);
  const uFade = { value: 1 };
  const rockMat = new THREE.MeshStandardMaterial({ map: S.map, vertexColors: true, roughness: 1, metalness: 0 });
  rockMat.onBeforeCompile = (sh) => {
    sh.uniforms.uFade = uFade;
    // triplanar texture in object space: no stretching on steep faces, and the template is shared so every cave lines up
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vTP; varying vec3 vTN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTP = position; vTN = normal;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uFade; varying vec3 vTP; varying vec3 vTN;")
      .replace("#include <map_fragment>", `{
  vec3 bw = pow(abs(normalize(vTN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  vec4 tx = texture2D(map, vTP.zy * ${UV_SCALE.toFixed(3)}) * bw.x + texture2D(map, vTP.xz * ${UV_SCALE.toFixed(3)}) * bw.y + texture2D(map, vTP.xy * ${UV_SCALE.toFixed(3)}) * bw.z;
  diffuseColor *= tx;
}`)
      .replace("#include <alphatest_fragment>", "{ float b = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (uFade < b) discard; }\n#include <alphatest_fragment>");
  };
  rockMat.customProgramCacheKey = () => "cave-rock-fade";
  const mound = new THREE.Mesh(S.mound, rockMat); mound.castShadow = true; mound.receiveShadow = true;
  const tunnel = new THREE.Mesh(S.tunnelGeo, S.tunnelMat), dirt = new THREE.Mesh(S.dirtGeo, S.dirtMat);
  dirt.renderOrder = 1;
  root.add(mound, tunnel, dirt);
  const fadeBoth = (f) => { uFade.value = f; };
  return {
    root, setFade: fadeBoth,
    dispose() { root.parent?.remove(root); rockMat.dispose(); },          // geometry, texture and the tunnel/dirt materials are shared
    occ: { x, z, y, h: 2.9 * k, r: 2.0 * k, handles: [], fade: 1, onFade: fadeBoth },
  };
}
