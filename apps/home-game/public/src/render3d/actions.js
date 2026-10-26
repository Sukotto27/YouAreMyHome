// Character actions: what a player's body does when they chop, mine, harvest, fish... Each action is a short timeline of
// clips from the Universal Animation Library, an optional held tool, and sound effects pinned to the moments the body
// actually strikes (found by sampling the hand through each clip), so the sound lands on the hit and not at the start.
//
//   steps   [{ at, clip, speed?, from?, loop? }]   clips start at `at` seconds into the action (crossfaded)
//   sfx     [{ at, name }]                         the game's sound names (src/sounds), fired at `at` seconds
//   dur     total seconds
//   placeholder  true where the library has no real clip yet and a stand-in is used (listed in ASSET_INVENTORY.md)
import * as THREE from "three";
import { holdTool, dropTool } from "./tools3d.js";

export const ACTIONS = {
  chop:      { label: "Chop a tree", tool: "axe", dur: 0.97, steps: [{ at: 0, clip: "TreeChopping_Loop" }], sfx: [{ at: 0.2, name: "chop" }] },
  mine:      { label: "Mine a rock", tool: "pickaxe", dur: 0.7, steps: [{ at: 0, clip: "Sword_Regular_A", speed: 0.62 }], sfx: [{ at: 0.32, name: "pickaxe" }], placeholder: "overhead sword swing" },
  harvest:   { label: "Pick berries / apples", dur: 1.6, steps: [{ at: 0, clip: "Farm_Harvest", speed: 1.55 }], sfx: [{ at: 0.45, name: "harvest" }, { at: 0.8, name: "harvest" }] },
  pickup:    { label: "Pick something up", dur: 1.0, steps: [{ at: 0, clip: "Farm_Harvest", speed: 1.55 }], sfx: [{ at: 0.45, name: "pickup" }] },   // the gather animation
  eat:       { label: "Eat", dur: 1.35, steps: [{ at: 0, clip: "Idle_Loop" }], sfx: [{ at: 0.45, name: "eat" }], ik: "mouth" },   // hand to the mouth (pose.js)
  dig:       { label: "Dig / plant", tool: "shovel", dur: 2.0, steps: [{ at: 0, clip: "Farm_PlantSeed", speed: 1.4 }], sfx: [{ at: 0.43, name: "dig" }, { at: 0.8, name: "dig" }, { at: 1.07, name: "dig" }] },
  water:     { label: "Water plants", tool: "bucket", dur: 2.4, steps: [{ at: 0, clip: "Farm_Watering", speed: 1.6 }], sfx: [{ at: 0.6, name: "water" }] },
  fillwater: { label: "Fill a bucket", tool: "bucket", dur: 1.6, steps: [{ at: 0, clip: "Farm_Harvest", speed: 1.55 }], sfx: [{ at: 0.55, name: "fillwater" }], placeholder: "reaching down" },
  hammer:    { label: "Hammer", tool: "hammer", dur: 2.6, steps: [{ at: 0, clip: "Fixing_Kneeling", speed: 1.5 }], sfx: [{ at: 0.9, name: "hammer" }, { at: 1.3, name: "hammer" }, { at: 1.7, name: "hammer" }, { at: 2.1, name: "hammer" }], placeholder: "kneeling repair" },
  saw:       { label: "Saw planks", tool: "saw", dur: 2.4, steps: [{ at: 0, clip: "Fixing_Kneeling", speed: 1.5 }], sfx: [{ at: 0.8, name: "saw" }], placeholder: "kneeling repair" },
  hunt:      { label: "Shoot the bow", tool: "bow", dur: 1.6, steps: [{ at: 0, clip: "Pistol_Aim_Neutral" }], sfx: [{ at: 1.0, name: "hunt" }], ik: "archery", releaseAt: 1.0 },   // stance from the pistol clip; arms solved in pose.js
  fish:      { label: "Cast and reel (fishing)", tool: "rod", dur: 3.0, steps: [{ at: 0, clip: "Spell_Simple_Enter" }, { at: 0.55, clip: "Spell_Simple_Shoot" }, { at: 1.05, clip: "Spell_Simple_Idle_Loop" }, { at: 2.4, clip: "Spell_Simple_Exit" }], sfx: [{ at: 0.65, name: "fillwater" }, { at: 2.45, name: "fishingreel" }], placeholder: "spell cast and hold" },
  cook:      { label: "Cook", dur: 1.5, steps: [{ at: 0, clip: "Interact", speed: 1.4 }], sfx: [{ at: 0.3, name: "cook" }] },
  milk:      { label: "Milk a cow", tool: "bucket", dur: 1.8, steps: [{ at: 0, clip: "Fixing_Kneeling", speed: 1.7 }], sfx: [{ at: 0.4, name: "cow" }], placeholder: "kneeling repair" },
  chest:     { label: "Open a chest", dur: 1.0, steps: [{ at: 0, clip: "Interact", speed: 2 }], sfx: [{ at: 0.25, name: "chest" }] },
  lightfire: { label: "Light a fire", dur: 1.6, steps: [{ at: 0, clip: "Crouch_Idle_Loop" }], sfx: [{ at: 0.5, name: "lightfire" }], placeholder: "crouching" },
  extinguish:{ label: "Put out a fire", dur: 1.2, steps: [{ at: 0, clip: "Interact", speed: 1.6 }], sfx: [{ at: 0.3, name: "extinguish" }] },
  pet:       { label: "Pet the cat", dur: 1.4, steps: [{ at: 0, clip: "Crouch_Idle_Loop" }], sfx: [{ at: 0.3, name: "cat" }], placeholder: "crouching" },
  interact:  { label: "Use / open", dur: 1.0, steps: [{ at: 0, clip: "Interact", speed: 2 }], sfx: [] },
};
// Not triggered by a sound, just for trying them out and for emotes
export const EXTRAS = {
  talk:   { label: "Talk", dur: 2.9, steps: [{ at: 0, clip: "Idle_Talking_Loop" }], sfx: [] },
  nod:    { label: "Nod (yes)", dur: 2.0, steps: [{ at: 0, clip: "Yes" }], sfx: [] },
  dance:  { label: "Dance", dur: 4.0, steps: [{ at: 0, clip: "Dance_Loop" }], sfx: [] },
  swing:  { label: "Sword swing", dur: 1.5, steps: [{ at: 0, clip: "Sword_Attack" }], sfx: [{ at: 0.5, name: "hunt" }] },
  sit:    { label: "Sit down and rest", dur: 3.0, steps: [{ at: 0, clip: "Sitting_Enter" }, { at: 1.3, clip: "Sitting_Idle_Loop" }], sfx: [] },
};
export const ALL_ACTIONS = { ...ACTIONS, ...EXTRAS };

/** The game's sound names that mean "this player just did that" -> action id. */
export const ACTION_FOR_SFX = { chop: "chop", pickaxe: "mine", harvest: "harvest", pickup: "pickup", eat: "eat", dig: "dig", hammer: "hammer", saw: "saw", water: "water", fillwater: "fillwater", hunt: "hunt", fishingreel: "fish", cook: "cook", cow: "milk", chest: "chest", lightfire: "lightfire", extinguish: "extinguish", cat: "pet" };

/**
 * Start an action on an actor. `playSfx(name)` plays a sound (the game's own playSound); `faceYaw` turns the body first.
 * Resolves when the action ends or is cancelled.
 */
export function startAction(actor, id, { playSfx = () => {}, faceYaw = null, repeat = 1, onFace = null, target = null } = {}) {
  const def = ALL_ACTIONS[id]; if (!def) return Promise.resolve(false);
  cancelAction(actor);
  if (faceYaw !== null && onFace) onFace(faceYaw);
  const act = { id, def, t: 0, step: -1, fired: new Set(), playSfx, repeat, cycle: 0, resolve: null, target };
  actor.act = act;
  if (def.tool) holdTool(actor, def.tool);
  return new Promise((r) => { act.resolve = r; });
}

export function cancelAction(actor) {
  const act = actor.act; if (!act) return;
  actor.act = null; dropTool(actor); actor.clip = null;   // forget the clip so locomotion restarts cleanly
  act.resolve?.(false);
}

/** Per frame: advance the active action's timeline. Returns true while an action is running (locomotion should stay out of the way). */
export function updateAction(actor, dt) {
  const act = actor.act; if (!act) return false;
  const { def } = act, prev = act.t; act.t += dt;
  const held = actor.held;
  if (held && held.userData.upright !== null && held.parent) {   // bow: limbs vertical, string toward the archer
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (held.userData.upright * Math.PI) / 180);
    const pq = held.parent.getWorldQuaternion(new THREE.Quaternion());
    held.quaternion.copy(pq.invert().multiply(actor.root.getWorldQuaternion(new THREE.Quaternion()).multiply(q)));
  }
  // clips
  let s = -1; for (let i = 0; i < def.steps.length; i++) if (act.t >= def.steps[i].at) s = i;
  if (s !== act.step && s >= 0) {
    act.step = s; const st = def.steps[s];
    actor.play(st.clip, { fade: 0.12, speed: st.speed ?? 1, once: true, restart: true, from: st.from ?? 0 });
  }
  // sounds, on the strike
  def.sfx.forEach((e, i) => { const k = act.cycle + ":" + i; if (!act.fired.has(k) && act.t >= e.at) { act.fired.add(k); act.playSfx(e.name); actor.onStrike?.(e.name, act); } });
  if (act.t >= def.dur) {
    if (++act.cycle < act.repeat) { act.t = 0; act.step = -1; return true; }
    actor.act = null; dropTool(actor); actor.clip = null; act.resolve?.(true); return false;
  }
  return true;
}
