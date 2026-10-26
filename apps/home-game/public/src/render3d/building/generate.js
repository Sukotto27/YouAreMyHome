// Turns building data into City Builder pieces. A room becomes a list of individual components, in City Builder's own
// SerializedStructure format ({ defId, position, quaternion }), exactly like its hand-authored huts:
//   foundation  a course of foundation stones under every wall, with a stone at each wall corner
//   floor       split logs, flat face up, laid across every interior tile
//   walls       log-wall modules (with their built-in corner posts) on every tile edge; door / window / archway variants
// The roof is generated separately (roof.js).
import * as THREE from "three";
import { GU, STONE_H, WALL_PANEL_H, archWallId, wallNoPosts, wallPostId } from "./pieces.js";

const rad = (d) => (d * Math.PI) / 180;
const r3 = (n) => Math.round(n * 1000) / 1000;
export function quat(yaw = 0, pitch = 0, roll = 0) { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(pitch), rad(yaw), rad(roll), "YXZ")); return [r3(q.x), r3(q.y), r3(q.z), r3(q.w)]; }
/** Quaternion turning local +X into the direction (dx, dy, dz). */
export function quatAlong(dx, dy, dz) { const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(dx, dy, dz).normalize()); return [r3(q.x), r3(q.y), r3(q.z), r3(q.w)]; }
export const piece = (defId, x, y, z, rot = {}) => ({ defId, position: [r3(x), r3(y), r3(z)], quaternion: Array.isArray(rot) ? rot : quat(rot.yaw, rot.pitch, rot.roll) });

export const FLOOR_TOP = 0.02;                 // the floor logs are bedded into the levelled ground, their flat faces just proud of it
export const WALL_BASE = STONE_H;              // walls stand on the foundation stones
export const WALL_TOP = WALL_BASE + WALL_PANEL_H;

/** Which wall piece goes on an edge. */
export function wallPieceId(opening) {
  if (!opening) return wallNoPosts("log-wall");
  if (opening.kind === "door") return opening.open ? wallNoPosts(archWallId()) : wallNoPosts("log-wall-door");   // an open door: the doorway with the leaf swung away
  if (opening.kind === "window") return wallNoPosts("log-wall-window");
  return wallNoPosts(archWallId());                         // "arch": the doorway with nothing in it
}

/** The pieces of one room. `edges` = ownedEdges(...) for the room; `y0` = ground level under it. */
export function roomPieces(room, edges, y0, posts = []) {
  const P = [];
  // ---- floor: seven split logs across each tile, flat face up ----
  for (let j = 0; j < room.d; j++) for (let i = 0; i < room.w; i++) {
    const cx = (room.x + i + 0.5) * GU, cz = (room.y + j + 0.5) * GU;
    for (let k = 0; k < 7; k++) P.push(piece("half-log", cx, y0 + FLOOR_TOP, cz - 0.9 + k * 0.3, { pitch: 180 }));
  }
  // ---- foundation: stones under every wall, one more at each wall corner ----
  const corners = new Set();
  for (const e of edges) {
    const ax = e.axis === "h" ? 1 : 0;                                // runs along x for "h", along z for "v"
    const sx = e.x * GU, sz = e.y * GU;                               // start corner
    for (let i = 0; i < 5; i++) {
      const t = 0.2 + i * 0.4;
      P.push(piece("stone", sx + (ax ? t : 0), y0 + STONE_H / 2, sz + (ax ? 0 : t), { yaw: ((e.x * 7 + e.y * 13 + i * 5) % 4) * 90 }));
    }
    for (const c of [[sx, sz], [sx + (ax ? GU : 0), sz + (ax ? 0 : GU)]]) corners.add(c.join(","));
  }
  for (const c of corners) { const [cx, cz] = c.split(",").map(Number); P.push(piece("stone", cx, y0 + STONE_H / 2 + 0.01, cz, { yaw: ((cx * 3 + cz * 5) % 4) * 90 })); }
  // ---- walls: a log-wall module per tile edge, its +Z face turned outward ----
  for (const e of edges) {
    const mx = e.axis === "h" ? (e.x + 0.5) * GU : e.x * GU, mz = e.axis === "h" ? e.y * GU : (e.y + 0.5) * GU;
    const yaw = (Math.atan2(e.normal[0], e.normal[1]) * 180) / Math.PI;
    P.push(piece(wallPieceId(e.opening), mx, y0 + WALL_BASE + WALL_PANEL_H / 2, mz, { yaw }));
    // a doorway on the outside gets two low steps up to the sill (the walls stand on the foundation)
    if (e.opening && (e.opening.kind === "door" || e.opening.kind === "arch") && !e.shared) {
      const n = e.normal, along = e.axis === "h" ? 0 : 90, at = (d, y) => [mx + n[0] * d, y, mz + n[1] * d];
      for (const d of [0.33, 0.63]) { P.push(piece("half-log", ...at(d, y0 + WALL_BASE - 0.01), { yaw: along, pitch: 180 })); P.push(piece("half-log", ...at(d, y0 + 0.13), { yaw: along, pitch: 180 })); }
      for (const d of [0.93, 1.23]) P.push(piece("half-log", ...at(d, y0 + 0.14), { yaw: along, pitch: 180 }));
    }
  }
  // ---- posts: one at every corner and junction, never two side by side ----
  for (const k of posts) { const [cx, cz] = k.split(",").map(Number); P.push(piece(wallPostId(), cx * GU, y0 + WALL_BASE + WALL_PANEL_H / 2, cz * GU, { yaw: ((cx * 5 + cz * 11) % 4) * 90 })); }
  return P;
}
