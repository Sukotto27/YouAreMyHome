// Colours and textures for building components. Every component belongs to a *role*; a structure's `paint` says what
// each role looks like: paint = { wall: { tex, tint }, floor, foundation, frame, door, window, roof } (all optional;
// unset = City Builder's own look). `tex` is a key of TEXTURES, `tint` a 0xRRGGBB multiplier.
import * as THREE from "three";

const T = "assets3d/textures/";
const R = T + "building/roofing/";
const W = T + "building/wood/";
/** key -> { label, url, tint (default colour for it), lift (the textures are mid-grey: this brightens them) } */
export const TEXTURES = {
  bark: { label: "Bark", url: T + "bark/bark-pine.png", tint: 0x6b4a2b, lift: 1.9 },
  oak: { label: "Oak", url: W + "oak-grain.png", tint: 0xb08a5a, lift: 1 },
  plank: { label: "Weathered boards", url: W + "vegetation-pack/Wood_01.png", tint: 0xb8926a, lift: 1 },
  darkplank: { label: "Dark boards", url: W + "Wooden Planks (43).png", tint: 0xffffff, lift: 1 },
  stone: { label: "Fieldstone", url: T + "stone/stone-rock.png", tint: 0x8c8c87, lift: 1.75 },
  brick: { label: "Brick", url: T + "building/brick/brick.png", tint: 0xffffff, lift: 1 },
  gravel: { label: "Gravel", url: T + "terrain/gravel.png", tint: 0xffffff, lift: 1 },
  thatch: { label: "Thatch", url: R + "Thatch/Roof_Thatch_01-512x512.png", tint: 0xe6cc96, lift: 1 },
  thatch2: { label: "Reed thatch", url: R + "Thatch/Roof_Thatch_03-512x512.png", tint: 0xe6cc96, lift: 1 },
  shingle: { label: "Shingles", url: R + "Brown/Roof_Brown_06-512x512.png", tint: 0xffffff, lift: 1 },
  tile: { label: "Clay tile", url: R + "Red/Roof_Red_03-512x512.png", tint: 0xffffff, lift: 1 },
  slate: { label: "Slate", url: R + "Gray/Roof_Gray_03-512x512.png", tint: 0xffffff, lift: 1 },
  tileblue: { label: "Blue tile", url: R + "Blue/Roof_Blue_01-512x512.png", tint: 0xffffff, lift: 1 },
  tileyellow: { label: "Yellow tile", url: R + "Yellow/Roof_Yellow_01-512x512.png", tint: 0xffffff, lift: 1 },
  tilewhite: { label: "White tile", url: R + "White/Roof_White_01-512x512.png", tint: 0xffffff, lift: 1 },
  tilebrown: { label: "Brown tile", url: R + "Brown/Roof_Brown_01-512x512.png", tint: 0xffffff, lift: 1 },
};
for (let i = 40; i <= 47; i++) TEXTURES["boards" + i] = { label: `Boards ${i - 39}`, url: `${W}Wooden Planks (${i}).png`, tint: 0xffffff, lift: 1 };

/** What each role may be set to in the UI. */
export const CHOICES = {
  wall: ["bark", "oak", "plank", "darkplank", "stone", "brick"],
  frame: ["bark", "oak", "plank", "darkplank"],
  floor: ["bark", "oak", "plank", "darkplank", "stone", "gravel"],
  foundation: ["stone", "brick", "gravel"],
  door: ["darkplank", "plank", "oak", "boards41", "boards44"],
  window: ["plank", "oak", "darkplank"],
  roof: ["thatch", "thatch2", "shingle", "tile", "slate", "tilebrown", "tileblue", "tileyellow", "tilewhite"],
};
export const TINTS = [
  { id: "none", label: "Natural", tint: null }, { id: "light", label: "Light", tint: 0xe8d8b8 }, { id: "dark", label: "Dark", tint: 0x6a5a4a },
  { id: "red", label: "Red", tint: 0xc98a7a }, { id: "green", label: "Green", tint: 0x8fae80 }, { id: "blue", label: "Blue", tint: 0x8aa3c0 },
  { id: "ochre", label: "Ochre", tint: 0xe0bf7a }, { id: "white", label: "Whitewash", tint: 0xf1ece4 },
];
export const ROLE_LABELS = { wall: "Walls", frame: "Roof timbers", floor: "Floor", foundation: "Foundation", door: "Doors", window: "Windows & shutters", roof: "Roof" };

const texCache = new Map();
export function textureFor(key) {
  const t = TEXTURES[key]; if (!t) return null;
  if (!texCache.has(key)) { const x = new THREE.TextureLoader().load(t.url); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = 8; texCache.set(key, x); }
  return texCache.get(key);
}

/** The role of a piece (and, for multi-material pieces, of one of its materials). null = leave as authored. */
export function roleOf(defId, matIndex = 0, matCount = 1) {
  defId = defId.replace(/@np$/, "");   // a wall without its posts is the same wall
  if (defId === "half-log" || defId === "plank") return "floor";
  if (defId === "stone" || defId === "footing") return "foundation";
  if (defId.startsWith("rafter-log@") || defId.startsWith("ridge-beam@")) return "frame";
  if (defId === "log-wall-door") return matIndex === 0 ? "wall" : matIndex === 1 ? "door" : null;
  if (defId === "log-wall-window") return matIndex === 0 ? "wall" : matIndex === 1 ? "window" : null;
  if (defId.startsWith("log-wall") || defId.startsWith("gable-log@") || defId === "log") return "wall";
  return null;
}

const matCache = new Map();
/** A material under a paint role. Cached; returns `base` untouched when the role is unpainted. */
export function painted(base, role, paint) {
  const spec = role && paint?.[role]; if (!spec || (!spec.tex && spec.tint == null)) return base;
  const key = `${base.uuid}|${role}|${spec.tex || ""}|${spec.tint ?? ""}`;
  if (!matCache.has(key)) {
    const m = base.clone();
    const tex = spec.tex && TEXTURES[spec.tex];
    if (tex) { m.map = textureFor(spec.tex); m.color = new THREE.Color(spec.tint ?? tex.tint).multiplyScalar(tex.lift); }
    else if (spec.tint != null) m.color.multiply(new THREE.Color(spec.tint));
    m.needsUpdate = true; matCache.set(key, m);
  }
  return matCache.get(key);
}
