// Lake dressing, ported from City Builder's LakeDressing.ts to tile-based lakes: lily pads and blossoms floating
// in the open water, cattail/calla clumps standing in the shallows, tall grass along the bank. Pond Kit models
// (CC0, authored in centimetres) sharing one texture atlas; deterministic per tile so it never flickers.
// Also the fishing-spot ripples.
import * as THREE from "three";
import { TGALoader } from "three/addons/loaders/TGALoader.js";
import { loadParts, InstanceSet } from "./instancer.js";
import { TILE_M, TERRAIN } from "./config.js";

const DIR = "assets3d/models/water/pond-kit/";
const ATLAS = "assets3d/textures/pond-kit/Pond_Plants_Atlas_2K.tga";

// Lily pads are ~25 cm in real life: drawn oversized so they read from the game camera (same multipliers as City Builder).
const PLANTS = {
  Water_Lily_Leaf_1: 5, Water_Lily_Leaf_2: 5, Water_Lily_Leaf_3: 5, Water_Lily_Leaf_4: 5,
  Water_Lily_Blossom_1: 4.5, Water_Lily_Blossom_2: 4.5, Water_Lily_Blossom_3: 4.5,
  CatTail_1: 1.8, CatTail_2: 1.8, CatTail_3: 1.8,
  Swamp_Calla_1: 2.2, Swamp_Calla_2: 2.2,
  Long_Grass_Patch_1: 2.4, Long_Grass_Patch_2: 2.4,
};
const LEAVES = ["Water_Lily_Leaf_1", "Water_Lily_Leaf_2", "Water_Lily_Leaf_3", "Water_Lily_Leaf_4"];
const BLOSSOMS = ["Water_Lily_Blossom_1", "Water_Lily_Blossom_2", "Water_Lily_Blossom_3"];
const CATTAILS = ["CatTail_1", "CatTail_2", "CatTail_3"];
const CALLAS = ["Swamp_Calla_1", "Swamp_Calla_2"];
const GRASSES = ["Long_Grass_Patch_1", "Long_Grass_Patch_2"];

function tileRand(x, y, salt) { // deterministic 0..1 from a tile coordinate
  let h = (x * 374761393 + y * 668265263 + salt * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export async function dressShores(world, terrain, scene) {
  const H = world.tiles.length, W = world.tiles[0].length;
  const isWater = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? true : world.tiles[y][x] === "water");
  const hasObj = (x, y) => !!world.objects?.[y]?.[x];
  // the open sea (water connected to the map's edge) gets no pond plants: only lakes and ponds do
  const sea = new Uint8Array(W * H), stack = [[0, 0]]; sea[0] = 1;
  while (stack.length) { const [x, y] = stack.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || sea[ny * W + nx] || world.tiles[ny][nx] !== "water") continue; sea[ny * W + nx] = 1; stack.push([nx, ny]); } }
  const isSea = (x, y) => x < 0 || y < 0 || x >= W || y >= H || sea[y * W + x] === 1;
  const distToLand = (x, y) => { // 1 = water tile touching land (8-neighbour), 2 = next ring, ...
    for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue; // the map's border ring doesn't count as land
      if (!isWater(xx, yy)) return r;
    }
    return 9;
  };

  const atlas = new TGALoader().load(ATLAS); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
  const models = {};
  await Promise.all(Object.entries(PLANTS).map(async ([name, mult]) => {
    try { models[name] = await loadParts(`${DIR}${name}.fbx`, { scale: 0.01 * mult, material }); } catch (e) { console.warn("[shore] missing", name, e.message); }
  }));

  const set = new InstanceSet(scene, { castShadow: false });
  const byTile = new Map();      // "x,y" -> handles on that tile, so the fog of war can hide them
  const pick = (list, r) => list[Math.floor(r * list.length) % list.length];
  const put = (name, tx, ty, salt, y0, spread = 0.8) => {
    const model = models[name]; if (!model) return;
    const x = (tx + 0.5 + (tileRand(tx, ty, salt + 1) - 0.5) * spread) * TILE_M, z = (ty + 0.5 + (tileRand(tx, ty, salt + 2) - 0.5) * spread) * TILE_M;
    const y = y0 ?? terrain.heightAt(x, z);
    const h = set.add(name, model, x, y, z, { yaw: tileRand(tx, ty, salt + 3) * Math.PI * 2, scale: 0.8 + tileRand(tx, ty, salt + 4) * 0.55 });
    const k = tx + "," + ty; (byTile.get(k) || byTile.set(k, []).get(k)).push(h);
  };

  let pads = 0, reeds = 0, grass = 0;
  for (let ty = 1; ty < H - 1; ty++) for (let tx = 1; tx < W - 1; tx++) {
    if (world.tiles[ty][tx] === "water") {
      if (hasObj(tx, ty) || isSea(tx, ty)) continue;      // fishing spots keep clear water; the open sea has no pond plants
      const d = distToLand(tx, ty);
      if (d === 1 && tileRand(tx, ty, 11) < 0.55) {      // reed bed at the edge
        const stems = 2 + Math.floor(tileRand(tx, ty, 12) * 4);
        for (let i = 0; i < stems; i++) { put(tileRand(tx, ty, 20 + i) < 0.8 ? pick(CATTAILS, tileRand(tx, ty, 30 + i)) : pick(CALLAS, tileRand(tx, ty, 40 + i)), tx, ty, 100 + i * 7, undefined, 0.9); reeds++; }
      } else if (d >= 2 && tileRand(tx, ty, 13) < 0.5) {  // lily pads in the open
        const n = 1 + Math.floor(tileRand(tx, ty, 14) * 3);
        for (let i = 0; i < n; i++) { put(tileRand(tx, ty, 50 + i) < 0.16 ? pick(BLOSSOMS, tileRand(tx, ty, 60 + i)) : pick(LEAVES, tileRand(tx, ty, 70 + i)), tx, ty, 200 + i * 5, TERRAIN.waterLevel + 0.03, 1.4); pads++; }
      }
    } else if (!hasObj(tx, ty)) {                         // tall grass on land touching the water
      let near = false; for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (isWater(tx + dx, ty + dy) && !isSea(tx + dx, ty + dy) && !(tx + dx < 1 || ty + dy < 1 || tx + dx >= W - 1 || ty + dy >= H - 1)) { near = true; break; }
      if (near && tileRand(tx, ty, 15) < 0.45) { put(pick(GRASSES, tileRand(tx, ty, 16)), tx, ty, 300, undefined, 1.0); grass++; }
    }
  }
  set.build();

  // ---- fishing-spot ripples: two expanding rings per spot ----
  const spots = [];
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) if (world.objects?.[ty]?.[tx]?.id === "fish_spot") spots.push([tx, ty]);
  const ringGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.5, depthWrite: false, fog: true });
  const rings = [];
  for (const [tx, ty] of spots) for (let k = 0; k < 2; k++) {
    const m = new THREE.Mesh(ringGeo, ringMat.clone()); m.position.set((tx + 0.5) * TILE_M, TERRAIN.waterLevel + 0.04, (ty + 0.5) * TILE_M); m.renderOrder = 3;
    m.userData.phase = tileRand(tx, ty, 77) + k * 0.5; m.userData.tile = tx + "," + ty; scene.add(m); rings.push(m);
  }
  console.log(`[shore] ${pads} lily pads, ${reeds} reeds, ${grass} grass tufts, ${spots.length} fishing spots`);
  const shown = new Map();
  return {
    set,
    /** Fog of war: show lily pads, reeds, grass and ripples only on explored tiles. */
    setExplored(ex) {
      const vis = (k) => { const [x, y] = k.split(",").map(Number); return !ex || !!ex[y]?.[x]; };
      for (const [k, hs] of byTile) { const v = vis(k); if (shown.get(k) !== v) { shown.set(k, v); for (const h of hs) set.setVisible(h, v); } }
      for (const m of rings) { const k = m.userData.tile; m.userData.hidden = !vis(k); m.visible = !m.userData.hidden; }
    },
    update(t) {
      for (const m of rings) { const p = (t * 0.45 + m.userData.phase) % 1; const s = 0.15 + p * 1.05; m.scale.set(s, 1, s); m.material.opacity = 0.55 * (1 - p) * Math.min(1, p * 6); }
    },
  };
}
