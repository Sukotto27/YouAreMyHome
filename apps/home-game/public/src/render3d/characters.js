// Scott & Cristina for the 3D world: the pre-textured Tripo meshes bound to the Quaternius UAL skeleton by
// copying bone weights from the nearest mannequin vertices (ported from characters3d/bodies.js, build 10).
// Rigging runs at load (~2.5 s for Cristina's 248k-vertex mesh); baking it to GLB is a later optimisation (Phase 9).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

const BASE = "characters3d/";
const CHARS = {
  scott: { mesh: "scott_lod.glb", shoe: 0.8 },
  cristina: { mesh: "cristina_lod.glb", thin: 0.9, shoe: 1 },
};

/** Wraps a rigged model with a small animation player. */
function makeActor(name, root, model) {
  const mixer = new THREE.AnimationMixer(model);
  const actor = { name, root, model, mixer, action: null, clip: null, clips: null };
  actor.play = (clipName, { fade = 0.2, speed = 1, once = false, restart = false, from = 0 } = {}) => {
    const clip = actor.clips.get(clipName);
    if (!clip) return false;
    if (actor.clip === clipName && !restart) { if (actor.action) actor.action.timeScale = speed; return true; }
    const next = mixer.clipAction(clip), prev = actor.action;
    next.reset(); next.time = from; next.timeScale = speed;
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); next.clampWhenFinished = once;
    next.fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    actor.action = next; actor.clip = clipName;
    return true;
  };
  return actor;
}

export async function loadCharacters() {
const loader = new GLTFLoader();
const [ual, ual2] = await Promise.all([
  loader.loadAsync(BASE + "assets/chars/UAL1_Standard.glb"), loader.loadAsync(BASE + "assets/chars/UAL2_Clips.glb"),
]);
const clips = new Map([...ual.animations, ...ual2.animations].map((c) => [c.name, c]));
let mqSrc = null;
ual.scene.traverse((o) => { if (o.isSkinnedMesh && !mqSrc) mqSrc = o; });
const mqPos = mqSrc.geometry.attributes.position.array;
const mqSkinIdx = mqSrc.geometry.attributes.skinIndex.array;
const mqSkinW = mqSrc.geometry.attributes.skinWeight.array;

// ---- measuring: where are the shoulders, crotch, chest, hand tips? ---------------------------------
function median(a) { a = [...a].sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 0; }
function measure(pos) {
  const n = pos.length / 3;
  let floor = 1e9, top = -1e9, tip = 0;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1];
    floor = Math.min(floor, y); top = Math.max(top, y); tip = Math.max(tip, Math.abs(x));
  }
  const H = top - floor;
  let sy = 0, sc = 0;
  for (let i = 0; i < n; i++) if (Math.abs(pos[i * 3]) > 0.75 * tip) { sy += pos[i * 3 + 1]; sc++; }
  const armY = sy / sc;
  let wChest = 0; const zs = [];
  for (let i = 0; i < n; i++) {
    const y = pos[i * 3 + 1];
    if (y > armY - 0.115 * H && y < armY - 0.06 * H) { wChest = Math.max(wChest, Math.abs(pos[i * 3])); zs.push(pos[i * 3 + 2]); }
  }
  let crotch = 1e9;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1];
    if (Math.abs(x) < 0.015 * H && y > floor + 0.3 * H) crotch = Math.min(crotch, y);
  }
  return { floor, top, H, tip, armY, wChest, zc: median(zs), crotch };
}
const mqM = measure(mqPos);



// ---- mannequin landmarks: where the wrist and ankle are (from the vertices the skeleton binds to hand/foot) -----
const HAND_LEN = 0.85; // fraction of the generated hand's length kept (fingers were far too long)
const mqBones = mqSrc.skeleton.bones.map((b) => b.name);
const mqLm = (() => {
  const hand = new Set(), foot = new Set();
  mqBones.forEach((n, i) => { if (/^(hand|index|middle|pinky|ring|thumb)_/.test(n)) hand.add(i); if (/^(foot|ball)_/.test(n)) foot.add(i); });
  let wrist = 1e9, ankle = -1e9, footX = 0, footN = 0, footSign = 1;
  const dom = (j) => { let b = 0, bw = -1; for (let s = 0; s < 4; s++) if (mqSkinW[j * 4 + s] > bw) { bw = mqSkinW[j * 4 + s]; b = mqSkinIdx[j * 4 + s]; } return b; };
  for (let j = 0; j < mqPos.length / 3; j++) {
    const b = dom(j);
    if (hand.has(b)) wrist = Math.min(wrist, Math.abs(mqPos[j * 3]));
    if (foot.has(b)) { ankle = Math.max(ankle, mqPos[j * 3 + 1]); if (mqBones[b] === "foot_l") { footX += mqPos[j * 3]; footN++; } }
  }
  if (footN) footSign = Math.sign(footX) || 1;
  return { wrist, ankle, footSign };
})();


// ---- warp the mesh to the mannequin's proportions (so its joints sit where the skeleton's are) ------
function legCentre(pos, m) { // mean |x| of the vertices around mid-thigh = how far apart the legs stand
  let sum = 0, n = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1];
    if (y > m.floor + 0.25 * m.H && y < m.floor + 0.35 * m.H) { sum += Math.abs(pos[i]); n++; }
  }
  return sum / n;
}
function warpToMannequin(pos, thin = 1, shoe = 1) {
  const m = measure(pos), q = mqM, out = new Float32Array(pos.length);
  const lcM = legCentre(pos, m), lcQ = legCentre(mqPos, q); // how far apart each leg stands on the mesh vs the skeleton
  const ys = [m.floor, m.crotch, m.armY, m.top], yt = [q.floor, q.crotch, q.armY, q.top];
  const sx = q.wChest / m.wChest * thin, zs = q.H / m.H, zt = thin;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    let k = 0; while (k < 2 && y > ys[k + 1]) k++;
    out[i + 1] = yt[k] + (y - ys[k]) * (yt[k + 1] - yt[k]) / (ys[k + 1] - ys[k]);
    const s = Math.abs(x);
    const hip = Math.min(1, Math.max(0, (y - m.crotch) / (0.1 * m.H))); // legs follow the skeleton's spacing, easing out at the hips
    const lw = y < m.crotch ? 1 : 1 - hip;
    // each leg's centre moves to the skeleton's stance, but its thickness keeps the body scale (a plain ratio made the legs skinny)
    const body = s * sx + lw * (Math.max(lcQ + (s - lcM) * sx, 0.01) - s * sx);
    // only the arms (at shoulder height) are stretched out to the skeleton's reach; legs and hips wider than the chest just scale
    const arm = Math.min(1, Math.max(0, (y - (m.armY - 0.13 * m.H)) / (0.05 * m.H)));
    const sw = s <= m.wChest || arm === 0 ? body : body + arm * (q.wChest * thin + (s - m.wChest) * (q.tip - q.wChest * thin) / (m.tip - m.wChest) - body);
    let ox = sw;
    if (ox > mqLm.wrist) ox = mqLm.wrist + (ox - mqLm.wrist) * HAND_LEN; // shorter hands
    out[i] = Math.sign(x) * ox;
    out[i + 2] = (z - m.zc) * zs * zt + q.zc;
  }
  if (shoe !== 1) { // narrower shoes: squeeze each foot toward its own centre line, easing out above the ankle
    const top = q.floor + 1.1 * (mqLm.ankle - q.floor), cx = [0, 0], cn = [0, 0];
    for (let i = 0; i < out.length; i += 3) if (out[i + 1] < top) { const k = out[i] > 0 ? 1 : 0; cx[k] += out[i]; cn[k]++; }
    for (let i = 0; i < out.length; i += 3) if (out[i + 1] < top) {
      const k = out[i] > 0 ? 1 : 0, c = cx[k] / (cn[k] || 1), e = Math.max(0, (out[i + 1] - q.floor) / (top - q.floor));
      const f = shoe + (1 - shoe) * e * e;
      out[i] = c + (out[i] - c) * f;
    }
  }
  return { out, m };
}

// ---- copy bone weights from the nearest mannequin vertices -----------------------------------------
const CELL = 0.06, cellKey = (x, y, z) => ((Math.floor(x / CELL) + 64) << 16) | ((Math.floor(y / CELL) + 64) << 8) | (Math.floor(z / CELL) + 64);
const grid = new Map();
for (let i = 0; i < mqPos.length / 3; i++) {
  const k = cellKey(mqPos[i * 3], mqPos[i * 3 + 1], mqPos[i * 3 + 2]);
  (grid.get(k) || grid.set(k, []).get(k)).push(i);
}
function transferWeights(pos) {
  const n = pos.length / 3, K = 6;
  const idx = new Uint16Array(n * 4), wt = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL);
    let cand = [];
    for (let r = 1; r <= 6 && cand.length < K; r++) {
      cand = [];
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
        const list = grid.get(((cx + a + 64) << 16) | ((cy + b + 64) << 8) | (cz + c + 64));
        if (list) cand.push(...list);
      }
    }
    const scored = cand.map((j) => {
      const dx = mqPos[j * 3] - x, dy = mqPos[j * 3 + 1] - y, dz = mqPos[j * 3 + 2] - z;
      return [dx * dx + dy * dy + dz * dz, j];
    }).sort((a, b) => a[0] - b[0]).slice(0, K);
    const acc = new Map();
    for (const [d2, j] of scored) {
      const w = 1 / (d2 + 1e-5);
      for (let s = 0; s < 4; s++) {
        const sw = mqSkinW[j * 4 + s];
        if (sw > 0) acc.set(mqSkinIdx[j * 4 + s], (acc.get(mqSkinIdx[j * 4 + s]) || 0) + w * sw);
      }
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = top.reduce((s, e) => s + e[1], 0) || 1;
    top.forEach(([bone, w], s) => { idx[v * 4 + s] = bone; wt[v * 4 + s] = w / total; });
  }
  return { idx, wt };
}

// ---- clean up the copied weights ---------------------------------------------------------------------
// The generated meshes have fists and shoes, so finger/toe bones only tear them: bind those rigidly to the hand/foot.
// Then relax the weights over the mesh (welded at UV seams) so joints like the knee blend smoothly instead of jaggedly.
const boneNames = mqSrc.skeleton.bones.map((b) => b.name);
const NB = boneNames.length;
const rigid = boneNames.map((n, i) => {
  const side = n.endsWith("_l") ? "_l" : n.endsWith("_r") ? "_r" : null;
  if (side && /^(index|middle|pinky|ring|thumb)_/.test(n)) return boneNames.indexOf("hand" + side);
  if (side && /^ball/.test(n)) return boneNames.indexOf("foot" + side);
  return i;
});
function smoothWeights(pos, index, idx, wt, iters = 4) {
  const n = pos.length / 3, Q = 1e4;
  const ids = new Map(), rep = new Uint32Array(n);
  for (let v = 0; v < n; v++) {
    const k = Math.round(pos[v * 3] * Q) + "," + Math.round(pos[v * 3 + 1] * Q) + "," + Math.round(pos[v * 3 + 2] * Q);
    let r = ids.get(k); if (r === undefined) { r = ids.size; ids.set(k, r); }
    rep[v] = r;
  }
  const R = ids.size;
  let cur = new Float32Array(R * NB);
  for (let v = 0; v < n; v++) for (let s = 0; s < 4; s++) if (wt[v * 4 + s] > 0) cur[rep[v] * NB + rigid[idx[v * 4 + s]]] += wt[v * 4 + s];
  const deg = new Uint32Array(R + 1), edges = [];
  for (let t = 0; t < index.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = rep[index[t + e]], b = rep[index[t + (e + 1) % 3]];
    if (a !== b) { edges.push(a, b); deg[a]++; deg[b]++; }
  }
  const start = new Uint32Array(R + 1);
  for (let r = 0; r < R; r++) start[r + 1] = start[r] + deg[r];
  const fill = start.slice(0, R), adj = new Uint32Array(start[R]);
  for (let e = 0; e < edges.length; e += 2) { adj[fill[edges[e]]++] = edges[e + 1]; adj[fill[edges[e + 1]]++] = edges[e]; }
  let nxt = new Float32Array(R * NB);
  for (let it = 0; it < iters; it++) {
    for (let r = 0; r < R; r++) {
      const c = start[r + 1] - start[r], o = r * NB;
      if (!c) { for (let b = 0; b < NB; b++) nxt[o + b] = cur[o + b]; continue; }
      for (let b = 0; b < NB; b++) nxt[o + b] = 0.5 * cur[o + b];
      const f = 0.5 / c;
      for (let k = start[r]; k < start[r + 1]; k++) { const q = adj[k] * NB; for (let b = 0; b < NB; b++) nxt[o + b] += f * cur[q + b]; }
    }
    [cur, nxt] = [nxt, cur];
  }
  for (let v = 0; v < n; v++) {
    const o = rep[v] * NB, top = [];
    for (let b = 0; b < NB; b++) if (cur[o + b] > 1e-4) top.push([b, cur[o + b]]);
    top.sort((a, b) => b[1] - a[1]); top.length = Math.min(4, top.length);
    const total = top.reduce((a, e) => a + e[1], 0) || 1;
    for (let s = 0; s < 4; s++) { idx[v * 4 + s] = top[s] ? top[s][0] : 0; wt[v * 4 + s] = top[s] ? top[s][1] / total : 0; }
  }
}

// Everything below the ankle follows the foot bone alone (shoes don't bend), blending into the calf just above it.
function pinFeet(pos, idx, wt) {
  const yFull = mqM.floor + 0.8 * (mqLm.ankle - mqM.floor), yEnd = mqM.floor + 1.3 * (mqLm.ankle - mqM.floor);
  const footBone = [boneNames.indexOf("foot_l"), boneNames.indexOf("foot_r")];
  for (let v = 0; v < pos.length / 3; v++) {
    const y = pos[v * 3 + 1];
    if (y >= yEnd) continue;
    let t = Math.min(1, Math.max(0, (y - yFull) / (yEnd - yFull))); t = t * t * (3 - 2 * t);
    const fb = footBone[(pos[v * 3] * mqLm.footSign > 0) ? 0 : 1];
    const acc = new Map([[fb, 1 - t]]);
    for (let s = 0; s < 4; s++) if (wt[v * 4 + s] > 0) acc.set(idx[v * 4 + s], (acc.get(idx[v * 4 + s]) || 0) + t * wt[v * 4 + s]);
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), total = top.reduce((a, e) => a + e[1], 0) || 1;
    for (let s = 0; s < 4; s++) { idx[v * 4 + s] = top[s] ? top[s][0] : 0; wt[v * 4 + s] = top[s] ? top[s][1] / total : 0; }
  }
}


// ---- build one character -------------------------------------------------------------------------
async function buildCharacter(name, def) {
  const gltf = await loader.loadAsync(BASE + def.mesh);
  let src = null; gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
  const geo0 = src.geometry;
  // optimised GLBs can store attributes interleaved; .array would then be the whole mixed buffer, so copy out plain arrays
  const plain = (a) => { if (!a.isInterleavedBufferAttribute) return a; const out = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k); return new THREE.BufferAttribute(out, a.itemSize); };
  const posA = plain(geo0.attributes.position), nrmA = plain(geo0.attributes.normal), uvA = plain(geo0.attributes.uv);
  const pos0 = posA.array, index = geo0.index.array;

  const t0 = performance.now();
  const { out: pos1, m: mm } = warpToMannequin(pos0, def.thin, def.shoe);
  const { idx, wt } = transferWeights(pos1);
  smoothWeights(pos1, index, idx, wt);
  pinFeet(pos1, idx, wt);
  console.log('[chars]', name, 'rigged in', Math.round(performance.now() - t0), 'ms');

  // the meshes ship pre-textured (UVs + baked colour map), so keep their own material and UVs
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos1, 3));
  g.setAttribute("normal", nrmA);
  g.setAttribute("uv", uvA);
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(wt, 4));
  g.setIndex(new THREE.BufferAttribute(Uint32Array.from(index), 1));
  const mat = src.material;
  mat.metalness = 0;
  if (mat.map) mat.map.anisotropy = 8;

  const root = new THREE.Group();
  const model = cloneSkinned(ual.scene);
  let mq = null;
  model.traverse((o) => { if (o.isSkinnedMesh) { mq ||= o; o.visible = false; } });
  const body = new THREE.SkinnedMesh(g, mat);
  body.castShadow = true;
  body.frustumCulled = false;
  mq.parent.add(body);
  body.bind(mq.skeleton, mq.bindMatrix);
  root.add(model);
  return makeActor(name, root, model);
}

  const actors = {};
  for (const [name, def] of Object.entries(CHARS)) { actors[name] = await buildCharacter(name, def); actors[name].clips = clips; }
  return { actors, clips };
}
