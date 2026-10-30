// World objects in 3D. Reads state.world.objects (the grid the game logic owns) every frame and keeps a matching
// set of 3D entities: trees/bushes/rocks/pickups are instances of shared models, animals are tracked by object
// identity (the game moves the same object between tiles) and glide between tile centres.
//
// Each recipe says how one game object id looks. Missing art falls back to simple procedural stand-ins so every
// object is at least visible and tappable; see ASSET_INVENTORY.md for what still needs real models.
import * as THREE from "three";
import { loadParts, InstanceSet } from "./instancer.js";
import { TILE_M } from "./config.js";
import { createFlipbook, createSmokeEmitter } from "./flipbook.js";
import * as CB from "./building/cb.js";
import { piece as CBpiece } from "./building/generate.js";
import { createCave } from "./cave.js";
import { loadAny } from "./loaders.js";
import { loadFurniture, furnitureDefs, furnitureTemplate, furnitureNode, FLOOR_TOP } from "./furniture.js";
import { structuresOf, roomAtTile } from "./building/world.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

const A = "assets3d/";
const MODELS = A + "models/";
const MED = MODELS + "scenery/medieval-3d-package/3d%20Models/";
const VEG = MODELS + "scenery/vegetation.fbx";

// ---------- small helpers ----------
const texLoader = new THREE.TextureLoader();
const texCache = new Map();
function tex(url, { flipY = true } = {}) {
  const k = url + flipY;
  if (!texCache.has(k)) { const t = texLoader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.flipY = flipY; t.anisotropy = 4; texCache.set(k, t); }
  return texCache.get(k);
}
// leaf textures are dark greens: lift them and fill the shadow side so foliage reads against the bright ground
const cutout = (map) => {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, metalness: 0, color: new THREE.Color(1.6, 1.6, 1.6), emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.32 });
  // per-instance fade by dithering: a tree that hides a player thins out like a screen door (shadows are unaffected)
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
attribute float aFade; varying float vFade;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vFade = aFade;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
varying float vFade;`)
      .replace("#include <alphatest_fragment>", `
      { float b = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (vFade < b) discard; }
      #include <alphatest_fragment>`);
  };
  m.customProgramCacheKey = () => "cutout-fade";
  return m;
};
const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
function hash(x, y, salt = 0) { let h = (x * 374761393 + y * 668265263 + salt * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
const pickOf = (list, r) => list[Math.floor(r * list.length) % list.length];
const tileCenter = (tx, ty) => [(tx + 0.5) * TILE_M, (ty + 0.5) * TILE_M];

/** A parts model as a regular Group (for things that move individually: animals, items). Shares geometry/materials. */
function partsToGroup(model) {
  const g = new THREE.Group();
  for (const p of model.parts) { const m = new THREE.Mesh(p.geometry, p.material); m.castShadow = true; g.add(m); }
  return g;
}

// ---------- the recipes ----------
export async function createObjectLayer({ terrain, scene, fog = true }) {   // fog: false = no fog of war (the dungeon is dark enough)
  const set = new InstanceSet(scene, { castShadow: true, auto: true, fade: true });
  const group = new THREE.Group(); scene.add(group);          // non-instanced things (animals, items, fire)
  const medAtlas = tex(MED.replace("3d%20Models/", "") + "atlas10.png");
  const L = (url, opts) => loadParts(url, opts).catch((e) => { console.warn("[objects] model failed:", url, e.message); return null; });

  // a rigged (skinned) model: kept as a template, cloned per animal, scaled to a real height with its feet on the ground
  async function rigTemplate(url, height) {
    try {
      const tpl = await loadAny(url); tpl.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(tpl), s = height / Math.max(1e-3, box.max.y - box.min.y);
      for (const c of tpl.animations || []) c.tracks = c.tracks.filter((t) => !t.name.endsWith(".position"));   // root bounce makes the animals "dance" in place; the game moves them
      return { tpl, s, lift: -box.min.y * s, clips: Object.fromEntries((tpl.animations || []).map((c) => [c.name, c])) };
    } catch (e) { console.warn("[objects] rig failed:", url, e.message); return null; }
  }

  // Tripo wild animals (tools/bake_wild_animals.mjs): static part meshes, so no clips - the legs swing from the hip by hand.
  // face = which way the model looks along x; legs = part index -> swing sign (diagonal pairs); hop = hop height in m when it moves.
  const WILD = {
    deer: { file: "deer", height: 1.35, face: 1, legs: { 0: 1, 1: 1, 3: -1, 5: -1 } },
    doe: { file: "doe", height: 1.0, face: 1, legs: { 0: 1, 1: 1, 3: -1, 5: -1 } },
    pig: { file: "pig", height: 0.7, face: 1, legs: { 2: 1, 9: 1, 8: -1, 6: -1 } },
    squirrel: { file: "squirrel", height: 0.4, face: -1, hop: 0.1 },
    rat1: { file: "rat", height: 0.17, face: -1, hop: 0.02 },
    rat2: { file: "rat", height: 0.17, face: -1, hop: 0.02, tint: 0x8a8a94 },
    rabbit: { file: "rabbit", height: 0.42, face: 1, hop: 0.16 },
  };
  async function wildTemplate(w) {
    try {
      const tpl = await loadAny(`${MODELS}animals/wild/${w.file}.glb`); tpl.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(tpl), s = w.height / Math.max(1e-3, box.max.y - box.min.y);
      const parts = []; tpl.traverse((o) => { if (o.isMesh) parts.push(o); });
      parts.forEach((m) => { m.castShadow = true; if (w.tint) { m.material = m.material.clone(); m.material.color.lerp(new THREE.Color(w.tint), 0.7); } });
      for (const i of Object.keys(w.legs || {})) {      // re-parent a leg under a pivot at its top (the hip)
        const m = parts[i], b = new THREE.Box3().setFromObject(m), piv = new THREE.Group(), top = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
        piv.name = "leg" + i; piv.position.copy(top); m.parent.add(piv); piv.add(m); m.position.sub(top);
      }
      return { tpl, s, lift: -box.min.y * s, yaw: -w.face * Math.PI / 2, w };
    } catch (e) { console.warn("[objects] wild animal failed:", w.file, e.message); return null; }
  }

  // --- models (loaded in parallel; null when a file is missing) ---
  const treeNames = [1, 2, 3, 4, 5, 6, 7, 8];
  const treeHeights = [4.3, 3.9, 4.1, 4.3, 4.5, 4.1, 5.2, 5.0];   // a tree fills about one 2 m tile, like the 2D game
  const bushNums = [1, 2, 3, 4, 5, 6, 7, 8];
  const rockNodes = ["Rock", "Rock_01", "Rock_02", "Rock_04", "Rock_05", "Rock_06", "Rock_07", "Rock_08", "Rock_09", "Rock_10"];
  const rockMat = (n) => new THREE.MeshStandardMaterial({ map: tex(A + `textures/rocks/${n}.png`), roughness: 1 });
  const M = {};
  await Promise.all([
    ...treeNames.map(async (n, i) => { M["tree" + n] = await L(`${MODELS}trees/nature-pack/tree0${n}.glb`, { height: treeHeights[i], sink: 0.4, material: cutout(tex(A + `textures/foliage/trees/tree0${n}_summer.png`, { flipY: false })) }); }),
    ...bushNums.map(async (n) => { M["bush" + n] = await L(`${MODELS}bushes/nature-pack/bush0${n}.glb`, { height: 0.95, sink: 0.1, material: cutout(tex(A + `textures/foliage/bushes/bush${n}_summer.png`, { flipY: false })) }); }),
    ...rockNodes.map(async (n) => { M["rock_" + n] = await L(VEG, { node: n, footprint: 1.5, sink: 0.12, material: rockMat(n) }); M["pebble_" + n] = await L(VEG, { node: n, footprint: 0.36, sink: 0.02, material: rockMat(n) }); }),
    (async () => { M.runestone = await L(VEG, { node: "Rock_03", height: 2.1, sink: 0.1, material: rockMat("Rock_03") }); })(),
    (async () => { M.wheat = await L(`${MODELS}farming/farming-pack/planted_wheat.obj`, { footprint: 1.1 }); })(),
    (async () => { M.strawberries = await L(`${MODELS}farming/farming-pack/planted_strawberries.obj`, { footprint: 0.8 }); })(),
    (async () => { M.mushrooms = await L(`${MODELS}forageables/mushrooms-3mrys/Chanterelle/cluster_chanterelle.glb`, { footprint: 0.5 }); })(),
    (async () => { M.chest = await L(`${MODELS}props/low-poly-chest/Simple_Chest.glb`, { footprint: 1.0 }); })(),
    // (toolbox: the model has open / inward-facing faces, so its material draws both sides to look like a solid box)
    (async () => { M.toolbox = await L(VEG, { node: "toolbox", footprint: 0.8, material: new THREE.MeshStandardMaterial({ map: tex(A + "textures/vegetation-pack/toolbox.png"), roughness: 0.8, side: THREE.DoubleSide }) }); })(),
    (async () => { M.fireplace = await L(`${MODELS}props/small-props/FirePlace_1_1_A.glb`, { footprint: 0.95 }); })(),
    (async () => { M.cowRig = await rigTemplate(`${MODELS}animals/styloo/Cow.glb`, 1.45); })(),
    (async () => { M.chickenRig = await rigTemplate(`${MODELS}animals/styloo/chichen.glb`, 0.5); })(),
    (async () => { M.cat = await L(`${MODELS}animals/styloo/cat.glb`, { height: 0.34 }); })(),
    (async () => { M.catRig = await rigTemplate(`${MODELS}animals/styloo/cat.glb`, 0.36); })(),
    ...Object.entries(WILD).map(async ([id, w]) => { M[id + "Wild"] = await wildTemplate(w); }),
    (async () => { M.apple = await L(`${MODELS}food/applered.glb`, { height: 0.2 }); })(),
    (async () => { M.grape = await L(`${MODELS}food/grapesingle.glb`, { footprint: 0.1 }); })(),
    (async () => { M.egg = await L(`${MODELS}food/egg.glb`, { height: 0.13 }); })(),
    (async () => { M.banana = await L(`${MODELS}food/banana.glb`, { footprint: 0.42 }); })(),
    (async () => { M.orangeFruit = await L(`${MODELS}food/orange.glb`, { footprint: 0.24 }); })(),
    loadFurniture(),
    (async () => { M.table = await L(`${MED}Props/Interior/Tables/Regular%20table/Regular%20Table1.fbx`, { footprint: 1.5, material: new THREE.MeshStandardMaterial({ map: medAtlas, roughness: 0.9 }) }); })(),
    (async () => { M.crate = await L(`${MODELS}buildings/modular-medieval/Market/crate.glb`, { footprint: 0.8 }); })(),
    (async () => { M.haybale = await L(`${MODELS}buildings/modular-medieval/Market/haybale.glb`, { footprint: 1.0 }); })(),
  ]);

  // the chest / toolbox models are very dark against grass in daylight: fill their shadow side with a soft glow (as the foliage does)
  const lift = (model, k = 0.4) => { if (!model) return; model.parts = model.parts.map((p) => { const m = p.material.clone(); if (m.map) { m.emissiveMap = m.map; m.emissive = new THREE.Color(1, 1, 1); m.emissiveIntensity = k; } else m.emissive = (m.color || new THREE.Color(0.5, 0.4, 0.3)).clone().multiplyScalar(k); return { ...p, material: m }; }); };
  lift(M.chest); lift(M.toolbox);

  // procedural stand-ins -----------------------------------------------------------
  const sphere = (r, color) => ({ parts: [{ geometry: new THREE.SphereGeometry(r, 8, 6), material: flat(color) }] });
  M.apple = M.apple || sphere(0.1, 0xc4281f); M.berry = sphere(0.06, 0x2e3f9a); M.grape = M.grape || sphere(0.06, 0x6b2a86);   // (the real fruit models come from assets3d/models/food; the spheres are the fallback)
  const cyl = (rt, rb, h, color) => { const g = new THREE.CylinderGeometry(rt, rb, h, 10); g.translate(0, h / 2, 0); return { parts: [{ geometry: g, material: flat(color) }] }; };
  M.stump = cyl(0.17, 0.2, 0.3, 0x6a4a2e);
  const seedling = new THREE.BufferGeometry(); // thin trunk + a leaf ball, merged by hand as two parts
  M.sapTrunk = cyl(0.03, 0.045, 0.55, 0x6a4a2e); M.sapLeaves = (() => { const g = new THREE.IcosahedronGeometry(0.2, 0); g.translate(0, 0.6, 0); return { parts: [{ geometry: g, material: flat(0x5fa046) }] }; })();
  M.stick = (() => { const g = new THREE.CylinderGeometry(0.025, 0.03, 0.8, 6); g.rotateZ(Math.PI / 2); g.translate(0, 0.04, 0); return { parts: [{ geometry: g, material: flat(0x6b4a2b) }] }; })();
  M.caveDark = (() => { const g = new THREE.CircleGeometry(0.62, 24); g.rotateX(-Math.PI / 2); g.translate(0, 0.02, 0); return { parts: [{ geometry: g, material: new THREE.MeshBasicMaterial({ color: 0x07080a }) }] }; })();
  M.glow = (() => { const g = new THREE.RingGeometry(0.22, 0.34, 20); g.rotateX(-Math.PI / 2); g.translate(0, 0.04, 0); return { parts: [{ geometry: g, material: new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.55, depthWrite: false }) }] }; })();

  // placeholders for animals with no model yet
  const critter = (len, h, color) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(len * 0.55, h * 0.5, len * 0.9), flat(color)); body.position.y = h * 0.55;
    const head = new THREE.Mesh(new THREE.BoxGeometry(len * 0.3, h * 0.38, len * 0.3), flat(color)); head.position.set(0, h * 0.78, len * 0.5);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(len * 0.4, h * 0.34, len * 0.7), flat(0x2a2018)); legs.position.y = h * 0.17;
    for (const m of [body, head, legs]) { m.castShadow = true; g.add(m); }
    return g;
  };
  const PLACEHOLDER = { deer: [1.2, 1.3, 0xa87444], doe: [1.1, 1.1, 0xa87444], pig: [0.95, 0.65, 0xe8a8a0], goat: [0.9, 0.85, 0xe9e4d8], squirrel: [0.3, 0.22, 0x8a8a8a], rabbit: [0.4, 0.3, 0x85694f], rat1: [0.26, 0.16, 0x6a5a4a], rat2: [0.26, 0.16, 0x4a4a52], duck: [0.4, 0.32, 0xf0f0e8], swan: [0.8, 0.7, 0xffffff] };

  // ---------- entity builders: (obj, tx, ty) -> entity { dispose(), update?(dt,t) } ----------
  const place = (key, model, x, z, o = {}) => model ? set.add(key, model, x, o.y ?? terrain.heightAt(x, z), z, o) : null;
  const instanced = (handles) => ({ dispose() { for (const h of handles) if (h) set.remove(h); }, setHidden(hide) { for (const h of handles) if (h) set.setVisible(h, !hide); } });
  const jitter = (tx, ty, salt, m) => [(hash(tx, ty, salt) - 0.5) * m, (hash(tx, ty, salt + 1) - 0.5) * m];

  function treeLike(id, treeKey, extraFn) {
    return (obj, tx, ty) => {
      const [cx, cz] = tileCenter(tx, ty), [jx, jz] = jitter(tx, ty, 3, 0.7);
      const x = cx + jx, z = cz + jz, s = 0.85 + hash(tx, ty, 5) * 0.4;
      const hs = [place(treeKey, M[treeKey], x, z, { yaw: hash(tx, ty, 6) * 6.28, scale: s })];
      if (extraFn) hs.push(...extraFn(obj, x, z, s, tx, ty));
      const ent = instanced(hs); ent.occ = { x, z, y: terrain.heightAt(x, z), h: treeHeights[+treeKey.slice(4) - 1] * s, r: 1.5 * s, handles: [hs[0]], fade: 1 };
      const trunk = hs[0], yaw0 = trunk?.yaw ?? 0, sy0 = trunk?.sy ?? 1; let shakeT = 0;
      ent.shake = () => { shakeT = 0.45; };
      ent.update = (dt) => {        // a chop makes the whole tree shudder, then settle
        if (!trunk) return;
        if (shakeT > 0) { shakeT = Math.max(0, shakeT - dt); const k = shakeT / 0.45, w = Math.sin(shakeT * 55) * k * 0.05; trunk.yaw = yaw0 + w; trunk.sy = sy0 * (1 + Math.sin(shakeT * 70) * k * 0.03); set.update(trunk); }
      };
      return ent;
    };
  }
  const berries = (modelKey, count, radius, height, keyBase) => (obj, x, z, s, tx, ty) => {
    if (obj.meta?.depleted) return [];
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = hash(tx, ty, 40 + i) * 6.28, r = radius * (0.55 + hash(tx, ty, 60 + i) * 0.5), y = height * (0.35 + hash(tx, ty, 80 + i) * 0.6);
      out.push(place(modelKey, M[modelKey], x + Math.cos(a) * r, z + Math.sin(a) * r, { y: terrain.heightAt(x, z) + y, scale: 1 }));
    }
    return out;
  };
  const apples = (obj, x, z, s, tx, ty) => berries("apple", 7, 1.5 * s, 4.2 * s, "apple")(obj, x, z, s, tx, ty);

  const R = {};
  for (let n = 1; n <= 8; n++) R["tree" + n] = treeLike("tree" + n, "tree" + n);
  R.apple_tree = (obj, tx, ty) => treeLike("apple_tree", "tree5", apples)(obj, tx, ty);
  const bushLike = (mix, extra, scaleMul = 1) => (obj, tx, ty) => {
    const [cx, cz] = tileCenter(tx, ty), [jx, jz] = jitter(tx, ty, 3, 0.8), x = cx + jx, z = cz + jz, s = (0.9 + hash(tx, ty, 5) * 0.4) * scaleMul;
    const key = "bush" + pickOf(mix, hash(tx, ty, 7));
    const hs = [place(key, M[key], x, z, { yaw: hash(tx, ty, 6) * 6.28, scale: s })];
    if (extra) hs.push(...extra(obj, x, z, s, tx, ty));
    const ent = instanced(hs); ent.occ = { x, z, y: terrain.heightAt(x, z), h: 0.95 * s, r: 0.7 * s, handles: [hs[0]], fade: 1 };
    return ent;
  };
  R.bush = bushLike([1, 2, 3, 4, 5, 6, 7, 8]);
  R.berry_bush = bushLike([2, 3, 5], berries("berry", 8, 0.45, 0.9, "berry"));
  R.grapevine = bushLike([4], berries("grape", 10, 0.4, 0.9, "grape"), 0.95);
  R.wheat = (obj, tx, ty) => { const [cx, cz] = tileCenter(tx, ty); return instanced([place("wheat", M.wheat, cx, cz, { yaw: hash(tx, ty, 6) * 6.28, scale: 0.9 + hash(tx, ty, 5) * 0.3 })]); };
  const rockLike = (prefix, scaleMin, scaleVar, off) => (obj, tx, ty) => {
    const [cx, cz] = tileCenter(tx, ty), [jx, jz] = jitter(tx, ty, 3, off), key = prefix + pickOf(rockNodes, hash(tx, ty, 9));
    return instanced([place(key, M[key], cx + jx, cz + jz, { yaw: hash(tx, ty, 6) * 6.28, scale: scaleMin + hash(tx, ty, 5) * scaleVar, sy: (scaleMin + hash(tx, ty, 5) * scaleVar) * (0.8 + hash(tx, ty, 8) * 0.5) })]);
  };
  R.rock = rockLike("rock_", 0.75, 0.55, 0.5);
  R.stone = rockLike("pebble_", 0.8, 0.5, 1.0);
  // an egg lying in the grass, and a loose feather
  const eggGeo = new THREE.SphereGeometry(0.1, 12, 10).scale(1, 1.3, 1), eggMat = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.7 });
  R.egg_pickup = (obj, tx, ty) => {
    const [cx, cz] = tileCenter(tx, ty), [jx, jz] = jitter(tx, ty, 3, 0.8);
    if (M.egg) return instanced([place("egg", M.egg, cx + jx, cz + jz, { yaw: hash(tx, ty, 6) * 6.28, y: terrain.heightAt(cx + jx, cz + jz) + 0.01 })]);
    const g = new THREE.Mesh(eggGeo, eggMat); g.castShadow = true;
    g.position.set(cx + jx, terrain.heightAt(cx + jx, cz + jz) + 0.11, cz + jz); g.rotation.set(0.3, hash(tx, ty, 6) * 6.28, 0.25); group.add(g);
    return { nodes: [g], setHidden(h) { g.visible = !h; }, dispose() { group.remove(g); } };
  };
  const featherShape = (() => { const sh = new THREE.Shape(); sh.moveTo(0, -0.17); sh.bezierCurveTo(0.07, -0.08, 0.075, 0.07, 0.01, 0.2); sh.bezierCurveTo(-0.05, 0.1, -0.06, -0.06, 0, -0.17); return sh; })();
  const featherGeo = new THREE.ShapeGeometry(featherShape, 8).rotateX(-Math.PI / 2), featherMat = new THREE.MeshStandardMaterial({ color: 0xfbf6ea, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x555048 });
  const quillGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5).rotateX(Math.PI / 2).translate(0, 0, -0.2), quillMat = new THREE.MeshStandardMaterial({ color: 0xcdb98f, roughness: 0.9 });
  R.feather_pickup = (obj, tx, ty) => {
    const [cx, cz] = tileCenter(tx, ty), [jx, jz] = jitter(tx, ty, 3, 0.9), g = new THREE.Group();
    const vane = new THREE.Mesh(featherGeo, featherMat), quill = new THREE.Mesh(quillGeo, quillMat); g.add(vane, quill);
    g.position.set(cx + jx, terrain.heightAt(cx + jx, cz + jz) + 0.04, cz + jz); g.rotation.set(0, hash(tx, ty, 6) * 6.28, 0.08); g.scale.setScalar(0.8); group.add(g);
    return { nodes: [g], setHidden(h) { g.visible = !h; }, dispose() { group.remove(g); } };
  };
  R.stick_pickup = (obj, tx, ty) => { const [cx, cz] = tileCenter(tx, ty), [jx, jz] = jitter(tx, ty, 3, 0.9); return instanced([place("stick", M.stick, cx + jx, cz + jz, { yaw: hash(tx, ty, 6) * 6.28 })]); };
  R.wild_mushrooms = (obj, tx, ty) => { const [cx, cz] = tileCenter(tx, ty), [jx, jz] = jitter(tx, ty, 3, 0.9); return instanced([place("mushrooms", M.mushrooms, cx + jx, cz + jz, { yaw: hash(tx, ty, 6) * 6.28, scale: 0.9 + hash(tx, ty, 5) * 0.4 })]); };
  R.wild_strawberries = (obj, tx, ty) => { const [cx, cz] = tileCenter(tx, ty); return instanced([place("strawberries", M.strawberries, cx, cz, { yaw: hash(tx, ty, 6) * 6.28 })]); };
  R.chest = (obj, tx, ty) => { const [cx, cz] = tileCenter(tx, ty); return instanced([place("chest", M.chest, cx, cz, { yaw: Math.round(hash(tx, ty, 6) * 4) * Math.PI / 2 })]); };
  // puzzle chests glow softly so they can be found in the dark: gold for a key chest, violet for the treasure chest of the last chamber
  R.dungeon_chest = (obj, tx, ty) => {
    const base = R.chest(obj, tx, ty), [cx, cz] = tileCenter(tx, ty), y = terrain.heightAt(cx, cz), treasure = obj.meta?.reward === "treasure", col = treasure ? 0xb48cff : 0xffc860;
    const g = new THREE.Group(); g.position.set(cx, y, cz);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 28).rotateX(-Math.PI / 2).translate(0, 0.04, 0), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    const light = new THREE.PointLight(col, 2.2, 7, 1.6); light.position.y = 0.9; g.add(ring, light); group.add(g);
    return { nodes: [g], setHidden(h) { g.visible = !h; base?.setHidden?.(h); }, dispose() { group.remove(g); ring.geometry.dispose(); ring.material.dispose(); base?.dispose?.(); }, update(dt, t) { ring.material.opacity = 0.4 + 0.2 * Math.sin(t * 2 + tx); light.intensity = 2 + 0.5 * Math.sin(t * 2.4 + ty); } };
  };
  R.toolbox = (obj, tx, ty) => { const [cx, cz] = tileCenter(tx, ty); return instanced([place("toolbox", M.toolbox, cx, cz, { yaw: hash(tx, ty, 6) * 6.28 })]); };
  R.stump = (obj, tx, ty) => { const [cx, cz] = tileCenter(tx, ty); return instanced([place("stump", M.stump, cx, cz, { yaw: hash(tx, ty, 6) * 6.28, scale: 0.95 + hash(tx, ty, 5) * 0.2 })]); };
  R.stump_seedling = (obj, tx, ty) => { const [cx, cz] = tileCenter(tx, ty); return instanced([place("stump", M.stump, cx, cz, { scale: 0.8 }), place("sapTrunk", M.sapTrunk, cx, cz, { y: terrain.heightAt(cx, cz) + 0.3 }), place("sapLeaves", M.sapLeaves, cx, cz, { y: terrain.heightAt(cx, cz) + 0.3 })]); };
  R.runestone = (obj, tx, ty) => {
    const [cx, cz] = tileCenter(tx, ty);
    const g = new THREE.Group(); const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    plane.position.set(0, 1.0, 0.62); g.add(plane); g.position.set(cx, terrain.heightAt(cx, cz), cz); g.rotation.y = hash(tx, ty, 6) * 6.28; group.add(g);
    const base = place("runestone", M.runestone, cx, cz, { yaw: g.rotation.y });
    return { setHidden(h) { g.visible = !h; if (base) set.setVisible(base, !h); }, dispose() { group.remove(g); set.remove(base); }, update(dt, t) { plane.material.opacity = 0.35 + 0.25 * Math.sin(t * 2 + tx); } };
  };
  // the cave: a procedural boulder mound with an arched mouth (cave.js); it is "large" in the game, so it spills a tile north,
  // and its mouth faces south where the players walk up. Bushes at its foot are ordinary instanced bushes.
  R.cave = (obj, tx, ty) => {
    const [cx, cz0] = tileCenter(tx, ty), cz = cz0 - TILE_M * 0.3, y = terrain.heightAt(cx, cz0);
    const cave = createCave(cx, y, cz, hash(tx, ty, 21)); group.add(cave.root);
    const hs = [[-1.55, 1.35], [1.5, 1.6], [-1.9, 0.2]].map(([dx, dz], i) => { const key = "bush" + pickOf([1, 2, 3, 5], hash(tx, ty, 90 + i)); return place(key, M[key], cx + dx, cz + dz, { yaw: hash(tx, ty, 95 + i) * 6.28, scale: 0.8 + hash(tx, ty, 98 + i) * 0.35 }); });
    return {
      occ: cave.occ,
      setHidden(hide) { cave.root.visible = !hide; for (const h of hs) if (h) set.setVisible(h, !hide); },
      dispose() { cave.dispose(); for (const h of hs) if (h) set.remove(h); },
    };
  };
  R.hole = (obj, tx, ty) => { const [cx, cz] = tileCenter(tx, ty), hs = []; for (let i = 0; i < 6; i++) { const a = i * 1.05, key = "pebble_" + pickOf(rockNodes, hash(tx, ty, 30 + i)); hs.push(place(key, M[key], cx + Math.cos(a) * 0.7, cz + Math.sin(a) * 0.7, { yaw: a, scale: 1.4 })); } hs.push(place("caveDark", M.caveDark, cx, cz)); return instanced(hs); };
  R.portal = (obj, tx, ty) => {
    const [cx, cz] = tileCenter(tx, ty), y = terrain.heightAt(cx, cz);
    const g = new THREE.Group(); g.position.set(cx, y + 1.25, cz);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 12, 36), new THREE.MeshStandardMaterial({ color: 0x7a5cff, emissive: 0x5b3cff, emissiveIntensity: 1.6, roughness: 0.4 }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.88, 32), new THREE.MeshBasicMaterial({ color: 0xb59cff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(ring, disc); g.rotation.y = hash(tx, ty, 6) * 3.14; group.add(g);
    const light = new THREE.PointLight(0x8a6cff, 1.6, 7); light.position.y = 0; g.add(light);
    return { nodes: [g], dispose() { group.remove(g); ring.geometry.dispose(); disc.geometry.dispose(); }, update(dt, t) { ring.rotation.z = t * 0.6; disc.material.opacity = 0.35 + 0.2 * Math.sin(t * 3); light.intensity = 1.4 + 0.5 * Math.sin(t * 2.3); } };
  };
  // logs leaned in a cone: each rests on the ground ring and meets the others near the top
  const logMat = new THREE.MeshStandardMaterial({ map: tex(A + "textures/bark/Trunk_02.png"), roughness: 1, color: new THREE.Color(2.1, 1.7, 1.3), emissive: 0x3a2412 });
  const logGeo = (r0, r1, len) => new THREE.CylinderGeometry(r1, r0, len, 7).translate(0, len / 2, 0);
  const LOG_BIG = logGeo(0.06, 0.045, 1.0), LOG_SMALL = logGeo(0.035, 0.025, 0.7);
  function teepee(yaw, seed) {
    const g = new THREE.Group(), up = new THREE.Vector3(0, 1, 0), N = 7;
    for (let i = 0; i < N + 3; i++) {
      const big = i < N, a = yaw + (big ? i / N : (i - N + 0.5) / 3) * Math.PI * 2 + (hash(seed, i, 1) - 0.5) * 0.25;
      const rb = big ? 0.3 + hash(seed, i, 2) * 0.05 : 0.2, top = big ? 0.8 + hash(seed, i, 3) * 0.1 : 0.5;
      const from = new THREE.Vector3(Math.cos(a) * rb, 0.04, Math.sin(a) * rb), to = new THREE.Vector3((hash(seed, i, 4) - 0.5) * 0.08, top, (hash(seed, i, 5) - 0.5) * 0.08);
      const m = new THREE.Mesh(big ? LOG_BIG : LOG_SMALL, logMat); m.position.copy(from);
      m.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize()); m.rotateY(hash(seed, i, 6) * 6.28); m.castShadow = true; g.add(m);
    }
    return g;
  }
  R.campfire = (obj, tx, ty) => {
    const [cx, cz] = tileCenter(tx, ty), y = terrain.heightAt(cx, cz);
    // a ring of stones (City Builder's fire-ring piece) with the logs leaned together into a teepee over the flames
    const { group: pieces } = CB.buildStructureMeshes({ name: "campfire", pieces: [CBpiece("fire-ring", 0, 0, 0, { yaw: hash(tx, ty, 6) * 6.28 })] }, { seed: tx * 131 + ty, plain: true });
    const lit = (obj.meta?.fireT ?? 0) > 0;
    if (lit) pieces.add(teepee(hash(tx, ty, 7) * 6.28, tx * 131 + ty));
    pieces.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const g = new THREE.Group(); g.position.set(cx, y + 0.02, cz); g.add(pieces);
    if (!lit) {   // burnt out: the stone ring stays (so it can be lit again), with a patch of ash and a couple of charred stubs
      const ash = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18).rotateX(-Math.PI / 2).translate(0, 0.05, 0), new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 1 }));
      g.add(ash);
      for (let i = 0; i < 3; i++) { const a = hash(tx, ty, 120 + i) * 6.28, stub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.34, 6), new THREE.MeshStandardMaterial({ color: 0x1f1b18, roughness: 1 })); stub.position.set(Math.cos(a) * 0.14, 0.12, Math.sin(a) * 0.14); stub.rotation.set(0.9 * (hash(tx, ty, 130 + i) - 0.5), a, 1.1); g.add(stub); }
      group.add(g);
      return { nodes: [g], setHidden(h) { g.visible = !h; }, dispose() { group.remove(g); } };
    }
    // flame flipbook + the smoke emitter from City Builder's FireVfx, each campfire out of step with the others
    const off = hash(tx, ty, 90) * 64;
    const flame = createFlipbook({ file: "fire_01_8x8.tga", w: 1.0, h: 1.15, fps: 30, offset: off, intensity: 1.2, tint: [1, 0.72, 0.44] }); flame.position.y = 0.12;
    const flame2 = createFlipbook({ file: "fire_01_8x8.tga", w: 0.75, h: 0.86, fps: 30, offset: off + 27, intensity: 1.0, tint: [1, 0.54, 0.25] }); flame2.position.set(0.12, 0.12, -0.08);
    const smoke = createSmokeEmitter(); g.add(smoke.group, flame, flame2);
    const light = new THREE.PointLight(0xff8a3c, 10, 30, 1.0); light.position.y = 0.8; g.add(light); group.add(g);
    return { nodes: [g], setHidden(h) { g.visible = !h; }, dispose() { group.remove(g); smoke.dispose(); for (const m of [flame, flame2]) { m.geometry.dispose(); m.material.dispose(); } }, update(dt, t) { for (const m of [flame, flame2]) m.userData.tick(t); smoke.update(dt); light.intensity = 9 + 2.6 * Math.sin(t * 13) * Math.sin(t * 5); } };
  };
  // ---------- furniture inside built houses ----------
  // Each catalog piece is an object id (f_...). The model loads the first time one is seen; the object is a plain group in the meantime.
  const FURN_ALIAS = { counter: "f_cupboard_c", stove: "f_oven", refrigerator: "f_fridge_a", cupboard: "f_cupboard_a", bed: "f_bed_double", bookshelf: "f_shelf_d", chair_right: "f_chair_a", chair_left: "f_chair_a", dresser: "f_drawer_a", sink: "f_cupboard_sink", table: "f_table_a" };
  const floorAt = (tx, ty, cx, cz) => { const hit = curMap && roomAtTile(structuresOf(curMap), tx, ty); return hit ? (hit.structure.floorY ?? 0) + FLOOR_TOP : terrain.heightAt(cx, cz); };
  const furnitureRecipe = (def, rotOverride) => (obj, tx, ty) => {
    const [cx, cz] = tileCenter(tx, ty), g = new THREE.Group(); g.position.set(cx, floorAt(tx, ty, cx, cz), cz); group.add(g);
    let dead = false, hidden = false;
    furnitureTemplate(def).then((tpl) => { if (dead || !tpl) return; g.add(furnitureNode(def, tpl, rotOverride ?? obj.meta?.rot ?? 0)); });
    return { nodes: [g], setHidden(h) { hidden = h; g.visible = !h; }, dispose() { dead = true; group.remove(g); } };
  };
  for (const def of furnitureDefs()) R[def.id] = furnitureRecipe(def);
  for (const [old, id] of Object.entries(FURN_ALIAS)) { const def = furnitureDefs().find((d) => d.id === id); if (def && !R[old]) R[old] = furnitureRecipe(def, 0); }
  // the workbench: a heavy plank top on stout legs with a low shelf, a vise on one end and a mallet and a saw lying on top (not a dining table)
  const benchWood = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.9 }), benchTop = new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.85 }), benchIron = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.5, metalness: 0.7 });
  const bx = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
  R.workbench = (obj, tx, ty) => {
    const [cx, cz] = tileCenter(tx, ty), g = new THREE.Group(), L = 1.5, D = 0.72, H = 0.92;
    g.add(bx(L, 0.12, D, benchTop, 0, H, 0));                                                    // thick top
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(bx(0.13, H - 0.06, 0.13, benchWood, sx * (L / 2 - 0.12), (H - 0.06) / 2, sz * (D / 2 - 0.1)));
    g.add(bx(L - 0.2, 0.07, D - 0.14, benchWood, 0, 0.3, 0));                                    // low shelf
    g.add(bx(L - 0.2, 0.1, 0.06, benchWood, 0, H - 0.14, D / 2 - 0.08));                        // apron
    g.add(bx(0.2, 0.14, 0.16, benchIron, -L / 2 + 0.2, H + 0.13, D / 2 - 0.12)); g.add(bx(0.06, 0.2, 0.2, benchIron, -L / 2 + 0.2, H + 0.1, D / 2 + 0.06));   // vise
    const sawBlade = bx(0.55, 0.02, 0.1, benchIron, 0.28, H + 0.07, 0.1); sawBlade.rotation.y = 0.25; g.add(sawBlade);                       // saw
    const sawGrip = bx(0.14, 0.05, 0.05, benchWood, 0.6, H + 0.09, 0.03); sawGrip.rotation.y = 0.25; g.add(sawGrip);
    const handle = bx(0.3, 0.04, 0.04, benchWood, -0.15, H + 0.08, -0.15); handle.rotation.y = -0.5; g.add(handle); const head = bx(0.1, 0.09, 0.07, benchIron, -0.3, H + 0.1, -0.2); head.rotation.y = -0.5; g.add(head);   // mallet
    g.add(bx(0.4, 0.05, 0.22, benchWood, 0.3, 0.355 + 0.03, 0.02)); g.add(bx(0.36, 0.05, 0.2, benchWood, 0.32, 0.405 + 0.03, 0.02));          // scrap planks on the shelf
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(cx, terrain.heightAt(cx, cz), cz); g.rotation.y = Math.round(hash(tx, ty, 6) * 2) * Math.PI / 2; group.add(g);
    return { nodes: [g], setHidden(h) { g.visible = !h; }, dispose() { group.remove(g); g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); } };
  };
  // the stockpile: three crates on the ground; as it fills, one crate is stacked on top, then a second
  R.stockpile = (obj, tx, ty) => {
    const [cx, cz] = tileCenter(tx, ty), y = terrain.heightAt(cx, cz), ch = M.crate?.size?.y ?? 0.7;
    const hs = [
      place("crate", M.crate, cx - 0.42, cz - 0.28, { yaw: 0.1 }), place("crate", M.crate, cx + 0.38, cz - 0.2, { yaw: -0.25 }), place("crate", M.crate, cx - 0.02, cz + 0.45, { yaw: 0.45 }),
      place("crate", M.crate, cx - 0.42, cz - 0.28, { y: y + ch * 0.98, yaw: -0.12, scale: 0.97 }), place("crate", M.crate, cx + 0.38, cz - 0.2, { y: y + ch * 0.98, yaw: 0.3, scale: 0.97 }),
    ];
    let hidden = false, fill = -1, acc = 0;
    const apply = () => { const levels = fill >= 0 ? [fill >= 6, fill >= 14] : [false, false]; hs.forEach((h, i) => { if (h) set.setVisible(h, !hidden && (i < 3 || levels[i - 3])); }); };
    return {
      setHidden(h) { hidden = h; apply(); },
      dispose() { for (const h of hs) if (h) set.remove(h); },
      update(dt) {
        acc += dt; if (acc < 0.4 && fill !== -1) return; acc = 0;
        const sp = typeof getStockpileByKey === "function" ? getStockpileByKey(obj.meta?.key) : null, n = sp ? sp.inv.length : 0;   // stacks inside
        if (n !== fill) { fill = n; apply(); }
      },
    };
  };
  R.wild_bananas = (obj, tx, ty) => { const [cx, cz] = tileCenter(tx, ty); return instanced([0, 1, 2].map((i) => place("banana", M.banana, cx + (i - 1) * 0.28, cz + (i % 2) * 0.2 - 0.1, { yaw: hash(tx, ty, 30 + i) * 6.28 }))); };
  R.wild_oranges = (obj, tx, ty) => { const [cx, cz] = tileCenter(tx, ty); return instanced([0, 1, 2].map((i) => place("orangeFruit", M.orangeFruit, cx + Math.cos(i * 2.1) * 0.28, cz + Math.sin(i * 2.1) * 0.28, { yaw: hash(tx, ty, 40 + i) * 6.28 }))); };

  // ---------- animals (tracked by object identity; glide between tiles) ----------
  const catQ = new THREE.Quaternion();
  const CAT_TUNE = window.__catTune = { axisLeg: new THREE.Vector3(1, 0, 0), axisTail: new THREE.Vector3(0, 0, 1), axisHead: new THREE.Vector3(0, 1, 0), axisNod: new THREE.Vector3(1, 0, 0), leg: 0.8, knee: 0.6, tail: 1, head: 1, jumpLeg: 1.0, petNod: -0.45, petTail: 0.9 };
  const ANIMAL_MODEL = { cat: "cat" };                    // static models
  const ANIMAL_RIG = { cow: "cowRig", chicken: "chickenRig" };   // rigged models
  const SPEED = { rabbit: 4.5, deer: 4.5, doe: 4.5, pig: 3.4, cat: 3.6, chicken: 3.2, squirrel: 3.6, rat1: 3.6, rat2: 3.6, cow: 1.8 };
  function animal(id) {
    return (obj, tx, ty) => {
      const rig = (ANIMAL_RIG[id] || (id === "cat" && "catRig")) && M[ANIMAL_RIG[id] || "catRig"], mk = ANIMAL_MODEL[id] && M[ANIMAL_MODEL[id]];
      let body, mixer = null, acts = {}, bones = {}, legs = [], hopH = 0.04;
      if (rig) {
        const inner = cloneSkinned(rig.tpl); inner.scale.setScalar(rig.s); if (id === "chicken") inner.rotation.y = Math.PI;   // the chicken model faces -z
        inner.position.y = rig.lift; inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        body = new THREE.Group(); body.add(inner); mixer = new THREE.AnimationMixer(inner);
        const clip = (...names) => names.map((n) => rig.clips[n]).find(Boolean);
        for (const [k, names] of Object.entries({ idle: ["iddle"], walk: ["walk", "walking"], run: ["run"] })) { const c = clip(...names); if (c) { acts[k] = mixer.clipAction(c); acts[k].play(); acts[k].setEffectiveWeight(k === "idle" ? 1 : 0); } }
        inner.traverse((o) => { if (o.isBone) bones[o.name] = o; });
        for (const b of Object.values(bones)) { b.userData.rest = b.rotation.clone(); b.userData.q0 = b.quaternion.clone(); }
        mixer.update(hash(tx, ty, 4) * 3);       // each animal starts at its own point in the animation
      } else if (M[id + "Wild"]) {
        const wl = M[id + "Wild"], inner = wl.tpl.clone(true); inner.scale.setScalar(wl.s); inner.position.y = wl.lift; inner.rotation.y = wl.yaw;
        body = new THREE.Group(); body.add(inner); inner.traverse((o) => { if (o.name.startsWith("leg")) legs.push([o, wl.w.legs[+o.name.slice(3)]]); }); hopH = wl.w.hop ?? 0;
      } else body = mk ? partsToGroup(mk) : critter(...PLACEHOLDER[id] || [0.6, 0.5, 0xaaaaaa]);
      const root = new THREE.Group(); root.add(body); group.add(root);
      const [cx, cz] = tileCenter(tx, ty); root.position.set(cx, terrain.heightAt(cx, cz), cz); root.rotation.y = hash(tx, ty, 6) * 6.28;
      const ent = { tx, ty, moving: 0, phase: hash(tx, ty, 2) * 6.28, root, nodes: [root], perch: obj.meta?.perch, petUntil: obj.meta?.petUntil };
      let blend = 0, peck = 0, nextPeck = 1 + hash(tx, ty, 9) * 4;
      let lastPerch = ent.perch ? ent.perch.x + "," + ent.perch.y + (ent.perch.lap != null ? "L" : "") : "", jump = null, pet = 0;     // the cat hops onto / off furniture
      ent.dispose = () => { group.remove(root); mixer?.stopAllAction(); };
      ent.update = (dt, t) => {
        const perch = id === "cat" ? ent.perch : null;
        const [wx0, wz0] = perch ? tileCenter(perch.x, perch.y) : tileCenter(ent.tx, ent.ty);
        const lapOff = perch && perch.lap != null ? 0.18 : 0, wx = wx0 + Math.sin(perch?.yaw || 0) * lapOff, wz = wz0 + Math.cos(perch?.yaw || 0) * lapOff;   // on a lap: over the knees, not the middle of the chair
        const dx = wx - root.position.x, dz = wz - root.position.z, d = Math.hypot(dx, dz);
        const surfY = perch ? floorAt(perch.x, perch.y, wx0, wz0) + perch.h : (id === "cat" ? floorAt(ent.tx, ent.ty, root.position.x, root.position.z) : terrain.heightAt(root.position.x, root.position.z));
        if (id === "cat") {
          const key = perch ? perch.x + "," + perch.y + (perch.lap != null ? "L" : "") : "";
          if (key !== lastPerch) { lastPerch = key; jump = { t: 0, x0: root.position.x, z0: root.position.z, y0: root.position.y, dur: 0.6 }; }
        }
        if (jump) {   // a hop up onto (or down from) furniture: straight line over the ground, an arc in height
          jump.t += dt; const k = Math.min(1, jump.t / jump.dur), e = k * k * (3 - 2 * k), rise = surfY - jump.y0;
          root.position.x = jump.x0 + (wx - jump.x0) * e; root.position.z = jump.z0 + (wz - jump.z0) * e;
          root.position.y = jump.y0 + rise * e + Math.sin(Math.PI * k) * (0.32 + Math.abs(rise) * 0.5);
          const ddx = wx - jump.x0, ddz = wz - jump.z0; if (Math.hypot(ddx, ddz) > 0.05) { let dy = Math.atan2(ddx, ddz) - root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); root.rotation.y += dy * Math.min(1, dt * 14); }
          ent.air = Math.sin(Math.PI * k); ent.airK = k; ent.airUp = rise >= 0 ? 1 : -0.5;
          if (k >= 1) { jump = null; ent.air = 0; }
        } else ent.air = 0;
        if (!jump && d > 0.02) {
          const step = Math.min(d, (ent.run ? Math.max(SPEED[id] ?? 2.6, 8) : SPEED[id] ?? 2.6) * dt);
          root.position.x += dx / d * step; root.position.z += dz / d * step;
          let dy = Math.atan2(dx, dz) - root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); root.rotation.y += dy * Math.min(1, dt * 10);
          ent.moving = 1;
        } else {
          if (jump) ent.moving = 1; else ent.moving = 0;
          if (!jump && ent.fx != null) { let dy = Math.atan2(ent.fx, ent.fy) - root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); root.rotation.y += dy * Math.min(1, dt * 6); }   // standing: look where the game says it faces
        }
        blend += ((ent.moving ? 1 : 0) - blend) * Math.min(1, dt * 6);
        if (mixer) {
          if (acts.walk && acts.idle) { acts.walk.setEffectiveWeight(blend); acts.idle.setEffectiveWeight(1 - blend); acts.walk.timeScale = (ent.run ? 1.8 : 0.9) + 0.4 * blend; }
          mixer.update(dt);
        }
        if (id === "cat" && rig) {   // the cat is rigged but ships no clips: walk / trot / idle are driven bone by bone (three.js strips the dots from bone names)
          const C = CAT_TUNE, run = ent.run ? 1 : 0, f = C.freeze ?? (t * (run ? 15 : 9) + ent.phase), bl = C.blendOverride ?? blend, amp = bl * (run ? 0.75 : 0.5);
          const turn = (name, ax, ang) => { const b = bones[name]; if (b) { catQ.setFromAxisAngle(ax, ang); b.quaternion.copy(b.userData.q0).multiply(catQ); } };
          for (const [side, sg] of [["L", 1], ["R", -1]]) {
            const rearPh = Math.sin(f + (side === "L" ? 0 : Math.PI)), frontPh = -rearPh;   // diagonal pairs move together
            turn(`DEF-thigh${side}`, C.axisLeg, rearPh * amp * C.leg);
            turn(`DEF-shin${side}`, C.axisLeg, (Math.max(0, Math.cos(f + (side === "L" ? 0 : Math.PI))) * bl * 0.9) * C.knee);
            turn(`DEF-front_thigh${side}`, C.axisLeg, frontPh * amp * C.leg);
            turn(`DEF-front_shin${side}`, C.axisLeg, (Math.max(0, -Math.cos(f + (side === "L" ? 0 : Math.PI))) * bl * 0.8) * C.knee);
          }
          const tail = ["DEF-spine", "DEF-spine001", "DEF-spine002", "DEF-spine003"];
          tail.forEach((n, i) => turn(n, C.axisTail, Math.sin(t * (ent.moving ? 5 : 1.6) + ent.phase - i * 0.7) * (ent.moving ? 0.22 : 0.3) * C.tail + (ent.moving ? 0.12 : 0)));
          pet += ((Date.now() < (ent.petUntil || 0) ? 1 : 0) - pet) * Math.min(1, dt * 6);
          const air = ent.air || 0;
          if (air > 0.01) for (const [n, sg] of [["DEF-front_thighL", -1], ["DEF-front_thighR", -1], ["DEF-thighL", 1], ["DEF-thighR", 1]]) turn(n, C.axisLeg, sg * air * C.jumpLeg);   // reaches out in the air
          turn("head", C.axisHead, ent.moving ? 0 : Math.sin(t * 0.7 + ent.phase * 3) * 0.5 * C.head * (1 - pet));   // looks about while standing
          if (pet > 0.01) { turn("neck", C.axisNod, C.petNod * pet); turn("head", C.axisNod, C.petNod * 0.6 * pet); tail.forEach((n, i) => turn(n, C.axisTail, Math.sin(t * 9 + i) * 0.1 * pet)); }   // chin up into the hand, tail up and quivering
          body.scale.y = 1 + Math.sin(t * 2.2 + ent.phase) * 0.012 * (1 - blend) + Math.sin(t * 26) * 0.006 * pet;   // breathing, and a purr
          body.position.y = ent.moving ? Math.abs(Math.sin(f)) * 0.012 * (1 + run) : 0;
          body.rotation.x = jump ? -0.4 * Math.cos(Math.PI * (ent.airK || 0)) * (ent.airUp || 1) : 0;               // nose up on take-off, down on landing
        } else if (id === "chicken") {      // no clips ship with the chicken: swing the legs by hand, and peck now and then
          const swing = Math.sin(t * 16 + ent.phase) * 0.9 * blend;
          for (const n of ["legL", "legR"]) { const b = bones[n]; if (b) b.rotation.x = b.userData.rest.x + (n === "legL" ? swing : -swing); }
          nextPeck -= dt; if (!ent.moving && nextPeck < 0) { peck = 0.45; nextPeck = 2 + Math.random() * 4; }
          peck = Math.max(0, peck - dt); body.rotation.x = -Math.sin((1 - peck / 0.45) * Math.PI) * (peck > 0 ? 0.55 : 0);
        } else if (!mixer) {
          const hop = ent.moving ? Math.abs(Math.sin(t * (ent.run ? 16 : 10) + ent.phase)) * hopH : 0; body.position.y = hop; body.rotation.z = ent.moving ? Math.sin(t * 10 + ent.phase) * 0.05 : 0;
          for (const [leg, sign] of legs) leg.rotation.z = Math.sin(t * (ent.run ? 16 : 9) + ent.phase) * (ent.run ? 0.8 : 0.55) * blend * sign;
        }
        if (id === "cat") { if (!jump) root.position.y += (surfY - root.position.y) * Math.min(1, dt * 14); }
        else root.position.y = terrain.heightAt(root.position.x, root.position.z) + (id === "chicken" ? (ent.moving ? Math.abs(Math.sin(t * 16 + ent.phase)) * 0.03 : 0) : 0);
      };
      return ent;
    };
  }
  for (const id of ["cow", "chicken", "cat", "deer", "doe", "pig", "goat", "squirrel", "rat1", "rat2", "rabbit", "duck", "swan"]) R[id] = animal(id);

  // ---------- dropped items: a small model (or sack) bobbing over a soft ring ----------
  const ITEM_FILE = { banana: "food/banana.glb", orange: "food/orange.glb", watermelon: "food/watermelon.glb", soda_blue: "food/sodablue.glb", soda_green: "food/sodagreen.glb", soda_red: "food/sodared.glb",
    apple_juice: "food/applejuicegfx.glb", grape_juice: "food/grapejuicegfx.glb", orange_juice: "food/orangejuicegfx.glb", cooking_pot: "food/cookingpot.glb", frying_pan: "food/pan.glb", kitchen_knife: "food/knife2.glb", cooking_spoon: "food/spoonlong.glb",
    mixing_bowl: "household/Mixing Bowls/mbowl_mixing_bowl.glb", cutting_board: "food/cuttingboard.glb", kettle: "household/Misc/misc_kettle.glb", juicer: "household/Misc/Juicers/juicer_manual.glb",
    grapes: "food/grape.glb", milk: "food/milk.glb", doughnut: "food/donutwithsparklepink.glb", coffee: "food/mugred.glb", knife: "food/knife2.glb", pot_roast: "food/cookingpot.glb",
    banana_pancakes: "food/plate.glb", banana_bread: "food/plate.glb", berry_tart: "food/plate.glb", guacamole: "food/bowl.glb", avocado_toast: "food/plate.glb", chili_con_carne: "food/bowl.glb", pea_soup: "food/bowl.glb", veggie_stir_fry: "food/plate.glb", orange_chicken: "food/plate.glb", tropical_fruit_salad: "food/bowl.glb", hearty_stew: "food/bowl.glb", potato_soup: "food/bowl.glb", chicken_stew: "food/bowl.glb", tomato_soup: "food/bowl.glb", mushroom_soup: "food/bowl.glb", vegetable_soup: "food/bowl.glb", corn_chowder: "food/bowl.glb", cheese_brocolli_soup: "food/bowl.glb", salad: "food/bowl.glb", fruit_salad: "food/bowl.glb",
    cheeseburger: "food/plate.glb", fries: "food/plate.glb", scrambled_eggs: "food/plate.glb", fried_egg: "food/plate.glb", omelette: "food/plate.glb", grilled_cheese: "food/plate.glb", toast: "food/plate.glb", baked_potato: "food/plate.glb", mashed_potatoes: "food/plate.glb", roasted_veggies: "food/plate.glb",
    chicken_sandwich: "food/plate.glb", ham_sandwich: "food/plate.glb", fish_sandwich: "food/plate.glb", egg_sandwich: "food/plate.glb", ham_cheese_sandwich: "food/plate.glb", roasted_fish_brocolli: "food/plate.glb", grilled_shrimp_veggies: "food/plate.glb", fried_shrimp_mushrooms: "food/plate.glb", cooked_meat: "food/plate.glb", cooked_chicken: "food/plate.glb", cooked_fish: "food/plate.glb", cooked_ham: "food/plate.glb", cooked_shrimp: "food/plate.glb",
    apple: "props/amipolygon-food/GLB/apple_1a.glb", egg: "props/amipolygon-food/GLB/egg_2.glb", mushroom: "props/amipolygon-food/GLB/mushroom_1a.glb", cheese: "props/amipolygon-food/GLB/cheese_2.glb", carrot: "props/amipolygon-food/GLB/carrot_1.glb", tomato: "props/amipolygon-food/GLB/tomato_1.glb", bread_loaf: "props/amipolygon-food/GLB/bread_2a.glb", raw_meat: "props/amipolygon-food/GLB/meat_1.glb", avacado: "props/amipolygon-food/GLB/avocado_2.glb", pizza: "props/amipolygon-food/GLB/pizza_1.glb", wood: "props/small-props/CutedWood_1_A.glb", fishing_pole: "props/small-props/FishingRod_A.glb" };
  const itemModels = new Map(); let sack = null;
  async function itemModel(itemId) {
    if (!itemModels.has(itemId)) {
      const f = ITEM_FILE[itemId];
      itemModels.set(itemId, f ? await L(MODELS + encodeURI(f), { footprint: 0.34 }) : null);
    }
    return itemModels.get(itemId);
  }
  sack = await L(`${MODELS}props/small-props/Bag_1_A.glb`, { footprint: 0.34 });
  await Promise.all(Object.keys(ITEM_FILE).map(itemModel));
  R.dropped_item = (obj, tx, ty) => {
    const itemId = obj.meta?.itemId, mdl = itemModels.get(itemId) || sack;
    const [cx, cz] = tileCenter(tx, ty), y0 = terrain.heightAt(cx, cz);
    const g = mdl ? partsToGroup(mdl) : new THREE.Mesh(new THREE.OctahedronGeometry(0.16), flat(0xffd36b));
    const ring = place("glow", M.glow, cx, cz, {});
    const root = new THREE.Group(); root.add(g); root.position.set(cx, y0 + 0.28, cz); group.add(root);
    return { setHidden(h) { root.visible = !h; if (ring) set.setVisible(ring, !h); }, dispose() { group.remove(root); set.remove(ring); }, update(dt, t) { root.position.y = y0 + 0.28 + Math.sin(t * 2 + tx) * 0.05; root.rotation.y = t * 0.8 + ty; } };
  };

  // ---------- dungeon-only props ----------
  let curMap = null;
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.55, metalness: 0.8 });
  const stoneStep = new THREE.MeshStandardMaterial({ color: 0x8a8782, roughness: 0.95 });
  const solidAt = (x, y) => curMap?.tiles?.[y]?.[x] !== "floor";
  const spansX = (tx, ty) => solidAt(tx, ty - 1) && solidAt(tx, ty + 1);       // walls north and south: the corridor runs east-west, the gate fills it across z? no: bars lie along the open direction's cross-section
  function gateGroup(tx, ty, open) {
    const [cx, cz] = tileCenter(tx, ty), g = new THREE.Group(); g.position.set(cx, 0, cz);
    const acrossX = solidAt(tx, ty - 1) && solidAt(tx, ty + 1) ? false : true;   // corridor runs along x when walls are to the north and south: the gate stands in the z-x plane facing it
    const alongX = solidAt(tx, ty - 1) && solidAt(tx, ty + 1);
    g.rotation.y = alongX ? Math.PI / 2 : 0;
    const post = (x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.7, 0.3), stoneStep); m.position.set(x, 1.35, 0); g.add(m); };
    post(-0.95); post(0.95);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.3, 0.3), stoneStep); lintel.position.set(0, 2.55, 0); g.add(lintel);
    if (!open) {
      for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.06), ironMat); b.position.set(-0.8 + i * 0.2, 1.2, 0); g.add(b); }
      for (const y of [0.5, 1.3, 2.0]) { const r = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.07, 0.07), ironMat); r.position.set(0, y, 0); g.add(r); }
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.1), new THREE.MeshStandardMaterial({ color: 0xc9a23c, metalness: 0.8, roughness: 0.4 })); lock.position.set(0, 1.25, 0.08); g.add(lock);
    }
    g.traverse((o) => { o.castShadow = false; }); group.add(g);
    return { dispose() { group.remove(g); g.traverse((o) => o.geometry?.dispose()); } };
  }
  R.dungeon_gate = (obj, tx, ty) => gateGroup(tx, ty, false);
  R.dungeon_gate_open = (obj, tx, ty) => gateGroup(tx, ty, true);
  R.dungeon_exit = (obj, tx, ty) => {
    const [cx, cz] = tileCenter(tx, ty), g = new THREE.Group(); g.position.set(cx, 0, cz);
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.5), stoneStep); s.position.set(0, 0.09 + i * 0.18, 0.55 - i * 0.4); g.add(s); }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.0), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    glow.position.set(0, 1.6, -0.8); g.add(glow);
    const light = new THREE.PointLight(0xfff0c0, 6, 12, 1.6); light.position.set(0, 1.6, 0); g.add(light); group.add(g);
    return { dispose() { group.remove(g); g.traverse((o) => o.geometry?.dispose()); }, update(dt, t) { glow.material.opacity = 0.2 + 0.07 * Math.sin(t * 2.4); light.intensity = 5.5 + Math.sin(t * 3) * 0.6; } };
  };
  const runeTex = new Map();
  R.rune_clue = (obj, tx, ty) => {
    const n = obj.meta?.rune ?? 1; if (!runeTex.has(n)) { const t = texLoader.load(`src/icons/rune${n}.png`); t.colorSpace = THREE.SRGBColorSpace; runeTex.set(n, t); }
    const [cx, cz] = tileCenter(tx, ty);
    const rm = new THREE.MeshBasicMaterial({ map: runeTex.get(n), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    rm.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "diffuseColor = vec4(vec3(0.45, 0.85, 1.0) * 1.6, texture2D(map, vMapUv).a);"); };   // the glyph png is dark: keep its shape, paint it glowing
    rm.customProgramCacheKey = () => "rune-glow";
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2), rm);
    m.position.set(cx, 0.04, cz); m.rotation.y = hash(tx, ty, 8) * 6.28; m.renderOrder = 4; group.add(m);
    return { nodes: [m], dispose() { group.remove(m); m.geometry.dispose(); m.material.dispose(); }, update(dt, t) { m.material.opacity = 0.65 + 0.3 * Math.sin(t * 1.7 + tx); } };
  };

  // ---------- the sync loop ----------
  const ents = new Map();      // object -> { id, sig, ent, frame }
  let frame = 0, lastWorld = null;
  const sigOf = (o) => `${o.id}|${o.meta?.rot ?? ""}|${o.meta?.depleted ? 1 : 0}|${o.meta?.itemId ?? ""}|${o.meta && "fireT" in o.meta ? ((o.meta.fireT ?? 0) > 0 ? 1 : 0) : ""}`;   // (a campfire that goes out or is re-lit gets rebuilt)
  const skip = new Set(["occupied", "fish_spot", "build_site", "foundation", "framing", "house"]); // fish spots = ripples (shore.js); buildings come later

  function clearAll() { for (const e of ents.values()) e.ent?.dispose?.(); ents.clear(); }

  return {
    set, group, models: M, recipes: R,
    entries() { const out = []; for (const [obj, rec] of ents) if (rec.ent) out.push({ obj, tx: rec.tx, ty: rec.ty, h: rec.ent.occ?.h }); return out; },   // h: real height (trees, bushes) so a tap on the crown counts too
    /** Fade trees and bushes that cover any of `targets` (world points) on screen: the player is inside the crown's outline and the tree is nearer the camera. */
    fadeOccluders(cam, targets, dt) {
      const camera = cam.isCamera ? cam : null; if (!camera) return;
      const v = new THREE.Vector3(), asp = camera.aspect;
      const tp = targets.map((t) => { v.copy(t).project(camera); return { x: v.x * asp, y: v.y, d: camera.position.distanceTo(t) }; });
      for (const rec of ents.values()) {
        const o = rec.ent?.occ; if (!o) continue;
        let hide = false;
        if (Math.abs(o.x - camera.position.x) < 60 && Math.abs(o.z - camera.position.z) < 60) {
          const c = new THREE.Vector3(o.x, o.y + o.h * 0.62, o.z), dist = camera.position.distanceTo(c);
          v.copy(c).project(camera); const cx = v.x * asp, cy = v.y;
          const e = new THREE.Vector3(o.x, o.y + o.h * 0.62, o.z).add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(o.r)); v.copy(e).project(camera);
          const rad = Math.hypot(v.x * asp - cx, v.y - cy);
          for (const t of tp) if (dist < t.d + 0.5 && Math.hypot(t.x - cx, t.y - cy) < rad * 1.05) { hide = true; break; }
        }
        const target = hide ? 0.18 : 1, next = o.fade + (target - o.fade) * Math.min(1, dt * 7);
        if (Math.abs(next - o.fade) > 0.004) { o.fade = next; for (const h of o.handles) set.setFade(h, next); o.onFade?.(next); }
      }
    },
    shakeAt(tx, ty) { for (const rec of ents.values()) if (rec.tx === tx && rec.ty === ty) rec.ent?.shake?.(); },
    stats() { return { entities: ents.size, instanceKeys: set.recs.size }; },
    sync(world, dt, t) {
      if (world !== lastWorld) { clearAll(); lastWorld = world; }
      curMap = world;
      frame++;
      const objs = world.objects, H = objs.length, W = objs[0].length, fresh = [];
      for (let y = 0; y < H; y++) {
        const row = objs[y];
        for (let x = 0; x < W; x++) {
          const o = row[x]; if (!o) continue;
          let rec = ents.get(o);
          if (rec) {
            rec.frame = frame; if (rec.ent) { rec.ent.run = !!o.meta?.run; rec.ent.fx = o.meta?.fx; rec.ent.fy = o.meta?.fy; rec.ent.perch = o.meta?.perch; rec.ent.petUntil = o.meta?.petUntil; }
            const s = sigOf(o);
            if (s !== rec.sig) { rec.ent?.dispose?.(); rec.ent = skip.has(o.id) ? null : R[o.id]?.(o, x, y) ?? null; rec.sig = s; rec.tx = x; rec.ty = y; }
            else if (rec.tx !== x || rec.ty !== y) { rec.tx = x; rec.ty = y; if (rec.ent) { rec.ent.tx = x; rec.ent.ty = y; } }
          } else if (ANIMAL_IDS.has(o.id)) fresh.push([o, x, y]);   // the game re-creates an animal's object on every step: matched to its old entity below
          else {
            let ent = null;
            if (!skip.has(o.id) && R[o.id]) { try { ent = R[o.id](o, x, y); } catch (e) { console.warn("[objects] spawn failed for", o.id, e); } }
            else if (!skip.has(o.id) && !warned.has(o.id)) { warned.add(o.id); console.warn("[objects] no 3D recipe for", o.id); }
            ents.set(o, { sig: sigOf(o), ent, frame, tx: x, ty: y });
          }
        }
      }
      if (fresh.length) {
        const stale = [...ents].filter(([, r]) => r.frame !== frame && r.ent && r.animal);
        for (const [o, x, y] of fresh) {
          let best = -1, bd = 3;      // the same kind of animal that just vanished within 2 tiles is this one, one step on
          stale.forEach(([so, r], i) => { if (r && r.animal === o.id) { const d = Math.max(Math.abs(r.tx - x), Math.abs(r.ty - y)); if (d < bd) { bd = d; best = i; } } });
          if (best >= 0) { const [so, r] = stale[best]; stale[best] = [so, null]; ents.delete(so); r.ent.tx = x; r.ent.ty = y; r.ent.run = !!o.meta?.run; r.ent.fx = o.meta?.fx; r.ent.fy = o.meta?.fy; r.ent.perch = o.meta?.perch; r.ent.petUntil = o.meta?.petUntil; ents.set(o, { sig: sigOf(o), ent: r.ent, frame, tx: x, ty: y, animal: o.id, hidden: r.hidden, hiddenEnt: r.hiddenEnt }); continue; }
          let ent = null;
          if (!skip.has(o.id) && R[o.id]) { try { ent = R[o.id](o, x, y); } catch (e) { console.warn("[objects] spawn failed for", o.id, e); } }
          ents.set(o, { sig: sigOf(o), ent, frame, tx: x, ty: y, animal: o.id });
        }
      }
      for (const [o, rec] of ents) {
        if (rec.frame !== frame) { rec.ent?.dispose?.(); ents.delete(o); continue; }
        rec.ent?.update?.(dt, t);
        // fog of war: nothing is drawn on a tile the players haven't explored
        if (rec.ent) {
          const hide = fog && !window.__fogOff && !!world.explored && !world.explored[rec.ty]?.[rec.tx];
          if (rec.hidden !== hide || rec.hiddenEnt !== rec.ent) { rec.hidden = hide; rec.hiddenEnt = rec.ent; rec.ent.setHidden?.(hide); if (rec.ent.nodes) for (const n of rec.ent.nodes) n.visible = !hide; }
        }
      }
    },
  };
}
const warned = new Set();
const ANIMAL_IDS = new Set(["cow", "chicken", "cat", "deer", "doe", "pig", "goat", "squirrel", "rat1", "rat2", "rabbit", "duck", "swan"]);
