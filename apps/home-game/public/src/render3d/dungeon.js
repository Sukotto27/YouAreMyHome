// The dungeon in 3D: its own dark scene (so none of the overworld's sky, water or trees exist down here).
//   - floors and walls are instanced stone boxes textured with City Builder's castle masonry (UVs come from world position,
//     so the courses line up across tiles); the whole level is drawn (no fog of war: the dark does the hiding)
//   - a torch light follows the players; the rest is nearly black, with fog closing in around the light
//   - walls that stand between the camera and a player dither away like trees do
//   - dungeon-only props: iron gates, the exit stairs, painted rune clues
import * as THREE from "three";
import { InstanceSet } from "./instancer.js";
import { TILE_M } from "./config.js";

export const WALL_H = 2.9, FLOOR_T = 0.3;
const TEX = "assets3d/textures/stone/";

function stoneMaterial(file, tint, scale, bump) {
  const t = new THREE.TextureLoader().load(TEX + file); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ map: t, color: tint, roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
attribute float aFade; varying float vFade; varying vec3 vWP; varying vec3 vWN;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vFade = aFade;
mat4 dwM = modelMatrix;
#ifdef USE_INSTANCING
dwM = modelMatrix * instanceMatrix;
#endif
vWP = (dwM * vec4(position, 1.0)).xyz; vWN = normalize(mat3(dwM) * normal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
varying float vFade; varying vec3 vWP; varying vec3 vWN; uniform float uScale;`)
      .replace("#include <map_fragment>", `{
  vec3 an = abs(vWN); vec2 uv = (an.y > 0.6) ? vWP.xz : (an.x > an.z ? vWP.zy : vWP.xy);
  diffuseColor *= texture2D(map, uv / uScale);
}`)
      .replace("#include <alphatest_fragment>", `
      { float b = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (vFade < b) discard; }
      #include <alphatest_fragment>`);
  };
  m.customProgramCacheKey = () => "dungeon-stone-" + file;
  return m;
}

export function createDungeonView({ renderer }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040508);
  scene.fog = new THREE.FogExp2(0x040508, 0.045);
  scene.add(new THREE.HemisphereLight(0x5a6a9a, 0x1a1410, 0.55));
  const torch = new THREE.PointLight(0xffb070, 7, 22, 1.5); scene.add(torch);
  const torch2 = new THREE.PointLight(0xffb070, 7, 22, 1.5); scene.add(torch2);   // the second player carries one too

  const wallMat = stoneMaterial("castle-masonry.png", new THREE.Color(0xd8d4cc), 4, false);
  const floorMat = stoneMaterial("stone-rock.png", new THREE.Color(0x8e8a84).multiplyScalar(1.5), 2.4, false);
  const wallGeo = new THREE.BoxGeometry(TILE_M, WALL_H, TILE_M).translate(0, WALL_H / 2, 0);
  const floorGeo = new THREE.BoxGeometry(TILE_M, FLOOR_T, TILE_M).translate(0, -FLOOR_T / 2, 0);
  const wallModel = { parts: [{ geometry: wallGeo, material: wallMat }] }, floorModel = { parts: [{ geometry: floorGeo, material: floorMat }] };

  let set = null, map = null, tiles = [], revealed = null, W = 0, H = 0, walls = [];

  function build(dm) {
    if (set) { scene.remove(set.group); set.group.traverse((o) => o.geometry && o.geometry !== wallGeo && o.geometry !== floorGeo && o.geometry.dispose()); }
    map = dm; H = dm.tiles.length; W = dm.tiles[0].length; tiles = []; walls = [];
    set = new InstanceSet(scene, { castShadow: false, receiveShadow: false, auto: true, fade: true });
    revealed = new Uint8Array(W * H);
    const solid = (x, y) => dm.tiles[y]?.[x] !== "floor";
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const cx = (x + 0.5) * TILE_M, cz = (y + 0.5) * TILE_M;
      if (dm.tiles[y][x] === "floor") { const h = set.add("floor", floorModel, cx, 0, cz, {}); tiles[y * W + x] = h; }
      else {
        let near = false; for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (!solid(x + dx, y + dy)) { near = true; break; }
        if (near) { const h = set.add("wall", wallModel, cx, 0, cz, {}); h.tx = x; h.ty = y; tiles[y * W + x] = h; walls.push(h); }
      }
    }
    set.build();
    revealed.fill(0);
  }

  /** Show newly explored tiles (the game's fog of war). */
  function reveal() {
    const ex = map?.explored; if (!ex) return;
    for (let y = 0; y < H; y++) { const row = ex[y]; if (!row) continue; for (let x = 0; x < W; x++) if (row[x] && !revealed[y * W + x]) { revealed[y * W + x] = 1; const h = tiles[y * W + x]; if (h) set.setVisible(h, true); } }
  }

  const v = new THREE.Vector3();
  /** Walls that cover a player on screen thin out. */
  function fadeWalls(camera, targets, dt) {
    const asp = camera.aspect, tp = targets.map((t) => { v.copy(t).project(camera); return { x: v.x * asp, y: v.y, d: camera.position.distanceTo(t), tx: Math.floor(t.x / TILE_M), ty: Math.floor(t.z / TILE_M) }; });
    for (const h of walls) {
      if (!h.visible) continue;
      let hide = false;
      for (const t of tp) {
        if (Math.abs(h.tx - t.tx) > 6 || Math.abs(h.ty - t.ty) > 6) continue;
        const c = new THREE.Vector3(h.x, WALL_H * 0.5, h.z); v.copy(c).project(camera); const cx = v.x * asp, cy = v.y;
        const e = c.clone().add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(TILE_M * 0.78)); v.copy(e).project(camera);
        const rad = Math.hypot(v.x * asp - cx, v.y - cy);
        if (camera.position.distanceTo(c) < t.d + 0.4 && Math.hypot(t.x - cx, t.y - cy) < rad) { hide = true; break; }
      }
      const target = hide ? 0.15 : 1, f = h.fade ?? 1, next = f + (target - f) * Math.min(1, dt * 8);
      if (Math.abs(next - f) > 0.01) set.setFade(h, next);
    }
  }

  let flick = 0;
  function update(dt, camera, actorPositions) {
    flick += dt;
    fadeWalls(camera, actorPositions, dt);   // (no fog of war down here: the dark and the torchlight are enough)
    const lights = [torch, torch2];
    lights.forEach((l, i) => {
      const p = actorPositions[i]; if (!p) { l.visible = false; return; }
      l.visible = true; l.position.set(p.x, 2.3, p.z);
      l.intensity = 6.5 + Math.sin(flick * 11 + i) * 0.5 + Math.sin(flick * 23.7 + i * 2) * 0.35;
    });
  }
  return { scene, build, update, get map() { return map; }, heightAt: () => 0, worldToTile: (x, z) => [Math.floor(x / TILE_M), Math.floor(z / TILE_M)], setPads() {}, set: () => set };
}
