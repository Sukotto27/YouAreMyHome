// Instanced props: models are merged to one geometry per material ("parts"), then every placement of a model
// shares them through InstancedMeshes. Each placement gets a handle so it can be hidden/shown/moved later
// (a harvested tree, a picked-up stick) and mapped back from a raycast hit to the game object it stands for.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { loadAny } from "./loaders.js";

const KEEP = ["position", "normal", "uv"];
const CHUNK = 24;   // metres per spatial chunk of instances


/** [[geometry, material], ...] — one entry per material group of a mesh (or just the mesh when it has one material). */
function splitByMaterial(g, mats) {
  if (mats.length <= 1 || !g.groups.length) return [[g, mats[0]]];
  const out = [];
  for (const grp of g.groups) {
    const sub = new THREE.BufferGeometry();
    if (g.index) {
      for (const name of Object.keys(g.attributes)) sub.setAttribute(name, g.attributes[name]);
      sub.setIndex(Array.from(g.index.array.slice(grp.start, grp.start + grp.count)));
    } else {
      for (const [name, a] of Object.entries(g.attributes)) sub.setAttribute(name, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize));
    }
    out.push([sub, mats[grp.materialIndex]]);
  }
  return out;
}

/**
 * Loads a model and flattens it into `parts` = [{ geometry, material }] (one per material), baked into world
 * space, scaled, with its base at y = 0 and centred on x/z.
 *   scale   uniform multiplier (the source file's units are usually cm or m — pass 0.01 for cm)
 *   height  alternatively: scale so the model is this tall (metres); or footprint: its largest horizontal extent
 *   sink    metres to push it into the ground (trunks, rocks)
 *   material  replace the source material(s) with this one
 */
export async function loadParts(url, { node, scale = 1, height, footprint, sink = 0, material } = {}) {
  const root = await loadAny(url, { node });
  root.updateMatrixWorld(true);
  const groups = new Map(); // material -> geometries
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const a of Object.keys(g.attributes)) if (!KEEP.includes(a)) g.deleteAttribute(a);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const [geo, mat] of splitByMaterial(g, mats)) {
      const key = material || mat;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(geo.index ? geo.toNonIndexed() : geo);
    }
  });
  const parts = [];
  for (const [mat, geos] of groups) parts.push({ geometry: geos.length > 1 ? mergeGeometries(geos) : geos[0], material: mat });
  // normalise: base at y=0, centred, scaled
  const box = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = height ? height / (size.y || 1) : footprint ? footprint / (Math.max(size.x, size.z) || 1) : scale;
  for (const p of parts) {
    p.geometry.translate(-c.x, -box.min.y - sink / k, -c.z);
    p.geometry.scale(k, k, k);
  }
  return { parts, size: size.multiplyScalar(k) };
}

export class InstanceSet {
  /**
   * Per model key: one InstancedMesh per material part, with spare capacity. add()/spawn() place an instance
   * (spawn after build() grows the meshes when needed), remove() frees its slot for reuse.
   */
  constructor(scene, { castShadow = true, receiveShadow = false, auto = false, fade = false } = {}) {
    this.fade = fade;   // per-instance fade value (dithered cut-out): trees fade when they hide a player
    this.scene = scene; this.castShadow = castShadow; this.receiveShadow = receiveShadow; this.auto = auto; // auto: create meshes on first add (no build() call needed)
    this.group = new THREE.Group(); scene.add(this.group);
    this.recs = new Map();   // key -> { model, items, free, meshes, capacity }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._up = new THREE.Vector3(0, 1, 0);
    this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
  }
  /** Place an instance. Returns a handle { x, y, z, yaw, sx, sy, sz, meta, visible }. */
  add(key, model, x, y, z, { yaw = 0, scale = 1, sx, sy, sz, meta } = {}) {
    const rkey = key + "@" + Math.floor(x / CHUNK) + "," + Math.floor(z / CHUNK);   // one record per model per ~24 m chunk, so whole chunks can be culled
    let rec = this.recs.get(rkey);
    if (!rec) this.recs.set(rkey, (rec = { model, items: [], free: [], meshes: null, capacity: 0, dirty: false }));
    const h = { rec, key, i: -1, x, y, z, yaw, sx: sx ?? scale, sy: sy ?? scale, sz: sz ?? scale, visible: true, meta, removed: false };
    h.i = rec.free.length ? rec.free.pop() : rec.items.length;
    rec.items[h.i] = h;
    if (rec.meshes) { if (rec.items.length > rec.capacity) this._build(rec); else this._writeAll(h); }
    else if (this.auto) this._build(rec);
    return h;
  }
  spawn(...args) { return this.add(...args); }
  build() { for (const rec of this.recs.values()) if (!rec.meshes) this._build(rec); }
  _build(rec) { // (re)create the meshes with headroom, preserving every live instance
    for (const mesh of rec.meshes || []) { this.group.remove(mesh); mesh.dispose(); }
    rec.capacity = Math.max(8, Math.ceil(rec.items.length * 1.35) + 4);
    rec.meshes = rec.model.parts.map((part) => {
      let geo = part.geometry;
      if (this.fade) { geo = geo.clone(); geo.setAttribute("aFade", new THREE.InstancedBufferAttribute(new Float32Array(rec.capacity).fill(1), 1)); }
      const mesh = new THREE.InstancedMesh(geo, part.material, rec.capacity);
      mesh.castShadow = this.castShadow; mesh.receiveShadow = this.receiveShadow; mesh.count = rec.items.length;
      mesh.frustumCulled = true; mesh.name = rec.items[0]?.key || "";
      this.group.add(mesh); return mesh;
    });
    for (const h of rec.items) if (h) for (const mesh of rec.meshes) this._write(mesh, h);
    for (const mesh of rec.meshes) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
  }
  _write(mesh, h) {
    const v = h.visible && !h.removed ? 1 : 0;
    this._q.setFromAxisAngle(this._up, h.yaw);
    this._m.compose(this._p.set(h.x, h.y, h.z), this._q, this._s.set(h.sx * v, h.sy * v, h.sz * v));
    mesh.setMatrixAt(h.i, this._m);
    const f = mesh.geometry.attributes.aFade; if (f) { f.array[h.i] = h.fade ?? 1; f.needsUpdate = true; }
  }
  _writeAll(h) {
    const rec = h.rec;
    for (const mesh of rec.meshes) { mesh.count = Math.max(mesh.count, rec.items.length); this._write(mesh, h); mesh.instanceMatrix.needsUpdate = true; }
    rec.dirty = true;
  }
  update(h) { if (h.rec.meshes && !h.removed) this._writeAll(h); }
  setFade(h, f) { if (h.fade !== f) { h.fade = f; this.update(h); } }
  setVisible(h, v) { if (h.visible !== v) { h.visible = v; this.update(h); } }
  remove(h) {
    if (h.removed) return; h.removed = true; h.rec.dirty = true;
    if (h.rec.meshes) for (const mesh of h.rec.meshes) { this._write(mesh, h); mesh.instanceMatrix.needsUpdate = true; }
    h.rec.free.push(h.i);
  }
  /** Per frame: refresh bounds of chunks that changed, and hide chunks beyond `maxDist` of the camera (fog hides them anyway). */
  cull(camPos, maxDist) {
    for (const rec of this.recs.values()) {
      if (!rec.meshes) continue;
      if (rec.dirty) { for (const mesh of rec.meshes) mesh.computeBoundingSphere(); rec.dirty = false; }
      const s = rec.meshes[0].boundingSphere; if (!s) continue;
      const vis = camPos.distanceTo(s.center) - s.radius < maxDist;
      for (const mesh of rec.meshes) mesh.visible = vis;
    }
  }
}
