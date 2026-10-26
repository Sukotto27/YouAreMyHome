// Roofs. A roof is a rectangle of tiles with a style (gable / lean-to / hip); the roof *surface* of a structure is the
// union of all its roofs, which is what removes overlaps and joins roofs at seams: where two roofs overlap the higher
// one wins (so a ridge runs on through a seam and crossing roofs draw a valley), and where one stands proud of the
// next a fascia closes the step.
//
// Everything under the surface is real City Builder timber, cut to fit it: rafters along each slope (only where that
// roof is the visible one), ridge beams, and log gable courses filling the wall tops up to the roofline.
//
//   roof { id, style: "gable"|"lean"|"hip", x, y, w, d, axis: "x"|"z", high: "N"|"S"|"E"|"W", pitch }
//   axis = the ridge direction for gable/hip; `high` = which side of a lean-to is the tall one.
import * as THREE from "three";
import { GU, STONE_H, WALL_PANEL_H, logOfLength, beamOfLength } from "./pieces.js";
import { piece, quatAlong, WALL_TOP } from "./generate.js";
import { parseEdge } from "./model.js";

export const OVERHANG = 0.5;            // metres the roof projects past the wall lines (a multiple of the 0.5 m grid)
export const EAVE_RISE = 0.37;          // roof plane above the wall top, at the wall line (City Builder's value)
export const DEFAULT_PITCH = 30;
const FASCIA = 0.14, G = 0.5;
const rad = (d) => (d * Math.PI) / 180;

export function roofRect(r) { return { X0: r.x * GU, X1: (r.x + r.w) * GU, Z0: r.y * GU, Z1: (r.y + r.d) * GU }; }
const inRect = (r, x, z, e = 1e-6) => { const { X0, X1, Z0, Z1 } = roofRect(r); return x >= X0 - OVERHANG - e && x <= X1 + OVERHANG + e && z >= Z0 - OVERHANG - e && z <= Z1 + OVERHANG + e; };

/** Height of one roof's surface plane at (x, z); -Infinity outside it. `wallH` = absolute height of the roof plane at the wall line. */
export function roofHeight(r, wallH, x, z) {
  if (!inRect(r, x, z)) return -Infinity;
  const { X0, X1, Z0, Z1 } = roofRect(r), t = Math.tan(rad(r.pitch ?? DEFAULT_PITCH));
  switch (r.style) {
    case "lean": return r.high === "N" ? wallH + t * (Z1 - z) : r.high === "S" ? wallH + t * (z - Z0) : r.high === "W" ? wallH + t * (X1 - x) : wallH + t * (x - X0);
    case "hip": return wallH + t * Math.min(x - X0, X1 - x, z - Z0, Z1 - z);
    default: // gable
      return r.axis === "z" ? wallH + t * ((X1 - X0) / 2 - Math.abs(x - (X0 + X1) / 2)) : wallH + t * ((Z1 - Z0) / 2 - Math.abs(z - (Z0 + Z1) / 2));
  }
}

/** The roof field of a structure: height of the union surface and which roof owns each point. */
export function roofField(roofs, y0) {
  const wallH = y0 + WALL_TOP + EAVE_RISE;
  const H = (x, z) => { let h = -Infinity; for (const r of roofs) h = Math.max(h, roofHeight(r, wallH, x, z)); return h; };
  const owner = (i, x, z) => { const h = roofHeight(roofs[i], wallH, x, z); return h > -Infinity && h >= H(x, z) - 1e-5; };
  return { wallH, H, owner, roofs };
}

// ---------- the roof covering (one mesh for the whole union) ----------
export function roofSurfaceGeometry(roofs, y0, texScale = 1) {
  if (!roofs.length) return null;
  const f = roofField(roofs, y0);
  let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  for (const r of roofs) { const { X0, X1, Z0, Z1 } = roofRect(r); bx0 = Math.min(bx0, X0 - OVERHANG); bz0 = Math.min(bz0, Z0 - OVERHANG); bx1 = Math.max(bx1, X1 + OVERHANG); bz1 = Math.max(bz1, Z1 + OVERHANG); }
  const nx = Math.round((bx1 - bx0) / G), nz = Math.round((bz1 - bz0) / G);
  const cells = new Map(); // "i,j" -> { h:[h00,h10,h01,h11], x0, z0 }
  const key = (i, j) => `${i},${j}`;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x0 = bx0 + i * G, z0 = bz0 + j * G, cx = x0 + G / 2, cz = z0 + G / 2;
    const cover = roofs.filter((r) => inRect(r, cx, cz)); if (!cover.length) continue;
    const hh = (x, z) => { let h = -Infinity; for (const r of cover) h = Math.max(h, roofHeight(r, f.wallH, x, z)); return h; };
    cells.set(key(i, j), { x0, z0, h: [hh(x0, z0), hh(x0 + G, z0), hh(x0, z0 + G), hh(x0 + G, z0 + G)], hc: hh(cx, cz) });
  }
  const pos = [], uv = [];
  const tri = (a, b, c, ua, ub, uc) => { pos.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
  const quad = (a, b, c, d) => { tri(a, b, c, [0, 0], [0, 1], [1, 0]); tri(b, d, c, [0, 1], [1, 1], [1, 0]); };
  for (const [k, c] of cells) {
    const [i, j] = k.split(",").map(Number), { x0, z0, h } = c, x1 = x0 + G, z1 = z0 + G;
    const A = [x0, h[0], z0], B = [x1, h[1], z0], C = [x0, h[2], z1], D = [x1, h[3], z1];
    // texture orientation: strands run down the slope
    const gx = (h[1] - h[0] + h[3] - h[2]) / (2 * G), gz = (h[2] - h[0] + h[3] - h[1]) / (2 * G), k2 = Math.sqrt(1 + gx * gx + gz * gz);
    const uvOf = (p) => (Math.abs(gx) > Math.abs(gz) ? [p[2] / texScale, (p[0] * k2) / texScale] : [p[0] / texScale, (p[2] * k2) / texScale]);
    // split along the diagonal that best follows the surface (valleys and hips run diagonally)
    const e1 = Math.abs((h[0] + h[3]) / 2 - c.hc), e2 = Math.abs((h[1] + h[2]) / 2 - c.hc);
    if (e1 <= e2) { tri(A, C, D, uvOf(A), uvOf(C), uvOf(D)); tri(A, D, B, uvOf(A), uvOf(D), uvOf(B)); }
    else { tri(A, C, B, uvOf(A), uvOf(C), uvOf(B)); tri(C, D, B, uvOf(C), uvOf(D), uvOf(B)); }
    // edges: a fascia on the outside, a skirt where this cell stands proud of its neighbour
    const edge = (nk, p, q, hp, hq, np, nq) => {
      const n = cells.get(nk);
      if (!n) { quad([p[0], hp, p[1]], [q[0], hq, q[1]], [p[0], hp - FASCIA, p[1]], [q[0], hq - FASCIA, q[1]]); return; }
      const dp = hp - np, dq = hq - nq;
      if (dp > 1e-3 || dq > 1e-3) quad([p[0], hp, p[1]], [q[0], hq, q[1]], [p[0], Math.min(hp, np), p[1]], [q[0], Math.min(hq, nq), q[1]]);
    };
    const nb = (di, dj) => cells.get(key(i + di, j + dj));
    const W = nb(-1, 0), E = nb(1, 0), N = nb(0, -1), S = nb(0, 1);
    edge(key(i - 1, j), [x0, z0], [x0, z1], h[0], h[2], W?.h[1], W?.h[3]);
    edge(key(i + 1, j), [x1, z0], [x1, z1], h[1], h[3], E?.h[0], E?.h[2]);
    edge(key(i, j - 1), [x0, z0], [x1, z0], h[0], h[1], N?.h[2], N?.h[3]);
    edge(key(i, j + 1), [x0, z1], [x1, z1], h[2], h[3], S?.h[0], S?.h[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ---------- the timber under it ----------
function lateral(from, to, spacing = 1.5, margin = 0.4) {
  const len = to - from - 2 * margin; if (len <= 0) return [(from + to) / 2];
  const n = Math.max(1, Math.ceil(len / spacing)); return Array.from({ length: n + 1 }, (_, k) => from + margin + (len * k) / n);
}

/** Rafter lines for one roof: [{ a:[x,z], b:[x,z] }] running up/down its slope(s). */
function rafterLines(r) {
  const { X0, X1, Z0, Z1 } = roofRect(r), out = [], e = OVERHANG - 0.1;
  const alongZ = (x, za, zb) => out.push({ a: [x, za], b: [x, zb] }), alongX = (z, xa, xb) => out.push({ a: [xa, z], b: [xb, z] });
  if (r.style === "gable") {
    if (r.axis === "z") { const xc = (X0 + X1) / 2; for (const z of lateral(Z0 - 0.3, Z1 + 0.3)) { alongX(z, X0 - e, xc); alongX(z, xc, X1 + e); } }
    else { const zc = (Z0 + Z1) / 2; for (const x of lateral(X0 - 0.3, X1 + 0.3)) { alongZ(x, Z0 - e, zc); alongZ(x, zc, Z1 + e); } }
  } else if (r.style === "lean") {
    if (r.high === "N" || r.high === "S") for (const x of lateral(X0 - 0.3, X1 + 0.3)) alongZ(x, Z0 - e, Z1 + e);
    else for (const z of lateral(Z0 - 0.3, Z1 + 0.3)) alongX(z, X0 - e, X1 + e);
  } else { // hip: common rafters across the short axis over the flat ridge section
    const wide = X1 - X0 >= Z1 - Z0, half = Math.min(X1 - X0, Z1 - Z0) / 2;
    if (wide) for (const x of lateral(X0 + half, X1 - half, 1.5, 0)) alongZ(x, Z0 - e, Z1 + e);
    else for (const z of lateral(Z0 + half, Z1 - half, 1.5, 0)) alongX(z, X0 - e, X1 + e);
  }
  return out;
}

/** Walk a 2D line over the roof field; yield straight 3D segments where roof `i` is the visible one. */
function* ownedSegments(f, i, line, drop, flatOnly = false) {
  const step = 0.1, dx = line.b[0] - line.a[0], dz = line.b[1] - line.a[1], len = Math.hypot(dx, dz), n = Math.max(1, Math.round(len / step));
  let run = [];
  const flush = function* () {
    if (run.length >= 2) {
      let s = 0;
      for (let k = 1; k <= run.length; k++) {
        const slope = (a, b) => (b.y - a.y) / Math.max(1e-6, Math.hypot(b.x - a.x, b.z - a.z));
        if (k === run.length || Math.abs(slope(run[k - 1], run[k]) - slope(run[s], run[s + 1])) > 0.03) {
          const p = run[s], q = run[k - 1];
          if (Math.hypot(q.x - p.x, q.z - p.z) > 0.3 && (!flatOnly || Math.abs(slope(p, q)) < 0.05)) yield [[p.x, p.y - drop, p.z], [q.x, q.y - drop, q.z]];
          s = k - 1;
        }
      }
    }
    run = [];
  };
  for (let k = 0; k <= n; k++) {
    const x = line.a[0] + (dx * k) / n, z = line.a[1] + (dz * k) / n;
    if (f.owner(i, x, z)) run.push({ x, z, y: f.H(x, z) }); else yield* flush();
  }
  yield* flush();
}

/** All timber for a structure's roofs: rafters, ridge beams, gable-fill courses and eave plates. */
export function roofTimber(roofs, walls, y0) {
  if (!roofs.length) return [];
  const f = roofField(roofs, y0), P = [];
  roofs.forEach((r, i) => {
    for (const line of rafterLines(r)) for (const [p, q] of ownedSegments(f, i, line, 0.2)) {
      const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      P.push(piece(logOfLength("rafter", len, 0.1), (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, quatAlong(q[0] - p[0], q[1] - p[1], q[2] - p[2])));
    }
    // ridge beam: along the flat top of a gable or hip
    if (r.style === "gable" || r.style === "hip") {
      const { X0, X1, Z0, Z1 } = roofRect(r), alongX = r.style === "gable" ? r.axis !== "z" : X1 - X0 >= Z1 - Z0;
      const line = alongX ? { a: [X0 - OVERHANG + 0.1, (Z0 + Z1) / 2], b: [X1 + OVERHANG - 0.1, (Z0 + Z1) / 2] } : { a: [(X0 + X1) / 2, Z0 - OVERHANG + 0.1], b: [(X0 + X1) / 2, Z1 + OVERHANG - 0.1] };
      for (const [p, q] of ownedSegments(f, i, line, -0.07, true)) {
        const total = Math.hypot(q[0] - p[0], q[2] - p[2]), n = Math.max(1, Math.ceil(total / 2));
        for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n, a = [p[0] + (q[0] - p[0]) * t0, p[2] + (q[2] - p[2]) * t0], b = [p[0] + (q[0] - p[0]) * t1, p[2] + (q[2] - p[2]) * t1]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.04; P.push(piece(beamOfLength(len), (a[0] + b[0]) / 2, p[1], (a[1] + b[1]) / 2, { yaw: alongX ? 0 : 90 })); }
      }
    }
  });
  // wall tops: log courses up to the roofline (gable ends, the tall side of a lean-to, walls between rooms under a ridge), else an eave plate
  const top = y0 + WALL_TOP;
  for (const e of walls.edges.values()) {
    const run = e.axis === "h" ? (t) => [e.x * GU + t, e.y * GU] : (t) => [e.x * GU, e.y * GU + t];
    const yaw = e.axis === "h" ? 0 : 90, mid = run(1);
    if (!(f.H(mid[0], mid[1]) > -Infinity)) continue;
    let anyCourse = false;
    for (let k = 0; k < 40; k++) {
      const yb = top + k * 0.3, need = yb + 0.3 + 0.33;           // keep 0.33 m clear under the roof plane (City Builder's eave clearance)
      let t0 = null, levelHas = false;
      const samples = 40;
      const emit = (a, b) => { const len = b - a + 0.06; if (len < 0.25) return; const m = run((a + b) / 2); P.push(piece(logOfLength("gable", len), m[0], yb + 0.15, m[1], { yaw })); levelHas = true; };
      for (let s = 0; s <= samples; s++) {
        const t = (s / samples) * GU, p = run(t), ok = f.H(p[0], p[1]) >= need;
        if (ok && t0 === null) t0 = t; else if (!ok && t0 !== null) { emit(t0, t - GU / samples / 2); t0 = null; }
      }
      if (t0 !== null) emit(t0, GU);
      if (!levelHas) break;
      anyCourse = true;
    }
    if (!anyCourse) { const m = run(1); P.push(piece("log", m[0], top + 0.05, m[1], { yaw })); }
  }
  return P;
}
