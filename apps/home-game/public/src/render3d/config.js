// Tunables for the 3D view. Everything that was a judgement call lives here so it can be adjusted in one place.
// World units are metres. One map tile is TILE_M metres square (decision: 2 m, so a ~1.8 m character is just under a tile).
export const TILE_M = 2;

// Camera, calibrated against the reference screenshot (characters ~18% of screen height, steep look-down, hazy centre).
export const CAMERA = {
  fov: 35,
  dist: 18.5,          // metres from the follow target (13 was the original calibration; 14.6 felt too close)
  distMin: 14, distMax: 25,       // a little wiggle room either side of the calibrated distance (add ?zoom=free to the URL for the full range)
  pitch: 63,           // degrees above the horizon
  pitchMin: 35, pitchMax: 72,
  yaw: 35,             // degrees; free to orbit
  height: 1.1,         // look-at point above the character's feet
  follow: 6,           // follow smoothing (1/s)
};

// Fog: the world fades into the sky colour (calibrated by eye against the reference screenshot).
export const FOG = { density: 0.05 };   // exponential-squared: ~12% haze at 7 m, ~30% at 12 m, solid by ~25 m

// Terrain
export const TERRAIN = {
  vertsPerTile: 2,
  waterLevel: 0,       // y of the water surface
  basinDepth: 1.4,     // how far water tiles dip below the surface
  landNoiseAmp: 0.55,  // rolling hills on land (metres)
  shoreBlur: 0.45,     // tiles; how far the water mask is smoothed (softens the shoreline slope)
  waterGain: 1.0,      // boosts the blurred water mask so 1-tile ponds still hold water (big lakes saturate at 1)
  grassTexture: "assets3d/textures/terrain/grass1.jpg",
  grassRepeatM: 7,     // metres per texture repeat
};

// Colours
export const COLORS = {
  grass: 0xa8c47e,
  sand: 0xd8c58c,
  wetSand: 0x9a8760,
  water: 0x35607a,     // same as City Builder's lakes
  shallow: 0x5f95a0,
};

// Day cycle (mirrors main.js: DAY_SECONDS, DAYLIGHT_SECONDS) — read from the game when present.
export function dayLengths() {
  const day = typeof DAY_SECONDS !== "undefined" ? DAY_SECONDS : 240;
  const light = typeof DAYLIGHT_SECONDS !== "undefined" ? DAYLIGHT_SECONDS : day * 0.65;
  return { day, light };
}
