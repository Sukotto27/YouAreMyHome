// Couple actions in 3D: holding hands, kissing and hugging. The game logic (main.js) says WHO is doing WHAT
// (state.holdingHands, state.coupleAnim); this module decides where the two bodies stand and turns that into pose layers
// (pose.js reads actor.couple) plus a few floating hearts.
//
//   hug / kiss  both turn to face each other and step close (about 0.5 m apart); pose.js wraps the arms and leans them in
//   hold hands  the leader walks normally; the other is drawn walking right beside them (on their right), turned the same way,
//               their hands meeting in the middle, wherever the leader goes
import * as THREE from "three";

const SEP = { hug: 0.4, kiss: 0.44 };          // metres between the two bodies' centres
const SIDE = 0.9;                                // metres between two people holding hands
const _v = new THREE.Vector3();

const smooth01 = (t) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };
const lerpAngle = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };

function heartTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  g.translate(32, 34); g.scale(1.05, 1.05);
  g.beginPath(); g.moveTo(0, 22); g.bezierCurveTo(-34, -2, -22, -26, 0, -10); g.bezierCurveTo(22, -26, 34, -2, 0, 22); g.closePath();
  const grad = g.createLinearGradient(0, -20, 0, 24); grad.addColorStop(0, "#ff9aa8"); grad.addColorStop(1, "#e2506a"); g.fillStyle = grad; g.fill();
  g.lineWidth = 3; g.strokeStyle = "rgba(255,255,255,0.85)"; g.stroke();
  g.fillStyle = "rgba(255,255,255,0.55)"; g.beginPath(); g.ellipse(-11, -9, 5, 3, -0.6, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createCouple() {
  const tex = heartTexture(), hearts = [], group = new THREE.Group();
  let emitAt = 0, lastHoldStart = 0;

  function emit(x, y, z, n = 1) {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
      sp.position.set(x + (Math.random() - 0.5) * 0.35, y, z + (Math.random() - 0.5) * 0.35); sp.renderOrder = 9;
      group.add(sp); hearts.push({ sp, age: -i * 0.12, life: 1.7 + Math.random() * 0.5, drift: (Math.random() - 0.5) * 0.5, s: 0.26 + Math.random() * 0.14 });
    }
  }

  /**
   * Per actor, per frame, right after its normal position and heading are set. May move / turn the actor, copies the leader's walking
   * speed to the person being led, and sets actor.couple for the pose layer (or null).
   *   a: actor   idx: player index   bases: [{wx, wy, wz}] where each player's own tile motion puts them
   *   heading: Map actor -> { yaw, v ... }   actors: [actor of player 0, actor of player 1]
   */
  function apply(a, idx, bases, heading, actors, dt, t, heightAt) {
    const ca = state.coupleAnim, hh = state.holdingHands, now = performance.now();
    const st = (a._cp ||= { kind: null, w: 0, partner: null, off: null, role: null });
    let want = null;
    if (ca && (ca.a === idx || ca.b === idx)) {
      const dur = ca.dur, e = now - ca.start;
      const w = smooth01(e / 650) * (1 - smooth01((e - (dur - 650)) / 650));
      want = { kind: ca.kind, other: ca.a === idx ? ca.b : ca.a, w };
    } else if (hh && (hh.a === idx || hh.b === idx)) {
      want = { kind: "hold", other: hh.a === idx ? hh.b : hh.a, role: hh.a === idx ? "leader" : "follower", w: 1 };
    }

    if (want) {
      if (st.kind !== want.kind || st.partner !== actors[want.other]) { st.off = null; }
      st.kind = want.kind; st.partner = actors[want.other]; st.role = want.role || null; st.otherIdx = want.other;
      if (want.kind === "hold") st.w += (1 - st.w) * Math.min(1, dt * 4); else st.w = want.w;
    } else if (st.kind) {
      st.w += (0 - st.w) * Math.min(1, dt * 5);           // letting go: ease back to normal
      if (st.w < 0.02) { st.kind = null; st.w = 0; st.partner = null; st.off = null; }
    }
    if (!st.kind || st.w < 0.005) { a.couple = null; return; }

    const me = bases[idx], other = bases[st.otherIdx], myH = heading.get(a), w = st.w;
    let px = me.wx, pz = me.wz, yaw = a.root.rotation.y;

    if (st.kind === "hug" || st.kind === "kiss") {
      let dx = other.wx - me.wx, dz = other.wz - me.wz; const len = Math.hypot(dx, dz);
      if (len < 0.05) { dx = idx === 0 ? 1 : -1; dz = 0; } else { dx /= len; dz /= len; }
      const cx = (me.wx + other.wx) / 2, cz = (me.wz + other.wz) / 2, sep = SEP[st.kind];
      px = me.wx + (cx - dx * sep / 2 - me.wx) * w; pz = me.wz + (cz - dz * sep / 2 - me.wz) * w;
      yaw = lerpAngle(yaw, Math.atan2(dx, dz), w);
      if (myH) myH.v *= (1 - w);                           // standing, not walking
      // hearts: one burst from the pair's heads now and then while the embrace is on
      if (idx === (state.coupleAnim?.a ?? idx) && w > 0.75 && now > emitAt) { emitAt = now + 360; emit((me.wx + other.wx) / 2, heightAt(cx, cz) + 1.95, (me.wz + other.wz) / 2, 1); }
    } else if (st.kind === "hold") {
      const L = bases[state.holdingHands?.a ?? st.otherIdx], leaderActor = st.role === "follower" ? st.partner : a, lH = heading.get(leaderActor);
      if (st.role === "follower" && lH) {
        const lyaw = lH.yaw, rx = -Math.cos(lyaw), rz = Math.sin(lyaw);               // the leader's right-hand side
        if (!st.off) st.off = new THREE.Vector2(me.wx - L.wx, me.wz - L.wz);
        const k = 1 - Math.exp(-dt * 7);
        st.off.x += (rx * SIDE - st.off.x) * k; st.off.y += (rz * SIDE - st.off.y) * k;
        px = me.wx + (L.wx + st.off.x - me.wx) * w; pz = me.wz + (L.wz + st.off.y - me.wz) * w;
        yaw = lerpAngle(yaw, lyaw, w);                                   // turned the same way as the leader
        if (myH) myH.v += (lH.v - myH.v) * Math.min(1, dt * 12) * w;      // and walking at the leader's pace
      }
      // a few hearts when they first take hands
      const started = state.holdingHands?.startedAt ?? 0;
      if (started !== lastHoldStart && now - started < 500 && idx === state.holdingHands.a) { lastHoldStart = started; const cx = (me.wx + other.wx) / 2, cz = (me.wz + other.wz) / 2; emit(cx, heightAt(cx, cz) + 1.9, cz, 3); }
    }

    a.root.position.set(px, heightAt(px, pz), pz); a.root.rotation.y = yaw;
    a.couple = { kind: st.kind, role: st.role, partner: st.partner, w, idx, t };
  }

  /** Per frame: animate the floating hearts. `home` = the scene the characters are in. */
  function update(dt, home) {
    if (group.parent !== home) home?.add(group);
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i]; h.age += dt; if (h.age < 0) continue;
      const k = h.age / h.life; if (k >= 1) { group.remove(h.sp); h.sp.material.dispose(); hearts.splice(i, 1); continue; }
      h.sp.position.y += dt * 0.55; h.sp.position.x += h.drift * dt * 0.35;
      h.sp.material.opacity = Math.min(1, k * 7) * (1 - smooth01((k - 0.55) / 0.45));
      h.sp.scale.setScalar(h.s * (0.7 + 0.5 * smooth01(k * 3)));
    }
  }
  return { apply, update };
}
