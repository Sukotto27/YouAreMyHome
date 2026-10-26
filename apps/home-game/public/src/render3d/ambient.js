// Ambient wildlife that is pure decoration (no game object behind it): butterflies drifting over the meadow in daylight.
// Uses the styloo butterfly (rigged, has a real "fly" clip). A fixed flock follows the players around so there are always
// a few nearby, and they leave at dusk.
import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { loadAny } from "./loaders.js";

const URL_ = "assets3d/models/animals/styloo/butterfly.glb", N = 3, SPAN = 0.3;

export async function createAmbient({ scene, terrain }) {
  let tpl;
  try { tpl = await loadAny(URL_); } catch (e) { console.warn("[ambient] butterfly failed:", e.message); return { update() {} }; }
  tpl.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(tpl), size = box.getSize(new THREE.Vector3()), s = SPAN / Math.max(size.x, size.y, size.z, 1e-3);
  const clip = (tpl.animations || []).find((c) => c.name === "fly") || tpl.animations?.[0];
  const group = new THREE.Group(); scene.add(group);
  const flock = [];
  for (let i = 0; i < N; i++) {
    const inner = cloneSkinned(tpl); inner.scale.setScalar(s); inner.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    const root = new THREE.Group(); root.add(inner); group.add(root);
    const mixer = new THREE.AnimationMixer(inner); if (clip) { const a = mixer.clipAction(clip); a.timeScale = 0.7 + Math.random() * 0.5; a.time = Math.random() * clip.duration; a.play(); }
    flock.push({ root, mixer, seed: Math.random() * 100, cx: 0, cz: 0, r: 2 + Math.random() * 4, h: 0.9 + Math.random() * 1.3, sp: 0.25 + Math.random() * 0.25, fresh: true });
  }
  let alpha = 0;
  return {
    /** focus = a world point near the players; day = whether it is daylight. */
    update(dt, t, focus, day, explored = null) {
      alpha += ((day ? 1 : 0) - alpha) * Math.min(1, dt * 1.5);
      group.visible = alpha > 0.03;
      if (!group.visible) return;
      for (const b of flock) {
        // each one circles a centre that slowly follows the players: lissajous loops, a few metres wide
        const dx = focus.x - b.cx, dz = focus.z - b.cz;
        if (b.fresh || Math.hypot(dx, dz) > 14) { const a = Math.random() * 6.28, d = 3 + Math.random() * 8; b.cx = focus.x + Math.cos(a) * d; b.cz = focus.z + Math.sin(a) * d; b.fresh = false; }
        const k = t * b.sp + b.seed, x = b.cx + Math.sin(k * 1.3) * b.r + Math.sin(k * 3.1) * 0.6, z = b.cz + Math.cos(k * 0.9) * b.r + Math.cos(k * 2.3) * 0.6;
        const px = b.root.position.x, pz = b.root.position.z, gy = terrain.heightAt(x, z);
        const y = Math.max(gy, 0.1) + b.h + Math.sin(k * 4.1) * 0.25;
        b.root.visible = gy >= 0.05 && (!explored || explored(x, z));       // not over open water, and not out in the unexplored dark
        b.root.position.set(x, y, z);
        if (Math.hypot(x - px, z - pz) > 1e-4) b.root.rotation.y = Math.atan2(x - px, z - pz);
        b.root.scale.setScalar(alpha); b.mixer.update(dt);
      }
    },
  };
}
