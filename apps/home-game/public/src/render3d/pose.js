// Procedural pose layers applied on top of the animation clips each frame (after the mixer has written the bones):
//   - fingers close around whatever is held in the right hand
//   - the torso leans down toward the ground while picking something up
//   - resting sits on the ground: the chair-sit clip with the body lowered and the legs straightened out in front
import * as THREE from "three";

const T = { // tuning knobs (window.__pose can override while testing)
  leanAxis: new THREE.Vector3(1, 0, 0), leanSign: 1, leanTotal: 1.05,
  curlAxis: new THREE.Vector3(1, 0, 0), curlSign: 1,
  sitDrop: 0.42,
};
const FINGERS = { index: [0.45, 0.8, 0.6], middle: [0.5, 0.85, 0.6], ring: [0.55, 0.9, 0.6], pinky: [0.6, 0.9, 0.6], thumb: [0.15, 0.25, 0.25] };
const q = new THREE.Quaternion();
const sw = (t) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };

function collect(actor) {
  if (actor.pose) return actor.pose;
  const bones = {}; actor.model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const rest = {}; for (const n of ["calf_l", "calf_r"]) if (bones[n]) rest[n] = bones[n].quaternion.clone();
  const fingers = []; for (const [f, ang] of Object.entries(FINGERS)) for (let i = 0; i < 3; i++) { const b = bones[`${f}_0${i + 1}_r`]; if (b) fingers.push([b, ang[i]]); }
  return (actor.pose = { bones, rest, fingers, grip: 0, lean: 0, sit: 0 });
}

/** Call once per frame right after `actor.mixer.update`. */
export function applyPose(actor, dt) {
  const P = collect(actor), o = window.__pose; if (o) Object.assign(T, o);
  const k = Math.min(1, dt * 9);
  P.grip += ((actor.held ? 1 : 0) - P.grip) * k;
  if (P.grip > 0.01) for (const [b, a] of P.fingers) { q.setFromAxisAngle(T.curlAxis, a * P.grip * T.curlSign); b.quaternion.multiply(q); }

  const act = actor.act, def = act?.def;
  P.lean += ((def?.lean ? leanAt(def.lean, act.t) : 0) - P.lean) * Math.min(1, dt * 14);
  if (P.lean > 0.01) for (const n of ["spine_01", "spine_02", "spine_03"]) { const b = P.bones[n]; if (b) { q.setFromAxisAngle(T.leanAxis, (T.leanTotal / 3) * P.lean * T.leanSign); b.quaternion.multiply(q); } }

  P.sit += ((actor.sitting ? 1 : 0) - P.sit) * Math.min(1, dt * 5);
  if (P.sit > 0.01) for (const n of ["calf_l", "calf_r"]) { const b = P.bones[n]; if (b && P.rest[n]) b.quaternion.slerp(P.rest[n], sw(P.sit * 1.2)); }
  actor.sitDrop = T.sitDrop * sw(P.sit * 1.2);

  applyArmIK(actor, P, dt);
  applyCouplePose(actor, P, dt);
  updateArrow(actor, dt);
}

/** lean = [[t, amount], ...] keyframes (seconds into the action), linearly blended and eased. */
function leanAt(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, a0] = keys[i - 1], [t1, a1] = keys[i]; return a0 + (a1 - a0) * sw((t - t0) / (t1 - t0)); }
  return keys[keys.length - 1][1];
}

// ---------- arm IK: the clip library has no "hand to mouth" or "draw a bow", so those poses are solved ----------
// A two-bone solver (shoulder -> elbow -> hand) pulls a hand to a world-space target; each action names a rig below that decides
// the targets and how strongly to apply them over time. The result blends over whatever clip is playing.
const _v = [0, 1, 2, 3, 4, 5, 6].map(() => new THREE.Vector3()), _q = [0, 1, 2].map(() => new THREE.Quaternion());
const keyAt = (keys, t) => { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, a0] = keys[i - 1], [t1, a1] = keys[i]; return a0 + (a1 - a0) * sw((t - t0) / (t1 - t0)); } return keys[keys.length - 1][1]; };

function setWorldQuat(bone, qw) { bone.parent.getWorldQuaternion(_q[2]); bone.quaternion.copy(_q[2].invert().multiply(qw)); bone.updateWorldMatrix(false, true); }
function solveArm(A, B, C, target, pole, w) {
  if (w < 0.002) return;
  const qA0 = A.quaternion.clone(), qB0 = B.quaternion.clone();
  const [pA, pB, pC, t, pl, tgt] = _v;
  A.updateWorldMatrix(true, true);
  A.getWorldPosition(pA); B.getWorldPosition(pB); C.getWorldPosition(pC);
  const l1 = pA.distanceTo(pB), l2 = pB.distanceTo(pC);
  t.copy(target).sub(pA); const d = Math.min(Math.max(t.length(), 0.08), (l1 + l2) * 0.999); t.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  pl.copy(pole).addScaledVector(t, -pole.dot(t)); if (pl.lengthSq() < 1e-6) pl.set(0, -1, 0); pl.normalize();
  tgt.copy(pA).addScaledVector(t, d);
  const elbow = _v[6].copy(pA).addScaledVector(t, a).addScaledVector(pl, h);
  // shoulder: swing the upper arm so the elbow lands on the solved point
  _q[0].setFromUnitVectors(pB.clone().sub(pA).normalize(), elbow.clone().sub(pA).normalize());
  setWorldQuat(A, _q[0].multiply(A.getWorldQuaternion(_q[1])));
  // elbow: swing the forearm so the hand lands on the target
  B.getWorldPosition(pB); C.getWorldPosition(pC);
  _q[0].setFromUnitVectors(pC.clone().sub(pB).normalize(), tgt.clone().sub(pB).normalize());
  setWorldQuat(B, _q[0].multiply(B.getWorldQuaternion(_q[1])));
  if (w < 0.999) { A.quaternion.copy(qA0.slerp(A.quaternion, w)); B.quaternion.copy(qB0.slerp(B.quaternion, w)); A.updateWorldMatrix(false, true); }
}

const IK_TUNE = { mouthUp: 0.03, mouthFwd: 0.12, bowReach: 0.6, bowSide: 0.04, bowUp: -0.02, anchorFwd: 0.02, anchorSide: 0.02, anchorUp: -0.03 };
const POLE = { r: new THREE.Vector3(-0.6, -1, -0.3), l: new THREE.Vector3(0.6, -1, -0.3) };   // elbow hint in the body's own space (+z forward, -x = its right)

/** Rigs: (ctx) -> [{ hand: "r"|"l", w, target: Vector3 }] ; ctx = { t, bone(name), fwd, right, up, pos(boneName) } */
const RIGS = {
  mouth(c) {   // eating: right hand up to the mouth, a little chewing bob while it's there
    const w = keyAt([[0, 0], [0.2, 1], [1.05, 1], [1.3, 0]], c.t), head = c.pos(c.head);
    const target = head.clone().addScaledVector(c.up, IK_TUNE.mouthUp + Math.sin(c.t * 22) * 0.006 * w).addScaledVector(c.fwd, IK_TUNE.mouthFwd);
    return [{ hand: "r", w, target }];
  },
  archery(c) {  // left arm out holding the bow, right hand on the string drawn back to the cheek, then let go
    const env = keyAt([[0, 0], [0.25, 1], [1.2, 1], [1.5, 0]], c.t);
    const sh = c.pos("upperarm_l"), bow = sh.clone().addScaledVector(c.fwd, IK_TUNE.bowReach).addScaledVector(c.right, IK_TUNE.bowSide).addScaledVector(c.up, IK_TUNE.bowUp);
    const head = c.pos(c.head), anchor = head.clone().addScaledVector(c.fwd, IK_TUNE.anchorFwd).addScaledVector(c.right, -IK_TUNE.anchorSide).addScaledVector(c.up, IK_TUNE.anchorUp);
    const draw = c.t < c.release ? keyAt([[0, 0], [0.35, 0], [0.95, 1], [c.release, 1]], c.t) : keyAt([[c.release, 1], [c.release + 0.12, 0.35]], c.t);   // released: the hand springs forward a little
    const string = bow.clone().lerp(anchor, draw);
    return [{ hand: "l", w: env, target: bow }, { hand: "r", w: env, target: string }];
  },
};

function applyArmIK(actor, P, dt) {
  const act = actor.act, rig = act?.def?.ik && RIGS[act.def.ik]; if (!rig) { actor._ikOn = false; return; }
  actor.root.updateMatrixWorld(true);
  const rq = actor.root.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rq), right = new THREE.Vector3(-1, 0, 0).applyQuaternion(rq), up = new THREE.Vector3(0, 1, 0);
  const b = P.bones, head = b.head ? "head" : "neck_01";
  const ctx = { t: act.t, fwd, right, up, head, release: act.def.releaseAt ?? 1, pos: (n) => b[n].getWorldPosition(new THREE.Vector3()) };
  const out = rig(ctx); actor._ikCtx = ctx; actor._ikOut = out;
  for (const e of out) {
    const s = e.hand, A = b["upperarm_" + s], B = b["lowerarm_" + s], C = b["hand_" + s]; if (!A || !B || !C) continue;
    solveArm(A, B, C, e.target, POLE[s].clone().applyQuaternion(rq), e.w);
  }
}

// ---------- the arrow: nocked between the hands while drawing, then it flies ----------
function arrowMesh() {
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0xb58a55, roughness: 0.8 }), steel = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.5, metalness: 0.4 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.72, 6).rotateX(Math.PI / 2).translate(0, 0, 0.36), wood);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 6).rotateX(Math.PI / 2).translate(0, 0, 0.755), steel);
  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.002, 0.09).translate(0, 0, 0.06), new THREE.MeshStandardMaterial({ color: 0xe8e0d0 })), fl2 = fl.clone(); fl2.rotation.z = Math.PI / 2;
  g.add(shaft, tip, fl, fl2); g.traverse((o) => { o.castShadow = true; }); g.visible = false; return g;
}
function updateArrow(actor, dt) {
  const act = actor.act, ctx = actor._ikCtx, out = actor._ikOut, A = (actor._arrow ||= { mesh: arrowMesh(), state: "off", t: 0, dir: new THREE.Vector3(0, 0, 1) });
  if (!A.mesh.parent) actor.root.parent?.add(A.mesh);
  const drawing = act?.def?.ik === "archery" && ctx && out && act.t < (act.def.releaseAt ?? 1);
  if (drawing) {
    const r = out.find((e) => e.hand === "r"), l = out.find((e) => e.hand === "l"), bones = actor.pose.bones;
    const hand = bones.hand_r.getWorldPosition(new THREE.Vector3()), tip = bones.hand_l.getWorldPosition(new THREE.Vector3());
    A.dir.copy(l.target).sub(r.target); if (A.dir.lengthSq() < 1e-4) A.dir.copy(ctx.fwd); A.dir.normalize();
    A.mesh.position.copy(hand); A.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), A.dir); A.mesh.visible = act.t > 0.3; A.state = "nocked"; A.tip = tip;
  } else if (A.state === "nocked") { A.state = "fly"; A.t = 0; A.mesh.visible = true; }
  else if (A.state === "fly") {
    A.t += dt; A.mesh.position.addScaledVector(A.dir, 26 * dt); A.dir.y -= 0.35 * dt; A.dir.normalize(); A.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), A.dir);
    if (A.t > 0.55) { A.state = "off"; A.mesh.visible = false; }
  }
}

// ---------- couple poses (hug, kiss, holding hands): arms reach for the partner, the body leans in ----------
// actor.couple = { kind, role, partner, w, idx, t } is set each frame by couple.js (null when there is nothing to do).
const _c = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3());
const POLE_C = { hugR: new THREE.Vector3(-0.9, -0.5, 0.25), hugL: new THREE.Vector3(0.9, -0.5, 0.25), r: new THREE.Vector3(-0.7, -0.9, -0.2), l: new THREE.Vector3(0.7, -0.9, -0.2) };

function leanSpine(P, total) { for (const n of ["spine_01", "spine_02", "spine_03"]) { const b = P.bones[n]; if (b) { q.setFromAxisAngle(T.leanAxis, (total / 3) * T.leanSign); b.quaternion.multiply(q); } } }

function applyCouplePose(actor, P, dt) {
  const c = actor.couple; if (!c || c.w < 0.01 || !c.partner) return;
  const w = c.w, part = c.partner, PP = collect(part), pb = PP.bones, mb = P.bones;
  actor.root.updateMatrixWorld(true); part.root.updateMatrixWorld(true);
  const rq = actor.root.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rq), right = new THREE.Vector3(-1, 0, 0).applyQuaternion(rq), up = new THREE.Vector3(0, 1, 0);
  const at = (bones, n, out) => (bones[n] ? bones[n].getWorldPosition(out) : out.copy(part.root.position));
  const sway = Math.sin(c.t * 2.2 + c.idx * 1.7);

  if (c.kind === "hold") {
    // hands meet halfway between the two bodies: the leader's right hand, the follower's left hand
    const mid = _c[0].copy(actor.root.position).add(part.root.position).multiplyScalar(0.5); mid.y = Math.min(actor.root.position.y, part.root.position.y) + 0.92;
    const s = c.role === "leader" ? "r" : "l", A = mb["upperarm_" + s], B = mb["lowerarm_" + s], C = mb["hand_" + s];
    if (A && B && C) solveArm(A, B, C, mid, POLE_C[s].clone().applyQuaternion(rq), w);
    return;
  }

  const chest = at(pb, "spine_03", _c[1]).clone(), head = at(pb, "head", _c[2]).clone(), waist = at(pb, "spine_01", _c[3]).clone();
  const armR = [mb.upperarm_r, mb.lowerarm_r, mb.hand_r], armL = [mb.upperarm_l, mb.lowerarm_l, mb.hand_l];
  if (c.kind === "hug") {
    // both arms around the partner's back, hands just past their spine
    const tR = chest.clone().addScaledVector(fwd, 0.14).addScaledVector(right, 0.17).addScaledVector(up, -0.02 + sway * 0.012);
    const tL = chest.clone().addScaledVector(fwd, 0.14).addScaledVector(right, -0.17).addScaledVector(up, -0.07 + sway * 0.012);
    if (armR[0]) solveArm(armR[0], armR[1], armR[2], tR, POLE_C.hugR.clone().applyQuaternion(rq), w);
    if (armL[0]) solveArm(armL[0], armL[1], armL[2], tL, POLE_C.hugL.clone().applyQuaternion(rq), w);
    leanSpine(P, (0.2 + sway * 0.025) * w);
  } else if (c.kind === "kiss") {
    // one hand at the partner's waist, the other cradling their cheek, heads tilted toward each other
    const tR = waist.clone().addScaledVector(right, 0.15).addScaledVector(fwd, 0.02).addScaledVector(up, 0.08);
    const tL = head.clone().addScaledVector(right, -0.11).addScaledVector(up, -0.06).addScaledVector(fwd, -0.01);
    if (armR[0]) solveArm(armR[0], armR[1], armR[2], tR, POLE_C.hugR.clone().applyQuaternion(rq), w);
    if (armL[0]) solveArm(armL[0], armL[1], armL[2], tL, POLE_C.l.clone().applyQuaternion(rq), w);
    leanSpine(P, (0.3 + sway * 0.02) * w);
    const hd = mb.head; if (hd) { q.setFromEuler(new THREE.Euler(-0.1 * w, 0, (c.idx === 0 ? 0.17 : -0.17) * w)); hd.quaternion.multiply(q); }
  }
}
