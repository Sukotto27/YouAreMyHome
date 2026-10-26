// An equipped torch: held in the LEFT hand (the right hand keeps its tools), always pointing up whatever the arm does, with a
// flipbook flame and a flickering warm light at its tip. Driven by `player.equipped === "torch"` (set from the item's menu in main.js).
import * as THREE from "three";
import { toolModel } from "./tools3d.js";
import { createFlipbook } from "./flipbook.js";

const GRIP = [0.0, 0.07, 0.0];          // where the handle sits in the hand bone's own space
const TILT = 0.22;                      // leans a little forward (radians)
const LENGTH = 0.74;                    // handle to tip, metres

const findBone = (root, name) => { let b = null; root.traverse((o) => { if (!b && o.name === name) b = o; }); return b; };
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

export function createHeldTorches() {
  const states = new WeakMap();      // actor -> { g, fx, flame, flame2, light, loading, seed }

  function build(actor, st) {
    st.loading = true;
    toolModel("torch").then((base) => {
      st.loading = false; if (!base || st.dead) return;
      const hand = (st.hand ||= findBone(actor.model, "hand_l")); if (!hand) return;
      const g = base.clone(true); hand.add(g); st.g = g;
      const fx = new THREE.Group();
      const flame = createFlipbook({ file: "fire_01_8x8.tga", w: 0.3, h: 0.36, fps: 30, offset: st.seed * 64, intensity: 1.15, tint: [1, 0.74, 0.42] }); flame.scale.set(0.3, 0.36, 1);
      const flame2 = createFlipbook({ file: "fire_01_8x8.tga", w: 0.22, h: 0.28, fps: 30, offset: st.seed * 64 + 29, intensity: 0.9, tint: [1, 0.55, 0.26] }); flame2.scale.set(0.22, 0.28, 1); flame2.position.set(0.03, 0, 0);
      const light = new THREE.PointLight(0xff9a50, 6, 15, 1.1);
      fx.add(flame, flame2, light); st.fx = fx; st.flame = flame; st.flame2 = flame2; st.light = light;
    });
  }
  function remove(actor, st) {
    st.dead = true; if (st.g) { st.g.parent?.remove(st.g); st.g = null; }
    if (st.fx) { st.fx.parent?.remove(st.fx); for (const m of [st.flame, st.flame2]) { m.geometry.dispose(); m.material.dispose(); } st.fx = null; }
    states.delete(actor);
  }

  /** Call once per frame per actor, after the pose is final. */
  function update(actor, player, t) {
    let st = states.get(actor);
    const want = player?.equipped === "torch" && !(actor.act?.def?.tool === "bow") && !actor.sitting;
    if (!want && !(player?.equipped === "torch")) { if (st) remove(actor, st); return; }
    if (!st) { st = { seed: Math.random(), dead: false, loading: false }; states.set(actor, st); }
    if (!st.g) { if (!st.loading) build(actor, st); return; }
    st.g.visible = want; st.fx.visible = want;
    if (!want) return;
    const hand = st.hand;
    actor.root.updateMatrixWorld(true);
    // size: undo any scale on the hand bone so the torch keeps its true length
    hand.getWorldScale(_s); st.g.scale.setScalar(1 / Math.max(_s.x, 1e-3));
    st.g.position.set(...GRIP);
    // orientation: up in the world, leaning forward along the body's facing
    _e.set(TILT, 0, 0); _q.setFromEuler(_e);
    actor.root.getWorldQuaternion(_p); _p.multiply(_q);                       // body yaw * forward lean
    hand.getWorldQuaternion(_q); st.g.quaternion.copy(_q.invert().multiply(_p));
    // flame and light ride the tip, in the actor's scene
    st.g.updateMatrixWorld(true); _v.set(0, LENGTH, 0); st.g.localToWorld(_v);
    const home = actor.root.parent; if (home && st.fx.parent !== home) home.add(st.fx);
    st.fx.position.copy(_v);
    st.flame.userData.tick(t); st.flame2.userData.tick(t);
    st.light.intensity = 5.4 + 1.3 * Math.sin(t * 13 + st.seed * 9) * Math.sin(t * 5.3 + st.seed);
  }
  return { update };
}
