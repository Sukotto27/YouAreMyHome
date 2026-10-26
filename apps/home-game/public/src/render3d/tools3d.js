// Tools characters hold while they work. Each tool is a model normalised to a real-world length with its handle end at the
// origin, then fixed into the right hand with a per-tool grip (position / rotation in the hand bone's own space).
import * as THREE from "three";
import { loadParts } from "./instancer.js";

const M = "assets3d/models/";
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a6a68, roughness: 0.9 });
/** length in metres (`fit: "footprint"` = measure the longest horizontal side, for models lying down); pre = rotate the model first so its handle runs along +Y with the business end up;
 *  grip = placement in the hand bone (the hand bone's +Y runs along the fingers, so a tool at rotation 0 is held like a club). */
// The hand bone's +Y runs along the fingers and -X is the palm side; the fist is about (-0.045, 0.09, -0.11) in that space.
// Rotating a tool 90 degrees about X lays its handle across the palm so it points out of the fist's thumb side.
const FIST = [-0.045, 0.09, -0.11];
const grip = (along = 0, rot = [90, 0, 0]) => ({ pos: [FIST[0], FIST[1] + along, FIST[2]], rot });
// the modern set: City Builder's mekmeesk hand tools (steel heads, wooden handles) and the steel spade from vegetation.fbx
const MEK = M + "tools/mekmeesk/tools_mekmeesk.glb";
const steel = () => new THREE.MeshStandardMaterial({ color: 0x8b929b, roughness: 0.45, metalness: 0.65 }), wood = () => new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 0.85 });
/** A pick: wooden haft with a curved double-pointed steel head. Built from primitives (no pickaxe model exists in the packs). Handle end at the origin, +Y up. */
function buildPickaxe() {
  const g = new THREE.Group(), len = 0.9, R = 0.17, arc = Math.PI * 0.78;
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, len, 8).translate(0, len / 2, 0), wood());
  const head = new THREE.Mesh(new THREE.TorusGeometry(R, 0.021, 8, 18, arc).rotateZ(Math.PI / 2 - arc / 2).translate(0, len + 0.015 - R, 0), steel());
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.06).translate(0, len, 0), steel());
  g.add(haft, head, collar);
  for (const sx of [-1, 1]) {   // the points: cones continuing the arc's tangent at each end
    const a = Math.PI / 2 + sx * arc / 2, px = Math.cos(a) * R, py = len + 0.015 - R + Math.sin(a) * R, tan = new THREE.Vector3(-Math.sin(a) * -sx, Math.cos(a) * -sx, 0).normalize();
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.021, 0.08, 8).translate(0, 0.04, 0), steel()); tip.position.set(px, py, 0); tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan); g.add(tip);
  }
  return g;
}
export const TOOLS = {
  axe: { url: MEK, node: "axe", tame: true, length: 0.85, grip: grip(0) },
  pickaxe: { build: buildPickaxe, grip: grip(0) },
  hammer: { url: MEK, node: "hammer_simple", tame: true, length: 0.5, grip: grip(0) },
  saw: { url: MEK, node: "saw_small_highcount", tame: true, length: 0.62, fit: "footprint", pre: [-90, 0, 0], grip: grip(0) },
  shovel: { url: M + "scenery/vegetation.fbx", node: "Shovel", length: 1.05, grip: grip(0.0) },
  torch: { url: M + "tools/low-poly-tools/torch.fbx", length: 0.7, grip: grip(0) },
  knife: { url: M + "tools/low-poly-tools/stone-knife.fbx", length: 0.3, grip: grip(0) },
  rod: { url: M + "props/small-props/FishingRod_A.glb", length: 1.7, fit: "footprint", pre: [-90, 0, 0], grip: grip(0) },
  bucket: { url: M + "props/small-props/Bucket_1_A.glb", length: 0.3, grip: grip(-0.3, [0, 0, 0]) },   // hangs from the fist by its handle
  bow: { url: M + "tools/low-poly-medieval-weapons/Bows/Recurve%20Bow.fbx", length: 1.0, center: true, upright: window.__bowYaw ?? 90, hand: "hand_l", grip: { pos: [0.0, 0.09, 0.0], rot: [0, 0, 0] } },   // held in the left hand; the right draws the string
};

const cache = new Map();
/** The model of a tool (loaded once): a Group, handle at the origin. */
export async function toolModel(id) {
  if (!cache.has(id)) cache.set(id, (async () => {
    const t = TOOLS[id]; if (!t) return null;
    let g;
    if (t.build) g = t.build();
    else {
      const o = t.fit === "footprint" ? { footprint: t.length } : { height: t.length }; if (t.node) o.node = t.node; 
      const model = await loadParts(t.url, o).catch((e) => { console.warn("[tools] failed", id, e.message); return null; });
      if (!model) { cache.delete(id); return null; }       // don't remember a failure: the next use tries again
      g = new THREE.Group();
      for (const p of model.parts) {
        let mat = p.material;
        if (t.tame && mat.isMeshStandardMaterial) { mat = mat.clone(); mat.metalness = Math.min(mat.metalness, 0.3); mat.roughness = Math.max(mat.roughness, 0.55); }   // full-metal materials render black without an environment map
        const m = new THREE.Mesh(p.geometry, mat); m.castShadow = true; g.add(m);
      }
    }
    if (t.pre) g.rotation.set(...t.pre.map((d) => (d * Math.PI) / 180));
    const wrap = new THREE.Group(); wrap.add(g); wrap.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3());
    g.position.set(-c.x, t.center ? -c.y : -box.min.y, -c.z);         // handle end at the origin, standing up, centred
    return wrap;
  })());
  return cache.get(id);
}

const findBone = (root, name) => { let b = null; root.traverse((o) => { if (!b && o.name === name) b = o; }); return b; };

/** Put a tool in an actor's right hand (replacing whatever is there). */
export async function holdTool(actor, id) {
  dropTool(actor);
  const tok = actor._holdTok;   // the model loads asynchronously: if the action ended (or restarted) meanwhile, don't attach a stale tool
  const base = await toolModel(id), t = TOOLS[id]; if (!base || actor._holdTok !== tok) return;
  const hand = ((actor._hands ||= {})[t.hand || "hand_r"] ||= findBone(actor.model, t.hand || "hand_r")); if (!hand) return;
  const g = base.clone(true); g.position.set(...t.grip.pos); g.rotation.set(...t.grip.rot.map((d) => (d * Math.PI) / 180));
  g.scale.setScalar(1 / Math.max(hand.getWorldScale(new THREE.Vector3()).x, 1e-3));   // bones in the rig may carry a scale; keep the tool true size
  g.userData.upright = t.upright ?? null;   // degrees of yaw: keep this tool vertical in the world (a bow), whatever the wrist does
  hand.add(g); actor.held = g;
}
export function dropTool(actor) { actor._holdTok = (actor._holdTok || 0) + 1; if (actor.held) { actor.held.parent?.remove(actor.held); actor.held = null; } }

/** Load every tool model up front. Loading on first use meant a short action (a 0.7 s pickaxe swing) was often over before its tool arrived. */
export function preloadTools() { return Promise.all(Object.keys(TOOLS).map((id) => toolModel(id))); }
