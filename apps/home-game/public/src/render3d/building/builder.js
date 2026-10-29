// The builder: everything the player does to put a house together, in 3D.
//
//   room    A whole ghost room appears (green = fine, red = blocked, with the reason). Drag it to move it; drag one of the
//           four arrows to resize that side — it jumps a whole component (tile) at a time. Near an existing room it
//           snaps flush against it (shared wall). Confirm builds it; the ground is levelled under it.
//   door / window / arch   tap a wall segment to preview it there, confirm to place it (tap it again to take it out).
//   roof    pick a style (lean-to, A-frame, hip); a ghost roof lands on a room; move / resize / rotate it the same way
//           as a room, confirm to put it on. Roofs merge into one surface, so overlaps vanish and seams join up.
//   paint   pick a component type, then a texture and colour for it — applies to the whole structure.
//   remove  tap an opening, a roof or a room to take it away.
//
// All state lives in world.structures (see model.js); this file only edits it and shows ghosts.
import * as THREE from "three";
import { MIN_ROOM, MAX_ROOM, allRooms, validateRoom, snapRoom, roomsAdjacent, addRoom, removeRoom, setOpening, addRoof, removeRoof, buildWalls, newId, roomContains, normalizeStructures } from "./model.js";
import { structuresOf, floorYFor, commit, roomAtTile } from "./world.js";
import { buildRoomGroup, buildRoofGroup } from "./render.js";
import { DEFAULT_PITCH, roofRect } from "./roof.js";
import { roomCost, openingCost, roofCost, costText, COST_ITEMS } from "./cost.js";
import { furnitureDef, furnitureTemplate, furnitureNode } from "../furniture.js";

const GU = 2;
const SIDES = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const portraitK = () => clamp(0.8 / (innerWidth / innerHeight), 1, 2);   // a tall phone screen sees little sideways, so build mode backs off further

export function createBuilder({ scene, camera, rig, terrain, getWorld }) {
  const B = { active: false, mode: null, msg: "", valid: true, cost: { items: {}, afford: true, text: "", have: {} }, roofStyle: "gable", sel: null, target: null, listeners: new Set(), furn: { item: null, cat: null, rot: 0 } };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), tmp = new THREE.Vector3();
  const world = () => getWorld(), S = () => structuresOf(world());
  let lastEmit = "";
  const emit = () => {
    const key = JSON.stringify([B.active, B.mode, B.msg, B.valid, B.roofStyle, B.sel, !!ghost, !!fghost, B.furn.item, B.furn.cat, B.furn.rot, B.target && B.target.type, !!B.target, S()[B.sel]?.paint, B.cost.text, B.cost.afford]);
    if (key === lastEmit) return; lastEmit = key; B.listeners.forEach((f) => f(B));
  };
  const say = (m) => { B.msg = m; emit(); };

  // ---------- cost: the materials of the components, paid from the active player's inventory ----------
  const devFree = () => window.__devMode === true;   // dev mode (?dev=1): building costs nothing
  const haveOf = (item) => (devFree() ? Infinity : typeof getQty === "function" && typeof activeInv === "function" ? getQty(activeInv(), item) : Infinity);
  function setCost(items) {
    const have = {}, missing = {};
    for (const k of COST_ITEMS) if (items[k]) { have[k] = haveOf(k); if (have[k] < items[k]) missing[k] = items[k] - have[k]; }
    B.cost = { items, have, missing, afford: Object.keys(missing).length === 0, text: costText(items) };
  }
  function quote() {
    const st = S();
    if (B.mode === "room" && ghost?.kind === "room") {
      const rect = ghost.rect, room = { ...rect, id: "￿-new" }, touching = Object.values(st).filter((s) => s.rooms.some((m) => roomsAdjacent(m, rect)));
      const temp = { id: "quote", rooms: [...touching.flatMap((s) => s.rooms), room], openings: touching.flatMap((s) => s.openings), roofs: [], paint: {} };
      return roomCost(temp, room, ghostFloorY());
    }
    if (B.mode === "roof" && ghost?.kind === "roof") {
      const s = st[ghost.structure]; if (!s) return {};
      return roofCost(s, { id: "q", style: ghost.style, x: ghost.rect.x, y: ghost.rect.y, w: ghost.rect.w, d: ghost.rect.d, axis: ghost.axis, high: ghost.high, pitch: DEFAULT_PITCH });
    }
    if ((B.mode === "door" || B.mode === "window" || B.mode === "arch") && B.target?.edge) {
      const cur = walls(B.target.structure).edges.get(B.target.edge)?.opening;
      return cur && cur.kind === B.mode ? {} : openingCost(B.mode);
    }
    return {};
  }
  const refreshCost = () => setCost(quote());
  function pay() {
    if (devFree()) return;
    if (typeof removeItem !== "function" || typeof activeInv !== "function") return;
    for (const k of COST_ITEMS) if (B.cost.items[k]) removeItem(activeInv(), k, B.cost.items[k]);
  }

  // ---------- ghost visuals ----------
  const ghostMat = new THREE.MeshStandardMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.55, roughness: 0.6, depthWrite: false, emissive: 0x1d6b30, emissiveIntensity: 0.5, side: THREE.DoubleSide });
  const root = new THREE.Group(); root.name = "builder"; scene.add(root);
  let ghostGroup = null, ghostKey = "";
  const arrows = {};
  const arrowGeo = (() => { const cone = new THREE.ConeGeometry(0.42, 0.9, 16); cone.rotateZ(-Math.PI / 2); cone.translate(0.55, 0, 0); const shaft = new THREE.CylinderGeometry(0.14, 0.14, 0.7, 12); shaft.rotateZ(-Math.PI / 2); shaft.translate(-0.05, 0, 0); return [cone, shaft]; })();
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd23c, depthTest: false, transparent: true, opacity: 0.95, fog: false });
  for (const side of Object.keys(SIDES)) {
    const g = new THREE.Group(); g.userData.side = side;
    for (const geo of arrowGeo) { const m = new THREE.Mesh(geo, arrowMat); m.renderOrder = 40; g.add(m); }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); hit.userData.arrowSide = side; g.add(hit); g.userData.hit = hit;
    g.rotation.y = side === "E" ? 0 : side === "W" ? Math.PI : side === "S" ? -Math.PI / 2 : Math.PI / 2;
    g.visible = false; root.add(g); arrows[side] = g;
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.3, 0.55), new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.45, depthWrite: false, fog: false })); hl.visible = false; hl.renderOrder = 30; root.add(hl);

  const clearGhost = () => { if (ghostGroup) { ghostGroup.traverse((o) => o.isMesh && o.geometry.dispose()); root.remove(ghostGroup); ghostGroup = null; } ghostKey = ""; for (const a of Object.values(arrows)) a.visible = false; };

  // ---------- ghost state: { kind: "room" | "roof", rect, attached, structure, style, axis, high } ----------
  let ghost = null, drag = null, fghost = null, fnode = null, fnodeKey = "";
  const focusTile = () => [Math.floor(rig.focus.x / GU), Math.floor(rig.focus.z / GU)];

  function evalRoom(rect, snap) {
    let r = { ...rect }, attached = [];
    if (snap) { const s = snapRoom(r, allRooms(S()), 1); r = s.room; attached = s.attached; }
    return { rect: r, attached, v: validateRoom(world(), { ...r, id: "ghost" }, S()) };
  }
  function roofCovered(g) { // every tile of the roof must lie over a room of its structure
    const s = S()[g.structure]; if (!s) return { ok: false, reason: "Pick a room first" };
    const r = g.rect; if (r.w < 1 || r.d < 1) return { ok: false, reason: "Too small" };
    for (let j = 0; j < r.d; j++) for (let i = 0; i < r.w; i++) if (!s.rooms.some((m) => roomContains(m, r.x + i, r.y + j))) return { ok: false, reason: "A roof must sit on the rooms" };
    return { ok: true, reason: "" };
  }
  function ghostFloorY() {
    if (ghost.kind === "roof") return S()[ghost.structure]?.floorY ?? 0;
    const touch = Object.values(S()).find((s) => s.rooms.some((m) => { const a = ghost.rect, b = m; return (a.x < b.x + b.w + 1 && b.x < a.x + a.w + 1 && a.y < b.y + b.d + 1 && b.y < a.y + a.d + 1); }));
    return touch?.floorY ?? floorYFor(terrain, [ghost.rect]);
  }

  function refreshGhost() {
    if (!ghost) return;
    let valid, reason;
    if (ghost.kind === "room") { const e = evalRoom(ghost.rect, false); valid = e.v.ok; reason = e.v.reason; ghost.badTiles = e.v.badTiles; }
    else { const c = roofCovered(ghost); valid = c.ok; reason = c.reason; }
    B.valid = valid; B.msg = valid ? (ghost.kind === "room" ? `${ghost.rect.w} × ${ghost.rect.d} room — drag to move, drag an arrow to resize` : `${ghost.rect.w} × ${ghost.rect.d} roof`) : reason;
    ghostMat.color.set(valid ? 0x7dff9a : 0xff6a6a); ghostMat.emissive.set(valid ? 0x1d6b30 : 0x7a1d1d);
    const y0 = ghostFloorY(), key = JSON.stringify([ghost.kind, ghost.rect, ghost.style, ghost.axis, ghost.high, ghost.structure, y0, valid]);
    if (key !== ghostKey) {
      ghostKey = key;
      if (ghostGroup) { ghostGroup.traverse((o) => o.isMesh && o.geometry.dispose()); root.remove(ghostGroup); }
      if (ghost.kind === "room") {
        const room = { ...ghost.rect, id: "ghost" }, st = { g: { id: "g", rooms: [room], openings: [], roofs: [] } };
        ghostGroup = buildRoomGroup(room, buildWalls(st), y0, {}, ghostMat);
      } else {
        const s = S()[ghost.structure], roof = { id: "gh", style: ghost.style, x: ghost.rect.x, y: ghost.rect.y, w: ghost.rect.w, d: ghost.rect.d, axis: ghost.axis, high: ghost.high, pitch: DEFAULT_PITCH };
        ghostGroup = buildRoofGroup([roof], buildWalls({ [s.id]: s }), y0, {}, ghostMat);
      }
      ghostGroup.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      root.add(ghostGroup);
    }
    placeArrows(y0); refreshCost(); emit();
  }

  function placeArrows(y0) {
    const r = ghost.rect, x0 = r.x * GU, x1 = (r.x + r.w) * GU, z0 = r.y * GU, z1 = (r.y + r.d) * GU, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, y = y0 + (ghost.kind === "roof" ? 3.4 : 1.1), off = 1.5;
    const at = { E: [x1 + off, cz], W: [x0 - off, cz], S: [cx, z1 + off], N: [cx, z0 - off] };
    for (const [side, a] of Object.entries(arrows)) {
      a.position.set(at[side][0], y, at[side][1]);
      a.visible = !(ghost.attached || []).includes(side);
      a.scale.setScalar(1 + 0.08 * Math.sin(performance.now() / 260));
    }
  }

  // ---------- geometry helpers ----------
  const rayAt = (px, py) => { ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); return ray; };
  function planePoint(px, py, y) { plane.constant = -y; const p = rayAt(px, py).ray.intersectPlane(plane, tmp); return p ? p.clone() : null; }

  // ---------- furnishing: a piece of furniture on a floor tile inside a room ----------
  function clearFurnGhost() { if (fnode) { root.remove(fnode); fnode = null; } fghost = null; fnodeKey = ""; }
  function furnTile(px, py) {
    const st = Object.values(S()); const gp = planePoint(px, py, (st[0]?.floorY ?? 0) + 0.28); if (!gp) return null;
    return [Math.floor(gp.x / GU), Math.floor(gp.z / GU)];
  }
  function evalFurn(tx, ty) {
    const hit = roomAtTile(S(), tx, ty); if (!hit) return { ok: false, reason: "Place it inside a room" };
    if (typeof furnitureUnlocked === "function" && B.furn.item && !furnitureUnlocked(B.furn.item)) return { ok: false, reason: "Find this recipe first" };
    if (world().objects?.[ty]?.[tx]) return { ok: false, reason: "Something is already there" };
    if (typeof state !== "undefined" && state.players.some((p) => p.x === tx && p.y === ty)) return { ok: false, reason: "Someone is standing there" };
    return { ok: true, floorY: hit.structure.floorY ?? 0 };
  }
  function refreshFurnGhost() {
    const def = furnitureDef(B.furn.item); if (!def || !fghost) return;
    const e = evalFurn(fghost.tx, fghost.ty); fghost.valid = e.ok; B.valid = e.ok; fghost.floorY = e.floorY ?? fghost.floorY ?? 0;
    ghostMat.color.set(e.ok ? 0x7dff9a : 0xff6a6a); ghostMat.emissive.set(e.ok ? 0x1d6b30 : 0x7a1d1d);
    setCost(B.lifted?.type === "furn" ? {} : (def.cost || {})); B.msg = e.ok ? `${def.name}${B.cost.afford ? "" : " — not enough materials"}` : e.reason;
    const key = [def.id, B.furn.rot, fghost.tx, fghost.ty, e.ok].join("|"), want = fghost;
    if (key !== fnodeKey) {
      fnodeKey = key;
      furnitureTemplate(def).then((tpl) => {
        if (!tpl || fghost !== want || fnodeKey !== key) return;
        if (fnode) root.remove(fnode);
        fnode = furnitureNode(def, tpl, B.furn.rot, ghostMat); fnode.position.set((want.tx + 0.5) * GU, (want.floorY ?? 0) + 0.28, (want.ty + 0.5) * GU); root.add(fnode);
      });
    }
    emit();
  }
  function setFurnItem(id) { B.furn.item = id; B.furn.rot = 0; B.target = null; hl.visible = false; if (fghost) refreshFurnGhost(); else { setCost({}); say(id ? `${furnitureDef(id)?.name}: tap a floor tile inside a room` : "Pick something from the list"); } emit(); }
  function setFurnCat(cat) { B.furn.cat = cat; emit(); }
  function pickupFurniture() {
    const t = B.target; if (!t || t.type !== "furniture") return false;
    const def = furnitureDef(t.id), inv = typeof activeInv === "function" ? activeInv() : null, held = world().objects?.[t.y]?.[t.x];
    if (held?.meta?.inv?.length) { say("Empty it first"); return false; }
    if (def && inv && !devFree() && typeof addItemOrDrop === "function") for (const [k, n] of Object.entries(def.cost || {})) addItemOrDrop(inv, k, n, state.players[state.activePlayer | 0].x, state.players[state.activePlayer | 0].y);
    setOverworldObject(t.x, t.y, null); say(`${def?.name || "It"} dismantled (materials returned)`); B.target = null; emit(); return true;
  }
  function rotateTarget() {
    const t = B.target, o = t && world().objects?.[t.y]?.[t.x]; if (!o) return;
    setOverworldObject(t.x, t.y, { ...o, meta: { ...(o.meta || {}), rot: (((o.meta?.rot | 0) + 1) % 4) } }); emit();
  }

  // ---------- modes ----------
  function open() { if (!B.active) B.prevDist = rig.dist; B.active = true; B.mode = null; B.userCam = false; rig.zoomRange = { min: 12, max: 130 }; rig.dist = Math.max(rig.dist, 36 * portraitK());   // build mode: far back, so the whole house, its ghost and its arrows are in view
    B.sel = B.sel && S()[B.sel] ? B.sel : nearestStructure()?.id || null; say("What shall we build? Drag to turn, hold then drag to move, pinch to zoom"); }
  function close() { restoreLift(); setMode(null); B.active = false; B.userCam = false; rig.zoomRange = null; if (rig.override?.owner === "builder") rig.override = null; if (B.prevDist) rig.dist = B.prevDist; B.target = null; hl.visible = false; clearGhost(); emit(); }
  function nearestStructure() {
    const [fx, fy] = focusTile(); let best = null, bd = 1e9;
    for (const s of Object.values(S())) for (const r of s.rooms) { const d = Math.hypot(r.x + r.w / 2 - fx, r.y + r.d / 2 - fy); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  function setMode(m, opts = {}) {
    restoreLift();   // a piece that was lifted to be moved goes back where it was
    ghost = null; drag = null; clearGhost(); clearFurnGhost(); hl.visible = false; B.target = null; B.mode = m; B.userCam = false; setCost({});
    if (opts.style) B.roofStyle = opts.style;
    if (m === "room") startRoom();
    else if (m === "roof") startRoof();
    else if (m === "door" || m === "window" || m === "arch") say(Object.keys(S()).length ? `Tap a wall to place ${m === "arch" ? "an archway" : "a " + m}` : "Build a room first");
    else if (m === "paint") { B.sel = B.sel && S()[B.sel] ? B.sel : nearestStructure()?.id || null; say(B.sel ? "Pick what to paint (tap another house to switch)" : "Build a room first"); }
    else if (m === "remove") say("Tap an opening, a roof or a room to remove it");
    else if (m === "furnish") { const near = nearestStructure(); if (!near) say("Build a room first"); else { const r = near.rooms[0]; rig.override = { pos: new THREE.Vector3((r.x + r.w / 2) * GU, near.floorY ?? 0, (r.y + r.d / 2) * GU), dist: clamp((Math.max(r.w, r.d) * 2.6 + 20) * portraitK(), 32, 100), owner: "builder" }; say(B.furn.item ? `${furnitureDef(B.furn.item)?.name}: tap a floor tile inside a room` : "Pick something from the list, then tap the floor"); } }
    else say("What shall we build?");
    emit();
  }

  function startRoom() {
    const [fx, fy] = focusTile(), base = { x: fx - 1, y: fy - 1, w: 3, d: 3 };
    let pick = base;
    search: for (let r = 0; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const c = { ...base, x: base.x + dx, y: base.y + dy }, e = evalRoom(c, true); if (e.v.ok) { pick = e.rect; break search; }
    }
    const e = evalRoom(pick, true); ghost = { kind: "room", rect: e.rect, attached: e.attached }; refreshGhost();
  }
  function startRoof(structureId, room) {
    const s = S()[structureId || nearestStructure()?.id]; if (!s) { say("Build a room first"); return; }
    const [fx, fy] = focusTile();
    const r = room || s.rooms.find((m) => roomContains(m, fx, fy)) || s.rooms[0];
    ghost = { kind: "roof", structure: s.id, rect: { x: r.x, y: r.y, w: r.w, d: r.d }, style: B.roofStyle, axis: r.w >= r.d ? "x" : "z", high: "N", attached: [] }; B.sel = s.id; refreshGhost();
  }
  function rotate() {
    if (B.mode === "furnish") { if (fghost) { B.furn.rot = (B.furn.rot + 1) % 4; refreshFurnGhost(); } else if (B.target?.type === "furniture") rotateTarget(); return; }
    if (!ghost || ghost.kind !== "roof") return;
    if (ghost.style === "lean") ghost.high = { N: "E", E: "S", S: "W", W: "N" }[ghost.high]; else ghost.axis = ghost.axis === "x" ? "z" : "x";
    refreshGhost();
  }
  function setRoofStyle(style) { B.roofStyle = style; if (ghost?.kind === "roof") { ghost.style = style; refreshGhost(); } else emit(); }

  // ---------- picking a placed piece back up (tap and hold): it becomes a ghost again, to move or resize ----------
  const refundItems = (items) => { if (devFree() || typeof activeInv !== "function" || typeof addItemOrDrop !== "function") return; const pl = state.players[state.activePlayer | 0]; for (const [k, n] of Object.entries(items || {})) addItemOrDrop(activeInv(), k, n, pl.x, pl.y); };
  function restoreLift() {
    const L = B.lifted; if (!L) return; B.lifted = null;
    if (L.type === "furn") { if (!world().objects?.[L.y]?.[L.x]) setOverworldObject(L.x, L.y, L.obj); return; }
    const st = S(), ids = new Set([...Object.keys(st), ...Object.keys(L.snapshot)]);
    for (const k of Object.keys(st)) delete st[k];
    Object.assign(st, JSON.parse(JSON.stringify(L.snapshot)));
    for (const id of ids) commit(world(), id, { terrain });
    if (!devFree() && typeof removeItem === "function") for (const [k, n] of Object.entries(L.refund || {})) removeItem(activeInv(), k, n);   // it was refunded when lifted
  }
  /** Lifts the furniture on a tile so it can be set down somewhere else (no materials are lost; the piece keeps what is inside it). */
  function liftTile(tx, ty) {
    const o = world().objects?.[ty]?.[tx], od = o && furnitureDef(o.id); if (!od) return false;
    B.lifted = { type: "furn", x: tx, y: ty, obj: JSON.parse(JSON.stringify(o)) };
    setOverworldObject(tx, ty, null); B.furn.item = od.id; B.furn.rot = o.meta?.rot | 0; B.target = null; fghost = { tx, ty, valid: true, floorY: 0 }; refreshFurnGhost(); say(`${od.name}: tap a floor tile to move it, Place to set it down`); return true;
  }
  /** "Move" from the furniture's own menu: opens build mode already holding that piece. */
  function moveFurnitureAt(tx, ty) {
    const o = world().objects?.[ty]?.[tx]; if (!o || !furnitureDef(o.id)) return false;
    if (!B.active) open(); if (B.mode !== "furnish") setMode("furnish");
    return liftTile(tx, ty);
  }
  function liftTarget() { const t = B.target; return t?.type === "furniture" ? liftTile(t.x, t.y) : false; }
  function lift(px, py) {
    if (!B.active || ghost || fghost || !["furnish", "room", "roof", null].includes(B.mode)) return false;
    const st = S();
    if (B.mode === "furnish") {
      const t = furnTile(px, py); if (!t) return false;
      return liftTile(t[0], t[1]);
    }
    const rf = roofUnder(px, py);
    if (rf) {
      const snapshot = JSON.parse(JSON.stringify(st)), cost = roofCost(rf.structure, rf.roof);
      refundItems(cost); B.lifted = { type: "roof", snapshot, refund: cost };
      removeRoof(st, rf.roof.id); commit(world(), rf.structure.id, { terrain });
      B.mode = "roof"; B.roofStyle = rf.roof.style; B.sel = rf.structure.id;
      ghost = { kind: "roof", structure: rf.structure.id, rect: { x: rf.roof.x, y: rf.roof.y, w: rf.roof.w, d: rf.roof.d }, style: rf.roof.style, axis: rf.roof.axis, high: rf.roof.high, attached: [] }; B.target = null; refreshGhost(); return true;
    }
    const hit = roomUnder(px, py); if (!hit) return false;
    const snapshot = JSON.parse(JSON.stringify(st)), s0 = hit.structure, room = hit.room, rect = { x: room.x, y: room.y, w: room.w, d: room.d };
    const temp = { id: "quote", rooms: s0.rooms, openings: s0.openings, roofs: [], paint: {} }, cost = roomCost(temp, room, s0.floorY ?? 0);
    refundItems(cost);
    B.lifted = { type: "room", snapshot, refund: cost, rect, openings: JSON.parse(JSON.stringify(s0.openings)), roofs: JSON.parse(JSON.stringify(s0.roofs)) };
    const before = new Set(Object.keys(st)); removeRoom(st, room.id); normalizeStructures(st);
    for (const id of new Set([...before, ...Object.keys(st)])) commit(world(), id, { terrain });
    B.mode = "room"; B.target = null; const e = evalRoom(rect, true); ghost = { kind: "room", rect: e.rect, attached: e.attached }; refreshGhost();
    say(s0.roofs.length ? "Drag to move it, or an arrow to resize. Its doors and roof come along if you keep its size" : "Drag to move it, or an arrow to resize");
    return true;
  }

  // ---------- dragging the ghost ----------
  function begin(px, py) {
    if (!B.active) return false;
    if (fghost) { const t = furnTile(px, py); if (t && t[0] === fghost.tx && t[1] === fghost.ty) { drag = { type: "furn" }; return true; } return false; }
    if (!ghost) return false;
    const y0 = ghostFloorY();
    for (const a of Object.values(arrows)) if (a.visible && rayAt(px, py).intersectObject(a.userData.hit, false).length) { const gp = planePoint(px, py, y0 + 0.3); if (!gp) return false; drag = { type: "resize", side: a.userData.side, rect0: { ...ghost.rect }, gp0: gp }; return true; }
    const gp = planePoint(px, py, y0 + 0.3); if (!gp) return false;
    const r = ghost.rect, pad = 0.6;
    if (gp.x >= r.x * GU - pad && gp.x <= (r.x + r.w) * GU + pad && gp.z >= r.y * GU - pad && gp.z <= (r.y + r.d) * GU + pad) { drag = { type: "move", rect0: { ...ghost.rect }, gp0: gp }; return true; }
    return false;
  }
  function move(px, py) {
    if (drag?.type === "furn" && fghost) { const t = furnTile(px, py); if (t && (t[0] !== fghost.tx || t[1] !== fghost.ty)) { fghost.tx = t[0]; fghost.ty = t[1]; refreshFurnGhost(); } return; }
    if (!drag || !ghost) return;
    const gp = planePoint(px, py, ghostFloorY() + 0.3); if (!gp) return;
    const dx = Math.round((gp.x - drag.gp0.x) / GU), dz = Math.round((gp.z - drag.gp0.z) / GU), r0 = drag.rect0;
    if (drag.type === "move") {
      let r = { ...r0, x: r0.x + dx, y: r0.y + dz };
      if (ghost.kind === "room") { const e = evalRoom(r, true); r = e.rect; ghost.attached = e.attached; }
      else r = clampRoof(r);
      ghost.rect = r;
    } else {
      const s = drag.side, r = { ...r0 }, lim = ghost.kind === "room" ? [MIN_ROOM, MAX_ROOM] : [1, 24];
      if (s === "E") r.w = clamp(r0.w + dx, ...lim);
      if (s === "S") r.d = clamp(r0.d + dz, ...lim);
      if (s === "W") { r.w = clamp(r0.w - dx, ...lim); r.x = r0.x + (r0.w - r.w); }
      if (s === "N") { r.d = clamp(r0.d - dz, ...lim); r.y = r0.y + (r0.d - r.d); }
      ghost.rect = r;
    }
    refreshGhost();
  }
  const clampRoof = (r) => r;
  function end() { drag = null; if (ghost?.kind === "room") { const e = evalRoom(ghost.rect, true); if (e.v.ok || e.attached.length) { ghost.rect = e.rect; ghost.attached = e.attached; refreshGhost(); } } }

  // ---------- confirm / cancel ----------
  function confirm() {
    const st = S();
    if (B.mode === "room" && ghost?.kind === "room") {
      const e = evalRoom(ghost.rect, false); if (!e.v.ok) { say(e.v.reason); return false; }
      refreshCost(); if (!B.cost.afford) { say(`Not enough materials: ${costText(B.cost.missing)} more`); return false; }
      pay();
      const before = new Set(Object.keys(st)), room = { ...ghost.rect, id: newId("r") }, y0 = ghostFloorY();
      const sid = addRoom(st, room); st[sid].floorY ??= y0; st[sid].paint ||= {};
      for (const id of before) if (!st[id]) commit(world(), id, { terrain });
      commit(world(), sid, { terrain }); B.sel = sid;
      const L = B.lifted; B.lifted = null;
      if (L?.type === "room" && L.rect.w === room.w && L.rect.d === room.d) {   // same size (moved, not resized): its doors, windows and roofs go with it
        const dx = room.x - L.rect.x, dy = room.y - L.rect.y, s2 = st[sid], have = buildWalls({ [sid]: s2 }).edges;
        const shift = (edge) => { const [ax, xy] = edge.split(":"), [x, y] = xy.split(",").map(Number); return `${ax}:${x + dx},${y + dy}`; };
        for (const o of L.openings) { const e = shift(o.edge); if (have.has(e) && !s2.openings.some((q) => q.edge === e)) s2.openings.push({ ...o, edge: e }); }
        for (const r of L.roofs) s2.roofs.push({ ...r, x: r.x + dx, y: r.y + dy });
        commit(world(), sid, { terrain });
      }
      say("Room built"); setMode(null); return true;
    }
    if (B.mode === "roof" && ghost?.kind === "roof") {
      const c = roofCovered(ghost); if (!c.ok) { say(c.reason); return false; }
      refreshCost(); if (!B.cost.afford) { say(`Not enough materials: ${costText(B.cost.missing)} more`); return false; }
      pay();
      addRoof(st, ghost.structure, { style: ghost.style, ...ghost.rect, axis: ghost.axis, high: ghost.high, pitch: DEFAULT_PITCH });
      commit(world(), ghost.structure, { terrain }); B.lifted = null; say("Roof built"); setMode(null); return true;
    }
    if ((B.mode === "door" || B.mode === "window" || B.mode === "arch") && B.target?.edge) {
      const { edge, structure } = B.target, cur = walls(structure).edges.get(edge)?.opening;
      refreshCost(); if (!B.cost.afford) { say(`Not enough materials: ${costText(B.cost.missing)} more`); return false; }
      pay();
      setOpening(st, edge, cur && cur.kind === B.mode ? null : B.mode); commit(world(), structure, { terrain });
      say(cur && cur.kind === B.mode ? "Removed" : "Placed"); B.target = null; hl.visible = false; return true;
    }
    if (B.mode === "remove" && B.target) return removeTarget();
    if (B.mode === "furnish") {
      if (fghost) {
        const def = furnitureDef(B.furn.item), e = evalFurn(fghost.tx, fghost.ty); if (!def) return false;
        if (!e.ok) { say(e.reason); return false; }
        const moved = B.lifted?.type === "furn";
        setCost(moved ? {} : (def.cost || {})); if (!B.cost.afford) { say(`Not enough materials: ${costText(B.cost.missing)} more`); return false; }
        pay(); setOverworldObject(fghost.tx, fghost.ty, { id: def.id, hp: 999, meta: { rot: B.furn.rot, ...(moved && B.lifted.obj.meta?.inv ? { inv: B.lifted.obj.meta.inv } : {}) } });
        B.lifted = null; say(`${def.name} placed`); clearFurnGhost(); setCost({}); emit(); return true;
      }
      if (B.target?.type === "furniture") return pickupFurniture();
    }
    return false;
  }
  function cancel() { if (fghost) { restoreLift(); clearFurnGhost(); setCost({}); say("Cancelled"); return; } if (ghost) { setMode(null); say("Cancelled"); } else if (B.target) { B.target = null; hl.visible = false; emit(); } else if (B.mode) setMode(null); else close(); }

  const wallCache = new Map();
  function walls(sid) { const s = S()[sid]; const k = sid + ":" + s.v; if (!wallCache.has(k)) { wallCache.clear(); wallCache.set(k, buildWalls({ [sid]: s })); } return wallCache.get(k); }

  // ---------- picking walls / roofs / rooms for taps ----------
  function pickEdge(px, py) {
    const r = rayAt(px, py).ray; let best = null;
    for (const s of Object.values(S())) for (const e of walls(s.id).edges.values()) {
      const ym = (s.floorY ?? 0) + 1.5, a = e.axis === "h" ? new THREE.Vector3(e.x * GU, ym, e.y * GU) : new THREE.Vector3(e.x * GU, ym, e.y * GU), b = e.axis === "h" ? new THREE.Vector3(e.x * GU + GU, ym, e.y * GU) : new THREE.Vector3(e.x * GU, ym, e.y * GU + GU);
      const seg = new THREE.Vector3(), on = new THREE.Vector3(); const d2 = r.distanceSqToSegment(a, b, on, seg); const d = Math.sqrt(d2);
      if (d < 0.9) { const t = on.distanceTo(r.origin); if (!best || t < best.t - 0.5 || (Math.abs(t - best.t) <= 0.5 && d < best.d)) best = { e, d, t, structure: s.id, key: `${e.axis}:${e.x},${e.y}` }; }
    }
    return best;
  }
  function showEdge(pk, color) {
    const s = S()[pk.structure], e = pk.e, y = (s.floorY ?? 0) + 0.28 + 1.1;
    if (e.axis === "h") { hl.position.set(e.x * GU + 1, y, e.y * GU); hl.rotation.y = 0; } else { hl.position.set(e.x * GU, y, e.y * GU + 1); hl.rotation.y = Math.PI / 2; }
    hl.material.color.set(color); hl.visible = true;
  }
  const KIND_COLOR = { door: 0xffc24a, window: 0x6fc3ff, arch: 0x7dff9a };

  /** A tap in the world while the builder is open. Returns true when the builder used it. */
  function tap(px, py) {
    if (!B.active) return false;
    if (B.mode === "door" || B.mode === "window" || B.mode === "arch") {
      const pk = pickEdge(px, py); if (!pk) { say("Tap a wall segment"); return true; }
      B.target = { edge: pk.key, structure: pk.structure }; showEdge(pk, KIND_COLOR[B.mode]); refreshCost();
      const cur = pk.e.opening; say(cur && cur.kind === B.mode ? `Confirm to remove this ${B.mode}` : `Confirm to put a ${B.mode} here`); return true;
    }
    if (B.mode === "furnish") {
      const t = furnTile(px, py); if (!t) return true; const [tx, ty] = t, o = world().objects?.[ty]?.[tx], od = o && furnitureDef(o.id);
      if (od) { clearFurnGhost(); B.target = { type: "furniture", x: tx, y: ty, id: o.id }; setCost({}); say(`${od.name}: turn it, move it or dismantle it`); return true; }
      B.target = null;
      if (!B.furn.item) { say("Pick something from the list first"); return true; }
      fghost = { tx, ty, valid: false }; refreshFurnGhost(); return true;
    }
    if (B.mode === "paint") { const hit = roomUnder(px, py); if (hit) { B.sel = hit.structure.id; say("Selected — pick what to paint"); } return true; }
    if (B.mode === "roof" && ghost?.kind === "roof") { const hit = roomUnder(px, py); if (hit) startRoof(hit.structure.id, hit.room); return true; }
    if (B.mode === "remove") {
      const pk = pickEdge(px, py);
      if (pk?.e.opening) { B.target = { type: "opening", edge: pk.key, structure: pk.structure }; showEdge(pk, 0xff6a6a); say(`Remove this ${pk.e.opening.kind}?`); return true; }
      const rf = roofUnder(px, py); if (rf) { B.target = { type: "roof", id: rf.roof.id, structure: rf.structure.id }; say("Remove this roof?"); return true; }
      const hit = roomUnder(px, py); if (hit) { B.target = { type: "room", id: hit.room.id, structure: hit.structure.id }; say("Remove this room?"); return true; }
      say("Nothing there to remove"); return true;
    }
    return B.mode === "room" || B.mode === "roof";
  }
  function roomUnder(px, py) {
    const y = [...Object.values(S())].map((s) => s.floorY ?? 0)[0] ?? 0, gp = planePoint(px, py, y); if (!gp) return null;
    return roomAtTile(S(), Math.floor(gp.x / GU), Math.floor(gp.z / GU));
  }
  function roofUnder(px, py) { // the roof cover mesh the finger is on, via its plan position
    const hits = rayAt(px, py).intersectObjects(scene.getObjectByName("buildings")?.children || [], true).filter((h) => h.object.userData.isRoofCover);
    if (!hits.length) return null;
    const p = hits[0].point; let best = null;
    for (const s of Object.values(S())) for (const r of s.roofs) { const q = roofRect(r); if (p.x >= q.X0 - 0.5 && p.x <= q.X1 + 0.5 && p.z >= q.Z0 - 0.5 && p.z <= q.Z1 + 0.5 && (!best || r.w * r.d < best.roof.w * best.roof.d)) best = { roof: r, structure: s }; }
    return best;
  }
  function removeTarget() {
    const t = B.target, st = S(); if (!t) return false;
    if (t.type === "opening") setOpening(st, t.edge, null);
    else if (t.type === "roof") removeRoof(st, t.roof?.id || t.id);
    else if (t.type === "room") { const before = new Set(Object.keys(st)); removeRoom(st, t.id); normalizeStructures(st); for (const id of new Set([...before, ...Object.keys(st)])) commit(world(), id, { terrain }); B.target = null; hl.visible = false; say("Removed"); return true; }
    commit(world(), t.structure, { terrain }); B.target = null; hl.visible = false; say("Removed"); return true;
  }

  function setPaint(role, patch) {
    const s = S()[B.sel]; if (!s) return;
    s.paint ||= {}; s.paint[role] = { ...(s.paint[role] || {}), ...patch };
    if (s.paint[role].tex === null) delete s.paint[role].tex;
    commit(world(), s.id, { terrain }); emit();
  }

  Object.assign(B, {
    open, close, setMode, confirm, cancel, rotate, setRoofStyle, begin, move, end, tap, setPaint, setFurnItem, setFurnCat, pickupFurniture, lift, liftTarget, moveFurnitureAt,
    update(dt) {
      if (B.userCam && rig.override?.owner === "builder") rig.override.dist = rig.dist;   // the player is steering: keep their zoom
      if (ghost) {
        placeArrows(ghostFloorY());
        if (!drag && !B.userCam) { // frame the ghost (and its arrows) until the player takes the camera; hold still during a drag so the picture doesn't slide under the finger
          const r = ghost.rect, big = Math.max(r.w, r.d) * GU;
          rig.override = { pos: new THREE.Vector3((r.x + r.w / 2) * GU, ghostFloorY(), (r.y + r.d / 2) * GU), dist: clamp((big * 1.6 + 22) * portraitK(), 36, 120), owner: "builder" };
        }
      } else if (rig.override?.owner === "builder" && !drag && !B.userCam && B.mode !== "furnish") rig.override = null;
    },
    camTouched() { B.userCam = true; },   // the player is orbiting / zooming: stop re-framing the ghost for them
    /** Slide the camera over the ground by a screen drag (tap and hold, then drag). */
    pan(dx, dy) {
      B.userCam = true;
      if (rig.override?.owner !== "builder") rig.override = { pos: rig.focus.clone(), dist: rig.dist, owner: "builder" };
      const k = rig.dist * 0.0012, c = Math.cos(rig.yaw), s = Math.sin(rig.yaw), p = rig.override.pos, ky = k / Math.max(0.5, Math.sin(rig.pitch));
      p.x = clamp(p.x - c * dx * k - s * dy * ky, 0, 160); p.z = clamp(p.z + s * dx * k - c * dy * ky, 0, 160);
    },
    selected() { return S()[B.sel] || null; },
    onChange(f) { B.listeners.add(f); return () => B.listeners.delete(f); },
  });
  // live properties (Object.assign would copy a getter's current value)
  Object.defineProperties(B, {
    ghost: { get: () => ghost },
    canConfirm: { get: () => !!((ghost || fghost) ? B.valid && B.cost.afford : B.target && B.cost.afford) },
    furnGhost: { get: () => fghost },
    wantsTaps: { get: () => B.active && !!B.mode },
    dragType: { get: () => drag && drag.type },
  });
  return B;
}
