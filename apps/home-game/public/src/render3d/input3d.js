// Touch/mouse controls for the 3D view.
//   single tap        walk to that spot (the ground under the finger, whatever stands there)
//   double tap        use whatever is tapped: pick it up, harvest it, open it (walks next to it first if needed). Things win over
//                     characters here, so a character standing on a mushroom does not steal the tap; two things close together ask which
//   tap and hold      the context menu for whatever is tapped (this is also how you reach a character's own menu)
//   tap and drag      orbit the camera (two-finger pinch zooms)
//
// Design: main.js keeps handling every pointer event first (menus, modals, HUD, inventory). We override
// screenToMap/mapToScreen so its own code picks tiles from the 3D view, and add a gesture layer that only
// takes over presses main.js decided are *world* presses (state.pointer.blocked === false). The actual game
// actions are main.js's: setPathTo, openMenuForTile, and its right-click quick-harvest handler, which we
// trigger with a synthetic contextmenu event so pickup/harvest/hunt rules (tools, adjacency, sounds) stay in one place.
import * as THREE from "three";
import { TILE_M } from "./config.js";

const HOLD_MS = 450, MOVE_PX = 10, DOUBLE_PX = 40;
// the second tap must land inside this window, and a single tap waits exactly this long before it counts as a single:
// a mouse double click is typically 250-400 ms apart, a finger double tap a bit quicker
const TAP_WINDOW = { mouse: 450, pen: 380, touch: 320 };
const PICK_RADIUS = { tiny: 38, small: 42, medium: 54, large: 72 };

export function installInput3D({ renderer, camera, rig, terrain: overTerrain, objects: overObjects, actorFor, scene, builder = null, getContext = null }) {
  // overworld or dungeon: whichever the game is in right now
  const cur = () => (getContext ? getContext() : { terrain: overTerrain, objects: overObjects, map: state.world });
  const terrain = { heightAt: (x, z) => cur().terrain.heightAt(x, z), worldToTile: (x, z) => cur().terrain.worldToTile(x, z) };
  const objects = { entries: () => cur().objects?.entries?.() ?? [] };
  const canvas2d = document.getElementById("game");
  const dom = renderer.domElement;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), v3 = new THREE.Vector3();

  // ---------- picking ----------
  function rayAt(px, py) { ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray; }
  function groundHit(px, py) { // march the pick ray down onto the heightfield (cheaper than raycasting 50k triangles)
    const r = rayAt(px, py); let t0 = 0, t1 = 0, prevAbove = true;
    for (let t = 1; t < 160; t += 0.6) {
      r.at(t, v3); const h = terrain.heightAt(v3.x, v3.z);
      if (v3.y <= h) { // bisect between the last two samples
        let lo = t - 0.6, hi = t;
        for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; r.at(mid, v3); if (v3.y <= terrain.heightAt(v3.x, v3.z)) hi = mid; else lo = mid; }
        r.at(hi, v3); return v3.clone();
      }
    }
    return null;
  }
  function project(x, y, z, out = {}) { v3.set(x, y, z).project(camera); out.x = (v3.x * 0.5 + 0.5) * innerWidth; out.y = (-v3.y * 0.5 + 0.5) * innerHeight; out.z = v3.z; return out; }

  const heightOf = { tiny: 0.15, small: 0.35, medium: 0.8, large: 2.2 };
  /** What is at this screen point? { kind: player|object|water|ground, tx, ty, obj?, playerIndex?, sx, sy } */
  function pickAt(px, py) {
    const scale = Math.max(0.7, Math.min(1.8, 13 / rig.dist));
    const hits = [];      // everything whose tap area contains the finger, nearest first
    const consider = (kind, tx, ty, wx, wy, wz, radius, extra) => {
      const p = project(wx, wy, wz); if (p.z > 1) return;
      const d = Math.hypot(p.x - px, p.y - py); if (d < radius * scale) hits.push({ kind, tx, ty, sx: p.x, sy: p.y, d, ...extra });
    };
    state.players.forEach((pl, i) => { const a = actorFor(pl); consider("player", pl.x, pl.y, a.root.position.x, a.root.position.y + 1.0, a.root.position.z, 60, { playerIndex: i }); });
    for (const e of objects.entries()) {
      const def = state.data?.objects?.[e.obj.id]; if (!def || def.construction === undefined && e.obj.id === "occupied") continue;
      if (e.obj.id === "occupied") continue;
      const size = def.size || "medium";
      const [wx, wz] = [(e.tx + 0.5) * TILE_M, (e.ty + 0.5) * TILE_M];
      const gy = terrain.heightAt(wx, wz);   // (things a character can stand on, like sticks, stones and berries, get a generous tap area: the character is often right over them)
      consider("object", e.tx, e.ty, wx, gy + heightOf[size] * 0.5, wz, (def.blocks === false ? Math.max(PICK_RADIUS[size] || 54, 58) : (PICK_RADIUS[size] || 54)), { obj: e.obj });
      // tall things (trees) are tapped on their crown, high above the trunk: that spot counts for them as well
      if (e.h > 2.4) consider("object", e.tx, e.ty, wx, gy + e.h * 0.62, wz, 64, { obj: e.obj });
    }
    // doors of player-built houses: a door is a thing of its own, tapped on the leaf
    for (const s of Object.values(cur().map?.structures || {})) for (const o of s.openings || []) {
      if (o.kind !== "door") continue;
      const [axis, xy] = o.edge.split(":"), [ex, ey] = xy.split(",").map(Number), h = axis === "h";
      const wx = h ? (ex + 0.5) * TILE_M : ex * TILE_M, wz = h ? ey * TILE_M : (ey + 0.5) * TILE_M;
      const tiles = h ? [[ex, ey - 1], [ex, ey]] : [[ex - 1, ey], [ex, ey]], pl = me();
      const near = tiles.slice().sort((a, b) => manhattan(pl.x, pl.y, a[0], a[1]) - manhattan(pl.x, pl.y, b[0], b[1]))[0];
      consider("door", near[0], near[1], wx, (s.floorY ?? 0) + 1.3, wz, 62, { door: { structure: s.id, edge: o.edge, tiles }, bias: 0.5 });
    }
    if (hits.length) {
      for (const h of hits) if (h.bias) h.d *= h.bias;   // a door tapped on its leaf beats the character standing in its doorway
      hits.sort((a, b) => a.d - b.d);
      const same = (a, b) => a.kind === b.kind && (a.kind === "player" ? a.playerIndex === b.playerIndex : a.tx === b.tx && a.ty === b.ty);   // two characters on one tile are still two things
      for (let i = hits.length - 1; i > 0; i--) if (hits.findIndex((h) => same(h, hits[i])) < i) hits.splice(i, 1);   // one entry per thing
      const best = hits[0];
      // when a second thing is about as close as the first (a character standing in front of a tree, two crates overlapping...), the
      // player gets to say which one they meant; a tap clearly on one thing never asks
      best.hits = hits;
      best.alts = best.kind === "door" ? [] : hits.slice(1).filter((h) => h.d - best.d < 22 * scale && !same(h, best));   // a close call (including an exact tie, e.g. both characters on one tile) asks
      return best;
    }
    const g = groundHit(px, py); if (!g) return null;
    const [tx, ty] = terrain.worldToTile(g.x, g.z);
    const W = cur().map; if (!W || ty < 0 || tx < 0 || ty >= W.tiles.length || tx >= W.tiles[0].length) return null;
    const o = W.objects[ty][tx];
    if (o && o.id !== "occupied") return { kind: "object", tx, ty, obj: o, sx: px, sy: py };
    return { kind: W.tiles[ty][tx] === "water" ? "water" : "ground", tx, ty, sx: px, sy: py, gx: g.x, gz: g.z };
  }

  /** For a double tap: like pickAt, but things (objects, water) beat characters, however close the character's body is to the tap. */
  function pickForInteract(px, py) {
    const pk = pickAt(px, py); if (!pk?.hits) return pk;
    const things = pk.hits.filter((h) => h.kind !== "player");
    if (!things.length || things.length === pk.hits.length) return pk;
    const first = things[0];
    return { ...first, alts: things.slice(1).filter((h) => h.d - first.d < 22 * Math.max(0.7, Math.min(1.8, 13 / rig.dist))) };
  }

  /** The ground tile under a screen point, ignoring objects and players (for "walk there"). */
  function groundPick(px, py) {
    const g = groundHit(px, py); if (!g) return null;
    const [tx, ty] = terrain.worldToTile(g.x, g.z), W = cur().map;
    if (!W || ty < 0 || tx < 0 || ty >= W.tiles.length || tx >= W.tiles[0].length) return null;
    return { kind: W.tiles[ty][tx] === "water" ? "water" : "ground", tx, ty, sx: px, sy: py };
  }

  // ---------- overrides so main.js's own click code works against the 3D view ----------
  let forced = null; // a tile main.js should see for the next screenToMap call
  window.screenToMap = (px, py) => {
    if (forced) return { x: forced.x, y: forced.y };
    const p = pickAt(px, py); return p ? { x: p.tx, y: p.ty } : { x: -1, y: -1 };
  };
  window.mapToScreen = (x, y) => { // tile top-left -> screen; used for speech bubbles and similar HUD bits
    const wx = (x + 0.5) * TILE_M, wz = (y + 0.5) * TILE_M, p = project(wx, terrain.heightAt(wx, wz) + 1.9, wz);
    return { sx: p.x - TILE_SIZE / 2, sy: p.y };
  };
  window.isInWorldBounds = (px, py) => px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && !hudHit(px, py);   // the whole screen is play area; HUD pieces floating over it are not

  // ---------- target marker ----------
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
  marker.renderOrder = 10; scene.add(marker);
  let markerT = 99;
  function showMarker(tx, ty, color) {
    const x = (tx + 0.5) * TILE_M, z = (ty + 0.5) * TILE_M; marker.position.set(x, terrain.heightAt(x, z) + 0.08, z);
    marker.material.color.set(color); markerT = 0;
  }

  // ---------- actions ----------
  const me = () => activePlayer();
  let pending = null; // { kind: "quick"|"menu"|"water", tx, ty, sx, sy, t0 }
  const adjacent = (tx, ty) => { const p = me(); return isAdjacentOrSame(p.x, p.y, tx, ty); };
  function quickAt(tx, ty) { // main.js's right-click quick action (pickup / harvest / hunt) for that tile
    forced = { x: tx, y: ty };
    try { canvas2d.dispatchEvent(new MouseEvent("contextmenu", { clientX: innerWidth / 2, clientY: innerHeight * 0.4, bubbles: true, cancelable: true })); } finally { forced = null; }
  }
  function openMenuAt(pk) {
    if (pk.kind === "player") { pk.playerIndex === state.activePlayer ? openMenuForPlayer(pk.playerIndex, pk.sx, pk.sy) : openMenuForOtherPlayer(pk.playerIndex, pk.sx, pk.sy); }
    else if (pk.kind === "water") openMenuForWaterTile(pk.tx, pk.ty, pk.sx, pk.sy);
    else if (pk.kind === "object") openMenuForTile(pk.tx, pk.ty, pk.sx, pk.sy);
    if (state.menu) state.menu._justOpened = false; // we swallow the finger's release, so main.js must not wait for one
  }
  // ---------- doors: shut until opened; double-tap toggles, hold offers Open / Close ----------
  const atDoor = (d) => d.tiles.some(([x, y]) => me().x === x && me().y === y);
  const findDoor = (d) => (cur().map?.structures?.[d.structure]?.openings || []).find((o) => o.edge === d.edge && o.kind === "door");
  function toggleDoorNow(d) { if (window.toggleStructureDoor?.(d.structure, d.edge) !== null && typeof playSound === "function") playSound("door_open"); }
  function openDoorMenu(pk) {
    const open = !!findDoor(pk.door)?.open;
    openMenu({ screenX: pk.sx, screenY: pk.sy, title: "Door", options: [{ label: open ? "Close door" : "Open door", action: () => { closeMenu(); toggleDoorNow(pk.door); } }] });
    if (state.menu) state.menu._justOpened = false;
  }
  function hasQuickAction(obj) {
    if (!obj || obj.meta?.depleted) return false;
    if (obj.id === "dropped_item") return true;
    const def = objDef(obj.id); if (!def) return false;
    return !!(def.pickup || def.harvest || def.hunt || def.container);
  }
  function doInteract(pk) {
    if (!pk) return;
    if (pk.kind === "player" || pk.kind === "ground") return;           // menus only ever come from tap-and-hold
    showMarker(pk.tx, pk.ty, 0xfff2b0);
    if (pk.kind === "door") {                                           // double-tap a door: open / close it (walk up to it first)
      if (atDoor(pk.door)) return toggleDoorNow(pk.door);
      setPathTo(pk.tx, pk.ty); pending = { kind: "doortoggle", door: pk.door, tx: pk.tx, ty: pk.ty, t0: performance.now() }; return;
    }
    const kind = hasQuickAction(pk.obj) ? "quick" : null;               // double-tap only does one-shot actions (pick up, harvest, hunt); anything else needs a hold
    if (!kind) return setPathTo(pk.tx, pk.ty);
    const def = pk.obj && objDef(pk.obj.id);
    const canShoot = kind === "quick" && def && isHuntableDef(def) && manhattan(me().x, me().y, pk.tx, pk.ty) <= 3 && canShootBow(activeInv());
    if (adjacent(pk.tx, pk.ty) || canShoot) return runAction({ kind, tx: pk.tx, ty: pk.ty, sx: pk.sx, sy: pk.sy });
    setPathTo(pk.tx, pk.ty);                                            // walk next to it, then act (see update())
    pending = { kind, tx: pk.tx, ty: pk.ty, sx: pk.sx, sy: pk.sy, t0: performance.now() };
  }
  /** If the tap could mean several things, ask which one; then carry on with the chosen pick. */
  function resolvePick(pk, cont) {
    if (!pk?.alts?.length) return cont(pk);
    const name = (c) => {
      if (c.kind === "player") return state.players[c.playerIndex].name + (c.playerIndex === (state.activePlayer | 0) ? " (you)" : "");
      if (c.kind === "water") return "Water"; if (c.kind === "door") return "Door";
      const id = c.obj?.id; if (id === "dropped_item") return itemDef(c.obj.meta?.itemId)?.name ?? "Item";
      return objDef(id)?.name ?? id ?? "Something";
    };
    const list = [pk, ...pk.alts]; pending = null;
    openMenu({ screenX: pk.sx, screenY: pk.sy, title: "Which one?", options: list.map((c) => ({ label: name(c), action: () => { closeMenu(); cont({ ...c, alts: [] }); } })) });
    if (state.menu) state.menu._justOpened = false;
  }
  function runAction(a) {
    if (a.kind === "doortoggle") toggleDoorNow(a.door);
    else if (a.kind === "doormenu") openDoorMenu(a);
    else if (a.kind === "quick") quickAt(a.tx, a.ty);
    else if (a.kind === "water") openMenuForWaterTile(a.tx, a.ty, a.sx, a.sy);
    else openMenuAt({ kind: "object", tx: a.tx, ty: a.ty, sx: a.sx, sy: a.sy });
  }
  function doMove(pk) {
    if (!pk) return; pending = null;
    showMarker(pk.tx, pk.ty, 0x9fe0ff);
    setPathTo(pk.tx, pk.ty);
  }
  function doHold(pk) {
    if (!pk || pk.kind === "ground") return;
    pending = null;
    if (pk.kind === "player") return openMenuAt(pk);
    if (pk.kind === "door") {
      showMarker(pk.tx, pk.ty, 0xffd27a);
      if (atDoor(pk.door)) return openDoorMenu(pk);
      setPathTo(pk.tx, pk.ty); pending = { kind: "doormenu", door: pk.door, tx: pk.tx, ty: pk.ty, sx: pk.sx, sy: pk.sy, t0: performance.now() }; return;
    }
    // main.js only builds object/water menus for things you can reach, so walk over first, then open it
    showMarker(pk.tx, pk.ty, 0xffd27a);
    const def = pk.obj && objDef(pk.obj.id);
    const canShoot = def && isHuntableDef(def) && manhattan(me().x, me().y, pk.tx, pk.ty) <= 3 && canShootBow(activeInv());
    if (adjacent(pk.tx, pk.ty) || canShoot) return openMenuAt(pk);
    setPathTo(pk.tx, pk.ty);
    pending = { kind: pk.kind === "water" ? "water" : "menu", tx: pk.tx, ty: pk.ty, sx: pk.sx, sy: pk.sy, t0: performance.now() };
  }

  // ---------- gesture classifier ----------
  const pointers = new Map();   // pointerId -> { x, y }
  let g = null;                  // the current single-pointer gesture
  let pinch = null, lastTap = null;
  const resetMainPointer = () => { const s = state.pointer; if (s) { s.down = false; s.dragging = false; s.blocked = false; } };
  const clearHold = () => { if (g?.holdTimer) { clearTimeout(g.holdTimer); g.holdTimer = null; } };

  // every panel main.js draws over the world. main.js only marks some of them as "blocked", so list them all here
  const modalOpen = () => !!(state.runestoneReader?.open || state.comboLock?.open || state.riddleLock?.open || state.constructionOpen || state.settingsOpen || state.craftingOpen || state.trade?.open
    || state.coordsOpen || state.collectiblesOpen || state.treasureOpen || state.stockpileOpen || (state.interactionRequest && state.activePlayer === state.interactionRequest.toIndex) || state.cutscene?.open || state.tutorial?.open);

  // A touch long-press makes the browser fire its own "contextmenu" after our hold menu is already up; main.js's handler would close
  // that menu and run the quick action. Only our own synthetic one (quickAt, via `forced`) and a real mouse right-click get through.
  let lastPointerType = "mouse";
  addEventListener("pointerdown", (e) => { lastPointerType = e.pointerType || "mouse"; }, true);
  addEventListener("contextmenu", (e) => { if (!forced && lastPointerType !== "mouse") { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

  // after main.js's own pointerdown (registered earlier on the same element) has decided whether this is a world press
  canvas2d.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (hudHit(e.clientX, e.clientY)) return;   // a press that starts on a HUD element (dock, sheets, status...) never belongs to the world
    if (modalOpen()) return;   // modals drawn by main.js take the press themselves (and must see the release, or their buttons never fire)
    if (state.pointer?.blocked || state.menu || state.title?.open) { if (!g) return; }
    if (pointers.size === 2 && g) { // second finger: pinch
      clearHold(); const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ang: Math.atan2(b.y - a.y, b.x - a.x) }; g.moved = true; g.pinching = true; return;
    }
    if (g && !pointers.has(g.id)) { clearHold(); g = null; pinch = null; }   // a gesture whose finger is already gone (lost release) must not swallow every later tap
    if (g) return;
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: false, held: false, world: true };
    if (builder?.active && builder.begin(e.clientX, e.clientY)) { g.build = true; return; }   // grabbed the ghost or one of its arrows
    g.holdTimer = setTimeout(() => { // tap and hold -> context menu
      if (!g || g.moved || g.pinching) return; g.held = true; g.holdTimer = null;
      if (builder?.active) {   // build mode: hold on a placed piece picks it up as a ghost; hold on empty ground, then drag, turns the camera
        if (builder.lift(g.x0, g.y0)) { g.build = builder.begin(g.x0, g.y0); navigator.vibrate?.(20); } else { g.orbit = true; navigator.vibrate?.(12); }
        return;
      }
      resolvePick(pickAt(g.x0, g.y0), doHold);
    }, HOLD_MS);
  });

  addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.d > 0) rig.zoom(pinch.d / Math.max(d, 1));
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (builder?.active) { builder.pan(mx - pinch.mx, my - pinch.my); let da = ang - pinch.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); rig.orbit(da, 0); }   // two fingers: zoom, slide, twist
      pinch.d = d; pinch.mx = mx; pinch.my = my; pinch.ang = ang; e.stopImmediatePropagation(); return;
    }
    if (e.pointerId !== g.id) return;
    if (g.build) { builder.move(e.clientX, e.clientY); e.stopImmediatePropagation(); return; }
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > MOVE_PX) { g.moved = true; clearHold(); }
    if (builder?.active) {   // build mode: one finger slides the camera over the ground, hold-then-drag turns it
      if (g.orbit) { rig.orbit(-dx * 0.0065, dy * 0.0055); builder.camTouched(); } else if (g.moved && !g.held) builder.pan(dx, dy);
    } else if (g.moved && !g.held) rig.orbit(-dx * 0.0065, dy * 0.0055);
    g.x = e.clientX; g.y = e.clientY;
    e.stopImmediatePropagation();    // main.js must not pan its 2D camera / change cursors while we orbit
  }, true);

  addEventListener("pointerup", (e) => {
    const wasPointer = pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; if (!pointers.size) { clearHold(); g = null; resetMainPointer(); } e.stopImmediatePropagation(); return; }
    if (g && e.pointerId !== g.id && !pointers.size) { clearHold(); g = null; resetMainPointer(); e.stopImmediatePropagation(); return; }   // pinch where the first finger lifted first: end the gesture with the last finger
    if (!g || e.pointerId !== g.id) return;
    clearHold();
    const gg = g; g = null;
    e.stopImmediatePropagation(); resetMainPointer();      // the world press is ours; main.js never sees the release
    if (gg.build) { builder.end(); return; }
    if (gg.held || gg.moved) return;
    const now = performance.now(), win = TAP_WINDOW[e.pointerType] || TAP_WINDOW.mouse;
    if (lastTap && now - lastTap.t < win && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_PX) {
      lastTap = null;                                                  // double tap: use what is there
      if (builder?.active) return;
      doInteract(pickForInteract(gg.x0, gg.y0)); return;                 // never a "Which one?" menu either: that is a hold-only thing
    }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    if (builder?.active) { builder.tap(gg.x0, gg.y0); return; }
    if (state.placingStockpile || state.placinghouse) {                 // "Place stockpile" / house blueprint: the tap picks the spot
      const gp = groundPick(gg.x0, gg.y0);
      if (gp) { if (state.placingStockpile ? placeStockpileAt(gp.tx, gp.ty) : placehouseAt(gp.tx, gp.ty)) { state.placingStockpile = false; state.placinghouse = false; } }
      return;
    }
    doMove(groundPick(gg.x0, gg.y0));                                   // single tap: walk there right away (a second tap quickly after turns it into "use")
  }, true);
  addEventListener("pointercancel", (e) => { pointers.delete(e.pointerId); if (g && g.id === e.pointerId) { clearHold(); g = null; resetMainPointer(); } pinch = null; }, true);
  dom.addEventListener("wheel", (e) => { rig.zoom(Math.exp(e.deltaY * 0.001)); if (builder?.active) builder.camTouched(); e.preventDefault(); }, { passive: false });
  canvas2d.addEventListener("wheel", (e) => { if (!state.menu && !modalOpen()) { rig.zoom(Math.exp(e.deltaY * 0.001)); if (builder?.active) builder.camTouched(); } e.preventDefault(); }, { passive: false });

  return {
    pickAt, pickForInteract, showMarker,
    screenOf(tx, ty, up = 0.4) { const wx = (tx + 0.5) * TILE_M, wz = (ty + 0.5) * TILE_M; return project(wx, terrain.heightAt(wx, wz) + up, wz); },
    update(dt) {
      if (markerT < 1.2) { markerT += dt; const k = markerT / 1.2; marker.scale.setScalar(0.6 + k * 0.9); marker.material.opacity = 0.9 * (1 - k); } else marker.material.opacity = 0;
      if (pending) { // finished walking? then do the action; gave up if the path ended somewhere else
        const p = me(), moving = p.path.length > 0 || (state.net?.moveQueue?.length > 0) || (state.net?._pendingMove);
        const there = pending.door ? atDoor(pending.door) : isAdjacentOrSame(p.x, p.y, pending.tx, pending.ty);
        if (there && !moving) { const a = pending; pending = null; runAction(a); }
        else if (!moving && performance.now() - pending.t0 > 700) pending = null;
        else if (performance.now() - pending.t0 > 25000) pending = null;
      }
    },
    cancelPending() { pending = null; },
  };
}
