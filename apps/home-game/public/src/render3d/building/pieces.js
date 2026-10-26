// Extra piece definitions registered into City Builder's piece registry (PIECE_DEFS), so a generated structure can
// use timber of any length (a rafter that is exactly as long as its slope, a gable course that is exactly as wide as
// the roof above it) and the open-doorway wall. They are built from the same geometry builders and materials as the
// stock pieces, and look the same.
import * as THREE from "three";
import * as CB from "./cb.js";

export const GU = CB.GRID_UNIT;            // 2 m: one tile
export const LOG_R = 0.15;                 // City Builder's log radius
export const WALL_PANEL_H = 2.2;           // City Builder's wall module height
export const STONE_H = 0.28;               // height of one foundation stone (createStoneGeometry(0.4, 0.28, 0.4))

const have = new Set(CB.PIECE_DEFS.map((d) => d.id));
function register(def) { if (!have.has(def.id)) { CB.PIECE_DEFS.push(def); have.add(def.id); } return def.id; }
const L = (len) => len.toFixed(2);
const endConnectors = (len) => [{ position: new THREE.Vector3(-len / 2, 0, 0), direction: new THREE.Vector3(-1, 0, 0) }, { position: new THREE.Vector3(len / 2, 0, 0), direction: new THREE.Vector3(1, 0, 0) }];

/** A log of any length (role: "gable" courses, "plate" eave plates, "rafter"). Material and look are the stock Log's. */
export function logOfLength(role, length, radius = LOG_R) {
  const base = CB.getPieceDef("log"), id = `${role}-log@${L(length)}/${radius}`;
  if (have.has(id)) return id;
  return register({ ...base, id, label: `${role} log`, length, connectors: endConnectors(length), createGeometry: (v = 0) => CB.createRusticLogGeometry(length, radius, { seed: v, nubs: false, radialSegments: 8 }) });
}

/** A hewn beam of any length (ridge beams). Material is the stock Ridge Beam's. */
export function beamOfLength(length, size = 0.22) {
  const base = CB.getPieceDef("ridge-beam"), id = `ridge-beam@${L(length)}/${size}`;
  if (have.has(id)) return id;
  return register({ ...base, id, label: "Ridge beam", length, connectors: endConnectors(length), createGeometry: (v = 0) => CB.bowAlongX(new THREE.BoxGeometry(length, size, size, Math.max(2, Math.round(length * 3)), 1, 1), length, v + 11, 0.004) });
}

/** The same wall piece without its two corner posts (the generator stands one shared post at each corner / junction instead). */
export function wallNoPosts(baseId) {
  const id = baseId + "@np"; if (have.has(id)) return id;
  const base = CB.getPieceDef(baseId);
  return register({ ...base, id, createGeometry: (v = 0) => CB.withoutWallPosts(() => base.createGeometry(v)) });
}

/** One wall post: a vertical log as tall as a wall panel, centred on its own middle. */
export function wallPostId() {
  const base = CB.getPieceDef("log"), id = "log-wall-post";
  if (have.has(id)) return id;
  return register({ ...base, id, label: "Wall post", length: WALL_PANEL_H, connectors: [], createGeometry: (v = 0) => { const g = CB.createRusticLogGeometry(WALL_PANEL_H, LOG_R, { seed: v * 13 + 97, nubs: false }); g.rotateZ(Math.PI / 2); return g; } });
}

/** A log wall with an open doorway and no door in it (an arch). */
export function archWallId() {
  const base = CB.getPieceDef("log-wall"), id = "log-wall-arch";
  if (have.has(id)) return id;
  const opening = { width: 1, height: 1.8, sill: 0 };
  return register({ ...base, id, label: "Log Wall (Archway)", createGeometry: (v = 0) => CB.createLogWallGeometry(GU, WALL_PANEL_H, LOG_R, opening, v) });
}
