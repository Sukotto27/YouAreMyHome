// Glue between the building data (state.world.structures) and the rest of the game:
//   - level ground pads under every structure
//   - movement rules main.js asks about (walls block steps; doors and archways don't)
//   - committing a change: bump the version, keep the ground in step, tell the other player, save
import { GU } from "./pieces.js";
import { buildWalls, edgeBlocked, roomContains } from "./model.js";

export const structuresOf = (world) => (world.structures ||= {});

/** Ground level for a footprint: the highest natural ground under it (so the ground is dug down, not built up), and never under the waterline. */
export function floorYFor(terrain, rooms) {
  let y = 0.3;
  for (const r of rooms) for (let j = 0; j <= r.d; j += Math.max(1, r.d)) for (let i = 0; i <= r.w; i += Math.max(1, r.w)) for (const [ox, oz] of [[0, 0], [0.5, 0.5]]) y = Math.max(y, terrain.baseHeightAt((r.x + i + ox) * GU, (r.y + j + oz) * GU));
  return Math.round((y + 0.02) * 100) / 100;
}

/** Pads for the terrain: every room's footprint (walls and foundation stones included) at its structure's floor level. */
export function padsFor(structures) {
  const pads = [];
  for (const s of Object.values(structures)) for (const r of s.rooms) pads.push({ x0: r.x * GU - 0.35, z0: r.y * GU - 0.35, x1: (r.x + r.w) * GU + 0.35, z1: (r.y + r.d) * GU + 0.35, y: s.floorY ?? 0, blend: 2.2 });
  return pads;
}

// ---------- rules main.js uses ----------
let cacheKey = "", cache = null;
function wallsFor(world) {
  const st = world?.structures; if (!st) return null;
  const key = Object.values(st).map((s) => s.id + ":" + s.v).join("|");
  if (key !== cacheKey) { cacheKey = key; cache = buildWalls(st); }
  return cache;
}

/** Open or close a door of a structure. Returns whether it is now open (null if there is no such door). */
export function toggleDoor(world, structureId, edge, opts = {}) {
  const s = structuresOf(world)[structureId], o = s?.openings.find((q) => q.edge === edge && q.kind === "door"); if (!o) return null;
  o.open = !o.open; commit(world, structureId, opts); return o.open;
}

/** Installs the globals main.js calls: structureBlocksStep(ax,ay,bx,by) and structureTileAt(x,y). */
export function installMovementRules(getWorld) {
  window.structureBlocksStep = (ax, ay, bx, by) => { const w = wallsFor(getWorld()); return !!w && w.edges.size > 0 && edgeBlocked(w, ax, ay, bx, by); };
  window.toggleStructureDoor = (structureId, edge) => toggleDoor(getWorld(), structureId, edge);
  window.structureTileAt = (x, y) => { const w = wallsFor(getWorld()); return !!w && w.owner.has(`${x},${y}`); };
}

/** After any change to `structures[id]` (or its removal): version, ground, network, save. */
export function commit(world, id, { terrain, net = true } = {}) {
  const st = structuresOf(world), s = st[id];
  if (s) s.v = (s.v || 0) + 1;
  terrain?.setPads(padsFor(st));
  cacheKey = "";
  if (net && typeof state !== "undefined" && state.net?.enabled && typeof sendWorldOp === "function") sendWorldOp({ kind: "set_structure", mode: "overworld", id, value: s ? JSON.parse(JSON.stringify(s)) : null });
  if (typeof saveCurrentWorldSoon === "function") saveCurrentWorldSoon();
}

/** Which room (and structure) is on a tile. */
export function roomAtTile(structures, tx, ty) {
  for (const s of Object.values(structures)) for (const r of s.rooms) if (roomContains(r, tx, ty)) return { structure: s, room: r };
  return null;
}
