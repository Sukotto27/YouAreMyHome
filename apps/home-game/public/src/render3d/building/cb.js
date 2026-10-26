// vendor/city-builder/src/editor/pieces/PieceDefs.ts
import * as THREE14 from "three";
import { mergeGeometries as mergeGeometries4 } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// vendor/city-builder/src/editor/pieces/geometry.ts
import * as THREE2 from "three";
import { mergeGeometries as mergeGeometries2 } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// vendor/city-builder/src/editor/pieces/rustic.ts
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
function seededRandom(seed) {
  let a = seed * 2654435761 >>> 0 || 1;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var TIMBER_VARIANTS = 6;
function createRusticLogGeometry(length, radius, options) {
  const rand = seededRandom(
    options.seed * 7919 + Math.round(length * 100) + Math.round(radius * 1e3)
  );
  const radial = options.radialSegments ?? 10;
  const lengthSegments = Math.max(3, Math.round(length * 4));
  const geometry = new THREE.CylinderGeometry(radius, radius, length, radial, lengthSegments);
  const bendAmount = (options.bend ?? 8e-3) * length * (0.5 + rand());
  const bendAngle = rand() * Math.PI * 2;
  const bendX = Math.cos(bendAngle) * bendAmount;
  const bendZ = Math.sin(bendAngle) * bendAmount;
  const taper = 0.04 + rand() * 0.08;
  const butt = rand() < 0.5 ? 1 : -1;
  const lumpPhase = rand() * 10;
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const t = y / length + 0.5;
    const angle = Math.atan2(z, x);
    const lump = 1 + Math.sin(angle * 3 + lumpPhase + t * 4) * 0.035 + Math.sin(angle * 5 - lumpPhase * 1.7 + t * 9) * 0.02;
    const scale = (1 + taper * butt * (0.5 - t)) * lump;
    const bow = Math.sin(Math.PI * t);
    position.setXYZ(i, x * scale + bendX * bow, y, z * scale + bendZ * bow);
  }
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * Math.PI * 2 * radius / 0.6, uv.getY(i) * length / 0.6);
  }
  const parts = [geometry.toNonIndexed()];
  if (options.nubs !== false && radius >= 0.06 && length >= 0.6) {
    const stubs = 1 + Math.floor(rand() * 2.4);
    for (let s = 0; s < stubs; s++) {
      const t = 0.15 + rand() * 0.7;
      const angle = rand() * Math.PI * 2;
      const stubRadius = radius * (0.18 + rand() * 0.14);
      const stubLength = radius * (0.35 + rand() * 0.35);
      const stub = new THREE.CylinderGeometry(stubRadius * 0.8, stubRadius, stubLength, 6);
      stub.rotateZ(-Math.PI / 2);
      stub.translate(stubLength / 2 + radius * 0.85, 0, 0);
      stub.rotateZ(rand() * 0.6 - 0.3);
      stub.rotateY(-angle);
      const bow = Math.sin(Math.PI * t);
      stub.translate(bendX * bow, (t - 0.5) * length, bendZ * bow);
      parts.push(stub.toNonIndexed());
    }
  }
  const merged = mergeGeometries(parts.map(stripTo(["position", "normal", "uv"])));
  if (!merged) throw new Error("Failed to build rustic log geometry");
  merged.rotateZ(Math.PI / 2);
  merged.computeVertexNormals();
  return merged;
}
function stripTo(names) {
  return (g) => {
    for (const name of Object.keys(g.attributes))
      if (!names.includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv && names.includes("uv")) {
      g.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)
      );
    }
    return g;
  };
}
function bowAlongX(geometry, length, seed, amount = 6e-3) {
  const rand = seededRandom(seed * 104729 + Math.round(length * 100));
  const ay = (rand() - 0.5) * 2 * amount * length;
  const az = (rand() - 0.5) * 2 * amount * length;
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const t = position.getX(i) / length + 0.5;
    const bow = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    position.setY(i, position.getY(i) + ay * bow);
    position.setZ(i, position.getZ(i) + az * bow);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// vendor/city-builder/src/editor/pieces/geometry.ts
function createLogGeometry(length, radius, segments = 12) {
  const geometry = new THREE2.CylinderGeometry(radius, radius, length, segments);
  geometry.rotateZ(Math.PI / 2);
  return geometry;
}
function createHalfLogGeometry(length, radius, segments = 12) {
  const shape = new THREE2.Shape();
  shape.moveTo(-radius, 0);
  shape.absarc(0, 0, radius, Math.PI, 0, true);
  shape.lineTo(-radius, 0);
  const geometry = new THREE2.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: false,
    curveSegments: segments,
    steps: Math.max(1, Math.round(length * 3))
    // segments along the length so it can be bowed (rustic.ts)
  });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(length / 2, 0, 0);
  return geometry;
}
function noise2D(x, z) {
  return Math.sin(x * 12.9898 + z * 78.233) * 0.5 + Math.sin(x * 4.271 - z * 9.132) * 0.3 + Math.sin(x * 21.7 + z * 3.1) * 0.2;
}
function createRidgedPanelGeometry(length, width, thickness, amplitude, ridgeFn, widthSegments = 16, lengthSegments = 8) {
  const geometry = new THREE2.BoxGeometry(
    length,
    thickness,
    width,
    lengthSegments,
    1,
    widthSegments
  );
  const position = geometry.attributes.position;
  const halfThickness = thickness / 2;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (Math.abs(y - halfThickness) > 1e-6) continue;
    const x = position.getX(i);
    const z = position.getZ(i);
    const u = z / width + 0.5;
    const v5 = x / length + 0.5;
    const edgeTaper = Math.sin(Math.PI * Math.min(Math.max(u, 0), 1));
    const offset = ridgeFn(u, v5) * amplitude * edgeTaper;
    position.setY(i, y + offset);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
function createStoneGeometry(width, height, depth) {
  const geometry = new THREE2.BoxGeometry(width, height, depth, 2, 2, 2);
  const position = geometry.attributes.position;
  const wobble = (width + height + depth) / 3 * 0.08;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    position.setXYZ(
      i,
      x + noise2D(x, y) * wobble,
      y + noise2D(y, z) * wobble,
      z + noise2D(z, x) * wobble
    );
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
function createStairsGeometry(run, rise, width, stepCount) {
  const treadDepth = run / stepCount;
  const riserHeight = rise / stepCount;
  const steps = [];
  for (let i = 0; i < stepCount; i++) {
    const stepLength = run - i * treadDepth;
    const step = new THREE2.BoxGeometry(stepLength, riserHeight, width);
    step.translate(i * treadDepth + stepLength / 2, i * riserHeight + riserHeight / 2, 0);
    steps.push(step);
  }
  const merged = mergeGeometries2(steps, false);
  if (!merged) throw new Error("Failed to build stairs geometry");
  return merged;
}
function logGableCourses(baseHalfWidth, pitchRad, eaveClearance, radius) {
  const halves = [];
  for (let k = 0; ; k++) {
    const top = (k + 1) * radius * 2;
    const half = Math.min(
      baseHalfWidth,
      baseHalfWidth - (top - eaveClearance) / Math.tan(pitchRad)
    );
    if (half < radius * 2) break;
    halves.push(half);
  }
  return halves;
}
function createLogGableGeometry(courseHalfWidths, radius, seed) {
  const height = courseHalfWidths.length * radius * 2;
  const parts = courseHalfWidths.map((half, k) => {
    const course = seed === void 0 ? createLogGeometry(half * 2, radius, 10) : stripTo(["position", "normal", "uv"])(
      createRusticLogGeometry(half * 2 + 0.06, radius, { seed: seed * 31 + k, nubs: false })
    );
    course.translate(0, -height / 2 + radius + k * radius * 2, 0);
    return course;
  });
  const merged = mergeGeometries2(
    seed === void 0 ? parts : parts.map((p) => p.index ? p.toNonIndexed() : p),
    false
  );
  if (!merged) throw new Error("Failed to build log gable geometry");
  return merged;
}
// (our addition) a wall can be built without its two corner posts, so the generator can stand ONE post at every corner or junction
var NO_WALL_POSTS = false;
function withoutWallPosts(fn) { const was = NO_WALL_POSTS; NO_WALL_POSTS = true; try { return fn(); } finally { NO_WALL_POSTS = was; } }
function createLogWallGeometry(width, height, radius, opening, seed) {
  const rustic = seed !== void 0;
  const log = (length, s, nubs = true) => rustic ? createRusticLogGeometry(length, radius, { seed: s, nubs }) : createLogGeometry(length, radius, 10).toNonIndexed();
  const parts = [];
  for (const [k, x] of (NO_WALL_POSTS ? [] : [-width / 2 + radius, width / 2 - radius]).entries()) {
    const post = log(height, (seed ?? 0) * 13 + 97 + k, false);
    post.rotateZ(Math.PI / 2);
    post.translate(x, 0, 0);
    parts.push(post);
  }
  const courseHeight = radius * 2;
  const courseCount = Math.max(1, Math.floor(height / courseHeight));
  const span = width - radius * 2;
  const bottom = -height / 2;
  const openingBottom = opening ? bottom + opening.sill : 0;
  const openingTop = opening ? openingBottom + opening.height : 0;
  for (let i = 0; i < courseCount; i++) {
    const centerY = bottom + radius + i * courseHeight;
    const courseTop = centerY + radius;
    const courseBottom = centerY - radius;
    const crossesOpening = !!opening && courseBottom >= openingBottom - 1e-6 && courseTop <= openingTop + 1e-6;
    const courseSeed = (seed ?? 0) * 31 + i;
    if (!crossesOpening) {
      const overhang = rustic ? (i % 2 === 0 ? 0.12 : 0.02) + courseSeed * 37 % 7 * 0.012 : 0;
      const course = log(span + overhang * 2, courseSeed);
      course.translate(0, centerY, 0);
      parts.push(course);
      continue;
    }
    const stubWidth = (span - opening.width) / 2;
    if (stubWidth > radius) {
      const left = log(stubWidth, courseSeed, false);
      left.translate(-span / 2 + stubWidth / 2, centerY, 0);
      parts.push(left);
      const right = log(stubWidth, courseSeed + 500, false);
      right.translate(span / 2 - stubWidth / 2, centerY, 0);
      parts.push(right);
    }
  }
  const merged = mergeGeometries2(parts.map(stripTo(["position", "normal", "uv"])), false);
  if (!merged) throw new Error("Failed to build log wall geometry");
  return merged;
}
var DOOR_PLANK_TILE = 1.52;
function doorPlankUVs(g, sx, sy, x) {
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const vertical = sy >= sx;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i) + x;
    const py = pos.getY(i);
    const along = vertical ? py : px;
    const across = vertical ? px : py + x * 0.37;
    uv.setXY(i, along / DOOR_PLANK_TILE, across / DOOR_PLANK_TILE);
  }
}
function createOpeningFillGeometry(height, opening, kind, seed) {
  const bottom = -height / 2 + opening.sill;
  const w = opening.width;
  const h = opening.height;
  const wood = [];
  const dark = [];
  const box2 = (sx, sy, sz, x, y, z, list, rz = 0) => {
    const g = new THREE2.BoxGeometry(sx, sy, sz);
    if (kind === "door" && list === wood) doorPlankUVs(g, sx, sy, x);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    list.push(g.toNonIndexed());
  };
  const tilt = (seed * 53 % 9 - 4) * 4e-3;
  if (kind === "door") {
    const boards2 = 5;
    const bw = (w - 0.04) / boards2;
    for (let b = 0; b < boards2; b++) {
      const bh = h - 0.03 - (seed + b * 7) % 3 * 0.015;
      box2(bw - 8e-3, bh, 0.05, -w / 2 + 0.02 + bw * (b + 0.5), bottom + bh / 2, -0.05, wood);
    }
    for (const y of [0.25, h - 0.3]) box2(w - 0.12, 0.1, 0.035, 0, bottom + y, -0.01, wood);
    const diagonal = Math.hypot(w - 0.2, h - 0.65);
    box2(
      diagonal,
      0.09,
      0.035,
      0,
      bottom + h / 2 - 0.02,
      -5e-3,
      wood,
      Math.atan2(h - 0.65, w - 0.2)
    );
    for (const y of [0.3, h - 0.35])
      box2(w * 0.45, 0.045, 0.012, -w / 2 + w * 0.22, bottom + y, 0.01, dark);
    box2(0.04, 0.04, 0.05, w / 2 - 0.15, bottom + h * 0.5, 0.02, dark);
  } else {
    const t = 0.06;
    box2(w + 0.1, t, 0.1, 0, bottom - t / 2 + 0.02, 0.02, wood);
    box2(w + 0.06, t, 0.08, 0, bottom + h - t / 2, 0.02, wood);
    for (const side of [-1, 1]) box2(t, h, 0.08, side * (w / 2 - t / 2), bottom + h / 2, 0.02, wood);
    box2(0.04, h - t, 0.04, tilt, bottom + h / 2, 0, wood);
    box2(w - t, h - t, 0.01, 0, bottom + h / 2, -0.03, dark);
    for (const side of [-1, 1]) {
      const swing = (side < 0 ? 1.9 : 2.2) + tilt * 20;
      const sw = w / 2;
      const shutter = new THREE2.BoxGeometry(sw, h - 0.04, 0.035);
      shutter.translate(side * sw / 2, 0, 0);
      shutter.rotateY(-side * (Math.PI - swing));
      shutter.translate(side * (w / 2 + 0.02), bottom + h / 2, 0.1);
      wood.push(shutter.toNonIndexed());
    }
  }
  const woodMerged = mergeGeometries2(wood.map(stripTo(["position", "normal", "uv"])));
  const darkMerged = mergeGeometries2(dark.map(stripTo(["position", "normal", "uv"])));
  if (!woodMerged || !darkMerged) throw new Error("Failed to build opening fill geometry");
  return { wood: woodMerged, dark: darkMerged };
}
function grainUVs(box2, along = 1.3, across = 0.45) {
  const pos = box2.attributes.position;
  const uv = box2.attributes.uv;
  const size = new THREE2.Vector3();
  box2.computeBoundingBox();
  box2.boundingBox.getSize(size);
  const dims = [size.x, size.y, size.z];
  const long = dims.indexOf(Math.max(...dims));
  const n = new THREE2.Vector3();
  const normal = box2.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(normal, i);
    const axis = Math.abs(n.x) > 0.5 ? 0 : Math.abs(n.y) > 0.5 ? 1 : 2;
    const inPlane = [0, 1, 2].filter((a) => a !== axis);
    const u = axis === long ? dims[inPlane[0]] >= dims[inPlane[1]] ? inPlane[0] : inPlane[1] : long;
    const v5 = inPlane.find((a) => a !== u);
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    uv.setXY(i, p[u] / along, p[v5] / across + axis * 0.31);
  }
  uv.needsUpdate = true;
  return box2;
}

// vendor/city-builder/src/editor/pieces/propGeometry.ts
import * as THREE3 from "three";
import { mergeGeometries as mergeGeometries3 } from "three/examples/jsm/utils/BufferGeometryUtils.js";
function mergeParts(parts) {
  const merged = mergeGeometries3(parts.map((p) => p.index ? p.toNonIndexed() : p));
  if (!merged) throw new Error("Failed to merge prop geometry");
  return merged;
}
function grouped(partsPerMaterial) {
  const merged = mergeGeometries3(partsPerMaterial.map(mergeParts), true);
  if (!merged) throw new Error("Failed to merge grouped prop geometry");
  return merged;
}
function rod(a, b, radius, segments = 6) {
  const length = a.distanceTo(b);
  const geometry = new THREE3.CylinderGeometry(radius, radius, length, segments);
  const direction = b.clone().sub(a).normalize();
  geometry.applyQuaternion(
    new THREE3.Quaternion().setFromUnitVectors(new THREE3.Vector3(0, 1, 0), direction)
  );
  const mid = a.clone().add(b).multiplyScalar(0.5);
  geometry.translate(mid.x, mid.y, mid.z);
  return geometry;
}
var v = (x, y, z) => new THREE3.Vector3(x, y, z);
function triangle(points, thickness) {
  const shape = new THREE3.Shape(points.map(([x, y]) => new THREE3.Vector2(x, y)));
  const geometry = new THREE3.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, -thickness / 2);
  return geometry;
}
var TENT_WIDTH = 2.2;
var TENT_HEIGHT = 1.75;
var TENT_DEPTH = 2.6;
function createHideTentGeometry() {
  const w = TENT_WIDTH;
  const h = TENT_HEIGHT;
  const d = TENT_DEPTH;
  const skin = 0.03;
  const slope = Math.hypot(w / 2, h);
  const pitch = Math.atan2(h, w / 2);
  const hide = [];
  for (const side of [-1, 1]) {
    const panel = new THREE3.BoxGeometry(slope, skin, d);
    panel.rotateZ(-side * pitch);
    panel.translate(side * w / 4, h / 2, 0);
    hide.push(panel);
  }
  const back = triangle(
    [
      [-w / 2, 0],
      [w / 2, 0],
      [0, h]
    ],
    skin
  );
  back.translate(0, 0, -d / 2 + skin);
  hide.push(back);
  const flap = triangle(
    [
      [-w / 2, 0],
      [-0.12, 0],
      [0, h]
    ],
    skin
  );
  flap.translate(0, 0, d / 2 - skin);
  hide.push(flap);
  const poles = [];
  const poleR = 0.035;
  const over = 0.28;
  for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) {
    for (const side of [-1, 1]) {
      const foot = v(side * (w / 2 - 0.02), 0, z);
      const apex = v(0, h, z);
      const tip = apex.clone().add(apex.clone().sub(foot).normalize().multiplyScalar(over));
      poles.push(rod(foot, tip, poleR));
    }
  }
  poles.push(rod(v(0, h - 0.01, -d / 2 - 0.15), v(0, h - 0.01, d / 2 + 0.15), poleR));
  return grouped([hide, poles]);
}
var FIRE_RING_RADIUS = 0.62;
function createFireRingGeometry() {
  const stones = [];
  const count = 11;
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2;
    const stone = createStoneGeometry(0.3 + i % 3 * 0.03, 0.2 + i % 2 * 0.04, 0.24);
    stone.rotateY(-angle + i % 4 * 0.2);
    stone.translate(Math.cos(angle) * FIRE_RING_RADIUS, 0.08, Math.sin(angle) * FIRE_RING_RADIUS);
    stones.push(stone);
  }
  const ash = new THREE3.CylinderGeometry(FIRE_RING_RADIUS - 0.1, FIRE_RING_RADIUS - 0.1, 0.02, 16);
  ash.translate(0, 0.01, 0);
  return grouped([stones, [ash]]);
}
function createCampfireWoodGeometry() {
  const logs = [];
  const r = 0.055;
  const length = 0.62;
  for (let layer = 0; layer < 4; layer++) {
    const y = r + layer * r * 1.8;
    for (const offset of [-0.21, 0.21]) {
      const log = createLogGeometry(length, r, 7);
      if (layer % 2 === 0) log.translate(0, y, offset);
      else {
        log.rotateY(Math.PI / 2);
        log.translate(offset, y, 0);
      }
      logs.push(log);
    }
  }
  const kindling = [];
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * Math.PI * 2;
    kindling.push(
      rod(v(Math.cos(angle) * 0.13, 0.02, Math.sin(angle) * 0.13), v(0, 0.42, 0), 0.018, 5)
    );
  }
  return grouped([logs, kindling]);
}
var CRATE_SIZE = 0.6;
function createCrateGeometry(size = CRATE_SIZE) {
  const core = new THREE3.BoxGeometry(size * 0.94, size * 0.94, size * 0.94);
  core.translate(0, size / 2, 0);
  const frame = [];
  const t = size * 0.09;
  const half = size / 2 - t / 2;
  for (const a of [-half, half]) {
    for (const b of [-half, half]) {
      const vertical = new THREE3.BoxGeometry(t, size, t);
      vertical.translate(a, size / 2, b);
      const alongX = new THREE3.BoxGeometry(size, t, t);
      alongX.translate(0, size / 2 + a, b);
      const alongZ = new THREE3.BoxGeometry(t, t, size);
      alongZ.translate(a, size / 2 + b, 0);
      frame.push(vertical, alongX, alongZ);
    }
  }
  return grouped([[core], frame]);
}
var SACK_HEIGHT = 0.68;
function createSackGeometry() {
  const profile = [
    [0, 0],
    [0.19, 0],
    [0.26, 0.1],
    [0.28, 0.28],
    [0.23, 0.44],
    [0.1, 0.55],
    [0.06, 0.59],
    [0.1, 0.65],
    [0.06, 0.68],
    [0, SACK_HEIGHT]
  ].map(([x, y]) => new THREE3.Vector2(x, y));
  const geometry = new THREE3.LatheGeometry(profile, 10);
  geometry.scale(1, 1, 0.85);
  return geometry;
}
var BARREL_HEIGHT = 0.82;
var BARREL_RADIUS = 0.3;
function createBarrelGeometry() {
  const h = BARREL_HEIGHT;
  const radiusAt = (y) => BARREL_RADIUS - 0.05 * Math.pow(2 * y / h - 1, 2);
  const profile = [new THREE3.Vector2(0, 0)];
  for (let i = 0; i <= 8; i++) {
    const y = i / 8 * h;
    profile.push(new THREE3.Vector2(radiusAt(y), y));
  }
  profile.push(new THREE3.Vector2(0, h));
  const staves = new THREE3.LatheGeometry(profile, 14);
  const hoops = [0.12, h - 0.12].map((y) => {
    const hoop = new THREE3.TorusGeometry(radiusAt(y) + 6e-3, 0.014, 4, 18);
    hoop.rotateX(Math.PI / 2);
    hoop.translate(0, y, 0);
    return hoop;
  });
  return grouped([[staves], hoops]);
}
var BASKET_RADIUS = 0.26;
var BASKET_HEIGHT = 0.24;
function createBasketGeometry() {
  const r = BASKET_RADIUS;
  const h = BASKET_HEIGHT;
  const profile = [
    [0, 0],
    [r * 0.72, 0],
    [r, h],
    [r - 0.025, h],
    [r * 0.72 - 0.02, 0.025],
    [0, 0.025]
  ].map(([x, y]) => new THREE3.Vector2(x, y));
  const body = new THREE3.LatheGeometry(profile, 12);
  const rim = new THREE3.TorusGeometry(r - 0.01, 0.02, 4, 16);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, h, 0);
  return mergeParts([body, rim]);
}
function createChoppingBlockGeometry() {
  const stump = new THREE3.CylinderGeometry(0.28, 0.32, 0.55, 10);
  stump.translate(0, 0.275, 0);
  const tilt = new THREE3.Quaternion().setFromEuler(new THREE3.Euler(0, 0.6, -0.95));
  const handle = new THREE3.CylinderGeometry(0.022, 0.026, 0.72, 6);
  handle.translate(0, 0.36, 0);
  handle.applyQuaternion(tilt);
  handle.translate(0.05, 0.55, 0);
  const head = new THREE3.BoxGeometry(0.06, 0.2, 0.035);
  head.translate(0, 0.02, 0);
  head.applyQuaternion(tilt);
  head.translate(0.05, 0.55, 0);
  return grouped([[stump], [handle], [head]]);
}
function createDryingRackGeometry() {
  const halfLength = 0.95;
  const height = 1.55;
  const wood = [];
  for (const x of [-halfLength, halfLength]) {
    wood.push(rod(v(x, 0, -0.45), v(x, height + 0.1, 0.05), 0.03));
    wood.push(rod(v(x, 0, 0.45), v(x, height + 0.1, -0.05), 0.03));
  }
  wood.push(rod(v(-halfLength - 0.1, height, 0), v(halfLength + 0.1, height, 0), 0.028));
  wood.push(rod(v(-halfLength, 0.75, -0.27), v(halfLength, 0.75, -0.27), 0.022));
  const green = [];
  const dried = [];
  for (let i = 0; i < 7; i++) {
    const x = -0.75 + i * 0.25;
    const bundle = new THREE3.ConeGeometry(0.075, 0.32, 6);
    bundle.translate(x, height - 0.2 - i % 2 * 0.04, 0);
    const string = rod(v(x, height, 0), v(x, height - 0.05, 0), 6e-3, 3);
    (i % 3 === 1 ? dried : green).push(bundle);
    wood.push(string);
  }
  return grouped([wood, green, dried]);
}
var CHIMNEY_HEIGHT = 5.4;
function createStoneChimneyGeometry(seed = 0) {
  const stones = [];
  const course = 0.24;
  const courses = Math.round(CHIMNEY_HEIGHT / course);
  let s = seed * 9301 + 49297;
  const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const leanX = 0.012 + rand() * 0.012;
  const leanZ = (rand() - 0.5) * 0.01;
  for (let i = 0; i < courses; i++) {
    const t = i / courses;
    const half = 0.48 - 0.16 * Math.min(1, t * 1.6);
    const y = i * course;
    const ox = leanX * i;
    const oz = leanZ * i;
    for (let side = 0; side < 4; side++) {
      const along = side % 2 === 0;
      const stonesPerSide = 2;
      for (let k = 0; k < stonesPerSide; k++) {
        const len = half * 2 / stonesPerSide + 0.05;
        const stone = createStoneGeometry(along ? len : 0.2, course * 1.05, along ? 0.2 : len);
        const offset = -half + half * 2 * (k + 0.5) / stonesPerSide + (i % 2 ? 0.08 : -0.08);
        const px = along ? offset : side === 1 ? half - 0.1 : -half + 0.1;
        const pz = along ? side === 0 ? half - 0.1 : -half + 0.1 : offset;
        stone.rotateY((rand() - 0.5) * 0.15);
        stone.translate(
          px + ox + (rand() - 0.5) * 0.03,
          y + course / 2,
          pz + oz + (rand() - 0.5) * 0.03
        );
        stones.push(stone);
      }
    }
  }
  const cap = createStoneGeometry(0.85, 0.1, 0.85);
  cap.translate(leanX * courses, courses * course + 0.05, leanZ * courses);
  stones.push(cap);
  return mergeParts(stones);
}
var WELL_SHAFT_RADIUS = 0.78;
var WELL_SHAFT_HEIGHT = 0.85;
function createWellShaftGeometry(radius = WELL_SHAFT_RADIUS) {
  const stones = [];
  const courses = 4;
  const perCourse = Math.round(12 * radius / WELL_SHAFT_RADIUS);
  const courseHeight = (WELL_SHAFT_HEIGHT - 0.12) / courses;
  const mid = radius - 0.13;
  for (let c = 0; c < courses; c++) {
    for (let i = 0; i < perCourse; i++) {
      const angle = (i + c % 2 * 0.5) / perCourse * Math.PI * 2;
      const chord = 2 * mid * Math.sin(Math.PI / perCourse) * 1.12;
      const stone = createStoneGeometry(chord, courseHeight * 0.98, 0.26 + (i + c) % 3 * 0.015);
      stone.rotateY(-angle + Math.PI / 2);
      stone.translate(Math.cos(angle) * mid, courseHeight * (c + 0.5), Math.sin(angle) * mid);
      stones.push(stone);
    }
  }
  const caps = Math.round(10 * radius / WELL_SHAFT_RADIUS);
  for (let i = 0; i < caps; i++) {
    const angle = (i + 0.25) / caps * Math.PI * 2;
    const r = radius - 0.12;
    const cap = createStoneGeometry(2 * r * Math.sin(Math.PI / caps) * 1.06, 0.12, 0.34);
    cap.rotateY(-angle + Math.PI / 2);
    cap.translate(Math.cos(angle) * r, WELL_SHAFT_HEIGHT - 0.06, Math.sin(angle) * r);
    stones.push(cap);
  }
  const inner = radius - 0.28;
  const water = new THREE3.CircleGeometry(inner, 20).rotateX(-Math.PI / 2);
  water.translate(0, 0.18, 0);
  const lining = new THREE3.CylinderGeometry(
    inner - 0.015,
    inner - 0.015,
    WELL_SHAFT_HEIGHT - 0.1,
    20,
    1,
    true
  );
  lining.translate(0, (WELL_SHAFT_HEIGHT - 0.1) / 2 + 0.05, 0);
  lining.scale(-1, 1, 1);
  return grouped([stones, [water], [lining]]);
}
var WINDLASS_HALF_SPAN = 0.98;
var WINDLASS_AXLE_Y = 1.35;
var WINDLASS_POST_TOP = 2.18;
function createWindlassGeometry(halfSpan = WINDLASS_HALF_SPAN) {
  const wood = [];
  for (const side of [-1, 1]) {
    const post = new THREE3.BoxGeometry(0.13, WINDLASS_POST_TOP, 0.13);
    post.translate(side * halfSpan, WINDLASS_POST_TOP / 2, 0);
    wood.push(post);
    for (const z of [-1, 1]) {
      wood.push(rod(v(side * halfSpan, 0.75, 0), v(side * halfSpan, 0.02, z * 0.55), 0.035, 5));
    }
  }
  const axle = new THREE3.CylinderGeometry(0.055, 0.055, halfSpan * 2 + 0.14, 8).rotateZ(
    Math.PI / 2
  );
  axle.translate(0, WINDLASS_AXLE_Y, 0);
  const drum = new THREE3.CylinderGeometry(0.11, 0.11, 0.46, 10).rotateZ(Math.PI / 2);
  drum.translate(0, WINDLASS_AXLE_Y, 0);
  wood.push(axle, drum);
  const rope = [];
  for (let i = 0; i < 6; i++) {
    const turn = new THREE3.TorusGeometry(0.118, 0.012, 4, 12).rotateY(Math.PI / 2);
    turn.translate(-0.15 + i * 0.05, WINDLASS_AXLE_Y, 0);
    rope.push(turn);
  }
  rope.push(rod(v(0.1, WINDLASS_AXLE_Y - 0.11, 0), v(0.1, 0.98, 0), 0.012, 4));
  const iron = [];
  const x0 = halfSpan + 0.07;
  iron.push(rod(v(x0, WINDLASS_AXLE_Y, 0), v(x0 + 0.06, WINDLASS_AXLE_Y, 0), 0.02, 5));
  iron.push(
    rod(v(x0 + 0.06, WINDLASS_AXLE_Y, 0), v(x0 + 0.06, WINDLASS_AXLE_Y - 0.28, 0.05), 0.018, 5)
  );
  iron.push(
    rod(
      v(x0 + 0.06, WINDLASS_AXLE_Y - 0.28, 0.05),
      v(x0 + 0.2, WINDLASS_AXLE_Y - 0.28, 0.05),
      0.022,
      5
    )
  );
  for (const side of [-1, 1]) {
    const strap = new THREE3.BoxGeometry(0.15, 0.04, 0.15);
    strap.translate(side * halfSpan, WINDLASS_AXLE_Y, 0);
    iron.push(strap);
  }
  return grouped([wood, rope, iron]);
}
function createHideAwningGeometry(depth = 1.1) {
  const geometry = new THREE3.PlaneGeometry(2.04, depth, 10, 6);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / 1.02;
    const z = pos.getZ(i) / (depth / 2);
    const sag = (1 - z * z) * 0.05 + (1 - x * x) * 0.015;
    const ripple = Math.sin(x * 9 + z * 3) * 6e-3;
    pos.setY(i, -sag + ripple);
  }
  geometry.computeVertexNormals();
  return geometry;
}
var GAME_RACK_BAR_Y = 2;
var GAME_RACK_HALF = 1.25;
function createGameRackGeometry() {
  const wood = [];
  const lash = [];
  for (const side of [-1, 1]) {
    const x = side * GAME_RACK_HALF;
    wood.push(rod(v(x, -0.2, 0), v(x + side * 0.02, GAME_RACK_BAR_Y - 0.05, 0), 0.06, 7));
    wood.push(
      rod(v(x, GAME_RACK_BAR_Y - 0.12, 0), v(x - 0.1, GAME_RACK_BAR_Y + 0.22, 0.03), 0.035, 5)
    );
    wood.push(
      rod(v(x, GAME_RACK_BAR_Y - 0.12, 0), v(x + 0.11, GAME_RACK_BAR_Y + 0.2, -0.03), 0.035, 5)
    );
    wood.push(rod(v(x, 0.9, 0), v(x, 0.02, side * 0.5), 0.035, 5));
    const knot = new THREE3.TorusGeometry(0.075, 0.018, 4, 10).rotateY(Math.PI / 2);
    knot.translate(x, GAME_RACK_BAR_Y, 0);
    lash.push(knot);
  }
  wood.push(
    rod(
      v(-GAME_RACK_HALF - 0.25, GAME_RACK_BAR_Y, 0),
      v(GAME_RACK_HALF + 0.25, GAME_RACK_BAR_Y + 0.03, 0),
      0.045,
      7
    )
  );
  return grouped([wood, lash]);
}
function createRowboatGeometry() {
  const length = 2.8;
  const radius = 0.5;
  const hull = new THREE3.CylinderGeometry(
    radius,
    radius,
    length,
    14,
    10,
    true,
    Math.PI / 2,
    Math.PI
  );
  hull.rotateX(-Math.PI / 2);
  const pos = hull.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getZ(i) / (length / 2);
    const pinch = t > 0 ? 1 - Math.pow(t, 2.2) * 0.96 : 1 - Math.pow(-t, 3) * 0.45;
    pos.setX(i, pos.getX(i) * pinch);
    const y = pos.getY(i);
    pos.setY(i, y * 0.75 + (y > -0.05 ? t * t * 0.12 : Math.abs(t) * 0.08));
  }
  hull.computeVertexNormals();
  hull.translate(0, radius * 0.75, 0);
  const transom = new THREE3.CircleGeometry(radius * 0.56, 10, Math.PI, Math.PI);
  transom.scale(1, 0.75, 1);
  transom.translate(0, radius * 0.75, -length / 2 + 0.01);
  const wood = [];
  for (const z of [-0.55, 0.35]) {
    const thwart = new THREE3.BoxGeometry(0.82 - Math.abs(z) * 0.2, 0.05, 0.2);
    thwart.translate(0, radius * 0.62, z);
    wood.push(thwart);
  }
  for (const side of [-1, 1]) {
    wood.push(rod(v(side * 0.16, 0.2, -1.15), v(side * 0.1, 0.24, 1), 0.022, 5));
    const blade = new THREE3.BoxGeometry(0.12, 0.02, 0.45);
    blade.translate(side * 0.1, 0.24, 1.15);
    wood.push(blade);
  }
  return grouped([[hull, transom], wood]);
}
function createNetPolesGeometry() {
  const half = 1;
  const top = 1.9;
  const wood = [];
  for (const side of [-1, 1])
    wood.push(rod(v(side * half, -0.15, 0), v(side * half, top + 0.15, 0), 0.045, 6));
  const net = [];
  const cols = 12;
  const rows = 8;
  const at = (u, w) => {
    const x = u * (half - 0.04);
    const sag = (1 - u * u) * 0.22;
    const y = top - sag - w * (top - 0.25 - sag * 0.5);
    const z = Math.sin(u * 5 + w * 3) * 0.04 + w * w * 0.12;
    return v(x, y, z);
  };
  for (let c = 0; c <= cols; c++) {
    const u = -1 + 2 * c / cols;
    for (let r = 0; r < rows; r++) net.push(rod(at(u, r / rows), at(u, (r + 1) / rows), 6e-3, 3));
  }
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      net.push(
        rod(
          at(-1 + 2 * c / cols, r / rows),
          at(-1 + 2 * (c + 1) / cols, r / rows),
          r === 0 ? 0.012 : 6e-3,
          3
        )
      );
    }
  }
  const foot = new THREE3.CylinderGeometry(0.09, 0.11, half * 1.8, 6).rotateZ(Math.PI / 2);
  foot.scale(1, 0.5, 1);
  foot.translate(0, 0.05, 0.25);
  net.push(foot);
  const floats = [];
  for (let c = 1; c < cols; c += 2) {
    const p = at(-1 + 2 * c / cols, 0);
    const f = new THREE3.SphereGeometry(0.045, 6, 4);
    f.translate(p.x, p.y, p.z);
    floats.push(f);
  }
  return grouped([wood, net, floats]);
}
var STALL_WIDTH = 2.4;
var STALL_DEPTH = 1.2;
var STALL_TABLE_Y = 0.82;
function createMarketStallGeometry() {
  const hx = STALL_WIDTH / 2 - 0.08;
  const hz = STALL_DEPTH / 2 - 0.05;
  const front = 2.35;
  const back = 1.9;
  const wood = [];
  for (const sx of [-1, 1]) {
    wood.push(rod(v(sx * hx, 0, hz), v(sx * hx, front, hz), 0.05, 6));
    wood.push(rod(v(sx * hx, 0, -hz), v(sx * hx, back, -hz), 0.05, 6));
    wood.push(
      rod(
        v(sx * (hx - 0.25), 0, hz - 0.15),
        v(sx * (hx - 0.25), STALL_TABLE_Y - 0.04, -0.05),
        0.035,
        5
      )
    );
    wood.push(
      rod(
        v(sx * (hx - 0.25), 0, -hz + 0.15),
        v(sx * (hx - 0.25), STALL_TABLE_Y - 0.04, 0.05),
        0.035,
        5
      )
    );
  }
  for (let i = 0; i < 3; i++) {
    const top = new THREE3.CylinderGeometry(
      0.13,
      0.13,
      STALL_WIDTH - 0.3,
      8,
      1,
      false,
      0,
      Math.PI
    ).rotateZ(Math.PI / 2);
    top.rotateX(Math.PI / 2);
    top.translate(0, STALL_TABLE_Y - 0.02, -0.3 + i * 0.27);
    wood.push(top);
  }
  wood.push(rod(v(-hx - 0.1, front, hz), v(hx + 0.1, front, hz), 0.04, 5));
  wood.push(rod(v(-hx - 0.1, back, -hz), v(hx + 0.1, back, -hz), 0.04, 5));
  const awning = new THREE3.PlaneGeometry(STALL_WIDTH + 0.25, 1, 12, 4);
  const slope = Math.hypot(front - back, 2 * hz + 0.25);
  awning.scale(1, slope, 1);
  awning.rotateX(-Math.PI / 2 + Math.atan2(front - back, 2 * hz + 0.25));
  const ap = awning.attributes.position;
  for (let i = 0; i < ap.count; i++) {
    const u = ap.getX(i) / ((STALL_WIDTH + 0.25) / 2);
    ap.setY(i, ap.getY(i) - (1 - u * u) * 0.05);
  }
  awning.translate(0, (front + back) / 2 + 0.05, 0.06);
  awning.computeVertexNormals();
  const cloth = [awning];
  const scallops = 6;
  for (let i = 0; i < scallops; i++) {
    const w = (STALL_WIDTH + 0.2) / scallops;
    const s = new THREE3.CircleGeometry(w / 2, 8, Math.PI, Math.PI);
    s.scale(1, 0.55, 1);
    s.translate(-(STALL_WIDTH + 0.2) / 2 + w * (i + 0.5), front + 0.06, hz + 0.16);
    const flap = new THREE3.PlaneGeometry(w, 0.12);
    flap.translate(-(STALL_WIDTH + 0.2) / 2 + w * (i + 0.5), front + 0.12, hz + 0.16);
    cloth.push(s, flap);
  }
  return grouped([wood, cloth]);
}
function createMarketPostGeometry() {
  const stones = [];
  const steps = [
    { size: 1.4, y: 0, h: 0.2 },
    { size: 0.9, y: 0.2, h: 0.2 }
  ];
  for (const step of steps) {
    const n = step.size > 1 ? 4 : 2;
    const piece = step.size / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const s = createStoneGeometry(piece * 0.98, step.h, piece * 0.98);
        s.translate(
          -step.size / 2 + piece * (i + 0.5),
          step.y + step.h / 2,
          -step.size / 2 + piece * (j + 0.5)
        );
        stones.push(s);
      }
    }
  }
  const wood = [];
  const post = new THREE3.BoxGeometry(0.2, 3.2, 0.2);
  post.translate(0, 0.4 + 1.6, 0);
  wood.push(post);
  const arm = new THREE3.BoxGeometry(1, 0.13, 0.13);
  arm.translate(0, 2.75, 0);
  wood.push(arm);
  const cap = new THREE3.ConeGeometry(0.2, 0.25, 4).rotateY(Math.PI / 4);
  cap.translate(0, 3.72, 0);
  wood.push(cap);
  wood.push(rod(v(0, 3.8, 0), v(0, 4.4, 0), 0.02, 4));
  const pennant = triangle(
    [
      [0, 0],
      [0.7, -0.12],
      [0, -0.26]
    ],
    0.01
  );
  pennant.translate(0.02, 4.38, 0);
  return grouped([stones, wood, [pennant]]);
}
var MIDDEN_WIDTH = 2.4;
var MIDDEN_DEPTH = 1.6;
function createMiddenPitGeometry() {
  const wood = [];
  const hx = MIDDEN_WIDTH / 2;
  const hz = MIDDEN_DEPTH / 2;
  for (const sz of [-1, 1]) {
    wood.push(rod(v(-hx - 0.12, 0.12, sz * hz), v(hx + 0.12, 0.12, sz * hz), 0.12, 8));
  }
  for (const sx of [-1, 1]) {
    wood.push(rod(v(sx * hx, 0.12, -hz + 0.1), v(sx * hx, 0.12, hz - 0.1), 0.11, 8));
  }
  const muck = new THREE3.PlaneGeometry(MIDDEN_WIDTH - 0.1, MIDDEN_DEPTH - 0.1, 6, 4).rotateX(
    -Math.PI / 2
  );
  const mp = muck.attributes.position;
  for (let i = 0; i < mp.count; i++)
    mp.setY(i, 0.03 + Math.sin(mp.getX(i) * 4 + mp.getZ(i) * 6) * 0.015);
  muck.computeVertexNormals();
  return grouped([wood, [muck]]);
}
function createCompostBinGeometry() {
  const half = 0.55;
  const height = 0.85;
  const wood = [];
  const corners = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half]
  ];
  for (const [x, z] of corners)
    wood.push(rod(v(x, 0, z), v(x * 1.02, height + 0.12, z * 1.02), 0.035, 5));
  for (let side = 0; side < 4; side++) {
    const [ax, az] = corners[side];
    const [bx, bz] = corners[(side + 1) % 4];
    for (let row = 0; row < 7; row++) {
      const y = 0.1 + row * 0.11;
      const bulge = row % 2 === 0 ? 0.02 : -0.02;
      const nx = az === bz ? 0 : Math.sign(ax);
      const nz = az === bz ? Math.sign(az) : 0;
      wood.push(
        rod(
          v(ax + nx * bulge, y, az + nz * bulge),
          v(bx + nx * bulge, y, bz + nz * bulge),
          0.018,
          4
        )
      );
    }
  }
  const heap = new THREE3.SphereGeometry(half * 0.98, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  heap.scale(1, 0.45, 1);
  heap.translate(0, height - 0.15, 0);
  const box2 = new THREE3.BoxGeometry(half * 1.95, height - 0.15, half * 1.95);
  box2.translate(0, (height - 0.15) / 2, 0);
  return grouped([wood, [heap, box2]]);
}
function createHayBaleGeometry() {
  const bale = new THREE3.BoxGeometry(1, 0.48, 0.5, 6, 3, 3);
  const pos = bale.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const bulge = 1 + 0.04 * (1 - (y / 0.24) ** 2);
    const shag = Math.sin(x * 31 + y * 17 + z * 23) * 8e-3;
    pos.setXYZ(i, x * (1 + shag), y + shag, z * bulge);
  }
  bale.computeVertexNormals();
  bale.translate(0, 0.24, 0);
  const uv = bale.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
  const twine = [];
  for (const x of [-0.25, 0.25]) {
    const band = new THREE3.TorusGeometry(0.3, 8e-3, 3, 16).rotateY(Math.PI / 2);
    band.scale(1, 0.85, 0.89);
    band.translate(x, 0.24, 0);
    twine.push(band);
  }
  return grouped([[bale], twine]);
}
var TILLED_SIZE = 2;
function createTilledSoilGeometry() {
  const geometry = new THREE3.PlaneGeometry(TILLED_SIZE + 0.02, TILLED_SIZE + 0.02, 24, 40);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const ridge = Math.pow(Math.max(0, Math.cos(z / TILLED_SIZE * Math.PI * 2 * 5)), 1.4);
    const clod = Math.sin(x * 13 + z * 7) * 8e-3 + Math.sin(x * 29 - z * 17) * 5e-3;
    pos.setY(i, 0.02 + ridge * 0.13 + clod);
  }
  geometry.computeVertexNormals();
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * TILLED_SIZE, uv.getY(i) * TILLED_SIZE);
  return geometry;
}
function createLecternGeometry() {
  const wood = [];
  for (const [x, z] of [
    [0.32, 0],
    [0, 0.32]
  ]) {
    const foot = new THREE3.BoxGeometry(x ? 0.7 : 0.08, 0.07, z ? 0.7 : 0.08);
    foot.translate(0, 0.035, 0);
    wood.push(foot);
  }
  const post = new THREE3.BoxGeometry(0.1, 1, 0.1);
  post.translate(0, 0.55, 0);
  wood.push(post);
  const desk = new THREE3.BoxGeometry(0.6, 0.04, 0.44);
  desk.rotateX(0.45);
  desk.translate(0, 1.1, 0);
  const lip = new THREE3.BoxGeometry(0.6, 0.06, 0.03);
  lip.translate(0, 1.02, 0.21);
  wood.push(desk, lip);
  const pages = [];
  const binding = [];
  for (const side of [-1, 1]) {
    const page = new THREE3.BoxGeometry(0.2, 0.025, 0.28);
    page.rotateZ(side * -0.08);
    page.translate(side * 0.105, 0.03, 0);
    page.rotateX(0.45);
    page.translate(0, 1.13, 0);
    pages.push(page);
  }
  const cover = new THREE3.BoxGeometry(0.46, 0.012, 0.31);
  cover.rotateX(0.45);
  cover.translate(0, 1.122, 0);
  binding.push(cover);
  return grouped([wood, pages, binding]);
}
function createBannerPoleGeometry() {
  const wood = [];
  const post = new THREE3.CylinderGeometry(0.07, 0.09, 4.6, 7);
  post.translate(0, 2.3, 0);
  wood.push(post);
  wood.push(rod(v(-0.5, 4.25, 0.06), v(0.5, 4.25, 0.06), 0.03, 5));
  const finial = new THREE3.ConeGeometry(0.09, 0.22, 6);
  finial.translate(0, 4.71, 0);
  wood.push(finial);
  const shape = new THREE3.Shape([
    new THREE3.Vector2(-0.45, 0),
    new THREE3.Vector2(0.45, 0),
    new THREE3.Vector2(0.45, -1.9),
    new THREE3.Vector2(0, -1.55),
    new THREE3.Vector2(-0.45, -1.9)
  ]);
  const cloth = new THREE3.ShapeGeometry(shape, 1);
  const pos = cloth.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, 0.09 + 0.04 * Math.sin(-y / 1.9 * Math.PI) * Math.cos(x * 2));
  }
  cloth.computeVertexNormals();
  cloth.translate(0, 4.23, 0);
  return grouped([wood, [cloth]]);
}
function createNoticeBoardGeometry() {
  const wood = [];
  for (const x of [-0.62, 0.62]) {
    const post = new THREE3.BoxGeometry(0.1, 2.1, 0.1);
    post.translate(x, 1.05, 0);
    wood.push(post);
  }
  const board = new THREE3.BoxGeometry(1.2, 0.85, 0.05);
  board.translate(0, 1.45, 0.02);
  wood.push(board);
  for (const side of [-1, 1]) {
    const roof = new THREE3.BoxGeometry(0.78, 0.03, 0.4);
    roof.rotateZ(side * -0.45);
    roof.translate(side * 0.34, 2.07, 0.03);
    wood.push(roof);
  }
  const paper = [];
  const notes = [
    [-0.3, 1.55, 0.3, 0.38, 0.05],
    [0.12, 1.6, 0.26, 0.3, -0.08],
    [0.38, 1.36, 0.24, 0.32, 0.1],
    [-0.08, 1.24, 0.28, 0.22, -0.03]
  ];
  for (const [x, y, w, h, tilt] of notes) {
    const note = new THREE3.PlaneGeometry(w, h);
    note.rotateZ(tilt);
    note.translate(x, y, 0.05);
    paper.push(note);
  }
  return grouped([wood, paper]);
}
function createBellPostGeometry() {
  const wood = [];
  for (const side of [-1, 1]) {
    wood.push(rod(v(side * 0.7, 0, 0), v(side * 0.55, 2.6, 0), 0.07, 6));
    wood.push(rod(v(side * 0.7, 0, 0.35), v(side * 0.58, 2.2, 0), 0.04, 5));
    wood.push(rod(v(side * 0.7, 0, -0.35), v(side * 0.58, 2.2, 0), 0.04, 5));
  }
  wood.push(rod(v(-0.7, 2.55, 0), v(0.7, 2.55, 0), 0.07, 6));
  for (const side of [-1, 1]) {
    const roof = new THREE3.BoxGeometry(1.7, 0.04, 0.5);
    roof.rotateX(side * 0.6);
    roof.translate(0, 2.82, side * 0.2);
    wood.push(roof);
  }
  const bronze = [];
  const bell = new THREE3.LatheGeometry(
    [
      new THREE3.Vector2(1e-3, 0.36),
      new THREE3.Vector2(0.11, 0.35),
      new THREE3.Vector2(0.15, 0.25),
      new THREE3.Vector2(0.17, 0.1),
      new THREE3.Vector2(0.24, 0),
      new THREE3.Vector2(0.22, -0.02)
    ],
    14
  );
  bell.translate(0, 2.08, 0);
  bronze.push(bell);
  const rope = [rod(v(0.02, 2.1, 0), v(0.25, 0.9, 0.05), 0.012, 4)];
  return grouped([wood, bronze, rope]);
}
function createScarecrowGeometry() {
  const wood = [
    rod(v(0, 0, 0), v(0, 1.75, 0), 0.035, 5),
    rod(v(-0.65, 1.35, 0), v(0.65, 1.38, 0), 0.025, 5)
  ];
  const cloth = [];
  const body = new THREE3.CylinderGeometry(0.2, 0.28, 0.75, 7);
  body.translate(0, 1.05, 0);
  cloth.push(body);
  for (const side of [-1, 1]) {
    cloth.push(rod(v(side * 0.15, 1.36, 0), v(side * 0.55, 1.33, 0), 0.07, 6));
  }
  const head = new THREE3.SphereGeometry(0.15, 8, 6);
  head.scale(1, 1.15, 0.95);
  head.translate(0, 1.66, 0);
  cloth.push(head);
  const straw = [];
  const brim = new THREE3.CylinderGeometry(0.3, 0.32, 0.03, 10);
  brim.translate(0, 1.8, 0);
  const crown = new THREE3.ConeGeometry(0.16, 0.22, 9);
  crown.translate(0, 1.92, 0);
  straw.push(brim, crown);
  for (const side of [-1, 1]) {
    const tuft = new THREE3.ConeGeometry(0.06, 0.18, 5);
    tuft.rotateZ(side * Math.PI * 0.5);
    tuft.translate(side * 0.66, 1.33, 0);
    straw.push(tuft);
  }
  return grouped([wood, cloth, straw]);
}
var WATTLE_LENGTH = 2;
function createWattlePanelGeometry() {
  const parts = [];
  const half = WATTLE_LENGTH / 2;
  const stakes = [-half, -half / 2, 0, half / 2];
  for (const x of stakes) parts.push(rod(v(x, 0, 0), v(x, 1, 0), 0.025, 5));
  for (let row = 0; row < 9; row++) {
    const y = 0.12 + row * 0.095;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const x = -half + i / 8 * WATTLE_LENGTH;
      const weave = (i + row) % 2 === 0 ? 0.03 : -0.03;
      pts.push(v(x, y + Math.sin(i * 1.7 + row) * 8e-3, weave));
    }
    for (let i = 0; i < pts.length - 1; i++) parts.push(rod(pts[i], pts[i + 1], 0.017, 4));
  }
  return mergeParts(parts);
}
var RAISED_BED_LENGTH = 2;
var RAISED_BED_DEPTH = 1;
function createRaisedBedGeometry() {
  const hx = RAISED_BED_LENGTH / 2;
  const hz = RAISED_BED_DEPTH / 2;
  const wood = [];
  for (const sz of [-1, 1]) wood.push(rod(v(-hx, 0.1, sz * hz), v(hx, 0.1, sz * hz), 0.1, 6));
  for (const sx of [-1, 1])
    wood.push(rod(v(sx * hx, 0.1, -hz + 0.08), v(sx * hx, 0.1, hz - 0.08), 0.09, 6));
  const soil = new THREE3.PlaneGeometry(RAISED_BED_LENGTH - 0.1, RAISED_BED_DEPTH - 0.12, 12, 6);
  soil.rotateX(-Math.PI / 2);
  const sp = soil.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const z = sp.getZ(i);
    const mound = 1 - (z / hz) ** 2 * 0.5;
    sp.setY(i, 0.13 + mound * 0.07 + Math.sin(x * 17 + z * 11) * 6e-3);
  }
  soil.computeVertexNormals();
  const leaves = [];
  for (const z of [-0.26, 0, 0.26]) {
    for (let x = -hx + 0.22; x < hx - 0.1; x += 0.27) {
      const jitter4 = Math.sin(x * 13 + z * 7);
      const plant = new THREE3.ConeGeometry(0.07 + jitter4 * 0.015, 0.14 + jitter4 * 0.03, 5);
      plant.translate(x + jitter4 * 0.03, 0.26, z);
      leaves.push(plant);
    }
  }
  return grouped([wood, [soil], leaves]);
}
function createGraveCrossGeometry() {
  const wood = [];
  const upright = new THREE3.BoxGeometry(0.08, 1, 0.06);
  upright.translate(0, 0.5, -0.75);
  const bar = new THREE3.BoxGeometry(0.5, 0.07, 0.06);
  bar.translate(0, 0.72, -0.75);
  wood.push(upright, bar);
  const mound = new THREE3.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  mound.scale(0.75, 0.22, 1.6);
  return grouped([wood, [mound]]);
}
function createStandingStoneGeometry() {
  const stone = createStoneGeometry(0.55, 1.5, 0.32);
  const pos = stone.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + 0.75) / 1.5;
    pos.setX(i, pos.getX(i) * (1 - 0.25 * t) + 0.05 * t);
    pos.setZ(i, pos.getZ(i) * (1 - 0.15 * t));
  }
  stone.computeVertexNormals();
  stone.translate(0, 0.7, 0);
  return stone;
}
var FLAGSTONE_SIZE = 2;
function createFlagstonesGeometry() {
  const parts = [];
  const n = 4;
  const cell = FLAGSTONE_SIZE / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const w = cell * (0.86 + 0.08 * Math.sin(i * 3.1 + j * 1.7));
      const d = cell * (0.86 + 0.08 * Math.cos(i * 1.3 + j * 2.9));
      const s = createStoneGeometry(w, 0.06, d);
      s.rotateY(Math.sin(i * 5 + j * 7) * 0.08);
      s.translate(
        -FLAGSTONE_SIZE / 2 + cell * (i + 0.5),
        0.03,
        -FLAGSTONE_SIZE / 2 + cell * (j + 0.5)
      );
      parts.push(s);
    }
  }
  return mergeParts(parts);
}
function createYewTreeGeometry() {
  const bark = [
    rod(v(0, 0, 0), v(0.1, 1.6, 0.05), 0.32, 9),
    rod(v(0.05, 1.3, 0), v(0.7, 2.6, 0.2), 0.14, 7),
    rod(v(0.05, 1.3, 0), v(-0.6, 2.5, -0.3), 0.14, 7)
  ];
  const foliage = [];
  const lobes = [
    [0, 3, 0, 1.6],
    [0.9, 2.6, 0.4, 1.15],
    [-0.9, 2.5, -0.3, 1.2],
    [0.2, 2.4, -1, 1.1],
    [-0.3, 2.5, 1, 1.1],
    [0.1, 4, 0.1, 1.05]
  ];
  for (const [x, y, z, r] of lobes) {
    const lobe = new THREE3.IcosahedronGeometry(r, 1);
    const p = lobe.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + 0.12 * Math.sin(p.getX(i) * 5 + p.getY(i) * 3 + p.getZ(i) * 4);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k);
    }
    lobe.translate(x, y, z);
    foliage.push(lobe);
  }
  return grouped([bark, foliage]);
}
function createCrestBoardGeometry() {
  const shield = (scale) => new THREE3.Shape(
    [
      [-0.42, 1.05],
      [0.42, 1.05],
      [0.42, 0.55],
      [0.3, 0.28],
      [0, 0.05],
      [-0.3, 0.28],
      [-0.42, 0.55]
    ].map(([x, y]) => new THREE3.Vector2(x * scale, 0.55 + (y - 0.55) * scale))
  );
  const back = new THREE3.ExtrudeGeometry(shield(1.08), { depth: 0.04, bevelEnabled: false });
  const face = new THREE3.ExtrudeGeometry(shield(1), { depth: 0.02, bevelEnabled: false });
  face.translate(0, 0, 0.04);
  const charge = [];
  const upright = new THREE3.BoxGeometry(0.1, 0.78, 0.015);
  upright.translate(0, 0.6, 0.065);
  const bar = new THREE3.BoxGeometry(0.62, 0.1, 0.015);
  bar.translate(0, 0.72, 0.065);
  charge.push(upright, bar);
  return grouped([[back], [face], charge]);
}
function createFlagstaffGeometry() {
  const wood = [rod(v(0, 0, 0), v(0, 2.4, 0), 0.035, 6)];
  const knob = new THREE3.SphereGeometry(0.06, 8, 6);
  knob.translate(0, 2.44, 0);
  wood.push(knob);
  const pennant = triangle(
    [
      [0, 0],
      [1.1, -0.18],
      [0, -0.4]
    ],
    0.01
  );
  const p = pennant.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + Math.sin(p.getX(i) * 4) * 0.06);
  pennant.computeVertexNormals();
  pennant.translate(0.04, 2.35, 0);
  return grouped([wood, [pennant]]);
}
var PLINTH_SIZE = 2;
var PLINTH_HEIGHT = 0.45;
function createStonePlinthGeometry() {
  const parts = [];
  const n = 5;
  const cell = PLINTH_SIZE / n;
  const course = PLINTH_HEIGHT / 2;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const w = cell * (0.97 + 0.05 * Math.sin(i * 2.3 + j * 1.1 + row));
        const s = createStoneGeometry(w, course * 0.98, cell * 0.97);
        s.translate(
          -PLINTH_SIZE / 2 + cell * (i + 0.5) + (row ? 0.04 : -0.04),
          course * (row + 0.5),
          -PLINTH_SIZE / 2 + cell * (j + 0.5)
        );
        parts.push(s);
      }
    }
  }
  const top = new THREE3.BoxGeometry(PLINTH_SIZE, 0.04, PLINTH_SIZE);
  top.translate(0, PLINTH_HEIGHT - 0.02, 0);
  parts.push(top);
  return mergeParts(parts);
}
function createStoneStepsGeometry() {
  const parts = [];
  const rise = PLINTH_HEIGHT / 3;
  const run = 0.35;
  for (let k = 0; k < 3; k++) {
    const depth = run * (3 - k);
    for (let i = 0; i < 3; i++) {
      const s = createStoneGeometry(0.58, rise * (k + 1) * 0.99, depth * 0.98);
      s.translate(-0.6 + i * 0.6, rise * (k + 1) / 2, depth / 2);
      parts.push(s);
    }
  }
  return mergeParts(parts);
}
function createLanternGeometry() {
  const iron = [];
  iron.push(rod(v(0, 0, -0.02), v(0, 0, 0.32), 0.012, 4));
  iron.push(rod(v(0, -0.12, -0.02), v(0, 0, 0.2), 8e-3, 4));
  const hook = rod(v(0, 0, 0.3), v(0, -0.08, 0.3), 8e-3, 4);
  iron.push(hook);
  const cap = new THREE3.ConeGeometry(0.1, 0.1, 4).rotateY(Math.PI / 4);
  cap.translate(0, -0.12, 0.3);
  iron.push(cap);
  for (const [x, z] of [
    [-0.06, -0.06],
    [0.06, -0.06],
    [-0.06, 0.06],
    [0.06, 0.06]
  ])
    iron.push(rod(v(x, -0.36, 0.3 + z), v(x, -0.17, 0.3 + z), 8e-3, 3));
  const base = new THREE3.BoxGeometry(0.16, 0.025, 0.16);
  base.translate(0, -0.37, 0.3);
  iron.push(base);
  const glow = new THREE3.BoxGeometry(0.11, 0.17, 0.11);
  glow.translate(0, -0.27, 0.3);
  return grouped([iron, [glow]]);
}

// vendor/city-builder/src/editor/pieces/timberFrame.ts
import * as THREE4 from "three";
var TIMBER_WALL_HEIGHT = 2.2;
var TIMBER_DEPTH = 0.24;
var DAUB_DEPTH = 0.15;
var POST = 0.18;
var RAIL = 0.14;
function jitter(seed, scale) {
  const s = Math.sin(seed * 91.17 + 12.3) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 2 * scale;
}
function member(x0, y0, x1, y1, thick, seed, depth = TIMBER_DEPTH) {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const g = grainUVs(
    new THREE4.BoxGeometry(length, thick + jitter(seed, 0.012), depth + jitter(seed + 1, 0.01)),
    1.3,
    0.45
  );
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + seed * 0.37);
  g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, jitter(seed + 2, 6e-3));
  return g.toNonIndexed();
}
function daubRect(x0, y0, x1, y1) {
  if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return null;
  const g = new THREE4.BoxGeometry(x1 - x0, y1 - y0, DAUB_DEPTH);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
  return g.toNonIndexed();
}
function timberWallParts(width, opening, kind, variant = 0) {
  const h = TIMBER_WALL_HEIGHT;
  const bottom = -h / 2;
  const top = h / 2;
  const half = width / 2;
  const timber = [];
  let seed = variant * 17 + 3;
  const add = (x0, y0, x1, y1, thick) => timber.push(member(x0, y0, x1, y1, thick, seed++));
  for (const side of [-1, 1])
    add(side * (half - POST / 2), bottom, side * (half - POST / 2), top, POST);
  add(-half, top - POST / 2, half, top - POST / 2, POST);
  const inner0 = -half + POST;
  const inner1 = half - POST;
  const daubs = [];
  if (!opening) {
    add(-half, bottom + POST / 2, half, bottom + POST / 2, POST);
    const railY = 0.05 + jitter(variant, 0.05);
    add(inner0, railY, inner1, railY, RAIL);
    const s = variant % 2 === 0 ? 1 : -1;
    add(s * inner0, bottom + POST, -s * 0.15, railY - RAIL / 2, RAIL * 0.9);
    const studX = jitter(variant + 5, 0.25);
    add(studX, railY + RAIL / 2, studX, top - POST, RAIL);
    daubs.push(daubRect(inner0, bottom + POST, inner1, top - POST));
    return {
      timber,
      daub: daubs.filter((d) => !!d),
      trim: [],
      iron: []
    };
  }
  const ow = opening.width / 2;
  const oy0 = bottom + opening.sill;
  const oy1 = oy0 + opening.height;
  const stud = RAIL;
  if (kind === "door") {
    for (const side of [-1, 1])
      add(side * half, bottom + POST / 2, side * (ow + stud), bottom + POST / 2, POST);
  } else {
    add(-half, bottom + POST / 2, half, bottom + POST / 2, POST);
  }
  for (const side of [-1, 1])
    add(
      side * (ow + stud / 2),
      bottom + (kind === "door" ? 0 : POST),
      side * (ow + stud / 2),
      top - POST,
      stud
    );
  add(-ow - stud, oy1 + RAIL / 2, ow + stud, oy1 + RAIL / 2, RAIL);
  if (kind === "window") add(-ow - stud, oy0 - RAIL / 2, ow + stud, oy0 - RAIL / 2, RAIL);
  for (const side of [-1, 1]) {
    const x0 = side * (half - POST);
    const x1 = side * (ow + stud);
    if (Math.abs(x1 - x0) > 0.2)
      add(x0, bottom + POST + 0.05, x1, bottom + POST + 0.05 + Math.abs(x1 - x0) * 0.9, RAIL * 0.8);
  }
  daubs.push(
    daubRect(inner0, bottom + POST, -ow - stud, top - POST),
    daubRect(ow + stud, bottom + POST, inner1, top - POST),
    daubRect(-ow - stud, oy1 + RAIL, ow + stud, top - POST)
  );
  if (kind === "window") daubs.push(daubRect(-ow - stud, bottom + POST, ow + stud, oy0 - RAIL));
  const fill = createOpeningFillGeometry(h, opening, kind, variant);
  fill.wood.translate(0, 0, kind === "window" ? 0.02 : 0.02);
  fill.dark.translate(0, 0, 0.02);
  return {
    timber,
    daub: daubs.filter((d) => !!d),
    trim: [fill.wood],
    iron: [fill.dark]
  };
}
function createTimberWallGeometry(width, opening, kind, variant = 0) {
  const p = timberWallParts(width, opening, kind, variant);
  return opening ? grouped([p.timber, p.daub, p.trim, p.iron]) : grouped([p.timber, p.daub]);
}
function timberWallCostGeometry(width, opening, kind) {
  return mergeParts(timberWallParts(width, opening, kind, 0).timber);
}
var TIMBER_GABLE_EAVE = 0.22;
function timberGableParts(width, pitchDeg = 30, variant = 0) {
  const half = width / 2;
  const tan = Math.tan(pitchDeg * Math.PI / 180);
  const eave = TIMBER_GABLE_EAVE;
  const apex = eave + half * tan;
  const shape = new THREE4.Shape([
    new THREE4.Vector2(-half, 0),
    new THREE4.Vector2(half, 0),
    new THREE4.Vector2(half, eave),
    new THREE4.Vector2(0, apex),
    new THREE4.Vector2(-half, eave)
  ]);
  const daub = new THREE4.ExtrudeGeometry(shape, { depth: DAUB_DEPTH, bevelEnabled: false });
  daub.translate(0, 0, -DAUB_DEPTH / 2);
  const timber = [];
  let seed = variant * 13 + 7;
  const add = (x0, y0, x1, y1, thick) => timber.push(member(x0, y0, x1, y1, thick, seed++));
  add(0, 0, 0, apex - 0.08, RAIL);
  const collarY = apex * 0.5;
  const collarHalf = half - Math.max(0, collarY - eave) / tan - 0.05;
  add(-collarHalf, collarY, collarHalf, collarY, RAIL);
  for (const side of [-1, 1]) add(side * half, eave - 0.06, 0, apex - 0.06, RAIL);
  for (const side of [-1, 1]) {
    const x = side * collarHalf * 0.55;
    add(x, collarY, side * collarHalf * 0.35, collarY + (apex - collarY) * 0.6, RAIL * 0.8);
  }
  return { timber, daub: [daub.toNonIndexed()] };
}
function timberGableHeight(width, pitchDeg = 30) {
  return TIMBER_GABLE_EAVE + width / 2 * Math.tan(pitchDeg * Math.PI / 180);
}
var SHINGLE_COURSE = 0.3;
function createShingleGeometry(length, width, variant) {
  const phase = variant * 0.37;
  const g = createRidgedPanelGeometry(
    length,
    width,
    0.07,
    0.035,
    (u, v5) => {
      const course = v5 * length / SHINGLE_COURSE + phase;
      const f = course - Math.floor(course);
      return f * 1.4 - 0.7 + Math.sin(u * 53 + Math.floor(course) * 2.3) * 0.15;
    },
    Math.round(14 * width),
    Math.round(length / SHINGLE_COURSE) * 4
  );
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getZ(i) + width / 2) / 0.9, (length / 2 - pos.getX(i)) / 0.9 + phase);
  }
  return g;
}
var STONE_SILL_HEIGHT = 0.3;
var SILL_DEPTH = 0.34;
function createStoneSillGeometry(length) {
  const parts = [];
  const n = Math.max(2, Math.round(length / 0.42));
  const cell = length / n;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < n; i++) {
      const w = cell * (0.96 + 0.06 * Math.sin(i * 1.9 + row));
      const s = createStoneGeometry(
        w,
        STONE_SILL_HEIGHT / 2 * 0.98,
        SILL_DEPTH * (0.94 + 0.05 * Math.sin(i * 3.1))
      );
      s.translate(
        -length / 2 + cell * (i + 0.5) + (row ? 0.05 : -0.05),
        STONE_SILL_HEIGHT / 2 * (row + 0.5),
        0
      );
      parts.push(s);
    }
  }
  return mergeParts(parts);
}
function doorHoodParts(width = 1.5, reach = 0.7) {
  const timber = [];
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.12);
    const post = grainUVs(new THREE4.BoxGeometry(0.1, 0.55, 0.1));
    post.translate(x, -0.35, 0.05);
    timber.push(post.toNonIndexed());
    const strut = grainUVs(new THREE4.BoxGeometry(0.08, 0.08, Math.hypot(reach, 0.45)));
    strut.rotateX(Math.atan2(0.45, reach));
    strut.translate(x, -0.37, reach / 2);
    timber.push(strut.toNonIndexed());
  }
  const beam2 = grainUVs(new THREE4.BoxGeometry(width, 0.1, 0.1));
  beam2.translate(0, -0.18, reach - 0.05);
  timber.push(beam2.toNonIndexed());
  const slope = Math.hypot(reach + 0.1, 0.22);
  const roof = createShingleGeometry(slope, width + 0.2, 1);
  roof.rotateY(-Math.PI / 2);
  roof.rotateX(Math.atan2(0.22, reach + 0.1));
  roof.translate(0, -0.03, (reach + 0.1) / 2);
  return { timber, shingle: [roof.toNonIndexed()] };
}

// vendor/city-builder/src/editor/pieces/RotationPresets.ts
import * as THREE5 from "three";
function fromEulerDegrees(xDeg, yDeg, zDeg) {
  const euler = new THREE5.Euler(
    THREE5.MathUtils.degToRad(xDeg),
    THREE5.MathUtils.degToRad(yDeg),
    THREE5.MathUtils.degToRad(zDeg)
  );
  return new THREE5.Quaternion().setFromEuler(euler);
}
var ROTATION_PRESETS = [
  { label: "Horizontal", quaternion: fromEulerDegrees(0, 0, 0) },
  { label: "Horizontal (90\xB0)", quaternion: fromEulerDegrees(0, 90, 0) },
  { label: "Vertical", quaternion: fromEulerDegrees(0, 0, 90) },
  { label: "Roof (+30\xB0)", quaternion: fromEulerDegrees(0, 0, 30) },
  { label: "Roof (-30\xB0)", quaternion: fromEulerDegrees(0, 0, -30) },
  { label: "Roof (+45\xB0)", quaternion: fromEulerDegrees(0, 0, 45) },
  { label: "Roof (-45\xB0)", quaternion: fromEulerDegrees(0, 0, -45) }
];
var ROTATION_INDEX = {
  Horizontal: 0,
  Horizontal90: 1,
  Vertical: 2,
  RoofPlus30: 3,
  RoofMinus30: 4,
  RoofPlus45: 5,
  RoofMinus45: 6
};

// vendor/city-builder/src/editor/pieces/craftGeometry.ts
import * as THREE6 from "three";
function grouped2(lists) {
  return grouped(lists.map((l) => l.length ? l : [meterUVs(new THREE6.BoxGeometry(0, 0, 0))]));
}
var v2 = (x, y, z) => new THREE6.Vector3(x, y, z);
var RAD = Math.PI / 180;
function orient(g, x, y, z, rot = {}) {
  if (rot.x || rot.y || rot.z)
    g.applyQuaternion(
      new THREE6.Quaternion().setFromEuler(
        new THREE6.Euler((rot.x ?? 0) * RAD, (rot.y ?? 0) * RAD, (rot.z ?? 0) * RAD, "YXZ")
      )
    );
  g.translate(x, y, z);
  return g;
}
function meterUVs(g, scale = 1) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    const [a, b] = ax >= ay && ax >= az ? [pos.getZ(i), pos.getY(i)] : ay >= az ? [pos.getX(i), pos.getZ(i)] : [pos.getX(i), pos.getY(i)];
    uv.setXY(i, a / scale, b / scale);
  }
  uv.needsUpdate = true;
  return g;
}
function box(w, h, d, x = 0, y = 0, z = 0, rot, uv = 1) {
  return orient(meterUVs(new THREE6.BoxGeometry(w, h, d), uv), x, y, z, rot);
}
function beam(w, h, d, x = 0, y = 0, z = 0, rot) {
  return orient(
    grainUVs(new THREE6.BoxGeometry(w, h, d, Math.max(1, Math.round(w * 2)))),
    x,
    y,
    z,
    rot
  );
}
function cyl(rTop, rBottom, h, x = 0, y = 0, z = 0, rot, seg = 10) {
  const g = new THREE6.CylinderGeometry(rTop, rBottom, h, seg);
  const uv = g.attributes.uv;
  const around = 2 * Math.PI * Math.max(rTop, rBottom);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around, uv.getY(i) * h);
  return orient(g, x, y, z, rot);
}
function blob(rx, ry, rz, x = 0, y = 0, z = 0, dome = false, seg = 14) {
  const g = new THREE6.SphereGeometry(
    1,
    seg,
    Math.ceil(seg / 2),
    0,
    Math.PI * 2,
    0,
    dome ? Math.PI / 2 : Math.PI
  );
  g.scale(rx, ry, rz);
  meterUVs(g, 1);
  return orient(g, x, y, z);
}
var pole = (a, b, r, seg = 6) => rod(a, b, r, seg);
function ring(inner, outer, x, y, z) {
  return orient(new THREE6.RingGeometry(inner, outer, 24), x, y, z);
}
function sheet(w, h, x, y, z, rot) {
  const s = new THREE6.Shape();
  const pts = [
    [-0.5, -0.38],
    [-0.2, -0.5],
    [0.25, -0.46],
    [0.5, -0.3],
    [0.44, 0.1],
    [0.5, 0.42],
    [0.1, 0.5],
    [-0.3, 0.46],
    [-0.48, 0.2]
  ];
  pts.forEach(([px, py], i) => i ? s.lineTo(px * w, py * h) : s.moveTo(px * w, py * h));
  const g = new THREE6.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: false });
  g.translate(0, 0, -75e-4);
  meterUVs(g, 1);
  return orient(g, x, y, z, rot);
}
function wheel(r) {
  const wood = [];
  const iron = [];
  const rim = new THREE6.TorusGeometry(r - 0.04, 0.045, 5, 20);
  rim.rotateY(Math.PI / 2);
  wood.push(rim);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    wood.push(pole(v2(0, 0, 0), v2(0, Math.sin(a) * (r - 0.06), Math.cos(a) * (r - 0.06)), 0.02, 4));
  }
  wood.push(cyl(0.09, 0.09, 0.26, 0, 0, 0, { z: 90 }, 8));
  const tyre = new THREE6.TorusGeometry(r, 0.015, 4, 24);
  tyre.rotateY(Math.PI / 2);
  iron.push(tyre);
  return [wood, iron];
}
function createLoomGeometry() {
  const oak = [];
  const warp = [];
  const web = [];
  for (const x of [-0.72, 0.72]) {
    for (const z of [-0.55, 0.55]) oak.push(beam(0.08, 1.7, 0.08, x, 0.85, z));
    oak.push(
      beam(1.2, 0.07, 0.07, x, 1.66, 0, { y: 90 }),
      beam(1.2, 0.07, 0.07, x, 0.3, 0, { y: 90 })
    );
  }
  oak.push(beam(1.52, 0.08, 0.08, 0, 1.66, -0.05));
  oak.push(cyl(0.05, 0.05, 1.5, 0, 0.88, 0.55, { z: 90 }));
  oak.push(cyl(0.06, 0.06, 1.5, 0, 0.7, -0.55, { z: 90 }));
  warp.push(cyl(0.12, 0.12, 1.25, 0, 0.7, -0.55, { z: 90 }, 12));
  for (const z of [-0.08, 0.04]) oak.push(box(1.25, 0.3, 0.025, 0, 1.12, z));
  for (const z of [-0.08, 0.04])
    oak.push(
      pole(v2(-0.5, 1.27, z), v2(-0.5, 1.62, z), 8e-3, 3),
      pole(v2(0.5, 1.27, z), v2(0.5, 1.62, z), 8e-3, 3)
    );
  oak.push(box(1.32, 0.22, 0.04, 0, 0.92, 0.3, { x: -12 }));
  const warpA = v2(0, 0.82, -0.55);
  const warpB = v2(0, 0.88, 0.25);
  const len = warpA.distanceTo(warpB);
  warp.push(
    box(1.2, 6e-3, len, 0, (warpA.y + warpB.y) / 2, (warpA.z + warpB.z) / 2, {
      x: -Math.atan2(warpB.y - warpA.y, warpB.z - warpA.z) / RAD
    })
  );
  web.push(box(1.2, 8e-3, 0.32, 0, 0.9, 0.4));
  web.push(cyl(0.1, 0.1, 1.2, 0, 0.5, 0.48, { z: 90 }, 12));
  for (const x of [-0.72, 0.72]) oak.push(beam(0.05, 0.05, 0.4, x, 0.5, 0.48));
  for (const x of [-0.24, -0.08, 0.08, 0.24])
    oak.push(beam(0.07, 0.03, 0.9, x, 0.08, 0.1, { x: 6 }));
  oak.push(beam(1, 0.05, 0.3, 0, 0.55, 0.95));
  for (const x of [-0.42, 0.42]) oak.push(beam(0.06, 0.53, 0.26, x, 0.265, 0.95));
  return grouped2([oak, warp, web]);
}
function createClothBoltsGeometry() {
  const bolt = (x, y, z) => cyl(0.13, 0.13, 0.9, x, y, z, { z: 90 }, 12);
  return grouped2([
    [beam(1, 0.05, 0.5, 0, 0.025, 0)],
    [bolt(0, 0.18, -0.13)],
    [bolt(0, 0.18, 0.13)],
    [bolt(0.02, 0.4, 0)]
  ]);
}
function createTanningPitGeometry() {
  const oak = [];
  for (const z of [-0.52, 0.52]) oak.push(beam(1.5, 0.12, 0.1, 0, 0.06, z));
  for (const x of [-0.72, 0.72]) oak.push(beam(0.1, 0.12, 0.95, x, 0.06, 0));
  oak.push(pole(v2(-0.3, 0.02, 0.1), v2(0.55, 1.15, -0.75), 0.025));
  const liquor = [box(1.36, 0.02, 0.94, 0, 0.04, 0)];
  const hide = [
    box(0.7, 0.02, 0.35, 0.2, 0.135, 0.5, { x: 4 }),
    box(0.7, 0.3, 0.02, 0.2, 0, 0.66, { x: -8 })
  ];
  return grouped2([oak, liquor, hide]);
}
function createHideFrameGeometry() {
  const bark = [];
  const cord = [];
  for (const x of [-0.8, 0.8]) bark.push(pole(v2(x, -0.1, 0), v2(x, 1.95, 0), 0.05));
  for (const y of [0.3, 1.8]) bark.push(pole(v2(-0.88, y, 0), v2(0.88, y, 0), 0.035));
  const hide = [sheet(1.2, 1.25, 0, 1.05, 0)];
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    cord.push(pole(v2(-0.8, 0.45 + t * 1.2, 0), v2(-0.56, 0.5 + t * 1.1, 0), 6e-3, 3));
    cord.push(pole(v2(0.8, 0.45 + t * 1.2, 0), v2(0.56, 0.5 + t * 1.1, 0), 6e-3, 3));
  }
  for (const x of [-0.3, 0.3]) {
    cord.push(pole(v2(x, 1.8, 0), v2(x, 1.66, 0), 6e-3, 3));
    cord.push(pole(v2(x, 0.3, 0), v2(x, 0.44, 0), 6e-3, 3));
  }
  return grouped2([bark, hide, cord]);
}
function createScrapingBeamGeometry() {
  const bark = [
    pole(v2(0, 0.08, -0.75), v2(0, 0.95, 0.45), 0.13, 10),
    pole(v2(-0.25, 0, 0.45), v2(0, 0.88, 0.45), 0.035),
    pole(v2(0.25, 0, 0.45), v2(0, 0.88, 0.45), 0.035)
  ];
  const hide = [
    box(0.55, 0.02, 0.7, 0, 0.9, 0.12, { x: -36 }),
    box(0.55, 0.45, 0.02, 0, 0.78, 0.55, { x: 10 })
  ];
  return grouped2([bark, hide]);
}
function shoes(x, y, z, boots = false, yaw = 0) {
  const out = [];
  for (const side of [-0.06, 0.06]) {
    const s = blob(0.05, 0.045, 0.12, 0, 0.045, 0.02);
    out.push(orient(s, x + side, y, z, { y: yaw }));
    if (boots) out.push(orient(cyl(0.045, 0.05, 0.2, 0, 0.14, -0.05), x + side, y, z, { y: yaw }));
  }
  return out;
}
function createCobblerBenchGeometry() {
  const oak = [beam(1.2, 0.06, 0.42, 0, 0.42, 0)];
  for (const x of [-0.52, 0.52])
    for (const z of [-0.15, 0.15]) oak.push(beam(0.06, 0.4, 0.06, x, 0.2, z));
  oak.push(box(0.36, 0.22, 0.4, 0.4, 0.56, 0, void 0, 0.5));
  for (const z of [-0.1, 0.05]) oak.push(blob(0.045, 0.06, 0.11, 0.4, 0.72, z));
  const leather = [...shoes(-0.15, 0.45, 0), box(0.3, 0.01, 0.24, -0.38, 0.455, 0.05, { y: 20 })];
  const iron = [
    pole(v2(0.05, 0.46, 0.1), v2(0.22, 0.46, 0.14), 6e-3, 3),
    box(0.04, 0.04, 0.1, 0.12, 0.47, -0.1),
    pole(v2(0.12, 0.46, -0.05), v2(0.12, 0.46, -0.3), 0.012, 4)
  ];
  return grouped2([oak, leather, iron]);
}
function createShopBoardGeometry() {
  const sawn = [box(1.4, 0.04, 0.5, 0, 0.85, 0.25, void 0, 0.5)];
  const oak = [];
  for (const x of [-0.6, 0.6]) {
    oak.push(beam(0.06, 0.06, 0.48, x, 0.8, 0.24));
    oak.push(pole(v2(x, 0.82, 0.45), v2(x, 0.45, 0.02), 0.025, 4));
  }
  const leather = [
    ...shoes(-0.45, 0.87, 0.28),
    ...shoes(0, 0.87, 0.28, true),
    ...shoes(0.45, 0.87, 0.28)
  ];
  return grouped2([sawn, oak, leather]);
}
function createStaveRackGeometry() {
  const bark = [];
  for (const x of [-0.75, 0.75]) {
    bark.push(pole(v2(x, 0, -0.35), v2(x, 1.55, 0), 0.03));
    bark.push(pole(v2(x, 0, 0.35), v2(x, 1.55, 0), 0.03));
  }
  bark.push(pole(v2(-0.82, 1.5, 0), v2(0.82, 1.5, 0), 0.03));
  const yew = [];
  for (let i = 0; i < 9; i++) {
    const x = -0.62 + i * 0.155;
    const side = i % 2 ? 1 : -1;
    yew.push(pole(v2(x, 0.01, side * 0.55), v2(x + 0.03, 1.72, side * 0.02), 0.018, 5));
  }
  return grouped2([bark, yew]);
}
function createTargetButtGeometry() {
  const straw = [cyl(0.55, 0.55, 0.3, 0, 1.05, 0, { x: 90 }, 18)];
  const bark = [
    pole(v2(-0.55, 0, 0.35), v2(-0.25, 1.4, 0), 0.03),
    pole(v2(0.55, 0, 0.35), v2(0.25, 1.4, 0), 0.03),
    pole(v2(0, 0, -0.75), v2(0, 1.45, -0.05), 0.03)
  ];
  const white = [ring(0.32, 0.46, 0, 1.05, 0.155), ring(0, 0.09, 0, 1.05, 0.156)];
  const red = [ring(0.09, 0.2, 0, 1.05, 0.155)];
  return grouped2([straw, bark, white, red]);
}
function createBarrelTrussGeometry() {
  const sawn = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const r0 = 0.26;
    const r1 = 0.38;
    const s = box(0.1, 0.8, 0.025, 0, 0, 0);
    s.rotateX(Math.atan2(r1 - r0, 0.8));
    s.translate(0, 0.4, (r0 + r1) / 2);
    s.rotateY(a);
    sawn.push(s);
  }
  const iron = [];
  for (const [y, r] of [
    [0.1, 0.285],
    [0.32, 0.32]
  ]) {
    const t = new THREE6.TorusGeometry(r, 0.018, 4, 24);
    t.rotateX(Math.PI / 2);
    t.translate(0, y, 0);
    iron.push(t);
  }
  return grouped2([sawn, iron]);
}
function createWheelStandGeometry() {
  const [wood, iron] = wheel(0.6);
  for (const g of [...wood, ...iron]) g.rotateZ(Math.PI / 2).translate(0, 0.5, 0);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    wood.push(pole(v2(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3), v2(0, 0.42, 0), 0.03));
  }
  wood.push(cyl(0.15, 0.15, 0.06, 0, 0.42, 0));
  return grouped2([wood, iron]);
}
function createCartFrameGeometry() {
  const fresh = [];
  const oak = [];
  for (const x of [-0.55, 0.55]) fresh.push(beam(0.09, 0.09, 2, x, 0.68, 0, { x: 3 }));
  for (const z of [-0.85, -0.3, 0.25, 0.8])
    fresh.push(beam(1.2, 0.07, 0.07, 0, 0.66 + z * 0.05, z));
  for (const z of [-0.75, -0.48, -0.21])
    fresh.push(box(1.15, 0.03, 0.25, 0, 0.71 + z * 0.05, z, void 0, 0.6));
  for (const x of [-0.45, 0.45]) fresh.push(pole(v2(x, 0.66, 0.9), v2(x * 0.8, 0.05, 2.1), 0.035));
  oak.push(beam(1.5, 0.1, 0.1, 0, 0.6, 0));
  const [w, i] = wheel(0.58);
  for (const g of [...w, ...i]) g.translate(0.8, 0.6, 0);
  oak.push(...w);
  oak.push(box(0.4, 0.55, 0.4, -0.8, 0.275, 0, void 0, 0.5));
  return grouped2([fresh, oak, i]);
}
function createForgeGeometry() {
  const stone = [
    box(1.3, 0.75, 0.9, 0, 0.375, 0, void 0, 0.8),
    box(0.5, 1.5, 0.4, 0, 1.5, -0.3, void 0, 0.8),
    box(1.32, 0.1, 0.12, 0, 0.8, 0.4, void 0, 0.8)
  ];
  const ember = [box(0.6, 0.03, 0.4, 0, 0.77, 0.05)];
  const leather = [box(0.5, 0.18, 0.35, -0.95, 0.75, 0, { z: 8 })];
  const bark = [
    cyl(0.2, 0.22, 0.5, 0.2, 0.25, 1),
    pole(v2(-0.95, 0.85, 0.15), v2(-0.95, 1.3, 0.45), 0.02)
  ];
  const iron = [
    box(0.45, 0.12, 0.16, 0.2, 0.56, 1),
    cyl(0.02, 0.07, 0.14, 0.48, 0.56, 1, { z: 90 }, 6),
    box(0.2, 0.1, 0.12, 0.2, 0.45, 1),
    pole(v2(-0.2, 0.82, 0.2), v2(0.25, 0.82, 0.55), 0.01, 3)
  ];
  return grouped2([stone, iron, ember, leather, bark]);
}
function createGrindstoneGeometry() {
  const oak = [];
  for (const z of [-0.18, 0.18]) oak.push(beam(0.9, 0.08, 0.06, 0, 0.5, z));
  for (const x of [-0.4, 0.4])
    for (const z of [-0.18, 0.18]) oak.push(beam(0.06, 0.5, 0.06, x, 0.25, z));
  oak.push(box(0.6, 0.12, 0.3, 0, 0.48, 0));
  const stone = [cyl(0.36, 0.36, 0.1, 0, 0.75, 0, { x: 90 }, 18)];
  const iron = [
    pole(v2(0, 0.75, -0.28), v2(0, 0.75, 0.3), 0.015, 4),
    pole(v2(0, 0.75, 0.3), v2(0, 0.55, 0.3), 0.012, 4),
    pole(v2(0, 0.55, 0.3), v2(0, 0.55, 0.42), 0.015, 4)
  ];
  return grouped2([oak, stone, iron]);
}
function createToolRackGeometry() {
  const oak = [box(1.4, 0.8, 0.04, 0, 1.3, 0, void 0, 0.6)];
  for (const x of [-0.65, 0.65]) oak.push(beam(0.07, 1.75, 0.07, x, 0.875, -0.04));
  const iron = [];
  iron.push(box(0.5, 0.14, 0.01, -0.35, 1.48, 0.03), box(0.12, 0.08, 0.03, -0.62, 1.48, 0.03));
  for (const x of [0.05, 0.25]) {
    oak.push(pole(v2(x, 1, 0.04), v2(x, 1.55, 0.04), 0.016, 4));
    iron.push(box(0.14, 0.09, 0.02, x + 0.05, 1.5, 0.04));
  }
  for (const x of [0.42, 0.5, 0.58]) iron.push(box(0.025, 0.25, 0.015, x, 1.15, 0.03));
  oak.push(pole(v2(-0.45, 1, 0.04), v2(-0.45, 1.3, 0.04), 0.015, 4));
  iron.push(box(0.12, 0.05, 0.05, -0.45, 1.3, 0.05));
  return grouped2([oak, iron]);
}
function createWillowTroughGeometry() {
  const sawn = [
    box(2, 0.42, 0.04, 0, 0.21, -0.25, void 0, 0.6),
    box(2, 0.42, 0.04, 0, 0.21, 0.25, void 0, 0.6),
    box(0.04, 0.42, 0.5, -0.98, 0.21, 0, void 0, 0.6),
    box(0.04, 0.42, 0.5, 0.98, 0.21, 0, void 0, 0.6)
  ];
  const water = [box(1.92, 0.02, 0.46, 0, 0.36, 0)];
  const willow = [];
  for (let i = 0; i < 14; i++) {
    const z = -0.15 + i % 5 * 0.075;
    willow.push(
      pole(v2(-0.85 + i % 3 * 0.05, 0.3, z), v2(1.25, 0.55 + i % 4 * 0.05, z * 1.4), 8e-3, 3)
    );
  }
  return grouped2([sawn, water, willow]);
}
function createWillowBundlesGeometry() {
  const willow = [];
  const cord = [];
  for (const [x, z, lean] of [
    [-0.2, 0, -6],
    [0.15, 0.08, 5],
    [0.02, -0.18, 2]
  ]) {
    willow.push(cyl(0.13, 0.1, 1.7, x, 0.85, z, { z: lean }, 10));
    for (const y of [0.4, 1.2]) {
      const t = new THREE6.TorusGeometry(0.125, 0.012, 4, 14);
      t.rotateX(Math.PI / 2);
      orient(t, x - Math.sin(lean * RAD) * (y - 0.85), y, z);
      cord.push(t);
    }
  }
  return grouped2([willow, cord]);
}
function createCauldronGeometry() {
  const iron = [];
  const profile = [
    new THREE6.Vector2(0, 0),
    new THREE6.Vector2(0.18, 0.02),
    new THREE6.Vector2(0.28, 0.12),
    new THREE6.Vector2(0.3, 0.28),
    new THREE6.Vector2(0.27, 0.42),
    new THREE6.Vector2(0.29, 0.44)
  ];
  const pot = new THREE6.LatheGeometry(profile, 16);
  pot.translate(0, 0.32, 0);
  iron.push(pot);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + 0.4;
    iron.push(pole(v2(Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75), v2(0, 1.45, 0), 0.02, 4));
  }
  iron.push(pole(v2(0, 1.45, 0), v2(0, 0.76, 0), 8e-3, 3));
  const contents = [cyl(0.27, 0.27, 0.02, 0, 0.7, 0, void 0, 16)];
  return grouped2([iron, contents]);
}
function createSoapRackGeometry() {
  const oak = [];
  const soap = [];
  for (const x of [-0.58, 0.58])
    for (const z of [-0.17, 0.17]) oak.push(beam(0.05, 1.2, 0.05, x, 0.6, z));
  for (const y of [0.3, 0.65, 1]) {
    for (const z of [-0.12, 0, 0.12]) oak.push(beam(1.2, 0.02, 0.06, 0, y, z));
    for (let i = 0; i < 8; i++)
      soap.push(box(0.1, 0.05, 0.07, -0.49 + i * 0.14, y + 0.035, i * 7 % 3 * 0.1 - 0.1));
  }
  return grouped2([oak, soap]);
}
function createCheesePressGeometry() {
  const oak = [beam(0.8, 0.12, 0.5, 0, 0.12, 0)];
  for (const x of [-0.32, 0.32]) oak.push(beam(0.09, 1.25, 0.09, x, 0.7, 0));
  oak.push(beam(0.85, 0.12, 0.12, 0, 1.3, 0), cyl(0.2, 0.2, 0.05, 0, 0.6, 0, void 0, 14));
  oak.push(cyl(0.23, 0.23, 0.2, 0, 0.32, 0, void 0, 14));
  const cheese = [cyl(0.2, 0.2, 0.15, 0, 0.5, 0, void 0, 14)];
  const iron = [
    cyl(0.03, 0.03, 0.7, 0, 0.95, 0, void 0, 6),
    pole(v2(-0.25, 1.42, 0), v2(0.25, 1.42, 0), 0.015, 4)
  ];
  return grouped2([oak, cheese, iron]);
}
function createCheeseShelfGeometry() {
  const oak = [];
  const cheese = [];
  for (const x of [-0.68, 0.68])
    for (const z of [-0.2, 0.2]) oak.push(beam(0.05, 1.6, 0.05, x, 0.8, z));
  for (const y of [0.25, 0.7, 1.15]) {
    oak.push(box(1.4, 0.03, 0.45, 0, y, 0, void 0, 0.5));
    for (let i = 0; i < 4; i++)
      cheese.push(
        cyl(0.14, 0.14, 0.11, -0.48 + i * 0.32, y + 0.07, i % 2 * 0.04 - 0.02, void 0, 12)
      );
  }
  return grouped2([oak, cheese]);
}
function createMilkChurnGeometry() {
  const sawn = [
    cyl(0.15, 0.2, 0.8, 0, 0.4, 0, void 0, 12),
    cyl(0.12, 0.12, 0.03, 0, 0.82, 0, void 0, 12),
    pole(v2(0, 0.8, 0), v2(0.02, 1.3, 0), 0.016, 5)
  ];
  const iron = [];
  for (const [y, r] of [
    [0.12, 0.19],
    [0.65, 0.16]
  ]) {
    const t = new THREE6.TorusGeometry(r + 4e-3, 0.01, 4, 16);
    t.rotateX(Math.PI / 2);
    t.translate(0, y, 0);
    iron.push(t);
  }
  return grouped2([sawn, iron]);
}
function createBreadOvenGeometry() {
  const stone = [box(1.7, 0.8, 1.7, 0, 0.4, 0, void 0, 0.8)];
  const clay = [
    blob(0.78, 0.7, 0.78, 0, 0.8, -0.02, true, 18),
    cyl(0.1, 0.13, 0.55, 0, 1.68, 0.45, void 0, 10)
  ];
  const dark = [box(0.42, 0.34, 0.06, 0, 0.98, 0.74), box(0.2, 0.01, 0.2, 0, 1.96, 0.45)];
  const oak = [
    pole(v2(0.55, 0, 1), v2(0.6, 1.55, 0.78), 0.02, 4),
    box(0.28, 0.02, 0.32, 0.56, 1.62, 0.76, { x: 70 })
  ];
  return grouped2([stone, clay, dark, oak]);
}
function skep(x, y, z) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const r = 0.22 * Math.sqrt(1 - t * t * 0.92) + 8e-3 * Math.sin(t * 40);
    pts.push(new THREE6.Vector2(Math.max(5e-3, r), t * 0.4));
  }
  const s = new THREE6.LatheGeometry(pts, 14);
  s.translate(x, y, z);
  return { straw: s, dark: box(0.06, 0.04, 0.02, x, y + 0.02, z + 0.215) };
}
function createSkepBenchGeometry() {
  const oak = [beam(1.8, 0.06, 0.45, 0, 0.52, 0)];
  for (const x of [-0.75, 0, 0.75]) oak.push(beam(0.12, 0.5, 0.3, x, 0.25, 0));
  const straw = [];
  const dark = [];
  for (const x of [-0.55, 0, 0.55]) {
    const s = skep(x, 0.55, 0);
    straw.push(s.straw);
    dark.push(s.dark);
  }
  return grouped2([oak, straw, dark]);
}
function createHenHouseGeometry() {
  const sawn = [box(1.4, 0.85, 1, 0, 1, 0, void 0, 0.6)];
  const tri = new THREE6.Shape();
  tri.moveTo(-0.5, 0);
  tri.lineTo(0.5, 0);
  tri.lineTo(0, 0.24);
  tri.lineTo(-0.5, 0);
  const gables = new THREE6.ExtrudeGeometry(tri, { depth: 1.4, bevelEnabled: false });
  gables.translate(0, 0, -0.7);
  gables.rotateY(Math.PI / 2);
  gables.translate(0, 1.425, 0);
  meterUVs(gables, 0.6);
  sawn.push(gables);
  const oak = [];
  for (const x of [-0.62, 0.62])
    for (const z of [-0.42, 0.42]) oak.push(beam(0.08, 0.6, 0.08, x, 0.3, z));
  const rampLen = Math.hypot(0.62, 0.95);
  const pitch = Math.atan2(0.62, 0.95) / RAD;
  oak.push(box(0.3, 0.025, rampLen, 0.35, 0.3, 0.98, { x: pitch }, 0.5));
  for (let i = 1; i < 5; i++)
    oak.push(box(0.3, 0.02, 0.025, 0.35, 0.62 - i / 5 * 0.62 + 0.03, 0.5 + i / 5 * 0.95));
  const shingle = [];
  const rise = Math.atan2(0.24, 0.5);
  for (const side of [-1, 1]) {
    const g = box(1.6, 0.04, 0.68, 0, 0, 0);
    g.rotateX(side * rise);
    g.translate(0, 1.55, side * 0.3);
    shingle.push(g);
  }
  const dark = [box(0.22, 0.26, 0.02, 0.35, 0.72, 0.51), box(0.4, 0.35, 0.02, -0.3, 1.05, 0.51)];
  return grouped2([sawn, oak, shingle, dark]);
}
function createWaterTroughGeometry() {
  const sawn = [
    box(1.8, 0.04, 0.5, 0, 0.12, 0, void 0, 0.6),
    box(1.8, 0.34, 0.04, 0, 0.29, -0.25, void 0, 0.6),
    box(1.8, 0.34, 0.04, 0, 0.29, 0.25, void 0, 0.6),
    box(0.04, 0.34, 0.5, -0.88, 0.29, 0, void 0, 0.6),
    box(0.04, 0.34, 0.5, 0.88, 0.29, 0, void 0, 0.6),
    box(0.1, 0.12, 0.6, -0.7, 0.06, 0),
    box(0.1, 0.12, 0.6, 0.7, 0.06, 0)
  ];
  return grouped2([sawn, [box(1.72, 0.02, 0.44, 0, 0.4, 0)]]);
}
function createHayRackGeometry() {
  const bark = [];
  for (const x of [-0.85, 0.85])
    for (const s of [-1, 1]) {
      bark.push(pole(v2(x, 0, s * 0.3), v2(x, 0.6, s * 0.3), 0.035));
      bark.push(pole(v2(x, 0.6, 0), v2(x, 1.3, s * 0.45), 0.03));
    }
  for (const s of [-1, 1])
    for (let i = 0; i < 9; i++)
      bark.push(pole(v2(-0.8 + i * 0.2, 0.6, 0), v2(-0.8 + i * 0.2, 1.3, s * 0.45), 0.012, 4));
  for (const s of [-1, 1]) bark.push(pole(v2(-0.9, 1.3, s * 0.45), v2(0.9, 1.3, s * 0.45), 0.03));
  const prism2 = new THREE6.CylinderGeometry(0.5, 0.5, 1.7, 3, 1);
  prism2.rotateZ(Math.PI / 2);
  prism2.rotateX(Math.PI / 2 + Math.PI / 6 + Math.PI / 3);
  prism2.scale(1, 0.85, 0.85);
  prism2.translate(0, 1.08, 0);
  meterUVs(prism2, 0.6);
  return grouped2([bark, [prism2, blob(0.8, 0.2, 0.4, 0, 1.3, 0, true)]]);
}
var MILL_POST_TOP = 3.3;
var MILL_HUB = { y: 2.55, z: 1.75 };
var MILL_SAIL_RADIUS = 3.9;
function createMillTrestleGeometry() {
  const oak = [];
  const stone = [];
  const reach = 1.7;
  for (const [x, z] of [
    [reach, 0],
    [-reach, 0],
    [0, reach],
    [0, -reach]
  ]) {
    stone.push(box(0.55, 0.45, 0.55, x, 0.225, z, void 0, 0.8));
    oak.push(pole(v2(x * 0.92, 0.6, z * 0.92), v2(x * 0.12, 2.2, z * 0.12), 0.09, 6));
  }
  oak.push(beam(2 * reach + 0.3, 0.26, 0.26, 0, 0.58, 0));
  oak.push(beam(2 * reach + 0.3, 0.26, 0.26, 0, 0.58, 0, { y: 90 }));
  oak.push(beam(MILL_POST_TOP - 0.45, 0.36, 0.36, 0, (MILL_POST_TOP + 0.45) / 2, 0, { z: 90 }));
  return grouped2([oak, stone]);
}
function createMillBuckGeometry() {
  const w = 2.3;
  const d = 3;
  const h = 3.4;
  const sawn = [box(w, h, d, 0, h / 2 - 0.5, 0, void 0, 0.5)];
  const tri = new THREE6.Shape();
  tri.moveTo(-w / 2, 0);
  tri.lineTo(w / 2, 0);
  tri.lineTo(0, 0.9);
  tri.lineTo(-w / 2, 0);
  const gables = new THREE6.ExtrudeGeometry(tri, { depth: d, bevelEnabled: false });
  gables.translate(0, h - 0.5, -d / 2);
  meterUVs(gables, 0.5);
  sawn.push(gables);
  const shingle = [];
  const slope = Math.hypot(w / 2 + 0.15, 0.95);
  for (const s of [-1, 1]) {
    const g = box(slope, 0.06, d + 0.3, 0, 0, 0);
    g.rotateZ(s * -Math.atan2(0.9, w / 2));
    g.translate(s * (w / 2) / 2, h - 0.5 + 0.47, 0);
    shingle.push(g);
  }
  const oak = [
    // Windshaft out through the breast, sloping up a little, with its brake wheel boss.
    cyl(0.16, 0.16, 0.7, 0, MILL_HUB.y, MILL_HUB.z - 0.3, { x: 92 }, 10),
    // Corner posts and the sill beams the body hangs on.
    ...[-1, 1].flatMap(
      (sx) => [-1, 1].map((sz) => beam(0.14, h + 0.1, 0.14, sx * w / 2, h / 2 - 0.5, sz * d / 2))
    ),
    beam(w + 0.3, 0.25, 0.3, 0, -0.5, 0)
  ];
  const top = v2(0, 0, -d / 2 - 0.05);
  const foot = v2(0, -MILL_POST_TOP, -d / 2 - 2.3);
  for (const x of [-0.42, 0.42]) oak.push(pole(v2(x, top.y, top.z), v2(x, foot.y, foot.z), 0.05, 5));
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    oak.push(beam(0.84, 0.04, 0.18, 0, top.y + (foot.y - top.y) * t, top.z + (foot.z - top.z) * t));
  }
  oak.push(box(1, 0.06, 0.9, 0, -0.05, -d / 2 - 0.4, void 0, 0.5));
  oak.push(pole(v2(0.75, -0.4, -d / 2), v2(0.75, -MILL_POST_TOP + 0.35, -d / 2 - 2.7), 0.1, 6));
  const dark = [
    box(0.75, 1.6, 0.03, 0, 0.8, -d / 2 - 0.01),
    box(0.45, 0.45, 0.03, 0.55, 2, d / 2 + 0.01)
  ];
  return grouped2([sawn, oak, shingle, dark]);
}
function createMillSailsGeometry() {
  const oak = [];
  const cloth = [];
  const R = MILL_SAIL_RADIUS;
  oak.push(cyl(0.2, 0.2, 0.3, 0, 0, 0, { x: 90 }, 10));
  for (let k = 0; k < 4; k++) {
    const parts = [];
    const sail = [];
    parts.push(beam(R, 0.14, 0.12, R / 2, 0, 0.12));
    parts.push(beam(R - 0.9, 0.05, 0.05, 0.9 + (R - 0.9) / 2, 0.75, 0.1));
    for (let i = 0; i <= 8; i++) {
      const x = 0.9 + (R - 0.95) * i / 8;
      parts.push(beam(0.04, 0.8, 0.04, x, 0.37, 0.1));
    }
    sail.push(box(R - 0.95, 0.7, 0.01, 0.9 + (R - 0.95) / 2, 0.38, 0.07));
    const angle = k * Math.PI / 2;
    for (const g of parts) oak.push(g.rotateZ(angle));
    for (const g of sail) cloth.push(g.rotateZ(angle));
  }
  return grouped2([oak, cloth]);
}
var RUBBLE_WALL = { length: 2, height: 2.2, depth: 0.5 };
function createRubbleWallGeometry(opening = "none") {
  const { length: L, height: H, depth: D } = RUBBLE_WALL;
  const stone = [];
  const oak = [];
  const door = [];
  const dark = [];
  const lumpy = (w, h, x, y) => {
    const g = new THREE6.BoxGeometry(
      w,
      h,
      D,
      Math.max(2, Math.round(w * 6)),
      Math.max(2, Math.round(h * 6)),
      2
    );
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i) + x;
      const py = p.getY(i) + y;
      const bump = Math.sin(px * 9.1 + py * 3.7) * Math.sin(py * 8.3 - px * 2.1) * 0.025;
      p.setZ(i, p.getZ(i) * (1 + bump / (D / 2)));
    }
    g.computeVertexNormals();
    meterUVs(g, 0.8);
    g.translate(x, y, 0);
    return g;
  };
  if (opening === "door") {
    const ow = 0.9;
    const oh = 1.8;
    const side = (L - ow) / 2;
    stone.push(lumpy(side, H, -L / 2 + side / 2, 0), lumpy(side, H, L / 2 - side / 2, 0));
    stone.push(lumpy(ow, H - oh - 0.18, 0, -H / 2 + oh + 0.18 + (H - oh - 0.18) / 2));
    oak.push(beam(ow + 0.4, 0.18, D + 0.02, 0, -H / 2 + oh + 0.09, 0));
    door.push(box(ow, oh, 0.06, 0, -H / 2 + oh / 2, D / 2 - 0.12, void 0, 0.8));
  } else if (opening === "window") {
    const ow = 0.7;
    const y0 = -0.15;
    const y1 = 0.6;
    const side = (L - ow) / 2;
    stone.push(lumpy(side, H, -L / 2 + side / 2, 0), lumpy(side, H, L / 2 - side / 2, 0));
    stone.push(lumpy(ow, H / 2 + y0, 0, (-H / 2 + y0) / 2));
    stone.push(lumpy(ow, H / 2 - y1, 0, (H / 2 + y1) / 2));
    dark.push(box(ow, y1 - y0, 0.02, 0, (y0 + y1) / 2, D / 2 - 0.12));
    oak.push(beam(ow + 0.3, 0.14, D + 0.04, 0, y1 + 0.07, 0));
    oak.push(beam(ow + 0.16, 0.07, 0.12, 0, y0 - 0.03, D / 2 - 0.04));
    for (const x of [-ow / 2 + 0.03, 0, ow / 2 - 0.03])
      oak.push(beam(0.05, y1 - y0, 0.05, x, (y0 + y1) / 2, D / 2 - 0.1));
    oak.push(beam(ow, 0.04, 0.05, 0, (y0 + y1) / 2, D / 2 - 0.1));
  } else if (opening === "vent") {
    const ow = 0.4;
    const y0 = 0.35;
    const y1 = 0.75;
    const side = (L - ow) / 2;
    stone.push(lumpy(side, H, -L / 2 + side / 2, 0), lumpy(side, H, L / 2 - side / 2, 0));
    stone.push(lumpy(ow, H / 2 + y0, 0, (-H / 2 + y0) / 2));
    stone.push(lumpy(ow, H / 2 - y1, 0, (H / 2 + y1) / 2));
    dark.push(box(ow, y1 - y0, 0.02, 0, (y0 + y1) / 2, 0));
    for (const x of [-0.1, 0.1])
      oak.push(beam(0.04, y1 - y0, 0.04, x, (y0 + y1) / 2, D / 2 - 0.05));
  } else {
    stone.push(lumpy(L, H, 0, 0));
  }
  return grouped2([stone, oak, door, dark]);
}
function createCellarMoundGeometry() {
  const mound = new THREE6.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = mound.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * 1.8;
    const y = p.getY(i) * 1.6;
    let z = p.getZ(i) * 1.8 - 0.2;
    x *= 1 + Math.sin(z * 3 + y * 2) * 0.03;
    z = Math.min(z, 0.95);
    p.setXYZ(i, x, y, z);
  }
  mound.computeVertexNormals();
  meterUVs(mound, 1);
  const turf = [mound];
  const earth = [];
  const stone = [box(2, 1.55, 0.4, 0, 0.775, 1, void 0, 0.8)];
  for (const x of [-0.75, 0.75]) stone.push(box(0.3, 0.35, 1.1, x, 0.175, 1.75, void 0, 0.8));
  const door = [box(0.8, 1.3, 0.05, 0, 0.75, 1.22, void 0, 0.8)];
  const dark = [box(1.2, 0.02, 1.1, 0, 0.015, 1.75)];
  for (let i = 0; i < 3; i++) stone.push(box(1.2, 0.03, 0.12, 0, 0.03, 1.4 + i * 0.3));
  return grouped2([earth, turf, stone, door, dark]);
}
function createBankerGeometry() {
  const stone = [box(0.9, 0.55, 0.65, 0, 0.275, 0, void 0, 0.8)];
  const dressed = [box(0.55, 0.32, 0.4, -0.05, 0.71, 0, { y: 8 }, 0.6)];
  const oak = [
    cyl(0.07, 0.07, 0.16, 0.32, 0.6, 0.18, { z: 90 }, 8),
    pole(v2(0.32, 0.6, 0.18), v2(0.32, 0.6, 0.45), 0.015, 4)
  ];
  const iron = [pole(v2(0.15, 0.89, -0.05), v2(0.38, 0.88, -0.15), 0.01, 4)];
  return grouped2([stone, oak, iron, dressed]);
}
function createAshlarStackGeometry() {
  const parts = [];
  for (const x of [-0.33, 0.33])
    for (const z of [-0.22, 0.22])
      parts.push(box(0.6, 0.4, 0.4, x, 0.2, z, { y: x * z * 20 }, 0.6));
  parts.push(
    box(0.6, 0.4, 0.4, 0, 0.6, 0, { y: 85 }, 0.6),
    box(0.6, 0.4, 0.4, 0.05, 0.6, 0, { y: 5 }, 0.6)
  );
  return grouped2([parts]);
}
function createSheerlegsGeometry() {
  const top = v2(0, 3.6, 0.5);
  const bark = [
    pole(v2(-1, 0, 0), top, 0.07),
    pole(v2(1, 0, 0), top, 0.07),
    pole(v2(0, 0, -1.6), top, 0.06)
  ];
  const cord = [pole(top, v2(0, 1.25, 0.5), 0.012, 4), pole(top, v2(0.15, 0.6, -0.3), 0.012, 4)];
  const iron = [cyl(0.08, 0.08, 0.05, 0, 3.4, 0.5, { x: 90 }), box(0.06, 0.15, 0.02, 0, 1.2, 0.5)];
  const stone = [box(0.5, 0.32, 0.36, 0, 0.98, 0.5, void 0, 0.6)];
  return grouped2([bark, cord, iron, stone]);
}
var CLAMP_SMOKE_Y = 1.15;
function createCharcoalClampGeometry() {
  const dome = new THREE6.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = dome.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const lump = 1 + Math.sin(x * 7 + z * 5) * Math.cos(z * 6 - y * 4) * 0.05;
    p.setXYZ(i, x * 1.4 * lump, y * 1.1, z * 1.4 * lump);
  }
  dome.computeVertexNormals();
  meterUVs(dome, 1);
  const turf = [];
  for (const [x, z, r] of [
    [0.5, 0.3, 0.45],
    [-0.6, -0.2, 0.5],
    [0.1, -0.7, 0.4]
  ])
    turf.push(blob(r, 0.12, r, x, 1.1 - Math.hypot(x, z) * 0.45, z, true, 10));
  const dark = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    dark.push(box(0.14, 0.1, 0.04, Math.sin(a) * 1.38, 0.12, Math.cos(a) * 1.38, { y: a / RAD }));
  }
  dark.push(cyl(0.12, 0.12, 0.02, 0, 1.105, 0));
  return grouped2([[dome], turf, dark]);
}
function createTurfHutGeometry() {
  const turf = [cyl(0.05, 1.05, 2.1, 0, 1.05, 0, void 0, 12)];
  const bark = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.3;
    bark.push(
      pole(
        v2(Math.cos(a) * 0.95, 0.15, Math.sin(a) * 0.95),
        v2(-Math.cos(a) * 0.12, 2.45, -Math.sin(a) * 0.12),
        0.03
      )
    );
  }
  const dark = [box(0.55, 1, 0.05, 0, 0.5, 0.82, { x: -25 })];
  return grouped2([turf, bark, dark]);
}
function createCordwoodGeometry() {
  const bark = [];
  for (let row = 0; row < 5; row++)
    for (let i = 0; i < 10; i++) {
      const x = -0.9 + i * 0.2 + row % 2 * 0.05;
      bark.push(cyl(0.09, 0.09, 0.95, x, 0.09 + row * 0.17, 0, { x: 90 }, 6));
    }
  const oak = [-1.02, 1.02].map((x) => pole(v2(x, 0, 0), v2(x, 1.05, 0), 0.04));
  return grouped2([bark, oak]);
}
function createTarKilnGeometry() {
  const ringPts = [
    new THREE6.Vector2(1.2, 0),
    new THREE6.Vector2(1.25, 0.45),
    new THREE6.Vector2(1.05, 0.5),
    new THREE6.Vector2(0.95, 0.05)
  ];
  const rim = new THREE6.LatheGeometry(ringPts, 20);
  meterUVs(rim, 0.8);
  const stone = [rim, box(0.4, 0.2, 1.4, 0, 0.1, 1.75, void 0, 0.8)];
  const heap = blob(1, 0.85, 1, 0, 0.45, 0, true, 16);
  const tar = [
    box(0.2, 0.02, 1.4, 0, 0.205, 1.75),
    cyl(0.95, 0.95, 0.02, 0, 0.42, 0, void 0, 18)
  ];
  return grouped2([stone, [heap], tar]);
}
function createHerbBundlesGeometry() {
  const oak = [pole(v2(-0.9, 0, 0), v2(0.9, 0, 0), 0.025)];
  const green = [];
  const dry = [];
  for (let i = 0; i < 7; i++) {
    const x = -0.75 + i * 0.25;
    const g = cyl(0.07, 0.015, 0.34, x, -0.2, 0, { z: i % 3 * 4 - 4 }, 6);
    (i % 2 ? dry : green).push(g);
  }
  return grouped2([oak, green, dry]);
}
function createTrestleTableGeometry() {
  const sawn = [box(2.4, 0.05, 0.8, 0, 0.76, 0, void 0, 0.6)];
  const oak = [];
  for (const x of [-0.9, 0.9]) {
    oak.push(
      pole(v2(x, 0, -0.3), v2(x, 0.74, 0.1), 0.03, 5),
      pole(v2(x, 0, 0.3), v2(x, 0.74, -0.1), 0.03, 5)
    );
  }
  oak.push(beam(1.9, 0.06, 0.06, 0, 0.3, 0));
  for (const z of [-0.7, 0.7]) {
    sawn.push(box(2.2, 0.05, 0.3, 0, 0.45, z, void 0, 0.6));
    for (const x of [-0.9, 0.9]) oak.push(beam(0.06, 0.43, 0.26, x, 0.215, z));
  }
  const clay = [];
  for (const [x, z] of [
    [-0.7, -0.22],
    [-0.1, 0.24],
    [0.6, -0.2],
    [0.9, 0.25]
  ]) {
    clay.push(cyl(0.09, 0.06, 0.06, x, 0.815, z, void 0, 10));
    clay.push(cyl(0.04, 0.035, 0.11, x + 0.16, 0.84, z * 0.6, void 0, 8));
  }
  return grouped2([sawn, oak, clay]);
}
function createSawhorseGeometry() {
  const oak = [];
  for (const x of [-0.45, 0.45]) {
    oak.push(
      pole(v2(x, 0, -0.28), v2(x, 0.62, 0), 0.025, 4),
      pole(v2(x, 0, 0.28), v2(x, 0.62, 0), 0.025, 4)
    );
  }
  oak.push(beam(1.1, 0.08, 0.08, 0, 0.64, 0));
  const fresh = [box(2, 0.05, 0.25, 0.2, 0.705, 0, void 0, 0.6)];
  const iron = [
    box(0.5, 0.12, 6e-3, 0.75, 0.78, 0.05, { z: 28 }),
    box(0.06, 0.12, 0.04, 0.98, 0.9, 0.05)
  ];
  return grouped2([fresh, oak, iron]);
}
function createLadderGeometry() {
  const bark = [
    pole(v2(-0.22, 0, 0), v2(-0.2, 3.2, 0), 0.035),
    pole(v2(0.22, 0, 0), v2(0.2, 3.2, 0), 0.035)
  ];
  for (let i = 1; i < 11; i++)
    bark.push(pole(v2(-0.22, i * 0.29, 0), v2(0.22, i * 0.29, 0), 0.018, 4));
  return grouped2([bark]);
}
function createPoleStackGeometry() {
  const bark = [];
  for (const x of [-1.4, 1.4]) bark.push(box(0.12, 0.1, 0.9, x, 0.05, 0));
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 6 - row; i++) {
      const z = -0.32 + i * 0.13 + row * 0.065;
      bark.push(pole(v2(-2, 0.15 + row * 0.1, z), v2(2, 0.15 + row * 0.1, z + 0.02), 0.05, 6));
    }
  return grouped2([bark]);
}
function createFruitTreeGeometry() {
  const bark = [
    cyl(0.08, 0.12, 1.4, 0, 0.7, 0, void 0, 7),
    pole(v2(0, 1.2, 0), v2(0.5, 2, 0.2), 0.05),
    pole(v2(0, 1.3, 0), v2(-0.4, 2.1, -0.3), 0.05)
  ];
  const leaves = [
    blob(1.15, 0.85, 1.1, 0, 2.25, 0, false, 12),
    blob(0.7, 0.55, 0.7, 0.55, 2.55, 0.25, false, 10),
    blob(0.65, 0.5, 0.65, -0.5, 2.5, -0.3, false, 10)
  ];
  const fruit = [];
  for (let i = 0; i < 18; i++) {
    const a = i * 2.4;
    const h = 1.75 + i * 37 % 10 * 0.08;
    const r = 1 * Math.sqrt(1 - ((h - 2.25) / 0.95) ** 2) + 0.06;
    fruit.push(blob(0.06, 0.06, 0.06, Math.cos(a) * r, h, Math.sin(a) * r, false, 6));
  }
  return grouped2([bark, leaves, fruit]);
}
function washboard(x, y, z, yaw, lean) {
  const parts = [box(0.34, 0.6, 0.025, 0, 0.3, 0), box(0.4, 0.05, 0.04, 0, 0.58, 0)];
  for (let i = 0; i < 10; i++) parts.push(box(0.28, 0.016, 0.022, 0, 0.1 + i * 0.04, 0.016));
  for (const s of [-1, 1]) parts.push(box(0.035, 0.66, 0.035, s * 0.18, 0.31, 0));
  return parts.map((g) => orient(g, x, y, z, { y: yaw, x: -lean }));
}
function createWashBasinGeometry() {
  const L = 1.8;
  const D = 0.7;
  const H = 0.62;
  const t = 0.1;
  const stone = [
    box(L, 0.14, D, 0, 0.07, 0, void 0, 0.8),
    box(L, H - 0.14, t, 0, (H + 0.14) / 2, -(D - t) / 2, void 0, 0.8),
    box(L, H - 0.14, t, 0, (H + 0.14) / 2, (D - t) / 2, void 0, 0.8),
    box(t, H - 0.14, D - 2 * t, -(L - t) / 2, (H + 0.14) / 2, 0, void 0, 0.8),
    box(t, H - 0.14, D - 2 * t, (L - t) / 2, (H + 0.14) / 2, 0, void 0, 0.8),
    // A lip along the front to scrub against, a drain spout at the right end.
    box(L + 0.04, 0.05, 0.16, 0, H - 0.02, D / 2 - 0.04, void 0, 0.8),
    box(0.16, 0.08, 0.12, L / 2 + 0.06, 0.2, 0, void 0, 0.8)
  ];
  const water = [box(L - 2 * t, 0.02, D - 2 * t, 0, H - 0.12, 0)];
  const oak = [
    ...washboard(-0.55, 0.14, -0.08, 0, 22),
    beam(0.55, 0.05, 0.1, 0.35, H + 0.03, 0.12, { y: 20 }),
    cyl(0.018, 0.018, 0.3, 0.7, H + 0.03, 0.2, { z: 90, y: 20 }, 6)
  ];
  return grouped2([stone, water, oak]);
}
function createWashTubGeometry() {
  const oak = [];
  const iron = [];
  const r = 0.4;
  const y0 = 0.32;
  const h = 0.42;
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    oak.push(
      box(0.15, h, 0.03, Math.cos(a) * r, y0 + h / 2, Math.sin(a) * r, {
        y: 90 - a * 180 / Math.PI
      })
    );
  }
  oak.push(cyl(r, r, 0.04, 0, y0 + 0.03, 0, void 0, 16));
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + 0.3;
    oak.push(
      pole(
        v2(Math.cos(a) * 0.25, y0, Math.sin(a) * 0.25),
        v2(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4),
        0.03,
        5
      )
    );
  }
  for (const y of [y0 + 0.08, y0 + h - 0.06]) {
    const hoop = new THREE6.TorusGeometry(r + 0.018, 0.012, 4, 24).rotateX(Math.PI / 2);
    hoop.translate(0, y, 0);
    iron.push(hoop);
  }
  oak.push(...washboard(0, y0 + 0.05, -0.2, 0, 20));
  oak.push(cyl(0.18, 0.18, 0.05, 0.62, 0.3, 0.32, void 0, 10));
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    oak.push(
      pole(
        v2(0.62 + Math.cos(a) * 0.1, 0.28, 0.32 + Math.sin(a) * 0.1),
        v2(0.62 + Math.cos(a) * 0.16, 0, 0.32 + Math.sin(a) * 0.16),
        0.022,
        5
      )
    );
  }
  const water = new THREE6.CircleGeometry(r - 0.02, 16).rotateX(-Math.PI / 2);
  water.translate(0, y0 + h - 0.1, 0);
  return grouped2([oak, iron, [meterUVs(water)]]);
}
function createClothesLineGeometry() {
  const bark = [];
  const span = 1.6;
  const top = 1.85;
  for (const s of [-1, 1]) {
    bark.push(pole(v2(s * span, 0, 0), v2(s * span, top + 0.05, 0), 0.04, 6));
    bark.push(pole(v2(s * span, top - 0.12, 0), v2(s * (span - 0.08), top + 0.12, 0), 0.02, 4));
    bark.push(pole(v2(s * span, top - 0.12, 0), v2(s * (span + 0.08), top + 0.12, 0), 0.02, 4));
  }
  const cord = [];
  const sag = (x) => top - 0.12 * (1 - (x / span) ** 2);
  for (let i = 0; i < 12; i++) {
    const xa = -span + i * 2 * span / 12;
    const xb = -span + (i + 1) * 2 * span / 12;
    cord.push(pole(v2(xa, sag(xa), 0), v2(xb, sag(xb), 0), 8e-3, 3));
  }
  const hang = (x, w, drop, out) => {
    const y = sag(x);
    out.push(box(w, drop, 0.012, x, y - drop / 2, 0.02, { x: 4 }));
    out.push(box(w, drop * 0.6, 0.012, x, y - drop * 0.3, -0.02, { x: -4 }));
  };
  const shirt = (x, out) => {
    hang(x, 0.48, 0.62, out);
    for (const s of [-1, 1])
      out.push(box(0.16, 0.12, 0.014, x + s * 0.31, sag(x) - 0.08, 0.02, { z: s * 20 }));
  };
  const natural = [];
  const blue = [];
  const red = [];
  const white = [];
  shirt(-1.05, natural);
  hang(-0.3, 0.75, 0.95, blue);
  shirt(0.5, red);
  hang(1.12, 0.55, 0.5, white);
  return grouped2([bark, cord, natural, blue, red, white]);
}
function createPoleStallGeometry() {
  const bark = [];
  const wood = [];
  for (const x of [-1.1, 1.1]) wood.push(cyl(0.2, 0.22, 0.72, x, 0.36, 0, void 0, 9));
  for (let i = 0; i < 4; i++)
    wood.push(beam(2.8, 0.14, 0.27, 0, 0.81, -0.41 + i * 0.275, { z: i % 2 * 0.6 - 0.3 }));
  const back = -0.75;
  const front = 0.85;
  for (const x of [-1.45, 1.45]) {
    bark.push(pole(v2(x, 0, back), v2(x, 2.25, back), 0.045, 6));
    bark.push(pole(v2(x, 0, front), v2(x, 1.95, front), 0.045, 6));
    bark.push(pole(v2(x, 2.22, back - 0.1), v2(x, 1.92, front + 0.1), 0.03, 5));
  }
  for (const [y, z] of [
    [2.22, back],
    [1.92, front]
  ])
    bark.push(pole(v2(-1.6, y, z), v2(1.6, y, z), 0.035, 5));
  const rise = 2.27 - 1.97;
  const run = front - back + 0.3;
  const awning = sheet(3.3, Math.hypot(run, rise), 0, 2.12, (back + front) / 2, {
    x: -90 + Math.atan2(rise, run) * 180 / Math.PI
  });
  return grouped2([bark, wood, [awning]]);
}
var TOWER_MILL = { height: 6, baseRadius: 2.05, topRadius: 1.6 };
var TOWER_MILL_HUB = { y: 6.55, z: 2.15 };
function createTowerMillGeometry() {
  const { height: H, baseRadius: R0, topRadius: R1 } = TOWER_MILL;
  const tower = new THREE6.CylinderGeometry(R1, R0, H, 24, 6, true);
  tower.translate(0, H / 2, 0);
  meterUVs(tower, 0.8);
  const stone = [tower];
  for (let c = 0; c < 9; c++) {
    const y = 0.3 + c * 0.66;
    const r = R0 + (R1 - R0) * y / H + 0.02;
    for (let i = 0; i < 14; i++) {
      const a = (i + c % 2 * 0.5) / 14 * Math.PI * 2;
      stone.push(
        box(0.55, 0.22, 0.08, Math.sin(a) * r, y, Math.cos(a) * r, { y: a * 180 / Math.PI }, 0.8)
      );
    }
  }
  const top = new THREE6.CircleGeometry(R1, 24).rotateX(-Math.PI / 2);
  top.translate(0, H, 0);
  stone.push(top);
  const oak = [];
  const dark = [];
  const faceAt = (y) => R0 + (R1 - R0) * y / H;
  oak.push(box(0.95, 1.85, 0.08, 0, 0.93, faceAt(0.9) + 0.02));
  oak.push(box(1.15, 0.14, 0.18, 0, 1.92, faceAt(1.9) + 0.04));
  for (const y of [3, 4.6]) {
    dark.push(box(0.4, 0.55, 0.06, 0, y, faceAt(y) + 0.01));
    oak.push(box(0.55, 0.08, 0.14, 0, y - 0.31, faceAt(y) + 0.04));
  }
  oak.push(cyl(R1 + 0.12, R1 + 0.12, 0.22, 0, H + 0.11, 0, void 0, 24));
  const cap = new THREE6.ConeGeometry(R1 + 0.35, 1.9, 20, 3);
  cap.translate(0, H + 0.22 + 0.95, 0);
  meterUVs(cap, 1);
  const straw = [cap, blob(0.25, 0.18, 0.25, 0, H + 2.15, 0, false, 8)];
  oak.push(cyl(0.16, 0.18, 1, 0, TOWER_MILL_HUB.y, TOWER_MILL_HUB.z - 0.55, { x: 90 }, 10));
  return grouped2([stone, oak, dark, straw]);
}
var BLOOMERY_TOP = 1.7;
function createBloomeryGeometry() {
  const clay = [
    cyl(0.3, 0.55, BLOOMERY_TOP - 0.3, 0, 0.3 + (BLOOMERY_TOP - 0.3) / 2, 0, void 0, 14)
  ];
  clay.push(cyl(0.34, 0.34, 0.12, 0, BLOOMERY_TOP - 0.02, 0, void 0, 14));
  clay.push(cyl(0.07, 0.09, 0.7, -0.75, 0.55, 0, { z: 80 }, 8));
  const stone = [];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    stone.push(
      box(
        0.36,
        0.3,
        0.22,
        Math.sin(a) * 0.6,
        0.15,
        Math.cos(a) * 0.6,
        { y: a * 180 / Math.PI },
        0.8
      )
    );
  }
  const ember = [
    cyl(0.25, 0.25, 0.02, 0, BLOOMERY_TOP + 0.05, 0, void 0, 12),
    box(0.26, 0.24, 0.05, 0, 0.42, 0.52, { x: -12 })
  ];
  const dark = [box(0.34, 0.34, 0.04, 0, 0.44, 0.5, { x: -12 })];
  const leather = [];
  const oak = [];
  for (const z of [-0.22, 0.22]) {
    leather.push(box(0.55, 0.16, 0.3, -1.35, 0.55, z, { z: 6 }));
    oak.push(box(0.6, 0.03, 0.34, -1.35, 0.65, z, { z: 10 }), box(0.6, 0.03, 0.34, -1.35, 0.46, z));
    oak.push(pole(v2(-1.6, 0.66, z), v2(-1.75, 1.15, z), 0.02, 4));
  }
  for (const x of [-1.65, -1.05])
    for (const z of [-0.4, 0.4]) oak.push(beam(0.06, 0.45, 0.06, x, 0.22, z));
  return grouped2([clay, stone, ember, leather, oak, dark]);
}
function createSlagHeapGeometry() {
  const slag = [blob(0.6, 0.3, 0.5, 0, 0, 0, true, 10)];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    slag.push(
      blob(
        0.14,
        0.09,
        0.12,
        Math.cos(a) * (0.5 + i % 3 * 0.12),
        0.03,
        Math.sin(a) * 0.55,
        false,
        6
      )
    );
  }
  return grouped2([slag]);
}
function createBloomStumpGeometry() {
  return grouped2([
    [
      cyl(0.32, 0.36, 0.6, 0, 0.3, 0, void 0, 10),
      pole(v2(0.32, 0, 0.2), v2(0.38, 0.5, 0.25), 0.02, 4)
    ],
    [blob(0.14, 0.09, 0.12, 0, 0.66, 0, false, 8)],
    [
      pole(v2(-0.08, 0.64, 0.05), v2(-0.6, 0.62, 0.3), 0.013, 4),
      pole(v2(-0.08, 0.64, -0.03), v2(-0.6, 0.6, 0.22), 0.013, 4),
      box(0.16, 0.07, 0.07, 0.38, 0.52, 0.25, { z: 80 })
    ]
  ]);
}
function createBarRackGeometry() {
  const oak = [];
  for (const x of [-0.6, 0.6]) {
    oak.push(
      pole(v2(x, 0, -0.25), v2(x, 0.7, 0), 0.03, 4),
      pole(v2(x, 0, 0.25), v2(x, 0.7, 0), 0.03, 4)
    );
    oak.push(beam(0.08, 0.06, 0.5, x, 0.45, 0));
  }
  const iron = [];
  for (let i = 0; i < 7; i++)
    iron.push(box(1.5, 0.04, 0.04, 0, 0.5 + i % 2 * 0.04, -0.15 + i * 0.05));
  return grouped2([oak, iron]);
}
function createBeanTrellisGeometry() {
  const bark = [];
  const leaves = [];
  const pods = [];
  for (let x = -0.9; x <= 0.91; x += 0.45) {
    for (const s of [-1, 1]) bark.push(pole(v2(x, 0, s * 0.3), v2(x, 1.9, -s * 0.05), 0.016, 4));
    for (let y = 0.3; y < 1.7; y += 0.35)
      for (const s of [-1, 1])
        leaves.push(
          blob(0.13, 0.12, 0.08, x + y * 10 % 3 * 0.03, y, s * (0.3 - y * 0.17), false, 6)
        );
    pods.push(
      box(0.02, 0.12, 0.02, x + 0.08, 1, 0.12),
      box(0.02, 0.12, 0.02, x - 0.06, 0.7, -0.15)
    );
  }
  bark.push(pole(v2(-1, 1.8, 0), v2(1, 1.8, 0), 0.018, 4));
  return grouped2([bark, leaves, pods]);
}
function createPalingPanelGeometry() {
  const oak = [
    beam(0.09, 1.25, 0.09, -0.97, 0.62, 0),
    beam(2, 0.06, 0.04, 0, 0.3, -0.05),
    beam(2, 0.06, 0.04, 0, 0.85, -0.05)
  ];
  const pales = [];
  for (let x = -0.88; x <= 0.9; x += 0.12) {
    const h = 1.05 + Math.round(x * 100) * 7 % 5 * 0.012;
    pales.push(box(0.085, h, 0.02, x, h / 2, 0));
    pales.push(orient(new THREE6.ConeGeometry(0.06, 0.1, 4), x, h + 0.04, 0, { y: 45 }));
  }
  return grouped2([oak, pales]);
}
function createGreatBellowsGeometry() {
  const oak = [];
  for (const x of [-0.8, 0.6])
    for (const z of [-0.35, 0.35]) oak.push(beam(0.08, 0.6, 0.08, x, 0.3, z));
  oak.push(beam(1.6, 0.08, 0.8, -0.1, 0.62, 0));
  oak.push(beam(1.5, 0.05, 0.7, -0.1, 1.05, 0, { z: -4 }));
  oak.push(beam(0.1, 1.8, 0.1, -0.9, 1, 0.5), beam(2.2, 0.08, 0.08, -0.4, 1.85, 0.5, { z: 8 }));
  const leather = [box(1.5, 0.36, 0.66, -0.1, 0.84, 0, { z: -2 })];
  const iron = [
    cyl(0.03, 0.07, 0.45, 0.82, 0.82, 0, { z: 90 }, 8),
    pole(v2(0.4, 1.06, 0.3), v2(0.6, 1.8, 0.5), 0.012, 3)
  ];
  return grouped2([oak, leather, iron]);
}
var BRICK_STACK_TOP = 4.2;
function createBrickStackGeometry() {
  const clay = [
    box(1.4, 0.8, 1, 0, 0.4, 0, void 0, 0.5),
    box(
      0.8,
      BRICK_STACK_TOP - 0.8,
      0.7,
      0,
      0.8 + (BRICK_STACK_TOP - 0.8) / 2,
      -0.15,
      void 0,
      0.5
    ),
    box(1, 0.12, 0.9, 0, BRICK_STACK_TOP - 0.06, -0.15, void 0, 0.5),
    box(1.2, 0.5, 0.2, 0, 1.25, 0.25, void 0, 0.5)
  ];
  return grouped2([
    clay,
    [box(0.7, 0.03, 0.5, 0, 0.82, 0.15)],
    [box(1.3, 0.04, 0.06, 0, 0.84, 0.48)]
  ]);
}
function createStandingTorchGeometry() {
  const oak = [
    cyl(0.04, 0.05, 1.6, 0, 0.8, 0, void 0, 8),
    beam(0.5, 0.06, 0.06, 0, 0.03, 0),
    beam(0.06, 0.06, 0.5, 0, 0.03, 0)
  ];
  const iron = [
    cyl(0.13, 0.07, 0.14, 0, 1.67, 0, void 0, 10),
    cyl(0.145, 0.145, 0.025, 0, 1.745, 0, void 0, 10)
  ];
  const glow = [cyl(0, 0.085, 0.2, 0, 1.85, 0, void 0, 8)];
  return grouped2([oak, iron, glow]);
}
function createLanternPostGeometry() {
  const oak = [
    box(0.3, 0.15, 0.3, 0, 0.075, 0, void 0, 0.5),
    beam(0.12, 2.2, 0.12, 0, 1.1, 0),
    beam(0.5, 0.06, 0.06, 0.25, 2.17, 0),
    pole(v2(0, 1.8, 0), v2(0.3, 2.15, 0), 0.022, 4)
  ];
  const iron = [
    pole(v2(0.5, 2.15, 0), v2(0.5, 2.03, 0), 8e-3, 3),
    cyl(0, 0.12, 0.1, 0.5, 1.98, 0, void 0, 4),
    box(0.18, 0.03, 0.18, 0.5, 1.7, 0)
  ];
  for (const dx of [-0.08, 0.08])
    for (const dz of [-0.08, 0.08])
      iron.push(pole(v2(0.5 + dx, 1.71, dz), v2(0.5 + dx, 1.93, dz), 9e-3, 3));
  const glow = [box(0.14, 0.22, 0.14, 0.5, 1.82, 0)];
  return grouped2([oak, iron, glow]);
}
function createFountainGeometry() {
  const dressed = [
    cyl(2.2, 2.3, 0.2, 0, 0.1, 0, void 0, 24),
    cyl(2.05, 2.05, 0.5, 0, 0.45, 0, void 0, 24),
    cyl(2.25, 2.25, 0.1, 0, 0.75, 0, void 0, 24),
    cyl(0.28, 0.4, 1, 0, 0.7, 0, void 0, 12),
    cyl(0.9, 0.35, 0.3, 0, 1.35, 0, void 0, 16),
    cyl(0.95, 0.95, 0.07, 0, 1.52, 0, void 0, 16),
    cyl(0.1, 0.18, 0.5, 0, 1.75, 0, void 0, 8),
    blob(0.14, 0.14, 0.14, 0, 2.05, 0, false, 8)
  ];
  const water = [
    cyl(1.98, 1.98, 0.03, 0, 0.62, 0, void 0, 24),
    cyl(0.82, 0.82, 0.03, 0, 1.5, 0, void 0, 16),
    // The fall from the upper bowl.
    cyl(0.05, 0.05, 0.9, 0, 1, 0, void 0, 6)
  ];
  return grouped2([dressed, water]);
}
function createGrandFountainGeometry() {
  const dressed = [
    cyl(3.5, 3.6, 0.25, 0, 0.125, 0, void 0, 8),
    cyl(3.35, 3.35, 0.55, 0, 0.5, 0, void 0, 8),
    cyl(3.6, 3.6, 0.12, 0, 0.82, 0, void 0, 8),
    cyl(0.4, 0.6, 1.3, 0, 0.9, 0, void 0, 12),
    cyl(1.7, 0.5, 0.4, 0, 1.75, 0, void 0, 16),
    cyl(1.75, 1.75, 0.08, 0, 1.97, 0, void 0, 16),
    cyl(0.25, 0.35, 0.9, 0, 2.4, 0, void 0, 10),
    cyl(0.95, 0.3, 0.3, 0, 2.95, 0, void 0, 14),
    cyl(1, 1, 0.07, 0, 3.1, 0, void 0, 14)
  ];
  const water = [
    cyl(3.3, 3.3, 0.03, 0, 0.8, 0, void 0, 8),
    cyl(1.6, 1.6, 0.03, 0, 1.94, 0, void 0, 16),
    cyl(0.85, 0.85, 0.03, 0, 3.07, 0, void 0, 14),
    cyl(0.07, 0.07, 1.2, 0, 2.5, 0, void 0, 6)
  ];
  const copper = [
    cyl(0.08, 0.2, 0.7, 0, 3.4, 0, void 0, 8),
    blob(0.16, 0.16, 0.16, 0, 3.85, 0, false, 8)
  ];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    copper.push(cyl(0.05, 0.1, 0.55, Math.cos(a) * 1.7, 2.25, Math.sin(a) * 1.7, void 0, 6));
    copper.push(blob(0.1, 0.1, 0.1, Math.cos(a) * 1.7, 2.6, Math.sin(a) * 1.7, false, 6));
  }
  return grouped2([dressed, water, copper]);
}
function createHedgePanelGeometry() {
  const leaves = [box(2, 1, 0.7, 0, 0.55, 0, void 0, 1)];
  for (let i = 0; i < 6; i++) {
    const h = 0.26 + i * 5 % 3 * 0.04;
    leaves.push(blob(0.16, h, 0.33, -0.835 + i * 0.334, 1.05, 0, true, 8));
  }
  const earth = [box(2, 0.05, 0.9, 0, 0.025, 0, void 0, 1)];
  return grouped2([leaves, earth]);
}
function createBellCradleGeometry() {
  const oak = [];
  for (const x of [-0.9, 0.9]) {
    oak.push(beam(0.14, 2, 0.14, x, 1, -0.4, { z: x > 0 ? 8 : -8 }));
    oak.push(beam(0.14, 2, 0.14, x, 1, 0.4, { z: x > 0 ? 8 : -8 }));
  }
  oak.push(beam(2.1, 0.16, 0.16, 0, 1.98, 0));
  oak.push(beam(1.9, 0.1, 0.1, 0, 0.5, -0.4));
  const copper = [
    cyl(0.18, 0.62, 0.95, 0, 1.2, 0, void 0, 14),
    cyl(0.64, 0.7, 0.1, 0, 0.67, 0, void 0, 14),
    blob(0.2, 0.12, 0.2, 0, 1.7, 0, true, 8)
  ];
  const iron = [
    cyl(0.025, 0.025, 0.3, 0, 1.82, 0, void 0, 5),
    cyl(0.03, 0.03, 0.4, 0, 0.9, 0, void 0, 5),
    blob(0.07, 0.07, 0.07, 0, 0.7, 0, false, 6)
  ];
  return grouped2([oak, copper, iron]);
}
function createStoneWallRunGeometry() {
  const stone = [];
  const courses = 9;
  const courseH = 0.28;
  for (let c = 0; c < courses; c++) {
    const y = c * courseH + courseH / 2;
    const batter = c < 3 ? 0.06 * (3 - c) : 0;
    const w = 1.04 + batter;
    const lens = c % 2 === 0 ? [1, 1, 1, 1] : [0.5, 1, 1, 1, 0.5];
    let x = -2;
    for (const len of lens) {
      stone.push(box(len - 0.02, courseH - 0.02, w, x + len / 2, y, 0, void 0, 0.8));
      x += len;
    }
  }
  const dressed = [box(4, 0.1, 1.2, 0, courses * courseH + 0.05, 0, void 0, 0.8)];
  const top = courses * courseH + 0.1;
  for (const x of [-1.75, -0.75, 0.25, 1.25]) dressed.push(box(0.5, 0.45, 1.1, x + 0.25, top + 0.225, 0.05, void 0, 0.8));
  return grouped2([stone, dressed]);
}

// vendor/city-builder/src/editor/pieces/primitiveGeometry.ts
import * as THREE7 from "three";
var v3 = (x, y, z) => new THREE7.Vector3(x, y, z);
function createSaplingPoleGeometry(length, radius, variant = 0) {
  return createRusticLogGeometry(length, radius, {
    seed: variant + 31,
    nubs: false,
    bend: 0.018,
    radialSegments: 7
  });
}
function createForkedPostGeometry(height = 2) {
  const shaft = createSaplingPoleGeometry(height, 0.06, 2);
  shaft.rotateZ(Math.PI / 2);
  shaft.translate(0, height / 2, 0);
  const forkAt = height - 0.28;
  const prongs = [-1, 1].map((s) => pole(v3(0, forkAt, 0), v3(s * 0.13, height + 0.08, 0), 0.032, 5));
  return grouped2([[shaft, ...prongs]]);
}
function createPoleRoofGeometry(width = 2) {
  const rand = seededRandom(width * 101 + 7);
  const poles = [];
  const count = 11;
  for (let i = 0; i < count; i++) {
    const length = width + 0.1 + rand() * 0.25;
    const r = 0.054 + rand() * 0.01;
    const g = createSaplingPoleGeometry(length, r, i % 6);
    g.translate((rand() - 0.5) * 0.18, 0.03, -0.5 + (i + 0.5) / count);
    poles.push(g);
  }
  return grouped2([poles]);
}
var DOME = { radius: 2.3, height: 2.1 };
function createDomeFrameGeometry() {
  const { radius: R, height: H } = DOME;
  const sticks = [];
  const at = (theta, phi) => v3(Math.sin(theta) * Math.cos(phi) * R, Math.sin(phi) * H, Math.cos(theta) * Math.cos(phi) * R);
  for (let k = 0; k < 6; k++) {
    const theta = k / 6 * Math.PI + 0.26;
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + i / 12 * Math.PI;
      const b = -Math.PI / 2 + (i + 1) / 12 * Math.PI;
      const pa = at(theta + (a > 0 ? Math.PI : 0), Math.PI / 2 - Math.abs(a));
      const pb = at(theta + (b > 0 ? Math.PI : 0), Math.PI / 2 - Math.abs(b));
      sticks.push(pole(pa, pb, 0.032, 5));
    }
  }
  for (const [phi, door] of [
    [0.45, true],
    [0.95, false]
  ]) {
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * Math.PI * 2;
      const b = (i + 1) / 20 * Math.PI * 2;
      if (door && (Math.abs(a) < 0.3 || Math.abs(a - Math.PI * 2) < 0.3 || a < 0.3)) continue;
      sticks.push(pole(at(a, phi), at(b, phi), 0.025, 4));
    }
  }
  return grouped2([sticks]);
}
function createDomeWeaveGeometry() {
  const { radius: R, height: H } = DOME;
  const rand = seededRandom(55);
  const sticks = [];
  const at = (theta, phi) => v3(Math.sin(theta) * Math.cos(phi) * R, Math.sin(phi) * H, Math.cos(theta) * Math.cos(phi) * R);
  const rings = 24;
  for (let k = 0; k < rings; k++) {
    const phi = 0.06 + k / rings * 1.42;
    const segs = Math.max(6, Math.round(30 * Math.cos(phi)));
    const turn = rand() * Math.PI;
    for (let i = 0; i < segs; i++) {
      const a = i / segs * Math.PI * 2 + turn;
      const b = (i + 1) / segs * Math.PI * 2 + turn;
      const mid = (a + b) / 2 % (Math.PI * 2);
      const inDoor = Math.min(mid, Math.PI * 2 - mid) < 0.34 && Math.sin(phi) * H < 1.4;
      if (inDoor) continue;
      const pa = at(a - 0.02, phi);
      const pb = at(b + 0.02, phi);
      sticks.push(pole(pa, pb, 0.032, 5));
    }
  }
  for (const s of [-1, 1]) sticks.push(pole(at(s * 0.34, 0), at(s * 0.34, 0.72), 0.03, 5));
  sticks.push(pole(at(-0.38, 0.72), at(0.38, 0.72), 0.03, 5));
  const shell2 = blob(R * 0.96, H * 0.95, R * 0.96, 0, 0, 0, true, 18);
  return grouped2([sticks, [shell2]]);
}
function createLongHearthGeometry() {
  const rand = seededRandom(9);
  const stone = [];
  for (let i = 0; i < 18; i++) {
    const t = i / 18 * Math.PI * 2;
    const x = Math.cos(t) * 1.1;
    const z = Math.sin(t) * 0.45;
    stone.push(
      box(
        0.26 + rand() * 0.1,
        0.16 + rand() * 0.06,
        0.22,
        x,
        0.08,
        z,
        { y: -t * 180 / Math.PI },
        0.8
      )
    );
  }
  const ember = [box(1.9, 0.03, 0.62, 0, 0.03, 0)];
  const bark = [
    pole(v3(-0.7, 0.08, -0.1), v3(0.3, 0.14, 0.15), 0.07, 6),
    pole(v3(-0.1, 0.1, 0.2), v3(0.8, 0.08, -0.12), 0.06, 6)
  ];
  return grouped2([stone, ember, bark]);
}
function createSmokeHoleGeometry() {
  return grouped2([
    [
      pole(v3(-0.24, -0.05, 0), v3(-0.24, 0.45, 0), 0.026, 4),
      pole(v3(0.24, -0.05, 0), v3(0.24, 0.45, 0), 0.026, 4)
    ]
  ]);
}
var STICK_GABLE = { width: 4.6, height: 3.6 };
function createStickGableGeometry(door) {
  const { width: W, height: H } = STICK_GABLE;
  const half = W / 2;
  const poles = [];
  const top = (x) => H * (1 - Math.abs(x) / half);
  const hole = { half: 0.2, bottom: H - 0.95, top: H - 0.5 };
  const doorTop = 1.6;
  const rand = seededRandom(door ? 12 : 13);
  const upright = (x, y0, y1, i2) => {
    const r = 0.045 + rand() * 0.012;
    const g = createSaplingPoleGeometry(y1 - y0, r, i2 % 6);
    g.rotateZ(Math.PI / 2);
    g.translate(x, (y0 + y1) / 2, (rand() - 0.5) * 0.02);
    poles.push(g);
  };
  const cross = (xa, xb, y, r = 0.042) => {
    const g = createSaplingPoleGeometry(xb - xa, r, Math.round(y * 10) % 6);
    g.translate((xa + xb) / 2, y, 0.095);
    poles.push(g);
  };
  let i = 0;
  for (let x = -half + 0.14; x <= half - 0.14; x += 0.088, i++) {
    const y0 = door && Math.abs(x) < 0.5 ? doorTop : -0.15;
    const y1 = top(x) - 0.08;
    if (Math.abs(x) < hole.half) {
      if (hole.bottom - y0 > 0.15) upright(x, y0, hole.bottom, i);
      if (y1 - hole.top > 0.12) upright(x, hole.top, y1, i);
    } else if (y1 - y0 > 0.2) upright(x, y0, y1, i);
  }
  for (const y of [0.45, 1.45, 2.35]) {
    const w = half * (1 - y / H) - 0.12;
    if (door && y < doorTop) {
      cross(-w, -0.55, y);
      cross(0.55, w, y);
    } else cross(-w, w, y);
  }
  for (const y of [hole.bottom - 0.02, hole.top + 0.02]) {
    const w = Math.min(0.55, half * (1 - y / H) - 0.1);
    cross(-w, w, y, 0.036);
  }
  if (door) cross(-0.62, 0.62, doorTop + 0.02, 0.045);
  const back = new THREE7.Shape();
  back.moveTo(-half + 0.1, 0);
  back.lineTo(half - 0.1, 0);
  back.lineTo(0, H - 0.2);
  back.lineTo(-half + 0.1, 0);
  const backing = new THREE7.ShapeGeometry(back);
  backing.translate(0, 0, -0.07);
  meterUVs(backing);
  return grouped2([poles, [backing]]);
}
function createStickFenceGeometry() {
  const rand = seededRandom(3);
  const sticks = [];
  for (let x = -0.9; x <= 0.91; x += 0.3) {
    const h = 0.95 + rand() * 0.12;
    sticks.push(pole(v3(x, 0, 0), v3(x + (rand() - 0.5) * 0.04, h, 0), 0.028, 5));
    sticks.push(cyl(1e-3, 0.028, 0.09, x, h + 0.04, 0, void 0, 5));
  }
  for (const y of [0.32, 0.55, 0.78])
    for (const side of [-1, 1])
      sticks.push(pole(v3(-1, y, side * 0.03), v3(1, y + 0.03, -side * 0.03), 0.013, 4));
  return grouped2([sticks]);
}
function createStickCrossGeometry() {
  return grouped2([
    [
      pole(v3(0, 0, 0), v3(0.02, 0.95, 0), 0.03, 5),
      pole(v3(-0.28, 0.66, 0.02), v3(0.28, 0.68, 0.02), 0.025, 5)
    ],
    [cyl(0.04, 0.04, 0.07, 0, 0.67, 0.01, void 0, 6)]
  ]);
}
function createCairnGeometry() {
  const rand = seededRandom(17);
  const stones = [];
  const layers = [
    [5, 0.3, 0.1],
    [3, 0.18, 0.3],
    [1, 0, 0.48]
  ];
  for (const [n, r, y] of layers)
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + rand();
      const s = 0.24 - y * 0.15;
      stones.push(
        box(s, s * 0.75, s * 0.9, Math.cos(a) * r, y, Math.sin(a) * r, { y: rand() * 90 }, 0.8)
      );
    }
  return grouped2([stones]);
}
function createGraveMoundGeometry() {
  return grouped2([
    [blob(0.5, 0.22, 1, 0, 0, 0, true, 12)],
    [blob(0.42, 0.06, 0.8, 0, 0.18, 0, true, 10)]
  ]);
}
function createWellHoleGeometry() {
  const rand = seededRandom(21);
  const stone = [];
  for (let i = 0; i < 13; i++) {
    const a = i / 13 * Math.PI * 2;
    stone.push(
      box(
        0.34,
        0.22 + rand() * 0.08,
        0.26,
        Math.cos(a) * 0.72,
        0.12,
        Math.sin(a) * 0.72,
        { y: -a * 180 / Math.PI + 90 },
        0.8
      )
    );
  }
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + 0.3;
    stone.push(
      box(
        0.28,
        0.12,
        0.22,
        Math.cos(a) * 0.74,
        0.29,
        Math.sin(a) * 0.74,
        { y: -a * 180 / Math.PI + 90 },
        0.8
      )
    );
  }
  return grouped2([
    stone,
    [cyl(0.6, 0.6, 0.02, 0, 0.03, 0, void 0, 20)],
    [cyl(0.42, 0.42, 0.01, 0, 0.045, 0, void 0, 20)]
  ]);
}
function createRopeBucketGeometry() {
  const wood = [
    cyl(0.15, 0.12, 0.28, 0, 0.14, 0, void 0, 10),
    pole(v3(-0.14, 0.27, 0), v3(0.14, 0.27, 0), 8e-3, 3)
  ];
  const rope = [pole(v3(0, 0.28, 0), v3(0.35, 0.03, 0.15), 0.012, 4)];
  for (let i = 0; i < 4; i++) {
    const t = new THREE7.TorusGeometry(0.2 - i * 0.015, 0.014, 4, 16);
    t.rotateX(Math.PI / 2);
    t.translate(0.5, 0.015 + i * 0.026, 0.2);
    rope.push(t);
  }
  return grouped2([wood, rope]);
}
function createDugoutGeometry() {
  const hull = new THREE7.CylinderGeometry(0.3, 0.3, 3.2, 12, 8);
  hull.rotateX(Math.PI / 2);
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const end = 1 - Math.pow(Math.abs(z) / 1.6, 3) * 0.75;
    const y = p.getY(i);
    p.setXYZ(i, p.getX(i) * end, Math.min(y * 0.75, 0.12) * (0.6 + 0.4 * end), z);
  }
  hull.computeVertexNormals();
  meterUVs(hull, 0.6);
  hull.translate(0, 0.22, 0);
  const inside = new THREE7.PlaneGeometry(0.42, 2.5);
  inside.rotateX(-Math.PI / 2);
  inside.translate(0, 0.345, 0);
  const paddle = [
    pole(v3(0.05, 0.3, -0.9), v3(-0.05, 0.36, 0.5), 0.02, 4),
    box(0.14, 0.02, 0.45, -0.07, 0.37, 0.7)
  ];
  return grouped2([[hull, ...paddle], [inside]]);
}
function createFishTrapGeometry() {
  const parts = [];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    parts.push(
      pole(
        v3(0.45, 0.22 + Math.sin(a) * 0.2, Math.cos(a) * 0.2),
        v3(-0.45, 0.22 + Math.sin(a) * 0.04, Math.cos(a) * 0.04),
        8e-3,
        3
      )
    );
  }
  for (const x of [0.4, 0.1, -0.2]) {
    const r = 0.04 + (x + 0.45) / 0.9 * 0.16;
    const t = new THREE7.TorusGeometry(r, 0.01, 3, 14);
    t.rotateY(Math.PI / 2);
    t.translate(x, 0.22, 0);
    parts.push(t);
  }
  return grouped2([parts]);
}
function createPoleRackGeometry() {
  const posts = [-1.2, 1.2].map((x) => orient(createForkedPostGeometry(1.95), x, 0, 0));
  const bar = createSaplingPoleGeometry(2.8, 0.05, 4);
  bar.translate(0, 1.82, 0);
  return grouped2([[...posts, bar]]);
}
function createPeggedHideGeometry() {
  const shape = new THREE7.Shape();
  const pts = [
    [-0.7, -0.4],
    [-0.2, -0.55],
    [0.3, -0.5],
    [0.7, -0.3],
    [0.62, 0.2],
    [0.7, 0.45],
    [0.1, 0.55],
    [-0.4, 0.5],
    [-0.68, 0.15]
  ];
  pts.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
  const hide = new THREE7.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: false });
  hide.rotateX(-Math.PI / 2);
  hide.translate(0, 0.02, 0);
  meterUVs(hide);
  const pegs = pts.map(
    ([x, y]) => pole(v3(x * 1.05, 0, -y * 1.05), v3(x * 1.08, 0.14, -y * 1.08), 0.012, 4)
  );
  return grouped2([[hide], pegs]);
}
function createKnappingSpotGeometry() {
  const rand = seededRandom(41);
  const stone = [
    box(0.55, 0.22, 0.42, 0, 0.11, 0, { y: 12 }, 0.8),
    box(0.14, 0.1, 0.11, 0.42, 0.05, 0.22, { y: 30 }, 0.8)
  ];
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.3 + rand() * 0.35;
    stone.push(
      box(
        0.05 + rand() * 0.04,
        0.012,
        0.04 + rand() * 0.03,
        Math.cos(a) * r,
        6e-3,
        Math.sin(a) * r,
        {
          y: rand() * 180
        }
      )
    );
  }
  for (let i = 0; i < 3; i++)
    stone.push(box(0.09, 0.04, 0.06, -0.15 + i * 0.13, 0.24, 0.05, { y: 10 * i }));
  const bark = [];
  const seat = createSaplingPoleGeometry(0.9, 0.13, 3);
  seat.translate(0.1, 0.13, -0.55);
  bark.push(seat);
  const cord = [];
  for (const [x, lean] of [
    [-0.25, 25],
    [0.35, 32]
  ]) {
    const top = v3(x, 0.55, -0.52 + Math.sin(lean * Math.PI / 180) * 0.1);
    const foot = v3(x + 0.05, 0, -0.52 + 0.5);
    bark.push(pole(foot, top, 0.022, 5));
    stone.push(box(0.15, 0.06, 0.05, top.x + 0.05, top.y - 0.04, top.z, { z: 10 }));
    cord.push(cyl(0.03, 0.03, 0.05, top.x, top.y - 0.04, top.z, { z: 90 }, 6));
  }
  const hide = sheet(0.7, 0.5, 0, 0.012, 0.42, { x: -90 });
  return grouped2([stone, bark, [hide], cord]);
}
function createPolePileGeometry() {
  const poles = [];
  const rows = [5, 4, 3];
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const g = createSaplingPoleGeometry(3, 0.055, (i + row) % 6);
      g.translate(
        (i * 7 + row) % 3 * 0.05 - 0.05,
        0.055 + row * 0.095,
        (i - (n - 1) / 2) * 0.115
      );
      poles.push(g);
    }
  });
  return grouped2([poles]);
}

// vendor/city-builder/src/editor/pieces/townGeometry.ts
import * as THREE8 from "three";
var v4 = (x, y, z) => new THREE8.Vector3(x, y, z);
var JETTY = 0.5;
var JETTY_FLOOR = 0.24;
function createJettyGeometry() {
  const oak = [];
  for (let x = -0.8; x <= 0.81; x += 0.4)
    oak.push(beam(0.13, 0.15, JETTY + 0.4, x, 0.075, (JETTY - 0.4) / 2));
  oak.push(beam(2.02, 0.22, 0.2, 0, JETTY_FLOOR - 0.11 + 0.02, JETTY - 0.02));
  return grouped2([oak]);
}
function createJettyBracketGeometry() {
  const oak = [beam(0.16, 1, 0.12, 0, -0.5, 0.06)];
  const pts = [];
  for (let i = 0; i <= 4; i++) {
    const a = i / 4 * (Math.PI / 2);
    pts.push(v4(0, -0.85 + Math.sin(a) * 0.8, 0.08 + (1 - Math.cos(a)) * (JETTY - 0.12)));
  }
  for (let i = 0; i < 4; i++) oak.push(pole(pts[i], pts[i + 1], 0.06, 6));
  return grouped2([oak]);
}
var BRICK_WALL = { length: 2, height: 2.2, depth: 0.36 };
function createBrickWallGeometry(opening = "none") {
  const { length: L, height: H, depth: D } = BRICK_WALL;
  const brick = [];
  const stone = [];
  const door = [];
  const glass = [];
  const piece = (w, h, x, y) => brick.push(meterUVs(box(w, h, D, x, y, 0), 0.6));
  if (opening === "none") piece(L, H, 0, 0);
  else {
    const ow = opening === "door" ? 1 : 0.8;
    const y0 = opening === "door" ? -H / 2 : -0.15;
    const y1 = opening === "door" ? 0.75 : 0.65;
    const side = (L - ow) / 2;
    piece(side, H, -L / 2 + side / 2, 0);
    piece(side, H, L / 2 - side / 2, 0);
    if (y0 > -H / 2) piece(ow, y0 + H / 2, 0, (-H / 2 + y0) / 2);
    piece(ow, H / 2 - y1, 0, (y1 + H / 2) / 2);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (1 - (i + 0.5) / n);
      const block = box(
        0.16,
        0.12,
        D + 0.04,
        Math.cos(a) * (ow / 2 + 0.05),
        y1 + Math.sin(a) * 0.18,
        0,
        {
          z: a * 180 / Math.PI - 90
        }
      );
      (opening === "door" ? stone : brick).push(meterUVs(block, 0.6));
    }
    if (opening === "door") {
      for (const s of [-1, 1])
        stone.push(box(0.14, y1 - y0, D + 0.04, s * (ow / 2 + 0.07), (y0 + y1) / 2, 0));
      door.push(
        box(ow, y1 - y0 + 0.12, 0.06, 0, (y0 + y1) / 2 + 0.06, D / 2 - 0.1, void 0, 0.8)
      );
    } else {
      stone.push(box(ow + 0.2, 0.08, D + 0.08, 0, y0 - 0.04, 0.02));
      glass.push(box(ow, y1 - y0 + 0.14, 0.02, 0, (y0 + y1) / 2 + 0.07, 0.04));
      for (let i = 1; i < 4; i++) {
        door.push(
          box(0.02, y1 - y0 + 0.14, 0.02, -ow / 2 + i * ow / 4, (y0 + y1) / 2 + 0.07, 0.06)
        );
        door.push(box(ow, 0.02, 0.02, 0, y0 + i * (y1 - y0 + 0.14) / 4, 0.06));
      }
    }
  }
  return grouped2([brick, stone, door, glass]);
}
function createBrickHackGeometry() {
  const clay = [];
  for (let c = 0; c < 8; c++) {
    const cross = c % 2 === 1;
    const y = 0.12 + c * 0.09 + 0.04;
    if (cross) for (let x = -0.8; x <= 0.81; x += 0.16) clay.push(box(0.1, 0.07, 0.42, x, y, 0));
    else
      for (const z of [-0.14, 0.14])
        for (let x = -0.82; x <= 0.83; x += 0.24) clay.push(box(0.21, 0.07, 0.1, x, y, z));
  }
  const oak = [beam(1.9, 0.08, 0.5, 0, 0.04, 0)];
  const straw = [box(1.95, 0.08, 0.6, 0, 0.9, 0, { x: 0 })];
  return grouped2([clay, oak, straw]);
}
var CLAMP_KILN_TOP = 1.9;
function createBrickClampGeometry() {
  const dome = new THREE8.SphereGeometry(1.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, CLAMP_KILN_TOP / 1.2, 1);
  meterUVs(dome, 0.6);
  const ember = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + 0.4;
    ember.push(
      box(0.26, 0.2, 0.06, Math.sin(a) * 1.18, 0.12, Math.cos(a) * 1.18, {
        y: a * 180 / Math.PI
      })
    );
  }
  const earth = new THREE8.CylinderGeometry(1.35, 1.45, 0.16, 18);
  earth.translate(0, 0.08, 0);
  return grouped2([[dome], ember, [meterUVs(earth)]]);
}
function createClayPitGeometry() {
  const rim = [];
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    rim.push(
      box(0.5, 0.14, 0.3, Math.cos(a) * 1.15, 0.06, Math.sin(a) * 0.85, {
        y: -(a * 180) / Math.PI + 90
      })
    );
  }
  const pit = new THREE8.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  pit.scale(1.05, 1, 0.78);
  pit.translate(0, 0.02, 0);
  const clay = new THREE8.CircleGeometry(0.75, 16).rotateX(-Math.PI / 2);
  clay.scale(1, 1, 0.7);
  clay.translate(0.1, 0.03, 0.05);
  return grouped2([
    rim,
    [meterUVs(clay)],
    [meterUVs(pit)],
    [pole(v4(0.5, 0, 0.1), v4(0.8, 1, 0.25), 0.02, 5), box(0.2, 0.26, 0.02, 0.5, 0.1, 0.1)]
  ]);
}
var LIME_KILN_TOP = 2.4;
function createLimeKilnGeometry() {
  const tower = new THREE8.CylinderGeometry(1, 1.4, LIME_KILN_TOP, 18, 3, true);
  tower.translate(0, LIME_KILN_TOP / 2, 0);
  meterUVs(tower, 0.8);
  const top = new THREE8.RingGeometry(0.55, 1, 18).rotateX(-Math.PI / 2);
  top.translate(0, LIME_KILN_TOP, 0);
  const bank = new THREE8.SphereGeometry(1.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  bank.scale(1.1, (LIME_KILN_TOP - 0.15) / 1.9, 0.9);
  bank.translate(0, 0, -1.1);
  meterUVs(bank);
  const mouth = new THREE8.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2);
  mouth.translate(0, LIME_KILN_TOP - 0.05, 0);
  return grouped2([
    [meterUVs(tower, 0.8), meterUVs(top, 0.8), box(1, 0.18, 0.5, 0, 1, 1.25, void 0, 0.8)],
    [bank],
    [box(0.62, 0.7, 0.04, 0, 0.42, 1.36), mouth],
    [box(0.8, 0.9, 0.04, 0, 0.48, 1.34)]
  ]);
}
var GLASS_FURNACE_TOP = 4.7;
function createGlassFurnaceGeometry() {
  const hive = new THREE8.SphereGeometry(1.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  hive.scale(1, 1.35, 1);
  meterUVs(hive, 0.6);
  const base = meterUVs(new THREE8.CylinderGeometry(1.1, 1.15, 0.5, 16), 0.6).translate(0, 0.25, 0);
  hive.translate(0, 0.45, 0);
  const flue = meterUVs(
    box(0.5, GLASS_FURNACE_TOP - 1.6, 0.5, 0, 1.6 + (GLASS_FURNACE_TOP - 1.6) / 2, -0.2),
    0.6
  );
  const ember = [];
  for (const [x, y] of [
    [-0.45, 0.95],
    [0, 1.15],
    [0.45, 0.95]
  ]) {
    const r = 1.05 * Math.sqrt(1 - ((y - 0.45) / 1.35) ** 2);
    const z = Math.sqrt(Math.max(0, r * r - x * x)) + 0.02;
    const hole = new THREE8.CircleGeometry(0.14, 10);
    hole.rotateY(Math.atan2(x, z));
    ember.push(hole.translate(x, y, z));
  }
  const stone = [box(0.9, 0.85, 0.5, 1.6, 0.42, 0.7, void 0, 0.8)];
  const iron = [
    pole(v4(1.3, 0.86, 0.6), v4(2, 0.92, 0.95), 0.012, 4),
    pole(v4(1.2, 0, 1.2), v4(1.25, 1.3, 1.25), 0.012, 4)
  ];
  return grouped2([[hive, base, flue], ember, stone, iron]);
}
function createGlassRackGeometry() {
  const oak = [];
  for (const x of [-0.68, 0.68])
    for (const z of [-0.18, 0.18]) oak.push(beam(0.05, 1.5, 0.05, x, 0.75, z));
  for (const y of [0.4, 0.85, 1.3]) oak.push(beam(1.42, 0.03, 0.42, 0, y, 0));
  const glass = [];
  for (const y of [0.42, 0.87, 1.32])
    for (let x = -0.55; x <= 0.56; x += 0.18) {
      const h = 0.12 + (Math.round(x * 100) + Math.round(y * 10)) % 3 * 0.04;
      const bottle = new THREE8.CylinderGeometry(0.03, 0.05, h, 7);
      bottle.translate(x, y + h / 2 + 0.015, (Math.round(x * 10) % 2 * 2 - 1) * 0.07);
      glass.push(bottle);
    }
  for (let i = 0; i < 5; i++)
    glass.push(box(0.4, 0.3, 8e-3, 0.6, 0.15, 0.32 + i * 0.012, { x: -12 }));
  return grouped2([oak, glass]);
}
function createLouvreGeometry() {
  const oak = [];
  for (const x of [-0.35, 0.35])
    for (const z of [-0.35, 0.35]) oak.push(beam(0.07, 0.75, 0.07, x, 0.37, z));
  for (let y = 0.15; y < 0.7; y += 0.14)
    for (const [w, d, x, z] of [
      [0.72, 0.03, 0, 0.36],
      [0.72, 0.03, 0, -0.36],
      [0.03, 0.72, 0.36, 0],
      [0.03, 0.72, -0.36, 0]
    ])
      oak.push(box(w, 0.04, d, x, y, z, { x: w > 0.5 ? 25 : 0, z: w > 0.5 ? 0 : 25 }));
  const cap = new THREE8.ConeGeometry(0.62, 0.42, 4, 1);
  cap.rotateY(Math.PI / 4);
  cap.translate(0, 0.96, 0);
  meterUVs(cap, 0.9);
  return grouped2([oak, [cap], [box(0.66, 0.66, 0.66, 0, 0.42, 0)]]);
}
function createHangingSignGeometry() {
  return grouped2([
    [beam(0.08, 0.08, 1, 0, 0, 0.5), pole(v4(0, -0.45, 0.02), v4(0, -0.04, 0.6), 0.025, 4)],
    [
      pole(v4(0, 0, 0.75), v4(0, -0.18, 0.75), 8e-3, 3),
      pole(v4(0, 0, 0.35), v4(0, -0.18, 0.35), 8e-3, 3)
    ],
    [box(0.05, 0.42, 0.6, 0, -0.39, 0.55), box(0.06, 0.24, 0.3, 0, -0.38, 0.55)]
  ]);
}
function createBalconyGeometry() {
  const oak = [];
  const sawn = [box(2.1, 0.06, 0.82, 0, 0.03, 0.41, void 0, 0.6)];
  for (const x of [-0.9, 0.9]) {
    oak.push(beam(0.12, 0.12, 0.85, x, -0.06, 0.42));
    oak.push(pole(v4(x, -0.75, 0.04), v4(x, -0.1, 0.7), 0.05, 5));
  }
  oak.push(beam(2.1, 0.07, 0.08, 0, 0.98, 0.78));
  oak.push(beam(0.08, 0.07, 0.8, -1.03, 0.98, 0.4), beam(0.08, 0.07, 0.8, 1.03, 0.98, 0.4));
  for (let x = -0.95; x <= 0.96; x += 0.15) sawn.push(box(0.045, 0.9, 0.045, x, 0.5, 0.78));
  for (const z of [0.2, 0.5])
    for (const x of [-1.03, 1.03]) sawn.push(box(0.045, 0.9, 0.045, x, 0.5, z));
  return grouped2([oak, sawn]);
}
function createStageGeometry() {
  const oak = [];
  const sawn = [box(6, 0.08, 3.5, 0, 1, 0, void 0, 0.6)];
  for (const x of [-2.9, -1, 1, 2.9])
    for (const z of [-1.65, 0, 1.65]) oak.push(beam(0.16, 1, 0.16, x, 0.5, z));
  oak.push(beam(6.1, 0.18, 0.12, 0, 0.9, 1.75));
  for (const x of [-2.9, 2.9]) oak.push(beam(0.16, 3.3, 0.16, x, 2.6, -1.6));
  oak.push(beam(6.1, 0.18, 0.16, 0, 4.2, -1.6));
  for (const x of [-2.9, 2.9]) oak.push(beam(0.14, 2.6, 0.14, x, 2.3, 0.4));
  oak.push(beam(6.1, 0.16, 0.14, 0, 3.6, 0.4));
  for (let i = 0; i < 4; i++) sawn.push(box(1, 0.08, 0.3, 3.5, 0.2 + i * 0.25, 1.4 - i * 0.3));
  const red = [
    box(0.9, 2.9, 0.05, -2.3, 2.5, 0.35),
    box(0.9, 2.9, 0.05, 2.3, 2.5, 0.35),
    box(6, 0.4, 0.05, 0, 3.4, 0.36)
  ];
  const blue = [box(5.6, 3, 0.04, 0, 2.55, -1.62)];
  const tile = [box(6.6, 0.08, 2.6, 0, 4.45, -0.65, { x: 12 }, 0.9)];
  return grouped2([oak, sawn, red, tile, blue]);
}
function createBenchTiersGeometry() {
  const oak = [];
  const sawn = [];
  for (let t = 0; t < 3; t++) {
    const z = 0.8 - t * 0.8;
    const y = 0.45 + t * 0.45;
    sawn.push(box(4, 0.06, 0.38, 0, y, z, void 0, 0.6));
    sawn.push(box(4, 0.06, 0.4, 0, y - 0.4, z - 0.38, void 0, 0.6));
    for (const x of [-1.9, 0, 1.9]) oak.push(beam(0.1, y, 0.1, x, y / 2, z));
  }
  return grouped2([oak, sawn]);
}
function createBellcoteGeometry() {
  const oak = [
    beam(0.1, 1.1, 0.1, -0.3, 0.55, 0),
    beam(0.1, 1.1, 0.1, 0.3, 0.55, 0),
    beam(0.8, 0.1, 0.12, 0, 1.08, 0)
  ];
  const tile = [
    box(0.95, 0.05, 0.5, 0, 1.33, 0.18, { x: 35 }, 0.9),
    box(0.95, 0.05, 0.5, 0, 1.33, -0.18, { x: -35 }, 0.9)
  ];
  const bell = new THREE8.CylinderGeometry(0.1, 0.2, 0.3, 12, 1, true);
  bell.translate(0, 0.86, 0);
  return grouped2([oak, tile, [bell, box(0.04, 0.12, 0.04, 0, 0.95, 0)]]);
}
function createStationerBenchGeometry() {
  const oak = [beam(1.6, 0.06, 0.6, 0, 0.82, 0)];
  for (const x of [-0.72, 0.72])
    for (const z of [-0.24, 0.24]) oak.push(beam(0.06, 0.8, 0.06, x, 0.4, z));
  oak.push(
    beam(0.08, 0.6, 0.3, -0.6, 1.15, 0),
    beam(0.08, 0.6, 0.3, -0.2, 1.15, 0),
    beam(0.44, 0.08, 0.3, -0.4, 1.42, 0)
  );
  oak.push(beam(0.34, 0.06, 0.26, -0.4, 1.08, 0));
  const iron = [
    pole(v4(-0.4, 1.1, 0), v4(-0.4, 1.55, 0), 0.025, 6),
    pole(v4(-0.55, 1.5, 0), v4(-0.25, 1.5, 0), 0.012, 4)
  ];
  const dark = [0.2, 0.32, 0.44].map(
    (x) => new THREE8.CylinderGeometry(0.035, 0.04, 0.07, 8).translate(x, 0.885, 0.12)
  );
  const natural = [
    new THREE8.CylinderGeometry(0.05, 0.05, 0.12, 8).translate(0.62, 0.91, -0.1)
  ];
  for (let i = 0; i < 6; i++)
    natural.push(
      pole(
        v4(0.62, 0.95, -0.1),
        v4(0.6 + i % 3 * 0.02 - 0.02, 1.2, -0.12 + i % 2 * 0.04),
        4e-3,
        3
      )
    );
  const red = [
    box(0.24, 0.05, 0.17, 0.35, 0.88, -0.15),
    box(0.22, 0.05, 0.16, 0.36, 0.93, -0.16, { y: 8 }),
    box(0.2, 0.08, 0.15, -0.4, 1.16, 0)
  ];
  return grouped2([oak, iron, dark, natural, red]);
}
function createBrewCopperGeometry() {
  const brick = meterUVs(new THREE8.CylinderGeometry(0.7, 0.75, 0.95, 14), 0.6).translate(
    0,
    0.475,
    0
  );
  const copper = [
    new THREE8.CylinderGeometry(0.58, 0.5, 0.4, 16, 1, true).translate(0, 1.1, 0),
    new THREE8.CylinderGeometry(0.6, 0.6, 0.04, 16).translate(0, 1.32, 0)
  ];
  return grouped2([
    [brick],
    copper,
    [box(0.32, 0.26, 0.04, 0, 0.25, 0.73)],
    [pole(v4(0.2, 1.3, 0.1), v4(0.5, 1.95, 0.3), 0.02, 4), box(0.12, 0.25, 0.03, 0.18, 1.25, 0.1)]
  ]);
}
var COLUMN_HEIGHT = 2.6;
function createColumnGeometry() {
  return grouped2([
    [
      meterUVs(box(0.5, 0.18, 0.5, 0, 0.09, 0), 0.8),
      meterUVs(
        new THREE8.CylinderGeometry(0.17, 0.2, COLUMN_HEIGHT - 0.38, 12).translate(
          0,
          0.18 + (COLUMN_HEIGHT - 0.38) / 2,
          0
        ),
        0.8
      ),
      meterUVs(box(0.46, 0.2, 0.46, 0, COLUMN_HEIGHT - 0.1, 0), 0.8)
    ]
  ]);
}
function createStoneGableGeometry(width, height, eave) {
  const s = new THREE8.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, eave);
  s.lineTo(0, height);
  s.lineTo(-width / 2, eave);
  s.lineTo(-width / 2, 0);
  const g = new THREE8.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false });
  g.translate(0, 0, -0.25);
  return grouped2([[meterUVs(g, 0.8)]]);
}
function createCandleFrameGeometry() {
  const oak = [
    beam(0.08, 1.8, 0.08, 0, 0.9, 0),
    beam(1.2, 0.05, 0.05, 0, 1.75, 0),
    beam(0.05, 0.05, 1.2, 0, 1.72, 0)
  ];
  const wax = [];
  const cord = [];
  for (const [ax, az] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ])
    for (let i = 1; i <= 4; i++) {
      const x = ax * i * 0.13;
      const z = az * i * 0.13;
      cord.push(pole(v4(x, 1.7, z), v4(x, 1.45, z), 4e-3, 3));
      wax.push(new THREE8.CylinderGeometry(0.015, 0.022, 0.3, 6).translate(x, 1.28, z));
    }
  return grouped2([oak, wax, cord]);
}
function createArmourStandGeometry() {
  const oak = [
    beam(0.07, 1.5, 0.07, 0, 0.75, 0),
    beam(0.6, 0.06, 0.06, 0, 1.35, 0),
    beam(0.4, 0.05, 0.4, 0, 0.03, 0)
  ];
  const torso = new THREE8.CylinderGeometry(0.2, 0.24, 0.65, 10, 1, true);
  torso.translate(0, 1.1, 0);
  const helm = new THREE8.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 1.6);
  helm.translate(0, 1.55, 0);
  const iron = [torso, helm, box(0.5, 0.12, 0.3, 0, 1.35, 0)];
  const leather = [
    new THREE8.CylinderGeometry(0.28, 0.28, 0.04, 14).rotateX(Math.PI / 2 - 0.25).translate(0.35, 0.32, 0.22)
  ];
  return grouped2([oak, iron, leather]);
}
function createJarShelfGeometry() {
  const oak = [];
  for (const x of [-0.68, 0.68]) oak.push(beam(0.05, 1.7, 0.3, x, 0.85, 0));
  for (const y of [0.3, 0.75, 1.2, 1.65]) oak.push(beam(1.4, 0.03, 0.3, 0, y, 0));
  const clay = [];
  const glass = [];
  for (const y of [0.32, 0.77, 1.22])
    for (let x = -0.55; x <= 0.56; x += 0.16) {
      const big = (Math.round(x * 100) + Math.round(y * 10)) % 2 === 0;
      const jar = new THREE8.CylinderGeometry(
        big ? 0.06 : 0.04,
        big ? 0.07 : 0.04,
        big ? 0.2 : 0.16,
        8
      );
      jar.translate(x, y + (big ? 0.115 : 0.095), 0);
      (big ? clay : glass).push(jar);
    }
  const herb = [];
  for (let x = -0.5; x <= 0.51; x += 0.25)
    herb.push(blob(0.06, 0.14, 0.06, x, 1.48, 0.12, false, 6));
  return grouped2([oak, clay, glass, herb]);
}
function createShrineGeometry() {
  const stone = [
    meterUVs(box(1.6, 0.25, 1.2, 0, 0.125, 0), 0.8),
    meterUVs(box(1, 0.2, 0.6, 0, 0.35, 0.05), 0.8)
  ];
  const dressed = [
    meterUVs(box(0.4, 1, 0.35, 0, 0.95, -0.1), 0.8),
    box(0.22, 0.55, 0.16, 0, 1.73, -0.08),
    blob(0.1, 0.12, 0.1, 0, 2.08, -0.08, false, 8)
  ];
  const oak = [
    beam(0.1, 2.2, 0.1, -0.6, 1.35, -0.3),
    beam(0.1, 2.2, 0.1, 0.6, 1.35, -0.3),
    beam(1.4, 0.1, 0.12, 0, 2.42, -0.3)
  ];
  const tile = [
    box(1.7, 0.05, 0.9, 0, 2.65, 0, { x: 30 }, 0.9),
    box(1.7, 0.05, 0.9, 0, 2.65, -0.6, { x: -30 }, 0.9)
  ];
  const wax = [new THREE8.CylinderGeometry(0.15, 0.08, 0.08, 10).translate(0, 0.49, 0.2)];
  for (const x of [-0.35, 0.35])
    wax.push(new THREE8.CylinderGeometry(0.02, 0.02, 0.1, 6).translate(x, 0.5, 0.2));
  return grouped2([stone, oak, tile, dressed, wax]);
}
function createTowerCapGeometry(width, height) {
  const cap = new THREE8.ConeGeometry(width * 0.72, height, 4, 1);
  cap.rotateY(Math.PI / 4);
  cap.translate(0, height / 2, 0);
  meterUVs(cap, 0.9);
  return grouped2([
    [cap],
    [
      pole(v4(0, height - 0.1, 0), v4(0, height + 0.6, 0), 0.03, 5),
      blob(0.07, 0.07, 0.07, 0, height + 0.62, 0, false, 6)
    ]
  ]);
}
function createParapetGeometry() {
  const stone = [meterUVs(box(2, 0.5, 0.45, 0, 0.25, 0), 0.8)];
  for (const x of [-0.75, 0.25]) stone.push(meterUVs(box(0.5, 0.55, 0.45, x, 0.775, 0), 0.8));
  return grouped2([stone]);
}
function createStairTurretGeometry(height = 8) {
  const shaft = meterUVs(new THREE8.CylinderGeometry(0.9, 0.95, height, 14), 0.8).translate(
    0,
    height / 2,
    0
  );
  const cap = meterUVs(new THREE8.ConeGeometry(1.15, 1.8, 14), 0.9).translate(0, height + 0.9, 0);
  const dark = [];
  for (let y = 1.5; y < height - 0.5; y += 2) dark.push(box(0.1, 0.6, 0.04, 0, y, 0.95));
  return grouped2([[shaft], [cap], dark]);
}
function createCountingTableGeometry() {
  const oak = [];
  for (const x of [-0.7, 0.7])
    for (const z of [-0.3, 0.3]) oak.push(beam(0.06, 0.78, 0.06, x, 0.39, z));
  const blue = [box(1.6, 0.05, 0.75, 0, 0.8, 0), box(1.6, 0.25, 0.02, 0, 0.7, 0.38)];
  const iron = [
    pole(v4(0, 0.83, 0), v4(0, 1.2, 0), 0.012, 4),
    pole(v4(-0.25, 1.18, 0), v4(0.25, 1.18, 0), 8e-3, 3),
    box(0.4, 0.28, 0.3, 0.75, 0.14, -0.6)
  ];
  const gold = [];
  for (const [x, z, n] of [
    [-0.45, 0.1, 4],
    [-0.35, -0.15, 6],
    [0.4, 0.12, 3]
  ])
    for (let i = 0; i < n; i++)
      gold.push(
        new THREE8.CylinderGeometry(0.03, 0.03, 0.012, 8).translate(x, 0.835 + i * 0.013, z)
      );
  for (const s of [-1, 1])
    gold.push(new THREE8.CylinderGeometry(0.07, 0.04, 0.02, 10).translate(s * 0.25, 1, 0));
  const natural = [box(0.32, 0.04, 0.24, 0.45, 0.845, -0.15, { y: 12 })];
  return grouped2([oak, blue, iron, gold, natural]);
}
function createVaultRoofGeometry(length, span) {
  const g = new THREE8.CylinderGeometry(
    span / 2 + 0.3,
    span / 2 + 0.3,
    length + 0.4,
    16,
    1,
    false,
    -Math.PI / 2,
    Math.PI
  );
  g.rotateZ(Math.PI / 2);
  g.scale(1, 0.55, 1);
  return grouped2([[meterUVs(g, 0.8)]]);
}
function createTrainingDummyGeometry() {
  return grouped2([
    [beam(0.08, 1.8, 0.08, 0, 0.9, 0), beam(0.9, 0.06, 0.06, 0, 1.35, 0)],
    [blob(0.22, 0.32, 0.18, 0, 1.2, 0, false, 8), blob(0.13, 0.15, 0.13, 0, 1.62, 0, false, 8)],
    [
      new THREE8.CylinderGeometry(0.22, 0.22, 0.04, 12).rotateX(Math.PI / 2).translate(0.42, 1.25, 0.08)
    ]
  ]);
}
function createWeaponRackGeometry() {
  const oak = [beam(1.5, 0.08, 0.3, 0, 0.3, 0), beam(1.5, 0.06, 0.12, 0, 1.25, -0.09)];
  for (const x of [-0.7, 0.7]) oak.push(beam(0.07, 1.35, 0.07, x, 0.67, -0.1));
  const iron = [];
  for (let x = -0.55; x <= 0.56; x += 0.22) {
    oak.push(pole(v4(x, 0.05, 0), v4(x, 2, -0.08), 0.018, 4));
    iron.push(new THREE8.ConeGeometry(0.03, 0.2, 4).translate(x, 2.1, -0.085));
  }
  return grouped2([oak, iron]);
}
function createStocksGeometry() {
  const oak = [
    beam(0.12, 1, 0.12, -0.6, 0.5, 0),
    beam(0.12, 1, 0.12, 0.6, 0.5, 0),
    beam(1.3, 0.3, 0.08, 0, 0.55, 0),
    beam(1.3, 0.06, 0.3, 0, 0.35, -0.45)
  ];
  const dark = [-0.35, 0, 0.35].map(
    (x) => new THREE8.CircleGeometry(0.07, 10).translate(x, 0.55, 0.045)
  );
  return grouped2([
    oak,
    [box(0.06, 0.32, 0.1, 0.62, 0.55, 0), box(0.06, 0.32, 0.1, -0.62, 0.55, 0)],
    dark
  ]);
}
var CURTAIN_HEIGHT = 4.2;
function createCurtainWallGeometry() {
  const stone = [
    meterUVs(box(4, CURTAIN_HEIGHT, 1.4, 0, CURTAIN_HEIGHT / 2, 0), 0.8),
    meterUVs(box(4, 0.55, 0.4, 0, CURTAIN_HEIGHT + 0.27, 0.5), 0.8)
  ];
  for (const x of [-1.75, -0.75, 0.25, 1.25])
    stone.push(meterUVs(box(0.5, 0.55, 0.4, x + 0.25, CURTAIN_HEIGHT + 0.82, 0.5), 0.8));
  stone.push(meterUVs(box(4.02, 0.6, 1.7, 0, 0.3, 0), 0.8));
  return grouped2([stone]);
}
function createGatehouseGeometry() {
  const stone = [];
  const H = 7;
  for (const s of [-1, 1]) {
    stone.push(meterUVs(box(3, H, 4.6, s * 3, H / 2, 0), 0.8));
    for (const [x, z] of [
      [-1.1, 2.1],
      [0.1, 2.1],
      [1.1, 2.1],
      [1.25, 0.9],
      [1.25, -0.3],
      [1.25, -1.5]
    ])
      stone.push(meterUVs(box(0.55, 0.6, 0.45, s * 3 + x, H + 0.3, z), 0.8));
  }
  const SPRING = 3.2;
  const R = 1.5;
  stone.push(meterUVs(box(3, H - SPRING, 4.6, 0, (H + SPRING) / 2, 0), 0.8));
  const crown = new THREE8.CylinderGeometry(R, R, 4.62, 16, 1, false, -Math.PI / 2, Math.PI);
  crown.rotateX(-Math.PI / 2);
  crown.translate(0, SPRING, 0);
  const dark = [box(3, SPRING, 4.62, 0, SPRING / 2, 0), crown];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (1 - (i + 0.5) / n);
    const x = Math.cos(a) * (R + 0.15);
    const y = SPRING + Math.sin(a) * (R + 0.15);
    stone.push(meterUVs(box(0.35, 0.3, 4.66, x, y, 0, { z: a * 180 / Math.PI - 90 }), 0.8));
  }
  const iron = [];
  for (let x = -1.3; x <= 1.31; x += 0.26) iron.push(box(0.05, 1.8, 0.05, x, SPRING + 0.4, 2.33));
  for (let y = SPRING - 0.4; y < SPRING + 1.3; y += 0.3)
    iron.push(box(2.8, 0.05, 0.05, 0, y, 2.33));
  const oak = [
    box(1.4, 3, 0.1, -0.75, 1.5, -2, { y: -60 }),
    box(1.4, 3, 0.1, 0.75, 1.5, -2, { y: 60 })
  ];
  return grouped2([stone, iron, dark, oak]);
}
function createClockTurretGeometry() {
  const oak = [];
  for (const x of [-0.55, 0.55])
    for (const z of [-0.55, 0.55]) oak.push(beam(0.1, 1.5, 0.1, x, 0.75, z));
  const lime = [box(1.1, 1.3, 1.1, 0, 0.75, 0)];
  const gold = [];
  const dark = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2;
    const face = new THREE8.CircleGeometry(0.4, 16);
    face.translate(0, 0, 0.56);
    face.rotateY(a);
    face.translate(0, 0.85, 0);
    gold.push(face);
    const hand = box(0.03, 0.3, 0.01, 0, 0.12, 0.57);
    hand.rotateZ(0.6);
    hand.rotateY(a);
    hand.translate(0, 0.85, 0);
    dark.push(hand);
  }
  const spire = new THREE8.ConeGeometry(0.9, 1.6, 4);
  spire.rotateY(Math.PI / 4);
  spire.translate(0, 2.3, 0);
  return grouped2([
    oak,
    lime,
    [meterUVs(spire, 0.9)],
    gold,
    [...dark, pole(v4(0, 3, 0), v4(0, 3.6, 0), 0.03, 4)]
  ]);
}

// vendor/city-builder/src/editor/pieces/castleGeometry.ts
import * as THREE9 from "three";
var WALL_THICKNESS = 2.4;
var WALL_SECTION = 4;
var WALL_COURSE = 1;
var PLINTH_HEIGHT2 = 1;
var BATTER = 0.45;
var CASTLE_STOREY = 3.5;
var ROUND_RADIUS = 4;
var SQUARE_SIDE = 6;
var PARAPET_HEIGHT = 2.05;
var BREAST = 1;
var PARAPET_T = 0.6;
var GATE_WIDTH = 4.4;
var GATE_DEPTH = 6;
var GATE_PASSAGE_HEIGHT = 5;
var MASONRY_REPEAT = 4;
var SLATE_REPEAT = 1.6;
var HALF_T = WALL_THICKNESS / 2;
function variantOffset(variant = 0) {
  const v5 = (variant % 6 + 6) % 6;
  return [v5 * 1.37, v5 % 4];
}
function masonUVs(g, variant = 0, repeat = MASONRY_REPEAT) {
  const [du, dv] = variantOffset(variant);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    const [a, b] = ax >= ay && ax >= az ? [pos.getZ(i), pos.getY(i)] : ay >= az ? [pos.getX(i), pos.getZ(i)] : [pos.getX(i), pos.getY(i)];
    uv.setXY(i, (a + du) / repeat, (b + dv) / repeat);
  }
  uv.needsUpdate = true;
  return g;
}
function ringUVs(g, radius, variant = 0, repeat = MASONRY_REPEAT) {
  const [du, dv] = variantOffset(variant);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (Math.abs(nor.getY(i)) > 0.8) {
      uv.setXY(i, (x + du) / repeat, (z + dv) / repeat);
      continue;
    }
    const angle = Math.atan2(x, z);
    uv.setXY(i, (angle * radius + du) / repeat, (y + dv) / repeat);
  }
  uv.needsUpdate = true;
  return g;
}
function blk(w, h, d, x = 0, y = 0, z = 0, yawDeg = 0) {
  const g = new THREE9.BoxGeometry(w, h, d);
  if (yawDeg) g.rotateY(THREE9.MathUtils.degToRad(yawDeg));
  g.translate(x, y, z);
  return g;
}
function prism(shape, depth, curveSegments = 12) {
  const g = new THREE9.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments });
  g.translate(0, 0, -depth / 2);
  return g;
}
function arrowLoop(x, y, z, height = 0.9) {
  return [blk(0.09, height, 0.04, x, y, z), blk(0.34, 0.07, 0.04, x, y + height * 0.12, z)];
}
function aroundY(parts, yawDeg) {
  const m = new THREE9.Matrix4().makeRotationY(THREE9.MathUtils.degToRad(yawDeg));
  return parts.map((p) => p.applyMatrix4(m));
}
function createWallCourseGeometry(variant = 0, length = WALL_SECTION) {
  return grouped2([
    [masonUVs(blk(length, WALL_COURSE, WALL_THICKNESS, 0, WALL_COURSE / 2, 0), variant)]
  ]);
}
function createWallPlinthGeometry(variant = 0, length = WALL_SECTION) {
  const s = new THREE9.Shape();
  s.moveTo(-HALF_T - 0.12, 0);
  s.lineTo(HALF_T + BATTER, 0);
  s.lineTo(HALF_T, PLINTH_HEIGHT2 - 0.12);
  s.lineTo(-HALF_T, PLINTH_HEIGHT2 - 0.12);
  s.lineTo(-HALF_T, PLINTH_HEIGHT2 - 0.3);
  s.lineTo(-HALF_T - 0.12, PLINTH_HEIGHT2 - 0.42);
  const body = prism(s, length);
  body.rotateY(-Math.PI / 2);
  const band = blk(length, 0.12, WALL_THICKNESS + 0.02, 0, PLINTH_HEIGHT2 - 0.06, 0);
  return grouped2([[masonUVs(body, variant)], [masonUVs(band, variant, 1.2)]]);
}
var BATTERED_BATTER = 1.15;
function createBatteredPlinthGeometry(variant = 0, length = WALL_SECTION) {
  const s = new THREE9.Shape();
  s.moveTo(-HALF_T - 0.12, 0);
  s.lineTo(HALF_T + BATTERED_BATTER, 0);
  s.lineTo(HALF_T, PLINTH_HEIGHT2 - 0.12);
  s.lineTo(-HALF_T, PLINTH_HEIGHT2 - 0.12);
  s.lineTo(-HALF_T, PLINTH_HEIGHT2 - 0.3);
  s.lineTo(-HALF_T - 0.12, PLINTH_HEIGHT2 - 0.42);
  const body = prism(s, length);
  body.rotateY(-Math.PI / 2);
  const band = blk(length, 0.12, WALL_THICKNESS + 0.02, 0, PLINTH_HEIGHT2 - 0.06, 0);
  return grouped2([[masonUVs(body, variant)], [masonUVs(band, variant, 1.2)]]);
}
function createArrowslitCourseGeometry(variant = 0, length = WALL_SECTION) {
  const masonry = [blk(length, WALL_COURSE, WALL_THICKNESS, 0, WALL_COURSE / 2, 0)];
  const dark = [];
  const n = Math.max(1, Math.round(length / 2));
  const spacing = length / n;
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + spacing * (i + 0.5);
    dark.push(...arrowLoop(x, WALL_COURSE / 2, HALF_T, 0.6));
  }
  return grouped2([masonry.map((g) => masonUVs(g, variant)), dark]);
}
function createAshlarPlinthGeometry(variant = 0, length = WALL_SECTION) {
  const s = new THREE9.Shape();
  s.moveTo(-HALF_T - 0.12, 0);
  s.lineTo(HALF_T + BATTER, 0);
  s.lineTo(HALF_T + BATTER, PLINTH_HEIGHT2 * 0.4);
  s.lineTo(HALF_T, PLINTH_HEIGHT2 * 0.4);
  s.lineTo(HALF_T, PLINTH_HEIGHT2 - 0.12);
  s.lineTo(-HALF_T, PLINTH_HEIGHT2 - 0.12);
  s.lineTo(-HALF_T, 0);
  const body = prism(s, length);
  body.rotateY(-Math.PI / 2);
  const band = blk(length, 0.12, WALL_THICKNESS + 0.02, 0, PLINTH_HEIGHT2 - 0.06, 0);
  const band2 = blk(length, 0.08, WALL_THICKNESS + 0.04, 0, PLINTH_HEIGHT2 * 0.4, 0);
  return grouped2([
    [masonUVs(body, variant)],
    [masonUVs(band, variant, 1.2), masonUVs(band2, variant, 1.2)]
  ]);
}
function createAshlarCourseGeometry(variant = 0, length = WALL_SECTION) {
  const masonry = [blk(length, WALL_COURSE, WALL_THICKNESS, 0, WALL_COURSE / 2, 0)];
  const dressed = [];
  const n = Math.max(1, Math.round(length / 1.3));
  for (let i = 1; i < n; i++) {
    const x = -length / 2 + length / n * i;
    dressed.push(blk(0.04, WALL_COURSE - 0.06, 0.03, x, WALL_COURSE / 2, HALF_T + 0.015));
  }
  return grouped2([
    masonry.map((g) => masonUVs(g, variant)),
    dressed.map((g) => masonUVs(g, variant, 1.2))
  ]);
}
function createRampartGeometry(variant = 0, length = WALL_SECTION) {
  const masonry = [];
  const dressed = [];
  const dark = [];
  const zOut = HALF_T - PARAPET_T / 2;
  dressed.push(blk(length, 0.08, WALL_THICKNESS - PARAPET_T, 0, 0.04, -PARAPET_T / 2));
  dressed.push(blk(length, 0.16, 0.14, 0, -0.1, HALF_T + 0.05));
  masonry.push(blk(length, BREAST, PARAPET_T, 0, BREAST / 2, zOut));
  const n = Math.max(1, Math.round(length / 2));
  const spacing = length / n;
  const width = Math.min(1.3, spacing * 0.64);
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + spacing * (i + 0.5);
    masonry.push(blk(width, 0.95, PARAPET_T, x, BREAST + 0.475, zOut));
    dressed.push(blk(width + 0.08, 0.1, PARAPET_T + 0.08, x, BREAST + 1, zOut));
  }
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + spacing * i;
    const end = i === 0 || i === n;
    const w = (spacing - width) / (end ? 2 : 1);
    const cx = i === 0 ? x + w / 2 : i === n ? x - w / 2 : x;
    dressed.push(blk(w, 0.07, PARAPET_T + 0.06, cx, BREAST + 0.035, zOut));
  }
  return grouped2([
    masonry.map((g) => masonUVs(g, variant)),
    dressed.map((g) => masonUVs(g, variant, 1.2)),
    dark
  ]);
}
function createAshlarRampartGeometry(variant = 0, length = WALL_SECTION) {
  const masonry = [];
  const dressed = [];
  const dark = [];
  const zOut = HALF_T - PARAPET_T / 2;
  dressed.push(blk(length, 0.08, WALL_THICKNESS - PARAPET_T, 0, 0.04, -PARAPET_T / 2));
  dressed.push(blk(length, 0.16, 0.14, 0, -0.1, HALF_T + 0.05));
  masonry.push(blk(length, BREAST, PARAPET_T, 0, BREAST / 2, zOut));
  const n = Math.max(2, Math.round(length / 1.3));
  const spacing = length / n;
  const width = Math.min(1, spacing * 0.6);
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + spacing * (i + 0.5);
    masonry.push(blk(width, 0.95, PARAPET_T, x, BREAST + 0.475, zOut));
    dressed.push(blk(width + 0.1, 0.1, PARAPET_T + 0.1, x, BREAST + 1, zOut));
    dressed.push(blk(0.06, 0.95, PARAPET_T + 0.02, x - width / 2, BREAST + 0.475, zOut));
    dressed.push(blk(0.06, 0.95, PARAPET_T + 0.02, x + width / 2, BREAST + 0.475, zOut));
  }
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + spacing * i;
    const end = i === 0 || i === n;
    const w = (spacing - width) / (end ? 2 : 1);
    const cx = i === 0 ? x + w / 2 : i === n ? x - w / 2 : x;
    dressed.push(blk(w, 0.07, PARAPET_T + 0.06, cx, BREAST + 0.035, zOut));
  }
  return grouped2([
    masonry.map((g) => masonUVs(g, variant)),
    dressed.map((g) => masonUVs(g, variant, 1.2)),
    dark
  ]);
}
function createWallCopingGeometry(variant = 0, length = WALL_SECTION) {
  const s = new THREE9.Shape();
  const w = HALF_T + 0.1;
  s.moveTo(-w, 0);
  s.lineTo(w, 0);
  s.lineTo(w, 0.12);
  s.lineTo(0, 0.55);
  s.lineTo(-w, 0.12);
  const g = prism(s, length);
  g.rotateY(-Math.PI / 2);
  return grouped2([[masonUVs(g, variant, 1.2)]]);
}
var MACHICOLATION_OVERSAIL = 0.9;
function createMachicolatedGeometry(variant = 0, length = WALL_SECTION) {
  const masonry = [];
  const dressed = [];
  const dark = [];
  const OV = MACHICOLATION_OVERSAIL;
  const zFace = HALF_T;
  const breastInner = zFace + OV - PARAPET_T;
  const topZ = zFace + OV - PARAPET_T / 2;
  const corbelCZ = (zFace + breastInner) / 2;
  const corbelDepth = breastInner - zFace;
  dressed.push(blk(length, 0.08, WALL_THICKNESS + OV - PARAPET_T, 0, 0.04, (OV - PARAPET_T) / 2));
  dressed.push(blk(length, 0.16, 0.14, 0, -0.1, topZ + PARAPET_T / 2 + 0.05));
  const n = Math.max(1, Math.round(length / 2));
  const spacing = length / n;
  const width = Math.min(1.3, spacing * 0.64);
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + spacing * (i + 0.5);
    dressed.push(blk(width, 0.3, corbelDepth, x, -0.2, corbelCZ));
  }
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + spacing * i;
    const end = i === 0 || i === n;
    const w = (spacing - width) / (end ? 2 : 1);
    const cx = i === 0 ? x + w / 2 : i === n ? x - w / 2 : x;
    dark.push(blk(w, 0.1, corbelDepth - 0.1, cx, -0.22, corbelCZ));
  }
  masonry.push(blk(length, BREAST, PARAPET_T, 0, BREAST / 2, topZ));
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + spacing * (i + 0.5);
    masonry.push(blk(width, 0.95, PARAPET_T, x, BREAST + 0.475, topZ));
    dressed.push(blk(width + 0.08, 0.1, PARAPET_T + 0.08, x, BREAST + 1, topZ));
  }
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + spacing * i;
    const end = i === 0 || i === n;
    const w = (spacing - width) / (end ? 2 : 1);
    const cx = i === 0 ? x + w / 2 : i === n ? x - w / 2 : x;
    dressed.push(blk(w, 0.07, PARAPET_T + 0.06, cx, BREAST + 0.035, topZ));
  }
  return grouped2([
    masonry.map((g) => masonUVs(g, variant)),
    dressed.map((g) => masonUVs(g, variant, 1.2)),
    dark
  ]);
}
var HOARDING_OVERSAIL = 0.6;
var HOARDING_FLOOR_Y = 0.45;
var HOARDING_SIDE_H = 1.5;
var HOARDING_ROOF_RISE = 0.5;
function hoardingBracket(length, zFace, zOut, yFoot, yTop) {
  const s = new THREE9.Shape();
  s.moveTo(zFace, yFoot);
  s.lineTo(zFace, yTop);
  s.lineTo(zOut, yTop);
  const body = prism(s, length);
  body.rotateY(-Math.PI / 2);
  return body;
}
function createHoardingGeometry(variant = 0, length = WALL_SECTION) {
  const masonry = [];
  const dressed = [];
  const oak = [];
  const dark = [];
  const OV = HOARDING_OVERSAIL;
  const zFace = HALF_T;
  const zOut = zFace + OV;
  dressed.push(blk(length, 0.08, WALL_THICKNESS - 0.3, 0, 0.04, -0.15));
  masonry.push(blk(length, 0.3, 0.3, 0, 0.15, zFace - 0.15));
  oak.push(hoardingBracket(length, zFace, zOut, 0.1, HOARDING_FLOOR_Y));
  oak.push(blk(length, 0.1, OV + 0.05, 0, HOARDING_FLOOR_Y + 0.05, zFace + OV / 2));
  dark.push(blk(length - 0.2, 0.06, OV * 0.3, 0, HOARDING_FLOOR_Y, zOut - OV * 0.15));
  const eaveY = HOARDING_FLOOR_Y + 0.1 + HOARDING_SIDE_H;
  const n = Math.max(2, Math.round(length / 1.3));
  const spacing = length / n;
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + spacing * i;
    oak.push(blk(0.12, HOARDING_SIDE_H, 0.12, x, eaveY - HOARDING_SIDE_H / 2, zOut - 0.06));
  }
  oak.push(blk(length, HOARDING_SIDE_H, 0.05, 0, eaveY - HOARDING_SIDE_H / 2, zOut));
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + spacing * (i + 0.5);
    dark.push(blk(0.08, 0.45, 0.03, x, eaveY - HOARDING_SIDE_H * 0.4, zOut + 0.01));
  }
  const roofBackY = eaveY + HOARDING_ROOF_RISE + 0.15;
  const roofFrontY = eaveY + 0.15;
  const roof = leanToSlab(length + 0.2, roofBackY, roofFrontY, OV + 0.3, 0.1).translate(
    0,
    0,
    zFace - 0.15
  );
  const fascia = blk(length + 0.24, 0.16, 0.06, 0, roofFrontY - 0.02, zOut + 0.14);
  oak.push(roof, fascia);
  return grouped2([
    masonry.map((g) => masonUVs(g, variant)),
    dressed.map((g) => masonUVs(g, variant, 1.2)),
    oak,
    dark
  ]);
}
function createPosternGeometry(variant = 0) {
  const z = HALF_T;
  const dressed = archSurround(0, 0, z - 0.02, 1.6, 2.6, 0.28);
  const dark = archPanel(0, 0, z, 1.2, 2.45);
  const oak = archPanel(0, 0, z + 0.03, 1.1, 2.4);
  return grouped2([dressed.map((g) => masonUVs(g, variant, 1.2)), dark, oak]);
}
var STAIR_RUN = 1.25;
var STAIR_WIDTH = 1.3;
var STEPS = 4;
function createRampartStairGeometry(variant = 0) {
  const masonry = [];
  const dressed = [];
  const run = STAIR_RUN / STEPS;
  const rise = 1 / STEPS;
  for (let i = 0; i < STEPS; i++) {
    const x = -STAIR_RUN / 2 + run * (i + 0.5);
    const h = rise * (i + 1);
    masonry.push(blk(run, h - 0.05, STAIR_WIDTH, x, (h - 0.05) / 2, 0));
    dressed.push(blk(run + 0.03, 0.06, STAIR_WIDTH + 0.04, x, h - 0.03, 0));
  }
  return grouped2([
    masonry.map((g) => masonUVs(g, variant)),
    dressed.map((g) => masonUVs(g, variant, 1.2))
  ]);
}
function createStairFillGeometry(variant = 0) {
  return grouped2([[masonUVs(blk(STAIR_RUN, 1, STAIR_WIDTH, 0, 0.5, 0), variant)]]);
}
var RING_SEGMENTS = 40;
function createRoundPlinthGeometry(variant = 0) {
  const body = new THREE9.CylinderGeometry(
    ROUND_RADIUS,
    ROUND_RADIUS + BATTER,
    PLINTH_HEIGHT2 - 0.12,
    RING_SEGMENTS
  ).translate(0, (PLINTH_HEIGHT2 - 0.12) / 2, 0);
  const band = new THREE9.CylinderGeometry(
    ROUND_RADIUS + 0.03,
    ROUND_RADIUS + 0.03,
    0.12,
    RING_SEGMENTS
  ).translate(0, PLINTH_HEIGHT2 - 0.06, 0);
  return grouped2([
    [ringUVs(body, ROUND_RADIUS, variant)],
    [ringUVs(band, ROUND_RADIUS, variant, 1.2)]
  ]);
}
function createRoundStoreyGeometry(variant = 0, door = false) {
  const drum = new THREE9.CylinderGeometry(
    ROUND_RADIUS,
    ROUND_RADIUS,
    CASTLE_STOREY,
    RING_SEGMENTS,
    1,
    true
  ).translate(0, CASTLE_STOREY / 2, 0);
  const dressed = [];
  const dark = [];
  const oak = [];
  const turn = variant % 2 * 45;
  for (let k = 0; k < 4; k++) {
    const yaw = turn + k * 90;
    const y = CASTLE_STOREY * 0.48;
    if (door && k === 0) {
      dressed.push(...aroundY(archSurround(0, 0, ROUND_RADIUS - 0.02, 1.6, 2.6, 0.28), yaw));
      dark.push(...aroundY(archPanel(0, 0, ROUND_RADIUS, 1.2, 2.45), yaw));
      oak.push(...aroundY(archPanel(0, 0, ROUND_RADIUS + 0.03, 1.1, 2.4), yaw));
      continue;
    }
    dressed.push(...aroundY([blk(0.42, 1.25, 0.12, 0, y, ROUND_RADIUS - 0.03)], yaw));
    dark.push(...aroundY(arrowLoop(0, y, ROUND_RADIUS + 0.035, 1), yaw));
  }
  return grouped2([
    [ringUVs(drum, ROUND_RADIUS, variant)],
    dressed.map((g) => masonUVs(g, variant, 1.2)),
    dark,
    oak
  ]);
}
function createRoundBattlementsGeometry(variant = 0) {
  const inner = ROUND_RADIUS - PARAPET_T;
  const band = new THREE9.CylinderGeometry(
    ROUND_RADIUS + 0.12,
    ROUND_RADIUS + 0.12,
    0.18,
    RING_SEGMENTS
  ).translate(0, 0.09, 0);
  const breast = new THREE9.LatheGeometry(
    [
      new THREE9.Vector2(inner, 0),
      new THREE9.Vector2(ROUND_RADIUS, 0),
      new THREE9.Vector2(ROUND_RADIUS, BREAST),
      new THREE9.Vector2(inner, BREAST),
      new THREE9.Vector2(inner, 0)
    ],
    RING_SEGMENTS
  );
  const masonry = [breast];
  const dressed = [band];
  const dark = [];
  const n = 10;
  const mid = ROUND_RADIUS - PARAPET_T / 2;
  const width = 2 * Math.PI * mid / n * 0.62;
  for (let k = 0; k < n; k++) {
    const yaw = 360 / n * (k + 0.5);
    masonry.push(...aroundY([blk(width, 0.95, PARAPET_T, 0, BREAST + 0.475, mid)], yaw));
    dressed.push(...aroundY([blk(width + 0.08, 0.1, PARAPET_T + 0.08, 0, BREAST + 1, mid)], yaw));
  }
  dressed.push(new THREE9.CylinderGeometry(inner, inner, 0.08, RING_SEGMENTS).translate(0, 0.04, 0));
  const oak = [blk(1, 0.06, 1, 1.2, 0.11, -1)];
  return grouped2([
    masonry.map((g) => ringUVs(g, ROUND_RADIUS, variant)),
    dressed.map((g) => ringUVs(g, ROUND_RADIUS, variant, 1.2)),
    dark,
    oak
  ]);
}
function createRoundRoofGeometry(variant = 0) {
  const eaves = new THREE9.CylinderGeometry(
    ROUND_RADIUS + 0.15,
    ROUND_RADIUS,
    0.35,
    RING_SEGMENTS
  ).translate(0, 0.175, 0);
  const h = 7.5;
  const cone = new THREE9.ConeGeometry(ROUND_RADIUS + 0.55, h, RING_SEGMENTS, 6);
  const pos = cone.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + h / 2) / h;
    const flare = 1 + 0.08 * Math.max(0, 1 - t * 4);
    pos.setX(i, pos.getX(i) * flare);
    pos.setZ(i, pos.getZ(i) * flare);
  }
  cone.computeVertexNormals();
  cone.translate(0, h / 2 + 0.2, 0);
  const uv = cone.attributes.uv;
  const slant = Math.hypot(h, ROUND_RADIUS + 0.55);
  for (let i = 0; i < uv.count; i++)
    uv.setXY(
      i,
      uv.getX(i) * 2 * Math.PI * (ROUND_RADIUS + 0.55) / SLATE_REPEAT,
      uv.getY(i) * slant / SLATE_REPEAT
    );
  const top = h + 0.2;
  const iron = [
    new THREE9.CylinderGeometry(0.035, 0.05, 1.6, 6).translate(0, top + 0.6, 0),
    new THREE9.SphereGeometry(0.12, 8, 6).translate(0, top + 0.15, 0),
    blk(0.55, 0.28, 0.02, 0.3, top + 1.2, 0)
  ];
  return grouped2([[ringUVs(eaves, ROUND_RADIUS, variant, 1.2)], [cone], iron]);
}
var CORNER_RADIUS = 6;
var CORNER_LOOPS = 6;
function createCornerPlinthGeometry(variant = 0) {
  const body = new THREE9.CylinderGeometry(
    CORNER_RADIUS,
    CORNER_RADIUS + BATTER,
    PLINTH_HEIGHT2 - 0.12,
    RING_SEGMENTS
  ).translate(0, (PLINTH_HEIGHT2 - 0.12) / 2, 0);
  const band = new THREE9.CylinderGeometry(
    CORNER_RADIUS + 0.03,
    CORNER_RADIUS + 0.03,
    0.12,
    RING_SEGMENTS
  ).translate(0, PLINTH_HEIGHT2 - 0.06, 0);
  return grouped2([
    [ringUVs(body, CORNER_RADIUS, variant)],
    [ringUVs(band, CORNER_RADIUS, variant, 1.2)]
  ]);
}
function createCornerStoreyGeometry(variant = 0, door = false) {
  const drum = new THREE9.CylinderGeometry(
    CORNER_RADIUS,
    CORNER_RADIUS,
    CASTLE_STOREY,
    RING_SEGMENTS,
    1,
    true
  ).translate(0, CASTLE_STOREY / 2, 0);
  const dressed = [];
  const dark = [];
  const oak = [];
  const turn = variant % 2 * 30;
  for (let k = 0; k < CORNER_LOOPS; k++) {
    const yaw = turn + k * (360 / CORNER_LOOPS);
    const y = CASTLE_STOREY * 0.48;
    if (door && k === 0) {
      dressed.push(...aroundY(archSurround(0, 0, CORNER_RADIUS - 0.02, 1.6, 2.6, 0.28), yaw));
      dark.push(...aroundY(archPanel(0, 0, CORNER_RADIUS, 1.2, 2.45), yaw));
      oak.push(...aroundY(archPanel(0, 0, CORNER_RADIUS + 0.03, 1.1, 2.4), yaw));
      continue;
    }
    dressed.push(...aroundY([blk(0.42, 1.25, 0.12, 0, y, CORNER_RADIUS - 0.03)], yaw));
    dark.push(...aroundY(arrowLoop(0, y, CORNER_RADIUS + 0.035, 1), yaw));
  }
  return grouped2([
    [ringUVs(drum, CORNER_RADIUS, variant)],
    dressed.map((g) => masonUVs(g, variant, 1.2)),
    dark,
    oak
  ]);
}
function createCornerBattlementsGeometry(variant = 0) {
  const inner = CORNER_RADIUS - PARAPET_T;
  const band = new THREE9.CylinderGeometry(
    CORNER_RADIUS + 0.12,
    CORNER_RADIUS + 0.12,
    0.18,
    RING_SEGMENTS
  ).translate(0, 0.09, 0);
  const breast = new THREE9.LatheGeometry(
    [
      new THREE9.Vector2(inner, 0),
      new THREE9.Vector2(CORNER_RADIUS, 0),
      new THREE9.Vector2(CORNER_RADIUS, BREAST),
      new THREE9.Vector2(inner, BREAST),
      new THREE9.Vector2(inner, 0)
    ],
    RING_SEGMENTS
  );
  const masonry = [breast];
  const dressed = [band];
  const dark = [];
  const n = Math.round(10 * (CORNER_RADIUS / ROUND_RADIUS));
  const mid = CORNER_RADIUS - PARAPET_T / 2;
  const width = 2 * Math.PI * mid / n * 0.62;
  for (let k = 0; k < n; k++) {
    const yaw = 360 / n * (k + 0.5);
    masonry.push(...aroundY([blk(width, 0.95, PARAPET_T, 0, BREAST + 0.475, mid)], yaw));
    dressed.push(...aroundY([blk(width + 0.08, 0.1, PARAPET_T + 0.08, 0, BREAST + 1, mid)], yaw));
  }
  dressed.push(new THREE9.CylinderGeometry(inner, inner, 0.08, RING_SEGMENTS).translate(0, 0.04, 0));
  const oak = [blk(1, 0.06, 1, 1.2, 0.11, -1)];
  return grouped2([
    masonry.map((g) => ringUVs(g, CORNER_RADIUS, variant)),
    dressed.map((g) => ringUVs(g, CORNER_RADIUS, variant, 1.2)),
    dark,
    oak
  ]);
}
function createCornerRoofGeometry(variant = 0) {
  const eaves = new THREE9.CylinderGeometry(
    CORNER_RADIUS + 0.15,
    CORNER_RADIUS,
    0.35,
    RING_SEGMENTS
  ).translate(0, 0.175, 0);
  const h = 7.5 * (CORNER_RADIUS / ROUND_RADIUS);
  const cone = new THREE9.ConeGeometry(CORNER_RADIUS + 0.55, h, RING_SEGMENTS, 6);
  const pos = cone.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + h / 2) / h;
    const flare = 1 + 0.08 * Math.max(0, 1 - t * 4);
    pos.setX(i, pos.getX(i) * flare);
    pos.setZ(i, pos.getZ(i) * flare);
  }
  cone.computeVertexNormals();
  cone.translate(0, h / 2 + 0.2, 0);
  const uv = cone.attributes.uv;
  const slant = Math.hypot(h, CORNER_RADIUS + 0.55);
  for (let i = 0; i < uv.count; i++)
    uv.setXY(
      i,
      uv.getX(i) * 2 * Math.PI * (CORNER_RADIUS + 0.55) / SLATE_REPEAT,
      uv.getY(i) * slant / SLATE_REPEAT
    );
  const top = h + 0.2;
  const iron = [
    new THREE9.CylinderGeometry(0.035, 0.05, 1.6, 6).translate(0, top + 0.6, 0),
    new THREE9.SphereGeometry(0.12, 8, 6).translate(0, top + 0.15, 0),
    blk(0.55, 0.28, 0.02, 0.3, top + 1.2, 0)
  ];
  return grouped2([[ringUVs(eaves, CORNER_RADIUS, variant, 1.2)], [cone], iron]);
}
var DTOWER_RADIUS = ROUND_RADIUS;
var DTOWER_BACK_T = 0.3;
function createDTowerPlinthGeometry(variant = 0) {
  const h = PLINTH_HEIGHT2 - 0.12;
  const body = new THREE9.CylinderGeometry(
    DTOWER_RADIUS,
    DTOWER_RADIUS + BATTER,
    h,
    RING_SEGMENTS,
    1,
    true,
    -Math.PI / 2,
    Math.PI
  ).translate(0, h / 2, 0);
  const back = blk(2 * (DTOWER_RADIUS + BATTER), h, DTOWER_BACK_T, 0, h / 2, -DTOWER_BACK_T / 2);
  const band = new THREE9.CylinderGeometry(
    DTOWER_RADIUS + 0.03,
    DTOWER_RADIUS + 0.03,
    0.12,
    RING_SEGMENTS,
    1,
    true,
    -Math.PI / 2,
    Math.PI
  ).translate(0, PLINTH_HEIGHT2 - 0.06, 0);
  const backBand = blk(
    2 * DTOWER_RADIUS + 0.06,
    0.12,
    DTOWER_BACK_T,
    0,
    PLINTH_HEIGHT2 - 0.06,
    -DTOWER_BACK_T / 2
  );
  return grouped2([
    [ringUVs(body, DTOWER_RADIUS, variant), masonUVs(back, variant)],
    [ringUVs(band, DTOWER_RADIUS, variant, 1.2), masonUVs(backBand, variant, 1.2)]
  ]);
}
function createDTowerStoreyGeometry(variant = 0) {
  const drum = new THREE9.CylinderGeometry(
    DTOWER_RADIUS,
    DTOWER_RADIUS,
    CASTLE_STOREY,
    RING_SEGMENTS,
    1,
    true,
    -Math.PI / 2,
    Math.PI
  ).translate(0, CASTLE_STOREY / 2, 0);
  const back = blk(
    2 * DTOWER_RADIUS,
    CASTLE_STOREY,
    DTOWER_BACK_T,
    0,
    CASTLE_STOREY / 2,
    -DTOWER_BACK_T / 2
  );
  const dressed = [];
  const dark = [];
  const y = CASTLE_STOREY * 0.48;
  for (const yaw of [-45, 45]) {
    dressed.push(...aroundY([blk(0.42, 1.25, 0.12, 0, y, DTOWER_RADIUS - 0.03)], yaw));
    dark.push(...aroundY(arrowLoop(0, y, DTOWER_RADIUS + 0.035, 1), yaw));
  }
  return grouped2([
    [ringUVs(drum, DTOWER_RADIUS, variant), masonUVs(back, variant)],
    dressed.map((g) => masonUVs(g, variant, 1.2)),
    dark
  ]);
}
function createDTowerBattlementsGeometry(variant = 0) {
  const inner = DTOWER_RADIUS - PARAPET_T;
  const mid = DTOWER_RADIUS - PARAPET_T / 2;
  const breast = new THREE9.LatheGeometry(
    [
      new THREE9.Vector2(inner, 0),
      new THREE9.Vector2(DTOWER_RADIUS, 0),
      new THREE9.Vector2(DTOWER_RADIUS, BREAST),
      new THREE9.Vector2(inner, BREAST),
      new THREE9.Vector2(inner, 0)
    ],
    RING_SEGMENTS,
    -Math.PI / 2,
    Math.PI
  );
  const endCaps = [
    ...aroundY([blk(0.05, BREAST, PARAPET_T, 0, BREAST / 2, mid)], 90),
    ...aroundY([blk(0.05, BREAST, PARAPET_T, 0, BREAST / 2, mid)], -90)
  ];
  const band = new THREE9.CylinderGeometry(
    DTOWER_RADIUS + 0.12,
    DTOWER_RADIUS + 0.12,
    0.18,
    RING_SEGMENTS,
    1,
    true,
    -Math.PI / 2,
    Math.PI
  ).translate(0, 0.09, 0);
  const flags = new THREE9.CylinderGeometry(
    inner,
    inner,
    0.08,
    RING_SEGMENTS,
    1,
    true,
    -Math.PI / 2,
    Math.PI
  ).translate(0, 0.04, 0);
  const backParapet = blk(
    2 * DTOWER_RADIUS,
    BREAST + 0.3,
    DTOWER_BACK_T,
    0,
    (BREAST + 0.3) / 2,
    -DTOWER_BACK_T / 2
  );
  const backCoping = blk(
    2 * DTOWER_RADIUS + 0.06,
    0.1,
    DTOWER_BACK_T + 0.05,
    0,
    BREAST + 0.3 + 0.05,
    -DTOWER_BACK_T / 2
  );
  const masonryCurved = [breast];
  const dressedCurved = [band, flags];
  const dark = [];
  const n = 3;
  const spacing = Math.PI * mid / n;
  const width = Math.min(1.3, spacing * 0.62);
  for (let k = 0; k < n; k++) {
    const yaw = -60 + k * 60;
    masonryCurved.push(...aroundY([blk(width, 0.95, PARAPET_T, 0, BREAST + 0.475, mid)], yaw));
    dressedCurved.push(
      ...aroundY([blk(width + 0.08, 0.1, PARAPET_T + 0.08, 0, BREAST + 1, mid)], yaw)
    );
  }
  const oak = [blk(1, 0.06, 1, 1.2, 0.11, -1)];
  return grouped2([
    [
      ...masonryCurved.map((g) => ringUVs(g, DTOWER_RADIUS, variant)),
      ...endCaps.map((g) => masonUVs(g, variant)),
      masonUVs(backParapet, variant)
    ],
    [
      ...dressedCurved.map((g) => ringUVs(g, DTOWER_RADIUS, variant, 1.2)),
      masonUVs(backCoping, variant, 1.2)
    ],
    dark,
    oak
  ]);
}
function createDTowerRoofGeometry(variant = 0) {
  const eaves = new THREE9.CylinderGeometry(
    DTOWER_RADIUS + 0.15,
    DTOWER_RADIUS,
    0.35,
    RING_SEGMENTS,
    1,
    true,
    -Math.PI / 2,
    Math.PI
  ).translate(0, 0.175, 0);
  const eavesBack = blk(
    2 * (DTOWER_RADIUS + 0.15),
    0.35,
    DTOWER_BACK_T,
    0,
    0.175,
    -DTOWER_BACK_T / 2
  );
  const h = 7.5;
  const baseR = DTOWER_RADIUS + 0.55;
  const cone = new THREE9.ConeGeometry(baseR, h, RING_SEGMENTS, 6, false, -Math.PI / 2, Math.PI);
  cone.translate(0, h / 2 + 0.2, 0);
  const uv = cone.attributes.uv;
  const slant = Math.hypot(h, baseR);
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * Math.PI * baseR / SLATE_REPEAT, uv.getY(i) * slant / SLATE_REPEAT);
  const gableShape = new THREE9.Shape();
  gableShape.moveTo(-baseR, 0);
  gableShape.lineTo(baseR, 0);
  gableShape.lineTo(0, h);
  gableShape.lineTo(-baseR, 0);
  const gable = new THREE9.ExtrudeGeometry(gableShape, { depth: 0.05, bevelEnabled: false });
  const gableUV = gable.attributes.uv;
  for (let i = 0; i < gableUV.count; i++)
    gableUV.setXY(i, gableUV.getX(i) * 2 * baseR / SLATE_REPEAT, gableUV.getY(i) * h / SLATE_REPEAT);
  const gableBack = gable.clone();
  gableBack.scale(1, 1, -1);
  gableBack.computeVertexNormals();
  for (const g of [gable, gableBack]) {
    g.translate(0, 0.2, -DTOWER_BACK_T / 2 - 0.025);
  }
  gable.computeVertexNormals();
  const top = h + 0.2;
  const iron = [
    new THREE9.CylinderGeometry(0.035, 0.05, 1.3, 6).translate(0, top + 0.45, 0),
    new THREE9.SphereGeometry(0.1, 8, 6).translate(0, top + 0.1, 0)
  ];
  return grouped2([
    [ringUVs(eaves, DTOWER_RADIUS, variant, 1.2), masonUVs(eavesBack, variant, 1.2)],
    [cone, gable, gableBack],
    iron
  ]);
}
var OCTAGON_SEGMENTS = 8;
var OCTAGON_RADIUS = ROUND_RADIUS;
var OCTAGON_THETA_START = -Math.PI / OCTAGON_SEGMENTS;
var OCTAGON_APOTHEM = OCTAGON_RADIUS * Math.cos(Math.PI / OCTAGON_SEGMENTS);
var OCTAGON_FACE_WIDTH = 2 * OCTAGON_RADIUS * Math.sin(Math.PI / OCTAGON_SEGMENTS);
function createOctagonPlinthGeometry(variant = 0) {
  const body = new THREE9.CylinderGeometry(
    OCTAGON_RADIUS,
    OCTAGON_RADIUS + BATTER,
    PLINTH_HEIGHT2 - 0.12,
    OCTAGON_SEGMENTS,
    1,
    false,
    OCTAGON_THETA_START
  ).translate(0, (PLINTH_HEIGHT2 - 0.12) / 2, 0);
  const band = new THREE9.CylinderGeometry(
    OCTAGON_RADIUS + 0.03,
    OCTAGON_RADIUS + 0.03,
    0.12,
    OCTAGON_SEGMENTS,
    1,
    false,
    OCTAGON_THETA_START
  ).translate(0, PLINTH_HEIGHT2 - 0.06, 0);
  return grouped2([
    [ringUVs(body, OCTAGON_RADIUS, variant)],
    [ringUVs(band, OCTAGON_RADIUS, variant, 1.2)]
  ]);
}
function createOctagonStoreyGeometry(variant = 0, door = false) {
  const drum = new THREE9.CylinderGeometry(
    OCTAGON_RADIUS,
    OCTAGON_RADIUS,
    CASTLE_STOREY,
    OCTAGON_SEGMENTS,
    1,
    true,
    OCTAGON_THETA_START
  ).translate(0, CASTLE_STOREY / 2, 0);
  const dressed = [];
  const dark = [];
  const oak = [];
  const y = CASTLE_STOREY * 0.48;
  for (let k = 0; k < OCTAGON_SEGMENTS; k++) {
    const yaw = k * 45;
    if (door && k === 0) {
      dressed.push(...aroundY(archSurround(0, 0, OCTAGON_APOTHEM - 0.02, 1.6, 2.6, 0.28), yaw));
      dark.push(...aroundY(archPanel(0, 0, OCTAGON_APOTHEM, 1.2, 2.45), yaw));
      oak.push(...aroundY(archPanel(0, 0, OCTAGON_APOTHEM + 0.03, 1.1, 2.4), yaw));
      continue;
    }
    dressed.push(...aroundY([blk(0.42, 1.25, 0.12, 0, y, OCTAGON_APOTHEM - 0.03)], yaw));
    dark.push(...aroundY(arrowLoop(0, y, OCTAGON_APOTHEM + 0.035, 1), yaw));
  }
  return grouped2([
    [ringUVs(drum, OCTAGON_RADIUS, variant)],
    dressed.map((g) => masonUVs(g, variant, 1.2)),
    dark,
    oak
  ]);
}
function createOctagonBattlementsGeometry(variant = 0) {
  const band = new THREE9.CylinderGeometry(
    OCTAGON_RADIUS + 0.12,
    OCTAGON_RADIUS + 0.12,
    0.18,
    OCTAGON_SEGMENTS,
    1,
    false,
    OCTAGON_THETA_START
  ).translate(0, 0.09, 0);
  const inner = new THREE9.CylinderGeometry(
    OCTAGON_APOTHEM - PARAPET_T,
    OCTAGON_APOTHEM - PARAPET_T,
    0.08,
    OCTAGON_SEGMENTS,
    1,
    false,
    OCTAGON_THETA_START
  ).translate(0, 0.04, 0);
  const masonry = [];
  const dressed = [band, inner];
  const dark = [];
  const mid = OCTAGON_APOTHEM - PARAPET_T / 2;
  const width = Math.min(1.3, OCTAGON_FACE_WIDTH * 0.64);
  for (let k = 0; k < OCTAGON_SEGMENTS; k++) {
    const yaw = k * 45;
    masonry.push(...aroundY([blk(OCTAGON_FACE_WIDTH, BREAST, PARAPET_T, 0, BREAST / 2, mid)], yaw));
    dressed.push(...aroundY([blk(width, 0.95, PARAPET_T, 0, BREAST + 0.475, mid)], yaw));
    dressed.push(
      ...aroundY([blk(width + 0.08, 0.1, PARAPET_T + 0.08, 0, BREAST + 1, mid)], yaw)
    );
  }
  const oak = [blk(1, 0.06, 1, 1.2, 0.11, -1)];
  return grouped2([
    masonry.map((g) => ringUVs(g, OCTAGON_RADIUS, variant)),
    dressed.map((g) => ringUVs(g, OCTAGON_RADIUS, variant, 1.2)),
    dark,
    oak
  ]);
}
function createOctagonRoofGeometry(variant = 0) {
  const eaves = new THREE9.CylinderGeometry(
    OCTAGON_RADIUS + 0.15,
    OCTAGON_RADIUS,
    0.35,
    OCTAGON_SEGMENTS,
    1,
    false,
    OCTAGON_THETA_START
  ).translate(0, 0.175, 0);
  const h = 6.5;
  const baseR = OCTAGON_RADIUS + 0.35;
  const cone = new THREE9.ConeGeometry(baseR, h, OCTAGON_SEGMENTS, 1, false, OCTAGON_THETA_START);
  cone.translate(0, h / 2 + 0.2, 0);
  const uv = cone.attributes.uv;
  const slant = Math.hypot(h, baseR);
  for (let i = 0; i < uv.count; i++)
    uv.setXY(
      i,
      uv.getX(i) * 2 * Math.PI * baseR / SLATE_REPEAT,
      uv.getY(i) * slant / SLATE_REPEAT
    );
  const top = h + 0.2;
  const iron = [
    new THREE9.CylinderGeometry(0.035, 0.05, 1.4, 6).translate(0, top + 0.5, 0),
    new THREE9.SphereGeometry(0.11, 8, 6).translate(0, top + 0.12, 0)
  ];
  return grouped2([[ringUVs(eaves, OCTAGON_RADIUS, variant, 1.2)], [cone], iron]);
}
function createSquarePlinthGeometry(variant = 0, w = SQUARE_SIDE, d = w) {
  const hw = w / 2;
  const hd = d / 2;
  const top = PLINTH_HEIGHT2 - 0.12;
  const s = new THREE9.Shape();
  s.moveTo(-hw - BATTER, -hd - BATTER);
  s.lineTo(hw + BATTER, -hd - BATTER);
  s.lineTo(hw + BATTER, hd + BATTER);
  s.lineTo(-hw - BATTER, hd + BATTER);
  const body = new THREE9.ExtrudeGeometry(s, { depth: top, bevelEnabled: false }).toNonIndexed();
  body.rotateX(-Math.PI / 2);
  const pos = body.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < top - 1e-4) continue;
    pos.setX(i, Math.sign(pos.getX(i)) * hw);
    pos.setZ(i, Math.sign(pos.getZ(i)) * hd);
  }
  body.computeVertexNormals();
  const band = blk(w + 0.06, 0.12, d + 0.06, 0, PLINTH_HEIGHT2 - 0.06, 0);
  return grouped2([[masonUVs(body, variant)], [masonUVs(band, variant, 1.2)]]);
}
function createSquareStoreyGeometry(variant = 0, w = SQUARE_SIDE, d = w, face = "loops") {
  const hw = w / 2;
  const hd = d / 2;
  const masonry = [blk(w, CASTLE_STOREY, d, 0, CASTLE_STOREY / 2, 0)];
  const dressed = [];
  const dark = [];
  const oak = [];
  const q = 0.5;
  for (let k = 0; k < CASTLE_STOREY / q; k++) {
    const y = q * (k + 0.5);
    const long = k % 2 === 0;
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1]
    ]) {
      const wx = long ? 0.85 : 0.45;
      const wz = long ? 0.45 : 0.85;
      dressed.push(blk(wx, q - 0.03, 0.06, sx * (hw - wx / 2 + 0.03), y, sz * (hd + 0.01)));
      dressed.push(blk(0.06, q - 0.03, wz, sx * (hw + 0.01), y, sz * (hd - wz / 2 + 0.03)));
    }
  }
  const sides = [
    [0, w, hd],
    [90, d, hw],
    [180, w, hd],
    [270, d, hw]
  ];
  const yMid = CASTLE_STOREY * 0.48;
  for (const [yaw, len, half] of sides) {
    const m = [];
    const dr = [];
    const dk = [];
    const ok = [];
    const bays = Math.max(1, Math.round((len - 1.8) / 4));
    const span = len / bays;
    const wide = len >= 12;
    if (wide)
      for (let i = 1; i < bays; i++) {
        if (bays % 2 === 0 && i === bays / 2) continue;
        m.push(blk(1.4, CASTLE_STOREY, 0.35, -len / 2 + span * i, CASTLE_STOREY / 2, half + 0.175));
      }
    for (let i = 0; i < bays; i++) {
      const x = -len / 2 + span * (i + 0.5);
      const middle = Math.abs(x) < span / 2 - 1e-6;
      if (face === "door" && yaw === 0 && middle) {
        dr.push(...archSurround(x, 0, half, 2, 3.1, 0.3));
        dk.push(...archPanel(x, 0, half + 0.02, 1.6, 2.9));
        ok.push(...archPanel(x, 0, half + 0.05, 1.4, 2.75));
        continue;
      }
      if (face === "windows" && len >= 6) {
        dr.push(...archSurround(x, 1, half, 1.5, 2, 0.22));
        dk.push(...archPanel(x - 0.33, 1.15, half + 0.02, 0.5, 1.6));
        dk.push(...archPanel(x + 0.33, 1.15, half + 0.02, 0.5, 1.6));
        continue;
      }
      dr.push(blk(0.42, 1.25, 0.08, x, yMid, half + 0.01));
      dk.push(...arrowLoop(x, yMid, half + 0.06, 1));
    }
    masonry.push(...aroundY(m, yaw));
    dressed.push(...aroundY(dr, yaw));
    dark.push(...aroundY(dk, yaw));
    oak.push(...aroundY(ok, yaw));
  }
  return grouped2([
    masonry.map((g) => masonUVs(g, variant)),
    dressed.map((g) => masonUVs(g, variant, 1.2)),
    dark,
    oak
  ]);
}
function roundHead(w, h) {
  const r = w / 2;
  const s = new THREE9.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
}
function archPanel(x, y, z, w, h) {
  const g = new THREE9.ExtrudeGeometry(roundHead(w, h), {
    depth: 0.03,
    bevelEnabled: false,
    curveSegments: 8
  });
  g.translate(x, y, z - 0.03);
  return [g];
}
function archSurround(x, y, z, w, h, band) {
  const outer = roundHead(w + 2 * band, h + band);
  outer.holes.push(roundHead(w, h));
  const g = new THREE9.ExtrudeGeometry(outer, {
    depth: 0.12,
    bevelEnabled: false,
    curveSegments: 8
  });
  g.translate(x, y, z - 0.02);
  return [g, blk(w + 2 * band + 0.1, 0.12, 0.2, x, y - 0.06, z + 0.04)];
}
function createSquareBattlementsGeometry(variant = 0, w = SQUARE_SIDE, d = w) {
  const hw = w / 2;
  const hd = d / 2;
  const masonry = [];
  const dressed = [blk(w + 0.24, 0.18, d + 0.24, 0, 0.09, 0)];
  const dark = [];
  const sides = [
    [0, w, hd],
    [90, d, hw],
    [180, w, hd],
    [270, d, hw]
  ];
  for (const [yaw, len, half] of sides) {
    const mid = half - PARAPET_T / 2;
    const side = [blk(len - PARAPET_T, BREAST, PARAPET_T, -PARAPET_T / 2, BREAST / 2, mid)];
    const caps = [];
    side.push(blk(1.5, 0.95, PARAPET_T, len / 2 - 0.75, BREAST + 0.475, mid));
    caps.push(blk(1.58, 0.1, PARAPET_T + 0.08, len / 2 - 0.75, BREAST + 1, mid));
    const inner = len - 3;
    const n = Math.max(1, Math.round(inner / 2.2));
    const mw = Math.min(1.6, inner / n * 0.6);
    for (let i = 0; i < n; i++) {
      const x = -inner / 2 + inner / n * (i + 0.5);
      side.push(blk(mw, 0.95, PARAPET_T, x, BREAST + 0.475, mid));
      caps.push(blk(mw + 0.08, 0.1, PARAPET_T + 0.08, x, BREAST + 1, mid));
    }
    masonry.push(...aroundY(side, yaw));
    dressed.push(...aroundY(caps, yaw));
  }
  dressed.push(blk(w - 2 * PARAPET_T, 0.08, d - 2 * PARAPET_T, 0, 0.04, 0));
  const oak = [blk(1, 0.06, 1, hw - 2, 0.11, -(hd - 2))];
  return grouped2([
    masonry.map((g) => masonUVs(g, variant)),
    dressed.map((g) => masonUVs(g, variant, 1.2)),
    dark,
    oak
  ]);
}
function createSquareRoofGeometry(variant = 0, side = SQUARE_SIDE, h = 6, inset = 0) {
  const half = side / 2 - inset;
  const overhang = inset > 0 ? 0 : 0.5;
  const eaves = blk(
    2 * half + 0.3 * (inset > 0 ? 0 : 1),
    0.3,
    2 * half + 0.3 * (inset > 0 ? 0 : 1),
    0,
    0.15,
    0
  );
  const r = (half + overhang) * Math.SQRT2;
  const roof = new THREE9.ConeGeometry(r, h, 4, 1).rotateY(Math.PI / 4).translate(0, h / 2 + 0.25, 0).toNonIndexed();
  roof.computeVertexNormals();
  const pos = roof.attributes.position;
  const nor = roof.attributes.normal;
  const uv = roof.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i);
    const nz = nor.getZ(i);
    const along = Math.abs(nx) > Math.abs(nz) ? pos.getZ(i) : pos.getX(i);
    const up = (pos.getY(i) - 0.25) * (Math.hypot(h, r / Math.SQRT2) / h);
    uv.setXY(i, along / SLATE_REPEAT, up / SLATE_REPEAT);
  }
  const top = h + 0.25;
  const iron = [
    new THREE9.CylinderGeometry(0.035, 0.05, 1.4, 6).translate(0, top + 0.5, 0),
    new THREE9.SphereGeometry(0.11, 8, 6).translate(0, top + 0.1, 0)
  ];
  return grouped2([[masonUVs(eaves, variant, 1.2)], [roof], iron]);
}
var KEEP_SIDE = 16;
var KEEP_TURRET = 4.4;
var KEEP_TURRET_OFFSET = KEEP_SIDE / 2 - KEEP_TURRET / 2 + 1;
var FOREBUILDING_W = 9;
var FOREBUILDING_D = 5;
var ARCH_SPRING = 2.9;
var ARCH_HALF = 1.6;
function archOpening() {
  const p = new THREE9.Shape();
  p.moveTo(-ARCH_HALF, 0);
  p.lineTo(ARCH_HALF, 0);
  p.lineTo(ARCH_HALF, ARCH_SPRING);
  p.absarc(-0.35, ARCH_SPRING, ARCH_HALF + 0.35, 0, Math.PI * 0.42, false);
  p.absarc(0.35, ARCH_SPRING, ARCH_HALF + 0.35, Math.PI * 0.58, Math.PI, false);
  p.lineTo(-ARCH_HALF, 0);
  return p;
}
function createGateArchGeometry(variant = 0, width = GATE_WIDTH) {
  const face = new THREE9.Shape();
  face.moveTo(-width / 2, 0);
  face.lineTo(width / 2, 0);
  face.lineTo(width / 2, GATE_PASSAGE_HEIGHT);
  face.lineTo(-width / 2, GATE_PASSAGE_HEIGHT);
  face.lineTo(-width / 2, 0);
  face.holes.push(archOpening());
  const block = prism(face, GATE_DEPTH, 16);
  const dressed = [];
  const n = 13;
  for (const z of [GATE_DEPTH / 2, -GATE_DEPTH / 2]) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const left = t < 0.5;
      const cx = left ? 0.35 : -0.35;
      const a0 = left ? Math.PI : Math.PI * 0.42;
      const a1 = left ? Math.PI * 0.58 : 0;
      const u = left ? t * 2 : (t - 0.5) * 2;
      const a = a0 + (a1 - a0) * u;
      const r = ARCH_HALF + 0.35 + 0.22;
      dressed.push(
        new THREE9.BoxGeometry(0.4, 0.26, 0.1).rotateZ(a - Math.PI / 2).translate(cx + Math.cos(a) * r, ARCH_SPRING + Math.sin(a) * r, z)
      );
    }
    for (let y = 0.25; y < ARCH_SPRING; y += 0.5)
      for (const s of [-1, 1]) dressed.push(blk(0.32, 0.46, 0.1, s * (ARCH_HALF + 0.16), y, z));
  }
  const iron = [];
  const pz = GATE_DEPTH / 2 - 0.6;
  for (let x = -ARCH_HALF + 0.15; x <= ARCH_HALF - 0.1; x += 0.3)
    iron.push(blk(0.06, 2.4, 0.06, x, 1.6 + 1.2, pz));
  for (let y = 1.75; y < 4; y += 0.35) iron.push(blk(ARCH_HALF * 2, 0.05, 0.05, 0, y, pz));
  for (let x = -ARCH_HALF + 0.15; x <= ARCH_HALF - 0.1; x += 0.3)
    iron.push(new THREE9.ConeGeometry(0.04, 0.18, 4).rotateX(Math.PI).translate(x, 1.51, pz));
  const gates = prism(archOpening(), 0.14);
  gates.translate(0, 0, -GATE_DEPTH / 2 + 0.5);
  const oak = [gates];
  for (const y of [0.7, 1.9]) oak.push(blk(ARCH_HALF * 2, 0.12, 0.06, 0, y, -GATE_DEPTH / 2 + 0.6));
  const dark = [blk(ARCH_HALF * 2 - 0.02, 0.02, GATE_DEPTH - 1, 0, 0.01, 0.2)];
  return grouped2([
    [masonUVs(block, variant)],
    dressed.map((g) => masonUVs(g, variant, 1.2)),
    iron,
    oak,
    dark
  ]);
}
function createGateCourseGeometry(variant = 0) {
  return grouped2([[masonUVs(blk(GATE_WIDTH, 1, GATE_DEPTH, 0, 0.5, 0), variant)]]);
}
function createGateBattlementsGeometry(variant = 0) {
  const masonry = [];
  const dressed = [blk(GATE_WIDTH, 0.08, GATE_DEPTH - 2 * PARAPET_T, 0, 0.04, 0)];
  const dark = [];
  for (const s of [1, -1]) {
    const z = s * (GATE_DEPTH / 2 - PARAPET_T / 2);
    dressed.push(blk(GATE_WIDTH, 0.16, 0.14, 0, -0.1, s * (GATE_DEPTH / 2 + 0.05)));
    masonry.push(blk(GATE_WIDTH, BREAST, PARAPET_T, 0, BREAST / 2, z));
    for (const x of [-1.25, 1.25]) {
      masonry.push(blk(1.3, 0.95, PARAPET_T, x, BREAST + 0.475, z));
      dressed.push(blk(1.38, 0.1, PARAPET_T + 0.08, x, BREAST + 1, z));
    }
  }
  for (const z of [-1, 0, 1]) dark.push(blk(0.3, 0.02, 0.3, 0, 0.085, z));
  return grouped2([
    masonry.map((g) => masonUVs(g, variant)),
    dressed.map((g) => masonUVs(g, variant, 1.2)),
    dark
  ]);
}
var PIER_RADIUS = 1.75;
var PIER_TOP_SLOTS = 16;
function createPierPlinthGeometry(variant = 0) {
  const body = new THREE9.CylinderGeometry(
    PIER_RADIUS,
    PIER_RADIUS + 0.35,
    PLINTH_HEIGHT2 - 0.12,
    20
  ).translate(0, (PLINTH_HEIGHT2 - 0.12) / 2, 0);
  const band = new THREE9.CylinderGeometry(
    PIER_RADIUS + 0.03,
    PIER_RADIUS + 0.03,
    0.12,
    20
  ).translate(0, PLINTH_HEIGHT2 - 0.06, 0);
  return grouped2([
    [ringUVs(body, PIER_RADIUS, variant)],
    [ringUVs(band, PIER_RADIUS, variant, 1.2)]
  ]);
}
function createPierCourseGeometry(variant = 0) {
  const drum = new THREE9.CylinderGeometry(PIER_RADIUS, PIER_RADIUS, 1, 20, 1, true).translate(
    0,
    0.5,
    0
  );
  return grouped2([[ringUVs(drum, PIER_RADIUS, variant)]]);
}
function createPierTopGeometry(variant = 0, mask = 0) {
  const masonry = [];
  const dressed = [
    new THREE9.CylinderGeometry(PIER_RADIUS + 0.12, PIER_RADIUS + 0.12, 0.16, 20).translate(
      0,
      -0.1,
      0
    ),
    new THREE9.CylinderGeometry(PIER_RADIUS - 0.02, PIER_RADIUS - 0.02, 0.08, 20).translate(
      0,
      0.04,
      0
    )
  ];
  const dark = [];
  const mid = PIER_RADIUS - PARAPET_T / 2;
  const chord = 2 * Math.PI * mid / PIER_TOP_SLOTS * 1.08;
  for (let i = 0; i < PIER_TOP_SLOTS; i++) {
    if (mask & 1 << i) continue;
    const yaw = 90 + 360 / PIER_TOP_SLOTS * i;
    masonry.push(...aroundY([blk(chord, BREAST, PARAPET_T, 0, BREAST / 2, mid)], yaw));
    if (i % 2 === 0) {
      masonry.push(...aroundY([blk(chord * 1.3, 0.95, PARAPET_T, 0, BREAST + 0.475, mid)], yaw));
      dressed.push(
        ...aroundY([blk(chord * 1.3 + 0.08, 0.1, PARAPET_T + 0.08, 0, BREAST + 1, mid)], yaw)
      );
    }
  }
  return grouped2([
    masonry.map((g) => ringUVs(g, PIER_RADIUS, variant)),
    dressed.map((g) => ringUVs(g, PIER_RADIUS, variant, 1.2)),
    dark
  ]);
}
function createPierCapGeometry(variant = 0) {
  const cap = new THREE9.CylinderGeometry(PIER_RADIUS * 0.55, PIER_RADIUS + 0.1, 0.7, 20).translate(
    0,
    0.35,
    0
  );
  return grouped2([[ringUVs(cap, PIER_RADIUS, variant, 1.2)]]);
}
var RANGE_SECTION = WALL_SECTION;
var RANGE_DEPTH = 4;
var RANGE_WALL_T = 0.5;
function leanToPanel(g, backY, frontY, depth) {
  g.rotateX(Math.atan2(backY - frontY, depth));
  g.translate(0, (backY + frontY) / 2, depth / 2);
  return g;
}
function leanToSlab(width, backY, frontY, depth, thickness) {
  const slant = Math.hypot(backY - frontY, depth);
  return leanToPanel(new THREE9.BoxGeometry(width, thickness, slant), backY, frontY, depth);
}
function createRangeWallGeometry(variant = 0, door = false) {
  const z = RANGE_DEPTH - RANGE_WALL_T / 2;
  const masonry = [blk(RANGE_SECTION, CASTLE_STOREY, RANGE_WALL_T, 0, CASTLE_STOREY / 2, z)];
  const face = z + RANGE_WALL_T / 2;
  const dressed = [];
  const dark = [];
  const oak = [];
  if (door) {
    dressed.push(...archSurround(0, 0, face, 2, 3.1, 0.3));
    dark.push(...archPanel(0, 0, face + 0.02, 1.6, 2.9));
    oak.push(...archPanel(0, 0, face + 0.05, 1.4, 2.75));
  } else {
    const y = CASTLE_STOREY * 0.55;
    dressed.push(...archSurround(0, y, face, 1.4, 1.9, 0.2));
    dark.push(...archPanel(0, y + 0.08, face + 0.02, 0.9, 1.5));
  }
  return grouped2([
    masonry.map((g) => masonUVs(g, variant)),
    dressed.map((g) => masonUVs(g, variant, 1.2)),
    dark,
    oak
  ]);
}
function createRangeRoofGeometry(variant = 0, backHeight = 7) {
  const frontY = CASTLE_STOREY + 0.3;
  const slab = leanToSlab(RANGE_SECTION + 0.3, backHeight + 0.15, frontY, RANGE_DEPTH + 0.3, 0.18);
  const fascia = blk(RANGE_SECTION + 0.34, 0.22, 0.08, 0, frontY - 0.05, RANGE_DEPTH + 0.3);
  return grouped2([[masonUVs(fascia, variant, 1.2)], [masonUVs(slab, variant, 1.1)]]);
}
function createRangeGableRoofGeometry(variant = 0, eaveHeight = CASTLE_STOREY + 0.3, rise = 1.8) {
  const depth = RANGE_DEPTH + 0.3;
  const half = depth / 2;
  const ridgeY = eaveHeight + rise;
  const width = RANGE_SECTION + 0.3;
  const front = leanToSlab(width, eaveHeight, ridgeY, half, 0.18);
  const back = leanToSlab(width, ridgeY, eaveHeight, half, 0.18).translate(0, 0, half);
  const ridgeCap = blk(width + 0.1, 0.12, 0.3, 0, ridgeY + 0.03, half);
  const fasciaFront = blk(width + 0.04, 0.22, 0.08, 0, eaveHeight - 0.05, 0);
  const fasciaBack = blk(width + 0.04, 0.22, 0.08, 0, eaveHeight - 0.05, depth);
  return grouped2([
    [
      masonUVs(fasciaFront, variant, 1.2),
      masonUVs(fasciaBack, variant, 1.2),
      masonUVs(ridgeCap, variant, 1.2)
    ],
    [masonUVs(front, variant, 1.1), masonUVs(back, variant, 1.1)]
  ]);
}
var RANGE_CHIMNEY_OUT = RANGE_WALL_T / 2 + 0.22;
function createTimberRangeWallGeometry(variant = 0, door = false) {
  const opening = door ? { width: 1.1, height: 1.85, sill: 0 } : { width: 0.9, height: 0.8, sill: 1.15 };
  const p = timberWallParts(RANGE_SECTION, opening, door ? "door" : "window", variant);
  const dz = RANGE_DEPTH - TIMBER_DEPTH / 2;
  const place = (gs) => gs.map((g) => g.translate(0, TIMBER_WALL_HEIGHT / 2, dz));
  return grouped2([place(p.timber), place(p.daub), place(p.trim), place(p.iron)]);
}
function createTimberRangeRoofGeometry(variant = 0, backHeight = 7) {
  const frontY = TIMBER_WALL_HEIGHT + 0.25;
  const depth = RANGE_DEPTH + 0.25;
  const slant = Math.hypot(backHeight + 0.1 - frontY, depth);
  const panel = createShingleGeometry(slant, RANGE_SECTION + 0.25, variant);
  panel.rotateY(Math.PI / 2);
  const roof = leanToPanel(panel, backHeight + 0.1, frontY, depth);
  return grouped2([[roof]]);
}

// vendor/city-builder/src/editor/pieces/sawmillGeometry.ts
import * as THREE10 from "three";
function jitter2(seed, scale) {
  const s = Math.sin(seed * 78.233 + 4.1) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 2 * scale;
}
function hewn(sx, sy, sz, x, y, z, seed) {
  const g = grainUVs(
    new THREE10.BoxGeometry(sx, sy + jitter2(seed, 0.01), sz + jitter2(seed + 1, 0.01))
  );
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + seed * 0.37);
  g.rotateY(jitter2(seed + 2, 0.01));
  g.translate(x, y, z);
  return g.toNonIndexed();
}
var SAW_PIT_LENGTH = 4;
var SAW_PIT_WIDTH = 0.9;
var CURB_W = 0.26;
var CURB_H = 0.2;
var SAW_PIT_BEARER_TOP = CURB_H + 0.2;
function createSawPitGeometry() {
  const hl = SAW_PIT_LENGTH / 2;
  const hw = SAW_PIT_WIDTH / 2;
  const oak = [];
  for (const s of [-1, 1]) {
    oak.push(
      hewn(
        SAW_PIT_LENGTH + CURB_W * 2,
        CURB_H,
        CURB_W,
        0,
        CURB_H / 2,
        s * (hw + CURB_W / 2),
        s * 3
      )
    );
    oak.push(hewn(CURB_W, CURB_H, SAW_PIT_WIDTH, s * (hl + CURB_W / 2), CURB_H / 2, 0, s * 5 + 20));
  }
  for (const [i2, x] of [-1.15, 1.15].entries())
    oak.push(hewn(0.2, 0.2, SAW_PIT_WIDTH + CURB_W * 2 + 0.2, x, CURB_H + 0.1, 0, 40 + i2));
  const foot = -hl + 0.45;
  const top = -hl - 0.2;
  for (const z of [-0.2, 0.2])
    oak.push(rod(new THREE10.Vector3(foot, -0.6, z), new THREE10.Vector3(top, 0.95, z), 0.035, 6));
  for (let t = 0.45; t < 1; t += 0.17) {
    const x = foot + (top - foot) * t;
    const y = -0.6 + 1.55 * t;
    oak.push(rod(new THREE10.Vector3(x, y, -0.2), new THREE10.Vector3(x, y, 0.2), 0.022, 5));
  }
  const yTop = 0.052;
  const yFloor = 0.046;
  const inset = 0.14;
  const quad = (a, b, c, d) => {
    const g = new THREE10.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE10.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3)
    );
    g.setAttribute("uv", new THREE10.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    g.computeVertexNormals();
    return g;
  };
  const o = { x: hl, z: hw };
  const i = { x: hl - inset, z: hw - inset };
  const walls = [
    quad([-o.x, yTop, o.z], [o.x, yTop, o.z], [i.x, yFloor, i.z], [-i.x, yFloor, i.z]),
    quad([o.x, yTop, -o.z], [-o.x, yTop, -o.z], [-i.x, yFloor, -i.z], [i.x, yFloor, -i.z]),
    quad([o.x, yTop, o.z], [o.x, yTop, -o.z], [i.x, yFloor, -i.z], [i.x, yFloor, i.z]),
    quad([-o.x, yTop, -o.z], [-o.x, yTop, o.z], [-i.x, yFloor, i.z], [-i.x, yFloor, -i.z])
  ];
  const floor = quad(
    [-i.x, yFloor, i.z],
    [i.x, yFloor, i.z],
    [i.x, yFloor, -i.z],
    [-i.x, yFloor, -i.z]
  );
  return grouped([oak, walls, [floor]]);
}
var SAW_LOG_LENGTH = 3.6;
var CANT_W = 0.42;
var CANT_H = 0.4;
var SAW_LOG_CUT = 1.9;
function createSawLogGeometry() {
  const hl = SAW_LOG_LENGTH / 2;
  const kerf = 0.014;
  const cutEnd = -hl + SAW_LOG_CUT;
  const oak = [];
  for (const s of [-1, 1]) {
    const w = CANT_W / 2 - kerf / 2;
    oak.push(
      hewn(
        SAW_LOG_CUT,
        CANT_H,
        w,
        -hl + SAW_LOG_CUT / 2,
        CANT_H / 2,
        s * (kerf / 2 + w / 2),
        60 + s
      )
    );
  }
  oak.push(
    hewn(SAW_LOG_LENGTH - SAW_LOG_CUT, CANT_H, CANT_W, (cutEnd + hl) / 2, CANT_H / 2, 0, 63)
  );
  const bark = [];
  for (const y of [0.03, CANT_H - 0.03])
    for (const z of [-CANT_W / 2 + 0.03, CANT_W / 2 - 0.03]) {
      const g = createRusticLogGeometry(SAW_LOG_LENGTH - 0.04, 0.055, {
        seed: Math.round(Math.abs(y * 50 + z * 90)),
        nubs: false,
        bend: 0
      });
      g.translate(0, y, z);
      bark.push(g);
    }
  return grouped([oak, bark]);
}
var PIT_SAW_LENGTH = 2.3;
function createPitSawGeometry() {
  const h = PIT_SAW_LENGTH;
  const shape = new THREE10.Shape([
    new THREE10.Vector2(-0.08, 0.08),
    new THREE10.Vector2(0.06, 0.08),
    new THREE10.Vector2(0.16, h - 0.04),
    new THREE10.Vector2(-0.1, h - 0.04)
  ]);
  const blade = new THREE10.ExtrudeGeometry(shape, { depth: 6e-3, bevelEnabled: false });
  blade.translate(0, 0, -3e-3);
  const iron = [blade.toNonIndexed()];
  for (let y = 0.15; y < h - 0.1; y += 0.09) {
    const x = 0.06 + (y - 0.08) / (h - 0.12) * 0.1;
    const tooth = new THREE10.BoxGeometry(0.03, 0.03, 5e-3);
    tooth.rotateZ(Math.PI / 4);
    tooth.translate(x + 5e-3, y, 0);
    iron.push(tooth.toNonIndexed());
  }
  const wood = [];
  wood.push(rod(new THREE10.Vector3(0, h - 0.15, 0), new THREE10.Vector3(0, h + 0.3, 0), 0.045, 6));
  wood.push(
    rod(new THREE10.Vector3(0, h + 0.27, -0.38), new THREE10.Vector3(0, h + 0.27, 0.38), 0.04, 6)
  );
  wood.push(new THREE10.BoxGeometry(0.14, 0.12, 0.1).translate(-0.02, 0.06, 0).toNonIndexed());
  wood.push(
    rod(new THREE10.Vector3(-0.02, 0.04, -0.3), new THREE10.Vector3(-0.02, 0.04, 0.3), 0.028, 6)
  );
  return grouped([wood, iron]);
}
var TIMBER_POST_HEIGHT = 2.6;
var TIMBER_BEAM_LENGTH = 2;
var POST_T = 0.2;
function createTimberPostGeometry() {
  return hewn(POST_T, TIMBER_POST_HEIGHT, POST_T, 0, TIMBER_POST_HEIGHT / 2, 0, 81);
}
function createTimberBeamGeometry() {
  return hewn(TIMBER_BEAM_LENGTH, 0.22, 0.2, 0, 0, 0, 83);
}
function createKneeBraceGeometry(reach = 0.6) {
  const g = grainUVs(new THREE10.BoxGeometry(reach * Math.SQRT2, 0.12, 0.12));
  g.rotateZ(Math.PI / 4);
  g.translate(reach / 2, reach / 2, 0);
  return g.toNonIndexed();
}

// vendor/city-builder/src/editor/pieces/storehouseGeometry.ts
import * as THREE11 from "three";
var BOARD_WALL_HEIGHT = 2.2;
var FRAME = 0.16;
var BOARD_WALL_DEPTH = FRAME + 0.05;
var BOARD = 0.2;
var COURSE = 0.17;
var BOARD_T = 0.022;
function jitter3(seed, scale) {
  const s = Math.sin(seed * 51.77 + 9.3) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 2 * scale;
}
function stick(sx, sy, sz, x, y, z, seed = 0) {
  const g = grainUVs(new THREE11.BoxGeometry(sx, sy, sz));
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + seed * 0.29);
  g.translate(x, y, z);
  return g.toNonIndexed();
}
function boards(x0, x1, y0, y1, z, seed, holes = [], widthAt) {
  const out = [];
  let i = 0;
  for (let y = y0; y < y1 - 0.04; y += COURSE, i++) {
    const h = Math.min(BOARD, y1 - y);
    const top = y + h;
    let a = x0;
    let b = x1;
    if (widthAt) {
      const half = widthAt(top);
      a = Math.max(a, -half);
      b = Math.min(b, half);
    }
    const runs = [[a, b]];
    for (const hole of holes) {
      if (top <= hole.y0 || y >= hole.y1) continue;
      for (let r = runs.length - 1; r >= 0; r--) {
        const [ra, rb] = runs[r];
        if (rb <= hole.x0 || ra >= hole.x1) continue;
        runs.splice(r, 1, [ra, hole.x0], [hole.x1, rb]);
      }
    }
    for (const [ra, rb] of runs) {
      if (rb - ra < 0.05) continue;
      const g = grainUVs(new THREE11.BoxGeometry(rb - ra + 0.03, h, BOARD_T));
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++)
        uv.setXY(k, uv.getX(k) + (seed + i) * 0.41, uv.getY(k) + (seed + i) * 0.23);
      g.translate(0, h / 2, 0);
      g.rotateX(-0.11 + jitter3(seed + i, 0.015));
      g.translate((ra + rb) / 2, y, z + 0.012);
      out.push(g.toNonIndexed());
    }
  }
  return out;
}
var STORE_DOOR = { width: 1.6, height: 2 };
function boardWallParts(width, doors = false, seed = 0) {
  const h = BOARD_WALL_HEIGHT;
  const half = width / 2;
  const frame = [];
  const zFrame = -0.025;
  for (const s of [-1, 1])
    frame.push(stick(FRAME, h, FRAME, s * (half - FRAME / 2), 0, zFrame, seed + s));
  frame.push(stick(width, FRAME, FRAME, 0, h / 2 - FRAME / 2, zFrame, seed + 3));
  frame.push(stick(width, FRAME, FRAME, 0, -h / 2 + FRAME / 2, zFrame, seed + 4));
  const holes = [];
  const door = [];
  const iron = [];
  if (doors) {
    const w = STORE_DOOR.width / 2;
    const top = -h / 2 + STORE_DOOR.height;
    holes.push({ x0: -w, x1: w, y0: -h / 2 - 1, y1: top });
    for (const s of [-1, 1])
      frame.push(
        stick(
          0.14,
          STORE_DOOR.height,
          FRAME,
          s * (w + 0.07),
          -h / 2 + STORE_DOOR.height / 2,
          zFrame + 0.02,
          seed + 5 + s
        )
      );
    frame.push(
      stick(STORE_DOOR.width + 0.4, 0.16, FRAME + 0.06, 0, top + 0.08, zFrame + 0.03, seed + 8)
    );
    const zOut = FRAME / 2 + zFrame + 0.035;
    for (const s of [-1, 1]) {
      const lw = w - 0.01;
      const lh = STORE_DOOR.height - 0.04;
      const n = 4;
      const leaf = [];
      const hinges = [];
      for (let k = 0; k < n; k++)
        leaf.push(
          stick(lw / n - 6e-3, lh, 0.04, -s * (k + 0.5) * (lw / n), lh / 2, 0, seed + 20 + k)
        );
      for (const y of [0.3, lh - 0.3]) {
        leaf.push(stick(lw - 0.08, 0.12, 0.035, -s * lw / 2, y, -0.035, seed + 30));
        hinges.push(stick(lw * 0.6, 0.035, 8e-3, -s * lw * 0.3, y, 0.025));
      }
      const swing = new THREE11.Matrix4().makeRotationY(s * 165 * Math.PI / 180);
      const place = new THREE11.Matrix4().makeTranslation(s * w, -h / 2 + 0.02, zOut);
      for (const g of leaf) door.push(g.applyMatrix4(swing).applyMatrix4(place));
      for (const g of hinges) iron.push(g.applyMatrix4(swing).applyMatrix4(place));
    }
  } else {
    frame.push(stick(width - 2 * FRAME, 0.12, FRAME - 0.02, 0, 0.1, zFrame, seed + 9));
  }
  const clad = boards(-half, half, -h / 2, h / 2, FRAME / 2 + zFrame, seed, holes);
  return { frame, boards: clad, door, iron };
}
function boardWallCostGeometry(width, doors = false) {
  return grouped([boardWallParts(width, doors).boards]);
}
var BOARD_GABLE_EAVE = 0.22;
function boardGableHeight(width, pitchDeg = 30) {
  return BOARD_GABLE_EAVE + width / 2 * Math.tan(pitchDeg * Math.PI / 180);
}
var LOFT_DOOR = { width: 0.7, height: 0.85, sill: 0.12 };
function boardGableParts(width, loft = false, seed = 0, pitchDeg = 30) {
  const half = width / 2;
  const tan = Math.tan(pitchDeg * Math.PI / 180);
  const apex = BOARD_GABLE_EAVE + half * tan;
  const widthAt = (y) => y <= BOARD_GABLE_EAVE ? half : half - (y - BOARD_GABLE_EAVE) / tan;
  const zFrame = -0.025;
  const frame = [
    stick(FRAME, apex - 0.1, FRAME, 0, (apex - 0.1) / 2, zFrame, seed)
  ];
  const rake = Math.hypot(half, half * tan) - 0.04;
  for (const s of [-1, 1]) {
    const g = stick(rake, 0.2, 0.04, 0, 0, 0, seed + s);
    g.rotateZ(-s * Math.atan(tan));
    g.translate(
      s * half / 2,
      BOARD_GABLE_EAVE + half * tan / 2 - 0.1 / Math.cos(Math.atan(tan)) - 0.02,
      FRAME / 2 + zFrame + 0.06
    );
    frame.push(g);
  }
  const holes = [];
  const door = [];
  const iron = [];
  if (loft) {
    const w = LOFT_DOOR.width / 2;
    const y0 = LOFT_DOOR.sill;
    const y1 = y0 + LOFT_DOOR.height;
    holes.push({ x0: -w, x1: w, y0, y1 });
    for (const s of [-1, 1])
      frame.push(
        stick(
          0.12,
          LOFT_DOOR.height + 0.2,
          FRAME,
          s * (w + 0.06),
          (y0 + y1) / 2,
          zFrame + 0.02,
          seed + 3 + s
        )
      );
    for (const y of [y0 - 0.06, y1 + 0.06])
      frame.push(stick(LOFT_DOOR.width + 0.36, 0.12, FRAME + 0.04, 0, y, zFrame + 0.02, seed + 6));
    const lw = LOFT_DOOR.width;
    const lh = LOFT_DOOR.height - 0.04;
    const leaf = [];
    const hinges = [];
    for (let k = 0; k < 3; k++)
      leaf.push(stick(lw / 3 - 6e-3, lh, 0.04, -(k + 0.5) * (lw / 3), lh / 2, 0, seed + 10 + k));
    for (const y of [0.2, lh - 0.25]) {
      leaf.push(stick(lw - 0.08, 0.1, 0.03, -lw / 2, y, -0.03, seed + 14));
      hinges.push(stick(lw * 0.55, 0.03, 8e-3, -lw * 0.28, y, 0.025));
    }
    const swing = new THREE11.Matrix4().makeRotationY(100 * Math.PI / 180);
    const place = new THREE11.Matrix4().makeTranslation(w, y0 + 0.02, FRAME / 2 + zFrame + 0.04);
    for (const g of leaf) door.push(g.applyMatrix4(swing).applyMatrix4(place));
    for (const g of hinges) iron.push(g.applyMatrix4(swing).applyMatrix4(place));
  }
  const clad = boards(-half, half, 0, apex, FRAME / 2 + zFrame, seed + 50, holes, widthAt);
  return { frame, boards: clad, door, iron };
}
function boardGableCostGeometry(width, loft = false) {
  return grouped([boardGableParts(width, loft).boards]);
}
var BOARD_FLOOR_SIZE = 2;
var BOARD_FLOOR_THICKNESS = 0.045;
function createBoardFloorGeometry() {
  const parts = [];
  const n = 10;
  const w = BOARD_FLOOR_SIZE / n;
  for (let k = 0; k < n; k++)
    parts.push(
      stick(
        BOARD_FLOOR_SIZE - 4e-3,
        BOARD_FLOOR_THICKNESS + jitter3(k, 3e-3),
        w - 8e-3,
        0,
        -BOARD_FLOOR_THICKNESS / 2,
        -BOARD_FLOOR_SIZE / 2 + w * (k + 0.5),
        k * 3
      )
    );
  return grouped([parts]);
}
var STADDLE_HEIGHT = 0.62;
function createStaddleStoneGeometry() {
  const post = createStoneGeometry(0.26, 0.5, 0.26);
  const p = post.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + 0.25) / 0.5;
    const k = 1.15 - t * 0.45;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  post.computeVertexNormals();
  post.translate(0, 0.25, 0);
  const cap = new THREE11.CylinderGeometry(0.3, 0.27, 0.12, 12);
  cap.translate(0, STADDLE_HEIGHT - 0.06, 0);
  return grouped([[post, cap]]);
}
function createHoistTackleGeometry(drop = 1.6) {
  const wood = [];
  wood.push(stick(0.07, 0.22, 0.1, 0, -0.11, 0));
  const wheel2 = new THREE11.CylinderGeometry(0.08, 0.08, 0.04, 12);
  wheel2.rotateX(Math.PI / 2);
  wheel2.translate(0, -0.14, 0.07);
  wood.push(wheel2.toNonIndexed());
  const rope = [
    rod(new THREE11.Vector3(-0.07, -0.14, 0.07), new THREE11.Vector3(-0.07, -drop, 0.07), 0.012, 5),
    rod(new THREE11.Vector3(0.07, -0.14, 0.07), new THREE11.Vector3(0.09, -drop - 0.9, 0.12), 0.012, 5)
  ];
  const iron = [
    new THREE11.TorusGeometry(0.05, 0.012, 5, 10, Math.PI * 1.4).translate(-0.07, -drop - 0.05, 0.07).toNonIndexed()
  ];
  const sack = new THREE11.SphereGeometry(0.24, 10, 8);
  sack.scale(0.9, 1.25, 0.8);
  sack.translate(-0.07, -drop - 0.35, 0.07);
  const neck = new THREE11.CylinderGeometry(0.05, 0.11, 0.14, 8).translate(-0.07, -drop - 0.06, 0.07);
  return grouped([wood, rope, iron, [sack.toNonIndexed(), neck.toNonIndexed()]]);
}
function createCornerBoardGeometry() {
  const h = BOARD_WALL_HEIGHT;
  const out = 0.095;
  const len = out + 0.115;
  const mid = (out + 0.015 - 0.1) / 2;
  return grouped([[stick(len, h, 0.03, mid, 0, out, 7), stick(0.03, h, len, out, 0, mid, 8)]]);
}

// vendor/city-builder/src/editor/pieces/mineGeometry.ts
import * as THREE12 from "three";
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const f = (t) => t * t * (3 - 2 * t);
  const u = f(x - xi);
  const v5 = f(y - yi);
  const w = f(z - zi);
  let sum = 0;
  for (let dx = 0; dx <= 1; dx++)
    for (let dy = 0; dy <= 1; dy++)
      for (let dz = 0; dz <= 1; dz++)
        sum += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v5 : 1 - v5) * (dz ? w : 1 - w);
  return sum * 2 - 1;
}
var fbm = (x, y, z) => noise3(x, y, z) * 0.6 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.1;
var MINE_HILL = { width: 5.4, depth: 3.6, height: 2.7 };
var MINE_HILL_FACE = 0.9;
var PORTAL_CLEAR = { half: 1, height: 2.4 };
function createMineHillGeometry(adit = true) {
  const { width, depth, height } = MINE_HILL;
  const sphere = new THREE12.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = sphere.attributes.position;
  const n = new THREE12.Vector3();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * (width / 2);
    let y = p.getY(i) * height;
    let z = p.getZ(i) * (depth / 2);
    n.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    const bump = fbm(x * 0.9 + 3, y * 0.9, z * 0.9) * 0.32;
    x += n.x * bump;
    y += Math.max(0, n.y * bump);
    z += n.z * bump;
    if (z > MINE_HILL_FACE) {
      const inPortal = adit && Math.abs(x) < PORTAL_CLEAR.half && y < PORTAL_CLEAR.height;
      z = MINE_HILL_FACE + (inPortal ? 0 : fbm(x * 2.3, y * 2.3, 5) * 0.08);
    }
    p.setXYZ(i, x, Math.max(0, y), z);
  }
  sphere.computeVertexNormals();
  const uv = sphere.attributes.uv;
  for (let i = 0; i < p.count; i++)
    uv.setXY(i, (p.getX(i) + p.getZ(i) * 0.6) / 1.4, (p.getY(i) + p.getZ(i) * 0.4) / 1.4);
  const rock = sphere.toNonIndexed();
  const turfPos = [];
  const turfUv = [];
  const rp = rock.attributes.position;
  const ru = rock.attributes.uv;
  const crown = height * 0.62;
  for (let t = 0; t < rp.count; t += 3) {
    let keep = true;
    for (let k = 0; k < 3; k++)
      if (rp.getY(t + k) < crown || rp.getZ(t + k) > MINE_HILL_FACE - 0.15) keep = false;
    if (!keep) continue;
    for (let k = 0; k < 3; k++) {
      turfPos.push(rp.getX(t + k), rp.getY(t + k) + 0.03, rp.getZ(t + k));
      turfUv.push(ru.getX(t + k), ru.getY(t + k));
    }
  }
  const turf = new THREE12.BufferGeometry();
  turf.setAttribute("position", new THREE12.Float32BufferAttribute(turfPos, 3));
  turf.setAttribute("uv", new THREE12.Float32BufferAttribute(turfUv, 2));
  turf.computeVertexNormals();
  return grouped([[rock], [turf]]);
}
var ADIT = { width: 1.3, height: 1.95 };
function hewn2(sx, sy, sz, x, y, z, seed = 0) {
  const g = grainUVs(new THREE12.BoxGeometry(sx, sy, sz));
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + seed * 0.31);
  g.translate(x, y, z);
  return g.toNonIndexed();
}
function createAditPortalGeometry() {
  const half = ADIT.width / 2;
  const h = ADIT.height;
  const oak = [];
  for (const s of [-1, 1]) {
    const post = hewn2(0.22, h + 0.05, 0.22, 0, (h + 0.05) / 2, 0, s + 2);
    post.rotateZ(s * 0.05);
    post.translate(s * (half + 0.12), 0, 0.14);
    oak.push(post);
  }
  oak.push(hewn2(ADIT.width + 0.75, 0.26, 0.28, 0, h + 0.13, 0.15, 5));
  for (let k = 0; k < 4; k++) {
    const g = new THREE12.CylinderGeometry(0.07, 0.075, ADIT.width + 0.5 - k * 0.12, 7);
    g.rotateZ(Math.PI / 2);
    g.translate(0, h + 0.33 + k * 0.13, 0.12 - k * 0.025);
    oak.push(g.toNonIndexed());
  }
  const dark = new THREE12.PlaneGeometry(ADIT.width + 0.04, h + 0.02);
  dark.translate(0, (h + 0.02) / 2, 0.02);
  return grouped([oak, [dark.toNonIndexed()]]);
}
var RAIL_LENGTH = 2;
var RAIL_GAUGE = 0.55;
function createMineRailGeometry() {
  const wood = [];
  const iron = [];
  for (let x = -0.75; x <= 0.76; x += 0.5)
    wood.push(hewn2(0.13, 0.07, RAIL_GAUGE + 0.35, x, 0.035, 0, x * 7));
  for (const s of [-1, 1]) {
    wood.push(hewn2(RAIL_LENGTH, 0.07, 0.07, 0, 0.105, s * RAIL_GAUGE / 2, s + 9));
    iron.push(
      new THREE12.BoxGeometry(RAIL_LENGTH, 0.012, 0.045).translate(0, 0.146, s * RAIL_GAUGE / 2).toNonIndexed()
    );
  }
  return grouped([wood, iron]);
}
function createOreCartGeometry() {
  const wood = [];
  const iron = [];
  const ore = [];
  const base = 0.2;
  const tub = new THREE12.BoxGeometry(0.95, 0.5, RAIL_GAUGE + 0.12);
  const tp = tub.attributes.position;
  for (let i = 0; i < tp.count; i++)
    if (tp.getY(i) > 0) {
      tp.setX(i, tp.getX(i) * 1.12);
      tp.setZ(i, tp.getZ(i) * 1.1);
    }
  tub.computeVertexNormals();
  tub.translate(0, base + 0.25, 0);
  wood.push(grainUVs(tub).toNonIndexed());
  for (const y of [base + 0.1, base + 0.42])
    iron.push(
      new THREE12.BoxGeometry(1 + (y - base) * 0.2, 0.04, RAIL_GAUGE + 0.16 + (y - base) * 0.12).translate(0, y, 0).toNonIndexed()
    );
  for (const x of [-0.3, 0.3]) {
    for (const s of [-1, 1]) {
      const wheel2 = new THREE12.CylinderGeometry(0.13, 0.13, 0.05, 12);
      wheel2.rotateX(Math.PI / 2);
      wheel2.translate(x, 0.13, s * RAIL_GAUGE / 2);
      iron.push(wheel2.toNonIndexed());
    }
    iron.push(
      rod(
        new THREE12.Vector3(x, 0.13, -RAIL_GAUGE / 2),
        new THREE12.Vector3(x, 0.13, RAIL_GAUGE / 2),
        0.025,
        6
      )
    );
  }
  for (let k = 0; k < 9; k++) {
    const lump = new THREE12.DodecahedronGeometry(0.11 + k % 3 * 0.03, 0);
    lump.translate(
      -0.32 + k % 3 * 0.32 + k % 2 * 0.05,
      base + 0.55 + Math.floor(k / 3) * 0.03 - (k === 4 ? -0.08 : 0),
      -0.16 + Math.floor(k / 3) * 0.16
    );
    ore.push(lump.toNonIndexed());
  }
  return grouped([wood, iron, ore]);
}
function createSpoilHeapGeometry() {
  const cone = new THREE12.ConeGeometry(1.15, 0.95, 20, 5);
  const p = cone.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    const k = 1 + fbm(x * 1.7, y * 1.7, z * 1.7) * 0.22;
    p.setXYZ(i, x * k * 1.15, y + (r > 0.01 ? fbm(x * 3, 1, z * 3) * 0.06 : 0), z * k);
  }
  cone.computeVertexNormals();
  cone.translate(0, 0.5, 0);
  const parts = [cone.toNonIndexed()];
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9 + 0.3;
    const s = createStoneGeometry(0.22 + k % 3 * 0.06, 0.16, 0.2);
    s.translate(Math.cos(a) * 1.3, 0.07, Math.sin(a) * 1.05);
    parts.push(s);
  }
  return grouped([parts]);
}
var SHAFT_SIZE = 1.1;
function createMineShaftGeometry() {
  const h = SHAFT_SIZE / 2;
  const t = 0.24;
  const oak = [
    hewn2(SHAFT_SIZE + 2 * t, 0.22, t, 0, 0.11, h + t / 2, 1),
    hewn2(SHAFT_SIZE + 2 * t, 0.22, t, 0, 0.11, -h - t / 2, 2),
    hewn2(t, 0.22, SHAFT_SIZE, h + t / 2, 0.11, 0, 3),
    hewn2(t, 0.22, SHAFT_SIZE, -h - t / 2, 0.11, 0, 4)
  ];
  const dark = new THREE12.PlaneGeometry(SHAFT_SIZE, SHAFT_SIZE).rotateX(-Math.PI / 2).translate(0, 0.05, 0);
  return grouped([oak, [dark.toNonIndexed()]]);
}
var HEADFRAME_HEIGHT = 3.9;
var SHEAVE_R = 0.55;
function createHeadframeGeometry() {
  const H = HEADFRAME_HEIGHT;
  const oak = [];
  const spread = 1.05;
  for (const s of [-1, 1]) {
    for (const lean of [-1, 1]) {
      const foot = new THREE12.Vector3(lean * spread, 0, s * 0.95);
      const top2 = new THREE12.Vector3(lean * 0.12, H, s * 0.62);
      oak.push(rod(foot, top2, 0.1, 6));
    }
    oak.push(
      rod(
        new THREE12.Vector3(-spread * 0.55, H * 0.45, s * 0.8),
        new THREE12.Vector3(spread * 0.55, H * 0.45, s * 0.8),
        0.07,
        6
      )
    );
  }
  oak.push(hewn2(0.26, 0.24, 1.6, 0, H + 0.1, 0, 7));
  const iron = [];
  const wheel2 = new THREE12.TorusGeometry(SHEAVE_R, 0.05, 6, 20);
  wheel2.translate(0, H + 0.1 + SHEAVE_R, 0);
  iron.push(wheel2.toNonIndexed());
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI;
    const c = new THREE12.Vector3(0, H + 0.1 + SHEAVE_R, 0);
    oak.push(
      rod(
        c.clone().add(new THREE12.Vector3(Math.cos(a) * SHEAVE_R, Math.sin(a) * SHEAVE_R, 0)),
        c.clone().add(new THREE12.Vector3(-Math.cos(a) * SHEAVE_R, -Math.sin(a) * SHEAVE_R, 0)),
        0.025,
        4
      )
    );
  }
  const axle = new THREE12.CylinderGeometry(0.06, 0.06, 0.5, 8).rotateX(Math.PI / 2).translate(0, H + 0.1 + SHEAVE_R, 0);
  iron.push(axle.toNonIndexed());
  const top = H + 0.1 + SHEAVE_R;
  const rope = [
    rod(new THREE12.Vector3(SHEAVE_R, top, 0), new THREE12.Vector3(SHEAVE_R, -0.5, 0), 0.018, 5),
    rod(new THREE12.Vector3(-SHEAVE_R, top, 0), new THREE12.Vector3(-3, 0.9, 0), 0.018, 5)
  ];
  return grouped([oak, iron, rope]);
}

// vendor/city-builder/src/editor/pieces/textures.ts
import * as THREE13 from "three";
var cache = /* @__PURE__ */ new Map();
function load(key, url) {
  if (cache.has(key)) return cache.get(key);
  if (typeof document === "undefined") {
    cache.set(key, null);
    return null;
  }
  const texture = new THREE13.TextureLoader().load(url);
  texture.wrapS = THREE13.RepeatWrapping;
  texture.wrapT = THREE13.RepeatWrapping;
  texture.colorSpace = THREE13.SRGBColorSpace;
  texture.anisotropy = 8;
  cache.set(key, texture);
  return texture;
}
function barkTexture() {
  return load("bark", new URL("assets3d/textures/bark/bark-pine.png", import.meta.url).href);
}
function thatchTexture() {
  return load(
    "thatch",
    new URL(
      "assets3d/textures/building/roofing/Thatch/Roof_Thatch_01-512x512.png",
      import.meta.url
    ).href
  );
}
function plankTexture() {
  return load(
    "plank",
    new URL("assets3d/textures/building/wood/vegetation-pack/Wood_01.png", import.meta.url).href
  );
}
function oakTexture() {
  return load(
    "oak",
    new URL("assets3d/textures/building/wood/oak-grain.png", import.meta.url).href
  );
}
function doorPlankTexture() {
  return load(
    "door-plank",
    new URL("assets3d/textures/building/wood/Wooden Planks (43).png", import.meta.url).href
  );
}
function stoneTexture() {
  return load("stone", new URL("assets3d/textures/stone/stone-rock.png", import.meta.url).href);
}
function gravelTexture() {
  return load("gravel", new URL("assets3d/textures/terrain/gravel.png", import.meta.url).href);
}
function shingleTexture() {
  return load(
    "shingle",
    new URL(
      "assets3d/textures/building/roofing/Brown/Roof_Brown_06-512x512.png",
      import.meta.url
    ).href
  );
}
function freshSawnMaterial() {
  const map = oakTexture();
  return map ? new THREE13.MeshStandardMaterial({
    color: new THREE13.Color().setRGB(1.8, 2.2, 2.45),
    map,
    roughness: 0.8
  }) : new THREE13.MeshStandardMaterial({ color: 14203020, roughness: 0.8 });
}
function brickTexture() {
  return load(
    "brick",
    new URL("assets3d/textures/building/brick/brick.png", import.meta.url).href
  );
}
function tileTexture() {
  return load(
    "tile",
    new URL("assets3d/textures/building/roofing/Red/Roof_Red_03-512x512.png", import.meta.url).href
  );
}
function castleMasonryTexture() {
  return load(
    "castle-masonry",
    new URL("assets3d/textures/stone/castle-masonry.png", import.meta.url).href
  );
}
function castleMasonryBump() {
  const texture = load(
    "castle-masonry-bump",
    new URL("assets3d/textures/stone/castle-masonry-bump.png", import.meta.url).href
  );
  if (texture) texture.colorSpace = THREE13.NoColorSpace;
  return texture;
}
function slateTexture() {
  return load(
    "slate",
    new URL("assets3d/textures/building/roofing/Gray/Roof_Gray_03-512x512.png", import.meta.url).href
  );
}
function scaleSlateTexture() {
  return load(
    "slate-scales",
    new URL("assets3d/textures/building/roofing/Gray/Roof_Gray_06-512x512.png", import.meta.url).href
  );
}

// vendor/city-builder/src/editor/pieces/PieceDefs.ts
function endConnectors(length) {
  return [
    { position: new THREE14.Vector3(-length / 2, 0, 0), direction: new THREE14.Vector3(-1, 0, 0) },
    { position: new THREE14.Vector3(length / 2, 0, 0), direction: new THREE14.Vector3(1, 0, 0) }
  ];
}
function stackingConnectors(height) {
  return [
    { position: new THREE14.Vector3(0, -height / 2, 0), direction: new THREE14.Vector3(0, -1, 0) },
    { position: new THREE14.Vector3(0, height / 2, 0), direction: new THREE14.Vector3(0, 1, 0) }
  ];
}
function sideConnectors(width, depth) {
  return [
    { position: new THREE14.Vector3(-width / 2, 0, 0), direction: new THREE14.Vector3(-1, 0, 0) },
    { position: new THREE14.Vector3(width / 2, 0, 0), direction: new THREE14.Vector3(1, 0, 0) },
    { position: new THREE14.Vector3(0, 0, -depth / 2), direction: new THREE14.Vector3(0, 0, -1) },
    { position: new THREE14.Vector3(0, 0, depth / 2), direction: new THREE14.Vector3(0, 0, 1) }
  ];
}
function boxFaceConnectors(width, height, depth) {
  return [...stackingConnectors(height), ...sideConnectors(width, depth)];
}
function woodMaterial(color, roughness = 0.85) {
  return new THREE14.MeshStandardMaterial({ color, roughness, metalness: 0 });
}
function barkMaterial(color) {
  const map = barkTexture();
  if (!map) return woodMaterial(color, 0.95);
  const tint = new THREE14.Color(color).multiplyScalar(1.9);
  return new THREE14.MeshStandardMaterial({ color: tint, map, roughness: 0.95, metalness: 0 });
}
function hewnBeam(length, height, depth, variant = 0) {
  const segments = Math.max(2, Math.round(length * 3));
  return bowAlongX(
    new THREE14.BoxGeometry(length, height, depth, segments, 1, 1),
    length,
    variant + 11,
    4e-3
  );
}
function stoneMaterial(color = 9211015, roughness = 0.95) {
  const map = stoneTexture();
  return new THREE14.MeshStandardMaterial({
    color: map ? new THREE14.Color(color).multiplyScalar(1.75) : color,
    map,
    roughness
  });
}
var WALL_LENGTH = 2;
var GRID_UNIT = WALL_LENGTH;
var FOOTING_WIDTH = 0.6;
var FOOTING_HEIGHT = 0.22;
var FOOTING_DEPTH = 0.6;
var FootingPiece = {
  id: "footing",
  label: "Footing / Pier Block",
  category: "Foundation",
  material: "stone",
  tier: 1,
  length: FOOTING_WIDTH,
  connectors: boxFaceConnectors(FOOTING_WIDTH, FOOTING_HEIGHT, FOOTING_DEPTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => createStoneGeometry(FOOTING_WIDTH, FOOTING_HEIGHT, FOOTING_DEPTH),
  createMaterial: () => stoneMaterial(9408390)
};
var STONE_SIZE = 0.4;
var STONE_HEIGHT = STONE_SIZE * 0.7;
var StackableStonePiece = {
  id: "stone",
  label: "Stackable Stone",
  category: "Foundation",
  material: "stone",
  tier: 1,
  length: STONE_SIZE,
  connectors: stackingConnectors(STONE_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => createStoneGeometry(STONE_SIZE, STONE_HEIGHT, STONE_SIZE),
  createMaterial: () => stoneMaterial()
};
var FOUNDATION_SLAB_HEIGHT = 0.25;
var FoundationSlabPiece = {
  id: "foundation-slab",
  label: "Foundation Slab",
  category: "Foundation",
  material: "stone",
  tier: 3,
  length: GRID_UNIT,
  connectors: boxFaceConnectors(GRID_UNIT, FOUNDATION_SLAB_HEIGHT, GRID_UNIT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  // A plain flat box, not createStoneGeometry's wobble — that helper's noise
  // amplitude scales with the piece's average dimension, which is fine for a
  // small rough footing/stone but wildly oversized (~11cm) against a 2m-wide,
  // 25cm-thick slab, producing a warped/pyramided look instead of the flat
  // poured-concrete surface this modern-style piece is supposed to have.
  createGeometry: () => new THREE14.BoxGeometry(GRID_UNIT, FOUNDATION_SLAB_HEIGHT, GRID_UNIT),
  createMaterial: () => stoneMaterial(10132112)
};
var LOG_RADIUS = 0.15;
var LogPiece = {
  id: "log",
  label: "Log",
  category: "Structural",
  material: "wood",
  tier: 1,
  length: WALL_LENGTH,
  connectors: endConnectors(WALL_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  // Variants 0-2 carry branch stubs, 3-5 are clean (used where stubs would poke through, e.g. under thatch).
  createGeometry: (v5 = 0) => createRusticLogGeometry(WALL_LENGTH, LOG_RADIUS, { seed: v5, nubs: v5 < 3 }),
  createMaterial: () => barkMaterial(7031339)
};
var HalfLogPiece = {
  id: "half-log",
  label: "Half Log",
  category: "Structural",
  material: "wood",
  tier: 1,
  length: WALL_LENGTH,
  connectors: endConnectors(WALL_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: (v5 = 0) => bowAlongX(createHalfLogGeometry(WALL_LENGTH, LOG_RADIUS), WALL_LENGTH, v5, 6e-3),
  createMaterial: () => woodMaterial(8017714)
};
var PLANK_WIDTH = 0.3;
var PLANK_THICKNESS = 0.08;
var PlankPiece = {
  id: "plank",
  label: "Plank",
  category: "Structural",
  material: "plank",
  tier: 2,
  length: WALL_LENGTH,
  connectors: endConnectors(WALL_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => new THREE14.BoxGeometry(WALL_LENGTH, PLANK_THICKNESS, PLANK_WIDTH),
  createMaterial: () => woodMaterial(12687979, 0.75)
};
var WALL_PANEL_HEIGHT = 2.2;
var WALL_PANEL_THICKNESS = 0.15;
var WallPanelPiece = {
  id: "wall-panel",
  label: "Wall Panel",
  category: "Structural",
  material: "plank",
  tier: 3,
  length: GRID_UNIT,
  connectors: boxFaceConnectors(GRID_UNIT, WALL_PANEL_HEIGHT, WALL_PANEL_THICKNESS),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => new THREE14.BoxGeometry(GRID_UNIT, WALL_PANEL_HEIGHT, WALL_PANEL_THICKNESS),
  createMaterial: () => woodMaterial(12096106, 0.8)
};
var LOG_WALL_THICKNESS = LOG_RADIUS * 2;
var LOG_WALL_DOOR_OPENING = { width: 1, height: 1.8, sill: 0 };
var LOG_WALL_WINDOW_OPENING = { width: 0.9, height: 1.2, sill: 0.6 };
function logWallWithFill(opening, kind, variant, width = GRID_UNIT) {
  const wall = createLogWallGeometry(width, WALL_PANEL_HEIGHT, LOG_RADIUS, opening, variant);
  const fill = createOpeningFillGeometry(WALL_PANEL_HEIGHT, opening, kind, variant);
  const merged = mergeGeometries4([wall, fill.wood, fill.dark], true);
  if (!merged) throw new Error("Failed to build log wall opening");
  return merged;
}
function openingWallMaterials() {
  return [
    barkMaterial(7031339),
    boardMaterial(8215094),
    new THREE14.MeshStandardMaterial({ color: 2827296, roughness: 0.7, metalness: 0.2 })
  ];
}
function doorWallMaterials() {
  const map = doorPlankTexture();
  const [bark, , iron] = openingWallMaterials();
  const door = map ? new THREE14.MeshStandardMaterial({ map, roughness: 0.85 }) : woodMaterial(5913122, 0.85);
  return [bark, door, iron];
}
var LogWallPiece = {
  id: "log-wall",
  label: "Log Wall",
  category: "Structural",
  material: "wood",
  tier: 1,
  length: GRID_UNIT,
  connectors: boxFaceConnectors(GRID_UNIT, WALL_PANEL_HEIGHT, LOG_WALL_THICKNESS),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: (v5 = 0) => createLogWallGeometry(GRID_UNIT, WALL_PANEL_HEIGHT, LOG_RADIUS, void 0, v5),
  createMaterial: () => barkMaterial(7031339)
};
var LogWallDoorPiece = {
  id: "log-wall-door",
  label: "Log Wall (Door)",
  category: "Structural",
  material: "wood",
  tier: 1,
  length: GRID_UNIT,
  connectors: boxFaceConnectors(GRID_UNIT, WALL_PANEL_HEIGHT, LOG_WALL_THICKNESS),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: (v5 = 0) => logWallWithFill(LOG_WALL_DOOR_OPENING, "door", v5),
  createMaterial: doorWallMaterials
};
var GRAND_DOOR_OPENING = { width: 1.7, height: 2, sill: 0 };
var LogWallGrandDoorPiece = {
  id: "log-wall-grand-door",
  label: "Log Wall (Double Door)",
  category: "Structural",
  material: "wood",
  tier: 1,
  length: GRID_UNIT * 2,
  connectors: boxFaceConnectors(GRID_UNIT * 2, WALL_PANEL_HEIGHT, LOG_WALL_THICKNESS),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: (v5 = 0) => logWallWithFill(GRAND_DOOR_OPENING, "door", v5, GRID_UNIT * 2),
  createMaterial: doorWallMaterials
};
var LogWallWindowPiece = {
  id: "log-wall-window",
  label: "Log Wall (Window)",
  category: "Structural",
  material: "wood",
  tier: 1,
  length: GRID_UNIT,
  connectors: boxFaceConnectors(GRID_UNIT, WALL_PANEL_HEIGHT, LOG_WALL_THICKNESS),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: (v5 = 0) => logWallWithFill(LOG_WALL_WINDOW_OPENING, "window", v5),
  createMaterial: openingWallMaterials
};
var FENCE_POST_LENGTH = 1;
var FENCE_POST_RADIUS = 0.08;
var FencePostPiece = {
  id: "fence-post",
  label: "Fence Post",
  category: "Structural",
  material: "wood",
  tier: 1,
  length: FENCE_POST_LENGTH,
  connectors: endConnectors(FENCE_POST_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Vertical,
  createGeometry: (v5 = 0) => createRusticLogGeometry(FENCE_POST_LENGTH, FENCE_POST_RADIUS, {
    seed: v5,
    radialSegments: 8,
    bend: 0.015
  }),
  createMaterial: () => barkMaterial(6045736)
};
var FENCE_RAIL_WIDTH = 0.12;
var FENCE_RAIL_THICKNESS = 0.05;
var FenceRailPiece = {
  id: "fence-rail",
  label: "Fence Rail",
  category: "Structural",
  material: "plank",
  tier: 2,
  length: WALL_LENGTH,
  connectors: endConnectors(WALL_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => new THREE14.BoxGeometry(WALL_LENGTH, FENCE_RAIL_THICKNESS, FENCE_RAIL_WIDTH),
  createMaterial: () => woodMaterial(9071173, 0.8)
};
var STAIR_RUN2 = 1.2;
var STAIR_RISE = 0.9;
var STAIR_WIDTH2 = 0.9;
var STAIR_STEP_COUNT = 6;
var StairsPiece = {
  id: "stairs",
  label: "Stairs",
  category: "Structural",
  material: "plank",
  tier: 2,
  length: STAIR_RUN2,
  connectors: [
    { position: new THREE14.Vector3(0, 0, 0), direction: new THREE14.Vector3(-1, 0, 0) },
    {
      position: new THREE14.Vector3(STAIR_RUN2, STAIR_RISE, 0),
      direction: new THREE14.Vector3(1, 0, 0)
    }
  ],
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => createStairsGeometry(STAIR_RUN2, STAIR_RISE, STAIR_WIDTH2, STAIR_STEP_COUNT),
  createMaterial: () => woodMaterial(9071173, 0.8)
};
var PLATE_SIZE = 0.18;
var SillPlatePiece = {
  id: "sill-plate",
  label: "Sill Plate",
  category: "Framing",
  material: "wood",
  tier: 1,
  length: WALL_LENGTH,
  // End connectors chain sills into a run; the added top/bottom pair is what
  // lets a WallPanelPiece (or stud) snap on top of a sill once it's placed.
  connectors: [...endConnectors(WALL_LENGTH), ...stackingConnectors(PLATE_SIZE)],
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: (v5 = 0) => hewnBeam(WALL_LENGTH, PLATE_SIZE, PLATE_SIZE, v5),
  createMaterial: () => woodMaterial(6045736, 0.8)
};
var TopPlatePiece = {
  id: "top-plate",
  label: "Top Plate",
  category: "Framing",
  material: "plank",
  tier: 2,
  length: WALL_LENGTH,
  connectors: endConnectors(WALL_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => new THREE14.BoxGeometry(WALL_LENGTH, PLATE_SIZE, PLATE_SIZE),
  createMaterial: () => woodMaterial(6045736, 0.8)
};
var STUD_WIDTH = 0.1;
var STUD_THICKNESS = 0.05;
var WallStudPiece = {
  id: "wall-stud",
  label: "Wall Stud",
  category: "Framing",
  material: "plank",
  tier: 2,
  length: WALL_LENGTH,
  connectors: endConnectors(WALL_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Vertical,
  createGeometry: () => new THREE14.BoxGeometry(WALL_LENGTH, STUD_WIDTH, STUD_THICKNESS),
  createMaterial: () => woodMaterial(8017714, 0.8)
};
var HEADER_LENGTH = 1.2;
var HEADER_HEIGHT = 0.15;
var HEADER_DEPTH = 0.12;
var HeaderPiece = {
  id: "header",
  label: "Header / Lintel",
  category: "Framing",
  material: "plank",
  tier: 2,
  length: HEADER_LENGTH,
  connectors: endConnectors(HEADER_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => new THREE14.BoxGeometry(HEADER_LENGTH, HEADER_HEIGHT, HEADER_DEPTH),
  createMaterial: () => woodMaterial(6045736, 0.8)
};
var BRACE_LENGTH = 1;
var BRACE_SIZE = 0.08;
var DiagonalBracePiece = {
  id: "diagonal-brace",
  label: "Diagonal Brace",
  category: "Framing",
  material: "plank",
  tier: 2,
  length: BRACE_LENGTH,
  connectors: endConnectors(BRACE_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.RoofPlus45,
  createGeometry: () => new THREE14.BoxGeometry(BRACE_LENGTH, BRACE_SIZE, BRACE_SIZE),
  createMaterial: () => woodMaterial(8017714, 0.8)
};
var JOIST_HEIGHT = 0.18;
var JOIST_WIDTH = 0.06;
var FloorJoistPiece = {
  id: "floor-joist",
  label: "Floor Joist",
  category: "Framing",
  material: "plank",
  tier: 2,
  length: WALL_LENGTH,
  connectors: endConnectors(WALL_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => new THREE14.BoxGeometry(WALL_LENGTH, JOIST_HEIGHT, JOIST_WIDTH),
  createMaterial: () => woodMaterial(7031339, 0.8)
};
var GIRDER_SIZE = 0.24;
var GirderPiece = {
  id: "girder",
  label: "Girder / Floor Beam",
  category: "Framing",
  material: "wood",
  tier: 1,
  length: WALL_LENGTH,
  connectors: endConnectors(WALL_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: (v5 = 0) => hewnBeam(WALL_LENGTH, GIRDER_SIZE, GIRDER_SIZE, v5),
  createMaterial: () => woodMaterial(6045736, 0.8)
};
var FLOOR_PANEL_THICKNESS = 0.1;
var FloorPanelPiece = {
  id: "floor-panel",
  label: "Floor Panel",
  category: "Framing",
  material: "plank",
  tier: 3,
  length: GRID_UNIT,
  connectors: boxFaceConnectors(GRID_UNIT, FLOOR_PANEL_THICKNESS, GRID_UNIT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => new THREE14.BoxGeometry(GRID_UNIT, FLOOR_PANEL_THICKNESS, GRID_UNIT),
  createMaterial: () => woodMaterial(13214575, 0.75)
};
var RIDGE_BEAM_SIZE = 0.22;
var RidgeBeamPiece = {
  id: "ridge-beam",
  label: "Ridge Beam",
  category: "Roof Framing",
  material: "wood",
  tier: 1,
  length: WALL_LENGTH,
  connectors: endConnectors(WALL_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: (v5 = 0) => hewnBeam(WALL_LENGTH, RIDGE_BEAM_SIZE, RIDGE_BEAM_SIZE, v5),
  createMaterial: () => woodMaterial(6045736, 0.8)
};
var GABLE_PITCH = Math.PI / 6;
function gableCourses(modules) {
  return logGableCourses(
    modules * GRID_UNIT / 2 + LOG_WALL_THICKNESS / 2,
    GABLE_PITCH,
    0.33,
    LOG_RADIUS
  );
}
function logGableHeight(modules) {
  return gableCourses(modules).length * LOG_RADIUS * 2;
}
function logGablePiece(id, label, modules) {
  const halfWidth = modules * GRID_UNIT / 2 + LOG_WALL_THICKNESS / 2;
  const courses = gableCourses(modules);
  return {
    id,
    label,
    category: "Roof Framing",
    material: "wood",
    tier: 1,
    length: halfWidth * 2,
    connectors: boxFaceConnectors(halfWidth * 2, logGableHeight(modules), LOG_WALL_THICKNESS),
    defaultRotationIndex: ROTATION_INDEX.Horizontal,
    createGeometry: (v5 = 0) => createLogGableGeometry(courses, LOG_RADIUS, v5),
    createMaterial: () => barkMaterial(7031339)
  };
}
var LogGablePiece = logGablePiece("log-gable", "Log Gable (6m)", 3);
var LogGableSmallPiece = logGablePiece("log-gable-small", "Log Gable (4m)", 2);
var LogGableLargePiece = logGablePiece("log-gable-large", "Log Gable (8m)", 4);
var LogGableTinyPiece = logGablePiece("log-gable-tiny", "Log Gable (2m)", 1);
var RAFTER_HEIGHT = 0.12;
var RAFTER_WIDTH = 0.08;
var RafterPiece = {
  id: "rafter",
  label: "Rafter",
  category: "Roof Framing",
  material: "plank",
  tier: 2,
  length: WALL_LENGTH,
  connectors: endConnectors(WALL_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.RoofPlus30,
  createGeometry: () => new THREE14.BoxGeometry(WALL_LENGTH, RAFTER_HEIGHT, RAFTER_WIDTH),
  createMaterial: () => woodMaterial(7031339, 0.8)
};
var PURLIN_HEIGHT = 0.1;
var PURLIN_WIDTH = 0.12;
var PurlinPiece = {
  id: "purlin",
  label: "Purlin",
  category: "Roof Framing",
  material: "plank",
  tier: 2,
  length: WALL_LENGTH,
  connectors: endConnectors(WALL_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal90,
  createGeometry: () => new THREE14.BoxGeometry(WALL_LENGTH, PURLIN_HEIGHT, PURLIN_WIDTH),
  createMaterial: () => woodMaterial(7031339, 0.8)
};
var COLLAR_TIE_LENGTH = 1.4;
var COLLAR_TIE_HEIGHT = 0.12;
var COLLAR_TIE_WIDTH = 0.05;
var CollarTiePiece = {
  id: "collar-tie",
  label: "Collar Tie",
  category: "Roof Framing",
  material: "plank",
  tier: 2,
  length: COLLAR_TIE_LENGTH,
  connectors: endConnectors(COLLAR_TIE_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => new THREE14.BoxGeometry(COLLAR_TIE_LENGTH, COLLAR_TIE_HEIGHT, COLLAR_TIE_WIDTH),
  createMaterial: () => woodMaterial(9071173, 0.8)
};
var ROOF_LENGTH = 2;
var ROOF_WIDTH = 1;
var ROOF_THICKNESS = 0.08;
function thatchGeometry(length, variant) {
  const phase = variant * 1.73;
  const geometry = createRidgedPanelGeometry(
    length,
    ROOF_WIDTH,
    ROOF_THICKNESS,
    0.05,
    (u, v5) => Math.sin(u * 37 + v5 * 11 + phase) * 0.6 + Math.sin(u * 71 - v5 * 5 - phase * 2) * 0.4,
    Math.round(12 * length),
    10
  );
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * ROOF_WIDTH, uv.getX(i) * length);
  return geometry;
}
function thatchMaterial() {
  const map = thatchTexture();
  return new THREE14.MeshStandardMaterial({ color: map ? 15125654 : 13213770, map, roughness: 1 });
}
function boardMaterial(color, roughness = 0.85) {
  const map = plankTexture();
  if (!map) return woodMaterial(color, roughness);
  return new THREE14.MeshStandardMaterial({
    color: new THREE14.Color(color).lerp(new THREE14.Color(16777215), 0.65),
    map,
    roughness
  });
}
var HayRoofPiece = {
  id: "hay-roof",
  label: "Hay Roof",
  category: "Roofing",
  material: "wood",
  tier: 1,
  length: ROOF_LENGTH,
  connectors: endConnectors(ROOF_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.RoofPlus30,
  createGeometry: (v5 = 0) => thatchGeometry(ROOF_LENGTH, v5),
  createMaterial: thatchMaterial
};
var HayRoofHalfPiece = {
  id: "hay-roof-half",
  label: "Hay Roof (Half)",
  category: "Roofing",
  material: "wood",
  tier: 1,
  length: ROOF_LENGTH / 2,
  connectors: endConnectors(ROOF_LENGTH / 2),
  defaultRotationIndex: ROTATION_INDEX.RoofPlus30,
  createGeometry: (v5 = 0) => thatchGeometry(ROOF_LENGTH / 2, v5),
  createMaterial: thatchMaterial
};
var ClayTileRoofPiece = {
  id: "clay-tile-roof",
  label: "Clay Tile Roof",
  category: "Roofing",
  material: "clay",
  tier: 2,
  length: ROOF_LENGTH,
  connectors: endConnectors(ROOF_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.RoofPlus30,
  createGeometry: () => createRidgedPanelGeometry(
    ROOF_LENGTH,
    ROOF_WIDTH,
    ROOF_THICKNESS,
    0.035,
    (u) => Math.sin(u * Math.PI * 12),
    48,
    2
  ),
  createMaterial: () => new THREE14.MeshStandardMaterial({ color: 11882543, roughness: 0.55 })
};
var DOOR_HEIGHT = 2;
var DOOR_WIDTH = 0.9;
var DOOR_THICKNESS = 0.05;
function createDoorGeometry() {
  const slab = new THREE14.BoxGeometry(DOOR_HEIGHT, DOOR_THICKNESS, DOOR_WIDTH);
  const panelHeight = 0.7;
  const panelWidth = 0.6;
  const panelLift = 0.02;
  const panelY = DOOR_THICKNESS / 2 + panelLift / 2;
  const makePanel = (x) => {
    const panel = new THREE14.BoxGeometry(panelHeight, panelLift, panelWidth);
    panel.translate(x, panelY, 0);
    return panel;
  };
  const knobRadius = 0.03;
  const knob = new THREE14.SphereGeometry(knobRadius, 12, 8);
  knob.translate(0, DOOR_THICKNESS / 2 + knobRadius, DOOR_WIDTH / 2 - 0.1);
  const merged = mergeGeometries4([slab, makePanel(-0.45), makePanel(0.45), knob], true);
  if (!merged) throw new Error("Failed to build door geometry");
  return merged;
}
var DoorPiece = {
  id: "door",
  label: "Door",
  category: "Openings",
  material: "plank",
  tier: 2,
  length: DOOR_HEIGHT,
  connectors: endConnectors(DOOR_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Vertical,
  createGeometry: createDoorGeometry,
  createMaterial: () => {
    const wood = woodMaterial(7293486, 0.7);
    const knob = new THREE14.MeshStandardMaterial({
      color: 14209728,
      roughness: 0.3,
      metalness: 0.8
    });
    return [wood, wood, wood, knob];
  }
};
var WINDOW_HEIGHT = 1.2;
var WINDOW_WIDTH = 0.9;
var FRAME_THICKNESS = 0.08;
var FRAME_DEPTH = 0.06;
function createWindowGeometry() {
  const innerHeight = WINDOW_HEIGHT - 2 * FRAME_THICKNESS;
  const innerWidth = WINDOW_WIDTH - 2 * FRAME_THICKNESS;
  const topRail = new THREE14.BoxGeometry(FRAME_THICKNESS, FRAME_DEPTH, WINDOW_WIDTH);
  topRail.translate(WINDOW_HEIGHT / 2 - FRAME_THICKNESS / 2, 0, 0);
  const bottomRail = new THREE14.BoxGeometry(FRAME_THICKNESS, FRAME_DEPTH, WINDOW_WIDTH);
  bottomRail.translate(-(WINDOW_HEIGHT / 2 - FRAME_THICKNESS / 2), 0, 0);
  const leftStile = new THREE14.BoxGeometry(innerHeight, FRAME_DEPTH, FRAME_THICKNESS);
  leftStile.translate(0, 0, -(WINDOW_WIDTH / 2 - FRAME_THICKNESS / 2));
  const rightStile = new THREE14.BoxGeometry(innerHeight, FRAME_DEPTH, FRAME_THICKNESS);
  rightStile.translate(0, 0, WINDOW_WIDTH / 2 - FRAME_THICKNESS / 2);
  const glass = new THREE14.BoxGeometry(innerHeight, FRAME_DEPTH * 0.4, innerWidth);
  const merged = mergeGeometries4([topRail, bottomRail, leftStile, rightStile, glass], true);
  if (!merged) throw new Error("Failed to build window geometry");
  return merged;
}
var WindowPiece = {
  id: "window",
  label: "Window",
  category: "Openings",
  material: "plank",
  tier: 2,
  length: WINDOW_HEIGHT,
  connectors: endConnectors(WINDOW_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Vertical,
  createGeometry: createWindowGeometry,
  createMaterial: () => {
    const wood = woodMaterial(7293486, 0.7);
    const glass = new THREE14.MeshStandardMaterial({
      color: 12376288,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.4
    });
    return [wood, wood, wood, wood, glass];
  }
};
var DIRT_PAD_SIZE = 2;
var DIRT_PAD_HEIGHT = 0.04;
var DirtPadPiece = {
  id: "dirt-pad",
  label: "Packed Earth",
  category: "Foundation",
  material: "earth",
  tier: 1,
  length: DIRT_PAD_SIZE,
  connectors: boxFaceConnectors(DIRT_PAD_SIZE, DIRT_PAD_HEIGHT, DIRT_PAD_SIZE),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => {
    const geometry = new THREE14.BoxGeometry(DIRT_PAD_SIZE, DIRT_PAD_HEIGHT, DIRT_PAD_SIZE);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) * DIRT_PAD_SIZE, uv.getY(i) * DIRT_PAD_SIZE);
    return geometry;
  },
  createMaterial: () => {
    const map = gravelTexture();
    return new THREE14.MeshStandardMaterial({ color: map ? 10257507 : 8219212, map, roughness: 1 });
  }
};
var POLE_RAIL_RADIUS = 0.05;
var PoleRailPiece = {
  id: "pole-rail",
  label: "Pole Rail",
  category: "Structural",
  material: "wood",
  tier: 1,
  length: WALL_LENGTH,
  connectors: endConnectors(WALL_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: (v5 = 0) => createRusticLogGeometry(WALL_LENGTH, POLE_RAIL_RADIUS, {
    seed: v5,
    radialSegments: 6,
    nubs: false,
    bend: 0.02
  }),
  createMaterial: () => barkMaterial(7230003)
};
function propConnectors(height) {
  return [
    { position: new THREE14.Vector3(0, 0, 0), direction: new THREE14.Vector3(0, -1, 0) },
    { position: new THREE14.Vector3(0, height, 0), direction: new THREE14.Vector3(0, 1, 0) }
  ];
}
var HIDE_COLOR = 12099448;
var HideTentPiece = {
  id: "hide-tent",
  label: "Hide Tent",
  category: "Props",
  material: "wood",
  tier: 1,
  length: TENT_HEIGHT,
  connectors: propConnectors(TENT_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createHideTentGeometry,
  createMaterial: () => [
    new THREE14.MeshStandardMaterial({ color: HIDE_COLOR, roughness: 1, side: THREE14.DoubleSide }),
    woodMaterial(6045736)
  ]
};
var WellShaftPiece = {
  id: "well-shaft",
  label: "Well Shaft",
  category: "Props",
  material: "stone",
  tier: 1,
  length: WELL_SHAFT_RADIUS * 2,
  connectors: propConnectors(WELL_SHAFT_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => createWellShaftGeometry(),
  createMaterial: () => [
    stoneMaterial(9078140),
    new THREE14.MeshStandardMaterial({ color: 1911340, roughness: 0.15, metalness: 0.1 }),
    new THREE14.MeshStandardMaterial({ color: 2301980, roughness: 1 })
  ]
};
var WindlassPiece = {
  id: "well-windlass",
  label: "Well Windlass",
  category: "Props",
  material: "wood",
  tier: 1,
  length: WINDLASS_HALF_SPAN * 2,
  connectors: propConnectors(2.2),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => createWindlassGeometry(),
  createMaterial: () => [
    woodMaterial(7230006, 0.9),
    new THREE14.MeshStandardMaterial({ color: 11901546, roughness: 1 }),
    new THREE14.MeshStandardMaterial({ color: 3486255, roughness: 0.6, metalness: 0.6 })
  ]
};
var WASH_WELL_RADIUS = 1.05;
var WashWellShaftPiece = {
  ...WellShaftPiece,
  id: "wash-well-shaft",
  label: "Wide Well Shaft",
  tier: 2,
  length: WASH_WELL_RADIUS * 2,
  createGeometry: () => createWellShaftGeometry(WASH_WELL_RADIUS)
};
var WashWindlassPiece = {
  ...WindlassPiece,
  id: "wash-windlass",
  label: "Wide Well Windlass",
  tier: 2,
  length: 2.5,
  createGeometry: () => createWindlassGeometry(1.25)
};
var FireRingPiece = {
  id: "fire-ring",
  label: "Fire Ring",
  category: "Props",
  material: "stone",
  tier: 1,
  length: 1.3,
  connectors: propConnectors(0.25),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createFireRingGeometry,
  createMaterial: () => [
    stoneMaterial(8223346),
    new THREE14.MeshStandardMaterial({ color: 3025446, roughness: 1 })
  ]
};
var CampfireWoodPiece = {
  id: "campfire-wood",
  label: "Campfire Wood",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 0.62,
  connectors: propConnectors(0.42),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createCampfireWoodGeometry,
  createMaterial: () => [woodMaterial(8018488), woodMaterial(10254926)]
};
var CratePiece = {
  id: "crate",
  label: "Crate",
  category: "Props",
  material: "wood",
  tier: 1,
  length: CRATE_SIZE,
  connectors: propConnectors(CRATE_SIZE),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => createCrateGeometry(),
  createMaterial: () => [boardMaterial(11109210), woodMaterial(7229492)]
};
var SackPiece = {
  id: "sack",
  label: "Sack",
  category: "Props",
  material: "wood",
  tier: 1,
  length: SACK_HEIGHT,
  connectors: propConnectors(SACK_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createSackGeometry,
  createMaterial: () => new THREE14.MeshStandardMaterial({ color: 11902060, roughness: 1 })
};
var BarrelPiece = {
  id: "barrel",
  label: "Barrel",
  category: "Props",
  material: "wood",
  tier: 1,
  length: BARREL_HEIGHT,
  connectors: propConnectors(BARREL_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createBarrelGeometry,
  createMaterial: () => [
    boardMaterial(9069112),
    new THREE14.MeshStandardMaterial({ color: 3815478, roughness: 0.6, metalness: 0.5 })
  ]
};
var BasketPiece = {
  id: "basket",
  label: "Basket",
  category: "Props",
  material: "wood",
  tier: 1,
  length: BASKET_HEIGHT,
  connectors: propConnectors(BASKET_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createBasketGeometry,
  createMaterial: () => new THREE14.MeshStandardMaterial({ color: 11045199, roughness: 1, side: THREE14.DoubleSide })
};
var ChoppingBlockPiece = {
  id: "chopping-block",
  label: "Chopping Block",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 0.55,
  connectors: propConnectors(0.55),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createChoppingBlockGeometry,
  createMaterial: () => [
    woodMaterial(7031339),
    woodMaterial(10123856),
    new THREE14.MeshStandardMaterial({ color: 7302506, roughness: 0.4, metalness: 0.7 })
  ]
};
var DryingRackPiece = {
  id: "drying-rack",
  label: "Drying Rack",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 1.65,
  connectors: propConnectors(1.65),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createDryingRackGeometry,
  createMaterial: () => [
    woodMaterial(7230003),
    new THREE14.MeshStandardMaterial({ color: 6261308, roughness: 1 }),
    new THREE14.MeshStandardMaterial({ color: 10127948, roughness: 1 })
  ]
};
var StoneChimneyPiece = {
  id: "stone-chimney",
  label: "Stone Chimney",
  category: "Props",
  material: "stone",
  tier: 1,
  length: CHIMNEY_HEIGHT,
  connectors: propConnectors(CHIMNEY_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: (v5 = 0) => createStoneChimneyGeometry(v5),
  createMaterial: () => stoneMaterial(7828074)
};
var hideMaterial = () => new THREE14.MeshStandardMaterial({ color: HIDE_COLOR, roughness: 1, side: THREE14.DoubleSide });
var HideAwningPiece = {
  id: "hide-awning",
  label: "Hide Awning",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 2,
  connectors: endConnectors(2),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => createHideAwningGeometry(),
  createMaterial: hideMaterial
};
var GameRackPiece = {
  id: "game-rack",
  label: "Game Rack",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 2.8,
  connectors: propConnectors(GAME_RACK_BAR_Y + 0.2),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createGameRackGeometry,
  createMaterial: () => [
    barkMaterial(7230003),
    new THREE14.MeshStandardMaterial({ color: 9074256, roughness: 1 })
  ]
};
var RowboatPiece = {
  id: "rowboat",
  label: "Rowboat",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 2.8,
  connectors: propConnectors(0.6),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createRowboatGeometry,
  createMaterial: () => {
    const hull = boardMaterial(7295026);
    hull.side = THREE14.DoubleSide;
    return [hull, woodMaterial(9071172)];
  }
};
var NetPolesPiece = {
  id: "net-poles",
  label: "Drying Net",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 2,
  connectors: propConnectors(2.05),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createNetPolesGeometry,
  createMaterial: () => [
    barkMaterial(7230003),
    new THREE14.MeshStandardMaterial({ color: 9405542, roughness: 1 }),
    new THREE14.MeshStandardMaterial({ color: 13153418, roughness: 0.9 })
  ]
};
function stallPiece(id, label, awning) {
  return {
    id,
    label,
    category: "Props",
    material: "wood",
    tier: 1,
    length: STALL_WIDTH,
    connectors: propConnectors(2.4),
    defaultRotationIndex: ROTATION_INDEX.Horizontal,
    createGeometry: createMarketStallGeometry,
    createMaterial: () => [barkMaterial(8018490), awning()]
  };
}
var clothMaterial = (color) => () => new THREE14.MeshStandardMaterial({ color, roughness: 1, side: THREE14.DoubleSide });
var MarketStallPiece = stallPiece(
  "market-stall",
  "Market Stall (red)",
  clothMaterial(10107436)
);
var MarketStallOchrePiece = stallPiece(
  "market-stall-ochre",
  "Market Stall (ochre)",
  clothMaterial(12094010)
);
var MarketStallHidePiece = stallPiece(
  "market-stall-hide",
  "Market Stall (hide)",
  hideMaterial
);
var MarketPostPiece = {
  id: "market-post",
  label: "Market Post",
  category: "Props",
  material: "stone",
  tier: 1,
  length: 1.4,
  connectors: propConnectors(4.4),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createMarketPostGeometry,
  createMaterial: () => [
    stoneMaterial(9078140),
    woodMaterial(6177840, 0.9),
    new THREE14.MeshStandardMaterial({ color: 3100538, roughness: 1, side: THREE14.DoubleSide })
  ]
};
var MiddenPitPiece = {
  id: "midden-pit",
  label: "Midden Pit",
  category: "Props",
  material: "wood",
  tier: 1,
  length: MIDDEN_WIDTH,
  connectors: propConnectors(0.24),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createMiddenPitGeometry,
  createMaterial: () => [
    barkMaterial(6178352),
    new THREE14.MeshStandardMaterial({ color: 3023896, roughness: 0.55 })
  ]
};
var CompostBinPiece = {
  id: "compost-bin",
  label: "Compost Bin",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 1.1,
  connectors: propConnectors(0.95),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createCompostBinGeometry,
  createMaterial: () => [
    woodMaterial(8020032, 0.95),
    new THREE14.MeshStandardMaterial({ color: 3812380, roughness: 1 })
  ]
};
var HayBalePiece = {
  id: "hay-bale",
  label: "Hay Bale",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 1,
  connectors: propConnectors(0.48),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createHayBaleGeometry,
  createMaterial: () => {
    const map = thatchTexture();
    return [
      new THREE14.MeshStandardMaterial({ color: map ? 15785120 : 14202976, map, roughness: 1 }),
      new THREE14.MeshStandardMaterial({ color: 6969914, roughness: 1 })
    ];
  }
};
var TilledSoilPiece = {
  id: "tilled-soil",
  label: "Tilled Soil",
  category: "Foundation",
  material: "earth",
  tier: 1,
  length: TILLED_SIZE,
  connectors: boxFaceConnectors(TILLED_SIZE, 0.1, TILLED_SIZE),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createTilledSoilGeometry,
  createMaterial: () => {
    const map = gravelTexture();
    return new THREE14.MeshStandardMaterial({ color: map ? 9069636 : 6966324, map, roughness: 1 });
  }
};
var LecternPiece = {
  id: "lectern",
  label: "Lectern",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 0.7,
  connectors: propConnectors(1.2),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createLecternGeometry,
  createMaterial: () => [
    woodMaterial(5914152, 0.8),
    new THREE14.MeshStandardMaterial({ color: 15260864, roughness: 0.95 }),
    new THREE14.MeshStandardMaterial({ color: 5907488, roughness: 0.8 })
  ]
};
function bannerClothMaterial(color) {
  return new THREE14.MeshStandardMaterial({ color, roughness: 1, side: THREE14.DoubleSide });
}
var BannerPolePiece = {
  id: "banner-pole",
  label: "Banner Pole",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 1,
  connectors: propConnectors(4.8),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createBannerPoleGeometry,
  createMaterial: () => [woodMaterial(5914672, 0.85), bannerClothMaterial(9316898)]
};
var BannerPoleBluePiece = {
  ...BannerPolePiece,
  id: "banner-pole-blue",
  label: "Banner Pole (Blue)",
  createMaterial: () => [woodMaterial(5914672, 0.85), bannerClothMaterial(2902650)]
};
var NoticeBoardPiece = {
  id: "notice-board",
  label: "Notice Board",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 1.4,
  connectors: propConnectors(2.2),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createNoticeBoardGeometry,
  createMaterial: () => [
    woodMaterial(6966324, 0.85),
    new THREE14.MeshStandardMaterial({ color: 15129794, roughness: 1, side: THREE14.DoubleSide })
  ]
};
var BellPostPiece = {
  id: "bell-post",
  label: "Bell Post",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 1.4,
  connectors: propConnectors(3),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createBellPostGeometry,
  createMaterial: () => [
    woodMaterial(5914672, 0.85),
    new THREE14.MeshStandardMaterial({ color: 10119726, roughness: 0.45, metalness: 0.7 }),
    new THREE14.MeshStandardMaterial({ color: 12099696, roughness: 1 })
  ]
};
var ScarecrowPiece = {
  id: "scarecrow",
  label: "Scarecrow",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 1.3,
  connectors: propConnectors(2),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createScarecrowGeometry,
  createMaterial: () => [
    woodMaterial(6967352, 0.9),
    new THREE14.MeshStandardMaterial({ color: 8022606, roughness: 1 }),
    new THREE14.MeshStandardMaterial({ color: 13217122, roughness: 1 })
  ]
};
var WattlePanelPiece = {
  id: "wattle-panel",
  label: "Wattle Fence",
  category: "Structural",
  material: "wood",
  tier: 1,
  length: WATTLE_LENGTH,
  connectors: endConnectors(WATTLE_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createWattlePanelGeometry,
  createMaterial: () => woodMaterial(8020032, 0.95)
};
var RaisedBedPiece = {
  id: "raised-bed",
  label: "Raised Bed",
  category: "Foundation",
  material: "wood",
  tier: 1,
  length: RAISED_BED_LENGTH,
  connectors: propConnectors(0.3),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createRaisedBedGeometry,
  createMaterial: () => {
    const map = gravelTexture();
    return [
      barkMaterial(6178352),
      new THREE14.MeshStandardMaterial({ color: map ? 6965810 : 4863012, map, roughness: 1 }),
      new THREE14.MeshStandardMaterial({ color: 5933626, roughness: 0.9 })
    ];
  }
};
var GraveCrossPiece = {
  id: "grave-cross",
  label: "Grave",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 0.8,
  connectors: propConnectors(1),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createGraveCrossGeometry,
  createMaterial: () => [
    woodMaterial(6969928, 0.95),
    new THREE14.MeshStandardMaterial({ color: 5595194, roughness: 1 })
  ]
};
var StandingStonePiece = {
  id: "standing-stone",
  label: "Standing Stone",
  category: "Props",
  material: "stone",
  tier: 1,
  length: 0.55,
  connectors: propConnectors(1.5),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createStandingStoneGeometry,
  createMaterial: () => stoneMaterial(9078654)
};
var FlagstonesPiece = {
  id: "flagstones",
  label: "Flagstones",
  category: "Foundation",
  material: "stone",
  tier: 1,
  length: FLAGSTONE_SIZE,
  connectors: boxFaceConnectors(FLAGSTONE_SIZE, 0.06, FLAGSTONE_SIZE),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createFlagstonesGeometry,
  createMaterial: () => stoneMaterial(10130826)
};
var YewTreePiece = {
  id: "yew-tree",
  label: "Yew Tree",
  category: "Props",
  material: "earth",
  tier: 1,
  length: 3,
  connectors: propConnectors(5),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createYewTreeGeometry,
  createMaterial: () => [
    barkMaterial(5914672),
    new THREE14.MeshStandardMaterial({ color: 2771498, roughness: 1, flatShading: true })
  ]
};
var CrestBoardPiece = {
  id: "crest-board",
  label: "Town Crest",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 0.9,
  connectors: propConnectors(1.1),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createCrestBoardGeometry,
  createMaterial: () => [
    woodMaterial(4863012, 0.85),
    new THREE14.MeshStandardMaterial({ color: 2902650, roughness: 0.7 }),
    new THREE14.MeshStandardMaterial({ color: 13214247, roughness: 0.4, metalness: 0.5 })
  ]
};
var FlagstaffPiece = {
  id: "flagstaff",
  label: "Flagstaff",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 1.2,
  connectors: propConnectors(2.5),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createFlagstaffGeometry,
  createMaterial: () => [woodMaterial(5914672, 0.85), bannerClothMaterial(9316898)]
};
var StonePlinthPiece = {
  id: "stone-plinth",
  label: "Stone Plinth",
  category: "Foundation",
  material: "stone",
  tier: 1,
  length: PLINTH_SIZE,
  connectors: boxFaceConnectors(PLINTH_SIZE, PLINTH_HEIGHT, PLINTH_SIZE),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createStonePlinthGeometry,
  createMaterial: () => stoneMaterial(9341311)
};
var StoneStepsPiece = {
  id: "stone-steps",
  label: "Stone Steps",
  category: "Foundation",
  material: "stone",
  tier: 1,
  length: 1.8,
  connectors: propConnectors(PLINTH_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createStoneStepsGeometry,
  createMaterial: () => stoneMaterial(9604483)
};
var LANTERN_GLOW_MATERIAL = new THREE14.MeshStandardMaterial({
  color: 15782032,
  emissive: 16751152,
  emissiveIntensity: 0,
  roughness: 0.4
});
var LanternPiece = {
  id: "lantern",
  label: "Lantern",
  category: "Props",
  material: "wood",
  tier: 1,
  length: 0.35,
  connectors: propConnectors(0.4),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createLanternGeometry,
  createMaterial: () => [
    new THREE14.MeshStandardMaterial({ color: 2763306, roughness: 0.6, metalness: 0.6 }),
    LANTERN_GLOW_MATERIAL
  ]
};
var TIMBER_DOOR_OPENING = { width: 1, height: 1.8, sill: 0 };
var TIMBER_WINDOW_OPENING = { width: 0.9, height: 1.1, sill: 0.75 };
function oakMaterial() {
  const map = oakTexture();
  return map ? new THREE14.MeshStandardMaterial({ color: 7229496, map, roughness: 0.9 }) : woodMaterial(5126182, 0.9);
}
function daubMaterial() {
  const map = gravelTexture();
  return new THREE14.MeshStandardMaterial({ color: map ? 13939852 : 10519648, map, roughness: 1 });
}
function limeMaterial() {
  const map = gravelTexture();
  return new THREE14.MeshStandardMaterial({ color: map ? 15919832 : 15129798, map, roughness: 1 });
}
function glassMaterial() {
  return new THREE14.MeshStandardMaterial({ color: 3820104, roughness: 0.12, metalness: 0.35 });
}
function masonryMaterial() {
  const map = castleMasonryTexture();
  const bumpMap = castleMasonryBump();
  return new THREE14.MeshStandardMaterial({
    color: map ? 13815234 : 9341568,
    map,
    bumpMap,
    bumpScale: bumpMap ? 2.5 : 0,
    roughness: 0.93
  });
}
function slateMaterial(scales = false) {
  const map = scales ? scaleSlateTexture() : slateTexture();
  return new THREE14.MeshStandardMaterial({
    color: map ? scales ? 9213347 : 12106948 : 4936288,
    map,
    roughness: 0.75
  });
}
function tileMaterial() {
  const map = tileTexture();
  return new THREE14.MeshStandardMaterial({ color: map ? 10783358 : 9062964, map, roughness: 0.9 });
}
function brickMaterial() {
  const map = brickTexture();
  return new THREE14.MeshStandardMaterial({ color: map ? 16777215 : 10246724, map, roughness: 0.95 });
}
function shingleMaterial() {
  const map = shingleTexture();
  return new THREE14.MeshStandardMaterial({ color: map ? 11839640 : 7300184, map, roughness: 0.95 });
}
function timberWallPiece(id, label, opening, kind, infill = "daub", width = GRID_UNIT) {
  const lime = infill === "lime";
  const panel = lime ? limeMaterial : daubMaterial;
  return {
    id,
    label,
    category: "Structural",
    // Plastered walls are priced by their lime (the oak frame comes with it).
    material: lime ? "lime" : "wood",
    tier: lime ? 3 : 2,
    length: width,
    connectors: boxFaceConnectors(width, TIMBER_WALL_HEIGHT, TIMBER_DEPTH),
    defaultRotationIndex: ROTATION_INDEX.Horizontal,
    createGeometry: (v5 = 0) => createTimberWallGeometry(width, opening, kind, v5),
    createMaterial: () => {
      if (!opening) return [oakMaterial(), panel()];
      const fill = (kind === "door" ? doorWallMaterials() : openingWallMaterials()).slice(1);
      if (lime && kind === "window") fill[1] = glassMaterial();
      return [oakMaterial(), panel(), ...fill];
    },
    costGeometry: () => lime ? mergeParts(timberWallParts(width, opening, kind, 0).daub) : timberWallCostGeometry(width, opening, kind)
  };
}
var TimberWallPiece = timberWallPiece("timber-wall", "Timber-Frame Wall");
var TimberWallDoorPiece = timberWallPiece(
  "timber-wall-door",
  "Timber-Frame Wall (Door)",
  TIMBER_DOOR_OPENING,
  "door"
);
var TimberWallWindowPiece = timberWallPiece(
  "timber-wall-window",
  "Timber-Frame Wall (Window)",
  TIMBER_WINDOW_OPENING,
  "window"
);
function timberGablePiece(id, label, modules, infill = "daub", spanMeters) {
  const width = (spanMeters ?? modules * GRID_UNIT) + TIMBER_DEPTH;
  const height = timberGableHeight(width);
  const lime = infill === "lime";
  return {
    id,
    label,
    category: "Roof Framing",
    material: lime ? "lime" : "wood",
    tier: lime ? 3 : 2,
    length: width,
    connectors: boxFaceConnectors(width, height, TIMBER_DEPTH),
    defaultRotationIndex: ROTATION_INDEX.Horizontal,
    createGeometry: (v5 = 0) => {
      const p = timberGableParts(width, 30, v5);
      return grouped([p.timber, p.daub]);
    },
    createMaterial: () => [oakMaterial(), lime ? limeMaterial() : daubMaterial()],
    costGeometry: () => mergeParts(
      lime ? timberGableParts(width, 30, 0).daub : timberGableParts(width, 30, 0).timber
    )
  };
}
var TimberGableTinyPiece = timberGablePiece("timber-gable-tiny", "Timber Gable (2m)", 1);
var TimberGableSmallPiece = timberGablePiece("timber-gable-small", "Timber Gable (4m)", 2);
var TimberGablePiece = timberGablePiece("timber-gable", "Timber Gable (6m)", 3);
var TimberGableLargePiece = timberGablePiece("timber-gable-large", "Timber Gable (8m)", 4);
var ShingleRoofPiece = {
  id: "shingle-roof",
  label: "Shingle Roof",
  category: "Roofing",
  material: "wood",
  tier: 2,
  length: ROOF_LENGTH,
  connectors: endConnectors(ROOF_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.RoofPlus30,
  createGeometry: (v5 = 0) => createShingleGeometry(ROOF_LENGTH, ROOF_WIDTH, v5),
  createMaterial: shingleMaterial
};
var ShingleRoofHalfPiece = {
  id: "shingle-roof-half",
  label: "Shingle Roof (Half)",
  category: "Roofing",
  material: "wood",
  tier: 2,
  length: ROOF_LENGTH / 2,
  connectors: endConnectors(ROOF_LENGTH / 2),
  defaultRotationIndex: ROTATION_INDEX.RoofPlus30,
  createGeometry: (v5 = 0) => createShingleGeometry(ROOF_LENGTH / 2, ROOF_WIDTH, v5),
  createMaterial: shingleMaterial
};
var PlasterWallPiece = timberWallPiece(
  "plaster-wall",
  "Plastered Wall",
  void 0,
  void 0,
  "lime"
);
var PlasterWallDoorPiece = timberWallPiece(
  "plaster-wall-door",
  "Plastered Wall (Door)",
  TIMBER_DOOR_OPENING,
  "door",
  "lime"
);
var PlasterWallWindowPiece = timberWallPiece(
  "plaster-wall-window",
  "Plastered Wall (Window)",
  TIMBER_WINDOW_OPENING,
  "window",
  "lime"
);
var PlasterWallNarrowPiece = timberWallPiece(
  "plaster-wall-1",
  "Plastered Wall (1m)",
  void 0,
  void 0,
  "lime",
  1
);
var PLASTER_GABLES = [2, 3, 4, 5, 6, 7, 8, 9, 10].map(
  (span) => timberGablePiece(`plaster-gable-${span}`, `Plastered Gable (${span}m)`, span / 2, "lime", span)
);
var STONE_GABLES = [3, 4, 5, 6, 7, 8, 9, 10].map((span) => {
  const width = span + 0.5;
  const height = timberGableHeight(width) - 0.08;
  return {
    id: `stone-gable-${span}`,
    label: `Stone Gable (${span}m)`,
    category: "Roof Framing",
    material: "stone",
    tier: 3,
    length: width,
    connectors: boxFaceConnectors(width, height, 0.5),
    defaultRotationIndex: ROTATION_INDEX.Horizontal,
    createGeometry: () => createStoneGableGeometry(width, height, TIMBER_GABLE_EAVE - 0.05),
    createMaterial: () => stoneMaterial()
  };
});
var TileRoofPiece = {
  id: "tile-roof",
  label: "Tile Roof",
  category: "Roofing",
  material: "brick",
  tier: 3,
  length: ROOF_LENGTH,
  connectors: endConnectors(ROOF_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.RoofPlus30,
  createGeometry: (v5 = 0) => createShingleGeometry(ROOF_LENGTH, ROOF_WIDTH, v5),
  createMaterial: tileMaterial,
  costGeometry: () => new THREE14.BoxGeometry(ROOF_LENGTH, 0.12, ROOF_WIDTH)
};
var TileRoofHalfPiece = {
  ...TileRoofPiece,
  id: "tile-roof-half",
  label: "Tile Roof (Half)",
  length: ROOF_LENGTH / 2,
  connectors: endConnectors(ROOF_LENGTH / 2),
  createGeometry: (v5 = 0) => createShingleGeometry(ROOF_LENGTH / 2, ROOF_WIDTH, v5),
  costGeometry: () => new THREE14.BoxGeometry(ROOF_LENGTH / 2, 0.12, ROOF_WIDTH)
};
var BrickChimneyPiece = {
  id: "brick-chimney",
  label: "Brick Chimney",
  category: "Props",
  material: "brick",
  tier: 3,
  length: CHIMNEY_HEIGHT,
  connectors: propConnectors(CHIMNEY_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: (v5 = 0) => meterUVs(createStoneChimneyGeometry(v5), 0.6),
  createMaterial: brickMaterial
};
var StoneSillPiece = {
  id: "stone-sill",
  label: "Stone Sill Course",
  category: "Foundation",
  material: "stone",
  tier: 2,
  length: GRID_UNIT,
  connectors: propConnectors(STONE_SILL_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => createStoneSillGeometry(GRID_UNIT),
  createMaterial: () => stoneMaterial()
};
var DoorHoodPiece = {
  id: "door-hood",
  label: "Door Hood",
  category: "Props",
  material: "wood",
  tier: 2,
  length: 1.5,
  connectors: propConnectors(0.6),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => {
    const p = doorHoodParts();
    return grouped([p.timber, p.shingle]);
  },
  createMaterial: () => [oakMaterial(), shingleMaterial()]
};
var SawPitPiece = {
  id: "saw-pit",
  label: "Saw Pit",
  category: "Props",
  material: "wood",
  tier: 2,
  length: SAW_PIT_LENGTH,
  connectors: propConnectors(SAW_PIT_BEARER_TOP),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createSawPitGeometry,
  createMaterial: () => [
    oakMaterial(),
    new THREE14.MeshStandardMaterial({ color: 3877403, roughness: 1 }),
    new THREE14.MeshStandardMaterial({ color: 1182985, roughness: 1 })
  ]
};
var SawLogPiece = {
  id: "saw-log",
  label: "Log Being Sawn",
  category: "Props",
  material: "wood",
  tier: 2,
  length: SAW_LOG_LENGTH,
  connectors: propConnectors(0.4),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createSawLogGeometry,
  // Hewn square, then ripped: the faces are fresh-cut, pale until the weather gets at them.
  createMaterial: () => [freshSawnMaterial(), barkMaterial(7031339)]
};
var PitSawPiece = {
  id: "pit-saw",
  label: "Pit Saw",
  category: "Props",
  material: "wood",
  tier: 2,
  length: PIT_SAW_LENGTH,
  connectors: propConnectors(PIT_SAW_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createPitSawGeometry,
  createMaterial: () => [
    woodMaterial(9070144),
    new THREE14.MeshStandardMaterial({ color: 11052706, roughness: 0.35, metalness: 0.75 })
  ]
};
var TimberPostPiece = {
  id: "timber-post",
  label: "Oak Post",
  category: "Structural",
  material: "wood",
  tier: 2,
  length: TIMBER_POST_HEIGHT,
  connectors: propConnectors(TIMBER_POST_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createTimberPostGeometry,
  createMaterial: () => oakMaterial()
};
var TimberBeamPiece = {
  id: "timber-beam",
  label: "Oak Beam",
  category: "Structural",
  material: "wood",
  tier: 2,
  length: TIMBER_BEAM_LENGTH,
  connectors: endConnectors(TIMBER_BEAM_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createTimberBeamGeometry,
  createMaterial: () => oakMaterial()
};
var KneeBracePiece = {
  id: "knee-brace",
  label: "Knee Brace",
  category: "Structural",
  material: "wood",
  tier: 2,
  length: 0.85,
  connectors: propConnectors(0.6),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => createKneeBraceGeometry(),
  createMaterial: () => oakMaterial()
};
function sawnBoardMaterial() {
  const map = oakTexture();
  return map ? new THREE14.MeshStandardMaterial({ color: 13149308, map, roughness: 0.85 }) : woodMaterial(10122834, 0.85);
}
function boardWallPiece(id, label, doors) {
  return {
    id,
    label,
    category: "Structural",
    material: "plank",
    tier: 2,
    length: GRID_UNIT,
    connectors: boxFaceConnectors(GRID_UNIT, BOARD_WALL_HEIGHT, BOARD_WALL_DEPTH),
    defaultRotationIndex: ROTATION_INDEX.Horizontal,
    createGeometry: (v5 = 0) => {
      const p = boardWallParts(GRID_UNIT, doors, v5);
      return doors ? grouped([p.frame, p.boards, p.door, p.iron]) : grouped([p.frame, p.boards]);
    },
    createMaterial: () => doors ? [oakMaterial(), sawnBoardMaterial(), tarredBoardMaterial(), ironMaterial()] : [oakMaterial(), sawnBoardMaterial()],
    costGeometry: () => boardWallCostGeometry(GRID_UNIT, doors)
  };
}
function tarredBoardMaterial() {
  const map = oakTexture();
  return map ? new THREE14.MeshStandardMaterial({ color: 5125670, map, roughness: 0.8 }) : woodMaterial(4074012, 0.8);
}
function ironMaterial() {
  return new THREE14.MeshStandardMaterial({ color: 3486255, roughness: 0.6, metalness: 0.6 });
}
var BoardWallPiece = boardWallPiece("board-wall", "Weatherboard Wall", false);
var BoardWallDoorsPiece = boardWallPiece(
  "board-wall-doors",
  "Weatherboard Wall (Double Doors)",
  true
);
function boardGablePiece(id, label, loft, modules = 2) {
  const width = modules * GRID_UNIT + BOARD_WALL_DEPTH;
  return {
    id,
    label,
    category: "Roof Framing",
    material: "plank",
    tier: 2,
    length: width,
    connectors: boxFaceConnectors(width, boardGableHeight(width), BOARD_WALL_DEPTH),
    defaultRotationIndex: ROTATION_INDEX.Horizontal,
    createGeometry: (v5 = 0) => {
      const p = boardGableParts(width, loft, v5);
      return loft ? grouped([p.frame, p.boards, p.door, p.iron]) : grouped([p.frame, p.boards]);
    },
    createMaterial: () => loft ? [oakMaterial(), sawnBoardMaterial(), tarredBoardMaterial(), ironMaterial()] : [oakMaterial(), sawnBoardMaterial()],
    costGeometry: () => boardGableCostGeometry(width, loft)
  };
}
var BoardGablePiece = boardGablePiece("board-gable", "Weatherboard Gable (4m)", false);
var BoardGableLoftPiece = boardGablePiece(
  "board-gable-loft",
  "Weatherboard Gable (Loft Door)",
  true
);
var BoardGable6Piece = boardGablePiece(
  "board-gable-6",
  "Weatherboard Gable (6m)",
  false,
  3
);
var BoardGable6LoftPiece = boardGablePiece(
  "board-gable-6-loft",
  "Weatherboard Gable (6m, Loft Door)",
  true,
  3
);
var CornerBoardPiece = {
  id: "corner-board",
  label: "Corner Board",
  category: "Structural",
  material: "plank",
  tier: 2,
  length: BOARD_WALL_HEIGHT,
  connectors: propConnectors(BOARD_WALL_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createCornerBoardGeometry,
  createMaterial: () => sawnBoardMaterial()
};
var BoardFloorPiece = {
  id: "board-floor",
  label: "Board Floor",
  category: "Foundation",
  material: "plank",
  tier: 2,
  length: BOARD_FLOOR_SIZE,
  connectors: boxFaceConnectors(BOARD_FLOOR_SIZE, BOARD_FLOOR_THICKNESS, BOARD_FLOOR_SIZE),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createBoardFloorGeometry,
  createMaterial: () => sawnBoardMaterial()
};
var StaddleStonePiece = {
  id: "staddle-stone",
  label: "Staddle Stone",
  category: "Foundation",
  material: "stone",
  tier: 2,
  length: STADDLE_HEIGHT,
  connectors: propConnectors(STADDLE_HEIGHT),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createStaddleStoneGeometry,
  createMaterial: () => stoneMaterial(10130826)
};
var HoistTacklePiece = {
  id: "hoist-tackle",
  label: "Hoist Tackle",
  category: "Props",
  material: "wood",
  tier: 2,
  length: 0.3,
  connectors: propConnectors(0.3),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => createHoistTackleGeometry(),
  createMaterial: () => [
    woodMaterial(7229492),
    new THREE14.MeshStandardMaterial({ color: 10784098, roughness: 1 }),
    ironMaterial(),
    new THREE14.MeshStandardMaterial({ color: 11902060, roughness: 1 })
  ]
};
function tunnelDarkMaterial() {
  return new THREE14.MeshStandardMaterial({ color: 723207, roughness: 1 });
}
var MineHillPiece = {
  id: "mine-hill",
  label: "Mine Hill",
  category: "Foundation",
  material: "earth",
  tier: 2,
  length: MINE_HILL.width,
  connectors: propConnectors(MINE_HILL.height),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: () => createMineHillGeometry(),
  createMaterial: () => [
    stoneMaterial(8288108),
    new THREE14.MeshStandardMaterial({ color: 5924404, roughness: 1 })
  ]
};
var AditPortalPiece = {
  id: "adit-portal",
  label: "Adit Portal",
  category: "Props",
  material: "wood",
  tier: 2,
  length: 2,
  connectors: propConnectors(2.6),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createAditPortalGeometry,
  createMaterial: () => [oakMaterial(), tunnelDarkMaterial()]
};
var MineRailPiece = {
  id: "mine-rail",
  label: "Mine Rails",
  category: "Foundation",
  material: "wood",
  tier: 2,
  length: RAIL_LENGTH,
  connectors: endConnectors(RAIL_LENGTH),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createMineRailGeometry,
  createMaterial: () => [oakMaterial(), ironMaterial()]
};
var OreCartPiece = {
  id: "ore-cart",
  label: "Ore Cart",
  category: "Props",
  material: "wood",
  tier: 2,
  length: 1.1,
  connectors: propConnectors(0.8),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createOreCartGeometry,
  createMaterial: () => [
    oakMaterial(),
    ironMaterial(),
    new THREE14.MeshStandardMaterial({ color: 6048320, roughness: 0.9, flatShading: true })
  ]
};
var SpoilHeapPiece = {
  id: "spoil-heap",
  label: "Spoil Heap",
  category: "Props",
  material: "earth",
  tier: 2,
  length: 3,
  connectors: propConnectors(1),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createSpoilHeapGeometry,
  createMaterial: () => stoneMaterial(8024678)
};
var MineShaftPiece = {
  id: "mine-shaft",
  label: "Mine Shaft",
  category: "Foundation",
  material: "wood",
  tier: 2,
  length: SHAFT_SIZE + 0.5,
  connectors: propConnectors(0.22),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createMineShaftGeometry,
  createMaterial: () => [oakMaterial(), tunnelDarkMaterial()]
};
var HeadframePiece = {
  id: "headframe",
  label: "Headframe",
  category: "Props",
  material: "wood",
  tier: 2,
  length: 2.4,
  connectors: propConnectors(HEADFRAME_HEIGHT + 1.2),
  defaultRotationIndex: ROTATION_INDEX.Horizontal,
  createGeometry: createHeadframeGeometry,
  createMaterial: () => [
    barkMaterial(7031339),
    ironMaterial(),
    new THREE14.MeshStandardMaterial({ color: 10784098, roughness: 1 })
  ]
};
var flat = (color, roughness = 0.9) => () => new THREE14.MeshStandardMaterial({ color, roughness });
var CRAFT_MATERIALS = {
  oak: oakMaterial,
  bark: () => barkMaterial(7031339),
  sawn: sawnBoardMaterial,
  fresh: freshSawnMaterial,
  tarred: tarredBoardMaterial,
  iron: ironMaterial,
  stone: () => stoneMaterial(),
  sandstone: () => stoneMaterial(11772028),
  dressed: () => stoneMaterial(12761512),
  shingle: shingleMaterial,
  daub: daubMaterial,
  straw: thatchMaterial,
  dark: tunnelDarkMaterial,
  clay: () => stoneMaterial(11565653, 1),
  hide: hideMaterial,
  leather: flat(6044450, 0.7),
  warp: () => new THREE14.MeshStandardMaterial({ color: 15129796, roughness: 1, side: THREE14.DoubleSide }),
  natural: flat(14274482, 1),
  red: flat(9321260, 1),
  blue: flat(4085111, 1),
  water: () => new THREE14.MeshStandardMaterial({ color: 3953240, roughness: 0.15, metalness: 0.1 }),
  liquor: () => new THREE14.MeshStandardMaterial({ color: 3810836, roughness: 0.25 }),
  willow: flat(9206344),
  cord: flat(10126424, 1),
  ember: () => new THREE14.MeshStandardMaterial({ color: 4198400, emissive: 16734736, emissiveIntensity: 1.6 }),
  soap: flat(15129782, 0.6),
  cheese: flat(14857806, 0.7),
  contents: flat(14207126, 0.5),
  earth: () => stoneMaterial(5982778, 1),
  turf: flat(5924404, 1),
  tar: () => new THREE14.MeshStandardMaterial({ color: 920586, roughness: 0.2 }),
  white: () => new THREE14.MeshStandardMaterial({ color: 15262420, roughness: 1, side: THREE14.DoubleSide }),
  paintRed: () => new THREE14.MeshStandardMaterial({ color: 10103326, roughness: 1, side: THREE14.DoubleSide }),
  yew: flat(13145434, 0.7),
  herb: flat(6257212, 1),
  dry: flat(10127952, 1),
  leaves: flat(5008172, 1),
  fruit: flat(11876902, 0.6),
  wood: () => woodMaterial(8018490),
  shade: flat(2826521, 1),
  brickwork: brickMaterial,
  glass: glassMaterial,
  tile: tileMaterial,
  masonry: masonryMaterial,
  slate: () => slateMaterial(false),
  scales: () => slateMaterial(true),
  lime: limeMaterial,
  wax: flat(15655615, 0.6),
  // Unlit by day, burning after dark: the same lantern glow as the hung Lantern prop (environment.daylight drives it).
  glow: () => LANTERN_GLOW_MATERIAL,
  gold: () => new THREE14.MeshStandardMaterial({ color: 13214266, roughness: 0.3, metalness: 0.8 }),
  copper: () => new THREE14.MeshStandardMaterial({ color: 11561532, roughness: 0.35, metalness: 0.7 })
};
var shell = (area, thickness = 0.03) => () => new THREE14.BoxGeometry(1, thickness, area);
function craft(id, label, material, height, createGeometry, materials, opts = {}) {
  return {
    id,
    label,
    category: opts.category ?? "Props",
    material,
    tier: opts.tier ?? 2,
    length: opts.length ?? 1,
    connectors: opts.connectors ?? propConnectors(height),
    defaultRotationIndex: ROTATION_INDEX.Horizontal,
    createGeometry,
    // One material unwrapped: a geometry without draw groups (a rustic pole) draws nothing against an array.
    createMaterial: () => materials.length === 1 ? CRAFT_MATERIALS[materials[0]]() : materials.map((m) => CRAFT_MATERIALS[m]()),
    ...opts.cost ? { costGeometry: opts.cost } : {}
  };
}
var CRAFT_PIECES = [
  craft("standing-torch", "Standing Torch", "wood", 1.9, createStandingTorchGeometry, ["oak", "iron", "glow"], {
    length: 0.5,
    tier: 1
  }),
  craft("lantern-post", "Lantern Post", "wood", 2.3, createLanternPostGeometry, ["oak", "iron", "glow"], {
    length: 0.7,
    tier: 2
  }),
  craft("loom", "Floor Loom", "wood", 1.75, createLoomGeometry, ["oak", "warp", "red"], {
    length: 1.5
  }),
  craft("cloth-bolts", "Cloth Bolts", "wood", 0.55, createClothBoltsGeometry, [
    "oak",
    "natural",
    "red",
    "blue"
  ]),
  craft(
    "tanning-pit",
    "Tanning Pit",
    "wood",
    0.15,
    createTanningPitGeometry,
    ["oak", "liquor", "hide"],
    { length: 1.5 }
  ),
  craft(
    "hide-frame",
    "Hide Stretching Frame",
    "wood",
    1.95,
    createHideFrameGeometry,
    ["bark", "hide", "cord"],
    { length: 1.7 }
  ),
  craft("scraping-beam", "Tanner's Beam", "wood", 1, createScrapingBeamGeometry, [
    "bark",
    "hide"
  ]),
  craft(
    "cobbler-bench",
    "Cobbler's Bench",
    "wood",
    0.8,
    createCobblerBenchGeometry,
    ["oak", "leather", "iron"],
    { length: 1.2 }
  ),
  craft(
    "shop-board",
    "Shop Board",
    "wood",
    1,
    createShopBoardGeometry,
    ["sawn", "oak", "leather"],
    { length: 1.4 }
  ),
  craft("stave-rack", "Stave Rack", "wood", 1.75, createStaveRackGeometry, ["bark", "yew"], {
    length: 1.6
  }),
  craft("target-butt", "Archery Butt", "wood", 1.6, createTargetButtGeometry, [
    "straw",
    "bark",
    "white",
    "paintRed"
  ]),
  craft("barrel-truss", "Barrel Being Raised", "plank", 0.85, createBarrelTrussGeometry, [
    "sawn",
    "iron"
  ]),
  craft(
    "wheel-stand",
    "Wheel on its Stool",
    "wood",
    0.6,
    createWheelStandGeometry,
    ["oak", "iron"],
    { length: 1.2 }
  ),
  craft(
    "cart-frame",
    "Cart Being Built",
    "plank",
    1.2,
    createCartFrameGeometry,
    ["fresh", "oak", "iron"],
    { length: 2.2 }
  ),
  craft(
    "forge",
    "Small Forge",
    "stone",
    2.25,
    createForgeGeometry,
    ["stone", "iron", "ember", "leather", "bark"],
    { length: 1.3 }
  ),
  craft("grindstone", "Grindstone", "wood", 1.1, createGrindstoneGeometry, [
    "oak",
    "sandstone",
    "iron"
  ]),
  craft("tool-rack", "Tool Board", "wood", 1.75, createToolRackGeometry, ["oak", "iron"], {
    length: 1.4
  }),
  craft(
    "willow-trough",
    "Willow Soaking Trough",
    "wood",
    0.6,
    createWillowTroughGeometry,
    ["sawn", "water", "willow"],
    { length: 2 }
  ),
  craft("willow-bundles", "Willow Bundles", "wood", 1.7, createWillowBundlesGeometry, [
    "willow",
    "cord"
  ]),
  craft("cauldron", "Cauldron on a Tripod", "wood", 1.45, createCauldronGeometry, [
    "iron",
    "contents"
  ]),
  craft("soap-rack", "Soap Rack", "wood", 1.2, createSoapRackGeometry, ["oak", "soap"], {
    length: 1.2
  }),
  craft("cheese-press", "Cheese Press", "wood", 1.45, createCheesePressGeometry, [
    "oak",
    "cheese",
    "iron"
  ]),
  craft(
    "cheese-shelf",
    "Cheese Shelves",
    "wood",
    1.6,
    createCheeseShelfGeometry,
    ["oak", "cheese"],
    { length: 1.4 }
  ),
  craft("milk-churn", "Butter Churn", "plank", 1.3, createMilkChurnGeometry, [
    "sawn",
    "iron"
  ]),
  craft(
    "bread-oven",
    "Bread Oven",
    "stone",
    2,
    createBreadOvenGeometry,
    ["stone", "clay", "dark", "oak"],
    { length: 1.7 }
  ),
  craft(
    "skep-bench",
    "Skep Bench",
    "wood",
    1,
    createSkepBenchGeometry,
    ["oak", "straw", "dark"],
    { length: 1.8 }
  ),
  craft(
    "hen-house",
    "Hen House",
    "plank",
    1.7,
    createHenHouseGeometry,
    ["sawn", "oak", "shingle", "dark"],
    { length: 1.4, cost: shell(6) }
  ),
  craft(
    "water-trough",
    "Water Trough",
    "wood",
    0.42,
    createWaterTroughGeometry,
    ["sawn", "water"],
    { length: 1.8 }
  ),
  craft("hay-rack", "Hay Rack", "wood", 1.35, createHayRackGeometry, ["bark", "straw"], {
    length: 1.8
  }),
  craft(
    "mill-trestle",
    "Post Mill Trestle",
    "wood",
    MILL_POST_TOP,
    createMillTrestleGeometry,
    ["oak", "stone"],
    { length: 3.4 }
  ),
  craft(
    "mill-buck",
    "Post Mill Body",
    "plank",
    3.8,
    createMillBuckGeometry,
    ["sawn", "oak", "shingle", "dark"],
    { length: 2.4, cost: shell(48, 0.12) }
  ),
  craft(
    "mill-sails",
    "Mill Sails",
    "wood",
    MILL_SAIL_RADIUS,
    createMillSailsGeometry,
    ["oak", "natural"],
    { length: 2 * MILL_SAIL_RADIUS }
  ),
  craft(
    "rubble-wall",
    "Fieldstone Wall",
    "stone",
    RUBBLE_WALL.height,
    () => createRubbleWallGeometry("none"),
    ["stone", "oak", "tarred", "dark"],
    { length: 2, category: "Structural", cost: () => new THREE14.BoxGeometry(2, 2.2, 0.25) }
  ),
  craft(
    "rubble-wall-door",
    "Fieldstone Wall (Door)",
    "stone",
    RUBBLE_WALL.height,
    () => createRubbleWallGeometry("door"),
    ["stone", "oak", "tarred", "dark"],
    { length: 2, category: "Structural", cost: () => new THREE14.BoxGeometry(2, 1.4, 0.25) }
  ),
  craft(
    "rubble-wall-vent",
    "Fieldstone Wall (Vent)",
    "stone",
    RUBBLE_WALL.height,
    () => createRubbleWallGeometry("vent"),
    ["stone", "oak", "tarred", "dark"],
    { length: 2, category: "Structural", cost: () => new THREE14.BoxGeometry(2, 2.1, 0.25) }
  ),
  craft(
    "cellar-mound",
    "Root Cellar Mound",
    "earth",
    1.6,
    createCellarMoundGeometry,
    ["earth", "turf", "stone", "tarred", "dark"],
    { length: 3.6, category: "Foundation" }
  ),
  craft("banker", "Mason's Banker", "stone", 0.9, createBankerGeometry, [
    "stone",
    "oak",
    "iron",
    "dressed"
  ]),
  craft(
    "ashlar-stack",
    "Dressed Stone Stack",
    "stone",
    0.8,
    createAshlarStackGeometry,
    ["dressed"],
    { length: 1.3 }
  ),
  craft(
    "sheerlegs",
    "Sheerlegs",
    "wood",
    3.6,
    createSheerlegsGeometry,
    ["bark", "cord", "iron", "stone"],
    { length: 2 }
  ),
  craft(
    "charcoal-clamp",
    "Charcoal Clamp",
    "earth",
    CLAMP_SMOKE_Y,
    createCharcoalClampGeometry,
    ["earth", "turf", "dark"],
    { length: 2.8 }
  ),
  craft(
    "turf-hut",
    "Collier's Hut",
    "earth",
    2.45,
    createTurfHutGeometry,
    ["turf", "bark", "dark"],
    { length: 2.1 }
  ),
  craft("cordwood", "Cordwood", "wood", 1.05, createCordwoodGeometry, ["bark", "oak"], {
    length: 2
  }),
  craft(
    "tar-kiln",
    "Tar Kiln",
    "stone",
    0.9,
    createTarKilnGeometry,
    ["stone", "turf", "tar"],
    { length: 2.5, cost: () => new THREE14.BoxGeometry(1, 0.5, 1) }
  ),
  craft(
    "herb-bundles",
    "Drying Herbs",
    "wood",
    0.4,
    createHerbBundlesGeometry,
    ["oak", "herb", "dry"],
    { length: 1.8 }
  ),
  craft(
    "trestle-table",
    "Trestle Table",
    "plank",
    0.8,
    createTrestleTableGeometry,
    ["sawn", "oak", "clay"],
    { length: 2.4 }
  ),
  craft(
    "sawhorse",
    "Sawhorse",
    "wood",
    0.75,
    createSawhorseGeometry,
    ["fresh", "oak", "iron"],
    { length: 2 }
  ),
  craft("ladder", "Ladder", "wood", 3.2, createLadderGeometry, ["bark"]),
  craft("pole-stack", "Scaffold Poles", "wood", 0.4, createPoleStackGeometry, ["bark"], {
    length: 4
  }),
  craft(
    "fruit-tree",
    "Fruit Tree",
    "earth",
    3.2,
    createFruitTreeGeometry,
    ["bark", "leaves", "fruit"],
    { length: 2.4, cost: () => new THREE14.BoxGeometry(0.3, 0.3, 0.3) }
  ),
  craft(
    "pole-stall",
    "Pole Market Stall",
    "wood",
    2.3,
    createPoleStallGeometry,
    ["bark", "wood", "hide"],
    { length: 3.2 }
  ),
  craft(
    "tower-mill",
    "Stone Tower Mill",
    "stone",
    TOWER_MILL.height + 2.1,
    createTowerMillGeometry,
    ["stone", "oak", "dark", "straw"],
    {
      length: TOWER_MILL.baseRadius * 2,
      // A hollow tower: priced by its wall (0.5m of stone round it), not its volume.
      cost: () => new THREE14.BoxGeometry(2 * Math.PI * 1.8 * 0.5, 6, 0.12)
    }
  ),
  craft(
    "bloomery-furnace",
    "Bloomery Furnace",
    "clay",
    BLOOMERY_TOP + 0.1,
    createBloomeryGeometry,
    ["clay", "stone", "ember", "leather", "oak", "dark"],
    { length: 2.2 }
  ),
  craft("slag-heap", "Slag Heap", "earth", 0.35, createSlagHeapGeometry, ["tar"], {
    length: 1.4
  }),
  craft(
    "bloom-stump",
    "Bloom on the Anvil",
    "wood",
    0.75,
    createBloomStumpGeometry,
    ["wood", "ember", "iron"],
    { length: 1 }
  ),
  craft("bar-rack", "Iron Bar Rack", "wood", 0.6, createBarRackGeometry, ["oak", "iron"], {
    length: 1.5
  }),
  craft(
    "bean-trellis",
    "Bean Poles",
    "pole",
    1.9,
    createBeanTrellisGeometry,
    ["bark", "leaves", "herb"],
    { length: 2 }
  ),
  craft("fountain-basin", "Fountain", "stone", 2.2, createFountainGeometry, ["dressed", "water"], {
    length: 4.6,
    tier: 3,
    cost: () => new THREE14.CylinderGeometry(2.2, 2.2, 0.8, 12)
  }),
  craft(
    "grand-fountain",
    "Great Fountain",
    "stone",
    4.2,
    createGrandFountainGeometry,
    ["dressed", "water", "copper"],
    { length: 7.2, tier: 3, cost: () => new THREE14.CylinderGeometry(3.5, 3.5, 1.2, 12) }
  ),
  craft("hedge-panel", "Hedge", "earth", 1.4, createHedgePanelGeometry, ["leaves", "earth"], {
    length: 2,
    tier: 2,
    category: "Structural"
  }),
  craft("bell-cradle", "Bell Cradle", "wood", 2.1, createBellCradleGeometry, ["oak", "copper", "iron"], {
    length: 2.1,
    tier: 3
  }),
  craft(
    "stone-wall-run",
    "Stone Wall",
    "stone",
    3.1,
    createStoneWallRunGeometry,
    ["stone", "dressed"],
    { length: 4, tier: 3, category: "Structural" }
  ),
  craft(
    "paling-panel",
    "Paling Fence",
    "plank",
    1.15,
    createPalingPanelGeometry,
    ["oak", "fresh"],
    { length: 2, category: "Structural" }
  ),
  craft(
    "great-bellows",
    "Great Bellows",
    "wood",
    1.9,
    createGreatBellowsGeometry,
    ["oak", "leather", "iron"],
    { length: 1.8 }
  ),
  craft(
    "brick-stack",
    "Brick Forge Stack",
    "clay",
    BRICK_STACK_TOP,
    createBrickStackGeometry,
    ["clay", "ember", "iron"],
    { length: 1.4, tier: 3 }
  ),
  craft(
    "wash-basin",
    "Wash Basin",
    "stone",
    0.65,
    createWashBasinGeometry,
    ["sandstone", "water", "oak"],
    { length: 1.8, cost: () => new THREE14.BoxGeometry(1.8, 0.2, 0.7) }
  ),
  craft(
    "wash-tub",
    "Wash Tub",
    "wood",
    0.75,
    createWashTubGeometry,
    ["oak", "iron", "water"],
    { length: 1.2, cost: () => new THREE14.BoxGeometry(0.5, 0.2, 0.5) }
  ),
  craft(
    "clothes-line",
    "Drying Line",
    "wood",
    1.95,
    createClothesLineGeometry,
    ["bark", "cord", "natural", "blue", "red", "white"],
    { length: 3.2 }
  )
];
var TOWN_PIECES = [
  PlasterWallPiece,
  PlasterWallDoorPiece,
  PlasterWallWindowPiece,
  PlasterWallNarrowPiece,
  ...PLASTER_GABLES,
  ...STONE_GABLES,
  TileRoofPiece,
  TileRoofHalfPiece,
  BrickChimneyPiece,
  craft("jetty-joists", "Jetty Joists (2m)", "wood", 0.3, createJettyGeometry, ["oak"], {
    length: 2,
    category: "Framing",
    tier: 3
  }),
  craft("jetty-bracket", "Jetty Bracket", "wood", 1, createJettyBracketGeometry, ["oak"], {
    length: 0.6,
    category: "Framing",
    tier: 3
  }),
  ...["none", "door", "window"].map(
    (o) => craft(
      o === "none" ? "brick-wall" : `brick-wall-${o}`,
      o === "none" ? "Brick Wall" : `Brick Wall (${o === "door" ? "Door" : "Window"})`,
      "brick",
      BRICK_WALL.height,
      () => createBrickWallGeometry(o),
      ["brickwork", "dressed", "tarred", "glass"],
      { length: 2, category: "Structural", tier: 3 }
    )
  ),
  craft(
    "brick-hack",
    "Bricks Drying",
    "clay",
    0.95,
    createBrickHackGeometry,
    ["clay", "oak", "straw"],
    { length: 1.9, tier: 3, cost: () => new THREE14.BoxGeometry(0.2, 0.2, 0.2) }
  ),
  craft(
    "brick-clamp",
    "Brick Clamp",
    "clay",
    CLAMP_KILN_TOP,
    createBrickClampGeometry,
    ["brickwork", "ember", "earth"],
    { length: 2.4, tier: 3, cost: () => new THREE14.BoxGeometry(0.5, 0.5, 0.5) }
  ),
  craft(
    "clay-pit",
    "Clay Pit",
    "earth",
    0.2,
    createClayPitGeometry,
    ["earth", "clay", "dark", "oak"],
    { length: 2.4, tier: 3 }
  ),
  craft(
    "lime-kiln-stack",
    "Lime Kiln",
    "stone",
    LIME_KILN_TOP,
    createLimeKilnGeometry,
    ["stone", "earth", "ember", "dark"],
    { length: 3, tier: 3, cost: () => new THREE14.BoxGeometry(2, 2, 0.6) }
  ),
  craft(
    "glass-furnace",
    "Glass Furnace",
    "brick",
    GLASS_FURNACE_TOP,
    createGlassFurnaceGeometry,
    ["brickwork", "ember", "dressed", "iron"],
    { length: 2.4, tier: 3, cost: () => new THREE14.BoxGeometry(1.5, 1, 1) }
  ),
  craft("glass-rack", "Cooling Rack", "wood", 1.5, createGlassRackGeometry, ["oak", "glass"], {
    length: 1.4,
    tier: 3
  }),
  craft("louvre", "Ridge Louvre", "wood", 1.2, createLouvreGeometry, ["oak", "tile", "dark"], {
    length: 0.8,
    tier: 3
  }),
  craft(
    "hanging-sign",
    "Hanging Sign",
    "wood",
    0.6,
    createHangingSignGeometry,
    ["oak", "iron", "paintRed"],
    { length: 1, tier: 3 }
  ),
  craft("balcony", "Balcony", "plank", 1, createBalconyGeometry, ["oak", "sawn"], {
    length: 2.1,
    tier: 3
  }),
  craft(
    "stage",
    "Theatre Stage",
    "plank",
    4.5,
    createStageGeometry,
    ["oak", "sawn", "red", "tile", "blue"],
    { length: 6, tier: 3, cost: () => new THREE14.BoxGeometry(6, 0.3, 3.5) }
  ),
  craft(
    "bench-tiers",
    "Tiered Benches",
    "plank",
    1.4,
    createBenchTiersGeometry,
    ["oak", "sawn"],
    { length: 4, tier: 3 }
  ),
  craft("bellcote", "Bellcote", "wood", 1.5, createBellcoteGeometry, ["oak", "tile", "iron"], {
    length: 0.8,
    tier: 3
  }),
  craft(
    "stationer-bench",
    "Stationer's Bench",
    "wood",
    1.6,
    createStationerBenchGeometry,
    ["oak", "iron", "dark", "natural", "red"],
    { length: 1.6, tier: 3 }
  ),
  craft(
    "brew-copper",
    "Brewer's Copper",
    "brick",
    1.4,
    createBrewCopperGeometry,
    ["brickwork", "copper", "ember", "oak"],
    { length: 1.5, tier: 3, cost: () => new THREE14.BoxGeometry(0.8, 0.8, 0.8) }
  ),
  craft(
    "stone-column",
    "Stone Column",
    "stone",
    COLUMN_HEIGHT,
    createColumnGeometry,
    ["dressed"],
    { length: 0.5, tier: 3 }
  ),
  craft(
    "candle-frame",
    "Candle Dipping Frame",
    "wood",
    1.8,
    createCandleFrameGeometry,
    ["oak", "wax", "cord"],
    { length: 1.2, tier: 3 }
  ),
  craft(
    "armour-stand",
    "Armour Stand",
    "wood",
    1.7,
    createArmourStandGeometry,
    ["oak", "iron", "leather"],
    { length: 0.8, tier: 3 }
  ),
  craft(
    "jar-shelf",
    "Shelf of Jars",
    "wood",
    1.7,
    createJarShelfGeometry,
    ["oak", "clay", "glass", "herb"],
    { length: 1.4, tier: 3 }
  ),
  craft(
    "shrine",
    "Wayside Shrine",
    "stone",
    2.8,
    createShrineGeometry,
    ["stone", "oak", "tile", "dressed", "wax"],
    { length: 1.7, tier: 3 }
  ),
  craft(
    "tower-cap-2",
    "Tower Cap (2m)",
    "brick",
    2,
    () => createTowerCapGeometry(2.6, 2.2),
    ["tile", "iron"],
    { length: 2.6, tier: 3, category: "Roofing" }
  ),
  craft(
    "tower-cap-6",
    "Tower Cap (6m)",
    "brick",
    3.4,
    () => createTowerCapGeometry(5.2, 3.4),
    ["tile", "iron"],
    { length: 5.2, tier: 3, category: "Roofing" }
  ),
  craft("parapet", "Crenellated Parapet", "stone", 1.05, createParapetGeometry, ["stone"], {
    length: 2,
    tier: 3,
    category: "Structural"
  }),
  craft(
    "stair-turret",
    "Stair Turret",
    "stone",
    9.8,
    () => createStairTurretGeometry(8),
    ["stone", "tile", "dark"],
    { length: 1.9, tier: 3, cost: () => new THREE14.BoxGeometry(2, 8, 0.4) }
  ),
  craft(
    "counting-table",
    "Counting Table",
    "wood",
    1.2,
    createCountingTableGeometry,
    ["oak", "blue", "iron", "gold", "natural"],
    { length: 1.6, tier: 3 }
  ),
  craft(
    "vault-roof",
    "Stone Vault",
    "stone",
    1.2,
    () => createVaultRoofGeometry(4, 4),
    ["stone"],
    { length: 4.4, tier: 3, category: "Roofing", cost: () => new THREE14.BoxGeometry(4, 0.6, 4) }
  ),
  craft(
    "training-dummy",
    "Training Dummy",
    "wood",
    1.8,
    createTrainingDummyGeometry,
    ["oak", "straw", "red"],
    { length: 0.9, tier: 3 }
  ),
  craft("weapon-rack", "Weapon Rack", "wood", 2.2, createWeaponRackGeometry, ["oak", "iron"], {
    length: 1.5,
    tier: 3
  }),
  craft("stocks", "The Stocks", "wood", 1, createStocksGeometry, ["oak", "iron", "dark"], {
    length: 1.4,
    tier: 3
  }),
  craft(
    "curtain-wall",
    "Curtain Wall (4m)",
    "stone",
    CURTAIN_HEIGHT + 1.1,
    createCurtainWallGeometry,
    ["stone"],
    {
      length: 4,
      tier: 3,
      category: "Structural",
      cost: () => new THREE14.BoxGeometry(4, CURTAIN_HEIGHT, 0.5)
    }
  ),
  craft(
    "gatehouse",
    "Gatehouse",
    "stone",
    7.6,
    createGatehouseGeometry,
    ["stone", "iron", "dark", "oak"],
    { length: 9, tier: 3, cost: () => new THREE14.BoxGeometry(9, 7, 1.2) }
  ),
  craft(
    "clock-turret",
    "Clock Turret",
    "wood",
    3.6,
    createClockTurretGeometry,
    ["oak", "lime", "tile", "gold", "dark"],
    { length: 1.2, tier: 3 }
  ),
  craft(
    "rubble-wall-window",
    "Fieldstone Wall (Window)",
    "stone",
    RUBBLE_WALL.height,
    () => createRubbleWallGeometry("window"),
    ["stone", "oak", "tarred", "glass"],
    { length: 2, category: "Structural", cost: () => new THREE14.BoxGeometry(2, 2, 0.25) }
  )
];
var T1 = { tier: 1 };
var GABLE_COST = () => new THREE14.BoxGeometry(1, 0.26, 1);
var PRIMITIVE_PIECES = [
  craft(
    "sapling-pole",
    "Pole (3m)",
    "pole",
    0.11,
    (v5 = 0) => createSaplingPoleGeometry(3, 0.055, v5),
    ["bark"],
    { ...T1, length: 3, category: "Structural", connectors: endConnectors(3) }
  ),
  craft(
    "sapling-pole-long",
    "Pole (4.6m)",
    "pole",
    0.14,
    (v5 = 0) => createSaplingPoleGeometry(4.6, 0.065, v5),
    ["bark"],
    { ...T1, length: 4.6, category: "Structural", connectors: endConnectors(4.6) }
  ),
  craft(
    "forked-post",
    "Forked Post",
    "pole",
    2,
    () => createForkedPostGeometry(2),
    ["bark"],
    { ...T1, category: "Structural" }
  ),
  craft("pole-roof", "Pole Roof", "pole", 0.12, () => createPoleRoofGeometry(2), ["bark"], {
    ...T1,
    length: 2,
    category: "Roofing",
    cost: () => new THREE14.BoxGeometry(1, 0.02, 1)
  }),
  craft(
    "pole-roof-half",
    "Pole Roof (Half)",
    "pole",
    0.12,
    () => createPoleRoofGeometry(1),
    ["bark"],
    { ...T1, length: 1, category: "Roofing", cost: () => new THREE14.BoxGeometry(1, 0.01, 1) }
  ),
  craft(
    "dome-frame",
    "Bent-Stick Dome",
    "pole",
    DOME.height,
    createDomeFrameGeometry,
    ["bark"],
    { ...T1, length: 2 * DOME.radius, category: "Structural" }
  ),
  craft(
    "dome-weave",
    "Woven Stick Dome",
    "pole",
    DOME.height,
    createDomeWeaveGeometry,
    ["bark", "shade"],
    {
      ...T1,
      length: 2 * DOME.radius,
      category: "Structural",
      cost: () => new THREE14.BoxGeometry(1, 0.25, 1)
    }
  ),
  craft(
    "long-hearth",
    "Long Hearth",
    "stone",
    0.25,
    createLongHearthGeometry,
    ["stone", "ember", "bark"],
    { ...T1, length: 2.2 }
  ),
  craft("smoke-hole", "Smoke Hole", "pole", 0.45, createSmokeHoleGeometry, ["bark"], T1),
  craft(
    "stick-gable",
    "Pole Gable",
    "pole",
    STICK_GABLE.height,
    () => createStickGableGeometry(false),
    ["bark", "dark"],
    { ...T1, length: STICK_GABLE.width, category: "Roof Framing", cost: GABLE_COST }
  ),
  craft(
    "stick-gable-door",
    "Pole Gable (Door)",
    "pole",
    STICK_GABLE.height,
    () => createStickGableGeometry(true),
    ["bark", "dark"],
    { ...T1, length: STICK_GABLE.width, category: "Roof Framing", cost: GABLE_COST }
  ),
  craft("stick-fence", "Stick Fence", "pole", 1.05, createStickFenceGeometry, ["bark"], {
    ...T1,
    length: 2,
    category: "Structural"
  }),
  craft(
    "stick-cross",
    "Stick Cross",
    "pole",
    0.95,
    createStickCrossGeometry,
    ["bark", "cord"],
    T1
  ),
  craft("cairn", "Cairn", "stone", 0.6, createCairnGeometry, ["stone"], T1),
  craft(
    "grave-mound",
    "Grave Mound",
    "earth",
    0.25,
    createGraveMoundGeometry,
    ["earth", "turf"],
    { ...T1, length: 2 }
  ),
  craft(
    "well-hole",
    "Dug Well",
    "stone",
    0.35,
    createWellHoleGeometry,
    ["stone", "dark", "water"],
    { ...T1, length: 1.8, category: "Foundation" }
  ),
  craft(
    "rope-bucket",
    "Bucket and Rope",
    "wood",
    0.3,
    createRopeBucketGeometry,
    ["wood", "cord"],
    T1
  ),
  craft("dugout", "Dugout Canoe", "wood", 0.4, createDugoutGeometry, ["wood", "leather"], {
    ...T1,
    length: 3.2
  }),
  craft("fish-trap", "Fish Trap", "wood", 0.42, createFishTrapGeometry, ["willow"], T1),
  craft(
    "knapping-spot",
    "Knapping Spot",
    "stone",
    0.6,
    createKnappingSpotGeometry,
    ["stone", "bark", "hide", "cord"],
    { ...T1, length: 1.6 }
  ),
  craft("pole-pile", "Pile of Poles", "pole", 0.35, createPolePileGeometry, ["bark"], {
    ...T1,
    length: 3
  }),
  craft("pole-rack", "Drying Pole", "pole", 1.95, createPoleRackGeometry, ["bark"], {
    ...T1,
    length: 2.8
  }),
  craft(
    "pegged-hide",
    "Pegged Hide",
    "wood",
    0.14,
    createPeggedHideGeometry,
    ["hide", "bark"],
    { ...T1, length: 1.5 }
  )
];
var masonryShell = (w, h, d) => () => new THREE14.BoxGeometry(w, h, d);
var RING_WALL_AREA = Math.PI * (ROUND_RADIUS ** 2 - (ROUND_RADIUS - 1.8) ** 2);
var CORNER_WALL_AREA = Math.PI * (CORNER_RADIUS ** 2 - (CORNER_RADIUS - 1.8) ** 2);
var CASTLE_PIECES = [
  craft(
    "castle-wall",
    "Castle Wall Course (4m x 1m)",
    "stone",
    1,
    createWallCourseGeometry,
    ["masonry"],
    { length: WALL_SECTION, tier: 3, category: "Structural" }
  ),
  craft(
    "castle-wall-plinth",
    "Castle Wall Plinth",
    "stone",
    PLINTH_HEIGHT2,
    createWallPlinthGeometry,
    ["masonry", "dressed"],
    { length: WALL_SECTION, tier: 3, category: "Foundation" }
  ),
  craft(
    "castle-rampart",
    "Rampart (walk + battlements)",
    "stone",
    PARAPET_HEIGHT,
    createRampartGeometry,
    ["masonry", "dressed", "dark"],
    {
      length: WALL_SECTION,
      tier: 3,
      category: "Structural",
      cost: masonryShell(4, 1.6, 0.6)
    }
  ),
  craft(
    "castle-wall-coping",
    "Wall Coping (plain wall top)",
    "stone",
    0.55,
    createWallCopingGeometry,
    ["dressed"],
    { length: WALL_SECTION, tier: 3, category: "Structural" }
  ),
  craft(
    "castle-postern",
    "Postern (sally-port door)",
    "stone",
    2.6,
    createPosternGeometry,
    ["dressed", "dark", "oak"],
    { length: 1.6, tier: 3, category: "Openings" }
  ),
  craft(
    "castle-stair",
    "Rampart Stair Flight (1m rise)",
    "stone",
    1,
    createRampartStairGeometry,
    ["masonry", "dressed"],
    { length: STAIR_RUN, tier: 3, category: "Structural" }
  ),
  craft(
    "castle-stair-fill",
    "Rampart Stair Fill",
    "stone",
    1,
    createStairFillGeometry,
    ["masonry"],
    { length: STAIR_RUN, tier: 3, category: "Foundation" }
  ),
  craft(
    "castle-round-plinth",
    "Round Tower Plinth",
    "stone",
    PLINTH_HEIGHT2,
    createRoundPlinthGeometry,
    ["masonry", "dressed"],
    { length: ROUND_RADIUS * 2, tier: 3, category: "Foundation" }
  ),
  craft(
    "castle-round-storey",
    "Round Tower Storey",
    "stone",
    CASTLE_STOREY,
    createRoundStoreyGeometry,
    ["masonry", "dressed", "dark", "oak"],
    {
      length: ROUND_RADIUS * 2,
      tier: 3,
      category: "Structural",
      cost: masonryShell(RING_WALL_AREA, CASTLE_STOREY, 1)
    }
  ),
  craft(
    "castle-round-storey-door",
    "Round Tower Storey (Door)",
    "stone",
    CASTLE_STOREY,
    (v5) => createRoundStoreyGeometry(v5, true),
    ["masonry", "dressed", "dark", "oak"],
    {
      length: ROUND_RADIUS * 2,
      tier: 3,
      category: "Structural",
      cost: masonryShell(RING_WALL_AREA, CASTLE_STOREY, 1)
    }
  ),
  craft(
    "castle-round-battlements",
    "Round Tower Battlements",
    "stone",
    PARAPET_HEIGHT,
    createRoundBattlementsGeometry,
    ["masonry", "dressed", "dark", "oak"],
    {
      length: ROUND_RADIUS * 2,
      tier: 3,
      category: "Structural",
      cost: masonryShell(2 * Math.PI * 3.7, 1.6, 0.6)
    }
  ),
  craft(
    "castle-round-roof",
    "Round Tower Cone Roof",
    "stone",
    9.5,
    createRoundRoofGeometry,
    ["dressed", "scales", "iron"],
    {
      length: ROUND_RADIUS * 2,
      tier: 3,
      category: "Roofing",
      cost: masonryShell(2 * Math.PI * 4, 0.35, 0.4)
    }
  ),
  craft(
    "castle-corner-plinth",
    "Corner Tower Plinth",
    "stone",
    PLINTH_HEIGHT2,
    createCornerPlinthGeometry,
    ["masonry", "dressed"],
    { length: CORNER_RADIUS * 2, tier: 3, category: "Foundation" }
  ),
  craft(
    "castle-corner-storey",
    "Corner Tower Storey",
    "stone",
    CASTLE_STOREY,
    createCornerStoreyGeometry,
    ["masonry", "dressed", "dark", "oak"],
    {
      length: CORNER_RADIUS * 2,
      tier: 3,
      category: "Structural",
      cost: masonryShell(CORNER_WALL_AREA, CASTLE_STOREY, 1)
    }
  ),
  craft(
    "castle-corner-storey-door",
    "Corner Tower Storey (Door)",
    "stone",
    CASTLE_STOREY,
    (v5) => createCornerStoreyGeometry(v5, true),
    ["masonry", "dressed", "dark", "oak"],
    {
      length: CORNER_RADIUS * 2,
      tier: 3,
      category: "Structural",
      cost: masonryShell(CORNER_WALL_AREA, CASTLE_STOREY, 1)
    }
  ),
  craft(
    "castle-corner-battlements",
    "Corner Tower Battlements",
    "stone",
    PARAPET_HEIGHT,
    createCornerBattlementsGeometry,
    ["masonry", "dressed", "dark", "oak"],
    {
      length: CORNER_RADIUS * 2,
      tier: 3,
      category: "Structural",
      cost: masonryShell(2 * Math.PI * (CORNER_RADIUS - 0.3), 1.6, 0.6)
    }
  ),
  craft(
    "castle-corner-roof",
    "Corner Tower Cone Roof",
    "stone",
    9.5 * (CORNER_RADIUS / ROUND_RADIUS),
    createCornerRoofGeometry,
    ["dressed", "scales", "iron"],
    {
      length: CORNER_RADIUS * 2,
      tier: 3,
      category: "Roofing",
      cost: masonryShell(2 * Math.PI * (CORNER_RADIUS + 0.3), 0.35, 0.4)
    }
  ),
  craft(
    "castle-dtower-plinth",
    "D-Tower Plinth",
    "stone",
    PLINTH_HEIGHT2,
    createDTowerPlinthGeometry,
    ["masonry", "dressed"],
    { length: DTOWER_RADIUS * 2, tier: 3, category: "Foundation" }
  ),
  craft(
    "castle-dtower-storey",
    "D-Tower Storey",
    "stone",
    CASTLE_STOREY,
    createDTowerStoreyGeometry,
    ["masonry", "dressed", "dark"],
    {
      length: DTOWER_RADIUS * 2,
      tier: 3,
      category: "Structural",
      cost: masonryShell(RING_WALL_AREA / 2, CASTLE_STOREY, 1)
    }
  ),
  craft(
    "castle-dtower-battlements",
    "D-Tower Battlements",
    "stone",
    PARAPET_HEIGHT,
    createDTowerBattlementsGeometry,
    ["masonry", "dressed", "dark", "oak"],
    {
      length: DTOWER_RADIUS * 2,
      tier: 3,
      category: "Structural",
      cost: masonryShell(Math.PI * 3.7, 1.6, 0.6)
    }
  ),
  craft(
    "castle-dtower-roof",
    "D-Tower Half-Cone Roof",
    "stone",
    9.5,
    createDTowerRoofGeometry,
    ["dressed", "scales", "iron"],
    {
      length: DTOWER_RADIUS * 2,
      tier: 3,
      category: "Roofing",
      cost: masonryShell(Math.PI * 4, 0.35, 0.4)
    }
  ),
  craft(
    "castle-octagon-plinth",
    "Octagon Tower Plinth",
    "stone",
    PLINTH_HEIGHT2,
    createOctagonPlinthGeometry,
    ["masonry", "dressed"],
    { length: OCTAGON_RADIUS * 2, tier: 3, category: "Foundation" }
  ),
  craft(
    "castle-octagon-storey",
    "Octagon Tower Storey",
    "stone",
    CASTLE_STOREY,
    createOctagonStoreyGeometry,
    ["masonry", "dressed", "dark", "oak"],
    {
      length: OCTAGON_RADIUS * 2,
      tier: 3,
      category: "Structural",
      cost: masonryShell(RING_WALL_AREA, CASTLE_STOREY, 1)
    }
  ),
  craft(
    "castle-octagon-storey-door",
    "Octagon Tower Storey (Door)",
    "stone",
    CASTLE_STOREY,
    (v5) => createOctagonStoreyGeometry(v5, true),
    ["masonry", "dressed", "dark", "oak"],
    {
      length: OCTAGON_RADIUS * 2,
      tier: 3,
      category: "Structural",
      cost: masonryShell(RING_WALL_AREA, CASTLE_STOREY, 1)
    }
  ),
  craft(
    "castle-octagon-battlements",
    "Octagon Tower Battlements",
    "stone",
    PARAPET_HEIGHT,
    createOctagonBattlementsGeometry,
    ["masonry", "dressed", "dark", "oak"],
    {
      length: OCTAGON_RADIUS * 2,
      tier: 3,
      category: "Structural",
      cost: masonryShell(2 * Math.PI * 3.7, 1.6, 0.6)
    }
  ),
  craft(
    "castle-octagon-roof",
    "Octagon Tower Pyramid Roof",
    "stone",
    8.5,
    createOctagonRoofGeometry,
    ["dressed", "scales", "iron"],
    {
      length: OCTAGON_RADIUS * 2,
      tier: 3,
      category: "Roofing",
      cost: masonryShell(2 * Math.PI * 4, 0.35, 0.4)
    }
  ),
  craft(
    "castle-square-plinth",
    "Square Tower Plinth",
    "stone",
    PLINTH_HEIGHT2,
    createSquarePlinthGeometry,
    ["masonry", "dressed"],
    { length: SQUARE_SIDE, tier: 3, category: "Foundation" }
  ),
  craft(
    "castle-square-storey",
    "Square Tower Storey",
    "stone",
    CASTLE_STOREY,
    createSquareStoreyGeometry,
    ["masonry", "dressed", "dark", "oak"],
    {
      length: SQUARE_SIDE,
      tier: 3,
      category: "Structural",
      cost: masonryShell(4 * (SQUARE_SIDE - 1.6), CASTLE_STOREY, 1.6)
    }
  ),
  craft(
    "castle-square-storey-door",
    "Square Tower Storey (Door)",
    "stone",
    CASTLE_STOREY,
    (v5) => createSquareStoreyGeometry(v5, SQUARE_SIDE, SQUARE_SIDE, "door"),
    ["masonry", "dressed", "dark", "oak"],
    {
      length: SQUARE_SIDE,
      tier: 3,
      category: "Structural",
      cost: masonryShell(4 * (SQUARE_SIDE - 1.6), CASTLE_STOREY, 1.6)
    }
  ),
  craft(
    "castle-square-battlements",
    "Square Tower Battlements",
    "stone",
    PARAPET_HEIGHT,
    createSquareBattlementsGeometry,
    ["masonry", "dressed", "dark", "oak"],
    {
      length: SQUARE_SIDE,
      tier: 3,
      category: "Structural",
      cost: masonryShell(4 * SQUARE_SIDE, 1.6, 0.6)
    }
  ),
  craft(
    "castle-square-roof",
    "Square Tower Pyramid Roof",
    "stone",
    6.5,
    createSquareRoofGeometry,
    ["dressed", "slate", "iron"],
    {
      length: SQUARE_SIDE,
      tier: 3,
      category: "Roofing",
      cost: masonryShell(4 * SQUARE_SIDE, 0.3, 0.4)
    }
  ),
  craft(
    "castle-gate-arch",
    "Gatehouse Passage",
    "stone",
    GATE_PASSAGE_HEIGHT,
    createGateArchGeometry,
    ["masonry", "dressed", "iron", "oak", "dark"],
    {
      length: GATE_WIDTH,
      tier: 3,
      category: "Openings",
      cost: masonryShell(GATE_WIDTH, GATE_PASSAGE_HEIGHT, GATE_DEPTH * 0.45)
    }
  ),
  craft(
    "castle-gate-course",
    "Gatehouse Course (1m)",
    "stone",
    1,
    createGateCourseGeometry,
    ["masonry"],
    { length: GATE_WIDTH, tier: 3, category: "Structural" }
  ),
  craft(
    "castle-gate-battlements",
    "Gatehouse Battlements",
    "stone",
    PARAPET_HEIGHT,
    createGateBattlementsGeometry,
    ["masonry", "dressed", "dark"],
    {
      length: GATE_WIDTH,
      tier: 3,
      category: "Structural",
      cost: masonryShell(2 * GATE_WIDTH, 1.6, 0.6)
    }
  ),
  craft(
    "castle-gatetower-arch",
    "Gate Tower Passage",
    "stone",
    GATE_PASSAGE_HEIGHT,
    (v5) => createGateArchGeometry(v5, SQUARE_SIDE),
    ["masonry", "dressed", "iron", "oak", "dark"],
    {
      length: SQUARE_SIDE,
      tier: 3,
      category: "Openings",
      cost: masonryShell(SQUARE_SIDE, GATE_PASSAGE_HEIGHT, GATE_DEPTH * 0.45)
    }
  ),
  craft(
    "castle-gatetower-storey",
    "Gate Tower Storey",
    "stone",
    CASTLE_STOREY,
    (v5) => createSquareStoreyGeometry(v5, SQUARE_SIDE, SQUARE_SIDE, "windows"),
    ["masonry", "dressed", "dark", "oak"],
    {
      length: SQUARE_SIDE,
      tier: 3,
      category: "Structural",
      cost: masonryShell(4 * (SQUARE_SIDE - 1.6), CASTLE_STOREY, 1.6)
    }
  ),
  craft(
    "castle-range-wall",
    "Stone Range Wall (4m, window)",
    "stone",
    CASTLE_STOREY,
    createRangeWallGeometry,
    ["masonry", "dressed", "dark", "oak"],
    {
      length: RANGE_SECTION,
      tier: 3,
      category: "Structural",
      cost: masonryShell(RANGE_SECTION - 0.6, CASTLE_STOREY, 0.5)
    }
  ),
  craft(
    "castle-range-wall-door",
    "Stone Range Wall (4m, door)",
    "stone",
    CASTLE_STOREY,
    (v5) => createRangeWallGeometry(v5, true),
    ["masonry", "dressed", "dark", "oak"],
    {
      length: RANGE_SECTION,
      tier: 3,
      category: "Structural",
      cost: masonryShell(RANGE_SECTION - 0.6, CASTLE_STOREY, 0.5)
    }
  ),
  craft(
    "castle-range-roof",
    "Stone Range Lean-To Roof (4m, tile)",
    "stone",
    CASTLE_STOREY + 0.3,
    createRangeRoofGeometry,
    ["dressed", "tile"],
    {
      length: RANGE_SECTION,
      tier: 3,
      category: "Roofing",
      cost: masonryShell(RANGE_SECTION + 0.3, RANGE_DEPTH + 0.3, 0.18)
    }
  ),
  craft(
    "castle-range-roof-slate",
    "Stone Range Lean-To Roof (4m, slate)",
    "stone",
    CASTLE_STOREY + 0.3,
    createRangeRoofGeometry,
    ["dressed", "scales"],
    {
      length: RANGE_SECTION,
      tier: 3,
      category: "Roofing",
      cost: masonryShell(RANGE_SECTION + 0.3, RANGE_DEPTH + 0.3, 0.18)
    }
  ),
  craft(
    "castle-range-roof-gabled",
    "Stone Range Gabled Roof (4m, free-standing)",
    "stone",
    CASTLE_STOREY + 0.3 + 1.8,
    createRangeGableRoofGeometry,
    ["dressed", "tile"],
    {
      length: RANGE_SECTION,
      tier: 3,
      category: "Roofing",
      cost: masonryShell(RANGE_SECTION + 0.3, RANGE_DEPTH + 0.3, 0.18 * 2)
    }
  ),
  craft(
    "castle-range-wall-timber",
    "Timber Range Wall (4m, window)",
    "wood",
    TIMBER_WALL_HEIGHT,
    createTimberRangeWallGeometry,
    ["oak", "daub", "oak", "iron"],
    {
      length: RANGE_SECTION,
      tier: 2,
      category: "Structural",
      cost: () => timberWallCostGeometry(RANGE_SECTION, { width: 0.9, height: 0.8, sill: 1.15 }, "window")
    }
  ),
  craft(
    "castle-range-wall-timber-door",
    "Timber Range Wall (4m, door)",
    "wood",
    TIMBER_WALL_HEIGHT,
    (v5) => createTimberRangeWallGeometry(v5, true),
    ["oak", "daub", "oak", "iron"],
    {
      length: RANGE_SECTION,
      tier: 2,
      category: "Structural",
      cost: () => timberWallCostGeometry(RANGE_SECTION, { width: 1.1, height: 1.85, sill: 0 }, "door")
    }
  ),
  craft(
    "castle-range-roof-timber",
    "Timber Range Lean-To Roof (4m)",
    "wood",
    TIMBER_WALL_HEIGHT + 0.25,
    createTimberRangeRoofGeometry,
    ["shingle"],
    {
      length: RANGE_SECTION,
      tier: 2,
      category: "Roofing",
      cost: () => new THREE14.BoxGeometry(RANGE_SECTION + 0.25, 0.1, RANGE_DEPTH + 0.25)
    }
  )
];
var K = KEEP_SIDE;
var T = KEEP_TURRET;
var FW = FOREBUILDING_W;
var FD = FOREBUILDING_D;
var KEEP_COST_SHARE = 0.15;
var keepShell = (w, h, d) => masonryShell(w, h, d * KEEP_COST_SHARE);
var shellArea = (w, d, t) => w * d - Math.max(0, w - 2 * t) * Math.max(0, d - 2 * t);
CASTLE_PIECES.push(
  craft(
    "castle-keep-plinth",
    "Keep Plinth",
    "stone",
    PLINTH_HEIGHT2,
    (v5) => createSquarePlinthGeometry(v5, K),
    ["masonry", "dressed"],
    {
      length: K,
      tier: 3,
      category: "Foundation",
      cost: keepShell(shellArea(K, K, 2.4), 1, 1)
    }
  ),
  craft(
    "castle-keep-storey-base",
    "Keep Storey (loops)",
    "stone",
    CASTLE_STOREY,
    (v5) => createSquareStoreyGeometry(v5, K, K, "loops"),
    ["masonry", "dressed", "dark", "oak"],
    {
      length: K,
      tier: 3,
      category: "Structural",
      cost: keepShell(shellArea(K, K, 2.4), CASTLE_STOREY, 1)
    }
  ),
  craft(
    "castle-keep-storey",
    "Keep Storey (windows)",
    "stone",
    CASTLE_STOREY,
    (v5) => createSquareStoreyGeometry(v5, K, K, "windows"),
    ["masonry", "dressed", "dark", "oak"],
    {
      length: K,
      tier: 3,
      category: "Structural",
      cost: keepShell(shellArea(K, K, 2), CASTLE_STOREY, 1)
    }
  ),
  craft(
    "castle-keep-battlements",
    "Keep Battlements",
    "stone",
    PARAPET_HEIGHT,
    (v5) => createSquareBattlementsGeometry(v5, K),
    ["masonry", "dressed", "dark", "oak"],
    {
      length: K,
      tier: 3,
      category: "Structural",
      cost: keepShell(4 * K, 1.6, 0.6)
    }
  ),
  craft(
    "castle-keep-roof",
    "Keep Roof",
    "stone",
    5,
    (v5) => createSquareRoofGeometry(v5, K, 4.5, 0.6),
    ["dressed", "slate", "iron"],
    {
      length: K,
      tier: 3,
      category: "Roofing",
      cost: keepShell(4 * K, 0.3, 0.4)
    }
  ),
  craft(
    "castle-keep-turret-plinth",
    "Keep Turret Plinth",
    "stone",
    PLINTH_HEIGHT2,
    (v5) => createSquarePlinthGeometry(v5, T),
    ["masonry", "dressed"],
    {
      length: T,
      tier: 3,
      category: "Foundation",
      cost: keepShell(shellArea(T, T, 1.2), 1, 1)
    }
  ),
  craft(
    "castle-keep-turret-storey",
    "Keep Turret Storey",
    "stone",
    CASTLE_STOREY,
    (v5) => createSquareStoreyGeometry(v5, T),
    ["masonry", "dressed", "dark", "oak"],
    {
      length: T,
      tier: 3,
      category: "Structural",
      cost: keepShell(shellArea(T, T, 1.2), CASTLE_STOREY, 1)
    }
  ),
  craft(
    "castle-keep-turret-battlements",
    "Keep Turret Battlements",
    "stone",
    PARAPET_HEIGHT,
    (v5) => createSquareBattlementsGeometry(v5, T),
    ["masonry", "dressed", "dark", "oak"],
    {
      length: T,
      tier: 3,
      category: "Structural",
      cost: keepShell(4 * T, 1.6, 0.6)
    }
  ),
  craft(
    "castle-keep-turret-roof",
    "Keep Turret Roof",
    "stone",
    5.5,
    (v5) => createSquareRoofGeometry(v5, T, 5),
    ["dressed", "slate", "iron"],
    {
      length: T,
      tier: 3,
      category: "Roofing",
      cost: keepShell(4 * T, 0.3, 0.4)
    }
  ),
  craft(
    "castle-forebuilding-plinth",
    "Forebuilding Plinth",
    "stone",
    PLINTH_HEIGHT2,
    (v5) => createSquarePlinthGeometry(v5, FW, FD),
    ["masonry", "dressed"],
    {
      length: FW,
      tier: 3,
      category: "Foundation",
      cost: keepShell(shellArea(FW, FD, 1.6), 1, 1)
    }
  ),
  craft(
    "castle-forebuilding-door",
    "Forebuilding Storey (door)",
    "stone",
    CASTLE_STOREY,
    (v5) => createSquareStoreyGeometry(v5, FW, FD, "door"),
    ["masonry", "dressed", "dark", "oak"],
    {
      length: FW,
      tier: 3,
      category: "Openings",
      cost: keepShell(shellArea(FW, FD, 1.6), CASTLE_STOREY, 1)
    }
  ),
  craft(
    "castle-forebuilding-storey",
    "Forebuilding Storey (windows)",
    "stone",
    CASTLE_STOREY,
    (v5) => createSquareStoreyGeometry(v5, FW, FD, "windows"),
    ["masonry", "dressed", "dark", "oak"],
    {
      length: FW,
      tier: 3,
      category: "Structural",
      cost: keepShell(shellArea(FW, FD, 1.6), CASTLE_STOREY, 1)
    }
  ),
  craft(
    "castle-forebuilding-battlements",
    "Forebuilding Battlements",
    "stone",
    PARAPET_HEIGHT,
    (v5) => createSquareBattlementsGeometry(v5, FW, FD),
    ["masonry", "dressed", "dark", "oak"],
    {
      length: FW,
      tier: 3,
      category: "Structural",
      cost: keepShell(2 * (FW + FD), 1.6, 0.6)
    }
  )
);
CASTLE_PIECES.push(
  craft(
    "castle-pier-plinth",
    "Wall Pier Plinth",
    "stone",
    1,
    createPierPlinthGeometry,
    ["masonry", "dressed"],
    { length: PIER_RADIUS * 2, tier: 3, category: "Foundation" }
  ),
  craft(
    "castle-pier-course",
    "Wall Pier Course (1m)",
    "stone",
    1,
    createPierCourseGeometry,
    ["masonry"],
    {
      length: PIER_RADIUS * 2,
      tier: 3,
      category: "Structural",
      cost: masonryShell(Math.PI * PIER_RADIUS ** 2, 1, 1)
    }
  ),
  craft(
    "castle-pier-cap",
    "Wall Pier Cap",
    "stone",
    0.7,
    createPierCapGeometry,
    ["dressed"],
    { length: PIER_RADIUS * 2, tier: 3, category: "Structural" }
  )
);
var PARAMETRIC_PIECES = {
  "castle-seg-plinth": (p) => craft(
    `castle-seg-plinth:${p}`,
    "Wall Plinth",
    "stone",
    1,
    (v5) => createWallPlinthGeometry(v5, Number(p)),
    ["masonry", "dressed"],
    { length: Number(p), tier: 3, category: "Foundation" }
  ),
  "castle-seg-course": (p) => craft(
    `castle-seg-course:${p}`,
    "Wall Course",
    "stone",
    1,
    (v5) => createWallCourseGeometry(v5, Number(p)),
    ["masonry"],
    { length: Number(p), tier: 3, category: "Structural" }
  ),
  "castle-seg-rampart": (p) => craft(
    `castle-seg-rampart:${p}`,
    "Rampart",
    "stone",
    PARAPET_HEIGHT,
    (v5) => createRampartGeometry(v5, Number(p)),
    ["masonry", "dressed", "dark"],
    {
      length: Number(p),
      tier: 3,
      category: "Structural",
      cost: masonryShell(Number(p), 1.6, 0.6)
    }
  ),
  "castle-seg-coping": (p) => craft(
    `castle-seg-coping:${p}`,
    "Wall Coping",
    "stone",
    0.55,
    (v5) => createWallCopingGeometry(v5, Number(p)),
    ["dressed"],
    { length: Number(p), tier: 3, category: "Structural" }
  ),
  "castle-seg-machicolated": (p) => craft(
    `castle-seg-machicolated:${p}`,
    "Machicolated Top",
    "stone",
    PARAPET_HEIGHT,
    (v5) => createMachicolatedGeometry(v5, Number(p)),
    ["masonry", "dressed", "dark"],
    {
      length: Number(p),
      tier: 3,
      category: "Structural",
      cost: masonryShell(Number(p), 1.9, 0.75)
    }
  ),
  "castle-seg-hoarding": (p) => craft(
    `castle-seg-hoarding:${p}`,
    "Timber Hoarding",
    "wood",
    2.5,
    (v5) => createHoardingGeometry(v5, Number(p)),
    ["masonry", "dressed", "oak", "dark"],
    {
      length: Number(p),
      tier: 3,
      category: "Structural",
      cost: masonryShell(Number(p), 1.6, 0.4)
    }
  ),
  "castle-seg-plinth-battered": (p) => craft(
    `castle-seg-plinth-battered:${p}`,
    "Battered Wall Plinth",
    "stone",
    1,
    (v5) => createBatteredPlinthGeometry(v5, Number(p)),
    ["masonry", "dressed"],
    { length: Number(p), tier: 3, category: "Foundation", cost: masonryShell(Number(p), 1.4, 1.1) }
  ),
  "castle-seg-course-arrowslit": (p) => craft(
    `castle-seg-course-arrowslit:${p}`,
    "Arrow-Slit Wall Course",
    "stone",
    1,
    (v5) => createArrowslitCourseGeometry(v5, Number(p)),
    ["masonry", "dark"],
    { length: Number(p), tier: 3, category: "Structural" }
  ),
  "castle-seg-plinth-ashlar": (p) => craft(
    `castle-seg-plinth-ashlar:${p}`,
    "Ashlar Curtain Plinth",
    "stone",
    1,
    (v5) => createAshlarPlinthGeometry(v5, Number(p)),
    ["masonry", "dressed"],
    { length: Number(p), tier: 3, category: "Foundation", cost: masonryShell(Number(p), 1.5, 0.6) }
  ),
  "castle-seg-course-ashlar": (p) => craft(
    `castle-seg-course-ashlar:${p}`,
    "Ashlar Curtain Course",
    "stone",
    1,
    (v5) => createAshlarCourseGeometry(v5, Number(p)),
    ["masonry", "dressed"],
    { length: Number(p), tier: 3, category: "Structural" }
  ),
  "castle-seg-rampart-ashlar": (p) => craft(
    `castle-seg-rampart-ashlar:${p}`,
    "Ashlar Curtain Rampart",
    "stone",
    PARAPET_HEIGHT,
    (v5) => createAshlarRampartGeometry(v5, Number(p)),
    ["masonry", "dressed", "dark"],
    {
      length: Number(p),
      tier: 3,
      category: "Structural",
      cost: masonryShell(Number(p), 1.7, 0.65)
    }
  ),
  "castle-pier-top": (p) => craft(
    `castle-pier-top:${p}`,
    "Wall Pier Top",
    "stone",
    PARAPET_HEIGHT,
    (v5) => createPierTopGeometry(v5, Number(p)),
    ["masonry", "dressed", "dark"],
    {
      length: PIER_RADIUS * 2,
      tier: 3,
      category: "Structural",
      cost: masonryShell(2 * Math.PI * 1.45, 1.4, 0.6)
    }
  )
};
var parametricCache = /* @__PURE__ */ new Map();
function parametricPiece(id) {
  const colon = id.indexOf(":");
  if (colon < 0) return void 0;
  const factory = PARAMETRIC_PIECES[id.slice(0, colon)];
  if (!factory) return void 0;
  let def = parametricCache.get(id);
  if (!def) {
    def = factory(id.slice(colon + 1));
    parametricCache.set(id, def);
  }
  return def;
}
var PIECE_DEFS = [
  FootingPiece,
  StackableStonePiece,
  FoundationSlabPiece,
  LogPiece,
  HalfLogPiece,
  PlankPiece,
  WallPanelPiece,
  LogWallPiece,
  LogWallDoorPiece,
  LogWallGrandDoorPiece,
  LogWallWindowPiece,
  FencePostPiece,
  FenceRailPiece,
  StairsPiece,
  SillPlatePiece,
  TopPlatePiece,
  WallStudPiece,
  HeaderPiece,
  DiagonalBracePiece,
  FloorJoistPiece,
  GirderPiece,
  FloorPanelPiece,
  RidgeBeamPiece,
  LogGablePiece,
  LogGableSmallPiece,
  LogGableLargePiece,
  LogGableTinyPiece,
  RafterPiece,
  PurlinPiece,
  CollarTiePiece,
  HayRoofPiece,
  HayRoofHalfPiece,
  ClayTileRoofPiece,
  DoorPiece,
  WindowPiece,
  DirtPadPiece,
  PoleRailPiece,
  HideTentPiece,
  FireRingPiece,
  WellShaftPiece,
  WindlassPiece,
  WashWellShaftPiece,
  WashWindlassPiece,
  CampfireWoodPiece,
  CratePiece,
  SackPiece,
  BarrelPiece,
  BasketPiece,
  ChoppingBlockPiece,
  DryingRackPiece,
  StoneChimneyPiece,
  HideAwningPiece,
  GameRackPiece,
  RowboatPiece,
  NetPolesPiece,
  MarketStallPiece,
  MarketStallOchrePiece,
  MarketStallHidePiece,
  MarketPostPiece,
  MiddenPitPiece,
  CompostBinPiece,
  HayBalePiece,
  TilledSoilPiece,
  LecternPiece,
  BannerPolePiece,
  BannerPoleBluePiece,
  NoticeBoardPiece,
  BellPostPiece,
  ScarecrowPiece,
  WattlePanelPiece,
  RaisedBedPiece,
  GraveCrossPiece,
  StandingStonePiece,
  FlagstonesPiece,
  YewTreePiece,
  CrestBoardPiece,
  FlagstaffPiece,
  StonePlinthPiece,
  StoneStepsPiece,
  LanternPiece,
  TimberWallPiece,
  TimberWallDoorPiece,
  TimberWallWindowPiece,
  TimberGableTinyPiece,
  TimberGableSmallPiece,
  TimberGablePiece,
  TimberGableLargePiece,
  ShingleRoofPiece,
  ShingleRoofHalfPiece,
  ...TOWN_PIECES,
  StoneSillPiece,
  DoorHoodPiece,
  SawPitPiece,
  SawLogPiece,
  PitSawPiece,
  TimberPostPiece,
  TimberBeamPiece,
  KneeBracePiece,
  BoardWallPiece,
  BoardWallDoorsPiece,
  BoardGablePiece,
  BoardGableLoftPiece,
  CornerBoardPiece,
  BoardFloorPiece,
  StaddleStonePiece,
  HoistTacklePiece,
  MineHillPiece,
  AditPortalPiece,
  MineRailPiece,
  OreCartPiece,
  SpoilHeapPiece,
  MineShaftPiece,
  HeadframePiece,
  BoardGable6Piece,
  BoardGable6LoftPiece,
  ...CRAFT_PIECES,
  ...PRIMITIVE_PIECES,
  ...CASTLE_PIECES
];
function getPieceDef(id) {
  const def = PIECE_DEFS.find((p) => p.id === id) ?? parametricPiece(id);
  if (!def) throw new Error(`Unknown piece def: ${id}`);
  return def;
}
function groundClearance(def, quaternion) {
  const box2 = new THREE14.Box3().setFromObject(
    new THREE14.Mesh(def.createGeometry()).applyQuaternion(quaternion)
  );
  return -box2.min.y;
}

// vendor/city-builder/src/map/buildings/structureMesh.ts
import * as THREE17 from "three";

// vendor/city-builder/src/editor/pieces/clip.ts
import * as THREE15 from "three";
function clipToPlanes(geometry, planes, def, matrix) {
  const ax = new THREE15.Vector3();
  const ay = new THREE15.Vector3();
  const az = new THREE15.Vector3();
  matrix.extractBasis(ax, ay, az);
  const inPlane = def.category === "Roofing";
  const n = new THREE15.Vector3();
  const p = new THREE15.Vector3();
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    for (let pass = 0; pass < 2; pass++) {
      for (const [nx, ny, nz, d] of planes) {
        n.set(nx, ny, nz);
        const excess = n.dot(p) - d;
        if (excess <= 0) continue;
        const along = n.dot(ax);
        const across = n.dot(az);
        if (Math.abs(along) > 0.2 * n.length()) p.addScaledVector(ax, -excess / along);
        else if (inPlane && Math.abs(across) > 1e-3) p.addScaledVector(az, -excess / across);
        else p.addScaledVector(n, -excess / n.lengthSq());
      }
    }
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// vendor/city-builder/src/editor/StructureStorage.ts
import * as THREE16 from "three";
function toSerializedStructure(name, pieces) {
  return {
    name,
    pieces: pieces.map((p) => ({
      defId: p.defId,
      position: [p.position.x, p.position.y, p.position.z],
      quaternion: [p.quaternion.x, p.quaternion.y, p.quaternion.z, p.quaternion.w],
      ...p.clip ? { clip: p.clip } : {}
    }))
  };
}
function fromSerializedStructure(data) {
  return data.pieces.map((p) => ({
    defId: p.defId,
    position: new THREE16.Vector3(...p.position),
    quaternion: new THREE16.Quaternion(...p.quaternion),
    ...p.clip ? { clip: p.clip } : {}
  }));
}

// vendor/city-builder/src/map/buildings/structureMesh.ts
var geometryCache = /* @__PURE__ */ new Map();
var materialCache = /* @__PURE__ */ new Map();
function sharedGeometry(def, variant) {
  const key = `${def.id}:${variant}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = def.createGeometry(variant);
    geometry.computeBoundingBox();
    geometryCache.set(key, geometry);
  }
  return geometry;
}
function sharedMaterial(def) {
  let material = materialCache.get(def.id);
  if (!material) {
    material = def.createMaterial();
    materialCache.set(def.id, material);
  }
  return material;
}
function isPitched(quaternion) {
  const axis = new THREE17.Vector3(1, 0, 0).applyQuaternion(quaternion);
  return Math.abs(axis.y) > 0.2 && Math.abs(axis.y) < 0.95;
}
function isRoofPiece(def, quaternion) {
  if (def.id.startsWith("log-gable")) return false;
  if (def.category === "Roofing" || def.category === "Roof Framing") return true;
  return isPitched(quaternion);
}
var tmpBox = new THREE17.Box3();
function buildStructureMeshes(data, options) {
  const rand = seededRandom(options.seed);
  const group = new THREE17.Group();
  const pieces = [];
  const roof = [];
  fromSerializedStructure(data).forEach((piece, index) => {
    const def = getPieceDef(piece.defId);
    const variant = Math.floor(rand() * TIMBER_VARIANTS) % TIMBER_VARIANTS;
    const jitter4 = [rand(), rand(), rand(), rand(), rand()];
    void index;
    const quaternion = piece.quaternion.clone();
    const position = piece.position.clone();
    const roofPiece = isRoofPiece(def, piece.quaternion);
    if (!options.plain && !roofPiece && !def.id.startsWith("castle-")) {
      const d = THREE17.MathUtils.degToRad(0.55);
      quaternion.multiply(
        new THREE17.Quaternion().setFromEuler(
          new THREE17.Euler(
            (jitter4[0] - 0.5) * d,
            (jitter4[1] - 0.5) * d * 1.5,
            (jitter4[2] - 0.5) * d
          )
        )
      );
      position.x += (jitter4[3] - 0.5) * 0.02;
      position.z += (jitter4[4] - 0.5) * 0.02;
    }
    if (roofPiece && def.id === "log" && !options.plain) position.y -= 0.045;
    const gable = def.id.startsWith("log-gable");
    if (gable && !options.plain) position.y -= 0.05;
    const geometry = sharedGeometry(
      def,
      roofPiece && def.id === "log" ? 3 + variant % 3 : variant
    );
    if (!options.plain && !options.material && (roofPiece || gable)) {
      roof.push({
        geometry,
        def,
        matrix: new THREE17.Matrix4().compose(position, quaternion, new THREE17.Vector3(1, 1, 1)),
        follow: gable,
        clip: piece.clip
      });
      return;
    }
    if (piece.clip) {
      const matrix = new THREE17.Matrix4().compose(position, quaternion, new THREE17.Vector3(1, 1, 1));
      const cut = clipToPlanes(geometry.clone().applyMatrix4(matrix), piece.clip, def, matrix);
      cut.computeBoundingBox();
      const mesh2 = new THREE17.Mesh(cut, options.material ?? sharedMaterial(def));
      mesh2.userData.defId = def.id;
      group.add(mesh2);
      const box2 = cut.boundingBox;
      pieces.push({
        mesh: mesh2,
        def,
        minY: box2.min.y,
        maxY: box2.max.y,
        center: box2.getCenter(new THREE17.Vector3())
      });
      return;
    }
    const mesh = new THREE17.Mesh(geometry, options.material ?? sharedMaterial(def));
    mesh.position.copy(position);
    mesh.quaternion.copy(quaternion);
    mesh.userData.sharedGeometry = true;
    mesh.userData.defId = def.id;
    group.add(mesh);
    mesh.updateMatrix();
    tmpBox.copy(geometry.boundingBox).applyMatrix4(mesh.matrix);
    pieces.push({
      mesh,
      def,
      minY: tmpBox.min.y,
      maxY: tmpBox.max.y,
      center: tmpBox.getCenter(new THREE17.Vector3())
    });
  });
  for (const cluster of roofClusters(roof)) {
    for (const piece of bakeSaggingRoof(cluster, rand)) {
      group.add(piece.mesh);
      pieces.push(piece);
    }
  }
  return { group, pieces };
}
function roofClusters(roof) {
  const boxes = roof.map((r) => {
    r.geometry.computeBoundingBox();
    return r.geometry.boundingBox.clone().applyMatrix4(r.matrix);
  });
  const panels = roof.map((_, i) => i).filter((i) => roof[i].def.category === "Roofing");
  if (panels.length === 0) {
    const shaped = roof.filter((r) => !r.follow);
    return shaped.length ? [shaped] : [];
  }
  const parent = roof.map((_, i) => i);
  const find = (i) => parent[i] === i ? i : parent[i] = find(parent[i]);
  for (let a = 0; a < panels.length; a++) {
    const boxA = boxes[panels[a]].clone().expandByScalar(0.05);
    for (let b = a + 1; b < panels.length; b++) {
      if (boxA.intersectsBox(boxes[panels[b]])) parent[find(panels[a])] = find(panels[b]);
    }
  }
  const clusters = /* @__PURE__ */ new Map();
  const clusterBoxes = /* @__PURE__ */ new Map();
  for (const i of panels) {
    const root = find(i);
    if (!clusters.has(root)) {
      clusters.set(root, []);
      clusterBoxes.set(root, new THREE17.Box3());
    }
    clusters.get(root).push(roof[i]);
    clusterBoxes.get(root).union(boxes[i]);
  }
  const centre = new THREE17.Vector3();
  roof.forEach((r, i) => {
    if (r.def.category === "Roofing") return;
    boxes[i].getCenter(centre);
    let best = -1;
    let bestDistance = Infinity;
    for (const [root, box2] of clusterBoxes) {
      const d = box2.distanceToPoint(centre);
      if (d < bestDistance) {
        bestDistance = d;
        best = root;
      }
    }
    clusters.get(best).push(r);
  });
  return [...clusters.values()];
}
function bakeSaggingRoof(roof, rand) {
  const baked = roof.map((r) => {
    const geometry = r.geometry.clone().applyMatrix4(r.matrix);
    return { ...r, geometry: r.clip ? clipToPlanes(geometry, r.clip, r.def, r.matrix) : geometry };
  });
  const downslope = new THREE17.Vector2();
  for (const r of baked) {
    if (r.def.category !== "Roofing") continue;
    const normal = new THREE17.Vector3(0, 1, 0).applyMatrix3(
      new THREE17.Matrix3().getNormalMatrix(r.matrix)
    );
    const d = new THREE17.Vector2(normal.x, normal.z);
    if (d.lengthSq() < 1e-4) continue;
    d.normalize();
    if (downslope.lengthSq() > 0 && d.dot(downslope) < 0) d.negate();
    downslope.add(d);
  }
  const bounds = new THREE17.Box3();
  for (const r of baked) {
    r.geometry.computeBoundingBox();
    if (r.follow) continue;
    bounds.union(r.geometry.boundingBox);
  }
  const axis = downslope.lengthSq() > 1e-6 ? new THREE17.Vector2(-downslope.y, downslope.x).normalize() : bounds.max.x - bounds.min.x >= bounds.max.z - bounds.min.z ? new THREE17.Vector2(1, 0) : new THREE17.Vector2(0, 1);
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const r of baked) {
    if (r.follow) continue;
    const p = r.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getX(i) * axis.x + p.getZ(i) * axis.y;
      tMin = Math.min(tMin, t);
      tMax = Math.max(tMax, t);
    }
  }
  const ridgeLength = Math.max(0.01, tMax - tMin);
  const height = Math.max(0.01, bounds.max.y - bounds.min.y);
  const ridgeSag = ridgeLength * (0.012 + rand() * 0.012);
  const slopeSag = Math.min(0.12, height * (0.03 + rand() * 0.025));
  const skew = 0.75 + rand() * 0.5;
  const pieces = [];
  for (const r of baked) {
    const p = r.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const t = (x * axis.x + z * axis.y - tMin) / ridgeLength;
      const h = Math.min(1, Math.max(0, (y - bounds.min.y) / height));
      const along = Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, t)), skew));
      const dy = ridgeSag * h * along + slopeSag * Math.sin(Math.PI * h) * (0.25 + 0.75 * along);
      p.setY(i, y - dy);
    }
    p.needsUpdate = true;
    r.geometry.computeVertexNormals();
    r.geometry.computeBoundingBox();
    const mesh = new THREE17.Mesh(r.geometry, sharedMaterial(r.def));
    const box2 = r.geometry.boundingBox;
    pieces.push({
      mesh,
      def: r.def,
      minY: box2.min.y,
      maxY: box2.max.y,
      center: box2.getCenter(new THREE17.Vector3())
    });
  }
  return pieces;
}
export {
  withoutWallPosts,
  AditPortalPiece,
  BannerPoleBluePiece,
  BannerPolePiece,
  BarrelPiece,
  BasketPiece,
  BellPostPiece,
  BoardFloorPiece,
  BoardGable6LoftPiece,
  BoardGable6Piece,
  BoardGableLoftPiece,
  BoardGablePiece,
  BoardWallDoorsPiece,
  BoardWallPiece,
  BrickChimneyPiece,
  CASTLE_PIECES,
  CRAFT_PIECES,
  CampfireWoodPiece,
  ChoppingBlockPiece,
  ClayTileRoofPiece,
  CollarTiePiece,
  CompostBinPiece,
  CornerBoardPiece,
  CratePiece,
  CrestBoardPiece,
  DiagonalBracePiece,
  DirtPadPiece,
  DoorHoodPiece,
  DoorPiece,
  DryingRackPiece,
  FencePostPiece,
  FenceRailPiece,
  FireRingPiece,
  FlagstaffPiece,
  FlagstonesPiece,
  FloorJoistPiece,
  FloorPanelPiece,
  FootingPiece,
  FoundationSlabPiece,
  GRID_UNIT,
  GameRackPiece,
  GirderPiece,
  GraveCrossPiece,
  HIDE_COLOR,
  HalfLogPiece,
  HayBalePiece,
  HayRoofHalfPiece,
  HayRoofPiece,
  HeaderPiece,
  HeadframePiece,
  HideAwningPiece,
  HideTentPiece,
  HoistTacklePiece,
  KneeBracePiece,
  LANTERN_GLOW_MATERIAL,
  LanternPiece,
  LecternPiece,
  LogGableLargePiece,
  LogGablePiece,
  LogGableSmallPiece,
  LogGableTinyPiece,
  LogPiece,
  LogWallDoorPiece,
  LogWallGrandDoorPiece,
  LogWallPiece,
  LogWallWindowPiece,
  MarketPostPiece,
  MarketStallHidePiece,
  MarketStallOchrePiece,
  MarketStallPiece,
  MiddenPitPiece,
  MineHillPiece,
  MineRailPiece,
  MineShaftPiece,
  NetPolesPiece,
  NoticeBoardPiece,
  OreCartPiece,
  PIECE_DEFS,
  PLASTER_GABLES,
  PRIMITIVE_PIECES,
  PitSawPiece,
  PlankPiece,
  PlasterWallDoorPiece,
  PlasterWallNarrowPiece,
  PlasterWallPiece,
  PlasterWallWindowPiece,
  PoleRailPiece,
  PurlinPiece,
  RafterPiece,
  RaisedBedPiece,
  RidgeBeamPiece,
  RowboatPiece,
  STONE_GABLES,
  STONE_SILL_HEIGHT,
  SackPiece,
  SawLogPiece,
  SawPitPiece,
  ScarecrowPiece,
  ShingleRoofHalfPiece,
  ShingleRoofPiece,
  SillPlatePiece,
  SpoilHeapPiece,
  StackableStonePiece,
  StaddleStonePiece,
  StairsPiece,
  StandingStonePiece,
  StoneChimneyPiece,
  StonePlinthPiece,
  StoneSillPiece,
  StoneStepsPiece,
  TIMBER_DEPTH,
  TIMBER_GABLE_EAVE,
  TIMBER_VARIANTS,
  TIMBER_WALL_HEIGHT,
  TOWN_PIECES,
  TileRoofHalfPiece,
  TileRoofPiece,
  TilledSoilPiece,
  TimberBeamPiece,
  TimberGableLargePiece,
  TimberGablePiece,
  TimberGableSmallPiece,
  TimberGableTinyPiece,
  TimberPostPiece,
  TimberWallDoorPiece,
  TimberWallPiece,
  TimberWallWindowPiece,
  TopPlatePiece,
  WASH_WELL_RADIUS,
  WallPanelPiece,
  WallStudPiece,
  WashWellShaftPiece,
  WashWindlassPiece,
  WattlePanelPiece,
  WellShaftPiece,
  WindlassPiece,
  WindowPiece,
  YewTreePiece,
  barkTexture,
  bowAlongX,
  brickTexture,
  buildStructureMeshes,
  castleMasonryBump,
  castleMasonryTexture,
  clipToPlanes,
  createHalfLogGeometry,
  createLogGableGeometry,
  createLogGeometry,
  createLogWallGeometry,
  createOpeningFillGeometry,
  createRidgedPanelGeometry,
  createRusticLogGeometry,
  createShingleGeometry,
  createStairsGeometry,
  createStoneGeometry,
  createStoneSillGeometry,
  createTimberWallGeometry,
  daubMaterial,
  doorHoodParts,
  doorPlankTexture,
  freshSawnMaterial,
  fromSerializedStructure,
  getPieceDef,
  grainUVs,
  gravelTexture,
  groundClearance,
  logGableCourses,
  logGableHeight,
  oakTexture,
  plankTexture,
  scaleSlateTexture,
  seededRandom,
  shingleTexture,
  slateTexture,
  stoneTexture,
  stripTo,
  thatchTexture,
  tileTexture,
  timberGableHeight,
  timberGableParts,
  timberWallCostGeometry,
  timberWallParts,
  toSerializedStructure
};
