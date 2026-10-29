// Model loading for the 3D view: one entry point for glb/gltf/fbx/obj (+mtl), with caching and
// "pick one node out of a combined scene" support (vegetation.fbx, the farm pack, ...).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { TGALoader } from "three/addons/loaders/TGALoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

// FBX/OBJ files point at their textures by the original authoring paths, which don't exist here: those requests are
// redirected through assets3d/texture_index.json (basename -> served path; built by tools/build_texture_index.mjs).
let texIndex = {};
const legacyManager = new THREE.LoadingManager();
legacyManager.setURLModifier((url) => {
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  const m = /([^/\\]+\.(png|jpe?g|tga|webp))(\?.*)?$/i.exec(url);
  if (m && texIndex[m[1].toLowerCase()]) return texIndex[m[1].toLowerCase()];
  // the buildable-furniture FBX still name the pack's wood maps (held out of the game; furniture draws with textures/furniture/wood.jpg): answer with a 1x1 pixel instead of a 404
  if (m && /^(tiled)?wood[_.]/i.test(m[1])) return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  return url;
});
legacyManager.addHandler(/\.tga$/i, new TGALoader(legacyManager));
const manager = new THREE.LoadingManager();
manager.addHandler(/\.tga$/i, new TGALoader(manager));
const gltfLoader = new GLTFLoader(manager);
const fbxLoader = new FBXLoader(legacyManager);
const objLoader = new OBJLoader(legacyManager);
let indexReady = null;
const ensureIndex = () => (indexReady ||= fetch("assets3d/texture_index.json").then((r) => r.json()).then((j) => { texIndex = j; }).catch(() => {}));

const cache = new Map(); // url -> Promise<THREE.Object3D> (the pristine loaded root)

const dirOf = (url) => url.slice(0, url.lastIndexOf("/") + 1);
const extOf = (url) => url.split("?")[0].split(".").pop().toLowerCase();

async function loadRoot(url) {
  await ensureIndex();
  switch (extOf(url)) {
    case "glb": case "gltf": {
      const g = await gltfLoader.loadAsync(url);
      g.scene.animations = g.animations;
      return g.scene;
    }
    case "fbx": return fbxLoader.loadAsync(url);
    case "obj": {
      const mtlUrl = url.replace(/\.obj$/i, ".mtl");
      let materials = null;
      try {
        const mtl = new MTLLoader(legacyManager);
        mtl.setPath(dirOf(mtlUrl));
        materials = await mtl.loadAsync(mtlUrl.slice(mtlUrl.lastIndexOf("/") + 1));
        materials.preload();
      } catch { /* no mtl: plain grey */ }
      const l = new OBJLoader(legacyManager);
      if (materials) l.setMaterials(materials);
      return l.loadAsync(url);
    }
    default: throw new Error("unsupported model type: " + url);
  }
}

/** Finds a node by name in a combined scene (FBX appends ".001" style suffixes; those match too). */
function findNode(root, name) {
  let hit = null;
  root.traverse((o) => { if (!hit && (o.name === name || o.name.replace(/\.\d+$/, "") === name)) hit = o; });
  return hit;
}

/**
 * Loads a model and returns a fresh clone of it (or of just `opts.node`, with its scene transform baked
 * in and moved to the origin). Materials/geometry are shared between clones.
 */
export async function loadAny(url, opts = {}) {
  if (!cache.has(url)) cache.set(url, loadRoot(url));
  const root = await cache.get(url);
  let src = root;
  if (opts.node) {
    root.updateMatrixWorld(true);
    const n = findNode(root, opts.node);
    if (!n) throw new Error(`node "${opts.node}" not in ${url}`);
    src = n;
  }
  let skinned = false; src.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
  const out = skinned ? cloneSkinned(src) : src.clone(true);   // rigged models need their own skeleton per copy
  out.animations = root.animations || [];
  if (opts.node) { // bake the node's world transform into a wrapper, then recentre
    const wrap = new THREE.Group();
    out.applyMatrix4(new THREE.Matrix4().copy(src.matrixWorld).multiply(new THREE.Matrix4().copy(src.matrix).invert()));
    wrap.add(out);
    return wrap;
  }
  return out;
}

export const loaders = { gltfLoader, fbxLoader, objLoader };
