// Visual effects: small pooled particles (chips, dust, leaves, droplets, sparks), water splash rings, and the hooks that
// tie them to the moments a character strikes (the same moments the sound effects fire).
import * as THREE from "three";

const MAX = 420;
const KINDS = {
  //            colours                         count  speed  up    life  size  gravity spread
  wood:   { c: [0x8a5a2b, 0xb98a4e, 0x6b4a2b], n: 9,  v: 2.6, up: 2.2, life: 0.7, s: 0.07, g: 9 },
  stone:  { c: [0x9a9a96, 0xc9c6bd, 0x6f6f6c], n: 10, v: 2.8, up: 2.0, life: 0.6, s: 0.06, g: 9 },
  leaf:   { c: [0x5e9a3c, 0x86b94a, 0x3f7a2f], n: 8,  v: 1.4, up: 1.6, life: 1.0, s: 0.08, g: 2.2 },
  dirt:   { c: [0x6b4a2b, 0x8a6a45, 0x4e3820], n: 10, v: 1.8, up: 2.4, life: 0.7, s: 0.07, g: 9 },
  water:  { c: [0x9fd8ff, 0xd8f0ff, 0x6fb4e8], n: 14, v: 1.9, up: 3.0, life: 0.8, s: 0.05, g: 9 },
  spark:  { c: [0xffd27a, 0xff9a3a, 0xfff2b0], n: 8,  v: 3.2, up: 1.5, life: 0.35, s: 0.04, g: 6 },
  gleam:  { c: [0xfff2b0, 0xffffff, 0xffe28a], n: 7,  v: 0.8, up: 1.7, life: 0.9, s: 0.06, g: -1.2 },
  dust:   { c: [0xc9b89a, 0xb5a584, 0xd8cdb4], n: 3,  v: 0.5, up: 0.5, life: 0.55, s: 0.12, g: -0.4, grow: 2.2 },
  smoke:  { c: [0xcfcfcf, 0xe6e6e6], n: 4,           v: 0.3, up: 1.0, life: 1.0, s: 0.1, g: -0.6, grow: 2.6 },
};
const AT_STRIKE = {            // sound name -> what flies when it plays
  chop: ["wood"], pickaxe: ["stone", "spark"], harvest: ["leaf"], pickup: ["gleam"], dig: ["dirt"], hammer: ["spark"], saw: ["wood"],
  water: ["water"], fillwater: ["water"], fishingreel: ["water"], hunt: [], cook: ["smoke"], eat: ["gleam"], cow: [], chest: ["gleam"],
  lightfire: ["spark", "smoke"], extinguish: ["smoke", "water"], cat: ["gleam"],
};
const SPLASH = new Set(["water", "fillwater", "fishingreel"]);

export function createEffects({ scene, terrain }) {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX); mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 5; scene.add(mesh);
  const P = []; // live particles
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();
  const rings = [];                 // splash rings: { mesh, t }
  const ringGeo = new THREE.RingGeometry(0.7, 1, 36).rotateX(-Math.PI / 2);

  function burst(kind, x, y, z, { scale = 1, dir = null } = {}) {
    const k = KINDS[kind]; if (!k) return;
    for (let i = 0; i < k.n && P.length < MAX; i++) {
      const a = Math.random() * Math.PI * 2, sp = k.v * (0.4 + Math.random() * 0.8);
      const vx = Math.cos(a) * sp + (dir ? dir.x * 1.2 : 0), vz = Math.sin(a) * sp + (dir ? dir.z * 1.2 : 0);
      P.push({ x: x + (Math.random() - 0.5) * 0.15, y, z: z + (Math.random() - 0.5) * 0.15, vx, vy: k.up * (0.6 + Math.random() * 0.7), vz, life: k.life * (0.7 + Math.random() * 0.5), age: 0, s: k.s * scale * (0.7 + Math.random() * 0.6), g: k.g, grow: k.grow || 0, c: new THREE.Color(k.c[(Math.random() * k.c.length) | 0]), spin: Math.random() * 6 });
    }
  }
  function splash(x, z) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.8, depthWrite: false }));
    m.position.set(x, 0.05, z); m.renderOrder = 6; scene.add(m); rings.push({ m, t: 0 });
  }

  /** A character struck something at world (x, y, z) while doing `sfx` (a sound name). */
  function strike(sfx, x, y, z, dir) {
    for (const kind of AT_STRIKE[sfx] || []) burst(kind, x, y, z, { dir });
    if (SPLASH.has(sfx)) { splash(x, z); burst("water", x, terrain.heightAt(x, z) + 0.1, z); }
  }

  function update(dt) {
    let n = 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.age += dt; if (p.age >= p.life) { P.splice(i, 1); continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const ground = terrain.heightAt(p.x, p.z) + 0.02;
      if (p.y < ground && p.g > 0) { p.y = ground; p.vy *= -0.25; p.vx *= 0.6; p.vz *= 0.6; }
    }
    for (const p of P) {
      const t = p.age / p.life, size = p.s * (p.grow ? 1 + p.grow * t : 1 - t * 0.7) * (p.grow ? 1 - t * t : 1);
      q.setFromAxisAngle(s3.set(0.4, 1, 0.2).normalize(), p.spin + p.age * 8);
      m4.compose(p3.set(p.x, p.y, p.z), q, s3.set(size, size, size)); mesh.setMatrixAt(n, m4); mesh.setColorAt(n, col.copy(p.c)); n++;
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt; const k = r.t / 0.8;
      if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); continue; }
      r.m.scale.setScalar(0.2 + k * 1.1); r.m.material.opacity = 0.8 * (1 - k);
    }
  }
  // ---- item pops: the icon of what you just gained floats up from your head and fades ("+2" and the picture) ----
  const iconCache = new Map(), pops = [];
  function iconCanvas(itemId) {
    if (iconCache.has(itemId)) return iconCache.get(itemId);
    const def = typeof itemDef === "function" ? itemDef(itemId) : null, c = document.createElement("canvas"); c.width = c.height = 128;
    const ctx = c.getContext("2d"), icon = def?.icon, entry = { c, tex: new THREE.CanvasTexture(c) };
    entry.tex.colorSpace = THREE.SRGBColorSpace;
    const bubble = () => { ctx.clearRect(0, 0, 128, 128); ctx.fillStyle = "rgba(30,22,14,0.82)"; ctx.beginPath(); ctx.arc(64, 64, 58, 0, 7); ctx.fill(); ctx.strokeStyle = "#e8c070"; ctx.lineWidth = 4; ctx.stroke(); };
    bubble();
    if (icon && typeof icon === "object" && icon.src) { const img = new Image(); img.onload = () => { bubble(); ctx.drawImage(img, 24, 24, 80, 80); entry.tex.needsUpdate = true; }; img.src = icon.src.replace(/^\.?\//, ""); }
    else { ctx.font = "64px system-ui, 'Segoe UI Emoji'"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(typeof icon === "string" ? icon : "📦", 64, 70); entry.tex.needsUpdate = true; }
    iconCache.set(itemId, entry); return entry;
  }
  function pop(itemId, qty, x, y, z, delay = 0) {
    const e = iconCanvas(itemId);
    const mat = new THREE.SpriteMaterial({ map: e.tex, transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0 });
    const sp = new THREE.Sprite(mat); sp.scale.setScalar(0.42); sp.position.set(x, y, z); sp.renderOrder = 20; scene.add(sp);
    let label = null;
    if (qty > 1) { const c = document.createElement("canvas"); c.width = 128; c.height = 64; const g = c.getContext("2d"); g.font = "bold 46px system-ui"; g.textAlign = "center"; g.fillStyle = "#fff"; g.strokeStyle = "#000"; g.lineWidth = 7; g.strokeText("+" + qty, 64, 46); g.fillText("+" + qty, 64, 46); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; label = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0 })); label.scale.set(0.5, 0.25, 1); label.renderOrder = 21; scene.add(label); }
    pops.push({ sp, label, t: -delay, x, y, z });
  }
  const popUpdate = (dt) => {
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.t += dt; if (p.t < 0) continue;
      const k = p.t / 1.5; if (k >= 1) { scene.remove(p.sp); p.sp.material.dispose(); if (p.label) { scene.remove(p.label); p.label.material.map.dispose(); p.label.material.dispose(); } pops.splice(i, 1); continue; }
      const rise = 1.4 * (1 - Math.pow(1 - k, 2.2)), a = Math.min(1, k * 8) * (1 - Math.max(0, (k - 0.65) / 0.35)), s = 0.42 * (0.7 + 0.45 * Math.min(1, k * 6));
      p.sp.position.set(p.x, p.y + rise, p.z); p.sp.material.opacity = a; p.sp.scale.setScalar(s);
      if (p.label) { p.label.position.set(p.x + 0.38, p.y + rise - 0.12, p.z); p.label.material.opacity = a; }
    }
  };
  const baseUpdate = update;
  return { burst, strike, splash, pop, update: (dt) => { baseUpdate(dt); popUpdate(dt); }, count: () => P.length };
}
