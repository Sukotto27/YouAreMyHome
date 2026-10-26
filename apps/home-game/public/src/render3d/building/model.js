// Modular house building: the data model. Pure functions, no three.js and no DOM, so the same rules can be used by
// the renderer, the builder UI and (later) main.js for movement blocking and saves.
//
// Everything is in whole tiles. A room is the rectangle of *interior* tiles [x, x+w) x [y, y+d); its walls lie on the
// tile edges around it. An edge is { axis: "h"|"v", x, y }:
//   "h" at (x, y): the line between tile (x, y-1) and tile (x, y)   (runs along x)
//   "v" at (x, y): the line between tile (x-1, y) and tile (x, y)   (runs along y)
//
//   structure { id, rooms: [{ id, x, y, w, d }], openings: [{ id, edge: "h:3,4", kind, style }],
//               roofs: [{ id, style, x, y, w, d, axis: "x"|"z", pitch }], paint: {...}, v }

export const MIN_ROOM = 2, MAX_ROOM = 12;
export const WALL_H = 3.12;                       // metres, height of the kit's wall panels

export const edgeKey = (axis, x, y) => `${axis}:${x},${y}`;
export const parseEdge = (k) => { const [a, rest] = k.split(":"); const [x, y] = rest.split(",").map(Number); return { axis: a, x, y }; };

let _id = 0;
export const newId = (p) => `${p}${Date.now().toString(36)}${(_id++).toString(36)}`;

// ---------- rooms ----------
export const roomContains = (r, tx, ty) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.d;
export const roomsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

/** The edges (as { axis, x, y }) around a room, each with the side it faces. */
export function roomPerimeter(r) {
  const out = [];
  for (let i = 0; i < r.w; i++) { out.push({ axis: "h", x: r.x + i, y: r.y, side: "N" }); out.push({ axis: "h", x: r.x + i, y: r.y + r.d, side: "S" }); }
  for (let j = 0; j < r.d; j++) { out.push({ axis: "v", x: r.x, y: r.y + j, side: "W" }); out.push({ axis: "v", x: r.x + r.w, y: r.y + j, side: "E" }); }
  return out;
}

/** All rooms of all structures. */
export function allRooms(structures) { const out = []; for (const s of Object.values(structures || {})) for (const r of s.rooms) out.push({ ...r, structure: s.id }); return out; }

/**
 * Walls and ownership for the whole world. Returns
 *   edges: Map(edgeKey -> { axis, x, y, a: roomId|null, b: roomId|null, structure, opening|null })
 *          a/b = the room on the north|west side and on the south|east side
 *   owner: Map("x,y" -> roomId)
 */
export function buildWalls(structures) {
  const owner = new Map(), edges = new Map(), structOf = new Map();
  for (const s of Object.values(structures || {})) for (const r of s.rooms) { structOf.set(r.id, s.id); for (let j = 0; j < r.d; j++) for (let i = 0; i < r.w; i++) owner.set(`${r.x + i},${r.y + j}`, r.id); }
  for (const s of Object.values(structures || {})) {
    for (const r of s.rooms) for (const e of roomPerimeter(r)) {
      const k = edgeKey(e.axis, e.x, e.y); if (edges.has(k)) continue;
      const A = e.axis === "h" ? `${e.x},${e.y - 1}` : `${e.x - 1},${e.y}`, B = `${e.x},${e.y}`;
      edges.set(k, { axis: e.axis, x: e.x, y: e.y, a: owner.get(A) || null, b: owner.get(B) || null, structure: s.id, opening: null });
    }
    for (const o of s.openings || []) { const e = edges.get(o.edge); if (e) e.opening = o; }
  }
  return { edges, owner };
}

/** Is there a wall (with no door/arch in it) between two orthogonally adjacent tiles? */
export function edgeBlocked(walls, ax, ay, bx, by) {
  let k;
  if (ay === by) k = edgeKey("v", Math.max(ax, bx), ay);
  else if (ax === bx) k = edgeKey("h", ax, Math.max(ay, by));
  else return false;
  const e = walls.edges.get(k); if (!e) return false;
  return !(e.opening && (e.opening.kind === "arch" || (e.opening.kind === "door" && e.opening.open)));   // a door stays shut until someone opens it
}

// ---------- validation ----------
/**
 * Can a room go here? world = { tiles, objects }. `ignore` = a room id to skip (the room being edited).
 * Returns { ok, reason, badTiles: ["x,y", ...] } (badTiles are for tinting the ghost).
 */
export function validateRoom(world, room, structures, ignore = null) {
  const H = world.tiles.length, W = world.tiles[0].length, bad = [];
  if (room.w < MIN_ROOM || room.d < MIN_ROOM) return { ok: false, reason: `Rooms are at least ${MIN_ROOM}x${MIN_ROOM}`, badTiles: bad };
  if (room.w > MAX_ROOM || room.d > MAX_ROOM) return { ok: false, reason: `Rooms are at most ${MAX_ROOM}x${MAX_ROOM}`, badTiles: bad };
  if (room.x < 2 || room.y < 2 || room.x + room.w > W - 2 || room.y + room.d > H - 2) return { ok: false, reason: "Too close to the edge of the map", badTiles: bad };
  const owner = buildWalls(structures).owner; let reason = "";
  for (let j = 0; j < room.d; j++) for (let i = 0; i < room.w; i++) {
    const tx = room.x + i, ty = room.y + j, k = `${tx},${ty}`;
    const t = world.tiles[ty][tx], o = world.objects?.[ty]?.[tx], ow = owner.get(k);
    if (t === "water") { bad.push(k); reason ||= "Can't build on water"; }
    else if (o) { bad.push(k); reason ||= "Something is in the way"; }
    else if (ow && ow !== ignore) { bad.push(k); reason ||= "Overlaps another room"; }
  }
  return { ok: bad.length === 0, reason, badTiles: bad };
}

// ---------- snapping ----------
/**
 * If the room is within `tol` tiles of another room's side, move it flush against that side (sharing the wall) and
 * line it up along the shared side when close. Returns { room, attached: ["N"|"S"|"E"|"W"...] } — the sides of the
 * *moving* room that touch a neighbour.
 */
export function snapRoom(room, others, tol = 1) {
  let r = { ...room }, attached = [];
  let best = null;
  for (const o of others) {
    const overlapX = r.x < o.x + o.w && o.x < r.x + r.w, overlapY = r.y < o.y + o.d && o.y < r.y + r.d;
    // candidate flush positions: [distance, newX, newY, side-of-moving-room]
    const cand = [];
    if (r.y < o.y + o.d + tol && r.y + r.d > o.y - tol) { // roughly level: attach east/west
      cand.push([Math.abs(r.x - (o.x + o.w)), o.x + o.w, r.y, "W"]);             // moving room to the east of o: its west side touches
      cand.push([Math.abs(r.x + r.w - o.x), o.x - r.w, r.y, "E"]);               // moving room to the west of o
    }
    if (r.x < o.x + o.w + tol && r.x + r.w > o.x - tol) { // roughly aligned: attach north/south
      cand.push([Math.abs(r.y - (o.y + o.d)), r.x, o.y + o.d, "N"]);              // below o
      cand.push([Math.abs(r.y + r.d - o.y), r.x, o.y - r.d, "S"]);                // above o
    }
    for (const c of cand) if (c[0] <= tol && (!best || c[0] < best.d)) best = { d: c[0], x: c[1], y: c[2], side: c[3], o };
  }
  if (best) {
    r.x = best.x; r.y = best.y; attached = [best.side];
    // line up with the neighbour's edge when close
    const o = best.o;
    if (best.side === "W" || best.side === "E") { for (const dy of [o.y - r.y, o.y + o.d - (r.y + r.d)]) if (Math.abs(dy) <= tol) { r.y += dy; break; } }
    else { for (const dx of [o.x - r.x, o.x + o.w - (r.x + r.w)]) if (Math.abs(dx) <= tol) { r.x += dx; break; } }
  }
  return { room: r, attached };
}

/** Do two rooms touch along a side (share at least one edge)? */
export function roomsAdjacent(a, b) {
  if (roomsOverlap(a, b)) return false;
  const xo = a.x < b.x + b.w && b.x < a.x + a.w, yo = a.y < b.y + b.d && b.y < a.y + a.d;
  return (xo && (a.y + a.d === b.y || b.y + b.d === a.y)) || (yo && (a.x + a.w === b.x || b.x + b.w === a.x));
}

// ---------- editing structures ----------
const clone = (o) => JSON.parse(JSON.stringify(o));

/** Add a confirmed room; joins any structures it touches into one. Returns the structure id (mutates `structures`). */
export function addRoom(structures, room, paintDefaults = {}) {
  const r = { id: room.id || newId("r"), x: room.x, y: room.y, w: room.w, d: room.d };
  const touching = Object.values(structures).filter((s) => s.rooms.some((o) => roomsAdjacent(o, r)));
  let target;
  if (touching.length === 0) { target = { id: newId("s"), rooms: [], openings: [], roofs: [], paint: { ...paintDefaults }, v: 0 }; structures[target.id] = target; }
  else {
    target = touching[0];
    for (const s of touching.slice(1)) { target.rooms.push(...s.rooms); target.openings.push(...s.openings); target.roofs.push(...s.roofs); delete structures[s.id]; }
  }
  target.rooms.push(r); target.v = (target.v || 0) + 1;
  return target.id;
}

export function removeRoom(structures, roomId) {
  for (const s of Object.values(structures)) {
    const i = s.rooms.findIndex((r) => r.id === roomId); if (i < 0) continue;
    s.rooms.splice(i, 1);
    const w = buildWalls({ [s.id]: s });
    s.openings = s.openings.filter((o) => w.edges.has(o.edge));
    if (!s.rooms.length) delete structures[s.id]; else s.v++;
    return true;
  }
  return false;
}

export function setOpening(structures, edge, kind, style) {
  const w = buildWalls(structures), e = w.edges.get(edge); if (!e) return false;
  const s = structures[e.structure]; s.openings = s.openings.filter((o) => o.edge !== edge);
  if (kind) s.openings.push({ id: newId("o"), edge, kind, style: style || "default" });
  s.v++; return true;
}

export function addRoof(structures, structureId, roof) {
  const s = structures[structureId]; if (!s) return null;
  const r = { id: roof.id || newId("f"), style: roof.style, x: roof.x, y: roof.y, w: roof.w, d: roof.d, axis: roof.axis || "x", pitch: roof.pitch ?? 30, high: roof.high || "N" };
  s.roofs.push(r); s.v++; return r;
}

export function removeRoof(structures, roofId) { for (const s of Object.values(structures)) { const i = s.roofs.findIndex((r) => r.id === roofId); if (i >= 0) { s.roofs.splice(i, 1); s.v++; return true; } } return false; }

/** Which structure owns this tile, if any. */
export function structureAt(structures, tx, ty) { for (const s of Object.values(structures)) for (const r of s.rooms) if (roomContains(r, tx, ty)) return s; return null; }

export { clone };

/**
 * The wall edges a room is responsible for drawing. A wall shared by two rooms is drawn once, by the older room
 * (smaller id), so adding a room never changes the look of its neighbour. Each result carries the outward
 * normal [nx, nz] of the wall panel (its +Z face): away from the owning room's side toward the other side.
 */
export function ownedEdges(walls, roomId) {
  const out = [];
  for (const e of walls.edges.values()) {
    if (e.a !== roomId && e.b !== roomId) continue;
    const owner = e.a && e.b ? (e.a < e.b ? e.a : e.b) : (e.a || e.b);
    if (owner !== roomId) continue;
    const s = owner === e.a ? 1 : -1;                       // a = north/west side, b = south/east side
    out.push({ ...e, normal: e.axis === "h" ? [0, s] : [s, 0], shared: !!(e.a && e.b) });
  }
  return out;
}

const _posts = new WeakMap();
/** Wall posts: one stands at every corner / junction point (in tile-corner coordinates), drawn by exactly one room, the oldest that owns a wall there. */
export function postsOf(walls, roomId) {
  let m = _posts.get(walls);
  if (!m) {
    m = new Map();
    for (const e of walls.edges.values()) {
      const owner = e.a && e.b ? (e.a < e.b ? e.a : e.b) : (e.a || e.b); if (!owner) continue;
      for (const k of [`${e.x},${e.y}`, e.axis === "h" ? `${e.x + 1},${e.y}` : `${e.x},${e.y + 1}`]) { const cur = m.get(k); if (!cur || owner < cur) m.set(k, owner); }
    }
    _posts.set(walls, m);
  }
  const out = []; for (const [k, o] of m) if (o === roomId) out.push(k);
  return out.sort();
}

/** A short string that changes whenever what a room's mesh looks like changes. */
export function roomSignature(walls, room, paint) {
  const es = ownedEdges(walls, room.id).map((e) => `${e.axis}${e.x},${e.y}${e.opening ? e.opening.kind[0] + e.opening.style + (e.opening.open ? "o" : "") : ""}`).sort().join(";");
  return `${room.x},${room.y},${room.w},${room.d}|${es}|${postsOf(walls, room.id).join(";")}|${JSON.stringify(paint || {})}`;
}

/** True when every tile of a roof rectangle lies over one of these rooms. */
export function roofSupported(roof, rooms) {
  for (let j = 0; j < roof.d; j++) for (let i = 0; i < roof.w; i++) if (!rooms.some((m) => roomContains(m, roof.x + i, roof.y + j))) return false;
  return true;
}

/**
 * Repair structures after rooms were removed: a structure whose rooms no longer touch is split into one structure per
 * connected group (openings follow their walls), and roofs that lost their support are dropped. Mutates `structures`.
 */
export function normalizeStructures(structures) {
  for (const s of Object.values(structures)) {
    const seen = new Set(), comps = [];
    for (const r of s.rooms) {
      if (seen.has(r.id)) continue;
      const comp = [], stack = [r]; seen.add(r.id);
      while (stack.length) { const a = stack.pop(); comp.push(a); for (const b of s.rooms) if (!seen.has(b.id) && roomsAdjacent(a, b)) { seen.add(b.id); stack.push(b); } }
      comps.push(comp);
    }
    const parts = comps.map((rooms, i) => {
      const ns = i === 0 ? s : { id: newId("s"), rooms: [], openings: [], roofs: [], paint: clone(s.paint || {}), floorY: s.floorY, v: 0 };
      return { ns, rooms };
    });
    if (parts.length > 1) {
      const oldOpenings = s.openings, oldRoofs = s.roofs;
      for (const { ns, rooms } of parts) {
        ns.rooms = rooms;
        const w = buildWalls({ [ns.id]: ns });
        ns.openings = oldOpenings.filter((o) => w.edges.has(o.edge));
        ns.roofs = oldRoofs.filter((r) => roofSupported(r, rooms));
        ns.v = (ns.v || 0) + 1; structures[ns.id] = ns;
      }
    } else if (parts.length === 1) { s.roofs = s.roofs.filter((r) => roofSupported(r, s.rooms)); s.v = (s.v || 0) + 1; }
    else delete structures[s.id];
  }
}
