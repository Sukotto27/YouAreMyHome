// Furniture for built houses: the catalog (src/data/furniture.json, made by tools/gen_furniture.mjs), and the 3D models for it.
// Models load lazily the first time something needs them, so the game does not pull in 160 files at start-up.
//
// A placed piece is an ordinary world object { id: "f_bed_double", hp: 999, meta: { rot: 0..3 } } on a tile inside a room;
// "rot" turns it in quarter turns. Wall pieces (lights, shelves, windows...) sit against the wall of their tile (the back faces
// the way opposite to the rotation), ceiling pieces hang from the ceiling.
import * as THREE from "three";
import { loadParts } from "./instancer.js";
import { TILE_M } from "./config.js";
import { WALL_H } from "./building/model.js";

let woodTex = null;
const wood = () => woodTex ||= (() => { const t = new THREE.TextureLoader().load("assets3d/textures/furniture/wood.jpg"); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; })();

const BASE = "assets3d/models/";
export const FLOOR_TOP = 0.28;            // a house floor's surface above its floorY (foundation stone height)

let defs = null, loading = null;
const byId = new Map(), templates = new Map();

export function loadFurniture() {
  if (!loading) loading = fetch("src/data/furniture.json").then((r) => r.json()).then((list) => { defs = list; for (const d of list) byId.set(d.id, d); return list; }).catch((e) => { console.warn("[furniture] catalog failed:", e); defs = []; return defs; });
  return loading;
}
export const furnitureDefs = () => defs || [];
export const furnitureDef = (id) => byId.get(id) || null;
export const furnitureCategories = () => [...new Set(furnitureDefs().map((d) => d.cat))];

/** The model of a piece (loaded once): a Group centred on x/z with its base at y = 0, or null if it failed to load. */
export function furnitureTemplate(def) {
  if (!templates.has(def.id)) {
    const opts = def.height ? { height: def.height } : def.footprint ? { footprint: def.footprint } : { scale: def.scale || 1 };
    templates.set(def.id, loadParts(BASE + encodeURI(def.file), opts).then((m) => {
      const g = new THREE.Group();
      for (const p of m.parts) {
        let mat = p.material.clone();
        if (def.tex === "wood" && /wood/i.test(mat.name || "")) mat = new THREE.MeshStandardMaterial({ map: wood(), roughness: 0.85, name: mat.name });   // the pack ships plain material colours: put real wood on it
        mat.side = THREE.DoubleSide; const mesh = new THREE.Mesh(p.geometry, mat); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
      g.userData.size = m.size; return g;
    }).catch((e) => { console.warn("[furniture] model failed:", def.id, e?.message); return null; }));
  }
  return templates.get(def.id);
}

/** A clone of a loaded model, positioned inside its tile and turned by `rot` quarter turns. Origin = the tile's centre on the floor. */
export function furnitureNode(def, tpl, rot = 0, material = null) {
  const outer = new THREE.Group(), inner = tpl.clone(true), size = tpl.userData.size || new THREE.Vector3(1, 1, 1);
  if (material) inner.traverse((o) => { if (o.isMesh) { o.material = material; o.castShadow = false; o.receiveShadow = false; } });
  const back = def.wall ? -(TILE_M / 2 - size.z / 2 - 0.02) : 0;                     // wall pieces sit against the wall behind them
  inner.position.set(0, def.ceiling ? WALL_H - 0.08 - size.y : (def.wall ? def.y || 1.2 : 0), back);
  outer.add(inner); outer.rotation.y = (rot | 0) * Math.PI / 2;
  return outer;
}

/** Cost text such as "5 wood, 2 stone". */
export const furnitureCostText = (def) => Object.entries(def.cost || {}).map(([k, n]) => `${n} ${k}`).join(", ");
