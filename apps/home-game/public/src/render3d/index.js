// 3D view entry point. Loaded by index.html when the page is opened with ?view=3d.
// The game logic stays in main.js (tile grid, pathing, rules, networking); this module only *draws* `state`.
//   ?view=3d            use the world the game loaded (title screen -> Continue)
//   ?view=3d&dev=1      skip the title screen: generate a fresh overworld and drop both players in it
//   &hour=0.25          freeze the time of day at that fraction of the day (0..1; daylight is the first ~65%)
import * as THREE from "three";
import { TILE_M, FOG, dayLengths } from "./config.js";
import { createScene3D, CameraRig } from "./scene3d.js";
import { buildTerrain } from "./terrain.js";
import { loadCharacters } from "./characters.js";
import { dressShores } from "./shore.js";
import { createObjectLayer } from "./objects3d.js";
import { installInput3D } from "./input3d.js";
import { BuildingRenderer } from "./building/render.js";
import { createBuilder } from "./building/builder.js";
import { createBuilderUI } from "./building/ui.js";
import { installMovementRules, structuresOf, padsFor, roomAtTile } from "./building/world.js";
import { ACTION_FOR_SFX, startAction, updateAction, cancelAction } from "./actions.js";
import { preloadTools } from "./tools3d.js";
import { createHeldTorches } from "./heldtorch.js";
import { createCouple } from "./couple.js";
import { applyPose } from "./pose.js";
import { createEffects } from "./effects.js";
import { createDungeonView } from "./dungeon.js";
import { createAmbient } from "./ambient.js";

const q = new URLSearchParams(location.search);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, timeoutMs = 60000) {
  const t0 = performance.now();
  while (!fn()) { if (performance.now() - t0 > timeoutMs) throw new Error("timed out waiting for " + label); await sleep(50); }
}

export async function start3D() {
  await waitFor(() => typeof state !== "undefined" && state.data, "game data");
  const dev = q.has("dev");
  if (dev && !state.world) {
    state.world = generateOverworld();         // main.js's own generator -> the same world format the game uses
    state.mode = "overworld";
    state.title.open = false; state.net.enabled = false;   // dev: no title screen, offline, so the game loop (movement, time) runs
    if (state.world.spawn) state.players.forEach((p, i) => { p.x = p.fx = state.world.spawn.x + i; p.y = p.fy = state.world.spawn.y; });
    // dev skips the title screen's world setup, which is where the starter toolkit normally comes from: hand one to each player (double-click it in the inventory to open it)
    for (const inv of state.inventories || []) if (Array.isArray(inv) && typeof getQty === "function" && getQty(inv, "toolkit") <= 0) addItem(inv, "toolkit", 1);
  }
  await waitFor(() => state.world, "state.world (press Continue on the title screen, or add &dev=1)");

  // the 2D canvas stays on as a transparent layer above the 3D one: HUD, inventory, menus and modals are all still drawn (and handled) by main.js
  const canvas2d = document.getElementById("game");
  if (canvas2d) Object.assign(canvas2d.style, { position: "fixed", inset: "0", zIndex: "10", background: "transparent" });
  const { renderer, scene, camera, setTimeOfDay, mobile, fitView } = createScene3D(document.body);
  const rig = new CameraRig(camera);
  const terrain = buildTerrain(state.world, scene);
  const shore = await dressShores(state.world, terrain, scene);
  const objects = await createObjectLayer({ terrain, scene });
  const { actors } = await loadCharacters();
  for (const a of Object.values(actors)) { a.root.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(a.root); }
  const effects = createEffects({ scene, terrain });
  const ambient = await createAmbient({ scene, terrain });
  // the dungeon is a separate dark scene; the objects layer for it is built the first time a dungeon is entered
  const dungeon = createDungeonView({ renderer });
  const flat = { heightAt: () => 0, worldToTile: (x, z) => [Math.floor(x / TILE_M), Math.floor(z / TILE_M)] };
  const dungeonFx = createEffects({ scene: dungeon.scene, terrain: flat });
  let dungeonObjects = null, dungeonObjectsLoading = false;
  const inDungeon = () => state.mode === "dungeon" && !!state.dungeon;
  const curObjects = () => (inDungeon() ? dungeonObjects : objects);
  const curFx = () => (inDungeon() ? dungeonFx : effects);
  const curTerrain = () => (inDungeon() ? flat : terrain);
  const actorFor = (p) => (p.name === "Cristina" ? actors.cristina : actors.scott);

  const heldTorch = createHeldTorches();
  const couple = createCouple();
  const startedAt = performance.now();
  const heading = new Map();                    // per-actor facing (radians), last position, smoothed speed
  function syncPlayers(dt, rawDt) {
    // where each player's own tile motion puts them (couple actions then move the two bodies together)
    const bases = state.players.map((p) => { const wx = ((p.fx ?? p.x) + 0.5) * TILE_M, wz = ((p.fy ?? p.y) + 0.5) * TILE_M; return { wx, wz, wy: curTerrain().heightAt(wx, wz) }; });
    const pActors = state.players.map(actorFor);
    for (const [pi, p] of state.players.entries()) {
      const a = actorFor(p);
      const { wx, wz, wy } = bases[pi];   // (the dungeon floor is flat at 0: the overworld's hills must not sink people into it)
      const h = heading.get(a) || { yaw: 0, x: wx, z: wz, v: 0 };
      const dx = wx - h.x, dz = wz - h.z, moved = Math.hypot(dx, dz);
      if (moved > 1e-4) { const target = Math.atan2(dx, dz); let d = target - h.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); h.yaw += d * Math.min(1, dt * 14); }
      h.v = (h.v ?? 0) + (moved / rawDt - (h.v ?? 0)) * Math.min(1, rawDt * 10);   // smoothed ground speed, m/s (real time, not the clamped frame time)
      h.x = wx; h.z = wz; heading.set(a, h);
      // sitting in a chair / lying in a bed: the body slides to that furniture and turns to match it
      const ps = p.pose, tgt = ps ? 1 : 0; a.poseK = (a.poseK || 0) + (tgt - (a.poseK || 0)) * Math.min(1, dt * 6); if (ps) a.lastPose = ps;
      const pk = a.poseK < 0.01 ? 0 : a.poseK, lp = ps || a.lastPose;
      let px = wx, pz = wz, yaw = h.yaw;
      if (pk > 0 && lp) { px = wx + ((lp.tx + 0.5) * TILE_M - wx) * pk; pz = wz + ((lp.ty + 0.5) * TILE_M - wz) * pk; const dy = Math.atan2(Math.sin(lp.yaw - h.yaw), Math.cos(lp.yaw - h.yaw)); yaw = h.yaw + dy * pk; }
      if (ps?.kind === "sit" && pk > 0) { px += Math.sin(yaw) * (window.__seatFwd ?? 0.1) * pk; pz += Math.cos(yaw) * (window.__seatFwd ?? 0.1) * pk; }   // hips back against the backrest, not on the front edge
      a.root.position.set(px, wy, pz); a.root.rotation.y = yaw; a.root.visible = !builder.active;   // build mode has no characters in the way
      couple.apply(a, pi, bases, heading, pActors, dt, clock, (x, z) => curTerrain().heightAt(x, z));   // hug / kiss / holding hands
      // an action in progress (chopping, fishing...) keeps the body; walking away cancels it
      const speedScale = window.__animSpeed ?? 1; a.mixer.timeScale = speedScale;
      const v = h.v;
      if (a.act && v > 1.5) cancelAction(a);
      const busy = updateAction(a, dt * speedScale);
      if (!busy) {
        if (ps) a.onSeat = ps.kind === "sit"; else if (p.resting) a.onSeat = false;   // (stays set while standing up from a chair, so the body does not dip)
        const seated = ps?.kind === "sit" || p.resting;
        if (ps?.kind === "sleep") { a.play("Idle_Loop", { speed: 0.02 }); }
        else if (seated && v < 0.4) {   // resting (on the ground) or in a chair: sit down, then sit
          if (!a.sitting) { a.sitting = performance.now(); a.play("Sitting_Enter", { once: true, restart: true }); }
          else if (performance.now() - a.sitting > 1300) a.play("Sitting_Idle_Loop");
        } else if (a.sitting) { a.sitting = 0; a.play("Sitting_Exit", { once: true, restart: true }); a.standUntil = performance.now() + 1000; }
        else if (a.standUntil && performance.now() < a.standUntil && v < 0.4) { /* standing back up */ }
        // clip follows speed so the feet don't skate (the game moves at 6 tiles/s = 12 m/s, i.e. a sprint)
        else if (p.sneak && v < 0.4) a.play("Crouch_Idle_Loop");
        else if (p.sneak) a.play("Crouch_Fwd_Loop", { speed: Math.min(2, Math.max(0.6, v / 1.4)) });
        else if (v < 0.4) a.play("Idle_Loop");
        else if (v < 3) a.play("Walk_Loop", { speed: Math.max(0.6, v / 1.5) });
        else if (v < 7) a.play("Jog_Fwd_Loop", { speed: v / 3.6 });
        else a.play("Sprint_Loop", { speed: Math.min(2, v / 6.5) });
      }
      a.mixer.update(dt); applyPose(a, dt);
      heldTorch.update(a, p, clock);
      a.root.position.y -= a.sitDrop || 0;
      // lying in a bed: on the back, head to the bedhead, lifted onto the mattress
      a.lie = (a.lie || 0) + ((ps?.kind === "sleep" ? 1 : 0) - (a.lie || 0)) * Math.min(1, dt * 4);
      if (a.lie > 0.005) { const e = a.lie * a.lie * (3 - 2 * a.lie); a.root.rotation.order = "YXZ"; a.root.rotation.x = -Math.PI / 2 * e; a.root.position.y += 0.78 * e; a.root.position.x += Math.sin(yaw) * 0.85 * e; a.root.position.z += Math.cos(yaw) * 0.85 * e; }
      else if (a.root.rotation.x) a.root.rotation.x = 0;
    }
  }
  for (const a of Object.values(actors)) a.onStrike = (name, act) => {
    const t = act.target, pos = a.root.position;
    let x, z;
    if (t) { x = (t.x + 0.5) * TILE_M; z = (t.y + 0.5) * TILE_M; }
    else { x = pos.x + Math.sin(a.root.rotation.y) * 0.9; z = pos.z + Math.cos(a.root.rotation.y) * 0.9; }
    const y = curTerrain().heightAt(x, z) + (name === "chop" || name === "pickaxe" ? 1.0 : name === "harvest" ? 0.9 : name === "hammer" || name === "saw" ? 0.4 : 0.35);
    curFx().strike(name, x, y, z, { x: pos.x - x, z: pos.z - z });
    if (t && name === "chop") curObjects()?.shakeAt(t.x, t.y);
  };

  // --- the game's own sound effects drive the animations: when main.js plays "chop" for the active player, they swing an axe ---
  const origPlaySound = window.playSound; window.__origPlaySound = origPlaySound;
  const faceTile = new Map();                   // last tile the game acted on, so the body can turn toward it
  for (const fn of ["harvestObject", "pickupObject"]) {
    const orig = window[fn]; if (typeof orig !== "function") continue;
    window[fn] = function (x, y, ...rest) { faceTile.set("last", { x, y, t: performance.now() }); return orig.call(this, x, y, ...rest); };
  }
  // petting: face the cat (or the furniture it is sitting on) and aim the stroking hand at it
  let petAim = null;
  if (typeof window.petCat === "function") {
    const origPet = window.petCat;
    window.petCat = function (x, y, ...rest) {
      const o = state.world?.objects?.[y]?.[x], pc = o?.meta?.perch, tx = pc ? pc.x : x, ty = pc ? pc.y : y, wx = (tx + 0.5) * TILE_M, wz = (ty + 0.5) * TILE_M;
      faceTile.set("last", { x: tx, y: ty, t: performance.now() });
      petAim = new THREE.Vector3(wx, (pc ? pc.h : 0) + curTerrain().heightAt(wx, wz) + 0.3, wz);
      return origPet.call(this, x, y, ...rest);
    };
  }
  function faceYawFor(actor) {
    const t = faceTile.get("last"); if (!t || performance.now() - t.t > 250) return null;
    const dx = (t.x + 0.5) * TILE_M - actor.root.position.x, dz = (t.y + 0.5) * TILE_M - actor.root.position.z;
    return Math.hypot(dx, dz) > 0.2 ? Math.atan2(dx, dz) : null;
  }
  // item pops: whatever the active player gains floats up from their head
  const origAddItem = window.addItem;
  if (typeof origAddItem === "function") window.addItem = function (inv, itemId, qty) {
    const before = typeof getQty === "function" ? getQty(inv, itemId) : 0, res = origAddItem.apply(this, arguments);
    try {
      if (state.view3d && inv === state.inventories?.[state.activePlayer] && performance.now() - startedAt > 3000) {
        const got = (typeof getQty === "function" ? getQty(inv, itemId) : 0) - before;
        if (got > 0) { const a = actorFor(state.players[state.activePlayer | 0] || state.players[0]), p = a.root.position; curFx().pop(itemId, got, p.x, p.y + 2.1, p.z, 0.25); }
      }
    } catch (_) {}
    return res;
  };
  window.playSound = function (name) {
    const action = ACTION_FOR_SFX[name];
    if (action && state.view3d && !window.__animBypass) {
      if (state.holdingHands) endHoldingHands("Hands let go: someone got busy.");   // the body starts working now, not at the moment of impact

      const a = actorFor(state.players[state.activePlayer | 0] || state.players[0]);
      const t0 = performance.now(), ft0 = faceTile.get("last");
      const seated = action === "pet" && state.players[state.activePlayer | 0]?.pose?.kind === "sit";   // petting the cat on your lap: stay in the chair
      startAction(a, seated ? "petSeated" : action, { playSfx: origPlaySound });
      if (action === "pet") a.petAim = petAim;
      // the game may call harvestObject/pickupObject just before OR just after playing the sound: settle the target once its handler has finished
      queueMicrotask(() => {
        const ft = faceTile.get("last"); if (!ft || performance.now() - ft.t > 400 || !a.act) return;
        a.act.target = { x: ft.x, y: ft.y };
        const dx = (ft.x + 0.5) * TILE_M - a.root.position.x, dz = (ft.y + 0.5) * TILE_M - a.root.position.z;
        const h = heading.get(a); if (h && Math.hypot(dx, dz) > 0.2) h.yaw = Math.atan2(dx, dz);
      });
      return;     // the action plays the sound itself, on the strike
    }
    return origPlaySound(name);
  };

  // houses: built from City Builder components (see building/); structures live in state.world.structures
  const buildings = new BuildingRenderer(scene);
  installMovementRules(() => state.world);
  const builder = createBuilder({ scene, camera, rig, terrain, getWorld: () => state.world });
  createBuilderUI(builder);
  window.openBuilder3D = () => { builder.open(); };
  let structKey = "";
  const roofFade = new Map();
  function syncBuildings(dt) {
    const st = structuresOf(state.world), key = Object.values(st).map((s) => s.id + ":" + s.v + ":" + s.floorY).join("|");
    if (key !== structKey) { structKey = key; terrain.setPads(padsFor(st)); buildings.sync(st); }
    // the roof fades away while someone is inside, so the camera can see in
    const me = state.players[state.activePlayer | 0] || state.players[0], here = roomAtTile(st, me.x, me.y);
    for (const s of Object.values(st)) {
      const target = here?.structure.id === s.id ? 0 : 1, cur = roofFade.get(s.id) ?? 1, next = cur + (target - cur) * Math.min(1, dt * 6);
      if (Math.abs(next - cur) > 0.004 || !roofFade.has(s.id)) { roofFade.set(s.id, next); buildings.setRoofAlpha(s.id, next); }
    }
  }
  const input = installInput3D({ renderer, camera, rig, terrain, objects, actorFor, scene, builder, getContext: () => (inDungeon() ? { terrain: flat, objects: dungeonObjects, map: state.dungeon } : { terrain, objects, map: state.world }) });

  // browsers only allow audio after a click or key press. The normal flow gets one from the title screen; ?dev=1 skips that screen, so the first click/tap/key here quietly starts the music
  if (dev) {
    const unlock = () => { removeEventListener("pointerdown", unlock, true); removeEventListener("keydown", unlock, true); if (state.music && !state.music.unlocked) { state.music.unlocked = true; if (typeof playRandomMusicForContext === "function") playRandomMusicForContext(true); } };
    addEventListener("pointerdown", unlock, true); addEventListener("keydown", unlock, true);
  }
  // ---- fog of war ----
  // The game's own reveal radius is 1 tile (a 2D screen is mostly tiles). In 3D a tile is 2 m, so players see FOG_TILES tiles around them;
  // that is written into the game's explored grid so it saves and the 2D view agrees. ?fog=0 turns the fog off (for testing).
  const FOG_TILES = 4;
  if (q.get("fog") === "0") { window.__fogOff = true; terrain.setFogOfWar(false); }
  let fogClock = 0, fogSig = -1;
  function updateFog(dt) {
    const ex = state.world?.explored; if (!ex) { terrain.setExplored(null); return; }
    fogClock += dt;
    for (let i = 0; i < 2; i++) { const pl = state.players[i], a = pl && actorFor(pl); if (a) terrain.setSeen(i, a.root.position.x, a.root.position.z, (FOG_TILES + 0.45) * TILE_M); else terrain.setSeen(i, 0, 0, 0); }
    if (fogClock < 0.2) return; fogClock = 0;
    let changed = false;
    for (const pl of state.players) {
      const r = FOG_TILES * (state.holdingHands ? 1.5 : 1);
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const x = pl.x + dx, y = pl.y + dy; if (dx * dx + dy * dy > r * r + 0.5 || !ex[y] || x < 0 || x >= ex[y].length) continue;
        if (!ex[y][x]) { ex[y][x] = true; changed = true; }
      }
    }
    if (changed && typeof saveCurrentWorldSoon === "function") saveCurrentWorldSoon();
    let n = 0; for (const row of ex) for (const v of row) if (v) n++;
    if (n !== fogSig) { fogSig = n; terrain.setExplored(ex); shore.setExplored(window.__fogOff ? null : ex); }
  }

  const fixedHour = q.has("hour") ? +q.get("hour") : null;
  const follow = new THREE.Vector3();
  let last = performance.now(), clock = 0, frames = 0;
  renderer.setAnimationLoop((now) => {
    const rawDt = Math.min(Math.max((now - last) / 1000, 1e-3), 1), dt = Math.min(rawDt, 0.1); last = now; clock += dt;
    syncPlayers(dt, rawDt);
    const me = state.players[state.activePlayer | 0] || state.players[0], a = actorFor(me);
    follow.copy(a.root.position);
    const dun = inDungeon(), show3d = dun || (state.mode === "overworld" && !!state.world);
    // the characters live in whichever scene is showing
    const home = dun ? dungeon.scene : scene;
    for (const ac of Object.values(actors)) if (ac.root.parent !== home) home.add(ac.root);
    couple.update(dt, home);
    if (dun) {
      if (dungeon.map !== state.dungeon) { dungeon.build(state.dungeon); rig.override = null; }
      if (!dungeonObjects && !dungeonObjectsLoading) { dungeonObjectsLoading = true; createObjectLayer({ terrain: flat, scene: dungeon.scene, fog: false }).then((l) => { dungeonObjects = l; }); }
      renderer.toneMappingExposure = 0.9;
      dungeon.update(dt, camera, state.players.map((pl) => actorFor(pl).root.position));
      dungeonObjects?.sync(state.dungeon, dt, clock);
      dungeonFx.update(dt);
    } else {
      const { day } = dayLengths();
      const phase = fixedHour !== null ? fixedHour * day : (state.time?.phaseT ?? 0);
      setTimeOfDay(phase, follow);
      terrain.update(clock); shore.update(clock); effects.update(dt); updateFog(dt);
      ambient.update(dt, clock, follow, phase < dayLengths().light * 0.97 && phase > 0.5, (x, z) => window.__fogOff || !state.world?.explored || !!state.world.explored[Math.floor(z / TILE_M)]?.[Math.floor(x / TILE_M)]);
      if (state.world) objects.sync(state.world, dt, clock);
      const cullD = Math.max(50, rig.dist * 1.6 + 30); objects.set.cull(camera.position, cullD); shore.set.cull(camera.position, cullD);
      { const pts = state.players.map((pl) => { const ac = actorFor(pl); return new THREE.Vector3(ac.root.position.x, ac.root.position.y + 1.1, ac.root.position.z); }); objects.fadeOccluders(camera, pts, dt); }
    }
    // keep the same amount of haze on the character when zoomed out, so far ground stays visible
    if (!dun) scene.fog.density = FOG.density * Math.min(1, 13 / Math.max(13, rig.dist));
    state.view3d = show3d; renderer.domElement.style.display = show3d ? "block" : "none";
    input.update(dt);
    if (state.world && !dun) { syncBuildings(dt); builder.update(dt); }
    rig.update(dt, follow);
    if (show3d) renderer.render(dun ? dungeon.scene : scene, camera);
    if (++frames === 3) window.__ready = true;
  });

  Object.assign(window, { __r3d: { THREE, fitView, renderer, scene, camera, rig, terrain, actors, setTimeOfDay, mobile, heading, objects, input, buildings, builder, actorFor, effects, dungeon } });
  if (dev) {   // dev mode: free building, every piece unlocked, and the full house blueprint in the pack
    window.__devMode = true;
    for (const inv of state.inventories || []) if (inv && typeof getQty === "function" && getQty(inv, "blueprint_house") < 1) addItem(inv, "blueprint_house", 1);
  }
  preloadTools();   // so the first swing of an axe or pick already has its tool in hand
  console.log("[3d] started", state.world.tiles[0].length + "x" + state.world.tiles.length, "tiles");
}

start3D().catch((e) => { console.error("[3d] failed:", e); window.__error = String(e.stack || e); });
