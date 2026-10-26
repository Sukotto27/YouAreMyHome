// Renderer, sky, sun/moon, fog and the orbit camera rig.
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { CAMERA, FOG, dayLengths } from "./config.js";

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mixColor = (out, a, b, t) => out.copy(a).lerp(b, t);
const C = (hex) => new THREE.Color(hex);
const FOG_DAY = C(0xa9cbd9), FOG_DUSK = C(0xd9a98a), FOG_NIGHT = C(0x25335a);
const HEMI_SKY_DAY = C(0xdfefff), HEMI_SKY_NIGHT = C(0x4a62a8), HEMI_GROUND_DAY = C(0x6d8a4f), HEMI_GROUND_NIGHT = C(0x2c3a2c);

export function createScene3D(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  const mobile = matchMedia("(pointer: coarse)").matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.75 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  Object.assign(renderer.domElement.style, { position: "fixed", inset: "0", width: "100%", height: "100%", touchAction: "none", zIndex: 5 });
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(FOG_DAY.clone(), FOG.density);
  scene.background = FOG_DAY.clone();

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.3, 600);

  // --- sky dome + lights ---
  const sky = new Sky(); sky.scale.setScalar(450000); scene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.85;
  const hemi = new THREE.HemisphereLight(0xdfefff, 0x6d8a4f, 1.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4); sun.castShadow = true;
  const shadowSize = mobile ? 1024 : 2048; sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const sunDir = new THREE.Vector3();
  const tmpColor = new THREE.Color();

  /** Drive sun/moon/sky/fog from the game's day clock (phaseT seconds into the day). */
  function setTimeOfDay(phaseT, followPos) {
    const { day, light } = dayLengths();
    const isDay = phaseT < light;
    // sun arcs over the daylight part; the moon over the night part (a gentle, dim arc)
    const u = isDay ? phaseT / light : (phaseT - light) / (day - light);
    const arc = Math.sin(u * Math.PI);              // 0 at the horizon, 1 at the top
    const elev = (isDay ? 8 + 62 * arc : -4 + 38 * arc) * Math.PI / 180;
    const az = (isDay ? 100 + 160 * u : 280 + 160 * u) * Math.PI / 180;
    sunDir.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az));
    // the sky shader always uses the real sun; at night push it below the horizon so the dome goes dark
    const skyDir = isDay ? sunDir : new THREE.Vector3(sunDir.x, -0.35, sunDir.z).normalize();
    su.sunPosition.value.copy(skyDir);

    const dayness = isDay ? smooth(0, 0.12, u) * (1 - smooth(0.88, 1, u)) : 0;      // 0 night .. 1 midday-ish
    const twilight = isDay ? Math.max(1 - smooth(0.0, 0.2, u), smooth(0.8, 1, u)) : 0;
    mixColor(tmpColor, FOG_NIGHT, FOG_DAY, dayness);
    if (twilight > 0) tmpColor.lerp(FOG_DUSK, twilight * 0.7 * (1 - 0.0));
    scene.fog.color.copy(tmpColor); scene.background.copy(tmpColor);

    sun.color.set(isDay ? (twilight > 0.3 ? 0xffc79a : 0xfff1d6) : 0x8fa8ff);
    sun.intensity = isDay ? 0.5 + 2.0 * dayness : (mobile ? 2.6 : 2.0);          // moonlight: phone screens at normal brightness need a lot more than a monitor
    hemi.intensity = (mobile ? 2.0 : 1.6) + (1.35 - (mobile ? 2.0 : 1.6)) * dayness;
    hemi.color.copy(HEMI_SKY_NIGHT).lerp(HEMI_SKY_DAY, dayness);
    hemi.groundColor.copy(HEMI_GROUND_NIGHT).lerp(HEMI_GROUND_DAY, dayness);
    renderer.toneMappingExposure = (mobile ? 1.2 : 1.0) + (0.65 - (mobile ? 1.2 : 1.0)) * dayness;
    sky.visible = true;

    if (followPos) { // the light and its shadow box follow the player
      sun.target.position.copy(followPos);
      sun.position.copy(followPos).addScaledVector(sunDir, 60);
    }
    return { isDay, dayness };
  }

  // The 2D HUD (top bar, left sidebar, bottom inventory) covers part of the screen: shift the view so the
  // character sits in the middle of the visible world area instead of the middle of the whole canvas.
  function fitView() {
    const left = typeof UI_LEFTBAR_W !== "undefined" ? UI_LEFTBAR_W : 64, top = typeof UI_TOP_H !== "undefined" ? UI_TOP_H : 58, bottom = typeof UI_BOTTOM_H !== "undefined" ? UI_BOTTOM_H : 230;
    camera.aspect = innerWidth / innerHeight;
    camera.setViewOffset(innerWidth, innerHeight, -left / 2, (bottom - top) / 2, innerWidth, innerHeight);
    camera.updateProjectionMatrix();
  }
  fitView();
  addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); fitView(); });
  return { renderer, scene, camera, sky, sun, hemi, setTimeOfDay, mobile, fitView };
}

/** Orbit camera that follows a target point. yaw/pitch/dist are the goals; the camera eases to them. */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = CAMERA.yaw * Math.PI / 180;
    this.pitch = CAMERA.pitch * Math.PI / 180;
    this.dist = CAMERA.dist;
    this.target = new THREE.Vector3();
    this.focus = new THREE.Vector3();
    this.zoomRange = null;      // { min, max } overrides the normal zoom limits (the builder zooms much further out)
    this.override = null;        // { pos: Vector3, dist } — frame something else (the builder's ghost) instead of the player
    this._first = true;
  }
  orbit(dYaw, dPitch) {
    this.yaw += dYaw;
    this.pitch = Math.min(CAMERA.pitchMax * Math.PI / 180, Math.max(CAMERA.pitchMin * Math.PI / 180, this.pitch + dPitch));
  }
  zoom(factor) { const free = new URLSearchParams(location.search).get("zoom") === "free"; const R = this.zoomRange; this.dist = R ? Math.min(R.max, Math.max(R.min, this.dist * factor)) : free ? Math.min(140, Math.max(3, this.dist * factor)) : Math.min(CAMERA.distMax, Math.max(CAMERA.distMin, this.dist * factor)); }
  update(dt, followPos) {
    if (this.override) this.dist += (this.override.dist - this.dist) * (1 - Math.exp(-4 * dt));
    this.target.copy(this.override?.pos || followPos); if (!this.override) this.target.y += CAMERA.height;
    if (this._first) { this.focus.copy(this.target); this._first = false; }
    else this.focus.lerp(this.target, 1 - Math.exp(-CAMERA.follow * dt));
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * cp * this.dist,
      this.focus.y + sp * this.dist,
      this.focus.z + Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(this.focus);
  }
}
