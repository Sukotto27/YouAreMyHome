// What building costs: the materials of the components themselves. Same method as City Builder's BuildingCost: each piece's
// real geometry volume x a units-per-m3 rate for its material, summed per material and rounded up once at the end (so lots
// of small pieces don't each cost a whole unit). You only pay for pieces that actually get built: a wall shared with an
// existing room is not built again, an opening costs the difference over a plain wall, and merged roofs cost only the
// surface that is left after overlaps are removed.
//
// Materials map onto the game's items: raw timber -> wood, milled lumber -> plank, quarried stone -> stone
// (clay, brick and lime have no item yet and count as stone).
import * as THREE from "three";
import * as CB from "./cb.js";
import { buildWalls, ownedEdges } from "./model.js";
import { roomPieces, wallPieceId } from "./generate.js";
import { roofSurfaceGeometry, roofTimber } from "./roof.js";

/** Units of material per m3 of geometry (City Builder's rates; tune here). */
export const UNITS_PER_M3 = { wood: 2.2, pole: 34, plank: 3, stone: 3, clay: 5, brick: 4, lime: 4, earth: 0 };
const ITEM_OF = { wood: "wood", pole: "wood", plank: "plank", stone: "stone", clay: "stone", brick: "stone", lime: "stone", earth: null };
export const COST_ITEMS = ["wood", "plank", "stone", "fiber", "cloth", "metal_scrap", "electronic_scrap", "glass"];
const THATCH_THICKNESS = 0.08;       // the roof covering counts as a 8 cm slab of thatch/timber, like City Builder's roof panels

/** Volume enclosed by a closed triangle mesh (signed tetrahedra). */
export function geometryVolume(geometry) {
  const pos = geometry.getAttribute("position"), idx = geometry.getIndex(), n = (idx ? idx.count : pos.count) / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); let v = 0;
  for (let t = 0; t < n; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2); v += a.dot(b.cross(c)) / 6;
  }
  return Math.abs(v);
}

const stats = new Map();
function pieceStats(defId) {
  if (!stats.has(defId)) {
    const def = CB.getPieceDef(defId), g = def.createGeometry();
    const volume = geometryVolume(def.costGeometry ? def.costGeometry() : g); g.dispose();
    stats.set(defId, { volume, material: def.material });
  }
  return stats.get(defId);
}

/** Raw (unrounded) material volumes -> { wood, plank, stone } as fractional units. */
function unitsOf(pieces, into = {}) {
  for (const p of pieces) { const s = pieceStats(p.defId), item = ITEM_OF[s.material]; if (item) into[item] = (into[item] || 0) + s.volume * UNITS_PER_M3[s.material]; }
  return into;
}
const sub = (a, b) => { const out = {}; for (const k of COST_ITEMS) { const d = (a[k] || 0) - (b[k] || 0); if (d > 1e-9) out[k] = d; } return out; };
const ceil = (u) => { const out = {}; for (const k of COST_ITEMS) if (u[k] > 1e-9) out[k] = Math.ceil(u[k] - 1e-9); return out; };

/** Materials for a new room (given the structure it joins, so shared walls aren't paid for twice). */
export function roomCost(structure, room, y0) {
  const walls = buildWalls({ [structure.id]: structure });
  return ceil(unitsOf(roomPieces(room, ownedEdges(walls, room.id), y0)));
}

/** Volume of the triangles of one material group of a merged geometry. */
function groupVolume(g, grp) {
  const sub = new THREE.BufferGeometry(), pos = g.attributes.position;
  if (g.index) { sub.setAttribute("position", pos); sub.setIndex(Array.from(g.index.array.slice(grp.start, grp.start + grp.count))); }
  else sub.setAttribute("position", new THREE.BufferAttribute(pos.array.slice(grp.start * 3, (grp.start + grp.count) * 3), 3));
  const v = geometryVolume(sub); sub.dispose(); return v;
}

/**
 * What a door or window costs: the fittings you add (the door boards, the window frame and shutters), not the logs left
 * out of the wall to make room for them. An archway is just an opening: free.
 */
export function openingCost(kind) {
  if (kind !== "door" && kind !== "window") return {};
  const def = CB.getPieceDef(wallPieceId({ kind })), g = def.createGeometry(); let units = 0;
  const mats = def.createMaterial(), n = Array.isArray(mats) ? mats.length : 1; void n;
  for (const grp of g.groups.filter((x) => x.materialIndex >= 1)) units += groupVolume(g, grp) * UNITS_PER_M3.plank;
  g.dispose();
  return ceil({ plank: units });
}

/** Materials for the roof structure (covering + timber) of a set of roofs. */
function roofUnits(roofs, walls, y0) {
  if (!roofs.length) return {};
  const u = unitsOf(roofTimber(roofs, walls, y0));
  const g = roofSurfaceGeometry(roofs, y0); let area = 0;
  if (g) { const p = g.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(); for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); n.crossVectors(b.clone().sub(a), c.clone().sub(a)); if (Math.abs(n.y) > 1e-6 && Math.abs(n.y) / n.length() > 0.5) area += n.length() / 2; } g.dispose(); }
  u.wood = (u.wood || 0) + area * THATCH_THICKNESS * UNITS_PER_M3.wood;
  return u;
}

/** What adding `roof` to a structure costs: the roof work with it, minus the roof work without it (overlaps cost nothing). */
export function roofCost(structure, roof) {
  const walls = buildWalls({ [structure.id]: structure }), y0 = structure.floorY ?? 0;
  return ceil(sub(roofUnits([...structure.roofs, roof], walls, y0), roofUnits(structure.roofs, walls, y0)));
}

export const costText = (c) => COST_ITEMS.filter((k) => c[k]).map((k) => `${c[k]} ${k}`).join(", ") || "free";
