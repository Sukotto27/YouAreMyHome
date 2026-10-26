// Draws structures: City Builder pieces -> one merged mesh per material, with paint applied. Rooms are built (and
// rebuilt) one at a time, each with its own seed so adding a room never changes how its neighbour looks; a
// structure's roofs are rebuilt together because the roof surface is a union.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as CB from "./cb.js";
import { buildWalls, ownedEdges, roomSignature, postsOf } from "./model.js";
import { roomPieces } from "./generate.js";
import { roofSurfaceGeometry, roofTimber } from "./roof.js";
import { roleOf, painted } from "./paint.js";

const KEEP = ["position", "normal", "uv"];
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

function splitByMaterial(g, mats) {
  if (mats.length <= 1 || !g.groups.length) return [[g, 0]];
  const out = [];
  for (const grp of g.groups) {
    const sub = new THREE.BufferGeometry();
    if (g.index) { for (const n of Object.keys(g.attributes)) sub.setAttribute(n, g.attributes[n]); sub.setIndex(Array.from(g.index.array.slice(grp.start, grp.start + grp.count))); }
    else for (const [n, a] of Object.entries(g.attributes)) sub.setAttribute(n, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize));
    out.push([sub, grp.materialIndex]);
  }
  return out;
}

/** Bake a group of piece meshes into one mesh per (painted) material. `override` = a single material for everything (ghosts). */
export function bakeGroup(group, paint, override = null) {
  group.updateMatrixWorld(true);
  const buckets = new Map(), out = new THREE.Group();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const defId = o.userData.defId || "", mats = Array.isArray(o.material) ? o.material : [o.material];
    const g0 = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const [g, mi] of splitByMaterial(g0, mats)) {
      for (const n of Object.keys(g.attributes)) if (!KEEP.includes(n)) g.deleteAttribute(n);
      const ng = g.index ? g.toNonIndexed() : g;
      if (!ng.attributes.normal) ng.computeVertexNormals();
      if (!ng.attributes.uv) ng.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
      const base = mats[mi] || mats[0], mat = override || painted(base, roleOf(defId, mi, mats.length), paint);
      if (!buckets.has(mat)) buckets.set(mat, []);
      buckets.get(mat).push(ng);
    }
  });
  for (const [mat, geos] of buckets) {
    const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat); m.castShadow = true; m.receiveShadow = true; out.add(m);
  }
  return out;
}

let _roofBase = null;
const roofBaseMaterial = () => (_roofBase ||= (() => { const m = CB.getPieceDef("hay-roof").createMaterial(); m.side = THREE.DoubleSide; return m; })());

/** Render data for one room (a Group of merged meshes). */
export function buildRoomGroup(room, walls, y0, paint, ghostMaterial = null) {
  const data = { name: room.id, pieces: roomPieces(room, ownedEdges(walls, room.id), y0, postsOf(walls, room.id)) };
  const { group } = CB.buildStructureMeshes(data, { seed: hashStr(room.id), plain: !!ghostMaterial, material: ghostMaterial || undefined });
  return bakeGroup(group, paint, ghostMaterial);
}

/** The roofs of one structure: covering + timber. */
export function buildRoofGroup(roofs, walls, y0, paint, ghostMaterial = null) {
  const out = new THREE.Group();
  if (!roofs.length) return out;
  const surf = roofSurfaceGeometry(roofs, y0);
  if (surf) {
    const base = ghostMaterial || painted(roofBaseMaterial(), "roof", paint), m = new THREE.Mesh(surf, base);
    m.castShadow = true; m.receiveShadow = true; m.userData.isRoofCover = true; out.add(m);
  }
  const data = { name: "roof", pieces: roofTimber(roofs, walls, y0) };
  const { group } = CB.buildStructureMeshes(data, { seed: hashStr(roofs.map((r) => r.id).join()), plain: true, material: ghostMaterial || undefined });
  out.add(bakeGroup(group, paint, ghostMaterial));
  return out;
}

const dispose = (g) => g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });

/** Keeps the 3D view of every structure in step with `world.structures`. */
export class BuildingRenderer {
  constructor(scene) { this.scene = scene; this.root = new THREE.Group(); this.root.name = "buildings"; scene.add(this.root); this.items = new Map(); /* structureId -> { rooms: Map, roof, roofSig, group } */ this.roofAlpha = new Map(); }

  sync(structures) {
    const live = new Set(Object.keys(structures || {}));
    for (const [id, it] of this.items) if (!live.has(id)) { dispose(it.group); this.root.remove(it.group); this.items.delete(id); }
    for (const s of Object.values(structures || {})) {
      let it = this.items.get(s.id);
      if (!it) { it = { group: new THREE.Group(), rooms: new Map(), roof: null, roofSig: "" }; it.group.name = s.id; this.root.add(it.group); this.items.set(s.id, it); }
      if (it.v === s.v && it.y0 === (s.floorY ?? 0)) continue;
      it.v = s.v; it.y0 = s.floorY ?? 0;
      const y0 = s.floorY ?? 0, walls = buildWalls({ [s.id]: s }), paintSig = JSON.stringify(s.paint || {});
      // rooms
      const ids = new Set();
      for (const r of s.rooms) {
        ids.add(r.id);
        const sig = roomSignature(walls, r, s.paint) + `|${y0}`, cur = it.rooms.get(r.id);
        if (cur && cur.sig === sig) continue;
        if (cur) { dispose(cur.group); it.group.remove(cur.group); }
        const g = buildRoomGroup(r, walls, y0, s.paint); g.name = r.id; it.group.add(g); it.rooms.set(r.id, { sig, group: g });
      }
      for (const [rid, cur] of it.rooms) if (!ids.has(rid)) { dispose(cur.group); it.group.remove(cur.group); it.rooms.delete(rid); }
      // roofs (depend on the walls too: gable fills sit on wall tops)
      const roofSig = JSON.stringify(s.roofs) + "|" + [...walls.edges.keys()].sort().join(",") + "|" + paintSig + `|${y0}`;
      if (roofSig !== it.roofSig) {
        if (it.roof) { dispose(it.roof); it.group.remove(it.roof); }
        it.roof = buildRoofGroup(s.roofs, walls, y0, s.paint); it.roof.name = "roof";
        it.roof.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); }); it.group.add(it.roof); it.roofSig = roofSig;
        const keep = this.roofAlpha.get(s.id); if (keep !== undefined && keep < 0.999) this.setRoofAlpha(s.id, keep);   // a rebuilt roof keeps its current fade
        // (own materials, so this roof can fade alone)
      }
    }
  }

  /** Fade a structure's roof covering (1 = solid, 0 = gone), e.g. while someone is inside. */
  setRoofAlpha(structureId, a) {
    this.roofAlpha.set(structureId, a);
    const it = this.items.get(structureId); if (!it?.roof) return;
    it.roof.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { m.transparent = a < 0.999; m.opacity = a; m.depthWrite = a > 0.5; }
      o.visible = a > 0.02;
    });
  }
}
