
// src/main.js
// Firebase arrives through window.__fb (set by src/boot.js, which loads this file after the SDK is ready).
// This file is a classic script, not a module: the HUD (src/ui) and the 3D view (src/render3d) share its globals.
const {
  onAuthStateChanged, addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where,
  onChildAdded, onDisconnect, onValue, push, ref, remove, set,
  auth, db, firebaseReady, rtdb, FIRESTORE, HOST_ROLE, PARTNER_ROLE, roleFor, rtdbPaths,
} = window.__fb;

const GAME_BUILD = 190;
const TILE_SIZE = 48;

// Overworld dimensions
const WORLD_W = 80;
const WORLD_H = 80;

// Interior dimensions
const INTERIOR_W = 11;
const INTERIOR_H = 10;

// =======================
// Construction constants
// =======================
const BUILD_FOOTPRINT = 3;

const BUILD_STAGES = [
  {
    id: "build_site",
    icon: "build_site.png",
    needs: { concrete: 100 },     // Build Site -> Foundation
    next: "foundation"
  },
  {
    id: "foundation",
    icon: "foundation.png",
    needs: { plank: 200 },       // Foundation -> Framing
    next: "framing"
  },
  {
    id: "framing",
    icon: "framing.png",
    needs: { wood: 100, plank: 100 }, // Framing -> House
    next: "house"
  },
  {
    id: "house",
    icon: "house.png",
    needs: null,
    next: null
  }
];

const BUILD_NEXT = Object.fromEntries(
  BUILD_STAGES.map(s => [s.id, s.next])
);

const BUILD_STAGE_TIME_SEC = {
  build_site: 120,
  foundation: 150,
  framing: 180
};

const BUILD_STAMINA_COST_PER_SEC = 1.00;

// =======================
// Dev Console Commands
// =======================

window.additem = function (itemId, qty = 1) {
  if (!state?.data?.items?.[itemId]) {
    console.warn("additem: unknown item id:", itemId);
    return;
  }

  const inv = activeInv();
  const p = activePlayer();

  const added = addItem(inv, itemId, qty);
  if (!added) {
    addDroppedItem(p.x, p.y, itemId, qty);
    console.warn(`Inventory full → dropped ${itemId} x${qty}`);
  } else {
    // console.log(`Added ${itemId} x${qty}`);
  }

  playSound("click");
};

// DEV: teleport active player to tile (x, y) on the current map
window.devtp = function (x, y) {
  x = x | 0; y = y | 0;
  const { w, h } = currentDims();
  if (!inBounds(x, y, w, h)) {
    console.warn(`devtp: (${x}, ${y}) is out of bounds for current map (${w}x${h})`);
    return;
  }
  const p = activePlayer();
  p.x = x; p.y = y;
  p.fx = x; p.fy = y;
  p.path = [];
  p.resting = false;
  if (state.net?.enabled) {
    state.net.moveQueue = [];
    state.net._pendingMove = null;
    // Lock out snapshots from overwriting this position until the server catches up
    state.net._devtpTarget = { x, y, playerIdx: state.activePlayer | 0 };
  }
  if (state.mode === "overworld") revealAroundPlayers();
  ensureCameraEdgeScroll();
  logAction(`DEV: teleported ${p.name} to (${x}, ${y}).`);
  // console.log(`Teleported ${p.name} to (${x}, ${y})`);
};

// DEV: full reset — wipes all game data from localStorage and reloads
window.devreset = function () {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith("yamhome_") || k.startsWith("YAMHOME:"))) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  console.warn(`[DEV] devreset: cleared ${keysToRemove.length} keys:`, keysToRemove);
  location.reload();
};

// DEV: diagnose chat / WebSocket state
window.chatDebug = function () {
  const ws = state.net?.ws;
  const stateMap = { 0: "CONNECTING", 1: "OPEN", 2: "CLOSING", 3: "CLOSED" };
  console.warn("[chatDebug] net.enabled =", state.net?.enabled);
  console.warn("[chatDebug] ws.readyState =", ws ? `${ws.readyState} (${stateMap[ws.readyState] ?? "?"})` : "no ws");
  console.warn("[chatDebug] playerId =", state.net?.playerId, "| isHost =", state.net?.isHost);
  console.warn("[chatDebug] chatMessages (" + (state.chatMessages?.length ?? 0) + "):", state.chatMessages);
  console.warn("[chatDebug] _pendingChatIds:", state.net?._pendingChatIds);
  // Chat input status
  const inp = document.getElementById("chatInput");
  const wrap = document.getElementById("chatWrap");
  console.warn("[chatDebug] chatInput exists:", !!inp, "| display:", wrap?.style.display, "| focused:", document.activeElement === inp);
  console.warn("[chatDebug] chatInput position: left=" + wrap?.style.left + " top=" + wrap?.style.top);
  // Inject a test message as if received from the OTHER player
  const other = (state.activePlayer === 0) ? 1 : 0;
  applyChatMessage(other, ">>> TEST MESSAGE from chatDebug <<<", {});
  console.warn("[chatDebug] Injected test message from player", other, "— it should appear in the chat log now.");
};

// DEV: send a chat message directly (bypasses input focus requirement)
window.sendchat = function (text) {
  sendChatMessage(state.activePlayer, String(text || "test"));
};

// DEV: enter an interior instantly (no house required)
window.deventerior = function (interiorId = "house_small") {
  state.interiorId = interiorId;

  state.interior = generateInterior(interiorId);
  state.mode = "interior";

  const p = activePlayer();
  p.x = 2; p.y = INTERIOR_H - 2;
  p.fx = p.x; p.fy = p.y;
  p.path = [];

  state.cam.x = 0; state.cam.y = 0;
  clampCamera();
  closeMenu();

  logAction(`DEV: entered interior "${interiorId}".`);
};

// ------------- TUTORIAL CONSTANTS ----
const PROFILE_KEY = "yamhome_profile_v1";
const TUTORIAL_SEEN_KEY = "yamhome_tutorial_seen_v1";
const WANT_TUTORIAL_KEY = "yamhome_want_tutorial_v1";

const CUTSCENE_SEEN_KEY = "yamhome_cutscene_seen_v1";
const WANT_CUTSCENE_KEY = "yamhome_want_cutscene_v1";

const COLLECTIBLES_FOUND_KEY = "yamhome_collectibles_found_v1";

// ---- Love Letters / First-play gates ----
const FIRST_PLAY_DONE_KEY = "yamhome_first_play_done_v1";
const CRISTINA_FIRST_LETTER_KEY = "yamhome_cristina_first_letter_v1";

function isFirstPlayEver() {
  // first play = no profile selected yet AND we haven't marked first play done
  const prof = (typeof loadSavedProfile === "function") ? loadSavedProfile() : null;
  const done = localStorage.getItem(FIRST_PLAY_DONE_KEY) === "1";
  return !done && !prof;
}

function ensureProfileSelectedBeforePlay() {
  const prof = (typeof loadSavedProfile === "function") ? loadSavedProfile() : null;
  if (prof === "scott" || prof === "cristina") return true;

  // Force title -> pick character
  state.title = state.title || {};
  state.title.open = true;
  state.title.phase = "pick";     // your title system already supports "pick" :contentReference[oaicite:5]{index=5}
  state.title.openP = 1;

  // Prevent “Continue” from silently dropping into Scott by default
  // console.log("[PROFILE] No saved profile yet. Forcing character select.");
  return false;
}

function grantCristinaFirstLetter() {
  // Only once, only when actively playing as Cristina
  const prof = (typeof loadSavedProfile === "function") ? loadSavedProfile() : null;
  // Only Cristina (player index 1)
if (state.activePlayer !== 1) return;

  if (localStorage.getItem(CRISTINA_FIRST_LETTER_KEY) === "1") return;

  // must exist in items
  if (!state?.data?.items?.love_letter) {
    console.warn("[LOVE] love_letter item missing from items.json");
    return;
  }

  // Add to Cristina inventory (activeInv should already point at correct player inventory)
  const inv = activeInv();
  const p = activePlayer();

  // Prefer your existing helper if present
  if (typeof addItemOrDrop === "function") {
    addItemOrDrop(inv, "love_letter", 1, p.x, p.y, p.name);
  } else if (typeof addItem === "function") {
    const ok = addItem(inv, "love_letter", 1);
    if (!ok && typeof addDroppedItem === "function") addDroppedItem(p.x, p.y, "love_letter", 1);
  } else {
    // last resort
    inv.push({ id: "love_letter", qty: 1 });
  }

  localStorage.setItem(CRISTINA_FIRST_LETTER_KEY, "1");
  // console.log("[LOVE] Granted Cristina first love_letter.");
}

function openLoveLetter(itemDef) {
  state.ui.loveLetter = {
    open: true,
    text: itemDef.message || ""
  };
}
// Fog of war visibility radius (1 => 3x3 around each player)
const VIS_RADIUS = 1; // base
const CAMPFIRE_LIGHT_RADIUS = 2; // tiles lit around a campfire at night
const CAMPFIRE_BURN_SECONDS = 60;
const CAMPFIRE_ADD_WOOD_SECONDS = 20;
const NIGHT_DARK_ALPHA = 0.55;          // higher = darker night
const CAMPFIRE_LIT_DARK_ALPHA = 0.05;   // lower = brighter campfire

const HOLDING_HANDS_ICON = { type: "image", src: "src/icons/holding_hands.png" };

// FONTS
const BASE_FONT = "BaseFont";
const TITLE_FONT = "TitleFont";
const GLYPH_FONT = "GlyphFont";

// Inventory UI
const INV_COLS = 12;
const INV_ROWS = 3;   // 36 slots (the backpack sheet in src/ui/hud.js lays them out 12x3 on wide screens, 9x4 on phones)
const INV_SLOTS = INV_COLS * INV_ROWS;

// UI sizes: how much of the screen the HUD covers. The HUD (src/ui/hud.js) floats over a full-screen play area, so only the bottom
// dock / open sheet counts; hud.js updates UI_BOTTOM_H every frame and the 3D camera (scene3d.fitView) and 2D map follow it.
let UI_TOP_H = 0;
let UI_BOTTOM_H = 66;
let UI_LEFTBAR_W = 0;

// Pointer drag threshold
const DRAG_THRESHOLD_PX = 8;

// ---- Hunger ----
const HUNGER_MAX = 100;
const HUNGER_PER_SEC = 0.25; // hunger gained per second
const STARVE_STAMINA_DRAIN_PER_SEC = 1.0;

// Movement + stamina
const MOVE_SPEED_TILES_PER_SEC = 6;
const MOVE_SPEED_TILES_PER_SEC_3D = 3; // a tile is 2 m in 3D, so 6 tiles/s would be a 12 m/s sprint
const STAMINA_MAX = 100;
const STAMINA_COST_PER_TILE = 1.0;
const REST_REGEN_PER_SEC = 12.0;
const HARVEST_STAMINA_COST_WOOD = 6;
const HARVEST_STAMINA_COST_STONE = 8;

// Double click threshold
const DOUBLE_CLICK_MS = 350;

// ---- Time / Farming ----
const DAY_SECONDS = 360;        // 6 minutes = 1 in-game day (4 min of daylight + 2 min of night)
const DAYLIGHT_SECONDS = 240;   // 4 min day, 2 min night
const GROW_DAYS = 3;

// Dungeon dimensions (generated on entry)
const DUNGEON_W = 70;
const DUNGEON_H = 70;

// ---- Dungeon music ----
const DUNGEON_TRACK_COUNT = 14;

// ---- Tree stuff ----
const TREE_REGROW_DAYS_STAGE1 = 3; // stump -> seedling
const TREE_REGROW_DAYS_STAGE2 = 6; // seedling -> tree

const RENEWABLE_RESPAWN_DAYS = 4;

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// -------------------------------------------------------------------------- State & Players ----
const state = {
  mode: "overworld", // "overworld" | "interior" | "dungeon"
  data: null,

net: {
  enabled: false,
  uid: null,        // Firebase Auth uid, once signed in
  worldId: null,
  playerId: null,   // "p1" (host/Scott) or "p2" (partner/Cristina), derived from role
  isHost: false,
  lastSnapshotAt: 0,
  suppressWorldOps: false
},

// Dungeons are generated on entry and cached/saved by id
dungeon: null,       // current dungeon map { tiles, objects, ... }
dungeonId: null,     // string
dungeonReturn: null, // { x, y, type } overworld entrance that led here
dungeons: {},        // in-memory cache of saved payloads

  // 6x6 build placement mode
  placement: {
    active: false,
    blueprintItemId: null, // e.g. "blueprint_house"
    placeId: null,         // e.g. "build_site"
    anchorX: null,
    anchorY: null,
    dragging: false
  },

  // key: "x,y" → { stageId, mats, building, timeLeft, builders, ... }
  buildProjects: {},

  world: null,    // { tiles, objects, explored:boolean[][] }
  interior: null, // { tiles, objects }
  interiorId: "house_small",
  
  // Screen fade (sleep, etc.)
screenFade: null,

    // Interior edit mode (for decorating / changing tiles)
  interiorEdit: {
    on: false
  },

  actionLog: [],
  logScroll: 0,
  logExpanded: false,

  // Optional story cutscene (first-play; rewatchable via checkbox)
  wantCutscene: false,

  cutscene: {
    open: false,
    index: 0,
    seen: false,
    t: 0,       // animation timer
    _after: "",  // "tutorial" or "start"
	orbs: {
  a: { x: 0, y: 0, vx: 0, vy: 0 },
  b: { x: 0, y: 0, vx: 0, vy: 0 },
    stars: null,
  init: false
}
  },

  wantTutorial: true,

  tutorial: {
    open: false,
    index: 0,
    seen: false
  },

  players: [
    {
      id: "p1", name: "Scott", x: 2, y: 2, fx: 2, fy: 2,
      icon: { type: "image", src: "src/icons/scott_avatar.png" },
      path: [],
      stamina: STAMINA_MAX,
      hunger: 0,
      resting: false
    },
    {
      id: "p2", name: "Cristina", x: 3, y: 2, fx: 3, fy: 2,
      icon: { type: "image", src: "src/icons/cristina_avatar.png" },
      path: [],
      stamina: STAMINA_MAX,
      hunger: 0,
      resting: false
    }
  ],

  activePlayer: 0,

  inventories: [[], []],

  structures: {
    stockpiles: [],
    houses: []
  },

  markers: [],

  cam: { x: 0, y: 0 },

  pointer: {
    down: false,
    dragging: false,
    startX: 0, startY: 0,
    lastX: 0, lastY: 0
  },

  ui: {
    musicSliderOpen: false,
    musicDragging: false
  },

// Global Settings modal state
settingsOpen: false,
settingsTab: "audio",   // "audio" | "controls"
settingsDrag: null,     // "master" | "sfx" | "music" | "ambient" while dragging
_settingsUI: null,

  // Context menu
  menu: null, // { screenX, screenY, title, options:[...], hoverIndex:-1 }

  // Modal dialogs
  coordsOpen: false,     // saved coordinates modal
  coordsSelected: null, // string key for selected saved marker (for Travel There)
  stockpileOpen: null,   // { key } if stockpile UI open
  
  collectiblesOpen: false,   // archive modal open/closed
collectiblesView: "list",  // "list" | "reader"
collectiblesSelected: null, // itemId currently open in reader
collectiblesScroll: 0,     // list scroll offset
collectiblesFound: loadCollectiblesFound(), // persisted archive

collectiblesFilter: "all", // "all" | "love"

  // Treasure map (revealed coords + dig target)
  treasureOpen: false,      // modal open/closed
  treasureTarget: null,     // { x, y, by }
  _treasureUI: null,
  
    // Rune combination lock (dungeon puzzle chest)
  comboLock: null,       // { open:true, x,y, digits:[...], solution:[...], tries:int }
  riddleLock: null,      // { open:true, x,y, riddleId, tries:int, flash:ms, note:string }: the word-answer chest
  _comboLockUI: null,

  // Construction modal
constructionOpen: null, // { key, x, y }
constructionSelectedInvIdx: -1,
constructionLogScroll: 0,

 // Player-to-player interaction request (simple local “network”)
  interactionRequest: null, // { type, fromIndex, toIndex, createdAt }
  holdingHands: null,       // { a, b, leader }: a = the one who asked (the leader), b walks beside them until it ends
  couplePending: null,      // { kind: "hold"|"kiss"|"hug", a, b, since }: accepted, waiting for the two to be side by side
  coupleAnim: null,         // { kind: "kiss"|"hug", a, b, start, dur }: a kiss or hug being played (the 3D view animates it)

  // Trade screen
  trade: { open: false },
  // Chat
  chatMessages: [], // { fromIndex, text, t }
  speechBubbles: [null, null], // per player: { text, until }


// Crafting
craftingOpen: false,
craftingMode: null,   // "craft" | "cook"
selectedForCraft: new Map(), // itemId -> qtySelected
selectedInvIdx: -1,
craftingDrag: null,
learnedRecipes: new Set(),
recipeLootExtra: {}, 
hoveredUI: null,
lastCraftItemId: null,

  // Placement modes
  placinghouse: false,
  placingStockpile: false,

  // Double click tracking
  lastInvClick: { idx: -1, t: 0 },

// ---- Music ----
music: {
  unlocked: false,     // autoplay policy unlock
  enabled: true,
  audio: null,
  contextKey: null,    // "daytime_outdoor" etc
  lastTrack: null,     // full file base name, e.g. "daytime_outdoor3"
  volume: 0.15,
  fadeMs: 900,           // fade duration
  _fade: null,            // internal fade state
    // --- Ambience (day/night loop, fades like music) ---
  ambienceEnabled: true,      // can be tied to your settings toggle if you want
  ambienceAudio: null,
  ambienceKey: null,          // "day" or "night"
  ambienceFadeMs: 900,
  _ambFade: null,
  ambSwitching: false,
  pendingAmbKey: null,
  ambienceGain: 0.70,         // ambience volume relative to music slider
  switching: false,
  pendingCtxKey: null,
  indexMax: 10         // how many numbered tracks to try 
},

// ---- Title Menu ----
title: {
  open: true,
  phase: "closed",  // "closed" | "intro" | "menu" | "pick"
  openP: 0,         // 0.1
  savedProfile: null,
  wantTutorial: true, // <-- add this
  _ui: null
},

  // ---- Time ----
  time: {
    t: 0,          // total seconds elapsed (for bookkeeping)
    day: 1,        // starts at Day 1
    phaseT: 0,     // seconds into current day (0..DAY_SECONDS)
    isDay: true
  },

  // Loop timing
  _lastTime: performance.now()
};

state.title.savedProfile = loadSavedProfile();

// OFFLINE: use saved profile to pick who you control.
if (!state.net?.enabled) {
  if (state.title.savedProfile === "cristina") state.activePlayer = 1;
  else if (state.title.savedProfile === "scott") state.activePlayer = 0;
  else state.activePlayer = 0; // default if nothing saved
} else {
  // ONLINE: server assigns which player this client controls.
  state.activePlayer = 0; // temporary until "welcome" arrives
}

state.tutorial.seen = loadTutorialSeen();
// console.log("TUTORIAL SEEN AFTER LOAD:", state.tutorial.seen);

state.cutscene.seen = loadCutsceneSeen();

const wantC = loadWantCutscene();
if (wantC !== null) state.wantCutscene = wantC;

// After first forced tutorial, this becomes optional.
// Default is always OFF unless user explicitly enabled it.
const savedWant = loadWantTutorial();
state.wantTutorial = savedWant === true;

function flushBufferedLogs() {
  state.net = state.net || {};
  state.net._bufferedLogs = state.net._bufferedLogs || [];
  state.net._pendingLogTexts = state.net._pendingLogTexts || [];

  if (!netCanSend()) return;

  // Send oldest -> newest so history is chronological
  while (state.net._bufferedLogs.length) {
    const line = state.net._bufferedLogs.shift();

    // mark as "already shown locally" so echo doesn't duplicate
    state.net._pendingLogTexts.push(line);

    sendNetInput({ type: "log", text: line });
  }
}

function seedServerWithLocalLogIfNeeded(serverIncomingCount) {
  state.net = state.net || {};

  // If we don't KNOW host status yet, do nothing (and do NOT mark seeded).
  if (state.net.isHost === undefined || state.net.isHost === null) {
    // console.log("[NET][LOG] seed skipped: host status not known yet");
    return;
  }

  // Only host is allowed to seed
  if (!state.net.isHost) {
    // console.log("[NET][LOG] seed skipped: not host");
    return;
  }

  // If we already seeded successfully once, stop
  if (state.net._seededInitialLog) return;

  // Only seed if server has nothing but we do
  if ((serverIncomingCount | 0) !== 0) {
    // console.log("[NET][LOG] seed skipped: server already has logs:", serverIncomingCount | 0);
    state.net._seededInitialLog = true; // server isn't empty, so no need to ever seed
    return;
  }

  if (!Array.isArray(state.actionLog) || state.actionLog.length === 0) {
    // console.log("[NET][LOG] seed skipped: host has no local logs");
    return;
  }

  if (!netCanSend()) return;

  state.net._pendingLogTexts = state.net._pendingLogTexts || [];

  // Mark seeded ONLY when we are actually going to send
  state.net._seededInitialLog = true;

  // state.actionLog is newest-first; send oldest-first
  for (let i = state.actionLog.length - 1; i >= 0; i--) {
    const line = String(state.actionLog[i] ?? "");
    if (!line) continue;

    // mark as already shown locally so echo doesn't duplicate
    state.net._pendingLogTexts.push(line);

    sendNetInput({ type: "log", text: line });
  }

  // console.log("[NET][LOG] seeded server log from host local history:", state.actionLog.length);
}

// ---- Log Actions ----
function logAction(text) {
  const line = String(text ?? "");
  if (!line) return;

  state.net = state.net || {};
  state.net._pendingLogTexts = state.net._pendingLogTexts || [];

  const canSend = netCanSend();

  // ONLINE: show locally immediately + send ONCE to Firestore
  if (canSend && !state.net.suppressLogs) {
    state.actionLog.unshift(line);
    if (state.actionLog.length > 200) state.actionLog.pop();

    state.net._pendingLogTexts.push(line);
    // console.log("[NET][LOG] send log ->", line);

    sendNetInput({ type: "log", text: line });

    // ✅ FORCE UI UPDATE
    if (typeof renderActivityLogDOM === "function") renderActivityLogDOM();
    return;
  }

  // OFFLINE: local append
  // console.log("[LOG]", line);
  state.actionLog.unshift(line);
  if (state.actionLog.length > 200) state.actionLog.pop();

  // If we're "online-enabled" but not connected yet (auth still resolving),
  // buffer it so it gets sent once connectOnline() finishes (keeps both clients in sync).
  state.net._bufferedLogs = state.net._bufferedLogs || [];
  if (state.net.enabled && !canSend && !state.net.suppressLogs) {
    state.net._bufferedLogs.push(line);
    if (state.net._bufferedLogs.length > 500) state.net._bufferedLogs.shift();
  }

  // ✅ FORCE UI UPDATE
  if (typeof renderActivityLogDOM === "function") renderActivityLogDOM();
}

// Apply a server log entry (dedupe by seq + pending local)
function applyNetLogEntry(entry) {
  if (!entry) return;

  const seq  = (typeof entry === "object" && entry !== null) ? (entry.seq | 0) : 0;
  const text = (typeof entry === "object" && entry !== null) ? entry.text : entry;
  const line = String(text ?? "");
  if (!line) return;

  state.net = state.net || {};
  state.net._pendingLogTexts = state.net._pendingLogTexts || [];

  // seq-based dedupe
  state.net.lastLogSeq = state.net.lastLogSeq || 0;
  if (seq && seq <= state.net.lastLogSeq) return;
  if (seq) state.net.lastLogSeq = seq;

  // swallow echo of our own already-shown local line
  const idx = state.net._pendingLogTexts.indexOf(line);
  if (idx !== -1) {
    state.net._pendingLogTexts.splice(idx, 1);
    return;
  }

  // accept remote line
  const prev = !!state.net.suppressLogs;
  state.net.suppressLogs = true;
  try {
	       // console.log("[NET][LOG] applyNetLogEntry accepted ->", { seq, line });

    state.actionLog.unshift(line);
    if (state.actionLog.length > 200) state.actionLog.pop();
  } finally {
    state.net.suppressLogs = prev;
  }

  // force UI refresh (both clients)
  if (typeof renderActivityLogDOM === "function") renderActivityLogDOM();
}

// -------------------------------------------------------------------------- Worlds (local storage + selector) ----
const WORLDS_META_KEY = "yamhome_worlds_meta_v1";     // array of { id:number, seed:number, createdAt:number }
const ACTIVE_WORLD_KEY = "yamhome_world_active_v1";  // number
const WORLD_DATA_PREFIX = "yamhome_world_data_v1_";  // + id
const WORLD_INV_PREFIX = "yamhome_world_inv_v1_";
const WORLD_RECIPES_PREFIX = "yamhome_world_recipes_v1_";   // learned recipes + the "one extra scroll" bookkeeping

function invKey(worldId) {
  return WORLD_INV_PREFIX + String(worldId);
}

function saveInventoriesForWorld(worldId) {
  try {
    localStorage.setItem(WORLD_RECIPES_PREFIX + String(worldId), JSON.stringify({ learned: [...state.learnedRecipes], extra: state.recipeLootExtra || {} }));
    localStorage.setItem(invKey(worldId), JSON.stringify(state.inventories || [[], []]));
  } catch (e) {
    console.warn("Inventory save failed:", e);
  }
}

function loadRecipesForWorld(worldId) {
  try {
    const raw = localStorage.getItem(WORLD_RECIPES_PREFIX + String(worldId));
    if (raw) { const o = JSON.parse(raw); state.learnedRecipes = new Set(o.learned || []); state.recipeLootExtra = o.extra || {}; }
  } catch (e) { console.warn("Recipe load failed:", e); }
  seedStarterRecipes();
}

function loadInventoriesForWorld(worldId) {
  loadRecipesForWorld(worldId);
  try {
    const raw = localStorage.getItem(invKey(worldId));
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 2) {
      state.inventories = parsed;
      return true;
    }
  } catch (e) {
    console.warn("Inventory load failed:", e);
  }
  return false;
}

function saveInventoriesSoon() {
  if (state._saveInvTimer) return;

  state._saveInvTimer = setTimeout(() => {
    state._saveInvTimer = null;
    const id = getActiveWorldId?.();
    if (id) saveInventoriesForWorld(id);
  }, 300);
}


const WORLD_EPOCH_PREFIX = "yamhome_world_epoch_v1_";   // + world id: the last fresh start this device has applied

/** A world with a new epoch is a fresh start: empty bags, no learned recipes, no saved dungeons / markers, players at the spawn.
 *  Runs once per device per epoch (inventories live in each device's own localStorage). */
function applyFreshStartIfNew(wid, world) {
  const epoch = world?.epoch;
  if (!epoch) return;
  try { if (localStorage.getItem(WORLD_EPOCH_PREFIX + wid) === String(epoch)) return; } catch {}

  state.inventories = [[], []];
  state.learnedRecipes = new Set(); state.recipeLootExtra = {}; seedStarterRecipes();
  state.markers = [];
  state.structures = { stockpiles: [], houses: [] };
  state.dungeons = {};
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("YAMHOME:dungeon:") || k.startsWith("YAMHOME:interior:") || k.startsWith("yamhome_starter_toolkit_given")) localStorage.removeItem(k);
    }
    localStorage.removeItem(COLLECTIBLES_FOUND_KEY);
  } catch {}
  for (const pl of state.players) { pl.stamina = STAMINA_MAX; pl.hunger = 0; pl.resting = false; pl.path = []; }
  if (world.spawn) state.players.forEach((p, i) => { p.x = p.fx = world.spawn.x + i; p.y = p.fy = world.spawn.y; });
  if (state.mode === "overworld" && typeof revealAroundPlayers === "function") revealAroundPlayers();
  saveInventoriesForWorld(wid);
  try { localStorage.setItem(WORLD_EPOCH_PREFIX + wid, String(epoch)); } catch {}
  if (typeof writePlayerPositionThrottled === "function" && state.net?.enabled) writePlayerPositionThrottled();
}

// HOST ONLY: throw the shared world away and start over on a freshly generated island. Both devices wipe their progress.
window.devnewisland = function (confirm) {
  if (confirm !== "yes") { console.warn('devnewisland: this wipes the world, both inventories and all progress. Run devnewisland("yes") to do it.'); return; }
  if (!state.net?.enabled || !state.net.isHost) { console.warn("devnewisland: only the host (Scott) can start the world over."); return; }
  if (state.mode !== "overworld") { console.warn("devnewisland: go back to the overworld first."); return; }
  const wid = state.net.worldId;
  const gen = generateOverworld();
  gen.explored = make2D(WORLD_W, WORLD_H, false);
  gen.epoch = Date.now();
  const payload = worldToPayload(gen, wid, makeSeed());
  saveWorldPayload(wid, payload);
  state.world = payloadToWorld(payload);
  enableOverworldObjectsProxy();
  state.time.day = 1; state.time.phaseT = 0; state.time.t = 0; state.time.isDay = true;
  applyFreshStartIfNew(wid, state.world);
  ensurePlayersNotOnWater(state.world);
  publishWorld();
  publishTime(state.time.phaseT, state.time.day, state.time.t);
  logAction("A new island rises from the sea. Day 1.");
};

function loadWorldsMeta() {
  try {
    const raw = localStorage.getItem(WORLDS_META_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveWorldsMeta(meta) {
  localStorage.setItem(WORLDS_META_KEY, JSON.stringify(meta || []));
}

function getActiveWorldId() {
  const n = Number(localStorage.getItem(ACTIVE_WORLD_KEY));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function setActiveWorldId(id) {
  localStorage.setItem(ACTIVE_WORLD_KEY, String(id));
}

function worldKey(id) {
  return WORLD_DATA_PREFIX + String(id);
}

function loadWorldPayload(id) {
  try {
    const raw = localStorage.getItem(worldKey(id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveWorldPayload(id, payload) {
  localStorage.setItem(worldKey(id), JSON.stringify(payload));
}

/** Write everything to disk and (host) to the cloud right now, instead of waiting for the throttled saves. Resolves when the cloud write is done. */
async function saveEverythingNow() {
  clearTimeout(state._saveWorldTimer); state._saveWorldTimer = null;
  clearTimeout(state._saveInvTimer); state._saveInvTimer = null;
  const id = getActiveWorldId?.();
  try {
    if (state.mode === "dungeon" && state.dungeonId) saveDungeonLayout();
    if (id && state.world) { saveWorldPayload(id, worldToPayload(state.world, id, state.world.seed)); saveInventoriesForWorld(id); }
  } catch (e) { console.warn("local save failed:", e); }
  if (state.net?.enabled && firebaseReady) {
    try { await Promise.race([publishWorld(), new Promise((r) => setTimeout(r, 4000))]); } catch (e) { console.warn("cloud save failed:", e); }
  }
}

let _exiting = false;
async function exitToCouplesApp() {
  if (_exiting) return; _exiting = true;
  hudToast("Saving…", { icon: "bolt", ms: 5000 });
  await saveEverythingNow();
  try { if (state.net?.enabled && state.net.uid) await Promise.race([remove(ref(rtdb, rtdbPaths.player(state.net.worldId, state.net.uid))), new Promise((r) => setTimeout(r, 1500))]); } catch {}
  location.href = new URL("../", location.href).href;   // the couples app lives one level above /game/
}

function saveCurrentWorldSoon() {
  // Throttle saves so we don't hammer localStorage every frame
  if (state._saveWorldTimer) return;

  state._saveWorldTimer = setTimeout(() => {
    state._saveWorldTimer = null;

    const id = (typeof getActiveWorldId === "function") ? getActiveWorldId() : null;
    if (!id || !state.world) return;

    // IMPORTANT: worldToPayload must include explored for this to work
    const payload = worldToPayload(state.world, id, state.world.seed);
    saveWorldPayload(id, payload);
	saveInventoriesForWorld(id);

    // Keep the shared Firestore copy in sync a few hundred ms behind the
    // local save — only the host publishes (see publishWorld()'s comment).
    if (typeof publishWorld === "function") publishWorld();
  }, 350);
}

function nextWorldId(meta) {
  let maxId = 0;
  for (const w of meta) maxId = Math.max(maxId, w?.id | 0);
  return maxId + 1;
}

function makeSeed() {
  // deterministic seed value (we aren't using seeded RNG yet, but it labels the world)
  return (Math.random() * 2147483647) | 0;
}

function make2D(w, h, fill = null) {
  const arr = new Array(h);
  for (let y = 0; y < h; y++) {
    arr[y] = new Array(w);
    for (let x = 0; x < w; x++) {
      arr[y][x] = fill;
    }
  }
  return arr;
}

function worldToPayload(world, id, seed) {
  return {
    id,
    seed,
    w: WORLD_W,
    h: WORLD_H,
    tiles: world.tiles,
    objects: world.objects,
    explored: world.explored || make2D(WORLD_W, WORLD_H, false),
    structures: world.structures || {},   // modular houses (src/render3d/building)
    spawn: world.spawn || null,           // where new players start (island worlds)
    epoch: world.epoch || null,           // set when the host starts the world over: every device wipes its own progress once per epoch
  };
}

function payloadToWorld(payload) {
  return {
    id: payload.id,
    seed: payload.seed,
    tiles: payload.tiles,
    objects: payload.objects,
    explored: Array.isArray(payload.explored)
      ? payload.explored
      : make2D(WORLD_W, WORLD_H, false),
    structures: payload.structures || {},
    spawn: payload.spawn || null,
    epoch: payload.epoch || null,
  };
}

// Ensure there's at least one world on disk (cache reset → makes World 1 automatically)
function ensureAtLeastOneWorld() {
  const meta = loadWorldsMeta();
  let activeId = getActiveWorldId();

  if (meta.length && activeId && loadWorldPayload(activeId)) return;

  // Create World 1 (or next)
  const id = nextWorldId(meta.length ? meta : []);
  const seed = makeSeed();

  const gen = generateOverworld(); // your existing generator
  if (!gen.explored) gen.explored = make2D(WORLD_W, WORLD_H, false);
  const payload = worldToPayload(gen, id, seed);

  meta.push({ id, seed, createdAt: Date.now() });
  saveWorldsMeta(meta);
  saveWorldPayload(id, payload);
  setActiveWorldId(id);
}

function createNewWorldAndSelect() {
  const meta = loadWorldsMeta();
  const id = nextWorldId(meta);
  const seed = makeSeed();

  const gen = generateOverworld();
  const payload = worldToPayload(gen, id, seed);

  meta.push({ id, seed, createdAt: Date.now() });
  saveWorldsMeta(meta);
  saveWorldPayload(id, payload);
  setActiveWorldId(id);

  return { id, payload };
}

function overworldReady() {
  const m = state.world;
  const tilesOk = Array.isArray(m?.tiles) && m.tiles.length === WORLD_H && Array.isArray(m.tiles[0]) && m.tiles[0].length === WORLD_W;
  const objsOk  = Array.isArray(m?.objects) && m.objects.length === WORLD_H && Array.isArray(m.objects[0]) && m.objects[0].length === WORLD_W;
  return tilesOk && objsOk;
}

// ---- Resize -----------------------------------------------------------------------------------------------
function resize() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  // Narrow phone viewport: shrink the sidebar to claw back width for the
  // inventory grid (see invGridMetrics()).
  UI_LEFTBAR_W = window.innerWidth < 480 ? 44 : 64;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  positionChatInput();
}
window.addEventListener("resize", resize);
resize();

// Presence cleanup is handled by RTDB onDisconnect() (see connectOnline),
// which fires even on a hard crash/network drop, not just a clean unload.

// -------------------------------------------------------------------------- CO-OP Helpers (Firebase) ----
// Replaces the old WebSocket protocol (hello/welcome/snapshot/world_set/
// world_op/move/log/chat/time_sync/interaction_*/trade_*) — see
// src/game/schema.js for the path/shape contract each piece below maps to.
// There's no more "room" or server-assigned playerId: role is derived from
// whoever is signed in (shared Firebase Auth session with apps/couples-app).

let _worldUnsub = null, _logUnsub = null, _chatUnsub = null;
let _playersUnsub = null, _opsUnsub = null, _timeUnsub = null, _interactionUnsub = null, _presenceUnsub = null;
let _posWriteTimer = null;
let _appliedWorldVersion = null;

function netCanSend() {
  return !!(state.net?.enabled && state.net?.uid && state.net?.worldId && firebaseReady);
}

function connectOnline() {
  state.net = state.net || {};

  if (!firebaseReady) {
    console.warn("[NET] Firebase not configured; playing offline.");
    return;
  }

  // --- Log sync state (unchanged from before) ---
  state.net.suppressLogs = false;
  state.net._bufferedLogs = state.net._bufferedLogs || [];
  state.net._pendingLogTexts = state.net._pendingLogTexts || [];

  onAuthStateChanged(auth, (user) => {
    console.info(`[NET] onAuthStateChanged fired: user=${user ? user.uid : "null (not signed in)"}`);
    // Tear down any listeners from a previous user before (re)subscribing.
    for (const unsub of [_worldUnsub, _logUnsub, _chatUnsub, _playersUnsub, _opsUnsub, _timeUnsub, _interactionUnsub, _presenceUnsub]) {
      if (typeof unsub === "function") unsub();
    }
    _worldUnsub = _logUnsub = _chatUnsub = _playersUnsub = _opsUnsub = _timeUnsub = _interactionUnsub = null;

    if (!user) {
      state.net.enabled = false;
      state.net.uid = null;
      updateOnlineIndicator();
      return;
    }

    const role = roleFor(user);
    state.net.uid = user.uid;
    state.net.playerId = role === HOST_ROLE ? "p1" : role === PARTNER_ROLE ? "p2" : null;
    state.net.isHost = role === HOST_ROLE;
    state.activePlayer = state.net.playerId === "p2" ? 1 : 0;
    state.net.enabled = true;

    if (typeof ensureAtLeastOneWorld === "function") ensureAtLeastOneWorld();
    let wid = (typeof getActiveWorldId === "function") ? getActiveWorldId() : null;
    if (!wid) wid = 1;
    state.net.worldId = wid;

    console.info(
      `[NET] connected as uid=${user.uid} name=${JSON.stringify(user.displayName)} email=${JSON.stringify(user.email)} ` +
      `-> role=${role ?? "(none — roleFor() matched neither 'scott' nor 'cristina')"} isHost=${state.net.isHost} worldId=${wid}`
    );

    // ---- World: Firestore doc is authoritative; localStorage is the offline cache ----
    _appliedWorldVersion = null;
    const worldRef = doc(db, FIRESTORE.worlds, String(wid));
    _worldUnsub = onSnapshot(worldRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.version === _appliedWorldVersion) {
          console.info(`[NET] world/${wid} snapshot echo (version=${data.version}) — ignoring our own write`);
          return;
        }
        console.info(`[NET] world/${wid} snapshot received (hostUid=${data.hostUid}, version=${data.version}) — applying`);
        _appliedWorldVersion = data.version;
        try {
          const payload = JSON.parse(data.worldJson);
          if (typeof setActiveWorldId === "function") setActiveWorldId(wid);
          if (typeof saveWorldPayload === "function") saveWorldPayload(wid, payload);
          if (typeof payloadToWorld === "function") {
            state.world = payloadToWorld(payload);
            enableOverworldObjectsProxy();
            applyFreshStartIfNew(wid, state.world);
          }
          if (Array.isArray(state.players)) for (const pl of state.players) pl.path = [];
          if (typeof revealAroundPlayers === "function") revealAroundPlayers();
        } catch (e) {
          console.error("[NET] failed to apply world snapshot:", e);
        }
      } else if (state.net.isHost) {
        // Nothing published yet — host seeds it from local state.
        console.info(`[NET] world/${wid} doesn't exist in Firestore yet — publishing as host`);
        publishWorld();
      } else {
        console.warn(`[NET] world/${wid} doesn't exist in Firestore and we're not host — waiting for host to publish. If this never changes, the host device is either not connecting, using a different worldId, or not being recognized as host.`);
      }
    });

    // ---- Activity log: last 200, ordered newest-first, live-append after ----
    (async () => {
      try {
        const q = query(collection(db, FIRESTORE.log), where("worldId", "==", String(wid)), orderBy("at", "desc"), limit(200));
        const initial = await getDocs(q);
        const incoming = initial.docs.map((d) => d.data()?.text).filter(Boolean).map(String);
        if (!Array.isArray(state.actionLog) || state.actionLog.length === 0) {
          state.actionLog = incoming;
        } else {
          const have = new Set(state.actionLog);
          for (const line of incoming) if (!have.has(line)) state.actionLog.push(line);
        }
        if (typeof flushBufferedLogs === "function") flushBufferedLogs();
        if (typeof renderActivityLogDOM === "function") renderActivityLogDOM();
        if (state.net.isHost && typeof seedServerWithLocalLogIfNeeded === "function") {
          seedServerWithLocalLogIfNeeded(initial.docs.length);
        }

        let first = true;
        _logUnsub = onSnapshot(q, (snap) => {
          if (first) { first = false; return; } // already merged above
          for (const change of snap.docChanges()) {
            if (change.type === "added") applyNetLogEntry({ text: change.doc.data()?.text });
          }
        });
      } catch (e) {
        console.error("[NET] log subscribe failed:", e);
      }
    })();

    // ---- Chat: live listener only (no history replay needed on join) ----
    {
      const chatQ = query(collection(db, FIRESTORE.chat), where("worldId", "==", String(wid)), orderBy("at", "desc"), limit(50));
      let firstChat = true;
      _chatUnsub = onSnapshot(chatQ, (snap) => {
        if (firstChat) { firstChat = false; return; } // don't replay chat history as new bubbles
        for (const change of snap.docChanges()) {
          if (change.type !== "added") continue;
          const data = change.doc.data();
          if (data.by === state.net.uid) continue; // our own message, already shown optimistically
          // Only ever one other person — whoever it is, they're "not me".
          const fromIndex = (state.activePlayer | 0) === 0 ? 1 : 0;
          applyChatMessage(fromIndex, data.text, {});
        }
      });
    }

    // ---- Realtime Database: players, world ops, time, interaction, presence ----
    _playersUnsub = onValue(ref(rtdb, rtdbPaths.players(wid)), (snap) => {
      applyPlayersSnapshot(snap.val());
    });

    _opsUnsub = onChildAdded(ref(rtdb, rtdbPaths.worldOps(wid)), (snap) => {
      const data = snap.val();
      if (!data || data.by === state.net.uid) return; // don't re-apply our own op
      applyWorldOp(data.op);
      remove(snap.ref); // consumed — keep the list from growing unbounded
    });

    _timeUnsub = onValue(ref(rtdb, rtdbPaths.time(wid)), (snap) => {
      const data = snap.val();
      if (!data || state.net.isHost || !state.time) return;
      const t = state.time;
      const wasDay = t.isDay;
      if (typeof data.phaseT === "number") t.phaseT = data.phaseT;
      if (typeof data.day === "number") t.day = data.day;
      if (typeof data.t === "number") t.t = data.t;
      t.isDay = t.phaseT < DAYLIGHT_SECONDS;
      if (t.isDay !== wasDay) playSound(t.isDay ? "day" : "night");
    });

    _interactionUnsub = onValue(ref(rtdb, rtdbPaths.interaction(wid)), (snap) => {
      const msg = snap.val();
      if (!msg || msg.by === state.net.uid) return; // ignore our own writes
      applyInteractionMessage(msg);
    });

    const presenceRef = ref(rtdb, rtdbPaths.presence(wid, user.uid));
    set(presenceRef, { online: true, name: user.displayName || user.email || "" });
    onDisconnect(presenceRef).remove();
    _presenceUnsub = onValue(ref(rtdb, `game/${wid}/presence`), (snap) => {
      const val = snap.val() || {};
      state.net.presenceUids = Object.keys(val);
      updateOnlineIndicator();
    });
    onDisconnect(ref(rtdb, rtdbPaths.player(wid, user.uid))).remove();

    updateOnlineIndicator();
  });
}

function applyPlayersSnapshot(val) {
  if (!val) return;
  const localIdx = state.activePlayer | 0;
  let anyMoved = false;

  for (const [uid, sp] of Object.entries(val)) {
    if (!sp || typeof sp.x !== "number" || typeof sp.y !== "number") continue;
    const idx = uid === state.net.uid ? localIdx : (localIdx === 0 ? 1 : 0);

    if (idx === localIdx) {
      // This is our own write echoing back — just release the input throttle.
      const pm = state.net._pendingMove;
      if (pm && sp.x === pm.expectedX && sp.y === pm.expectedY) state.net._pendingMove = null;
      continue;
    }

    const lp = state.players[idx];
    if (!lp) continue;
    if (lp.stamina === undefined || lp.stamina === null) lp.stamina = STAMINA_MAX;

    const oldX = lp.x, oldY = lp.y;
    if (oldX !== sp.x || oldY !== sp.y) {
      anyMoved = true;
      const tilesMoved = Math.abs(sp.x - oldX) + Math.abs(sp.y - oldY);
      if (tilesMoved > 0) {
        lp.resting = false;
        lp.stamina = Math.max(0, lp.stamina - (STAMINA_COST_PER_TILE * tilesMoved));
      }
    }
    lp.x = sp.x; lp.y = sp.y; lp.path = [];
    if (Math.hypot(sp.x - lp.fx, sp.y - lp.fy) > 4) { lp.fx = sp.x; lp.fy = sp.y; }   // far away (teleport, first sight): jump; otherwise updatePlayers glides
  }

  if (anyMoved && state.mode === "overworld" && typeof revealAroundPlayers === "function") revealAroundPlayers();
}

function writePlayerPositionThrottled() {
  if (_posWriteTimer || !netCanSend()) return;
  _posWriteTimer = setTimeout(() => {
    _posWriteTimer = null;
    if (!netCanSend()) return;
    const p = state.players[state.activePlayer | 0];
    set(ref(rtdb, rtdbPaths.player(state.net.worldId, state.net.uid)), {
      x: p.x, y: p.y, mode: state.mode, updatedAt: Date.now(),
    });
  }, 90); // was ~110ms server round-trip cadence; close enough to feel the same
}

function movePlayerOnline(dx, dy) {
  const p = state.players[state.activePlayer | 0];
  if (!p) return;
  const nx = Math.max(0, Math.min(WORLD_W - 1, (p.x + dx) | 0));
  const ny = Math.max(0, Math.min(WORLD_H - 1, (p.y + dy) | 0));
  const tilesMoved = Math.abs(nx - p.x) + Math.abs(ny - p.y);
  if (tilesMoved > 0) {
    p.resting = false;
    p.stamina = Math.max(0, (p.stamina ?? STAMINA_MAX) - STAMINA_COST_PER_TILE * tilesMoved);
  }
  p.x = nx; p.y = ny; p.fx = nx; p.fy = ny; p.path = [];
  if (state.mode === "overworld" && typeof revealAroundPlayers === "function") revealAroundPlayers();
  writePlayerPositionThrottled();
}

// Host-only: push the current in-memory world to Firestore. Called once on
// first connect (if nothing's published yet) and again whenever
// saveCurrentWorldSoon() fires locally, so Firestore stays a few hundred ms
// behind the host's own local save at most.
// Firestore documents cap out at 1MiB; worldJson is comfortably under that
// at the current 80x80 map size (tens of KB), but a much larger map could
// approach it. Guard so that failure mode is a loud, actionable warning
// instead of a silent setDoc rejection nobody sees — see schema.js's
// FIRESTORE.worlds comment for the Cloud Storage migration path once a
// bigger map actually needs it.
const WORLD_JSON_SAFE_BYTES = 900_000;

function publishWorld() {
  if (!state.net?.isHost || !state.net?.worldId || !firebaseReady) return;
  const wid = state.net.worldId;
  const payload = worldToPayload(state.world, wid, state.world.seed);
  const worldJson = JSON.stringify(payload);
  if (worldJson.length > WORLD_JSON_SAFE_BYTES) {
    console.error(
      `[NET] world save (${worldJson.length} bytes) is too close to Firestore's 1MiB doc limit — ` +
      `skipping cloud sync. See FIRESTORE.worlds in src/game/schema.js for the Cloud Storage migration path.`
    );
    return;
  }
  const version = Date.now();
  _appliedWorldVersion = version;
  const setDocPromise = setDoc(doc(db, FIRESTORE.worlds, String(wid)), {
    hostUid: state.net.uid,
    worldJson,
    version,
    updatedAt: serverTimestamp(),
  }).catch((e) => console.error("[NET] publishWorld failed:", e));
  return setDocPromise;
}

function publishWorldOp(op) {
  if (!netCanSend() || state.net.suppressWorldOps) return;
  push(ref(rtdb, rtdbPaths.worldOps(state.net.worldId)), { op, by: state.net.uid, at: Date.now() });
}

function publishLogEntry(text) {
  if (!netCanSend()) return;
  addDoc(collection(db, FIRESTORE.log), {
    worldId: String(state.net.worldId), text: String(text ?? ""), by: state.net.uid, at: serverTimestamp(),
  }).catch((e) => console.error("[NET] publishLogEntry failed:", e));
}

function publishChatMessage(text) {
  if (!netCanSend()) return;
  addDoc(collection(db, FIRESTORE.chat), {
    worldId: String(state.net.worldId), text, by: state.net.uid, at: serverTimestamp(),
  }).catch((e) => console.error("[NET] publishChatMessage failed:", e));
}

function publishTime(phaseT, day, t) {
  if (!netCanSend()) return;
  set(ref(rtdb, rtdbPaths.time(state.net.worldId)), { phaseT, day, t, updatedAt: Date.now() });
}

function publishInteraction(msg) {
  if (!netCanSend()) return;
  set(ref(rtdb, rtdbPaths.interaction(state.net.worldId)), { ...msg, by: state.net.uid, at: Date.now() });
}

function applyInteractionMessage(msg) {
  const myIdx = state.activePlayer | 0;
  if (msg.kind === "interaction_request") {
    if (msg.fromIndex === myIdx) return;
    if (!state.interactionRequest) {
      state.interactionRequest = { type: msg.reqType, fromIndex: msg.fromIndex, toIndex: msg.toIndex, createdAt: Date.now() };
    }
  } else if (msg.kind === "interaction_respond") {
    if (msg.toIndex === myIdx) return;
    if (msg.accepted && msg.reqType === "Trade") openTradeUI(msg.fromIndex, msg.toIndex);
    if (msg.accepted) {
      const kind = { "Hold hands": "hold", Kiss: "kiss", Hug: "hug" }[msg.reqType];
      if (kind) beginCouple(kind, msg.fromIndex, msg.toIndex);
    }
    state.interactionRequest = null;
  } else if (msg.kind === "couple_end") {
    endHoldingHands(null, true);   // the other player let go of our hand (or got busy)
  } else if (msg.kind === "trade_inv") {
    if (msg.playerIdx === myIdx) return;
    if (typeof msg.playerIdx === "number" && Array.isArray(msg.inv)) state.inventories[msg.playerIdx] = msg.inv;
  } else if (msg.kind === "trade_state") {
    if (msg.senderIdx === myIdx) return;
    if (!state.trade?.open) return;
    const ts = state.trade;
    if (msg.senderIdx === ts.p0idx) { ts.p0offer = Array.isArray(msg.offer) ? msg.offer : []; ts.confirm0 = !!msg.confirmMe; }
    else if (msg.senderIdx === ts.p1idx) { ts.p1offer = Array.isArray(msg.offer) ? msg.offer : []; ts.confirm1 = !!msg.confirmMe; }
    if (typeof msg.senderIdx === "number" && Array.isArray(msg.inv)) state.inventories[msg.senderIdx] = msg.inv;
    if (ts.confirm0 && ts.confirm1) executeTrade();
  } else if (msg.kind === "trade_cancel") {
    if (state.trade?.open) { state.trade._netCancel = true; closeTradeUI(true); }
  }
}

// Adapter layer: every existing call site (sendNetInput({type:"move",...}),
// sendNet({type:"world_set",...}), etc.) is left completely unchanged —
// only these two functions route to Firebase instead of a WS socket.
function sendNetInput(payload) {
  if (!payload) return;
  switch (payload.type) {
    case "move": return movePlayerOnline(payload.dx, payload.dy);
    case "log": return publishLogEntry(payload.text);
    case "world_op": return publishWorldOp(payload.op);
    case "chat": return publishChatMessage(payload.text);
    case "time_sync": return publishTime(payload.phaseT, payload.day, payload.t);
    case "interaction_request": return publishInteraction({ kind: "interaction_request", reqType: payload.reqType, fromIndex: payload.fromIndex, toIndex: payload.toIndex });
    case "interaction_respond": return publishInteraction({ kind: "interaction_respond", accepted: payload.accepted, reqType: payload.reqType, fromIndex: payload.fromIndex, toIndex: payload.toIndex });
    case "trade_inv": return publishInteraction({ kind: "trade_inv", playerIdx: payload.playerIdx, inv: payload.inv });
    case "trade_state": return publishInteraction({ kind: "trade_state", senderIdx: payload.senderIdx, offer: payload.offer, confirmMe: payload.confirmMe, inv: payload.inv });
    case "trade_cancel": return publishInteraction({ kind: "trade_cancel" });
    case "couple_end": return publishInteraction({ kind: "couple_end" });
    default: console.warn("[NET] sendNetInput: unhandled payload type", payload.type);
  }
}

function sendNet(obj) {
  if (!obj) return;
  if (obj.type === "world_set") return publishWorld();
  if (obj.type === "input") return sendNetInput(obj.payload); // old {type:"input",payload:{...}} wrapper
  // "world_request" no longer applies — Firestore onSnapshot delivers the
  // current doc the moment we subscribe, no explicit request needed.
}

// --- Online click-to-move: queue + drip-feed steps to server ---
state.net.moveQueue = state.net.moveQueue || [];
state.net.nextMoveAt = state.net.nextMoveAt || 0;

// -------------------------------------------------------------------------- CO-OP: World Ops (overworld object sync) ----
function sendWorldOp(op) {
  if (!state.net?.enabled) return;
  if (state.net.suppressWorldOps) return;

  // console.log("[NET] sendWorldOp (via input) ->", op);

  // ✅ piggyback on the proven input channel
  sendNet({ type: "input", payload: { type: "world_op", op } });
}

function applyWorldOp(op) {
  if (!op || typeof op !== "object") return;

  const prev = !!state.net?.suppressWorldOps;
  if (state.net) state.net.suppressWorldOps = true;

  try {
    if (op.kind === "set_obj") {
      const map = state.world;
      if (!map?.objects) return;

      const x = op.x | 0, y = op.y | 0;
      if (y < 0 || y >= WORLD_H || x < 0 || x >= WORLD_W) return;

      map.objects[y][x] = op.value ?? null;
      return;
    }

    if (op.kind === "set_structure") {   // a house was built / changed / removed (src/render3d/building)
      const map = state.world;
      if (!map || typeof op.id !== "string") return;
      map.structures = map.structures || {};
      if (op.value) map.structures[op.id] = op.value; else delete map.structures[op.id];
      return;
    }

    if (op.kind === "pose") {   // a player sat in a chair / lay down in a bed / got up
      const pl = state.players[op.idx | 0];
      if (pl) { pl.pose = op.pose ? { ...op.pose, px: pl.x, py: pl.y } : null; if (pl.pose) { pl.resting = false; pl.sneak = false; } }
      return;
    }

    if (op.kind === "sneak") {   // a player crouched / stood up
      const pl = state.players[op.idx | 0];
      if (pl) { pl.sneak = !!op.on; if (op.on) pl.resting = false; }
      return;
    }

    if (op.kind === "set_tile") {
      const map = state.world;
      if (!map?.tiles) return;

      const x = op.x | 0, y = op.y | 0;
      if (y < 0 || y >= WORLD_H || x < 0 || x >= WORLD_W) return;

      map.tiles[y][x] = String(op.value ?? "grass");
      return;
    }
  } finally {
    if (state.net) state.net.suppressWorldOps = prev;
  }
}

// Convenience wrapper so your gameplay code stays readable
function setOverworldObject(x, y, value, broadcast = true) {
  x = x | 0; y = y | 0;
  if (!state.world?.objects?.[y]) return;

  const prev = state.world.objects[y][x];

  // Signature-based compare so in-place mutations still count as "changed"
  function sig(v) {
    if (v == null) return "∅";
    if (typeof v !== "object") return String(v);

    const id = String(v.id ?? "");
    const hp = (v.hp == null) ? "" : String(v.hp);

    const m = v.meta || {};
    const stage = (m.stage == null) ? "" : String(m.stage);
    const regrowDay = (m.regrowDay == null) ? "" : String(m.regrowDay);
    const anchor = (m.anchor && typeof m.anchor.x === "number" && typeof m.anchor.y === "number")
      ? `${m.anchor.x},${m.anchor.y}` : "";
    const itemId = (m.itemId == null) ? "" : String(m.itemId);
    const qty = (m.qty == null) ? "" : String(m.qty);
    const kind = (m.kind == null) ? "" : String(m.kind);
    const depleted = m.depleted ? "1" : "";
    const rot = (m.rot == null) ? "" : String(m.rot);   // furniture turned a quarter turn is a change too

    const live = `${m.perch ? m.perch.x + "," + m.perch.y : ""}~${m.petUntil ?? ""}~${Array.isArray(m.inv) ? JSON.stringify(m.inv) : ""}`;
    return `${id}|${hp}|${stage}|${regrowDay}|${anchor}|${itemId}|${qty}|${kind}|${depleted}|${rot}|${live}`;
  }

  const prevSig = sig(prev);
  const nextNorm = (value == null) ? null : value;
  const nextSig = sig(nextNorm);

  // no meaningful change, no work
  if (prevSig === nextSig) return;

  // Always store a fresh object so we don't share references across systems
  const nextStored =
    (nextNorm && typeof nextNorm === "object")
      ? { ...nextNorm, meta: (nextNorm.meta && typeof nextNorm.meta === "object") ? { ...nextNorm.meta } : nextNorm.meta }
      : nextNorm;

  const prevSuppress = !!state.net?.suppressWorldOps;
  if (state.net) state.net.suppressWorldOps = true;
  try {
    state.world.objects[y][x] = nextStored;
  } finally {
    if (state.net) state.net.suppressWorldOps = prevSuppress;
  }

  if (broadcast && state.net?.enabled) {
    // Send a clean clone so the payload can't be mutated later by accident
    const payload =
      (nextStored && typeof nextStored === "object")
        ? { ...nextStored, meta: (nextStored.meta && typeof nextStored.meta === "object") ? { ...nextStored.meta } : nextStored.meta }
        : nextStored;

    sendWorldOp({ kind: "set_obj", mode: "overworld", x, y, value: payload });
  }
}

// --- CO-OP: auto-broadcast ANY overworld objects[y][x] writes (so you don't edit 90 lines) ---
// --- CO-OP: auto-broadcast ANY overworld objects[y][x] writes (but NOT if value is unchanged) ---
function enableOverworldObjectsProxy() {
  const map = state.world;
  if (!map?.objects || map._objectsProxied) return;

  Object.defineProperty(map, "_objectsProxied", { value: true, enumerable: false });

  const isOccupiedId = (v) => {
    const id = v && typeof v === "object" ? v.id : null;
    return typeof id === "string" && id.startsWith("occupied");
  };

  // Create a "signature" for change detection that survives new object references.
  function sig(v) {
    if (v == null) return "∅";
    if (typeof v !== "object") return String(v);

    const id = String(v.id ?? "");
    const m = v.meta || {};
    const a = m.anchor;
    const anchor = a && typeof a.x === "number" && typeof a.y === "number" ? `${a.x},${a.y}` : "";
    const itemId = m.itemId ?? "";
    const qty = m.qty ?? "";
    const stage = m.stage ?? "";
    const other = m.kind ?? ""; // harmless extra discriminator if you use it
    const rot = m.rot ?? "";
    // hp and the depleted flag count: a bush going 3 -> 2 -> depleted must be written (and sent), or resources never run out
    const hp = v.hp ?? "", depleted = m.depleted ? 1 : 0, regrow = `${m.regrowDay ?? ""}${m.depletedDay ?? ""}`;
    const live = `${m.perch ? m.perch.x + "," + m.perch.y : ""}~${m.petUntil ?? ""}~${Array.isArray(m.inv) ? JSON.stringify(m.inv) : ""}`;   // a cat on a table / being petted, what is in a stockpile

    return `${id}|${stage}|${itemId}|${qty}|${anchor}|${other}|${rot}|${hp}|${depleted}|${regrow}|${live}`;
  }

  for (let y = 0; y < map.objects.length; y++) {
    const row = map.objects[y];
    if (!Array.isArray(row)) continue;

    if (row && row.__proxiedRow) continue;
    Object.defineProperty(row, "__proxiedRow", { value: true, enumerable: false });

    const yy = y;

    const proxyRow = new Proxy(row, {
      set(target, prop, value) {
        const key = String(prop);

        // Non-numeric props (length, symbols, etc.) never broadcast
        if (!/^\d+$/.test(key)) {
          target[prop] = value;
          return true;
        }

        const x = key | 0;
        if (yy < 0 || yy >= WORLD_H || x < 0 || x >= WORLD_W) {
          target[prop] = value;
          return true;
        }

        const prev = target[prop];
        const prevNorm = (prev == null) ? null : prev;
        const nextNorm = (value == null) ? null : value;

        // If both are "occupied*" markers, ignore entirely (these are often internal bookkeeping)
        if (isOccupiedId(prevNorm) || isOccupiedId(nextNorm)) {
          target[prop] = nextNorm;
          return true;
        }

        // Change detection based on signature (not object reference)
        if (sig(prevNorm) === sig(nextNorm)) return true;

        // Local write
        target[prop] = nextNorm;

        // Broadcast only if online and not currently applying remote ops
        if (!state.net?.enabled) return true;
        if (state.net.suppressWorldOps) return true;

        sendWorldOp({ kind: "set_obj", mode: "overworld", x, y: yy, value: nextNorm });
        return true;
      }
    });

    map.objects[yy] = proxyRow;
  }
}

function setOverworldTile(x, y, value, broadcast = true) {
  if (!state.world?.tiles?.[y]) return;
  state.world.tiles[y][x] = String(value ?? "grass");
  if (broadcast && state.net?.enabled) {
    sendWorldOp({ kind: "set_tile", mode: "overworld", x, y, value: String(value ?? "grass") });
  }
}

function netQueuePath(path) {
  // Only queue for the local controlled player
  state.net.moveQueue = Array.isArray(path) ? path.slice() : [];
}

function netTick() {
  if (!netCanSend()) return;

  // Only process overworld movement — dungeon/interior paths are local-only.
  // Sending non-overworld coordinates would corrupt the server's player position.
  if (state.mode !== "overworld") return;

  // Always obey the server-assigned slot (prevents title/profile UI from hijacking activePlayer)
  if (state.net.playerId) {
    const wantIdx = (state.net.playerId === "p2") ? 1 : 0;
    if (state.activePlayer !== wantIdx) state.activePlayer = wantIdx;
  }

  const now = performance.now();
  if (now < (state.net.nextMoveAt || 0)) return;

  const p = activePlayer();
  const q = state.net.moveQueue;
  if (!q || q.length === 0) return;

  // If we've already reached this queued node (server snapped us), pop it.
  while (q.length && q[0].x === p.x && q[0].y === p.y) q.shift();
  if (!q.length) {
    state.net._pendingMove = null;
    return;
  }

  // If a move was already sent and the server hasn't confirmed the new position yet,
  // wait — prevents duplicate moves under high latency causing double-steps.
  const pending = state.net._pendingMove;
  if (pending && (p.x !== pending.expectedX || p.y !== pending.expectedY)) {
    // Still waiting for server to echo back the position we sent.
    // Extend the wait window rather than resending.
    if (now < (state.net._pendingMoveDeadline || 0)) return;
    // Deadline passed with no confirmation — assume it got lost, clear and retry.
    state.net._pendingMove = null;
  }

  const next = q[0];
  const dx = Math.sign(next.x - p.x);
  const dy = Math.sign(next.y - p.y);

  // Safety: only 4-dir steps
  if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) {
    q.shift();
    state.net._pendingMove = null;
    return;
  }

// Block illegal online movement (water/objects/walls)
if (canStep(p.x, p.y, p.x + dx, p.y + dy)) {
  // stamina gate (per-player)
  if ((p.stamina ?? STAMINA_MAX) <= 0) {
    // too tired: stop feeding moves
    notifyNoEnergy();
    state.net.moveQueue.length = 0;
    state.net._pendingMove = null;
    state.net.nextMoveAt = now + 120;
    return;
  }

  sendNetInput({ type: "move", dx, dy });
  // Record what position we expect the server to confirm, with a 400ms deadline
  state.net._pendingMove = { expectedX: p.x + dx, expectedY: p.y + dy };
  state.net._pendingMoveDeadline = now + 400;
  state.net.nextMoveAt = now + (p.sneak ? 110 / SNEAK_SPEED_MULT : 110);
} else {
  // Dump the queued node if it's not reachable
  q.shift();
  state.net._pendingMove = null;
  state.net.nextMoveAt = now + 40;
}
}

// -------------------------------------------------------------------------- Chat UI (DOM + canvas draw) ----
function ensureChatInput() {
  if (document.getElementById("chatWrap")) return;

  const wrap = document.createElement("div");
  wrap.id = "chatWrap";
  wrap.style.position = "absolute";
  wrap.style.zIndex = "20";
  wrap.style.display = "flex";
  wrap.style.gap = "8px";
  wrap.style.alignItems = "center";
  wrap.style.pointerEvents = "auto";

  const input = document.createElement("input");
  input.id = "chatInput";
  input.type = "text";
  input.placeholder = "Type message… (Enter to send)";
  input.autocomplete = "off";
  input.spellcheck = true;

  input.style.width = "440px";
  input.style.maxWidth = "70vw";
  input.style.padding = "6px 18px";
  input.style.borderRadius = "10px";
  input.style.border = "1px solid rgba(255,255,255,0.18)";
  input.style.background = "rgba(20,20,20,0.92)";
  input.style.color = "rgba(255,255,255,0.92)";
  input.style.outline = "none";
  input.style.font = "10px system-ui";
  input.style.lineHeight = "12px";

  // Prevent your global hotkeys from firing while typing
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();

    if (e.key === "Enter") {
      e.preventDefault();
      const txt = input.value.trim();
      input.value = "";
      input.blur(); // return focus to game so movement keys work again
      if (!txt) return;
      sendChatMessage(state.activePlayer, txt);
    }
    if (e.key === "Escape") {
      input.value = "";
      input.blur();
    }
  });

  wrap.appendChild(input);
  document.body.appendChild(wrap);

  ensureOnlineIndicator();
  positionChatInput();
  updateOnlineIndicator();
}

function setChatInputVisible(visible) {
  // The chat <input> lives inside the chat sheet (src/ui/hud.js decides when it shows); the old presence panel is drawn by the HUD now.
  if (!visible) { const wrap = document.getElementById("chatWrap"); if (wrap) wrap.style.display = "none"; }
  const indicator = document.getElementById("onlineIndicator");
  if (indicator) indicator.style.display = "none";
}

function positionChatInput() { if (typeof hudPlaceChatInput === "function") hudPlaceChatInput(); }

function ensureOnlineIndicator() {
  if (document.getElementById("onlineIndicator")) return;

  const panel = document.createElement("div");
  panel.id = "onlineIndicator";
  panel.style.position = "absolute";
  panel.style.zIndex = "20";
  panel.style.display = "none"; // hidden until in-game (setChatInputVisible controls this)
  panel.style.flexDirection = "column";
  panel.style.gap = "6px";
  panel.style.pointerEvents = "none";

  const playerDefs = [
    { idx: 0, name: "Scott",    src: "src/images/scott_thumbnail.jpg" },
    { idx: 1, name: "Cristina", src: "src/images/cristina_thumbnail.jpg" }
  ];

  for (const p of playerDefs) {
    const row = document.createElement("div");
    row.id = `onlineRow${p.idx}`;
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    row.style.position = "relative";

    const img = document.createElement("img");
    img.src = p.src;
    img.width = 48;
    img.height = 48;
    img.style.borderRadius = "6px";
    img.style.display = "block";
    img.style.transition = "filter 0.3s, opacity 0.3s";

    // Green presence dot (bottom-right of avatar)
    const dot = document.createElement("div");
    dot.id = `onlineDot${p.idx}`;
    dot.style.position = "absolute";
    dot.style.width = "11px";
    dot.style.height = "11px";
    dot.style.borderRadius = "50%";
    dot.style.background = "#3ddc6e";
    dot.style.border = "2px solid #111";
    dot.style.left = "34px";
    dot.style.top = "34px";
    dot.style.transition = "opacity 0.3s";

    const name = document.createElement("span");
    name.textContent = p.name;
    name.style.font = "11px system-ui";
    name.style.color = "rgba(255,255,255,0.85)";
    name.style.transition = "opacity 0.3s";
    name.style.userSelect = "none";

    row.appendChild(img);
    row.appendChild(dot);
    row.appendChild(name);
    panel.appendChild(row);

    // Store refs for fast updates
    row._img = img;
    row._dot = dot;
    row._name = name;
  }

  document.body.appendChild(panel);
}

function updateOnlineIndicator() {
  if (!document.getElementById("onlineIndicator")) return; // not yet created

  const presentUids = Array.isArray(state.net?.presenceUids) ? state.net.presenceUids : [];
  const connected = !!(state.net?.enabled && state.net?.uid);
  const myIdx = state.activePlayer | 0;

  for (let i = 0; i < 2; i++) {
    const row = document.getElementById(`onlineRow${i}`);
    if (!row) continue;

    // me: online if we're signed in and subscribed; other: online if their
    // uid shows up in the presence list (RTDB onDisconnect keeps it honest).
    const isOnline = i === myIdx ? connected : (connected && presentUids.some((uid) => uid !== state.net.uid));

    row._img.style.filter = isOnline ? "none" : "grayscale(1)";
    row._img.style.opacity = isOnline ? "1" : "0.4";
    row._dot.style.opacity = isOnline ? "1" : "0";
    row._name.style.opacity = isOnline ? "0.85" : "0.35";
  }
}

function applyChatMessage(fromIndex, text, opts = {}) {
  const now = performance.now();

  state.chatMessages = state.chatMessages || [];
  state.speechBubbles = state.speechBubbles || [null, null];

  state.chatMessages.push({
    fromIndex,
    text,
    t: (typeof opts.t === "number") ? opts.t : now
  });
  if (state.chatMessages.length > 30) state.chatMessages.shift();

  // Speech bubble above the sender
  state.speechBubbles[fromIndex] = {
    text,
    until: now + 3500
  };

  // Only play sound for messages that didn't originate on THIS client
  if (!opts.silent) playSound("message");
}

function sendChatMessage(fromIndex, text) {
  const clean = String(text ?? "").trim();
  if (!clean) return;

  // Always show instantly on the sender
  applyChatMessage(fromIndex, clean, { silent: true });

  // OFFLINE? done.
  if (!netCanSend()) {
    // If you ever allow “offline chat”, keep it local only.
    playSound("message");
    return;
  }

  // Dedupe: generate an id, remember it until echo comes back
  state.net._pendingChatIds = state.net._pendingChatIds || [];
  const id = `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  state.net._pendingChatIds.push(id);
  if (state.net._pendingChatIds.length > 200) state.net._pendingChatIds.shift();

  // Send via proven input channel
  sendNet({ type: "input", payload: { type: "chat", id, text: clean } });

  // Play sound locally (we silenced applyChatMessage above)
  playSound("message");
}

function drawSpeechBubbles() {
  const now = performance.now();
  const hh = state.holdingHands;

  const bubbleFor = (idx) => {
    const b = state.speechBubbles[idx];
    return b && now < b.until ? b : null;
  };
  // screen position above a (possibly fractional) tile: mapToScreen is the 2D camera's, or the 3D view's projection when ?view=3d
  const above = (tx, ty) => { const m = mapToScreen(tx, ty); return { sx: m.sx + TILE_SIZE / 2, sy: m.sy }; };
  const onScreen = (p) => p.sx > -60 && p.sx < window.innerWidth + 60 && p.sy > -20 && p.sy < window.innerHeight + 20;

  // If holding hands, draw bubbles over the combined icon (midpoint), not invisible players
  if (hh) {
    for (const idx of [hh.a, hh.b]) {
      const b = bubbleFor(idx);
      if (!b) continue;
      const a = state.players[hh.a], c = state.players[hh.b];
      const p = above((a.fx + c.fx) / 2, (a.fy + c.fy) / 2);
      if (!onScreen(p)) continue;
      drawSpeechBubbleAt(p.sx, p.sy, b.text, idx);
    }
    return;
  }

  // Normal: bubble above each player
  for (let i = 0; i < state.players.length; i++) {
    const b = bubbleFor(i);
    if (!b) continue;
    const pl = state.players[i], p = above(pl.fx, pl.fy);
    if (!onScreen(p)) continue;
    drawSpeechBubbleAt(p.sx, p.sy, b.text, i);
  }
}

function drawSpeechBubbleAt(centerX, topY, text, who = 0) {
  // paper bubble with a little tail, edged in the speaker's colour (teal for Scott, rose for Cristina)
  const size = 13, padX = 12, padY = 8, maxW = Math.min(230, window.innerWidth - 40), lineH = 17;
  const lines = hudWrap(String(text), maxW - padX * 2, size);
  ctx.font = `500 ${size}px ${HUD_BODY}`;
  const textW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const boxW = Math.max(36, textW + padX * 2), boxH = lines.length * lineH + padY * 2;
  const x = clamp(centerX - boxW / 2, 8, window.innerWidth - boxW - 8), y = topY - boxH - 12;
  const edge = who === 0 ? HUD_C.teal : HUD_C.rose;

  ctx.save();
  ctx.shadowColor = "rgba(54,37,33,0.3)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
  hudPath(x, y, boxW, boxH, 14); ctx.fillStyle = HUD_PANEL_FILL; ctx.fill();
  const tx = clamp(centerX, x + 16, x + boxW - 16);
  ctx.beginPath(); ctx.moveTo(tx - 7, y + boxH - 1); ctx.lineTo(tx, y + boxH + 8); ctx.lineTo(tx + 7, y + boxH - 1); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.5; ctx.strokeStyle = edge; hudPath(x, y, boxW, boxH, 14); ctx.stroke();

  let yy = y + padY + lineH / 2;
  for (const l of lines) { hudText(l, x + boxW / 2, yy, size, { align: "center" }); yy += lineH; }
}

// ---- Helpers ----

function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

// ---- Rune Combo Lock (Puzzle #1) ----
const RUNE_COUNT = 13;
const RUNE_COMBO_LEN = 4;

const _runeImgCache = Object.create(null);
function getRuneImg(n) {
  const nn = Math.max(1, Math.min(RUNE_COUNT, n | 0));
  const src = `src/icons/rune${nn}.png`;
  if (_runeImgCache[src]) return _runeImgCache[src];
  const img = new Image();
  img.src = src;
  _runeImgCache[src] = img;
  return img;
}

// ---- Puzzle chest rewards ----
/** A puzzle chest was solved (rune lock or riddle): remove it and give its reward (a key, or treasure from the last chamber). */
function solveDungeonChest(cx, cy) {
  const map = state.dungeon, obj = map?.objects?.[cy]?.[cx];
  if (!obj || obj.id !== "dungeon_chest") return;
  const meta = obj.meta ?? {}, inv = activeInv(), p = activePlayer();
  map.objects[cy][cx] = null;

  // the riddle's stone falls silent
  if (meta.riddleId) {
    map.objects.forEach(row => row.forEach(o => { if (o?.id === "runestone" && o.meta?.riddleId === meta.riddleId) { o.meta.solved = true; o.meta.msg = "The stone is silent now. Its riddle has been answered."; } }));
  }

  if (meta.reward === "treasure") {
    logAction(`${p.name} opened the treasure chest of the deepest chamber!`);
    chestLoot(inv, p.x, p.y); chestLoot(inv, p.x, p.y);
  } else {
    addItemOrDrop(inv, "dungeon_key", 1, p.x, p.y, p.name);
    logAction(`${p.name} solved the puzzle and found a Dungeon Key.`);
  }
  saveDungeonLayout(state.dungeonId);
  playSound("unlock");
}

// ---- Riddle chest: type the one-word answer to the runestone's riddle ----
function normalizeRiddleAnswer(str) {
  let t = String(str ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^(a|an|the|my|your|its|it is) /, "");
  return t;
}
function checkRiddleAnswer(riddleId, text) {
  const r = state.data?.riddles?.[riddleId]; if (!r) return false;
  const guess = normalizeRiddleAnswer(text); if (!guess) return false;
  const strip = (w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
  return r.answers.some(a => { const n = normalizeRiddleAnswer(a); return n === guess || strip(n) === strip(guess); });
}
function openRiddleLockForChest(mapX, mapY) {
  if (state.mode !== "dungeon") return;
  const obj = state.dungeon?.objects?.[mapY]?.[mapX];
  if (!obj || obj.id !== "dungeon_chest" || !obj.meta?.riddleId) return;
  state.riddleLock = { open: true, x: mapX, y: mapY, riddleId: obj.meta.riddleId, tries: obj.meta.tries | 0, flash: 0, note: "" };
}
function closeRiddleLock() { state.riddleLock = null; state._riddleLockUI = null; document.getElementById("riddleInput")?.blur(); }
function submitRiddleAnswer(text) {
  const rl = state.riddleLock; if (!rl?.open) return false;
  const ok = checkRiddleAnswer(rl.riddleId, text);
  if (ok) { solveDungeonChest(rl.x, rl.y); closeRiddleLock(); return true; }
  rl.tries++; rl.flash = performance.now();
  const obj = state.dungeon?.objects?.[rl.y]?.[rl.x]; if (obj) { obj.meta = obj.meta || {}; obj.meta.tries = rl.tries; }
  rl.note = rl.tries >= 3 ? "Still shut. Read the stone again, slowly." : "The lock stays shut.";
  logAction("That isn't the answer.");
  playSound("error");
  return false;
}
function handleRiddleLockClick(px, py) {
  const rl = state.riddleLock, ui = state._riddleLockUI;
  if (!rl?.open || !ui) return false;
  if (!hitRect(px, py, ui.panel) || hitRect(px, py, ui.closeBtn)) { playSound("click"); closeRiddleLock(); return true; }
  if (hitRect(px, py, ui.unlockBtn)) { submitRiddleAnswer(document.getElementById("riddleInput")?.value ?? ""); return true; }
  return true;
}

function openRuneComboLockForChest(mapX, mapY) {
  if (state.mode !== "dungeon") return;
  const map = state.dungeon;
  const obj = map?.objects?.[mapY]?.[mapX];
  if (!obj || obj.id !== "dungeon_chest") return;

  // Ensure this chest has a solution (generated at dungeon gen, but safe-guard anyway)
  if (!Array.isArray(obj.meta?.combo) || obj.meta.combo.length !== RUNE_COMBO_LEN) {
    obj.meta = obj.meta || {};
    obj.meta.combo = Array.from({ length: RUNE_COMBO_LEN }, () => randInt(1, RUNE_COUNT));
  }

  state.comboLock = {
    open: true,
    x: mapX,
    y: mapY,
    digits: (Array.isArray(obj.meta?.uiDigits) && obj.meta.uiDigits.length === RUNE_COMBO_LEN)
  ? obj.meta.uiDigits.slice(0, RUNE_COMBO_LEN)
  : [1, 1, 1, 1],
    solution: obj.meta.combo.slice(0, RUNE_COMBO_LEN),
    tries: 0
  };
  state._comboLockUI = null;
}

function closeRuneComboLock() {
  const cl = state.comboLock;

  // Persist the current dial positions back into THIS chest only
  if (cl?.open && state.mode === "dungeon") {
    const map = state.dungeon;
    const obj = map?.objects?.[cl.y]?.[cl.x];
    if (obj && obj.id === "dungeon_chest") {
      obj.meta = obj.meta || {};
      obj.meta.uiDigits = cl.digits.slice(0, RUNE_COMBO_LEN);
    }
  }

  state.comboLock = null;
  state._comboLockUI = null;
}

function drawRuneComboLockModal() { hudDrawComboLock(); }   // src/ui/panels3.js
function drawRiddleLockModal() { hudDrawRiddleLock(); }     // src/ui/panels3.js

function handleRuneComboLockClick(px, py) {
  const cl = state.comboLock;
  const ui = state._comboLockUI;
  if (!cl?.open || !ui) return false;

  // click outside panel closes (optional, but nice)
  if (!pointInRect(px, py, ui.panel)) {
    closeRuneComboLock();
    playSound("click");
    return true;
  }

  if (pointInRect(px, py, ui.closeBtn)) {
    closeRuneComboLock();
    playSound("click");
    return true;
  }

  // spin digits
  for (let i = 0; i < ui.digitRects.length; i++) {
    if (pointInRect(px, py, ui.digitRects[i])) {
      const v = (cl.digits[i] | 0) || 1;
      cl.digits[i] = (v % RUNE_COUNT) + 1;
      playSound("click");
      return true;
    }
  }

  // unlock attempt
  if (pointInRect(px, py, ui.unlockBtn)) {
    cl.tries = (cl.tries ?? 0) + 1;

    if (_comboMatches(cl.digits, cl.solution)) {
      solveDungeonChest(cl.x, cl.y);
      closeRuneComboLock();
    } else {
      logAction(`Wrong combination.`);
      playSound("error");
    }
    return true;
  }

  return true; // modal eats clicks
}

function _comboMatches(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if ((a[i] | 0) !== (b[i] | 0)) return false;
  return true;
}

function rollTreasureCoord() {
  // Pick a random GRASS tile on the overworld. Try a bunch of times, then fall back.
  const map = state.world;
  const h = map?.tiles?.length ?? 0;
  const w = map?.tiles?.[0]?.length ?? 0;

  for (let tries = 0; tries < 800; tries++) {
    const x = randInt(0, Math.max(0, w - 1));
    const y = randInt(0, Math.max(0, h - 1));
    if (map?.objects?.[y]?.[x]) continue; // don't bury it under an object
    if (map?.tiles?.[y]?.[x] === "grass") return { x, y };
  }

  // Fallback: just somewhere in bounds
  return { x: Math.max(0, Math.min(w - 1, 2)), y: Math.max(0, Math.min(h - 1, 2)) };
}

function inBounds(x, y, w, h) { return x >= 0 && y >= 0 && x < w && y < h; }

// ---------- Dice / chance system ----------
const ACTION_DICE_SIDES = 20;

// chance01: 0.0 to 1.0
function rollCheck(chance01, sides = ACTION_DICE_SIDES) {
  const c = Math.max(0, Math.min(1, chance01));
  const roll = randInt(1, sides);
  const target = Math.max(1, Math.min(sides, Math.round(c * sides))); // e.g. 0.70 -> 14 on d20
  return { ok: roll <= target, roll, target, sides };
}

function neighbors4(x, y) {
  return [[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
}

function currentDims() {
  if (state.mode === "overworld") return { w: WORLD_W, h: WORLD_H };
  if (state.mode === "interior") return { w: INTERIOR_W, h: INTERIOR_H };
  if (state.mode === "dungeon") {
    const m = state.dungeon;
    const h = m?.tiles?.length ?? 0;
    const w = m?.tiles?.[0]?.length ?? 0;
    return { w, h };
  }
  return { w: WORLD_W, h: WORLD_H };
}

function getCurrentMap() {
  if (state.mode === "overworld") return state.world;
  if (state.mode === "interior") return state.interior;
  if (state.mode === "dungeon") return state.dungeon;
  return state.world;
}

function activePlayer() { return state.players[state.activePlayer]; }
function activeInv() { return state.inventories[state.activePlayer]; }
function otherInvIndex() { return state.activePlayer === 0 ? 1 : 0; }

function tileAt(x, y) {
  const map = getCurrentMap();
  return map?.tiles?.[y]?.[x] ?? null;
}

function objectAt(x, y) {
  const map = getCurrentMap();
  return map?.objects?.[y]?.[x] ?? null;
}

function itemDef(itemId) { return state.data.items[itemId]; }

function objDef(objId) {
  // Normal objects from objects.json
  const d = state.data?.objects?.[objId];
  if (d) return d;

  // Fallback: construction stages (build_site/foundation/framing/house)
  const st = BUILD_STAGES.find(s => s.id === objId);
  if (st) {
    return {
      name: st.id,
      icon: { type: "image", src: `src/icons/${st.icon}` },
      blocks: true,                  // keeps it solid if anything relies on objectBlocks()
      footprint: BUILD_FOOTPRINT     // optional metadata (harmless if unused)
    };
  }

// Fallbacks for generated content
if (objId === "dungeon_gate") {
  return { name: "Locked Gate", icon: "🔒", blocks: true };
}
if (objId === "dungeon_gate_open") {
  return { name: "Gate", icon: "🚪", blocks: false };
}
if (objId === "dungeon_exit") {
  return { name: "Exit", icon: "⬆️", blocks: false };
}

  return null;
}

function getQty(inv, itemId) {
  let total = 0;
  for (const st of inv) {
    if (!st) continue;
    if (st.id === itemId) total += (st.qty ?? 0);
  }
  return total;
}

function hasTool(inv, toolId) { return getQty(inv, toolId) > 0; }
/** The bow only works with arrows: it needs the bow AND at least one arrow in the pack. */
function canShootBow(inv) { return getQty(inv, "bow_and_arrow") > 0 && getQty(inv, "arrow") > 0; }

function isWalkableTile(tileId) {
  // Dungeon uses procedural tiles not defined in tiles.json
  if (state.mode === "dungeon") {
    return tileId === "floor";
  }

  const t = state.data.tiles[tileId];
  return !!t && t.walkable === true;
}


function objectBlocks(objId) {
  const d = objDef(objId);
  return d?.blocks === true;
}

function addItem(inv, itemId, qty) {
  const def = itemDef(itemId);
  if (!def) return { ok: false, added: 0, remaining: qty, reason: `Unknown item: ${itemId}` };

  qty = Math.max(0, Math.floor(qty || 0));
  if (qty <= 0) return { ok: true, added: 0, remaining: 0 };

  const maxStack = def.stack ?? 99;
  const startQty = qty;

  // 1) Fill *all* existing stacks with space
  for (const st of inv) {
    if (qty <= 0) break;
    if (!st || st.id !== itemId) continue;

    const space = Math.max(0, maxStack - (st.qty ?? 0));
    if (space <= 0) continue;

    const add = Math.min(space, qty);
    st.qty += add;
    qty -= add;
  }

  // 2) Create new stacks while we have qty and free slots
  while (qty > 0 && inv.length < INV_SLOTS) {
    const add = Math.min(maxStack, qty);
    inv.push({ id: itemId, qty: add });
    qty -= add;
  }

  const added = startQty - qty;
  
  if (startQty !== qty) saveInventoriesSoon();

  return {
    ok: qty === 0,
    added,
    remaining: qty,
    reason: qty === 0 ? null : (inv.length >= INV_SLOTS ? "Inventory full" : `Stack cap (${maxStack})`)
  };
}

function eatItem(itemId, qty = 1) {
  const inv = activeInv();
  const p = activePlayer();

  if (typeof itemId !== "string") return;
  qty = Math.max(1, Math.floor(qty || 1));

  const def = itemDef(itemId);
  if (!def || typeof def.nourishment !== "number") return;

  // Only eat what you actually have
  const have = getQty(inv, itemId);
  const eatN = Math.min(qty, have);
  if (eatN <= 0) return;

  // Apply nourishment (hunger decreases)
  p.hunger = Math.max(0, p.hunger - def.nourishment * eatN);

  // Remove items (multi-stack safe)
  removeItem(inv, itemId, eatN);

  logAction(`${p.name} ate ${eatN} ${(def.name ?? itemId)}${eatN === 1 ? "" : "s"}.`);
  playSound("eat");
}

function _canStackDroppedItemAt(x, y, itemId) {
  const map = getCurrentMap();
  const obj = map?.objects?.[y]?.[x];
  return obj && obj.id === "dropped_item" && obj.meta?.itemId === itemId;
}

function findDropSpotNear(x, y, itemId, maxR = 3) {
  const { w, h } = currentDims();
  if (!inBounds(x, y, w, h)) return null;

  // prefer same tile if empty or stackable with same dropped item
  if (!isTileOccupiedForDrop(x, y) || _canStackDroppedItemAt(x, y, itemId)) return { x, y };

  // spiral-ish search (diamond rings)
  for (let r = 1; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      const dy1 = r - Math.abs(dx);
      const candidates = [[x + dx, y + dy1], [x + dx, y - dy1]];
      for (const [nx, ny] of candidates) {
        if (!inBounds(nx, ny, w, h)) continue;
        if (!isTileOccupiedForDrop(nx, ny) || _canStackDroppedItemAt(nx, ny, itemId)) return { x: nx, y: ny };
      }
    }
  }

  return null;
}

function addOrDrop(inv, itemId, qty, dropX, dropY, logName = null) {
  const pName = logName ?? activePlayer().name;
  const name = itemDef(itemId)?.name ?? itemId;

  const res = addItem(inv, itemId, qty);
  if (res.added > 0) {
    logAction(`${pName} got ${res.added} ${name}${res.added === 1 ? "" : "s"}.`);
  }

  if (res.remaining > 0) {
    const spot = findDropSpotNear(dropX, dropY, itemId, 4);
    if (spot) {
      dropItemOnTile(itemId, res.remaining, spot.x, spot.y);
      logAction(`${pName} couldn't carry ${res.remaining} ${name}${res.remaining === 1 ? "" : "s"} and dropped it at (${spot.x},${spot.y}).`);
      return { ok: false, added: res.added, dropped: res.remaining, remaining: 0 };
    } else {
      logAction(`${pName} couldn't carry ${res.remaining} ${name}${res.remaining === 1 ? "" : "s"} and had nowhere to drop it.`);
      return { ok: false, added: res.added, dropped: 0, remaining: res.remaining };
    }
  }

  return { ok: true, added: res.added, dropped: 0, remaining: 0 };
}

function addItemOrDrop(inv, itemId, qty, dropX, dropY, logName = null) {
  const pName = logName ?? activePlayer().name;
  const name = itemDef(itemId)?.name ?? itemId;

  const res = addItem(inv, itemId, qty);
  if (res.remaining > 0) {
    const spot = findDropSpotNear(dropX, dropY, itemId, 4);
    if (spot) {
      dropItemOnTile(itemId, res.remaining, spot.x, spot.y);
      logAction(`${pName} couldn't carry ${res.remaining} ${name}${res.remaining === 1 ? "" : "s"} and dropped it at (${spot.x},${spot.y}).`);
      return { ...res, dropped: res.remaining, remaining: 0 };
    } else {
      logAction(`${pName} couldn't carry ${res.remaining} ${name}${res.remaining === 1 ? "" : "s"} and had nowhere to drop it.`);
      return { ...res, dropped: 0 };
    }
  }
  return { ...res, dropped: 0 };
}

function removeItem(inv, itemId, qty) {
  qty = Math.max(0, Math.floor(qty || 0));
  if (qty <= 0) return true;

  // verify we actually have enough across all stacks
  const have = getQty(inv, itemId);
  if (have < qty) return false;

  // remove across stacks (back-to-front so splices are safe)
  let left = qty;
  for (let i = inv.length - 1; i >= 0 && left > 0; i--) {
    const st = inv[i];
    if (!st || st.id !== itemId) continue;

    const take = Math.min(left, st.qty ?? 0);
    st.qty -= take;
    left -= take;

    if ((st.qty ?? 0) <= 0) inv.splice(i, 1);
  }

  const ok = left === 0;
if (ok) saveInventoriesSoon();
return ok;
}

function isAdjacentOrSame(ax, ay, bx, by) {
  return (ax === bx && ay === by) || (Math.abs(ax - bx) + Math.abs(ay - by) === 1);
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function musicDebug(msg) {
  // console.log(`[MUSIC] ${msg}`, {
  //   unlocked: state.music?.unlocked,
  //   enabled: state.music?.enabled,
  //   ctx: state.music?.contextKey,
  //   isDay: state.time?.isDay,
  //   mode: state.mode,
  //   src: state.music?.audio?.src,
  //   vol: state.music?.audio?.volume
  // });
}

function setMusicVolume(v) {
  v = clamp01(v);
  // store it on state
  state.music.volume = v;

  // apply to active music audio if it exists
  if (state.music?.audio) state.music.audio.volume = v;
}

function getMusicVolume() {
  // default if missing
  const v = (state.music?.volume ?? state.music?.audio?.volume ?? 0.35);
  return clamp01(v);
}

function setMusicEnabled(v) {
  state.music.enabled = !!v;

  // Stop everything immediately if disabled
  if (!state.music.enabled) {
    if (state.music.audio) { try { state.music.audio.pause(); } catch (_) {} }
    if (state.music.ambienceAudio) { try { state.music.ambienceAudio.pause(); } catch (_) {} }
    return;
  }

  // If enabling and already unlocked, resume
  if (state.music.unlocked) {
    playRandomMusicForContext(true);
    playAmbienceForContext(true);
  }
}

// Your UI label says “Ambient enabled” but it toggles state.audio.ambientEnabled.
// We'll keep that and map it to music ambienceEnabled so it actually does something.
function setAmbientEnabled(v) {
  if (!state.audio) state.audio = {};
  state.audio.ambientEnabled = !!v;
  state.music.ambienceEnabled = !!v;

  if (!state.music.ambienceEnabled) {
    if (state.music.ambienceAudio) {
      beginAmbFadeTo(0, state.music.ambienceFadeMs, () => {
        try { state.music.ambienceAudio.pause(); } catch (_) {}
      });
    }
  } else if (state.music.enabled && state.music.unlocked) {
    playAmbienceForContext(true);
  }
}

function nowMs() { return performance.now(); }

function beginFadeTo(targetVol, ms, onDone) {
  const a = state.music.audio;
  if (!a) { if (onDone) onDone(); return; }

  const from = (isFinite(a.volume) ? a.volume : 0);
  const to = clamp01(targetVol);
  const dur = Math.max(0, ms | 0);

  state.music._fade = {
    from, to,
    start: nowMs(),
    dur,
    onDone: onDone || null
  };
}

// call every frame
function tickMusicFade() {
  const f = state.music._fade;
  const a = state.music.audio;
  if (!f || !a) return;

  const t = nowMs();
  const p = f.dur <= 0 ? 1 : clamp01((t - f.start) / f.dur);
  a.volume = f.from + (f.to - f.from) * p;

  if (p >= 1) {
    state.music._fade = null;
    if (typeof f.onDone === "function") f.onDone();
  }
}

function ensureAmbienceAudio() {
  if (state.music.ambienceAudio) return state.music.ambienceAudio;

  const a = new Audio();
  a.loop = true;
  a.volume = 0;
  state.music.ambienceAudio = a;
  return a;
}

function getAmbienceKey() {
  // No ambience on title screen or indoors
  if (state.title?.open) return null;
  if (state.mode === "interior") return null;

  const isDay = state.time?.isDay ?? true;
  return isDay ? "day" : "night";
}

function beginAmbFadeTo(targetVol, ms, onDone) {
  const a = state.music.ambienceAudio;
  if (!a) { if (onDone) onDone(); return; }

  const from = (isFinite(a.volume) ? a.volume : 0);
  const to = clamp01(targetVol);
  const dur = Math.max(0, ms | 0);

  state.music._ambFade = {
    from, to,
    start: nowMs(),
    dur,
    onDone: onDone || null
  };
}

function tickAmbienceFade() {
  const f = state.music._ambFade;
  const a = state.music.ambienceAudio;
  if (!f || !a) return;

  const t = nowMs();
  const p = f.dur <= 0 ? 1 : clamp01((t - f.start) / f.dur);
  a.volume = f.from + (f.to - f.from) * p;

  if (p >= 1) {
    state.music._ambFade = null;
    if (typeof f.onDone === "function") f.onDone();
  }
}

function getAmbienceVolume() {
  // Use music slider as the master, scaled down a bit
  return clamp01(getMusicVolume() * (state.music.ambienceGain ?? 0.7));
}

function playAmbienceForContext(force = false) {
  if (!state.music.enabled) return;
  if (!state.music.unlocked) return;
  if (!state.music.ambienceEnabled) return;

  const key = getAmbienceKey();
  if (!key) return;

  const a = ensureAmbienceAudio();

  // already correct and playing
  if (!force && state.music.ambienceKey === key && !a.paused) return;

  // prevent spam during fades / switching
  if (state.music.ambSwitching) {
    state.music.pendingAmbKey = key;
    return;
  }

  state.music.ambSwitching = true;

  const nextSrc = (key === "day")
    ? "src/sounds/ambience_day.mp3"
    : "src/sounds/ambience_night.mp3";

  const startNew = () => {
    a.src = nextSrc;
    a.load();
    a.currentTime = 0;
    a.muted = false;
    a.volume = 0;

    a.play().then(() => {
      // Only commit after playback actually starts
      state.music.ambienceKey = key;

      beginAmbFadeTo(getAmbienceVolume(), state.music.ambienceFadeMs);

      state.music.ambSwitching = false;

      // Catch up if time flipped during the switch
      const nowKey = getAmbienceKey();
      const pending = state.music.pendingAmbKey;
      state.music.pendingAmbKey = null;

      if ((pending && pending !== state.music.ambienceKey) || (nowKey && nowKey !== state.music.ambienceKey)) {
        playAmbienceForContext(true);
      }
    }).catch(() => {
      state.music.ambSwitching = false;
    });
  };

  // fade out current ambience if playing, then swap
  if (!a.paused && a.currentTime > 0 && a.volume > 0.001) {
    beginAmbFadeTo(0, state.music.ambienceFadeMs, () => {
      try { a.pause(); } catch (_) {}
      startNew();
    });
  } else {
    startNew();
  }
}

function pickRandomDungeonTrack(lastTrack = null) {
  let name;

  do {
    const n = Math.floor(Math.random() * DUNGEON_TRACK_COUNT) + 1;
    name = `dungeon${n}`;
  } while (name === lastTrack && DUNGEON_TRACK_COUNT > 1);

  return name;
}

// (the left buttons, status card, backpack, chat and activity toasts are drawn by src/ui/hud.js; this handles the left buttons' taps)
function handleLeftSidebarTap(px, py) {
  const ui = state._leftbarUI;
  if (!ui) return false;

  // Compass
  if (ui.compassBtn && hitRect(px, py, ui.compassBtn)) {
    playSound("click");
    state.coordsOpen = true;
    closeMenu();
    return true;
  }

  // Volume button toggles slider
  if (ui.volBtn && hitRect(px, py, ui.volBtn)) {
    playSound("click");
    state.ui.musicSliderOpen = !state.ui.musicSliderOpen;
    state.ui.musicDragging = false;
    return true;
  }

  // Settings button opens the global Settings modal
if (ui.settingsBtn && hitRect(px, py, ui.settingsBtn)) {
  playSound("click");
  openSettingsDialog("audio"); // default tab
  return true;
}

// Collectibles archive
if (ui.collectiblesBtn && hitRect(px, py, ui.collectiblesBtn)) {
  playSound("click");
  state.collectiblesOpen = !state.collectiblesOpen;
  state.collectiblesView = "list";
  state.collectiblesSelected = null;
  state.collectiblesScroll = 0;

  // Don’t let other UI overlap
  closeMenu();
  state.coordsOpen = false;
  state.stockpileOpen = null;

  return true;
}

  // Exit: first tap arms it (so a stray tap can't kick you out), second tap saves everything and goes back to the couples app
  if (ui.exitBtn && hitRect(px, py, ui.exitBtn)) {
    playSound("click");
    if (performance.now() < (state.ui.exitArmedUntil || 0)) { state.ui.exitArmedUntil = 0; exitToCouplesApp(); }
    else { state.ui.exitArmedUntil = performance.now() + 3500; hudToast("Leave the game?", { sub: "Tap exit again to save and go back", icon: "bolt", ms: 3500 }); }
    return true;
  }

  // Interior Edit Mode toggle
  if (ui.editBtn && hitRect(px, py, ui.editBtn)) {
    playSound("click");
    state.interiorEdit.on = !state.interiorEdit.on;

    // Don’t let other UI overlap
    closeMenu();
    state.coordsOpen = false;
    state.stockpileOpen = null;

    return true;
  }

  // If slider is open, allow clicking the track to set volume or clicking outside to close.
  if (state.ui.musicSliderOpen) {
    if (ui.sliderBox && hitRect(px, py, ui.sliderBox)) {
      if (ui.sliderTrack && hitRect(px, py, ui.sliderTrack)) {
        const t = ui.sliderTrack;
        const v = (px - t.x) / t.w;
        setMusicVolume(v);
        state.ui.musicDragging = true;
      }
      return true;
    }

    // click outside closes it
    state.ui.musicSliderOpen = false;
    state.ui.musicDragging = false;
    return true;
  }

  return false;
}

function handleLeftSidebarDrag(px, py) {
  if (!state.ui.musicSliderOpen) return false;
  if (!state.ui.musicDragging) return false;

  const ui = state._leftbarUI;
  if (!ui?.sliderTrack) return false;

  const t = ui.sliderTrack;
  const v = (px - t.x) / t.w;
  setMusicVolume(v);
  return true;
}

function contributeMaterialToProject(stageId, proj, inv, itemId, qty, who) {
  qty = Math.max(0, Math.floor(qty || 0));
  if (qty <= 0) return 0;

  // clamp to what this stage still needs
  const remaining = buildRemainingStage(stageId, proj.mats);
  const need = remaining?.[itemId] ?? 0;
  if (need <= 0) return 0;

  const give = Math.min(qty, need, getQty(inv, itemId));
  if (give <= 0) return 0;

  // actually remove from inventory (multi-stack safe now)
  const ok = removeItem(inv, itemId, give);
  if (!ok) return 0;
  
    // ✅ concrete consumes a bucket: give empty bucket(s) back
  if (itemId === "concrete") {
    addItem(inv, "bucket", give);
  }

  proj.mats = proj.mats || {};
  proj.mats[itemId] = (proj.mats[itemId] || 0) + give;

  proj.contribLog = proj.contribLog || [];
  proj.contribLog.push({ who, itemId, qty: give, t: Date.now() });

  return give;
}

function withdrawMaterialFromProject(proj, inv, itemId, qty, dropX, dropY, who) {
  qty = Math.max(0, Math.floor(qty || 0));
  if (qty <= 0) return 0;

  const have = proj.mats?.[itemId] || 0;
  const take = Math.min(qty, have);
  if (take <= 0) return 0;

  // addItem returns an object; only subtract what was actually added
  const res = addItem(inv, itemId, take);
  const added = res?.added ?? 0;
  if (added <= 0) return 0;

  proj.mats[itemId] = have - added;
  if (proj.mats[itemId] <= 0) delete proj.mats[itemId];

  proj.contribLog = proj.contribLog || [];
  proj.contribLog.push({ who, itemId, qty: -added, t: Date.now() });

  // optional: if inventory was full, drop the remainder at the build tile
  const remaining = (res?.remaining ?? 0);
  if (remaining > 0 && typeof dropItemOnTile === "function") {
    dropItemOnTile(itemId, remaining, dropX, dropY);
    // NOTE: we did NOT subtract "remaining" from proj.mats, because it never left the project.
  }

  return added;
}

function placeBuildSite(x, y) {
  const map = state.world;
  if (!map || !map.objects) return false;

  const size = BUILD_FOOTPRINT;
  const h = map.objects.length;
  const w = map.objects[0].length;

  // Bounds + occupancy check
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const yy = y + dy;
      const xx = x + dx;

      if (yy < 0 || yy >= h || xx < 0 || xx >= w) return false;
      if (map.objects[yy][xx] !== null) return false;
    }
  }

  const key = `${x},${y}`;

  // Place anchor object (top-left of footprint)
  map.objects[y][x] = {
    id: "build_site",
    hp: 999,
    meta: { key }
  };

  // Register build project
  state.buildProjects[key] = {
    stageId: "build_site",
    mats: {},
    building: false,
    timeLeft: 0,
    builders: []
  };

  logAction(`${activePlayer().name} placed a build site.`);
  return true;
}

// ---------------------------------------------- Settings Modal ----
function openSettingsDialog(tab = "audio") {
  state.settingsOpen = true;
  state.settingsTab = (tab === "controls") ? "controls" : "audio";
  state.settingsDrag = null;
  state._settingsUI = null;
  closeMenu();
  state.ui.musicSliderOpen = false;
  state.ui.musicDragging = false;

  // Don’t let other modals overlap
  state.coordsOpen = false;
  state.stockpileOpen = null;
}

function closeSettingsDialog() {
  state.settingsOpen = false;
  state.settingsDrag = null;
  state._settingsUI = null;
}

function drawSlider(label, x, y, w, value01) {
  drawText(label, x, y + 10, 13, "left", "rgba(255,255,255,0.90)");

  const track = { x, y: y + 18, w, h: 10 };
  drawRect(track.x, track.y, track.w, track.h, "rgba(255,255,255,0.10)");
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.strokeRect(track.x, track.y, track.w, track.h);

  const fillW = Math.max(2, track.w * clamp01(value01));
  drawRect(track.x, track.y, fillW, track.h, "rgba(255,255,255,0.22)");

  const knobX = track.x + track.w * clamp01(value01);
  const knob = { x: knobX - 6, y: track.y - 4, w: 12, h: 18 };
  drawRect(knob.x, knob.y, knob.w, knob.h, "rgba(255,255,255,0.22)");
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.strokeRect(knob.x, knob.y, knob.w, knob.h);

  drawText(`${Math.round(clamp01(value01) * 100)}%`, x + w + 10, y + 26, 12, "left", "rgba(255,255,255,0.70)");

  return { track, knob };
}

function drawCheckbox(label, x, y, checked) {
  const box = { x, y, w: 18, h: 18 };
  drawRect(box.x, box.y, box.w, box.h, "rgba(255,255,255,0.08)");
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.strokeRect(box.x, box.y, box.w, box.h);

  if (checked) {
    drawText("✓", box.x + box.w / 2, box.y + box.h / 2 + 6, 16, "center", "rgba(255,255,255,0.90)");
  }

  drawText(label, box.x + box.w + 10, box.y + box.h / 2 + 6, 13, "left", "rgba(255,255,255,0.90)");
  return { box, label: { x: box.x + box.w + 10, y: box.y, w: 240, h: box.h } };
}

function drawSettingsModal() { hudDrawSettings(); }   // src/ui/panels2.js

function settingsSliderValueFromPx(track, px) {
  if (!track) return 0;
  return clamp01((px - track.x) / track.w);
}

function handleSettingsPointerDown(px, py) {
  if (!state.settingsOpen) return false;
  const ui = state._settingsUI;
  if (!ui) return true;

  // Close if clicked outside panel
  if (!hitRect(px, py, ui.panel)) {
    closeSettingsDialog();
    return true;
  }

  // Close button
  if (ui.close && hitRect(px, py, ui.close)) {
    playSound("click");
    closeSettingsDialog();
    return true;
  }

  // Tabs
  if (ui.tabs?.audio && hitRect(px, py, ui.tabs.audio)) {
    playSound("click");
    state.settingsTab = "audio";
    return true;
  }
  if (ui.tabs?.controls && hitRect(px, py, ui.tabs.controls)) {
    playSound("click");
    state.settingsTab = "controls";
    return true;
  }

  // Sliders (only in audio tab)
  if (state.settingsTab === "audio") {
    for (const s of Object.values(ui.sliders ?? {})) {
      const hit = (s.track && hitRect(px, py, s.track)) || (s.knob && hitRect(px, py, s.knob));
      if (hit) {
        state.settingsDrag = s.key;
        const v = settingsSliderValueFromPx(s.track, px);
        if (s.key === "master") setMasterVolume(v);
        if (s.key === "sfx") setSfxVolume(v);
        if (s.key === "music") setMusicVolume(v);
        if (s.key === "ambient") setAmbientVolume(v);
        return true;
      }
    }

    // Toggles
    const t = ui.toggles ?? {};
    if (t.music && (hitRect(px, py, t.music.box) || hitRect(px, py, t.music.label))) {
      playSound("click");
      setMusicEnabled(!state.music.enabled);
      return true;
    }
    if (t.ambient && (hitRect(px, py, t.ambient.box) || hitRect(px, py, t.ambient.label))) {
      playSound("click");
      setAmbientEnabled(!state.audio.ambientEnabled);
      return true;
    }
  }

  return true;
}

function handleSettingsDrag(px, py) {
  if (!state.settingsOpen) return false;
  if (!state.settingsDrag) return false;

  const ui = state._settingsUI;
  if (!ui) return true;

  const target = Object.values(ui.sliders ?? {}).find(v => v.key === state.settingsDrag);
  if (!target) return true;

  const v = settingsSliderValueFromPx(target.track, px);
  if (state.settingsDrag === "master") setMasterVolume(v);
  if (state.settingsDrag === "sfx") setSfxVolume(v);
  if (state.settingsDrag === "music") setMusicVolume(v);
  if (state.settingsDrag === "ambient") setAmbientVolume(v);

  return true;
}

function handleSettingsPointerUp() {
  if (!state.settingsOpen) return false;
  state.settingsDrag = null;
  return true;
}

// ---- Camera math ----------------------------------------------------------------------------------------
function viewTiles() {
  // World should fill the screen width (minus the left sidebar).
  // No reserved right panel anymore.
  const SAFE_PAD = 16;

  const usableW = window.innerWidth - UI_LEFTBAR_W - SAFE_PAD;
  const usableH = window.innerHeight - UI_TOP_H - UI_BOTTOM_H;

  const viewW = Math.floor(usableW / TILE_SIZE);
  const viewH = Math.floor(usableH / TILE_SIZE);

  return {
    viewW: Math.max(6, viewW),
    viewH: Math.max(6, viewH),
  };
}

function clampCamera() {
  const { w, h } = currentDims();
  const { viewW, viewH } = viewTiles();
  state.cam.x = Math.max(0, Math.min(state.cam.x, w - viewW));
  state.cam.y = Math.max(0, Math.min(state.cam.y, h - viewH));
}

function ensureCameraEdgeScroll() {
  // scroll by 1 tile when player hits screen edge
  const p = activePlayer();
  const { w, h } = currentDims();
  const { viewW, viewH } = viewTiles();

  const left = state.cam.x;
  const top = state.cam.y;
  const right = state.cam.x + viewW - 1;
  const bottom = state.cam.y + viewH - 1;

  let moved = false;
  if (p.x <= left && left > 0) { state.cam.x -= 1; moved = true; }
  if (p.x >= right && right < w - 1) { state.cam.x += 1; moved = true; }
  if (p.y <= top && top > 0) { state.cam.y -= 1; moved = true; }
  if (p.y >= bottom && bottom < h - 1) { state.cam.y += 1; moved = true; }

  if (moved) clampCamera();
}

function screenToMap(px, py) {
  const x = Math.floor((px - UI_LEFTBAR_W) / TILE_SIZE) + state.cam.x;
  const y = Math.floor((py - UI_TOP_H) / TILE_SIZE) + state.cam.y;
  return { x, y };
}

function mapToScreen(x, y) {
  const sx = UI_LEFTBAR_W + (x - state.cam.x) * TILE_SIZE;
  const sy = UI_TOP_H + (y - state.cam.y) * TILE_SIZE;
  return { sx, sy };
}

function recenterCameraOnPlayer(pl) {
  if (!pl) return;

  const { viewW, viewH } = viewTiles();

  // Camera is stored in TILE coords (top-left tile of the view)
  state.cam.x = Math.floor(pl.x - viewW / 2);
  state.cam.y = Math.floor(pl.y - viewH / 2);

  clampCamera();
}

// ---------------------------------------------------------------------------- SOUND FX & MUSIC FUNCTIONS ----
const sounds = {};

function loadSound(name, file, volume = 1) {
  const audio = new Audio(`src/sounds/${file}`);
  audio.volume = volume;
  sounds[name] = audio;
}

function playSound(name) {
  if (state.holdingHands && HAND_BREAKERS.has(name)) endHoldingHands("Hands let go: someone got busy.");   // working or using something lets go of the other's hand
  const s = sounds[name];
  if (!s) return;
  s.currentTime = 0;
  s.play().catch(() => {});
}

// -------------------------------------------------------------------------- MUSIC ----

function getMusicContextKey() {

  if (state.mode === "dungeon") {
    return "dungeon";
  }

  if (state.title?.open) return "title";

  const isDay = state.time?.isDay ?? true;
  const indoor = (state.mode === "interior");
  return `${isDay ? "daytime" : "nighttime"}_${indoor ? "indoor" : "outdoor"}`;
}

function ensureMusicAudio() {
  if (state.music.audio) return state.music.audio;
  const a = new Audio();
  a.loop = false;
  a.volume = getMusicVolume();
  state.music.audio = a;

  a.addEventListener("ended", () => {

  if (state.mode === "dungeon") {
    const nextName = pickRandomDungeonTrack(state.music.lastTrack);
    state.music.lastTrack = nextName;

    a.src = `src/music/${nextName}.mp3`;
    a.currentTime = 0;
    a.play().catch(()=>{});
    return;
  }

  playRandomMusicForContext(false);
});

  a.addEventListener("error", () => {
    // if a track fails (missing file), try another
    // (keeps it from getting stuck if you haven't added every number)
    playRandomMusicForContext(false, /*allowRetry*/ true);
  });

  return a;
}

// Call on first user interaction to satisfy autoplay policies
function unlockMusicIfNeeded() {
  if (!state.music.enabled) return;
  if (state.music.unlocked) return;

  const a = ensureMusicAudio();

  // Pick a real track and play it NOW (this is what browsers actually accept).
  const ctxKey = getMusicContextKey();
  state.music.contextKey = ctxKey;

  const prefix = `${ctxKey}`;
  const nextName = pickRandomTrackName(prefix, state.music.lastTrack, state.music.indexMax);
  state.music.lastTrack = nextName;

  a.src = `src/music/${nextName}.mp3`;
  a.currentTime = 0;

  // Start muted, then fade to your slider volume
  a.volume = 0;

  a.play().then(() => {
    state.music.unlocked = true;

    // Fade music in
    beginFadeTo(getMusicVolume(), state.music.fadeMs);

    // Start ambience AFTER unlock so it can play too
    ensureAmbienceAudio();
    playAmbienceForContext(true);
  }).catch((err) => {
    // Still blocked, so stay locked and try again on next interaction
    state.music.unlocked = false;
    console.warn("[MUSIC] unlock play() rejected:", err);
  });
}


// ----------------------------------------------------------------------------
// TITLE MENU (profile + heart + start/continue)
const titleImgs = {
  left: null,
  right: null,
  loaded: false
};

// --------------------------------------------------------------------------- CUTSCENE SLIDES ----
const CUTSCENE_SLIDES = [
  { title: "", text: "Long ago, in a place beyond time and space, there were two souls...\n\nHá muito tempo, num lugar além do tempo e do espaço, existiam duas almas..." },
  { title: "", text: "They were bound by an imperishable love, taking such joy in the company of one another, that they made a promise to each other...\n\nEles estavam unidos por um amor imperecível, encontrando tanta alegria na companhia um do outro, que fizeram uma promessa um ao outro..." },
  { title: "", text: "A promise to stay together for all eternity. To learn and grow together as souls, forever side by side...\n\nUma promessa de ficarmos juntos por toda a eternidade. De aprendermos e crescermos juntos como almas, para sempre lado a lado..." },
  { title: "", text: "And so, as they embarked on their journey through the realms of Creation, they sought to find each other in every lifetime, so that they might remember the promise they had made to each other...\n\nE assim, ao embarcarem em sua jornada pelos reinos da Criação, buscaram encontrar-se em cada vida, para que pudessem se lembrar da promessa que haviam feito um ao outro..." },
  { title: "", text: "And though the mortal body knows only what it has endured in its short lifespan, they were drawn to each other as if by some unseen force, for the will of the soul is far greater than the mind of man can comprehend...\n\nE embora o corpo mortal só saiba o que suportou em sua curta existência, eles foram atraídos um pelo outro como que por alguma força invisível, pois a vontade da alma é muito maior do que a mente humana pode compreender..." },
  { title: "", text: "And so in each life, against all odds, they found each other, recognizing one another by the nature of their soul, and they knew that at last, their longing for home had been answered...\n\nE assim, em cada vida, contra todas as probabilidades, eles se encontraram, reconhecendo-se pela natureza de suas almas, e souberam que, finalmente, seu anseio por um lar havia sido satisfeito..." },
  { title: "", text: "And they knew... They knew without any doubt because of the way they felt together, even at a distance. They knew because they felt an understanding that was beyond language. They knew, because together, they felt at home...\n\nE eles sabiam... Sabiam sem qualquer dúvida, pela forma como se sentiam juntos, mesmo à distância. Sabiam porque sentiam uma compreensão que transcendia as palavras. Sabiam porque, juntos, sentiam-se em casa..." },
  { title: "", text: "You Are My Home\n\nVocê é meu lar" }
];

// --------------------------------------------------------------------------- TUTORIAL SLIDES ----
const TUTORIAL_SLIDES = [
  { title: "Tutorial 🙂", text: "Welcome! If this is your first time playing You Are My Home, don't worry- this game is very simple! But here's some tips to get you started...\n\nBem-vindo(a)! Se esta é a sua primeira vez jogando You Are My Home, não se preocupe — este jogo é muito simples! Mas aqui vão algumas dicas para você começar..." },
  { title: "Movement 🚶‍♂️‍➡️", text: "To move around on the map, tap or click where you want to go! To use something (pick it up, harvest it, open it), double-tap or double-click it. If you're using a computer with a keyboard, you can also move with W, A, S, D.\n\nPara se movimentar no mapa, toque ou clique onde deseja ir! Para usar algo (pegar, coletar, abrir), toque duas vezes ou dê um duplo clique. Se estiver usando um computador com teclado, você também pode se movimentar com as teclas W, A, S, D." },
  { title: "Stamina ⚡️", text: "Moving and performing certain actions costs stamina. You can rest at any time to recover stamina! Just tap and hold on your character to open the character menu, and choose rest! On a keyboard, you can use the R key.\n\nMover-se e realizar certas ações consome energia. Você pode descansar a qualquer momento para recuperá-la! Basta tocar e segurar seu personagem para abrir o menu de personagem e escolher Descansar! No teclado, você pode usar a tecla R." },
  { title: "Items & Resources 🪵", text: "There are many items and resources with various purposes scattered accross the map. You can use these items for crafting, cooking, and more! Double-tap an item or resource to pick it up or harvest it, or tap and hold on it to choose from the options in its menu (tap the X to close a menu)! Just make sure you're equipped with the right tool for the job!\n\nExistem muitos itens e recursos com diversas finalidades espalhados pelo mapa. Você pode usar esses itens para criar itens, cozinhar e muito mais! Toque duas vezes em um item ou recurso para pegá-lo ou coletá-lo, ou toque e segure para escolher entre as opções do menu (toque no X para fechar um menu)! Só certifique-se de ter a ferramenta certa para cada tarefa!" },
  { title: "Crafting and Cooking 🛠", text: "Crafting can be done from the Workbench. Cooking can be done from a Campfire or a Stove. You'll find various crafting and cooking recipes as you explore, but feel free to try out your own creations!\n\nVocê pode criar itens na Bancada de Trabalho. Para cozinhar, use uma Fogueira ou um Fogão. Você encontrará diversas receitas de artesanato e culinária enquanto explora, mas sinta-se à vontade para experimentar suas próprias criações!" },
  { title: "Home Construction 🔨", text: "Once you've obtained a complete blueprint and the proper resources, you can build and customize a house!\n\nDepois de obter uma planta completa e os recursos necessários, você poderá construir e personalizar uma casa!" },
  { title: "Inventory 💼", text: "Inventory space is limited, so manage your items wisely! If you run out of space, you can create a Stockpile to safely store your items anywhere!\n\nO espaço no inventário é limitado, então gerencie seus itens com sabedoria! Se você ficar sem espaço, pode criar um Depósito para armazenar seus itens com segurança em qualquer lugar!" },
  { title: "Hunger 🍎", text: "Your character will become hungry after a while, so keep an eye on the hunger meter and be on the lookout for delicious snacks! If you get too hungry, you'll lose stamina!\n\nSeu personagem ficará com fome depois de um tempo, então fique de olho no medidor de fome e procure por lanches deliciosos! Se você ficar com muita fome, perderá energia!" },
  { title: "Locations & Travel 🧭", text: "If you ever feel lost, you can always access the Location Markers by clicking on the Compass or pressing M on a keyboard. Certain map objects will automatically be marked for your convenience. Additionally, you can manually mark any location on the map!\n\nSe alguma vez se sentir perdido, pode sempre aceder aos Marcadores de Localização clicando na Bússola ou premindo a tecla M no teclado. Alguns objetos do mapa serão automaticamente marcados para sua conveniência. Além disso, pode marcar manualmente qualquer localização no mapa!" },
  { title: "Survive Together 👫", text: "Explore, build, thrive. And remember, everything is better together! 😉.\n\nExplore, construa, prospere. E lembre-se: juntos, tudo é melhor!" }
];

function loadTitleImages() {
  if (titleImgs.loaded) return;
  titleImgs.loaded = true;

  titleImgs.left = new Image();
  titleImgs.right = new Image();

  titleImgs.left.src = "src/images/heart_left.png";
  titleImgs.right.src = "src/images/heart_right.png";
}

loadTitleImages();

function loadWantTutorial() {
  try {
    const v = localStorage.getItem(WANT_TUTORIAL_KEY);
    return v === null ? null : (v === "1");
  } catch (_) {
    return null;
  }
}
function saveWantTutorial(v) {
  try { localStorage.setItem(WANT_TUTORIAL_KEY, v ? "1" : "0"); } catch (_) {}
}

function lerp(a, b, t) { return a + (b - a) * t; }

function approachVel(p, tx, ty, accel, damp) {
  const dx = tx - p.x;
  const dy = ty - p.y;

  // accelerate toward target
  p.vx += dx * accel;
  p.vy += dy * accel;

  // damping (prevents infinite speed)
  p.vx *= damp;
  p.vy *= damp;

  p.x += p.vx;
  p.y += p.vy;
}

function drawGlowOrb(x, y, r, alpha = 1) {
  // Outer glow
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
  g.addColorStop(0.0, `rgba(255,255,255,${0.35 * alpha})`);
  g.addColorStop(0.2, `rgba(255,255,255,${0.20 * alpha})`);
  g.addColorStop(1.0, `rgba(255,255,255,0)`);

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 6, 0, Math.PI * 2);
  ctx.fill();

  // Inner core
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(255,255,255,${0.95 * alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Tiny hot center
  ctx.fillStyle = `rgba(255,255,255,${0.85 * alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function loadWantCutscene() {
  try {
    const v = localStorage.getItem(WANT_CUTSCENE_KEY);
    return v === null ? null : (v === "1");
  } catch (_) {
    return null;
  }
}
function saveWantCutscene(v) {
  try { localStorage.setItem(WANT_CUTSCENE_KEY, v ? "1" : "0"); } catch (_) {}
}

function loadCutsceneSeen() {
  try { return localStorage.getItem(CUTSCENE_SEEN_KEY) === "1"; } catch (_) { return false; }
}
function saveCutsceneSeen(v) {
  try { localStorage.setItem(CUTSCENE_SEEN_KEY, v ? "1" : "0"); } catch (_) {}
}

function loadTutorialSeen() {
  try { return localStorage.getItem(TUTORIAL_SEEN_KEY) === "1"; } catch (_) { return false; }
}

function saveTutorialSeen(v) {
  try { localStorage.setItem(TUTORIAL_SEEN_KEY, v ? "1" : "0"); } catch (_) {}
}

function loadSavedProfile() {
  try { return localStorage.getItem(PROFILE_KEY); } catch (_) { return null; }
}
function saveProfile(id) {
  try { localStorage.setItem(PROFILE_KEY, id); } catch (_) {}
}

// Call this ONLY from a real user gesture (click/tap on title menu)
function titleStartOrContinue() {
  // Close title overlay
  state.title.open = false;
  state.title._ui = null;

  // Close any stray UI
  state.ui.musicSliderOpen = false;
  state.ui.musicDragging = false;
  closeMenu();
  state.coordsOpen = false;
  state.stockpileOpen = null;

  // Hard mark unlocked (we're inside a user gesture)
  state.music.unlocked = true;

  // If world setup already ran this session (e.g. returning to title mid-play), skip setup.
  // NOTE: do NOT gate on state.world — the WS handler sets that before Continue is clicked,
  // which would incorrectly skip inventory/toolkit/fog setup on first load.
  if (state._worldSetupDone) {
    playRandomMusicForContext(true);
    return;
  }

  // Show loading screen, then do heavy world setup on next frame
  showLoadingOverlay();
  setLoadProgress(5, "Loading world...");

  requestAnimationFrame(() => {
    setTimeout(() => {
      doWorldSetup();
      playRandomMusicForContext(true);
    }, 50);
  });
}

function updateTitleMenu(dt) {
  if (!state.title.open) return;

  if (state.title.phase === "intro") {
    const speed = 1 / 1.1; // ~1.1s open
    state.title.openP = clamp01(state.title.openP + dt * speed);

    if (state.title.openP >= 1) {
      state.title.phase = "menu";
    }
  }
}

function updateBuildTimers(dt) {
  if (!state.world?.objects) return;

  for (const key of Object.keys(state.buildProjects)) {
    const proj = state.buildProjects[key];
    if (!proj?.building) continue;

    const [x, y] = key.split(",").map(Number);

    // Builder list: active builders only (must be near and have stamina)
    const builders = state.players.filter(p => proj.builders?.includes(p.id));
    if (!builders.length) {
      stopBuildTimer(key);
      continue;
    }

   // Interrupt rules (pause if any builder is too far or exhausted)
let paused = false;
for (const p of builders) {
  const tooFar = Math.abs(p.x - x) > 1 || Math.abs(p.y - y) > 1;
  if (tooFar || p.stamina <= 0) {
    paused = true;
    break;
  }
  p.stamina = Math.max(0, p.stamina - BUILD_STAMINA_COST_PER_SEC * dt);
}
if (paused) {
  stopBuildTimer(key);
  logAction(`Building paused.`);
  continue;
}

    // Coop speed: 25% faster if 2 builders
    const speed = builders.length > 1 ? 1.25 : 1;

    proj.timeLeft -= dt * speed;

    if (proj.timeLeft <= 0) {
      finishBuildStage(key, x, y);
    }
  }
}

function loadCollectiblesFound() {
  try {
    const raw = localStorage.getItem(COLLECTIBLES_FOUND_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return (obj && typeof obj === "object") ? obj : {};
  } catch (_) {
    return {};
  }
}

function saveCollectiblesFound(obj) {
  try { localStorage.setItem(COLLECTIBLES_FOUND_KEY, JSON.stringify(obj || {})); } catch (_) {}
}

// Record a collectible as found by a player (keeps counts per player)
function markCollectibleFound(itemId, playerName) {
  if (!state.collectiblesFound) state.collectiblesFound = {};
  const entry = state.collectiblesFound[itemId] ?? { by: {}, firstAt: Date.now() };

  if (!entry.by || typeof entry.by !== "object") entry.by = {};
  entry.by[playerName] = (entry.by[playerName] ?? 0) + 1;

  state.collectiblesFound[itemId] = entry;
  saveCollectiblesFound(state.collectiblesFound);
}

function isCollectible(itemId) {
  const it = itemDef(itemId);
  return Array.isArray(it?.tags) && it.tags.includes("collectible");
}

function allCollectibleIds() {
  return Object.keys(state.data.items).filter(id => isCollectible(id));
}

function easeInOutCubic(t) {
  t = Math.max(0, Math.min(1, t));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function drawRoundedRect(x, y, w, h, r, fill, stroke) {
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  ctx.restore();
}

function drawHeartOpening(cx, cy, size, p, opts) {
  opts = opts || {};
  const showPanel = opts.showPanel !== false;
  const showText = opts.showText !== false;

  const t = easeInOutCubic(p);

// animated opening distance (delay so panel has time to appear)
const splitT = clamp01((t - 0.08) / 1.10);   // <-- 0.08 delays separation
const split = size * 0.34 * easeInOutCubic(splitT) + size * 0.003;

const insetNow = 0;

// CLOSED fit offset: makes the halves meet at p=0
// tweak 0.18 if needed (0.14..0.24)
const closedInset = size * 0.18;

  // Panel behind
  const panelW = size * 0.78;
  const panelH = size * 0.50;

  // Text fade
  const textA = showText ? Math.max(0, Math.min(1, (t - 0.35) / 0.65)) : 0;

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.48, size * 0.45, size * 0.16, 0, 0, Math.PI * 2);
  ctx.fillStyle = "black";
  ctx.fill();
  ctx.restore();

// Panel (grow from center for "origami unfolding")
if (showPanel) {

  // --- TIMING CONTROLS ---
  // When the panel STARTS appearing (relative to heart opening)
  // 0.00 = instantly
  // 0.10 = slight delay (nice)
  // 0.20 = more dramatic pause
  const startDelay = 0.09;

  // How long the unfold animation lasts
  // smaller = faster snap open
  // bigger  = slower, smoother reveal
  const unfoldDuration = 0.75;

  // Normalized growth progress (0 → 1)
  const g = clamp01((t - startDelay) / unfoldDuration);

  // Smoothed easing (makes it feel organic instead of robotic)
  const gg = easeInOutCubic(g);

  // --- SIZE CONTROLS ---
  // Width-only unfold (height stays constant)
  const curW = panelW * gg;
  const curH = panelH;

  // --- POSITION CONTROLS ---
  // X centers on heart
  const px = cx - curW / 2;

  // Y centers vertically, with slight downward offset
  // Increase 0.02 → moves panel downward
  const py = cy - curH / 2 + size * 0.04;

  // --- VISUAL CONTROLS ---
  // Fade-in tied to growth so it doesn't pop
  const a = 0.95 * gg;

  // --- DRAW ---
  drawRoundedRect(
    px, py,
    curW, curH,
    14,
    `rgba(255, 210, 210, ${a})`,
    `rgba(255,255,255, ${0.25 * gg})`
  );
}

  // Text
  if (textA > 0) {
    ctx.save();
    ctx.globalAlpha = textA;
    drawText("You are", cx, cy - size * 0.08, 28, "center", "rgba(40,20,35,0.95)", TITLE_FONT);
drawText("my",     cx, cy + size * 0.04, 28, "center", "rgba(40,20,35,0.95)", TITLE_FONT);
drawText("home!",  cx, cy + size * 0.16, 28, "center", "rgba(40,20,35,0.95)", TITLE_FONT);
    ctx.restore();
  }

  // Ensure images are loading
  if (typeof loadTitleImages === "function") loadTitleImages();

  const leftImg = titleImgs.left;
  const rightImg = titleImgs.right;

  const leftOK = leftImg && leftImg.complete && leftImg.naturalWidth > 0;
  const rightOK = rightImg && rightImg.complete && rightImg.naturalWidth > 0;

  // Draw image centered at cx,cy with max-dimension = size
function drawLeftHalf(img, seamX) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  const scale = size / Math.max(iw, ih);
  const w = iw * scale;
  const h = ih * scale;

  // LEFT half seam is at the RIGHT edge of the image
  const x = seamX - w;   // right edge sits on seamX
  const y = cy - h / 2;
  ctx.drawImage(img, x, y, w, h);
}

function drawRightHalf(img, seamX) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  const scale = size / Math.max(iw, ih);
  const w = iw * scale;
  const h = ih * scale;

  // RIGHT half seam is at the LEFT edge of the image
  const x = seamX;       // left edge sits on seamX
  const y = cy - h / 2;
  ctx.drawImage(img, x, y, w, h);
}

const seamX = cx;
const leftSeamX  = seamX - split;
const rightSeamX = seamX + split;


if (leftOK)  drawLeftHalf(leftImg, leftSeamX);
else         drawRect(leftSeamX - size * 0.42, cy - size * 0.32, size * 0.42, size * 0.64, "#ffd2d2");

if (rightOK) drawRightHalf(rightImg, rightSeamX);
else         drawRect(rightSeamX, cy - size * 0.32, size * 0.42, size * 0.64, "#ffd2d2");

  // Debug: once per draw, show why it’s not using images
  // (Remove after it works.)
  if (!leftOK || !rightOK) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    drawText(
      `heart imgs: L=${leftOK ? "OK" : "no"} R=${rightOK ? "OK" : "no"}`,
      cx, cy + size * 0.62, 12, "center", "rgba(255,255,255,0.8)"
    );
    ctx.restore();
  }
}

function drawTitleMenu() {
  if (!state.title.open) return;

  // Dim background
  drawRect(0, 0, window.innerWidth, window.innerHeight, "rgba(0,0,0,0.75)");

  const cx = Math.floor(window.innerWidth / 2);
  const cy = 170;
  const size = 220;
  const TITLE_Y_OFF = 40;

  // Build hit rects
  state.title._ui = {
    heartBtn: null,
    startBtn: null,
    scottBtn: null,
    cristinaBtn: null,
	cutsceneToggle: null,
    tutorialToggle: null
  };

  // Heart clickable area (rough but works well)
  state.title._ui.heartBtn = {
    x: cx - size * 0.55,
    y: cy - size * 0.55,
    w: size * 1.10,
    h: size * 1.10
  };

  // CLOSED: full heart only, no text, no panel, no menu
  if (state.title.phase === "closed") {
    drawHeartOpening(cx, cy + TITLE_Y_OFF, size, 0, { showPanel: false, showText: false });
    drawText("Click the heart", cx, cy + 150, 14, "center", "rgba(255,255,255,0.65)");
    return;
  }

  // INTRO/MENU/PICK: show opening heart with panel/text
  drawHeartOpening(cx, cy + TITLE_Y_OFF, size, state.title.openP, { showPanel: true, showText: true });

  // Message below heart (appears after click)
  const msgY = cy + 150;
  if (state.title.phase !== "closed") {
    // optional: fade in as it opens
    const msgA = 0.20 + 0.80 * state.title.openP; // 0.2 → 1.0
    drawText(
      "Dedicado ao amor da minha existência, Cristina.",
      cx,
      msgY,
      14,
      "center",
      `rgba(255,255,255,${0.65 * msgA})`
    );
  }

 // Checkboxes (placed BELOW the message so they can't overlap)
const cbSize = 16;
let cbY = msgY + 26;

// STORY checkbox (only after first watch)
state.title._ui.cutsceneToggle = null;
if (state.cutscene.seen) {
  state.title._ui.cutsceneToggle = { x: cx - 110, y: cbY, w: 220, h: cbSize + 6 };

  drawRect(cx - 110, cbY, cbSize, cbSize, "rgba(30,30,30,0.95)");
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.strokeRect(cx - 110, cbY, cbSize, cbSize);

  if (state.wantCutscene) {
    drawText("✓", (cx - 110) + (cbSize / 2), cbY + 13, 16, "center", "#fff");
  }

  drawText("View Story", cx - 80, cbY + 13, 14, "left", "rgba(255,255,255,0.85)");
  cbY += 22;
}

// TUTORIAL checkbox (only after first watch)
state.title._ui.tutorialToggle = null;
if (state.tutorial.seen) {
  state.title._ui.tutorialToggle = { x: cx - 110, y: cbY, w: 220, h: cbSize + 6 };

  drawRect(cx - 110, cbY, cbSize, cbSize, "rgba(30,30,30,0.95)");
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.strokeRect(cx - 110, cbY, cbSize, cbSize);

  if (state.wantTutorial) {
    drawText("✓", (cx - 110) + (cbSize / 2), cbY + 13, 16, "center", "#fff");
  }

  drawText("View Tutorial", cx - 80, cbY + 13, 14, "left", "rgba(255,255,255,0.85)");
}

  // Don’t show any buttons until fully open
  if (state.title.openP < 1) return;

  const saved = state.title.savedProfile;
  const isPick = (state.title.phase === "pick");
  const mainLabel = saved ? "Continue" : "Start Game";

  if (!isPick) {
    const bw = 220, bh = 44;
    const bx = cx - bw / 2;

    // Start button placed BELOW checkbox so it never overlaps
    const by = cbY + 34;

    drawRect(bx, by, bw, bh, "rgba(30,30,30,0.95)");
    ctx.strokeStyle = "rgba(255,255,255,0.20)";
    ctx.strokeRect(bx, by, bw, bh);
    drawText(mainLabel, cx, by + 29, 18, "center", "rgba(255,255,255,0.92)");

    state.title._ui.startBtn = { x: bx, y: by, w: bw, h: bh };
    return;
  }

  // Pick screen (unchanged)
  drawText("Choose your character", cx, cy + 230, 18, "center", "rgba(255,255,255,0.92)");

  const cardW = 170, cardH = 210;
  const gap = 22;
  const rowY = cy + 250;

  const leftX = cx - cardW - gap / 2;
  const rightX = cx + gap / 2;
  
  

 function drawCard(x, y, label, imgPath) {
  drawRect(x, y, cardW, cardH, "rgba(20,20,20,0.92)");
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.strokeRect(x, y, cardW, cardH);

  const pad = 12;
  const imgBox = {
    x: x + pad,
    y: y + pad,
    w: cardW - pad * 2,
    h: cardW - pad * 2
  };

  drawRect(imgBox.x, imgBox.y, imgBox.w, imgBox.h, "rgba(0,0,0,0.35)");
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.strokeRect(imgBox.x, imgBox.y, imgBox.w, imgBox.h);

  // --- RAW IMAGE DRAW (no helpers, no cache dependency) ---
  if (!drawCard._cache) drawCard._cache = {};
  let img = drawCard._cache[imgPath];

  if (!img) {
    img = new Image();
    img.src = imgPath;
    drawCard._cache[imgPath] = img;
  }

  if (img.complete && img.naturalWidth > 0) {
    const scale = Math.min(imgBox.w / img.width, imgBox.h / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const dx = imgBox.x + (imgBox.w - w) / 2;
    const dy = imgBox.y + (imgBox.h - h) / 2;
    ctx.drawImage(img, dx, dy, w, h);
  }

  drawText(label, x + cardW / 2, y + cardH - 16, 16, "center", "rgba(255,255,255,0.92)");
}

  drawCard(leftX, rowY, "Scott", "src/images/scott_thumbnail.jpg");
  drawCard(rightX, rowY, "Cristina", "src/images/cristina_thumbnail.jpg");

  state.title._ui.scottBtn = { x: leftX, y: rowY, w: cardW, h: cardH };
  state.title._ui.cristinaBtn = { x: rightX, y: rowY, w: cardW, h: cardH };
}

// ------------------------------------------------------- Title Menu Function -----------
function handleTitleMenuTap(px, py) {
  if (!state.title.open) return false;
  const ui = state.title._ui;
  if (!ui) return true;

  // CLOSED: click heart to begin opening
  if (state.title.phase === "closed") {
    if (ui.heartBtn && hitRect(px, py, ui.heartBtn)) {
      playSound("click"); // ✅ click sfx

      state.title.phase = "intro";
      state.title.openP = 0;

      // Start title music on user gesture
      state.music.unlocked = true;
      playRandomMusicForContext(true);
    }
    return true;
  }

  // If not fully open yet, ignore clicks
  if (state.title.openP < 1) return true;

// Pick phase
if (state.title.phase === "pick") {
  // Always allow selection so first-time play can set identity.
  // OFFLINE: also sets who you control.
  // ONLINE: selection is remembered (profile), but control is still determined by server "welcome".

  if (ui.scottBtn && hitRect(px, py, ui.scottBtn)) {
    playSound("click");
    saveProfile("scott");
    state.title.savedProfile = "scott";

    if (!state.net?.enabled) state.activePlayer = 0;

    state.title.phase = "menu";
    return true;
  }

  if (ui.cristinaBtn && hitRect(px, py, ui.cristinaBtn)) {
    playSound("click");
    saveProfile("cristina");
    state.title.savedProfile = "cristina";

    if (!state.net?.enabled) state.activePlayer = 1;

    state.title.phase = "menu";
    return true;
  }

  return true;
}

// Cutscene checkbox (toggle) - MUST be before startBtn so clicks don't get eaten
if (ui.cutsceneToggle && hitRect(px, py, ui.cutsceneToggle)) {
  playSound("click");
  state.wantCutscene = !state.wantCutscene;
  saveWantCutscene(state.wantCutscene);
  return true;
}

  // Tutorial checkbox (toggle) - MUST be before startBtn so clicks don't get eaten
  if (ui.tutorialToggle && hitRect(px, py, ui.tutorialToggle)) {
    playSound("click"); // ✅ click sfx

    state.wantTutorial = !state.wantTutorial;
    saveWantTutorial(state.wantTutorial);
    return true;
  }

  // Start/Continue button
  if (ui.startBtn && hitRect(px, py, ui.startBtn)) {
    playSound("click"); // ✅ click sfx

    // ALWAYS require a profile before ANY flow (cutscene/tutorial/start)
    if (!state.title.savedProfile) {
      state.title.phase = "pick";
      return true;
    }

    // FIRST-EVER PLAY: FORCE CUTSCENE, THEN TUTORIAL
    if (!state.cutscene.seen) {
      state.cutscene.open = true;
      state.cutscene.index = 0;
      state.cutscene.t = 0;
      state.cutscene._after = "tutorial";
      return true;
    }

    // Normal flow
    if (!state.title.savedProfile) {
      state.title.phase = "pick";
      return true;
    }

// If story cutscene is enabled, play it BEFORE tutorial/start
if (state.wantCutscene) {
  state.cutscene.open = true;
  state.cutscene.index = 0;
  state.cutscene.t = 0;
  state.cutscene._after = (state.wantTutorial ? "tutorial" : "start");
  return true;
}

    // If tutorial is enabled, open tutorial instead of starting immediately
    if (state.wantTutorial) {
      state.tutorial.open = true;
      state.tutorial.index = 0;
      return true;
    }

    // Otherwise start game
    titleStartOrContinue();
    return true;
  }

  return true;
}

function drawCutscene() {
  if (!state.cutscene?.open) return;

  const slide = CUTSCENE_SLIDES[state.cutscene.index] || { title: "", text: "" };
  state.cutscene.t = (state.cutscene.t ?? 0) + 1 / 60;

  const t = state.cutscene.t;

  // ---- Background
  drawRect(0, 0, window.innerWidth, window.innerHeight, "rgba(0,0,0,0.85)");

  // Center (declare EARLY so everything can use it)
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  // ---- 3D starfield (moving toward camera)
const STAR_COUNT = 140;          // more stars = richer space
const STAR_SPEED = 120;          // pixels/sec toward camera (lower = slower)
const Z_FAR = 1200;              // depth range
const FOV = 420;                 // perspective strength (higher = less extreme)

// init once
if (!state.cutscene.stars || state.cutscene.stars.length !== STAR_COUNT) {
  state.cutscene.stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    state.cutscene.stars.push({
      x: (Math.random() * 2 - 1) * window.innerWidth,   // scattered
      y: (Math.random() * 2 - 1) * window.innerHeight,  // scattered
      z: Math.random() * Z_FAR + 1
    });
  }
}

// frame dt (your cutscene advances at ~60fps)
const dt = 1 / 60;

// update + draw
for (const s of state.cutscene.stars) {
  // move toward camera
  s.z -= STAR_SPEED * dt;

  // if passed camera, respawn far away
  if (s.z <= 1) {
    s.x = (Math.random() * 2 - 1) * window.innerWidth;
    s.y = (Math.random() * 2 - 1) * window.innerHeight;
    s.z = Z_FAR;
  }

  // project to screen (centered at cx/cy)
  const px = cx + (s.x / s.z) * FOV;
  const py = cy + (s.y / s.z) * FOV;

  // skip offscreen stars
  if (px < -10 || px > window.innerWidth + 10 || py < -10 || py > window.innerHeight + 10) continue;

  // size/brightness based on depth (nearer stars look brighter and slightly larger)
  const k = 1 - (s.z / Z_FAR); // 0 far -> 1 near
  const size = 1 + k * 2.2;
  const a = 0.15 + k * 0.55;

  drawRect(px, py, size, size, `rgba(255,255,255,${a})`);
}

  // ---- Orbs (leader + follower)
  const roamR = Math.min(window.innerWidth, window.innerHeight) * 0.40;

  // Ensure orb state exists
  if (!state.cutscene.orbs) {
    state.cutscene.orbs = {
      a: { x: cx - 40, y: cy, vx: 0, vy: 0 },
      b: { x: cx + 40, y: cy, vx: 0, vy: 0 },
      init: true
    };
  }

  const orbs = state.cutscene.orbs;

  // Re-init once if needed (or if screen resized wildly you can re-init too)
  if (!orbs.init) {
    orbs.a.x = cx - 40; orbs.a.y = cy;
    orbs.b.x = cx + 40; orbs.b.y = cy;
    orbs.a.vx = orbs.a.vy = 0;
    orbs.b.vx = orbs.b.vy = 0;
    orbs.init = true;
  }

  // Leader target (organic wandering)
  const targetX =
    cx + Math.cos(t * 0.65) * roamR * 0.85 +
    Math.cos(t * 1.40 + 1.7) * roamR * 0.25;

  const targetY =
    cy + Math.sin(t * 0.58) * roamR * 0.65 +
    Math.sin(t * 1.20 + 0.9) * roamR * 0.30;

  // Move leader
  approachVel(orbs.a, targetX, targetY, 0.0022, 0.92);

  // Follower target: behind + playful side wiggle
  const ang = Math.atan2(orbs.a.vy, orbs.a.vx || 0.0001);
  const behind = 44;
  const side = 26;

  const fx =
    orbs.a.x - Math.cos(ang) * behind +
    Math.cos(t * 2.6) * side;

  const fy =
    orbs.a.y - Math.sin(ang) * behind +
    Math.sin(t * 2.2) * side;

  // Move follower
  approachVel(orbs.b, fx, fy, 0.0030, 0.90);

  // Boundaries
  const pad = 30;
  orbs.a.x = clamp(orbs.a.x, pad, window.innerWidth - pad);
  orbs.a.y = clamp(orbs.a.y, pad, window.innerHeight - pad);
  orbs.b.x = clamp(orbs.b.x, pad, window.innerWidth - pad);
  orbs.b.y = clamp(orbs.b.y, pad, window.innerHeight - pad);

// Draw orbs only (no tails)
drawGlowOrb(orbs.a.x, orbs.a.y, 7, 1);
drawGlowOrb(orbs.b.x, orbs.b.y, 6, 0.95);

  // Story sizing
const margin = 24;
const boxW = Math.min(640, window.innerWidth - margin * 2);
const boxH = Math.min(360, window.innerHeight * 0.55);

const px = cx - boxW / 2;
const py = cy - boxH / 2;

// Panel
drawRect(px, py, boxW, boxH, "rgba(20,20,20,0.95)");
ctx.strokeStyle = "rgba(255,255,255,0.25)";
ctx.strokeRect(px, py, boxW, boxH);

// Dynamic spacing
const titleY = py + Math.max(36, boxH * 0.14);
const textY  = titleY + Math.max(36, boxH * 0.12);

const titleSize = window.innerWidth < 600 ? 24 : 32;
const bodySize  = window.innerWidth < 600 ? 13 : 14;

drawText(slide.title, cx, titleY, titleSize, "center", "#fff", TITLE_FONT);

drawWrappedText(
  slide.text,
  cx,
  textY,
  boxW - 60,
  20,
  bodySize,
  "center",
  "#fff",
  BASE_FONT
);


  drawText(
    `Scene ${state.cutscene.index + 1} / ${CUTSCENE_SLIDES.length}`,
    cx, py + boxH - 70, 12, "center", "rgba(255,255,255,0.55)", BASE_FONT
  );
  drawText("Tap to continue", cx, py + boxH - 38, 14, "center", "rgba(255,255,255,0.75)", BASE_FONT);

  state._cutsceneUI = { x: px, y: py, w: boxW, h: boxH };
}


function drawTutorial() {
  if (!state.tutorial?.open) return;

  const slide = TUTORIAL_SLIDES[state.tutorial.index] || { title: "", text: "" };

  // fullscreen dim
  drawRect(0, 0, window.innerWidth, window.innerHeight, "rgba(0,0,0,0.85)");

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

const TITLE_Y_OFF = 40; // move title group down (tweak this number)

  // Tutorial & Story Box sizing
const margin = 24;
const boxW = Math.min(640, window.innerWidth - margin * 2);
const boxH = Math.min(360, window.innerHeight * 0.55);

const bx = cx - boxW / 2;
const by = cy - boxH / 2;

// Panel
drawRect(bx, by, boxW, boxH, "rgba(20,20,20,0.95)");
ctx.strokeStyle = "rgba(255,255,255,0.25)";
ctx.strokeRect(bx, by, boxW, boxH);

// Dynamic spacing
const titleY = by + Math.max(36, boxH * 0.14);
const textY  = titleY + Math.max(36, boxH * 0.12);

// Slightly smaller text on small screens
const titleSize = window.innerWidth < 600 ? 24 : 32;
const bodySize  = window.innerWidth < 600 ? 13 : 14;

// Title
drawText(slide.title, cx, titleY, titleSize, "center", "#fff", TITLE_FONT);

// Wrapped body text
drawWrappedText(
  slide.text,
  cx,
  textY,
  boxW - 60,
  20,
  bodySize,
  "center",
  "#fff",
  BASE_FONT
);


  // simple click hitbox (optional)
  state._tutorialUI = { x: bx, y: by, w: boxW, h: boxH };
}

function pickRandomTrackName(prefix, lastName, indexMax) {
  // pick a random numbered track, avoid repeating last track when possible
  // e.g. prefix="daytime_outdoor" -> "daytime_outdoor7"
  const max = Math.max(1, indexMax | 0);
  let tries = 12;

  while (tries-- > 0) {
    const n = 1 + Math.floor(Math.random() * max);
    const name = `${prefix}${n}`;
    if (name !== lastName || max === 1) return name;
  }
  return `${prefix}1`;
}

function playRandomMusicForContext(force = false, allowRetry = false) {
  if (!state.music.enabled) return;
  if (!state.music.unlocked) return;

  const a = ensureMusicAudio();

  // Use pending context if updateMusic set it; otherwise compute now
  const ctxKey = state.music.pendingCtxKey || getMusicContextKey();

  // If we're not forcing, and we're already in the right context and playing, do nothing
  if (!force && state.music.contextKey === ctxKey && !a.paused) return;

  // If we're already switching, don't restart the switch over and over.
  // Just remember the latest desired context and bail.
  if (state.music.switching) {
    state.music.pendingCtxKey = ctxKey;
    return;
  }

  // Lock switching so updateMusic won't spam this during the fade
  state.music.switching = true;

  // IMPORTANT: set context immediately so updateMusic stops retriggering
  state.music.contextKey = ctxKey;
  state.music.pendingCtxKey = null;

  let nextName;

if (ctxKey === "title") {
  // single, fixed title track: src/music/title.mp3
  nextName = "title";
} else {
  const prefix = `${ctxKey}`;
  nextName = pickRandomTrackName(prefix, state.music.lastTrack, state.music.indexMax);
}

state.music.lastTrack = nextName;

  const startNewTrack = () => {
    // Set source. If you implemented setMusicSource() (mp3/wav/ogg), use it.
    if (typeof setMusicSource === "function") {
      setMusicSource(a, nextName);
    } else {
      a.src = `src/music/${nextName}.mp3`;
      a.load();
    }

    a.currentTime = 0;

// Title: start immediately (no fade) + louder
// Others: start silent and fade in normally
const isTitle = (ctxKey === "title");

a.volume = isTitle
  ? Math.min(1, getMusicVolume() * 3.0)  // <-- volume boost (change 2.0 to taste)
  : 0;

a.muted = false;

a.play().then(() => {
  if (!isTitle) {
    beginFadeTo(getMusicVolume(), state.music.fadeMs);
  }

      // Switching complete
      state.music.switching = false;

      // If context changed while we were switching, queue a new switch next tick
      const desired = getMusicContextKey();
      if (desired !== state.music.contextKey) {
        state.music.pendingCtxKey = desired;
      }
    }).catch((err) => {
      console.warn("[MUSIC] play() rejected:", err);

      // Switching complete (even if failed)
      state.music.switching = false;

      // If this failed because file missing, try another track once
      if (!allowRetry) {
        // Keep same context; just pick again
        state.music.pendingCtxKey = state.music.contextKey;
        playRandomMusicForContext(true, true);
      }
    });
  };

  // If something is currently playing, fade it out first, then switch
  if (!a.paused && a.currentTime > 0) {
    beginFadeTo(0, state.music.fadeMs, () => {
      a.pause();
      startNewTrack();
    });
  } else {
    startNewTrack();
  }
}

function updateMusic(dt) {
  if (!state.music.enabled) return;
  if (!state.music.unlocked) return;

  tickMusicFade();
  tickAmbienceFade();

  // --- MUSIC switching ---
  const ctxKey = getMusicContextKey();

  if (state.music.switching) {
    state.music.pendingCtxKey = ctxKey;
  } else if (ctxKey !== state.music.contextKey) {
    state.music.pendingCtxKey = ctxKey;
    playRandomMusicForContext(true);
  }

  // --- AMBIENCE switching (day/night) ---
  if (state.music.ambienceEnabled) {
    const ambKey = getAmbienceKey();

    if (state.music.ambSwitching) {
      state.music.pendingAmbKey = ambKey;
      return;
    }

    if (ambKey && ambKey !== state.music.ambienceKey) {
      state.music.pendingAmbKey = ambKey;
      playAmbienceForContext(true);
    }
  }
}

function withSfx(sfx, fn) {
  return () => {
    // Play unless the callback explicitly says "no"
    const ok = fn?.();
    if (ok !== false) playSound(sfx);
    return ok;
  };
}

function playFootstep() {
  const steps = ["footstepsoutdoor1", "footstepsoutdoor2", "footstepsoutdoor3", "footstepsoutdoor4", "footstepsoutdoor5", "footstepsoutdoor6", "footstepsoutdoor7", "footstepsoutdoor8", "footstepsoutdoor9", "footstepsoutdoor10"];
  playSound(steps[Math.floor(Math.random() * steps.length)]);
}

loadSound("chop", "chop_wood.mp3", 0.25);
loadSound("chest", "chest.mp3", 0.5);
loadSound("pickup", "collect.mp3", 0.6);
loadSound("cook", "cook.mp3", 0.4);
loadSound("cow", "cow.mp3", 0.5);
loadSound("fishingreel", "fishing_reel.mp3", 0.5);
loadSound("hammer", "hammer.mp3", 0.5);
loadSound("water", "water_droplet.mp3", 0.5);
loadSound("pickaxe", "pickaxe.mp3", 0.5);
loadSound("harvest", "rustling.mp3", 0.5);
loadSound("saw", "saw.mp3", 0.5);
loadSound("footstepsindoor", "footsteps_indoor.mp3", 0.25);
loadSound("footstepsoutdoor1", "footsteps_outdoor1.mp3", 0.25);
loadSound("footstepsoutdoor2", "footsteps_outdoor2.mp3", 0.25);
loadSound("footstepsoutdoor3", "footsteps_outdoor3.mp3", 0.25);
loadSound("footstepsoutdoor4", "footsteps_outdoor4.mp3", 0.25);
loadSound("footstepsoutdoor5", "footsteps_outdoor5.mp3", 0.25);
loadSound("footstepsoutdoor6", "footsteps_outdoor6.mp3", 0.25);
loadSound("footstepsoutdoor7", "footsteps_outdoor7.mp3", 0.25);
loadSound("footstepsoutdoor8", "footsteps_outdoor8.mp3", 0.25);
loadSound("footstepsoutdoor9", "footsteps_outdoor9.mp3", 0.25);
loadSound("footstepsoutdoor10", "footsteps_outdoor10.mp3", 0.25);
loadSound("message", "message.mp3", 0.5);
loadSound("notification", "notification.mp3", 0.5);
loadSound("interact", "interact.mp3", 0.5);
loadSound("achievement", "achievement.mp3", 0.25);
loadSound("hunt", "arrow.mp3", 0.5);
loadSound("fillwater", "fill_water.mp3", 0.4);
loadSound("fireburning", "fire.mp3", 0.5);
loadSound("lightfire", "fire_start.mp3", 0.5);
loadSound("extinguish", "extinguish.mp3", 0.5);
loadSound("dig", "dig.mp3", 0.5);
loadSound("day", "day.mp3", 0.15);
loadSound("night", "night.mp3", 0.3);
loadSound("cat", "cat.mp3", 0.4);
loadSound("eat", "eat.mp3", 0.5);
loadSound("click", "click.mp3", 0.75);
loadSound("pop", "pop.mp3", 0.4);
loadSound("unlock", "unlock.mp3", 0.4);

// ----------------------------------------------------------------------------------- WORLD GENERATION ----
function emptyMap(w, h, fillTile) {
  const tiles = Array.from({ length: h }, () => Array.from({ length: w }, () => fillTile));
  const objects = Array.from({ length: h }, () => Array.from({ length: w }, () => null));
  return { tiles, objects };
}

const iconImageCache = {};

function getIconImage(src) {
  if (!iconImageCache[src]) {
    const img = new Image();
    img.src = src;
    iconImageCache[src] = img;
  }
  return iconImageCache[src];
}

function emptyExplored(w, h) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => false));
}

function growBlob(map, w, h, tileId, seeds, steps) {
  const frontier = [...seeds];
  for (const [sx, sy] of seeds) map.tiles[sy][sx] = tileId;

  for (let i = 0; i < steps; i++) {
    const idx = randInt(0, frontier.length - 1);
    const [x, y] = frontier[idx];
    const [nx, ny] = neighbors4(x, y)[randInt(0, 3)];
    if (!inBounds(nx, ny, w, h)) continue;
    if (map.tiles[ny][nx] !== tileId) {
      map.tiles[ny][nx] = tileId;
      frontier.push([nx, ny]);
    }
  }
}

function placeObjects(map, w, h, objectId, allowTiles, count) {
  let placed = 0;
  while (placed < count) {
    const x = randInt(1, w - 2);
    const y = randInt(1, h - 2);
    if (map.objects[y][x]) continue;
    if (!allowTiles.includes(map.tiles[y][x])) continue;
    map.objects[y][x] = { id: objectId, hp: objDef(objectId)?.hp ?? 1, meta: {} };
    placed++;
  }
}

function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function isMovingAnimalDef(def) {
  // "hunt" animals: you said you tag them hunt; also support an explicit ai flag
  if (!def) return false;
  if (def.ai === "animal") return true;
  if (Array.isArray(def.tags) && def.tags.includes("hunt")) return true;

  // fallback: anything that requires bow_and_arrow to harvest is "huntable" and should move
  const h = def.hunt || def.harvest;
  if (h && h.requiresTool === "bow_and_arrow") return true;

  return false;
}

function isHuntableDef(def) {
  if (!def) return false;
  if (Array.isArray(def.tags) && def.tags.includes("hunt")) return true;
  const h = def.hunt || def.harvest;
  return !!h && h.requiresTool === "bow_and_arrow";
}

function isOccupiedByPlayer(x, y) {
  return state.players.some(p => p.x === x && p.y === y && state.mode === "overworld");
}

function isPassableForAnimal(x, y) {
  const { w, h } = currentDims();
  if (!inBounds(x, y, w, h)) return false;

  const t = tileAt(x, y);
  if (!isWalkableTile(t)) return false;

  if (objectAt(x, y)) return false;
  if (isOccupiedByPlayer(x, y)) return false;
  if (state.mode === "overworld" && typeof structureTileAt === "function" && structureTileAt(x, y)) return false;   // not inside a house

  return true;
}

function getSpawnables() {
  return Object.values(state.data.objects)
    .filter(d => d?.spawn?.enabled)
    .map(d => ({ id: d.id, spawn: d.spawn }));
}

function countObjectsOnOverworld(objectId) {
  const map = state.world;
  let n = 0;
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      if (map.objects[y][x]?.id === objectId) n++;
    }
  }
  return n;
}

function isSpawnTileAllowed(tileId, spawn) {
  if (!spawn?.tiles || spawn.tiles.length === 0) return true;
  return spawn.tiles.includes(tileId);
}

function findRandomEmptyTileForSpawn(spawn) {
  for (let tries = 0; tries < 140; tries++) {
    const x = randInt(1, WORLD_W - 2);
    const y = randInt(1, WORLD_H - 2);

    if (state.world.objects[y][x]) continue;
    if (state.players.some(p => p.x === x && p.y === y)) continue;
    if (typeof structureTileAt === "function" && structureTileAt(x, y)) continue;   // nothing grows inside a house

    const tileId = state.world.tiles[y][x];
    if (!isSpawnTileAllowed(tileId, spawn)) continue;

    return { x, y };
  }
  return null;
}

function updateCampfires(dt) {
	if (state.net?.enabled) return; // TEMP

  const map = state.world;
  if (!map?.objects) return;

  for (let y = 0; y < WORLD_H; y++) {
    const row = map.objects[y];
    if (!row) continue;

    for (let x = 0; x < WORLD_W; x++) {
      const obj = row[x];
      if (!obj || obj.id !== "campfire") continue;

      const prev = obj.meta?.fireT ?? 0;
      if (prev <= 0) continue;

      const next = Math.max(0, prev - dt);
      obj.meta.fireT = next;      // burnt out: the stone ring stays so it can be lit again with wood
      if (next <= 0) playSound("extinguish");
    }
  }
}

function updateSpawns(dt) {
// In co-op: only the host runs spawns (other client would double-spawn).
if (state.net?.enabled && !state.net.isHost) return;

  if (state.mode !== "overworld") return;

  const map = state.world;

  // pulse 4x/sec so we’re not doing extra work every frame
  map._spawnPulse = (map._spawnPulse ?? 0) + dt;
  if (map._spawnPulse < 0.25) return;
  map._spawnPulse = 0;

  const spawnables = getSpawnables();
  if (!spawnables.length) return;

  map._spawnCd = map._spawnCd || {};

  for (const s of spawnables) {
    const interval = Math.max(0.5, s.spawn.intervalSec ?? 10);

    map._spawnCd[s.id] = (map._spawnCd[s.id] ?? (Math.random() * interval)) - 0.25;
    if (map._spawnCd[s.id] > 0) continue;
    map._spawnCd[s.id] = interval;

    const max = Math.max(1, s.spawn.max ?? 20);
    const cur = countObjectsOnOverworld(s.id);
    if (cur >= max) continue;

    // density-aware chance
    const baseChance = s.spawn.chance ?? 0.25;
    const falloff = Math.max(1, s.spawn.falloff ?? 2);

    const density = Math.min(1, Math.max(0, cur / max));
    const mult = Math.pow(1 - density, falloff);
    const effectiveChance = baseChance * mult;

const min = Math.max(0, s.spawn.min ?? 0);
if (cur < min) {
  // force spawn when under minimum
  // (still respects interval + tile rules)
  // skip chance roll
} else {
  if (Math.random() > effectiveChance) continue;
}

    if (Math.random() > effectiveChance) continue;

    const spot = findRandomEmptyTileForSpawn(s.spawn);
    if (!spot) continue;

    map.objects[spot.y][spot.x] = {
      id: s.id,
      hp: objDef(s.id)?.hp ?? 1,
      meta: {}
    };
  }
}

// ---- Animal senses + sneaking ----------------------------------------------------------------------------------
// Animals see only what is in front of them (a cone, blocked by trees/rocks/walls) but hear all around. The chance of being heard
// rises with every tile closer, is far lower while crouched, and is lowest of all when standing still.
const ANIMAL_SIGHT_RADIUS = 3.5;                       // tiles
const ANIMAL_SIGHT_HALF_ANGLE = Math.PI / 3;         // 120 degree field of view
const ANIMAL_HEAR_RADIUS = 5;                        // tiles
const ANIMAL_ALERT_MS = 2000;                        // how long an animal that spotted you keeps running
const SNEAK_SPEED_MULT = 0.45;                       // crouched walking is slower
const BOW_MAX_RANGE = 8;                             // tiles (and the target must be on screen)

function setSneak(idx, on, broadcast = true) {
  const pl = state.players[idx];
  if (!pl) return;
  pl.sneak = !!on;
  if (on) pl.resting = false;
  if (broadcast) sendWorldOp({ kind: "sneak", idx, on: !!on });   // the host runs the animals, so it needs to know
}
function toggleSneak(idx = state.activePlayer) { setSneak(idx, !state.players[idx]?.sneak); }

// ---- Poses: sitting in a chair, lying in a bed (drawn by src/render3d/index.js from player.pose) ----
const SEAT_CATS = new Set(["Chairs", "Sofas"]);
function setPose(idx, pose, broadcast = true) {
  const pl = state.players[idx];
  if (!pl) return;
  pl.pose = pose ? { ...pose, px: pl.x, py: pl.y } : null;
  if (pose) { pl.resting = false; pl.sneak = false; pl.path = []; }
  if (broadcast) sendWorldOp({ kind: "pose", idx, pose: pose ? { kind: pose.kind, tx: pose.tx, ty: pose.ty, yaw: pose.yaw } : null });
}
/** Sitting ends when the player walks off; sleeping ends on its own when the night is over. */
function tickPoses() {
  for (const [i, pl] of state.players.entries()) {
    const ps = pl?.pose; if (!ps || ps.kind === "sleep") continue;
    if (pl.x !== ps.px || pl.y !== ps.py || pl.path?.length) setPose(i, null, i === state.activePlayer);
  }
}
function sitOn(idx, x, y) {
  const o = state.world.objects?.[y]?.[x];
  setPose(idx, { kind: "sit", tx: x, ty: y, yaw: ((o?.meta?.rot | 0) * Math.PI) / 2 });
  logAction(`${state.players[idx].name} sat down.`);
}

// is the bow allowed to reach this tile? within BOW_MAX_RANGE and visible on the screen
function bowCanReach(mapX, mapY) {
  const p = activePlayer(), d = Math.hypot(p.x - mapX, p.y - mapY);
  if (d > BOW_MAX_RANGE) return false;
  const r3 = window.__r3d;
  if (state.view3d && r3?.camera && r3.THREE) {
    const wx = (mapX + 0.5) * 2, wz = (mapY + 0.5) * 2;
    const v = new r3.THREE.Vector3(wx, (r3.terrain?.heightAt?.(wx, wz) ?? 0) + 0.5, wz).project(r3.camera);
    return v.z < 1 && Math.abs(v.x) <= 0.92 && v.y >= -0.72 && v.y <= 0.92;   // (the bottom strip is under the HUD dock)
  }
  return d <= 6;
}

function trackPlayerNoise(now) {
  for (const p of state.players) {
    const key = `${(p.fx ?? p.x).toFixed(2)},${(p.fy ?? p.y).toFixed(2)}`;
    if (p._noiseKey !== key) { p._noiseKey = key; p._lastMoveAt = now; }
  }
}

function animalLineClear(map, x0, y0, x1, y1, dungeon) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 1; i < n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
    if (dungeon && map.tiles?.[y]?.[x] !== "floor") return false;
    const o = map.objects?.[y]?.[x];
    if (o && objectBlocks(o.id) && !(objDef(o.id)?.tags || []).includes("animal")) return false;
    if (!dungeon && typeof structureTileAt === "function" && structureTileAt(x, y)) return false;
  }
  return true;
}

// "seen" | "heard" | null. Also turns the animal toward a noise it heard.
function animalPerceive(m, x, y, map, dungeon, now) {
  if (m.fx == null) { const a = Math.random() * Math.PI * 2; m.fx = Math.sin(a); m.fy = Math.cos(a); }
  const fl = Math.hypot(m.fx, m.fy) || 1;
  let chance = 0, heardFrom = null;
  for (const p of state.players) {
    const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
    if (d > ANIMAL_HEAR_RADIUS) continue;
    if (d <= ANIMAL_SIGHT_RADIUS) {
      const dot = d === 0 ? 1 : (dx * m.fx + dy * m.fy) / (d * fl);
      if (dot >= Math.cos(ANIMAL_SIGHT_HALF_ANGLE) && animalLineClear(map, x, y, p.x, p.y, dungeon)) return "seen";
    }
    const moving = now - (p._lastMoveAt || 0) < 400;
    const noise = moving ? (p.sneak ? 0.22 : 1) : (p.sneak ? 0.01 : 0.08);
    const c = noise * (1 - d / ANIMAL_HEAR_RADIUS);
    if (c > chance) { chance = c; heardFrom = [dx, dy, d]; }
  }
  if (heardFrom && now >= (m.hearAt || 0)) {
    m.hearAt = now + 450;
    if (Math.random() < chance) { m.fx = heardFrom[0] / (heardFrom[2] || 1); m.fy = heardFrom[1] / (heardFrom[2] || 1); return "heard"; }
  }
  return null;
}

// What an animal does this tick: the tile it steps to, or null to stay put. Keeps its facing / alert state on obj.meta.
function animalThink(obj, x, y, map, dungeon, canMoveTo, dt) {
  const m = obj.meta = obj.meta || {}, now = Date.now();
  const sense = animalPerceive(m, x, y, map, dungeon, now);
  if (sense === "seen") m.alertUntil = now + ANIMAL_ALERT_MS;
  else if (sense === "heard") m.freezeUntil = now + 800;      // stops and turns toward the sound
  const alerted = now < (m.alertUntil || 0);
  m.run = alerted ? 1 : 0;                                      // the 3D view runs the animal faster while it flees

  let nearest = null, nearestD = Infinity;
  for (const p of state.players) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < nearestD) { nearestD = d; nearest = p; }
  }

  if (alerted && nearest) {
    if (now < (m.fleeAt || 0)) return null;
    m.fleeAt = now + 260;
  } else {
    if (now < (m.freezeUntil || 0)) return null;
    m.moveCd = (m.moveCd ?? (Math.random() * 0.4)) - dt;
    if (m.moveCd > 0) return null;
    m.moveCd = 0.25 + Math.random() * 0.35;
    if (Math.random() < 0.55) {                                // idle: now and then look somewhere else
      if (Math.random() < 0.3) { const a = Math.random() * Math.PI * 2; m.fx = Math.sin(a); m.fy = Math.cos(a); }
      return null;
    }
  }

  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let candidates = [], bestScore = -Infinity;
  for (const [dx, dy] of dirs) {
    const nx = x + dx, ny = y + dy;
    if (!canMoveTo(nx, ny)) continue;
    if (!(alerted && nearest)) { candidates.push([nx, ny]); continue; }
    const score = Math.hypot(nx - nearest.x, ny - nearest.y);   // fleeing: the step that gets furthest from the nearest player
    if (score > bestScore + 1e-6) { bestScore = score; candidates = [[nx, ny]]; }
    else if (Math.abs(score - bestScore) <= 1e-6) candidates.push([nx, ny]);
  }
  if (!candidates.length) return null;
  const [nx, ny] = candidates[Math.floor(Math.random() * candidates.length)];
  m.fx = nx - x; m.fy = ny - y;
  return [nx, ny];
}

// ---- The cat: curious, then fond, then off ----
// It notices a player nearby, trots over, follows for a while (and may hop onto a table, counter, bed or chair beside them),
// then bolts off and ignores everyone for a bit. A cat on furniture keeps its own tile; meta.perch says which piece it sits on
// and the 3D view draws it there. Everything lives on obj.meta so the other player sees the same cat.
const CAT_NOTICE_RADIUS = 7;
const CAT_FOLLOW_MS = [16000, 28000];
const CAT_SHY_MS = [30000, 55000];
const CAT_PERCH_MS = [9000, 20000];
const CAT_PET_MS = 2400;
const SURFACE_BY_CAT = { Tables: 0.78, Chairs: 0.5, Sofas: 0.5, Beds: 0.62, Drawers: 0.8 };
const SURFACE_BY_ID = { workbench: 0.95, counter: 0.92, cupboard: 0.92, bed: 0.62, dresser: 0.8, sink: 0.92, chair_left: 0.5, chair_right: 0.5 };
const rand = (a, b) => a + Math.random() * (b - a);

/** How high (m) the top of the piece of furniture on this tile is, or null when a cat cannot sit on it. */
function catSurfaceHeight(x, y) {
  const o = state.world?.objects?.[y]?.[x]; if (!o) return null;
  if (SURFACE_BY_ID[o.id] != null) return SURFACE_BY_ID[o.id];
  const f = state.data?.furniture?.[o.id]; if (!f) return null;
  if (f.cat === "Kitchen") return /counter|cupboard|sink/i.test(f.name) ? 0.92 : null;
  return SURFACE_BY_CAT[f.cat] ?? null;
}
function catSurfaceTaken(x, y, self) {
  if (state.players.some(p => p.pose?.tx === x && p.pose?.ty === y)) return true;     // someone is sitting / sleeping there
  const w = state.world; if (!w?.objects) return false;
  for (let yy = Math.max(0, y - 2); yy <= Math.min(w.objects.length - 1, y + 2); yy++)
    for (let xx = Math.max(0, x - 2); xx <= Math.min(w.objects[0].length - 1, x + 2); xx++) {
      const o = w.objects[yy][xx]; if (o && o !== self && o.id === "cat" && o.meta?.perch?.x === x && o.meta?.perch?.y === y) return true;
    }
  return false;
}
function catCanStep(ax, ay, bx, by) {
  const { w, h } = currentDims();
  if (!inBounds(bx, by, w, h) || !isWalkableTile(tileAt(bx, by))) return false;
  if (objectAt(bx, by) || isOccupiedByPlayer(bx, by)) return false;
  if (typeof structureBlocksStep === "function" && structureBlocksStep(ax, ay, bx, by)) return false;   // walls and shut doors; an open door lets it into a house
  return true;
}
/** First step of a short breadth-first walk to within `gap` tiles of (tx,ty); null when there is no way. */
function catStepToward(x, y, tx, ty, gap = 1) {
  const key = (a, b) => a + "," + b, start = key(x, y), prev = new Map([[start, null]]), q = [[x, y]];
  for (let i = 0; i < q.length && i < 500; i++) {
    const [cx, cy] = q[i];
    if (Math.hypot(cx - tx, cy - ty) <= gap && (cx !== x || cy !== y)) {
      let k = key(cx, cy);
      while (prev.get(k) && prev.get(k) !== start) k = prev.get(k);
      return k.split(",").map(Number);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, k = key(nx, ny); if (prev.has(k) || !catCanStep(cx, cy, nx, ny)) continue; prev.set(k, key(cx, cy)); q.push([nx, ny]); }
  }
  return null;
}
function catLapTaken(i, self) {
  const w = state.world; if (!w?.objects) return false;
  for (const row of w.objects) for (const o of row) if (o && o !== self && o.id === "cat" && o.meta?.perch?.lap === i) return true;
  return false;
}
function catTryPerch(m, x, y, self, now) {
  const opts = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const h = catSurfaceHeight(x + dx, y + dy);
    if (h != null && !catSurfaceTaken(x + dx, y + dy, self) && !(typeof structureBlocksStep === "function" && structureBlocksStep(x, y, x + dx, y + dy))) opts.push({ x: x + dx, y: y + dy, h });
  }
  if (!opts.length) return false;
  m.perch = opts[Math.floor(Math.random() * opts.length)]; m.perchUntil = now + rand(...CAT_PERCH_MS);
  m.fx = m.perch.x - x; m.fy = m.perch.y - y;
  return true;
}
/** Returns { step: [x, y] | null, changed } for this tick. */
function catThink(obj, x, y, dt) {
  const m = obj.meta = obj.meta || {}, now = Date.now(), snap = () => JSON.stringify([m.mode, m.perch, m.petUntil, m.run]), before = snap();
  m.run = 0;
  let near = null;
  for (const p of state.players) { const d = Math.hypot(p.x - x, p.y - y); if (!near || d < near.d) near = { p, d }; }
  const face = () => { if (near && near.d > 0) { m.fx = near.p.x - x; m.fy = near.p.y - y; } };
  const done = (step = null) => ({ step, changed: snap() !== before });

  if (now < (m.petUntil || 0)) { face(); return done(); }                                     // being petted: stays put

  if (m.perch) {
    const lap = m.perch.lap, sp = lap != null ? state.players[lap]?.pose : null;
    if (lap != null && !(sp?.kind === "sit" && sp.tx === m.perch.x && sp.ty === m.perch.y)) { m.perch = null; m.lapCool = now + 8000; m.moveCd = 0.4; }   // they got up: down it hops
    else if (catSurfaceHeight(m.perch.x, m.perch.y) == null || now > (m.perchUntil || 0)) { m.perch = null; m.perchCool = now + 20000; m.lapCool = now + 20000; m.moveCd = 0.5; }   // the piece is gone, or it is time to hop down
    else { if (lap == null && near && near.d <= 4) face(); return done(); }
  }

  // someone sat down nearby: the cat wants their lap
  if (m.mode !== "leave" && now > (m.lapCool || 0)) {
    let sit = null, sd = 1e9;
    state.players.forEach((p, i) => { const ps = p.pose; if (ps?.kind !== "sit") return; const d = Math.hypot(ps.tx - x, ps.ty - y); if (d <= 8 && d < sd && !catLapTaken(i, obj)) { sit = { p, i }; sd = d; } });
    if (sit) {
      const ps = sit.p.pose, adjacent = Math.abs(ps.tx - x) + Math.abs(ps.ty - y) === 1 && !(typeof structureBlocksStep === "function" && structureBlocksStep(x, y, ps.tx, ps.ty));
      if (adjacent) {
        m.perch = { x: ps.tx, y: ps.ty, h: 0.62, lap: sit.i, yaw: ps.yaw }; m.perchUntil = now + rand(25000, 45000);
        m.mode = "follow"; m.followUntil = m.perchUntil + 6000; m.fx = Math.sin(ps.yaw); m.fy = Math.cos(ps.yaw);
        return done();
      }
      m.mode = "approach"; m.followUntil = Math.max(m.followUntil || 0, now + 12000); m.run = sd > 5 ? 1 : 0;
      if (now < (m.stepAt || 0)) return done();
      m.stepAt = now + (m.run ? 260 : 480);
      const st = catStepToward(x, y, ps.tx, ps.ty, 1);
      if (st) { m.fx = st[0] - x; m.fy = st[1] - y; return done(st); }
      return done();
    }
  }

  if (!m.mode) m.mode = "wander";
  if (m.mode === "wander" && near && near.d <= CAT_NOTICE_RADIUS && now > (m.shyUntil || 0)) {
    m.mode = "approach"; m.followUntil = now + rand(...CAT_FOLLOW_MS);
    if (now > (m.meowAt || 0)) { m.meowAt = now + 20000; playSound("cat"); }
  }
  if ((m.mode === "approach" || m.mode === "follow") && (!near || now > m.followUntil)) { m.mode = "leave"; m.leaveUntil = now + 4500; m.shyUntil = now + rand(...CAT_SHY_MS); }

  if (m.mode === "leave") {
    if (now > m.leaveUntil || !near) { m.mode = "wander"; return done(); }
    m.run = 1;
    if (now < (m.stepAt || 0)) return done();
    m.stepAt = now + 260;
    let best = null, bd = -1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!catCanStep(x, y, nx, ny)) continue; const d = Math.hypot(nx - near.p.x, ny - near.p.y) + Math.random() * 0.4; if (d > bd) { bd = d; best = [nx, ny]; } }
    if (best) { m.fx = best[0] - x; m.fy = best[1] - y; }
    return done(best);
  }

  if (m.mode === "approach" || m.mode === "follow") {
    if (near.d > 2.2) {
      m.mode = "approach"; m.run = near.d > 5 ? 1 : 0;
      if (now < (m.stepAt || 0)) return done();
      m.stepAt = now + (m.run ? 260 : 480);
      const st = catStepToward(x, y, near.p.x, near.p.y, 1.5);
      if (st) { m.fx = st[0] - x; m.fy = st[1] - y; return done(st); }
      return done();
    }
    m.mode = "follow"; face();                                                                 // close enough: lingers beside them
    m.moveCd = (m.moveCd ?? 0.5) - dt;
    if (m.moveCd > 0) return done();
    m.moveCd = rand(0.5, 1.4);
    if (now > (m.perchCool || 0) && Math.random() < 0.3 && catTryPerch(m, x, y, obj, now)) return done();
    if (Math.random() < 0.25) {                                                                // shifts a step or two, but stays near
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([nx, ny]) => catCanStep(x, y, nx, ny) && Math.hypot(nx - near.p.x, ny - near.p.y) <= 2.5);
      if (opts.length) { const st = opts[Math.floor(Math.random() * opts.length)]; m.fx = st[0] - x; m.fy = st[1] - y; return done(st); }
    }
    return done();
  }

  // wander: slow ambling, and now and then up onto something
  m.moveCd = (m.moveCd ?? Math.random()) - dt;
  if (m.moveCd > 0) return done();
  m.moveCd = rand(0.7, 1.8);
  if (now > (m.perchCool || 0) && Math.random() < 0.12 && catTryPerch(m, x, y, obj, now)) return done();
  if (Math.random() < 0.4) { const a = Math.random() * Math.PI * 2; m.fx = Math.sin(a); m.fy = Math.cos(a); return done(); }
  const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([nx, ny]) => catCanStep(x, y, nx, ny));
  if (!opts.length) return done();
  const st = opts[Math.floor(Math.random() * opts.length)]; m.fx = st[0] - x; m.fy = st[1] - y;
  return done(st);
}
/** A player pets the cat (the host's cat AI and the 3D view both read petUntil off the object). */
function petCat(x, y, plIdx = state.activePlayer | 0) {
  const o = state.world?.objects?.[y]?.[x]; if (!o || o.id !== "cat") return false;
  const p = state.players[plIdx], m = { ...(o.meta || {}) }, now = Date.now();
  m.petUntil = now + CAT_PET_MS; m.fx = p.x - x; m.fy = p.y - y; m.mode = "follow"; m.followUntil = Math.max(m.followUntil || 0, now + 12000); m.shyUntil = 0;
  setOverworldObject(x, y, { ...o, meta: m });
  return true;
}
/** The cat sitting on the furniture at (x, y), if any: the x, y of its own tile. */
function catPerchedOn(x, y) {
  const w = state.world; if (!w?.objects) return null;
  for (let yy = Math.max(0, y - 2); yy <= Math.min(w.objects.length - 1, y + 2); yy++)
    for (let xx = Math.max(0, x - 2); xx <= Math.min(w.objects[0].length - 1, x + 2); xx++) { const o = w.objects[yy][xx]; if (o?.id === "cat" && o.meta?.perch?.x === x && o.meta?.perch?.y === y) return { x: xx, y: yy }; }
  return null;
}

function updateAnimals(dt) {
// Online: only host simulates animals (prevents double-moves + desync)
if (state.net?.enabled && !state.net.isHost) return;
trackPlayerNoise(Date.now());

  // =========================
  // DUNGEON: only rats wander
  // =========================
  if (state.mode === "dungeon") {
    const map = state.dungeon;
    if (!map?.tiles?.length || !map?.objects?.length) return;

    const H = map.tiles.length;
    const W = map.tiles[0].length;

    // throttle movement so rats don’t jitter every frame
    map._animalTick = (map._animalTick ?? 0) + dt;
    if (map._animalTick < 0.18) return;
    map._animalTick = 0;

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    const playerOccupied = new Set(state.players.map(p => `${p.x},${p.y}`));
    const isFloor = (x, y) => map.tiles?.[y]?.[x] === "floor";

    const canMove = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      if (!isFloor(x, y)) return false;
      if (playerOccupied.has(`${x},${y}`)) return false;

      const o = map.objects?.[y]?.[x];
      if (!o) return true;
      return !objectBlocks(o.id);
    };

    // scan grid for rats
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const obj = map.objects[y][x];
        if (!obj) continue;

        if (obj.id !== "rat1" && obj.id !== "rat2") continue;

        const step = animalThink(obj, x, y, map, true, canMove, dt);
        if (!step) continue;
        const [nx, ny] = step;

        map.objects[ny][nx] = obj;
        map.objects[y][x] = null;
      }
    }

    return;
  }

  // =========================
  // OVERWORLD: existing logic
  // =========================
  if (state.mode !== "overworld") return;

  const { w, h } = currentDims();
  const map = state.world;

  // throttle movement so animals don’t jitter every frame
  map._animalTick = (map._animalTick ?? 0) + dt;
  if (map._animalTick < 0.18) return;
  map._animalTick = 0;

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  // scan grid for animals
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const obj = map.objects[y][x];
      if (!obj) continue;

      const def = objDef(obj.id);
      if (def?.ai === "cat") {
        const r = catThink(obj, x, y, dt);
        if (r.step) { setOverworldObject(r.step[0], r.step[1], obj); setOverworldObject(x, y, null); }
        else if (r.changed) setOverworldObject(x, y, { ...obj, meta: { ...obj.meta } });   // perched / petted: tell everyone
        continue;
      }
      if (!isMovingAnimalDef(def)) continue;

      const step = animalThink(obj, x, y, map, false, isPassableForAnimal, dt);
      if (!step) continue;
      const [nx, ny] = step;

// move object (broadcast both tiles so everyone sees it)
setOverworldObject(nx, ny, obj);
setOverworldObject(x, y, null);
    }
  }
}

function surroundWithWater(map) {
  for (let x = 0; x < WORLD_W; x++) {
    map.tiles[0][x] = "water";
    map.tiles[WORLD_H - 1][x] = "water";
    map.objects[0][x] = null;
    map.objects[WORLD_H - 1][x] = null;
  }
  for (let y = 0; y < WORLD_H; y++) {
    map.tiles[y][0] = "water";
    map.tiles[y][WORLD_W - 1] = "water";
    map.objects[y][0] = null;
    map.objects[y][WORLD_W - 1] = null;
  }
}

// Shapes the outer edge of a new world into an island: land inside a wobbly, slightly squared-off coastline, sea outside it.
// (Size stays 80x80: the server and ~80 places here share that number.) Existing saved worlds are left as they are.
function carveIsland(map) {
  const cx = (WORLD_W - 1) / 2, cy = (WORLD_H - 1) / 2, ph = Array.from({ length: 6 }, () => Math.random() * Math.PI * 2);
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const dx = (x - cx) / (WORLD_W / 2), dy = (y - cy) / (WORLD_H / 2);
      const n = Math.pow(Math.pow(Math.abs(dx), 3) + Math.pow(Math.abs(dy), 3), 1 / 3);          // squarish superellipse distance from the centre
      const a = Math.atan2(dy, dx);
      const coast = 0.86 + 0.055 * Math.sin(2 * a + ph[0]) + 0.045 * Math.sin(3 * a + ph[1]) + 0.03 * Math.sin(5 * a + ph[2]) + 0.02 * Math.sin(8 * a + ph[3])
        + 0.03 * Math.sin(x * 0.42 + ph[4]) * Math.sin(y * 0.37 + ph[5]);                          // bays and headlands, then tile-scale roughness
      if (n > coast) map.tiles[y][x] = "water";
    }
  }
}

function generateOverworld() {
  const map = emptyMap(WORLD_W, WORLD_H, "grass");
  carveIsland(map);

  // some water blobs
  const waterSeeds = Array.from({ length: 3 }, () => [randInt(3, WORLD_W - 4), randInt(3, WORLD_H - 4)]);
  for (const [sx, sy] of waterSeeds) {
    growBlob(map, WORLD_W, WORLD_H, "water", [[sx, sy]], randInt(100, 200));
  }

  // sand near water
  for (let y = 1; y < WORLD_H - 1; y++) {
    for (let x = 1; x < WORLD_W - 1; x++) {
      if (map.tiles[y][x] !== "grass") continue;
      const nearWater = neighbors4(x, y).some(([nx, ny]) =>
        inBounds(nx, ny, WORLD_W, WORLD_H) && map.tiles[ny][nx] === "water"
      );
      if (nearWater && Math.random() < 0.55) map.tiles[y][x] = "sand";
    }
  }

// ---- Fish along coastlines ----
for (let y = 1; y < WORLD_H - 1; y++) {
  for (let x = 1; x < WORLD_W - 1; x++) {
    if (map.tiles[y][x] !== "water") continue;

    const nearLand = neighbors4(x, y).some(([nx, ny]) =>
      inBounds(nx, ny, WORLD_W, WORLD_H) && map.tiles[ny][nx] !== "water"
    );

    if (nearLand && Math.random() < 0.18) {
      map.objects[y][x] = { id: "fish_spot", hp: 1, meta: {} };
    }
  }
}

  // -------------------------------------------------------------------------------- MAP RESOURCES ----
  placeObjects(map, WORLD_W, WORLD_H, "tree1", ["grass"], 20);
  placeObjects(map, WORLD_W, WORLD_H, "tree2", ["grass"], 20);
  placeObjects(map, WORLD_W, WORLD_H, "tree3", ["grass"], 20);
  placeObjects(map, WORLD_W, WORLD_H, "tree4", ["grass"], 20);
  placeObjects(map, WORLD_W, WORLD_H, "tree5", ["grass"], 20);
  placeObjects(map, WORLD_W, WORLD_H, "tree6", ["grass"], 20);
  placeObjects(map, WORLD_W, WORLD_H, "tree7", ["grass"], 20);
  placeObjects(map, WORLD_W, WORLD_H, "tree8", ["grass"], 20);
  placeObjects(map, WORLD_W, WORLD_H, "rock", ["grass", "sand"], 35);
  placeObjects(map, WORLD_W, WORLD_H, "bush", ["grass"], 70);
  placeObjects(map, WORLD_W, WORLD_H, "apple_tree", ["grass"], 20);
  placeObjects(map, WORLD_W, WORLD_H, "berry_bush", ["grass"], 30);
  placeObjects(map, WORLD_W, WORLD_H, "grapevine", ["grass"], 30);
  placeObjects(map, WORLD_W, WORLD_H, "wheat", ["grass"], 40);
  placeObjects(map, WORLD_W, WORLD_H, "cave", ["grass"], 6);

  // free pickups
  placeObjects(map, WORLD_W, WORLD_H, "stick_pickup", ["grass", "sand"], 60);
  placeObjects(map, WORLD_W, WORLD_H, "stone", ["grass", "sand"], 60);
  placeObjects(map, WORLD_W, WORLD_H, "wild_mushrooms", ["grass"], 30);
  placeObjects(map, WORLD_W, WORLD_H, "wild_strawberries", ["grass"], 30);

  // chests
  placeObjects(map, WORLD_W, WORLD_H, "chest", ["grass"], 12);
  placeObjects(map, WORLD_W, WORLD_H, "toolbox", ["grass"], 12);

 // animals (only place if they exist in objects.json)
  if (objDef("deer")) placeObjects(map, WORLD_W, WORLD_H, "deer", ["grass", "sand"], 10);
  if (objDef("doe")) placeObjects(map, WORLD_W, WORLD_H, "doe", ["grass", "sand"], 8);
  if (objDef("squirrel")) placeObjects(map, WORLD_W, WORLD_H, "squirrel", ["grass", "sand"], 15);
  if (objDef("pig")) placeObjects(map, WORLD_W, WORLD_H, "pig", ["grass", "sand"], 10);
  if (objDef("rabbit")) placeObjects(map, WORLD_W, WORLD_H, "rabbit", ["grass"], 12);
  if (objDef("chicken")) placeObjects(map, WORLD_W, WORLD_H, "chicken", ["grass", "sand"], 15);
  if (objDef("cow")) placeObjects(map, WORLD_W, WORLD_H, "cow", ["grass", "sand"], 5);
  if (objDef("cat")) placeObjects(map, WORLD_W, WORLD_H, "cat", ["grass", "sand"], 1);

  // clear spawn pocket (inside water border)
  for (let y = 1; y < 7; y++) for (let x = 1; x < 9; x++) map.objects[y][x] = null;

  // Players start in the middle of the island (the old spawn corner is open sea now)
  {
    const sx = Math.floor(WORLD_W / 2) - 1, sy = Math.floor(WORLD_H / 2);
    for (let y = sy - 2; y <= sy + 2; y++) for (let x = sx - 4; x <= sx + 5; x++) { if (map.tiles[y][x] === "water") map.tiles[y][x] = "grass"; map.objects[y][x] = null; }
    map.spawn = { x: sx, y: sy };
    // nobody starts with tools: two toolboxes at the spawn so the first axe is a few steps away
    map.objects[sy - 2][sx - 3] = { id: "toolbox", hp: objDef("toolbox")?.hp ?? 1, meta: {} };
    map.objects[sy - 2][sx + 4] = { id: "toolbox", hp: objDef("toolbox")?.hp ?? 1, meta: {} };
  }

  // Water boundary ring
  surroundWithWater(map);

  map.explored = emptyExplored(WORLD_W, WORLD_H);
  return map;
}

// ---- Built interior walls that match existing wall style ----
// Drawn in 2 passes: "back" (before players/objects) and "front" (after players) for occlusion.

function drawBuiltInteriorWallsPass(pass) {
  // We only use this for HORIZONTAL interior built walls right now.
  if (state.mode !== "interior") return;
  if (pass !== "front") return;

  const map = state.interior;
  const walls = map?.walls;
  if (!walls || !walls.h) return;

  const { viewW, viewH } = viewTiles();
  const camX = state.cam.x, camY = state.cam.y;

  // Match your interior palette vibe
  const wallOuter = "#3e2a17";
  const wallInner = "#523621";

  // Wall “strip” thickness (this is the ONLY area that should cover sprites)
  const band = Math.floor(TILE_SIZE * 0.35);
  const inset = 2;

  // Simple cap highlight so it reads like a ledge
  const capH = 3;
  const capWood = "rgba(180,120,60,0.55)";
  const capHi   = "rgba(255,255,255,0.16)";
  const capSh   = "rgba(0,0,0,0.28)";

  for (let y = camY; y < camY + viewH; y++) {
    const row = walls.h[y];
    if (!row) continue;

    for (let x = camX; x < camX + viewW; x++) {
      if (!row[x]) continue;

      const sx = UI_LEFTBAR_W + (x - camX) * TILE_SIZE;
      const sy = UI_TOP_H + (y - camY) * TILE_SIZE;

      // Horizontal wall sits on the BOTTOM edge of this tile
      const by = sy + TILE_SIZE;
      const y0 = by - band;

      // CRITICAL: clip to the wall band ONLY
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, y0, TILE_SIZE, band);
      ctx.clip();

      // Wall body
      drawRect(sx, y0, TILE_SIZE, band, wallOuter);
      drawRect(sx + inset, y0 + inset, TILE_SIZE - inset * 2, band - inset * 2, wallInner);

      // Cap (still clipped, so it never “grows” into other tiles)
      drawRect(sx, y0, TILE_SIZE, capH, capWood);
      drawRect(sx, y0, TILE_SIZE, 1, capHi);
      drawRect(sx, y0 + capH - 1, TILE_SIZE, 1, capSh);

      ctx.restore();
    }
  }
}

// --- Hardcoded interiors (ignore localStorage, never persist) ---
const HARDCODED_INTERIORS = {
  // We'll paste house_small layout data here in a minute.
  // house_small: { tiles: [...], walls: {...}, objects: [...] }
};

function generateInterior(interiorId) {
  const def = state.data.interiors[interiorId];
  const map = emptyMap(INTERIOR_W, INTERIOR_H, def.floorTile);

  // walls border (default template)
  for (let x = 0; x < INTERIOR_W; x++) {
    map.tiles[0][x] = def.wallTile;
    map.tiles[INTERIOR_H - 1][x] = def.wallTile;
  }
  for (let y = 0; y < INTERIOR_H; y++) {
    map.tiles[y][0] = def.wallTile;
    map.tiles[y][INTERIOR_W - 1] = def.wallTile;
  }

  // door at bottom middle (default template)
  map.tiles[INTERIOR_H - 1][Math.floor(INTERIOR_W / 2)] = def.doorTile;

  // init wall-edges container (between tiles)
  ensureInteriorWalls(map);
  
    // If this interior is hard-coded, apply it from JSON and return (no persistence)
  if (def?.fixedLayout && def?.layout) {
    if (Array.isArray(def.layout.tiles)) map.tiles = def.layout.tiles;
    if (def.layout.walls) map.walls = def.layout.walls;
    ensureInteriorWalls(map);

    // Objects (anchors only)
    if (Array.isArray(def.layout.objects)) {
      for (const o of def.layout.objects) {
        if (!o) continue;
        const { x, y, id, meta } = o;
        if (!inBounds(x, y, INTERIOR_W, INTERIOR_H)) continue;
       const wTiles = meta?.wTiles ?? (id === "bed" ? 2 : 1);
const hTiles = meta?.hTiles ?? (id === "bed" ? 2 : 1);
stampInteriorObject(map, x, y, id, wTiles, hTiles, meta ?? null);
      }
    }

    return map;
  }

  // HARD-CODED layout wins: ignore saved layouts entirely
  const hard = HARDCODED_INTERIORS[interiorId];
  if (hard) {
    if (Array.isArray(hard.tiles)) map.tiles = hard.tiles;
    if (hard.walls) map.walls = hard.walls;
    ensureInteriorWalls(map);

    // objects (anchors only) -> rebuild occupied proxies
    if (Array.isArray(hard.objects)) {
      for (const o of hard.objects) {
        if (!o) continue;
        const { x, y, id, meta } = o;
        if (!inBounds(x, y, INTERIOR_W, INTERIOR_H)) continue;
        const wTiles = meta?.wTiles ?? (id === "bed" ? 2 : 1);
        const hTiles = meta?.hTiles ?? (id === "bed" ? 2 : 1);
stampInteriorObject(map, x, y, id, wTiles, hTiles, meta ?? null);
      }
    }
    return map;
  }

    // If this interior has a fixed JSON layout, use it and DO NOT load/save persistence.
  if (def && def.fixedLayout && def.layout) {
    const L = def.layout;

    // tiles
    if (Array.isArray(L.tiles)) map.tiles = L.tiles;

    // walls
    if (L.walls) map.walls = L.walls;
    ensureInteriorWalls(map);

    // objects (anchors only) -> rebuild occupied proxies
    if (Array.isArray(L.objects)) {
      for (const o of L.objects) {
        if (!o) continue;
        const { x, y, id, meta } = o;
        if (!inBounds(x, y, INTERIOR_W, INTERIOR_H)) continue;
        const wTiles = meta?.wTiles ?? (id === "bed" ? 2 : 1);
const hTiles = meta?.hTiles ?? (id === "bed" ? 2 : 1);
placeInteriorObjectAt(x, y, id, wTiles, hTiles);
      }
    }

    return map;
  }

  // Otherwise, fall back to saved/persistent layout (editor mode)
  const saved = loadInteriorLayout(interiorId);
  if (saved) {
    if (Array.isArray(saved.tiles)) map.tiles = saved.tiles;
    if (saved.walls) map.walls = saved.walls;
    ensureInteriorWalls(map);

    if (Array.isArray(saved.objects)) {
      for (const o of saved.objects) {
        if (!o) continue;
        const { x, y, id, meta } = o;
        if (!inBounds(x, y, INTERIOR_W, INTERIOR_H)) continue;
        const wTiles = meta?.wTiles ?? 1;
        placeInteriorObjectAt(x, y, id, wTiles);
      }
    }
    return map;
  }

  // default starter chest ONLY if nothing saved
  map.objects[2][2] = { id: "storage_chest", hp: 999, meta: {} };

  // save the initial template once, so you have a baseline persisted
  if (!def?.fixedLayout) saveInteriorLayout(interiorId);

  return map;
}

// ---- Interior persistence + wall-edges (between tiles) ----

function interiorStorageKey(interiorId) {
  return `YAMHOME:interior:${interiorId}`;
}

function ensureInteriorWalls(map) {
  if (!map) return;
  const h = map.tiles?.length ?? INTERIOR_H;
  const w = map.tiles?.[0]?.length ?? INTERIOR_W;

  if (!map.walls) map.walls = { v: [], h: [] };

  // v[y][x] blocks between (x,y) and (x+1,y)   size: h rows, (w-1) cols
  if (!Array.isArray(map.walls.v) || map.walls.v.length !== h) {
    map.walls.v = Array.from({ length: h }, () => Array.from({ length: Math.max(0, w - 1) }, () => 0));
  } else {
    for (let y = 0; y < h; y++) {
      if (!Array.isArray(map.walls.v[y]) || map.walls.v[y].length !== Math.max(0, w - 1)) {
        map.walls.v[y] = Array.from({ length: Math.max(0, w - 1) }, () => 0);
      }
    }
  }

  // h[y][x] blocks between (x,y) and (x,y+1)   size: (h-1) rows, w cols
  if (!Array.isArray(map.walls.h) || map.walls.h.length !== Math.max(0, h - 1)) {
    map.walls.h = Array.from({ length: Math.max(0, h - 1) }, () => Array.from({ length: w }, () => 0));
  } else {
    for (let y = 0; y < Math.max(0, h - 1); y++) {
      if (!Array.isArray(map.walls.h[y]) || map.walls.h[y].length !== w) {
        map.walls.h[y] = Array.from({ length: w }, () => 0);
      }
    }
  }
}

function saveInteriorLayout(interiorId = state.interiorId) {
	  if (HARDCODED_INTERIORS[interiorId]) return;

  if (!interiorId) return;
  const map = state.interior;
  if (!map) return;

  ensureInteriorWalls(map);

  // Save only anchor objects (skip "occupied" proxies)
  const anchors = [];
  for (let y = 0; y < (map.objects?.length ?? 0); y++) {
    for (let x = 0; x < (map.objects?.[y]?.length ?? 0); x++) {
      const o = map.objects[y][x];
      if (!o) continue;
      if (o.id === "occupied" && o.meta?.anchor) continue;
      anchors.push({ x, y, id: o.id, meta: o.meta ?? {} });
    }
  }

  const payload = {
    tiles: map.tiles,
    walls: map.walls,
    objects: anchors
  };

  try {
    localStorage.setItem(interiorStorageKey(interiorId), JSON.stringify(payload));
  } catch (e) {
    console.warn("saveInteriorLayout failed:", e);
  }
}

function loadInteriorLayout(interiorId = state.interiorId) {
	    if (HARDCODED_INTERIORS[interiorId]) return null;
  if (!interiorId) return null;
  try {
    const raw = localStorage.getItem(interiorStorageKey(interiorId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("loadInteriorLayout failed:", e);
    return null;
  }
}

// --------------------------------------------------------------------------------- Fog of war ----
function _ensureExploredGrid(map, w, h) {
  if (!map) return;
  if (!map.explored || map.explored.length !== h || map.explored[0]?.length !== w) {
    map.explored = Array.from({ length: h }, () => Array.from({ length: w }, () => false));
  }
}

function revealAroundPlayers() {
  // Applies to overworld + dungeon (interior does not use fog)
  if (state.mode !== "overworld" && state.mode !== "dungeon") return;

  const map = getCurrentMap();
  if (!map) return;

  const { w, h } = currentDims();
  _ensureExploredGrid(map, w, h);

  const exp = map.explored;

  const mult = state.holdingHands ? 2 : 1;
  const r = VIS_RADIUS * mult;

  let changed = false;

  for (const pl of state.players) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = pl.x + dx;
        const y = pl.y + dy;
        if (!inBounds(x, y, w, h)) continue;

        if (!exp[y][x]) {
          exp[y][x] = true;
          changed = true;
        }
      }
    }
  }

  // Persist explored fog only for overworld (dungeon saving is usually separate)
  if (changed && state.mode === "overworld") {
    saveCurrentWorldSoon();
  }
}

function isInPlayerSight(x, y) {
  // Only meaningful for overworld + dungeon
  if (state.mode !== "overworld" && state.mode !== "dungeon") return true;

  const mult = state.holdingHands ? 2 : 1;
  const r = VIS_RADIUS * mult;

  for (const pl of state.players) {
    if (Math.abs(pl.x - x) <= r && Math.abs(pl.y - y) <= r) return true;
  }
  return false;
}


function isLitByCampfire(x, y) {
  if (state.mode !== "overworld") return false;

  const map = state.world;
  if (!map?.objects) return false;

  for (let yy = Math.max(0, y - CAMPFIRE_LIGHT_RADIUS); yy <= Math.min(WORLD_H - 1, y + CAMPFIRE_LIGHT_RADIUS); yy++) {
    for (let xx = Math.max(0, x - CAMPFIRE_LIGHT_RADIUS); xx <= Math.min(WORLD_W - 1, x + CAMPFIRE_LIGHT_RADIUS); xx++) {
      const obj = map.objects[yy][xx];
      if (!obj || obj.id !== "campfire") continue;

      // must be burning
      const lit = (obj.meta?.fireT ?? 0) > 0;
      if (!lit) continue;

      if (Math.abs(xx - x) <= CAMPFIRE_LIGHT_RADIUS && Math.abs(yy - y) <= CAMPFIRE_LIGHT_RADIUS) {
        return true;
      }
    }
  }
  return false;
}

function isVisibleNow(x, y) {
  const isDay = state.time?.isDay ?? true;
  if (isDay) return state.mode !== "overworld" || state.world.explored[y][x];
  return (state.mode !== "overworld") ? true : (isInPlayerSight(x, y) || isLitByCampfire(x, y));
}

// --------------------------------------------------------------------------------- Passability ----
// --------------------------------------------------------------------------------- Passability ----

// Treat every tile inside a build project's footprint as blocked.
function isInBuildFootprint(x, y) {
  if (state.mode !== "overworld") return false;

  const fp = (BUILD_FOOTPRINT ?? 3) | 0;

  // state.buildProjects keys are "x,y" anchors (top-left of the 3x3)
  for (const key in state.buildProjects) {
    const proj = state.buildProjects[key];
    if (!proj) continue;

    const parts = key.split(",");
    if (parts.length !== 2) continue;

    const ax = Number(parts[0]);
    const ay = Number(parts[1]);
    if (!Number.isFinite(ax) || !Number.isFinite(ay)) continue;

    if (x >= ax && x < ax + fp && y >= ay && y < ay + fp) return true;
  }

  return false;
}

function isPassable(x, y) {
  const { w, h } = currentDims();
  if (!inBounds(x, y, w, h)) return false;

  const t = tileAt(x, y);
  if (!isWalkableTile(t)) return false;

 // ✅ INTERIOR: wall + door tiles should never be passable
if (state.mode === "interior") {
  const idef = state.data.interiors?.[state.interiorId];
  const wallTile = idef?.wallTile;
  const doorTile = idef?.doorTile;
  if (wallTile && t === wallTile) return false;
  if (doorTile && t === doorTile) return false; // NEW: door is impassable
}

  // NEW: block the entire 3x3 build footprint, not just the anchor tile.
  if (isInBuildFootprint(x, y)) return false;

const obj = objectAt(x, y);
if (obj) {
  // HARD BLOCK: locked dungeon gates must stop movement, period.
  if (state.mode === "dungeon" && obj.id === "dungeon_gate") return false;

  // (If you later add an opened gate object id, allow it)
  if (state.mode === "dungeon" && obj.id === "dungeon_gate_open") {
    // passable
  } else {
    const d = objDef(obj.id);
    if (d?.blocks) return false;
  }
}
return true;

}

// -------------------------------------------------------- Pathfinding (BFS; fine for small maps) ----
function findPathBFS(start, goal) {
  const { w, h } = currentDims();
  const key = (x, y) => `${x},${y}`;

  const q = [];
  const prev = new Map();
  const seen = new Set();

  q.push(start);
  seen.add(key(start.x, start.y));
  prev.set(key(start.x, start.y), null);

  let found = false;

  while (q.length) {
    const cur = q.shift();
    if (cur.x === goal.x && cur.y === goal.y) { found = true; break; }

    for (const [nx, ny] of neighbors4(cur.x, cur.y)) {
      if (!inBounds(nx, ny, w, h)) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
            if (!canStep(cur.x, cur.y, nx, ny)) continue;

      seen.add(k);
      prev.set(k, cur);
      q.push({ x: nx, y: ny });
    }
  }

  if (found) {
    const path = [];
    let cur = goal;
    while (cur) {
      path.push(cur);
      cur = prev.get(key(cur.x, cur.y));
    }
    path.reverse();
    // remove start node
    return path.slice(1);
  }

  // If goal not reachable, find nearest reachable tile to goal
  // We already have `seen` and `prev` filled with reachable tiles.
  let best = null;
  let bestDist = Infinity;

  for (const k of seen) {
    const [sx, sy] = k.split(",").map(Number);
    const d = Math.abs(sx - goal.x) + Math.abs(sy - goal.y);
    if (d < bestDist) {
      bestDist = d;
      best = { x: sx, y: sy };
    }
  }

  if (!best || (best.x === start.x && best.y === start.y)) return [];
  // reconstruct path to best
  const path = [];
  let cur = best;
  while (cur) {
    path.push(cur);
    cur = prev.get(key(cur.x, cur.y));
  }
  path.reverse();
  return path.slice(1);
}

function setPathTo(x, y) {
  const p = activePlayer();

  noteMoveInputForHands();

  // movement interrupts resting
  p.resting = false;

  if (!inBounds(x, y, currentDims().w, currentDims().h)) return;

  const path = findPathBFS({ x: p.x, y: p.y }, { x, y });
if (p.stamina <= 0) { notifyNoEnergy(); return; }

  // ONLINE + OVERWORLD: queue the path and let netTick() drip-feed steps to server.
  // Dungeon and interior movement is always local — sending dungeon tile coords to the
  // server would corrupt the server's player position (dungeon uses its own 0-70 grid).
  // (online movement is client-side too: the walk is smooth and the new tile is published as each step lands)
  p.path = path;
}

// --------------------------------------------------------------------------- Stamina + movement update ----
function consumeStaminaForTile(pl) {
  pl.stamina = Math.max(0, pl.stamina - STAMINA_COST_PER_TILE);
}

function otherHandHolderIndex(me) {
  const hh = state.holdingHands;
  if (!hh) return null;
  if (hh.a === me) return hh.b;
  if (hh.b === me) return hh.a;
  return null;
}

// ---------------------------------------------------------------------------------- Couple actions ----
// Hold hands, kiss and hug. Whoever asks (a) stays put; the one who accepts (b) walks over until they are side by side (adjacent), and
// then the action starts. Hugs and kisses are short animations (the 3D view draws them from state.coupleAnim). Holding hands lasts until
// it is ended: a leads, b is kept beside them (on a's right, or left, or just behind if that is blocked) wherever a goes.
const HAND_BREAKERS = new Set(["chop", "pickaxe", "harvest", "pickup", "eat", "dig", "hammer", "saw", "water", "fillwater", "hunt", "fishingreel", "cook", "cow", "chest", "lightfire", "extinguish", "cat", "unlock", "door_open"]);
const COUPLE_MEET_TIMEOUT_MS = 25000;
const CHICKEN_MAX_FEATHERS = 5;
const COUPLE_ANIM_MS = { hug: 3600, kiss: 3300 };

function endHoldingHands(reason, fromNet = false) {
  if (!state.holdingHands) return;
  state.holdingHands = null;
  if (state.couplePending?.kind === "hold") state.couplePending = null;
  if (reason) logAction(reason);
  if (!fromNet && state.net?.enabled) sendNetInput({ type: "couple_end", what: "hold" });
}
/** Ends holding hands if this player is one of the two (they sat down, walked off, etc.). */
function endHandsFor(playerIdx, reason) {
  const hh = state.holdingHands;
  if (hh && (hh.a === playerIdx || hh.b === playerIdx)) endHoldingHands(reason);
}
/** The one being led moving on their own lets go; the leader just leads. */
function noteMoveInputForHands() {
  const hh = state.holdingHands;
  if (hh && state.activePlayer === hh.b) endHoldingHands(`${state.players[hh.b].name} let go.`);
}

function beginCouple(kind, a, b) {
  state.couplePending = { kind, a, b, since: performance.now(), retryAt: 0 };
}

function coupleNeighbourTile(A, B) {
  const best = [];
  for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) {
    const x = A.x + dx, y = A.y + dy;
    if (!inBounds(x, y, currentDims().w, currentDims().h) || !isPassable(x, y) || objectAt(x, y)) continue;
    best.push({ x, y, d: Math.abs(B.x - x) + Math.abs(B.y - y) });
  }
  best.sort((m, n) => m.d - n.d);
  return best[0] || null;
}

/** Walk this player (when it is ours to move) along a path to (x, y). */
function coupleWalk(idx, x, y) {
  const P = state.players[idx];
  const path = findPathBFS({ x: P.x, y: P.y }, { x, y });
  if (!path || !path.length) return false;
  if (state.net?.enabled && state.activePlayer !== idx) return true;   // online, each client moves only its own character
  P.resting = false; P.path = path;
  return true;
}

function startCoupleNow(cp) {
  const A = state.players[cp.a], B = state.players[cp.b];
  state.couplePending = null;
  if (cp.kind === "hold") {
    state.holdingHands = { a: cp.a, b: cp.b, leader: cp.a, heading: { dx: 0, dy: 1 }, lx: A.x, ly: A.y, prev: { x: B.x, y: B.y }, startedAt: performance.now() };
    logAction(`${A.name} and ${B.name} are holding hands.`);
  } else {
    if (state.holdingHands) endHoldingHands(null);
    state.coupleAnim = { kind: cp.kind, a: cp.a, b: cp.b, start: performance.now(), dur: COUPLE_ANIM_MS[cp.kind] || 3000, ax: A.x, ay: A.y, bx: B.x, by: B.y };
    logAction(cp.kind === "kiss" ? `${A.name} and ${B.name} share a kiss.` : `${A.name} and ${B.name} hug.`);
  }
}

function updateCouple() {
  const now = performance.now();

  // 1) accepted, but not side by side yet: the one who accepted walks over
  const cp = state.couplePending;
  if (cp) {
    const A = state.players[cp.a], B = state.players[cp.b], d = Math.abs(A.x - B.x) + Math.abs(A.y - B.y);
    const bBusy = B.path.length > 0 || (state.net?.enabled && state.activePlayer === cp.b && (state.net.moveQueue?.length > 0 || state.net._pendingMove));
    if (d <= 1 && !bBusy) startCoupleNow(cp);
    else if (now - cp.since > COUPLE_MEET_TIMEOUT_MS) { state.couplePending = null; logAction("They couldn't get to each other."); }
    else if (d > 1 && !bBusy && now >= cp.retryAt) {
      cp.retryAt = now + 700;
      const t = coupleNeighbourTile(A, B); if (t) coupleWalk(cp.b, t.x, t.y);
    }
  }

  // 2) a kiss or hug in progress: it ends when it has played, or when either of them walks off
  const ca = state.coupleAnim;
  if (ca) {
    const A = state.players[ca.a], B = state.players[ca.b];
    if (now - ca.start > ca.dur || A.x !== ca.ax || A.y !== ca.ay || B.x !== ca.bx || B.y !== ca.by || A.path.length || B.path.length) state.coupleAnim = null;
  }

  // 3) holding hands: the leader leads, the other stays beside them
  const hh = state.holdingHands;
  if (hh) {
    const L = state.players[hh.a], F = state.players[hh.b];
    if (L.x !== hh.lx || L.y !== hh.ly) {   // the leader stepped: remember which way they are going
      const dx = L.x - hh.lx, dy = L.y - hh.ly;
      if (dx || dy) { hh.heading = Math.abs(dx) >= Math.abs(dy) ? { dx: Math.sign(dx), dy: 0 } : { dx: 0, dy: Math.sign(dy) }; hh.prev = { x: hh.lx, y: hh.ly }; }
      hh.lx = L.x; hh.ly = L.y;
    }
    const far = Math.abs(L.x - F.x) + Math.abs(L.y - F.y);
    if (far > 4) { endHoldingHands("Their hands slipped apart."); return; }
    const mine = !state.net?.enabled || state.activePlayer === hh.b;   // online, each client moves only its own character
    const fBusy = F.path.length > 0 || (state.net?.enabled && (state.net.moveQueue?.length > 0 || state.net._pendingMove));
    if (mine) {
      const h = hh.heading, ok = (x, y) => inBounds(x, y, currentDims().w, currentDims().h) && isPassable(x, y) && !objectAt(x, y) && !(x === L.x && y === L.y);
      const rx = L.x - h.dy, ry = L.y + h.dx, lx2 = L.x + h.dy, ly2 = L.y - h.dx;
      const want = ok(rx, ry) ? { x: rx, y: ry } : ok(lx2, ly2) ? { x: lx2, y: ly2 } : (hh.prev && ok(hh.prev.x, hh.prev.y) ? hh.prev : null);
      // re-aim every time the leader steps (walking at the same speed, waiting until idle would leave the follower a few tiles behind for good)
      const key = `${L.x},${L.y}`;
      if (want && (F.x !== want.x || F.y !== want.y) && (hh.sentFor !== key || !fBusy)) { hh.sentFor = key; coupleWalk(hh.b, want.x, want.y); }
    }
  }
}

function updatePlayers(dt) {
  stepHeldMoveKeys();
  for (const pl of state.players) {
    // Rest regen
    if (pl.resting && pl.path.length === 0) {
      pl.stamina = Math.min(STAMINA_MAX, pl.stamina + REST_REGEN_PER_SEC * dt);
    }

    // Hunger ticking (fills as you get hungry)
    if (pl.hunger === undefined) pl.hunger = 0;
    pl.hunger = clamp(pl.hunger + HUNGER_PER_SEC * dt, 0, HUNGER_MAX);

// Starvation stamina drain when hunger is maxed
if (pl.hunger >= HUNGER_MAX) {
  pl.stamina = clamp(pl.stamina - STARVE_STAMINA_DRAIN_PER_SEC * dt, 0, STAMINA_MAX);
}

    // Move along path smoothly
    if (pl.path.length > 0) {
      if (pl.stamina <= 0) {
        // too tired, stop
        if (pl === activePlayer()) notifyNoEnergy();
        pl.path = [];
        // mark as not moving so footsteps stop cleanly
        pl._wasMoving = false;
        continue;
      }

      const next = pl.path[0];

      // move fx/fy toward next tile center (tile coords)
      const dx = next.x - pl.fx;
      const dy = next.y - pl.fy;
      const dist = Math.hypot(dx, dy);

      const holdCatchUp = (state.holdingHands && state.players.indexOf(pl) === state.holdingHands.b) ? 1.8 : 1;   // the one being led closes any gap to the leader
      const step = (state.view3d ? MOVE_SPEED_TILES_PER_SEC_3D : MOVE_SPEED_TILES_PER_SEC) * dt * holdCatchUp * (pl.sneak ? SNEAK_SPEED_MULT : 1);

      if (dist <= step || dist === 0) {
        // Re-check passability at arrival: world may have changed since path was computed
        if (!canStep(pl.x, pl.y, next.x, next.y)) {
          pl.path = [];
          pl._wasMoving = false;
          continue;
        }

        // arrive at next tile
        const prevX = pl.x;
        const prevY = pl.y;

        pl.fx = next.x;
        pl.fy = next.y;
        pl.x = next.x;
        pl.y = next.y;
        pl.path.shift();

        // 👣 Footstep SFX: play only when a tile is actually entered,
        // and only if we're still moving or just moved this tick.
        // If you want both players to make steps, remove the activePlayer() check.
        if (pl === activePlayer()) {
          playFootstep(pl);
        }

        consumeStaminaForTile(pl);
        if (pl === activePlayer() && state.net?.enabled && state.mode === "overworld") writePlayerPositionThrottled();

        // fog reveal on overworld
        revealAroundPlayers();

        // edge scroll only for active player
        if (pl === activePlayer()) ensureCameraEdgeScroll();

        pl._wasMoving = true;
      } else {
        // interpolate
        pl.fx += (dx / dist) * step;
        pl.fy += (dy / dist) * step;
        pl._wasMoving = true;
      }
    } else {
      if (state.net?.enabled && pl !== activePlayer() && Math.hypot(pl.x - pl.fx, pl.y - pl.fy) > 0.01) {
        // the partner's position arrives a tile at a time: glide to it instead of jumping
        const dx = pl.x - pl.fx, dy = pl.y - pl.fy, dist = Math.hypot(dx, dy);
        const step = (state.view3d ? MOVE_SPEED_TILES_PER_SEC_3D : MOVE_SPEED_TILES_PER_SEC) * dt;
        if (dist <= step) { pl.fx = pl.x; pl.fy = pl.y; } else { pl.fx += dx / dist * step; pl.fy += dy / dist * step; }
        pl._wasMoving = true;
        continue;
      }
      // snap floats to ints when not moving
      pl.fx = pl.x;
      pl.fy = pl.y;

      // movement stopped: mark so no step logic tries to "continue"
      pl._wasMoving = false;
    }
  }
    // ONLINE: movement comes from server snapshots (no local path steps),
  // so we still need to run camera edge scrolling every frame.
  ensureCameraEdgeScroll();
}

// ---------------------------------------------------------------------------------- Structures + markers ----
function markerKey(m) {
  return m.type === "partner" ? "partner" : `${m.type}:${m.x},${m.y}`;
}

/** The saved-places list: your partner's live position first, then the saved markers. */
function savedPlaces() {
  const me = state.activePlayer | 0, other = state.players[me === 0 ? 1 : 0];
  const list = [...(state.markers || [])];
  if (other) list.unshift({ type: "partner", label: other.name, x: other.x, y: other.y, playerIndex: me === 0 ? 1 : 0 });
  return list;
}

function addMarker(label, x, y, type) {
  // prevent duplicates for same type/coord
  const exists = state.markers.some(m => m.x === x && m.y === y && m.type === type);
  if (!exists) state.markers.push({ label, x, y, type });
}

function saveHouseAt(x, y) {
  const key = `house:${x},${y}`;
  if (!state.structures.houses.some(h => h.key === key)) {
    state.structures.houses.push({ key, x, y, label: "House" });
    addMarker("House", x, y, "house");
  }
}

function saveStockpileAt(x, y, key) {
  addMarker(`Stockpile`, x, y, "stockpile");
}

function isRenewableDef(def) {
  if (!def) return false;
  if (def.renewable === true) return true;
  if (Array.isArray(def.tags) && def.tags.includes("renewable")) return true;
  return false;
}

// ---------------------------------------------------------------------------------------- PLAYER ACTIONS ----
function harvestObject(x, y) {
  const map = getCurrentMap();
  const obj = map.objects[y][x];
  if (!obj) return;

  const def = objDef(obj.id);
  if (!def) return;

  // Support BOTH harvest and hunt
  const interact = def.hunt || def.harvest;
  if (!interact) return;
  if (obj.meta?.depleted) return;   // nothing left to take until it regrows

  const inv = activeInv();
  const requiredTool = interact.requiresTool || null;
  if (requiredTool && !hasTool(inv, requiredTool)) return;

  const p = activePlayer();

  // Shooting the bow uses up an arrow (hit or miss)
  if (requiredTool === "bow_and_arrow") {
    if (getQty(inv, "arrow") <= 0) { logAction(`${p.name} is out of arrows.`); playSound("error"); return; }
    removeItem(inv, "arrow", 1);
  }

  // Wood + stone cost stamina
  if (obj.id === "tree1" || obj.id === "tree2" || obj.id === "tree3" || obj.id === "tree4" || obj.id === "tree5" || obj.id === "tree6" || obj.id === "tree7" || obj.id === "tree8") {
    if (p.stamina < HARVEST_STAMINA_COST_WOOD) { notifyNoEnergy(); return; }
    p.stamina -= HARVEST_STAMINA_COST_WOOD;
  }

  if (obj.id === "rock") {
    if (p.stamina < HARVEST_STAMINA_COST_STONE) { notifyNoEnergy(); return; }
    p.stamina -= HARVEST_STAMINA_COST_STONE;
  }

  const pName = activePlayer().name;

  // --- Chance of failure (fishing / hunting) ---
  // Allow per-object tuning via JSON: def.hunt.chance or def.harvest.chance (0..1)
  const baseChance =
    (typeof interact.chance === "number") ? interact.chance :
    (obj.id === "fish_spot") ? 0.65 :
    (def.hunt) ? 0.75 :
    1;

  if (baseChance < 1) {
    const chk = rollCheck(baseChance);

    if (!chk.ok) {
      if (obj.id === "fish_spot") {
        logAction(`${pName} tried to fish… nothing. (d${chk.sides}: ${chk.roll} > ${chk.target})`);
      } else if (def.hunt) {
        logAction(`${pName} tried to hunt… failed. (d${chk.sides}: ${chk.roll} > ${chk.target})`);
      } else {
        logAction(`${pName} tried to harvest… failed. (d${chk.sides}: ${chk.roll} > ${chk.target})`);
      }

      closeMenu();
      return;
    }
  }

  // Give loot
  for (const [itemId, amt] of Object.entries(interact.gives || {})) {
    const res = addItemOrDrop(inv, itemId, amt, x, y, pName);

    const itemName = itemDef(itemId)?.name ?? itemId;
    const got = (typeof res === "object" && typeof res.added === "number") ? res.added : amt;

    if (got > 0) {
      if (itemId === "fish") {
        logAction(`${pName} caught a fish!`);
      } else if (def.hunt) {
        logAction(`${pName} hunted ${got} ${itemName}${got === 1 ? "" : "s"}!`);
      } else {
        logAction(`${pName} harvested ${got} ${itemName}${got === 1 ? "" : "s"}!`);
      }
    }
    // If inventory was full, addItemOrDrop already logs the drop message.
  }

  // Extra random loot (a chicken also gives 5-10 feathers)
  for (const [itemId, range] of Object.entries(interact.bonusRandom || {})) {
    const amt = randInt(range[0], range[1]);
    const res = addItemOrDrop(inv, itemId, amt, x, y, pName);
    const got = (typeof res === "object" && typeof res.added === "number") ? res.added : amt;
    if (got > 0) logAction(`${pName} gathered ${got} ${itemDef(itemId)?.name ?? itemId}${got === 1 ? "" : "s"}.`);
  }

  // Damage / remove object (run ONCE per harvest, not per item)
  // NOTE: do NOT mutate obj.hp in-place here — setOverworldObject uses the stored
  // object as the "before" state for change-detection. Mutating in-place makes
  // prev === next and the world op is never broadcast to the other player.
  const newHp = (obj.hp ?? 1) - 1;

// Helper: commit object change (net-synced in overworld)
const commitObj = (value) => {
  const next = (value == null) ? null : value;

  if (state.mode === "overworld") {
    setOverworldObject(x, y, next);
    return true;
  }

  // For non-overworld maps, write directly
  map.objects[y][x] = next;
  return true;
};

  if (newHp <= 0) {
    // Tree regrowth system
    if (/^tree[1-8]$/.test(obj.id)) {
      const stump = {
        id: "stump",
        meta: {
          originalTree: obj.id,
          regrowDay: state.time.day,
          regrowStage: "stump"
        }
      };

      commitObj(stump);
      closeMenu();
      return;
    }

    if (isRenewableDef(def)) {
      commitObj({
        ...obj,
        hp: 0,
        meta: {
          ...(obj.meta || {}),
          depleted: true,
          depletedDay: state.time.day
        }
      });
    } else {
      commitObj(null);
    }
  } else {
    // hp reduced but object still alive: broadcast updated hp so the other client stays in sync
    commitObj({
      ...obj,
      hp: newHp,
      meta: obj.meta ? { ...obj.meta } : undefined
    });
  }

  closeMenu();

}

function chopDownObject(x, y) {
  const p = activePlayer();
  if (p.stamina < HARVEST_STAMINA_COST_WOOD) { notifyNoEnergy(); return; }
  p.stamina -= HARVEST_STAMINA_COST_WOOD;

  const map = getCurrentMap();
  const obj = map.objects?.[y]?.[x];
  if (!obj) return;

  const def = objDef(obj.id);
  if (!def) return;

  const inv = activeInv();
  if (!hasTool(inv, "axe")) return;

  // Only for the “anti-softlock” blockers you listed
  const choppable = new Set(["bush", "berry_bush", "apple_tree", "grapevine"]);
  if (!choppable.has(obj.id)) return;

  playSound("chop");

  const pName = activePlayer().name;

  // “All of its apples/fiber/etc” = whatever the normal harvest would give,
  // unless it's already depleted.
  const isDepleted = !!obj.meta?.depleted;
  const harvest = def.harvest || null;

  if (!isDepleted && harvest?.gives) {
    for (const [itemId, amt] of Object.entries(harvest.gives)) {
      addItem(inv, itemId, amt);
      const itemName = itemDef(itemId)?.name ?? itemId;
      logAction(`${pName} got ${amt} ${itemName}${amt === 1 ? "" : "s"} from chopping.`);
    }
  }

  // Extra chop loot
  if (obj.id === "apple_tree") {
    addItem(inv, "wood", 2);
    logAction(`${pName} got 2 wood from chopping.`);
  } else if (obj.id === "bush") {
    const sticks = randInt(2, 4);
    addItem(inv, "stick", sticks);
    logAction(`${pName} got ${sticks} stick${sticks === 1 ? "" : "s"} from chopping.`);
  } else if (obj.id === "berry_bush") {
    const sticks = randInt(1, 3);
    addItem(inv, "stick", sticks);
    logAction(`${pName} got ${sticks} stick${sticks === 1 ? "" : "s"} from chopping.`);
  }

  // Clear the blocker no matter what (this is the whole point)
  setOverworldObject(x, y, null);
  logAction(`${pName} chopped down the ${def.name ?? obj.id} at (${x},${y}).`);

  closeMenu();
}

function firstExistingItemId(ids) {
  for (const id of ids) if (itemDef(id)) return id;
  return null;
}

function openMenuForWaterTile(mapX, mapY, screenX, screenY) {
  const p = activePlayer();
  const inv = activeInv();

  // you probably have ONE of these (pick what exists)
  const emptyBucketId = firstExistingItemId(["bucket", "empty_bucket"]);
  const filledBucketId = firstExistingItemId(["bucket_water", "water_bucket", "bucket_of_water"]);

  let disabledReason = null;

  if (!isAdjacentOrSame(p.x, p.y, mapX, mapY)) disabledReason = "Too far";
  else if (!emptyBucketId) disabledReason = "No bucket item exists (add one in items.json)";
  else if (!filledBucketId) disabledReason = "No filled-water bucket item exists (add one in items.json)";
  else if (getQty(inv, emptyBucketId) <= 0) disabledReason = "Needs an empty bucket";

  openMenu({
    screenX, screenY,
    title: "Water",
    options: [
      {
        label: "Fill bucket",
        disabledReason,
        action: () => {
          if (disabledReason) return;
          removeItem(inv, emptyBucketId, 1);
	  playSound("fillwater");
          addItem(inv, filledBucketId, 1);
          logAction(`${p.name} filled a bucket with water.`);
          closeMenu();
        }
      }
    ]
  });
}

function openInteriorEditMenu(tx, ty, px, py) {
  if (state.mode !== "interior") return;

  openMenu({
    screenX: px,
    screenY: py,
    title: `Edit (${tx},${ty})`,
    options: [
      {
        label: "Place Object",
        action: () => {
          playSound("click");
          openInteriorPlaceObjectMenu(tx, ty, px, py);
        }
      },
      {
        label: "Modify Tile",
        action: () => {
          playSound("click");
          openInteriorModifyTileMenu(tx, ty, px, py);
        }
      },
	        {
        label: "Build Wall",
        action: () => {
          playSound("click");
          openInteriorBuildWallMenu(tx, ty, px, py);
        }
      },
      {
        label: "Exit Edit Mode",
        action: () => {
          playSound("click");
          state.interiorEdit.on = false;
          closeMenu();
        }
      }
    ]
  });
}

function openInteriorPlaceObjectMenu(tx, ty, px, py) {
  const map = state.interior;
  if (!map?.objects?.[ty]) return;

  // Build list from objects.json: anything tagged "household"
 const householdIds = Object.entries(state.data?.objects ?? {})
  .filter(([id, o]) => Array.isArray(o.tags) && o.tags.includes("household"))
  .map(([id]) => id);

  // Sort by display name for sanity
  householdIds.sort((a, b) => {
    const an = (objDef(a)?.name ?? a).toLowerCase();
    const bn = (objDef(b)?.name ?? b).toLowerCase();
    return an.localeCompare(bn);
  });

  const getObjAt = (x, y) => map.objects?.[y]?.[x] ?? null;

  // If this tile is an occupied proxy (e.g. right-half of a bed), operate on the anchor instead.
  const cur = getObjAt(tx, ty);
  const anchor = (cur?.id === "occupied" && cur.meta?.anchor)
    ? cur.meta.anchor
    : { x: tx, y: ty };

  const existing = getObjAt(anchor.x, anchor.y);

  const opts = [];

  // Clear existing (clears anchor + any occupied tiles it owns)
  if (existing) {
    const name = objDef(existing.id)?.name ?? existing.id;
    opts.push({
      label: `Clear Object (${name})`,
      action: () => {
        playSound("pop");
        clearInteriorPlacedObject(anchor.x, anchor.y);
        closeMenu();
      }
    });
  }

  if (householdIds.length === 0) {
    opts.push({
      label: "(No household objects found)",
      disabledReason: "Tag interior objects with tags:[\"household\"] in objects.json",
      action: () => {}
    });
  } else {
    for (const objId of householdIds) {
      const name = objDef(objId)?.name ?? objId;

      // Bed is special: 2 tiles wide (to the right)
      const wTiles = (objId === "bed") ? 2 : 1;
const hTiles = (objId === "bed") ? 2 : 1;

      let disabledReason = null;
      if (!canPlaceInteriorObjectAt(anchor.x, anchor.y, wTiles, hTiles)) {
        disabledReason = "Blocked / out of bounds";
      }

      opts.push({
        label: (wTiles === 2) ? `Place: ${name} (2-wide)` : `Place: ${name}`,
        disabledReason,
        action: () => {
          if (disabledReason) return;
          playSound("pop");
          placeInteriorObjectAt(anchor.x, anchor.y, objId, wTiles, hTiles);
          closeMenu();
        }
      });
    }
  }

  openMenu({
    screenX: px,
    screenY: py,
    title: `Place Object (${anchor.x},${anchor.y})`,
    options: opts
  });
}

// ---- interior wall-edge building (between tiles) ----

function hasInteriorWallBetween(ax, ay, bx, by) {
  if (state.mode !== "interior") return false;
  const map = state.interior;
  if (!map) return false;
  ensureInteriorWalls(map);

  const dx = bx - ax;
  const dy = by - ay;

  // horizontal move -> check v walls
  if (dy === 0 && Math.abs(dx) === 1) {
    const x = Math.min(ax, bx);
    const y = ay;
    return !!map.walls.v?.[y]?.[x];
  }

  // vertical move -> check h walls
  if (dx === 0 && Math.abs(dy) === 1) {
    const x = ax;
    const y = Math.min(ay, by);
    return !!map.walls.h?.[y]?.[x];
  }

  return false;
}

function canStep(ax, ay, bx, by) {
  // base tile/objects rules
  if (!isPassable(bx, by)) return false;

  // add interior edge-wall blocking
  if (state.mode === "interior" && hasInteriorWallBetween(ax, ay, bx, by)) return false;

  // walls of player-built houses (doors and archways let you through)
  if (state.mode === "overworld" && typeof structureBlocksStep === "function" && structureBlocksStep(ax, ay, bx, by)) return false;

  return true;
}

function toggleInteriorWall(tx, ty, dir) {
  const map = state.interior;
  if (!map) return;
  ensureInteriorWalls(map);

  // dir is one of: "N","S","E","W"
  if (dir === "E") {
    if (tx >= 0 && tx < INTERIOR_W - 1 && ty >= 0 && ty < INTERIOR_H) {
      map.walls.v[ty][tx] = map.walls.v[ty][tx] ? 0 : 1;
    }
  } else if (dir === "W") {
    if (tx - 1 >= 0 && tx - 1 < INTERIOR_W - 1 && ty >= 0 && ty < INTERIOR_H) {
      map.walls.v[ty][tx - 1] = map.walls.v[ty][tx - 1] ? 0 : 1;
    }
  } else if (dir === "S") {
    if (tx >= 0 && tx < INTERIOR_W && ty >= 0 && ty < INTERIOR_H - 1) {
      map.walls.h[ty][tx] = map.walls.h[ty][tx] ? 0 : 1;
    }
  } else if (dir === "N") {
    if (tx >= 0 && tx < INTERIOR_W && ty - 1 >= 0 && ty - 1 < INTERIOR_H - 1) {
      map.walls.h[ty - 1][tx] = map.walls.h[ty - 1][tx] ? 0 : 1;
    }
  }

  saveInteriorLayout();
}

function clearAllInteriorWalls() {
  const map = state.interior;
  if (!map) return;
  ensureInteriorWalls(map);

  for (let y = 0; y < INTERIOR_H; y++) {
    for (let x = 0; x < INTERIOR_W - 1; x++) map.walls.v[y][x] = 0;
  }
  for (let y = 0; y < INTERIOR_H - 1; y++) {
    for (let x = 0; x < INTERIOR_W; x++) map.walls.h[y][x] = 0;
  }

  saveInteriorLayout();
}

function openInteriorBuildWallMenu(tx, ty, px, py) {
  const map = state.interior;
  if (!map) return;
  ensureInteriorWalls(map);

  const opts = [
    { label: "Toggle Wall: North (between this tile and tile above)", action: () => { playSound("pop"); toggleInteriorWall(tx, ty, "N"); closeMenu(); } },
    { label: "Toggle Wall: South (between this tile and tile below)", action: () => { playSound("pop"); toggleInteriorWall(tx, ty, "S"); closeMenu(); } },
    { label: "Toggle Wall: West (between this tile and tile left)", action: () => { playSound("pop"); toggleInteriorWall(tx, ty, "W"); closeMenu(); } },
    { label: "Toggle Wall: East (between this tile and tile right)", action: () => { playSound("pop"); toggleInteriorWall(tx, ty, "E"); closeMenu(); } },
    { label: "Clear ALL built walls", action: () => { playSound("deny"); clearAllInteriorWalls(); closeMenu(); } }
  ];

  openMenu({
    screenX: px,
    screenY: py,
    title: `Build Wall (${tx},${ty})`,
    options: opts
  });
}

// ---- interior placement helpers ----
function canPlaceInteriorObjectAt(x, y, wTiles, hTiles = 1) {
  const map = state.interior;
  const h = map?.tiles?.length ?? 0;
  const w = map?.tiles?.[0]?.length ?? 0;

  if (x < 0 || y < 0) return false;
  if (x + (wTiles - 1) >= w) return false;
  if (y + (hTiles - 1) >= h) return false;

  for (let dy = 0; dy < hTiles; dy++) {
    for (let dx = 0; dx < wTiles; dx++) {
      const t = map.objects?.[y + dy]?.[x + dx] ?? null;
      if (!t) continue;
      return false; // anything in the rectangle blocks placement
    }
  }
  return true;
}

function clearInteriorPlacedObject(x, y) {
  const map = state.interior;
  if (!map?.objects) return;

  const obj = map.objects?.[y]?.[x] ?? null;
  if (!obj) return;

  const wTiles = obj.meta?.wTiles ?? 1;
  const hTiles = obj.meta?.hTiles ?? 1;

  for (let dy = 0; dy < hTiles; dy++) {
    for (let dx = 0; dx < wTiles; dx++) {
      if (map.objects?.[y + dy]?.[x + dx]?.id === "occupied" || (dx === 0 && dy === 0)) {
        map.objects[y + dy][x + dx] = null;
      }
    }
  }

  saveInteriorLayout();
}

const PASSABLE_PROXY_ID = "occupied_pass";

function stampInteriorObject(map, x, y, objId, wTiles = 1, hTiles = 1, metaExtra = null) {
  if (!map?.objects) return false;

    // Clear rectangle first
  // Beds are drawn visually shifted up, so we also clear y-1 for their collision row.
  const clearStartDy = (objId === "bed") ? -1 : 0;
  const clearEndDy = Math.max(1, hTiles) - 1;

  for (let dy = clearStartDy; dy <= clearEndDy; dy++) {
    for (let dx = 0; dx < Math.max(1, wTiles); dx++) {
      if (map.objects?.[y + dy]?.[x + dx] !== undefined) {
        map.objects[y + dy][x + dx] = null;
      }
    }
  }


  const meta = { wTiles, hTiles, ...(metaExtra || {}) };

  // Anchor at top-left
  if (!map.objects?.[y]) return false;
  map.objects[y][x] = { id: objId, hp: 999, meta };

  // Occupied proxies for the rest of the rectangle
  for (let dy = 0; dy < hTiles; dy++) {
    for (let dx = 0; dx < wTiles; dx++) {
      if (dx === 0 && dy === 0) continue; // anchor tile
      if (!map.objects?.[y + dy]) continue;
      if (map.objects[y + dy][x + dx] === undefined) continue;

            // Decide whether this proxy tile blocks walking or is "soft occupied"
      // meta.blocksMask: 2D array [hTiles][wTiles] where 1=blocked, 0=walkable
      let _proxyId = "occupied";
      if (meta?.blocksMask) {
        const _row = meta.blocksMask[dy];
        const _cell = _row ? _row[dx] : 1;
        _proxyId = (_cell === 0) ? PASSABLE_PROXY_ID : "occupied";
      }

      map.objects[y + dy][x + dx] = {
        id: _proxyId,
        hp: 999,
        meta: { anchor: { x, y } }
      };
    }
  }

  // --- Bed special-case: block the row ABOVE the anchor (visual top of the bed)
  // This keeps the bed's visual Y offset while making the "red" tiles impassable.
  if (objId === "bed" && meta?.blocksMask && map.objects?.[y - 1]) {
    for (let dx = 0; dx < wTiles; dx++) {
      if (map.objects[y - 1][x + dx] === undefined) continue;

      // Use the FIRST row of the mask for the "above" collision row
      const row0 = meta.blocksMask[0];
      const cell = row0 ? row0[dx] : 1;

      // 1 = blocked, 0 = walkable (soft-occupied)
      const id = (cell === 0) ? PASSABLE_PROXY_ID : "occupied";

      map.objects[y - 1][x + dx] = {
        id,
        hp: 999,
        meta: { anchor: { x, y } }
      };
    }
  }

  return true;
}

function placeInteriorObjectAt(x, y, objId, wTiles, hTiles = 1) {
  const map = state.interior;
  if (!map?.objects?.[y]) return;

  stampInteriorObject(map, x, y, objId, wTiles, hTiles);

  const idef = state.data?.interiors?.[state.interiorId];
  if (!idef?.fixedLayout) saveInteriorLayout();
}

function openInteriorModifyTileMenu(tx, ty, px, py) {
  const map = state.interior;
  if (!map?.tiles?.[ty]) return;

  // Simple starter set: floor / wall / door.
  // These tile ids must exist in your tiles.json.
  const FLOOR = "floor";
  const WALL = "wall";
  const DOOR = "door";

  const tileExists = (id) => !!state.data?.tiles?.[id];

  const opts = [];

  const addSet = (label, tileId) => {
    opts.push({
      label,
      disabledReason: tileExists(tileId) ? null : `Missing tile id: ${tileId}`,
      action: () => {
        if (!tileExists(tileId)) return;
        playSound("pop");
        map.tiles[ty][tx] = tileId;
		saveInteriorLayout();
        closeMenu();
      }
    });
  };

  addSet("Set: Floor", FLOOR);
  addSet("Set: Wall", WALL);
  addSet("Set: Door", DOOR);

  opts.push({
    label: "Copy tile from cursor (next click)",
    action: () => {
      // Minimal “tool” hook: next click in edit mode copies that tile id here.
      // (We’ll wire this properly if you actually want it.)
      playSound("click");
      logAction("Copy tool not wired yet. (Tell future-you: implement a one-shot interiorEdit.copyTarget.)");
      closeMenu();
    }
  });

  openMenu({
    screenX: px,
    screenY: py,
    title: `Modify Tile (${tx},${ty})`,
    options: opts
  });
}

// ---- Dungeon persistence + generation ----
function dungeonStorageKey(dungeonId) {
  return `YAMHOME:dungeon:${dungeonId}`;
}

function saveDungeonLayout(dungeonId = state.dungeonId) {
  if (!dungeonId) return;
  const map = state.dungeon;
  if (!map) return;

  const anchors = [];
  for (let y = 0; y < (map.objects?.length ?? 0); y++) {
    for (let x = 0; x < (map.objects?.[y]?.length ?? 0); x++) {
      const o = map.objects[y][x];
      if (!o) continue;
      anchors.push({ x, y, id: o.id, meta: o.meta ?? {} });
    }
  }

const payload = {
  v: 2,   // layout version: 2 = a puzzle chest in every chamber (older saves have a single puzzle chest and too few keys, so they are regenerated)
  w: map.tiles?.[0]?.length ?? 0,
  h: map.tiles?.length ?? 0,
  tiles: map.tiles,
  objects: anchors,
  entrance: map.entrance ?? null,
  explored: map.explored ?? null
};

  state.dungeons[dungeonId] = payload;

  try {
    localStorage.setItem(dungeonStorageKey(dungeonId), JSON.stringify(payload));
  } catch (e) {
    console.warn("saveDungeonLayout failed:", e);
  }
}

function loadDungeonLayout(dungeonId) {
  if (!dungeonId) return null;
  if (state.dungeons?.[dungeonId]) return state.dungeons[dungeonId];

  try {
    const raw = localStorage.getItem(dungeonStorageKey(dungeonId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    state.dungeons[dungeonId] = parsed;
    return parsed;
  } catch (e) {
    console.warn("loadDungeonLayout failed:", e);
    return null;
  }
}

function dungeonIdForEntrance(type, x, y) {
  return `${type}:${x},${y}`;
}

function carveRect(map, x0, y0, w, h, tileId) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (!inBounds(x, y, DUNGEON_W, DUNGEON_H)) continue;
      map.tiles[y][x] = tileId;
    }
  }
}

function pointInRect(x, y, r) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function pointNearRect(x, y, r, pad) {
  return x >= r.x - pad && x < r.x + r.w + pad &&
         y >= r.y - pad && y < r.y + r.h + pad;
}

function carveWigglyCorridor(map, ax, ay, bx, by) {
  const path = [];
  let x = ax, y = ay;
  let guard = 0;

  while ((x !== bx || y !== by) && guard++ < 6000) {
    map.tiles[y][x] = "floor";
    path.push([x, y]);

    const dx = Math.sign(bx - x);
    const dy = Math.sign(by - y);

    let stepX = 0, stepY = 0;

    const chaos = Math.random();
    if (chaos < 0.18) {
      if (Math.random() < 0.5) { stepX = 0; stepY = (Math.random() < 0.5 ? -1 : 1); }
      else { stepY = 0; stepX = (Math.random() < 0.5 ? -1 : 1); }
    } else {
      if (Math.abs(bx - x) > Math.abs(by - y)) { stepX = dx; stepY = 0; }
      else { stepY = dy; stepX = 0; }

      if (Math.random() < 0.22 && dx !== 0 && dy !== 0) {
        if (Math.random() < 0.5) { stepX = dx; stepY = 0; }
        else { stepY = dy; stepX = 0; }
      }
    }

// Failsafe: never allow a 0,0 step (creates duplicate path points and bad gate prev/next)
if (stepX === 0 && stepY === 0) {
  if (dx !== 0) stepX = dx;
  else if (dy !== 0) stepY = dy;
  else stepX = (Math.random() < 0.5 ? -1 : 1); // should never happen, but humans love edge cases
}

    const nx = clamp(x + stepX, 1, DUNGEON_W - 2);
    const ny = clamp(y + stepY, 1, DUNGEON_H - 2);
    x = nx; y = ny;
  }

  map.tiles[y][x] = "floor";
  path.push([x, y]);
  return path;
}

function carveManhattanCorridor(map, ax, ay, bx, by) {
  const path = [];
  let x = ax, y = ay;

  // horizontal first
  while (x !== bx) {
    map.tiles[y][x] = "floor";
    path.push([x, y]);
    x += Math.sign(bx - x);
  }
  // then vertical
  while (y !== by) {
    map.tiles[y][x] = "floor";
    path.push([x, y]);
    y += Math.sign(by - y);
  }

  map.tiles[y][x] = "floor";
  path.push([x, y]);
  return path;
}

function buildDungeonFromPayload(payload) {
  const w = payload?.w ?? (payload?.tiles?.[0]?.length ?? 0);
  const h = payload?.h ?? (payload?.tiles?.length ?? 0);
  const map = emptyMap(w, h, "wall");
  map.tiles = payload.tiles;
  map.objects = Array.from({ length: h }, () => Array.from({ length: w }, () => null));
  map.entrance = payload.entrance ?? null;

  // ---- restore explored (fog-of-war) ----
  map.explored = payload.explored ?? null;
  if (!map.explored || map.explored.length !== h || map.explored[0]?.length !== w) {
    map.explored = Array.from({ length: h }, () => Array.from({ length: w }, () => false));
  }

  if (Array.isArray(payload.objects)) {
    for (const o of payload.objects) {
      if (!o) continue;
      const { x, y, id, meta } = o;
      if (!inBounds(x, y, w, h)) continue;
      map.objects[y][x] = { id, hp: objDef(id)?.hp ?? 1, meta: meta ?? {} };
      if (id === "dungeon_exit") map.spawn = { x, y };   // saved layouts don't store the spawn: it is the exit stairs (otherwise a revisit drops you at (2,2), inside a wall)
    }
  }
  return map;
}


function enforceGateChoke(map, gx, gy, prev, next) {
  const H = map.tiles.length;
  const W = map.tiles[0].length;

  const keep = new Set([
    `${gx},${gy}`,
    `${prev[0]},${prev[1]}`,
    `${next[0]},${next[1]}`
  ]);

  for (let y = gy - 1; y <= gy + 1; y++) {
    for (let x = gx - 1; x <= gx + 1; x++) {
      if (x < 1 || y < 1 || x > W - 2 || y > H - 2) continue;

      // keep only the gate tile + the two corridor tiles along the path
      if (keep.has(`${x},${y}`)) continue;

      // if it was carved as floor, re-wall it to prevent bypass
      if (map.tiles[y][x] === "floor") {
        map.tiles[y][x] = "wall";
        // also clear any object there, just in case
        map.objects[y][x] = null;
      }
    }
  }

  // Ensure the three "kept" tiles are definitely floor
  map.tiles[gy][gx] = "floor";
  map.tiles[prev[1]][prev[0]] = "floor";
  map.tiles[next[1]][next[0]] = "floor";
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function randomEmptyFloorInRect(map, rect, tries = 200) {
  for (let i = 0; i < tries; i++) {
    const x = randInt(rect.x + 1, rect.x + rect.w - 2);
    const y = randInt(rect.y + 1, rect.y + rect.h - 2);
    if (map.tiles?.[y]?.[x] !== "floor") continue;
    if (map.objects?.[y]?.[x]) continue;
    return { x, y };
  }
  return null;
}

function drawRunestoneReader() { hudDrawRunestone(); }   // src/ui/panels3.js

// Temporary: replace later with your real message table / seeded messages
// ----------------------------------------------------
// Rune puzzle clues (painted on dungeon floor)
// ----------------------------------------------------

function buildRuneClueCounts(combo) {
  return combo.map((rune, index) => ({
    rune,
    count: index + 1
  }));
}

function placeRuneCluesInChamber(map, chamber, combo, chestX, chestY) {
  const clues = buildRuneClueCounts(combo);
  const totalNeeded = clues.reduce((a, c) => a + c.count, 0); // must be 10

  const CRITICAL = new Set(["dungeon_chest", "dungeon_exit", "dungeon_gate", "rune_clue", "runestone", "dropped_item"]);

  const W = map.tiles?.[0]?.length ?? 0;
  const H = map.tiles?.length ?? 0;
  if (!(W && H)) return false;

  if (typeof chestX !== "number" || typeof chestY !== "number") return false;
  if (chestX < 0 || chestX >= W || chestY < 0 || chestY >= H) return false;

  const isFloor = (x, y) => map.tiles?.[y]?.[x] === "floor";

  const floorNeighbors = (x, y) => {
    let n = 0;
    if (x > 0 && isFloor(x - 1, y)) n++;
    if (x < W - 1 && isFloor(x + 1, y)) n++;
    if (y > 0 && isFloor(x, y - 1)) n++;
    if (y < H - 1 && isFloor(x, y + 1)) n++;
    return n;
  };

  // Room-ish tile heuristic:
  // Corridors typically have 1-2 floor neighbors; rooms have 3-4.
  const isRoomy = (x, y) => floorNeighbors(x, y) >= 3;

  // --- Room-only flood fill starting at chest ---
  // We allow starting tile even if it's not "roomy", but expansion only proceeds through roomy tiles.
  const q = [[chestX, chestY]];
  const seen = new Set([chestX + "," + chestY]);

  const region = [];
  let minX = chestX, maxX = chestX, minY = chestY, maxY = chestY;

  const push = (nx, ny) => {
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) return;
    const k = nx + "," + ny;
    if (seen.has(k)) return;
    seen.add(k);
    q.push([nx, ny]);
  };

  while (q.length) {
    const [x, y] = q.shift();
    if (!isFloor(x, y)) continue;

    // Include this tile as part of the "room region" if it's roomy OR it's the chest tile itself
    const include = (x === chestX && y === chestY) || isRoomy(x, y);

    if (include) {
      region.push({ x, y });
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      // Expand only through roomy tiles (prevents leaking down corridors)
      if (isRoomy(x, y)) {
        push(x + 1, y);
        push(x - 1, y);
        push(x, y + 1);
        push(x, y - 1);
      } else {
        // chest tile not roomy: still try to step into adjacent roomy tiles once
        if (x === chestX && y === chestY) {
          if (x > 0 && isRoomy(x - 1, y)) push(x - 1, y);
          if (x < W - 1 && isRoomy(x + 1, y)) push(x + 1, y);
          if (y > 0 && isRoomy(x, y - 1)) push(x, y - 1);
          if (y < H - 1 && isRoomy(x, y + 1)) push(x, y + 1);
        }
      }
    }
  }

  // Build candidate tiles INSIDE THIS ROOM REGION
  const candidates = [];
  for (const t of region) {
    const x = t.x, y = t.y;

    // never place directly on chest
    if (x === chestX && y === chestY) continue;

    const obj = map.objects?.[y]?.[x] ?? null;
    if (obj && CRITICAL.has(obj.id)) continue; // don't overwrite critical stuff

    candidates.push({ x, y });
  }

  if (candidates.length < totalNeeded) {
    console.warn("[DUNGEON] Not enough room tiles for rune clues (room-only)", {
      totalNeeded,
      available: candidates.length,
      chestX, chestY,
      regionSize: region.length
    });
    return false;
  }

  // Clear only within this room region (DON'T wipe other puzzle's clues)
  for (const t of region) {
    const o = map.objects?.[t.y]?.[t.x];
    if (o?.id === "rune_clue") map.objects[t.y][t.x] = null;
  }

  // --- Spread via grid buckets over this room's bounding box ---
  const boxW = Math.max(1, (maxX - minX + 1));
  const boxH = Math.max(1, (maxY - minY + 1));
  const gw = Math.max(4, Math.min(10, Math.floor(boxW / 4)));
  const gh = Math.max(4, Math.min(10, Math.floor(boxH / 4)));
  const cellW = boxW / gw;
  const cellH = boxH / gh;

  const buckets = new Map();
  for (const t of candidates) {
    const cx = Math.min(gw - 1, Math.max(0, Math.floor((t.x - minX) / cellW)));
    const cy = Math.min(gh - 1, Math.max(0, Math.floor((t.y - minY) / cellH)));
    const key = cx + "," + cy;
    let arr = buckets.get(key);
    if (!arr) { arr = []; buckets.set(key, arr); }
    arr.push(t);
  }

  let bucketKeys = Array.from(buckets.keys());
  for (let i = bucketKeys.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [bucketKeys[i], bucketKeys[j]] = [bucketKeys[j], bucketKeys[i]];
  }
  for (const key of bucketKeys) {
    const arr = buckets.get(key);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  const picked = [];
  const used = new Set();
  let bi = 0;

  while (picked.length < totalNeeded && bucketKeys.length) {
    const key = bucketKeys[bi % bucketKeys.length];
    const arr = buckets.get(key);

    let chosen = null;
    while (arr && arr.length) {
      const t = arr.pop();
      const k = t.x + "," + t.y;
      if (used.has(k)) continue;
      used.add(k);
      chosen = t;
      break;
    }
    if (chosen) picked.push(chosen);

    if (!arr || arr.length === 0) {
      buckets.delete(key);
      bucketKeys = bucketKeys.filter(k => k !== key);
    } else {
      bi++;
    }
  }

  // Fallback: fill remaining from candidates shuffled
  if (picked.length < totalNeeded) {
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const t of candidates) {
      const k = t.x + "," + t.y;
      if (used.has(k)) continue;
      used.add(k);
      picked.push(t);
      if (picked.length === totalNeeded) break;
    }
  }

  if (picked.length !== totalNeeded) {
    console.warn("[DUNGEON] Rune clue pick failed (room-only)", { totalNeeded, placed: picked.length });
    return false;
  }

  // Place runes (tag them to this chest so you can debug/clean later)
  let idx = 0;
  for (const clue of clues) {
    for (let i = 0; i < clue.count; i++) {
      const spot = picked[idx++];
      if (!spot) return false;
      if (!map.objects[spot.y]) map.objects[spot.y] = [];
      map.objects[spot.y][spot.x] = {
        id: "rune_clue",
        hp: 1,
        meta: { rune: clue.rune, chestX, chestY }
      };
    }
  }

  // Verify within THIS ROOM ONLY (not global)
  let placed = 0;
  for (const t of region) {
    if (map.objects?.[t.y]?.[t.x]?.id === "rune_clue") placed++;
  }
  if (placed !== totalNeeded) {
    console.warn("[DUNGEON] Rune clue mismatch in room", { placed, totalNeeded, chestX, chestY });
    return false;
  }

  return true;
}

function countRunes(map){
  let n=0;
  for(let y=0;y<map.objects.length;y++){
    for(let x=0;x<map.objects[y].length;x++){
      if(map.objects[y][x]?.id==="rune_clue") n++;
    }
  }
  // console.log("Rune clues:", n);
}

function makeUniqueRuneCombo(len) {
  const pool = [];
  for (let i = 1; i <= RUNE_COUNT; i++) pool.push(i);

  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, len);
}

function randomEmptyFloorInRect(map, rect, tries = 400) {
  for (let i = 0; i < tries; i++) {
    const x = randInt(rect.x, rect.x + rect.w - 1);
    const y = randInt(rect.y, rect.y + rect.h - 1);
    if (map.tiles?.[y]?.[x] !== "floor") continue;
    if (map.objects?.[y]?.[x]) continue;
    return { x, y };
  }
  return null;
}

function rollRuneCombo(len = 4, maxRune = 13) {
  const combo = [];
  for (let i = 0; i < len; i++) {
    combo.push(randInt(1, maxRune));
  }
  return combo;
}

function isProtectedDungeonObject(o) {
  if (!o) return false;
  if (o.id === "rune_clue") return true;
  if (o.id === "dungeon_chest") return true;
  if (o.id === "dungeon_gate") return true;
  if (o.id === "dungeon_exit") return true;
  return false;
}

function placeChestsInDungeon(map, chambers) {
  if (!objDef("chest")) return;
  if (!Array.isArray(chambers) || chambers.length === 0) return;

  for (const chamber of chambers) {
    const want = randInt(1, 3);

    let placed = 0;
    let safety = 0;

    while (placed < want && safety++ < 600) {
      const spot = randomEmptyFloorInRect(map, chamber, 250);
      if (!spot) break;

      // avoid stacking on spawn/exit if chamber 0 happens to contain them
      if (map.spawn && spot.x === map.spawn.x && spot.y === map.spawn.y) continue;

      const here = map.objects?.[spot.y]?.[spot.x];
      if (here) continue;

      map.objects[spot.y][spot.x] = {
        id: "chest",
        hp: objDef("chest")?.hp ?? 1,
        meta: { dungeonChest: true }
      };

      placed++;
    }
  }
}

function clearAllRuneClues(map) {
  for (let y = 0; y < (map.objects?.length ?? 0); y++) {
    for (let x = 0; x < (map.objects?.[y]?.length ?? 0); x++) {
      if (map.objects?.[y]?.[x]?.id === "rune_clue") map.objects[y][x] = null;
    }
  }
}

// Place rune clues AFTER all other dungeon content so nothing overwrites them.
// ------------------------------------------------------------------------------------------------
// Dungeon puzzles. The chambers form a chain: chamber i is separated from chamber i+1 by gate i. Every chamber holds ONE puzzle
// chest, in the part of the dungeon you can reach before that chamber's gate:
//   "runes"  - ten rune clues are painted on the floor; count them to get the 4-rune code
//   "riddle" - a runestone (read with a Cipher) poses a riddle; the chest wants the one-word answer
// Solving it gives a Dungeon Key (opens the gate out of the chamber). The last chamber has no gate to open, so its chest holds treasure.
// ------------------------------------------------------------------------------------------------

/** Tiles reachable from (sx,sy) on foot, with only the gates in `open` (a Set of gate indexes) passable. Returns a Set of "x,y". */
function dungeonFlood(map, open, sx, sy) {
  const seen = new Set([sx + "," + sy]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + "," + ny;
      if (seen.has(k) || map.tiles?.[ny]?.[nx] !== "floor") continue;
      const o = map.objects?.[ny]?.[nx];
      if (o?.id === "dungeon_gate" && !open.has(o.meta?.gateIndex)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}
const chamberCenter = (c) => [Math.floor(c.x + c.w / 2), Math.floor(c.y + c.h / 2)];

/** The gates must really chain the chambers: before gate k is opened you can reach chamber k but not chamber k+1 (no corridor bypasses a gate). */
function validateDungeonChain(map, chambers, sx, sy) {
  const n = chambers.length;
  for (let k = 0; k < n - 1; k++) {
    const open = new Set(Array.from({ length: k }, (_, i) => i)), reach = dungeonFlood(map, open, sx, sy);
    const [ax, ay] = chamberCenter(chambers[k]), [bx, by] = chamberCenter(chambers[k + 1]);
    if (!reach.has(ax + "," + ay) || reach.has(bx + "," + by)) return false;
  }
  const all = dungeonFlood(map, new Set(Array.from({ length: n - 1 }, (_, i) => i)), sx, sy), [lx, ly] = chamberCenter(chambers[n - 1]);
  return all.has(lx + "," + ly);
}

function pickDungeonRiddle(used) {
  const pool = Object.values(state.data?.riddles ?? {}).filter(r => !used.has(r.id));
  const from = pool.length ? pool : Object.values(state.data?.riddles ?? {});
  return from.length ? from[randInt(0, from.length - 1)] : null;
}

function placeChamberPuzzles(map, chambers, sx, sy) {
  const n = chambers.length;
  const haveRiddles = !!(objDef("runestone") && Object.keys(state.data?.riddles ?? {}).length);
  // choose a puzzle type per chamber at random, but never the same type everywhere
  const types = chambers.map(() => (haveRiddles && Math.random() < 0.5 ? "riddle" : "runes"));
  if (haveRiddles && n >= 2 && types.every(t => t === types[0])) types[randInt(0, n - 1)] = types[0] === "riddle" ? "runes" : "riddle";

  const usedRiddles = new Set(), taken = new Set([sx + "," + sy]);
  let anyRiddle = false;

  // a free floor tile inside chamber i (not the exit) that you can reach before gate i
  const spotIn = (i, reach) => {
    const c = chambers[i];
    for (let t = 0; t < 600; t++) {
      const x = randInt(c.x + 1, c.x + c.w - 2), y = randInt(c.y + 1, c.y + c.h - 2), k = x + "," + y;
      if (map.tiles?.[y]?.[x] !== "floor" || map.objects?.[y]?.[x] || taken.has(k) || !reach.has(k)) continue;
      if (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1) continue;
      taken.add(k); return { x, y };
    }
    return null;
  };

  for (let i = 0; i < n; i++) {
    const reach = dungeonFlood(map, new Set(Array.from({ length: i }, (_, g) => g)), sx, sy);
    const spot = spotIn(i, reach); if (!spot) return false;
    const reward = i < n - 1 ? "key" : "treasure";
    const meta = { puzzle: types[i], reward, chamber: i, chestX: spot.x, chestY: spot.y };

    if (types[i] === "riddle") {
      const riddle = pickDungeonRiddle(usedRiddles), stone = spotIn(i, reach);
      if (!riddle || !stone) return false;
      usedRiddles.add(riddle.id); anyRiddle = true;
      meta.riddleId = riddle.id;
      map.objects[stone.y][stone.x] = { id: "runestone", hp: objDef("runestone")?.hp ?? 1, meta: { riddle: true, riddleId: riddle.id, chamber: i, msg: riddle.text } };
    } else {
      meta.combo = rollRuneCombo(); meta.isRunePuzzle = true;
      if (!map._pendingRuneClues) map._pendingRuneClues = [];
      map._pendingRuneClues.push({ chamber: chambers[i], combo: meta.combo, chestX: spot.x, chestY: spot.y });
    }
    map.objects[spot.y][spot.x] = { id: "dungeon_chest", hp: 999, meta };
  }

  // riddle stones are only readable with a Cipher: make sure one can be picked up before the first gate
  if (anyRiddle && state.data?.items?.cipher) {
    const reach0 = dungeonFlood(map, new Set(), sx, sy), c = spotIn(0, reach0);
    if (!c) return false;
    map.objects[c.y][c.x] = { id: "dropped_item", hp: 1, meta: { itemId: "cipher", qty: 1 } };
  }
  return true;
}

function finalizePendingRuneClues(map) {
  const jobs = map._pendingRuneClues ?? [];
  if (!jobs.length) return true;

  // wipe any stray clue objects first (safety)
  clearAllRuneClues(map);

  for (const job of jobs) {
    const { chamber, combo, chestX, chestY } = job;

    // hard requirement: MUST place all 10 inside the chest's chamber
    const ok = placeRuneCluesInChamber(map, chamber, combo, chestX, chestY);
    if (!ok) {
      console.warn("[DUNGEON] finalizePendingRuneClues failed", job);
      return false;
    }
  }

  return true;
}

function generateDungeon(dungeonId, entrance) {
  const map = emptyMap(DUNGEON_W, DUNGEON_H, "wall");
  map.entrance = entrance;

  const chambersN = randInt(3, 5);
  const chambers = [];

  for (let i = 0; i < chambersN; i++) {
    const cw = randInt(12, 20);
    const ch = randInt(12, 20);

    let placed = false;
    for (let t = 0; t < 120 && !placed; t++) {
      const x = randInt(2, DUNGEON_W - cw - 3);
      const y = randInt(2, DUNGEON_H - ch - 3);

      const pad = 2;
      const overlaps = chambers.some(r =>
        x < r.x + r.w + pad && x + cw + pad > r.x &&
        y < r.y + r.h + pad && y + ch + pad > r.y
      );
      if (overlaps) continue;

      const rect = { x, y, w: cw, h: ch };
      chambers.push(rect);
      carveRect(map, x, y, cw, ch, "floor");
      placed = true;
    }
  }

  // --- HARD REQUIREMENT: at least 3 chambers, otherwise regenerate ---
  // Sometimes placement fails due to overlaps/space, leaving us with 0-1 rooms.
  if (chambers.length < 3) {
    console.warn("[DUNGEON] chamber placement failed (", chambers.length, "). Regenerating…");
    return generateDungeon(dungeonId, entrance);
  }

  // Connect chambers with twisty corridors + locked gates
  for (let i = 0; i < chambers.length - 1; i++) {
    const a = chambers[i];
    const b = chambers[i + 1];

    const ax = Math.floor(a.x + a.w / 2);
    const ay = Math.floor(a.y + a.h / 2);
    const bx = Math.floor(b.x + b.w / 2);
    const by = Math.floor(b.y + b.h / 2);

    let path = carveWigglyCorridor(map, ax, ay, bx, by);

// If the wiggle corridor failed to actually reach the target,
// fall back to a guaranteed Manhattan corridor so prune doesn't delete rooms.
const last = path[path.length - 1];
if (!last || last[0] !== bx || last[1] !== by) {
  console.warn("[DUNGEON] wiggly corridor failed, using fallback", { ax, ay, bx, by, last });
  path = carveManhattanCorridor(map, ax, ay, bx, by);
}

    // Gate roughly mid-connection, not inside either chamber
    let gate = null;
    let gateK = -1;

    const start = Math.floor(path.length * 0.35);
    const end = Math.floor(path.length * 0.65);

    for (let k = start; k <= end; k++) {
      const [gx, gy] = path[k];
      // Keep the gate far enough away that enforceGateChoke's 3x3 can't chew into room floors
if (pointNearRect(gx, gy, a, 2) || pointNearRect(gx, gy, b, 2)) continue;
      gate = { x: gx, y: gy };
      gateK = k;
      break;
    }

    if (!gate) {
      for (let k = 1; k < path.length - 1; k++) {
        const [gx, gy] = path[k];
        // Keep the gate far enough away that enforceGateChoke's 3x3 can't chew into room floors
if (pointNearRect(gx, gy, a, 2) || pointNearRect(gx, gy, b, 2)) continue;
        gate = { x: gx, y: gy };
        gateK = k;
        break;
      }
    }

    // HARD REQUIREMENT: ALWAYS place a gate between chambers.
    // If our “safe gate spot” logic couldn't find one, force it anyway.
    if (!gate && path.length >= 3) {
      const mid = Math.max(1, Math.min(path.length - 2, Math.floor(path.length / 2)));
      const [gx, gy] = path[mid];
      gate = { x: gx, y: gy };
      gateK = mid;
    }

    if (gate && gateK > 0 && gateK < path.length - 1) {
      const prev = path[gateK - 1];
      const next = path[gateK + 1];

      // Force a 1-tile choke point so the gate can't be bypassed
      enforceGateChoke(map, gate.x, gate.y, prev, next);

      map.objects[gate.y][gate.x] = {
        id: "dungeon_gate",
        hp: 999,
        meta: { locked: true, gateIndex: i }
      };
    }
  }

  // Entrance/exit: center of first chamber
  const first = chambers[0] ?? { x: Math.floor(DUNGEON_W / 2), y: Math.floor(DUNGEON_H / 2), w: 10, h: 10 };
  const ex = Math.floor(first.x + first.w / 2);
  const ey = Math.floor(first.y + first.h / 2);
  map.tiles[ey][ex] = "floor";
  map.objects[ey][ex] = { id: "dungeon_exit", hp: 999, meta: {} };
  map.spawn = { x: ex, y: ey };
  pruneDisconnectedFloors(map, ex, ey);
  
    // --- POST-PRUNE VALIDATION ---
  // If pruneDisconnectedFloors leaves only a tiny connected blob, reroll.
  let floorCount = 0;
  for (let yy = 0; yy < DUNGEON_H; yy++) {
    for (let xx = 0; xx < DUNGEON_W; xx++) {
      if (map.tiles[yy][xx] === "floor") floorCount++;
    }
  }

  const exitStillThere = (map.objects?.[ey]?.[ex]?.id === "dungeon_exit");

  // Tune this threshold if desired. 250 is a good “not pathetic” minimum.
  if (!exitStillThere || floorCount < 250) {
    console.warn("[DUNGEON] rejected after prune", { exitStillThere, floorCount, chambers: chambers.length });
    return generateDungeon(dungeonId, entrance);
  }

  // --- HARD REQUIREMENT: chambers must be separated by locked gates ---
  // We connect chambers sequentially, so minimum gates should be chambers.length - 1.
  let gateCountNow = 0;
  for (let yy = 0; yy < DUNGEON_H; yy++) {
    for (let xx = 0; xx < DUNGEON_W; xx++) {
      if (map.objects?.[yy]?.[xx]?.id === "dungeon_gate") gateCountNow++;
    }
  }

  const minGates = Math.max(2, chambers.length - 1); // at least 2, and ideally one per link
  if (gateCountNow < minGates) {
    console.warn("[DUNGEON] rejected: missing locked gates after prune", { gateCountNow, minGates, chambers: chambers.length });
    return generateDungeon(dungeonId, entrance);
  }

map._pendingRuneClues = [];
clearAllRuneClues(map);

  // Every chamber gets a puzzle chest (rune lock or riddle); each solved one yields the key for the gate that leaves its chamber
  if (!validateDungeonChain(map, chambers, ex, ey)) {
    console.warn("[DUNGEON] rejected: gates do not form a clean chain between chambers");
    return generateDungeon(dungeonId, entrance);
  }
  if (!placeChamberPuzzles(map, chambers, ex, ey)) {
    console.warn("[DUNGEON] rejected: could not place a puzzle in every chamber");
    return generateDungeon(dungeonId, entrance);
  }
  placeChestsInDungeon(map, chambers);

  // Dungeon contents (only if they exist)
  const floorTiles = ["floor"];
  if (objDef("rock")) placeObjects(map, DUNGEON_W, DUNGEON_H, "rock", floorTiles, 18);
  if (objDef("stone")) placeObjects(map, DUNGEON_W, DUNGEON_H, "stone", floorTiles, 20);
  if (objDef("wild_mushrooms")) placeObjects(map, DUNGEON_W, DUNGEON_H, "wild_mushrooms", floorTiles, 14);
  if (objDef("rat1")) placeObjects(map, DUNGEON_W, DUNGEON_H, "rat1", floorTiles, 10);
  if (objDef("rat2")) placeObjects(map, DUNGEON_W, DUNGEON_H, "rat2", floorTiles, 8);

// --- Rune clues MUST be placed last so nothing overwrites them ---
if (!finalizePendingRuneClues(map)) {
  console.warn("[DUNGEON] rejected: rune clue finalization failed");
  return generateDungeon(dungeonId, entrance);
}

  // --- HARD REQUIREMENT: exit must exist at spawn ---
  // Re-stamp in case anything ever touched it.
  map.tiles[ey][ex] = "floor";
  map.objects[ey][ex] = { id: "dungeon_exit", hp: 999, meta: {} };
  map.spawn = { x: ex, y: ey };

  // Persist immediately
  state.dungeon = map;
  state.dungeonId = dungeonId;
  saveDungeonLayout(dungeonId);

// fog-of-war grid for dungeons
map.explored = Array.from({ length: DUNGEON_H }, () => Array.from({ length: DUNGEON_W }, () => false));

  return map;
}

function pruneDisconnectedFloors(map, sx, sy) {
  const H = map.tiles.length, W = map.tiles[0].length;
  const seen = Array.from({ length: H }, () => Array(W).fill(false));
  const q = [[sx, sy]];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

  const isFloor = (x,y) => map.tiles[y]?.[x] === "floor";

  if (!isFloor(sx, sy)) return;

  seen[sy][sx] = true;
  while (q.length) {
    const [x,y] = q.shift();
    for (const [dx,dy] of dirs) {
      const nx = x+dx, ny = y+dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (seen[ny][nx]) continue;
      if (!isFloor(nx, ny)) continue;
      seen[ny][nx] = true;
      q.push([nx, ny]);
    }
  }

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (map.tiles[y][x] === "floor" && !seen[y][x]) {
      map.tiles[y][x] = "wall";
      map.objects[y][x] = null;
    }
  }
}
function pickupObject(x, y) {
  const map = getCurrentMap();
  const obj = map.objects[y][x];
  if (!obj) return;

  const def = objDef(obj.id);
  if (!def?.pickup) return;

  const pName = activePlayer().name;

  const inv = activeInv();
  for (const [itemId, amt] of Object.entries(def.pickup.gives)) {
    const res = addItemOrDrop(inv, itemId, amt, x, y, pName);
    playSound("pickup");

    const itemName = itemDef(itemId)?.name ?? itemId;
    const got = (typeof res === "object" && typeof res.added === "number") ? res.added : amt;

    if (got > 0) {
      logAction(`${pName} picked up ${got} ${itemName}${got === 1 ? "" : "s"}.`);
    }
  }

  setOverworldObject(x, y, null);
  closeMenu();
}

function toolboxLoot(inv, amount = 1, dropX, dropY) {
  const pName = activePlayer().name;
  playSound("chest");
  logAction(`${pName} opened a toolbox.`);

  const tools = ["axe","hammer","pickaxe","fishing_pole","matches","saw","bucket","wrench","shovel","spade","knife","bow_and_arrow","cooking_pot","frying_pan","kitchen_knife","cooking_spoon","mixing_bowl","cutting_board","kettle","juicer"];

  lootScraps(inv, pName, { metal_scrap: [0.6, 1, 3], electronic_scrap: [0.4, 1, 2], glass: [0.15, 1, 2], cloth: [0.15, 1, 2] });
  if (Math.random() < 0.25) rollFurnitureScroll(inv, pName);

  for (let i = 0; i < amount; i++) {
    const toolId = tools[randInt(0, tools.length - 1)];
    const res = addItemOrDrop(inv, toolId, 1, dropX, dropY, pName);

    const toolName = itemDef(toolId)?.name ?? toolId;
    if (res.added > 0) {
      const article = /^[aeiou]/i.test(toolName) ? "an" : "a";
      logAction(`${pName} found ${article} ${toolName}!`);
    }
  }
}

/** Rolls [chance, min, max] per material and gives what comes up. */
function lootScraps(inv, pName, table) {
  for (const [id, [chance, lo, hi]] of Object.entries(table)) {
    if (Math.random() >= chance) continue;
    const amt = randInt(lo, hi); addItem(inv, id, amt);
    logAction(`${pName} found ${amt} ${itemDef(id)?.name ?? id}!`);
  }
}

/** Drops one recipe scroll for a piece of furniture you don't know yet: first a random category, then a random piece in it (so the 70 utensils don't drown out the 7 beds). */
function rollFurnitureScroll(inv, pName) {
  const groups = {};
  for (const f of Object.values(state.data?.furniture ?? {})) {
    if (state.learnedRecipes.has(f.recipe) || getQty(inv, f.recipe) > 0) continue;
    (groups[f.cat] ||= []).push(f);
  }
  const cats = Object.keys(groups); if (!cats.length) return;
  const list = groups[cats[randInt(0, cats.length - 1)]], f = list[randInt(0, list.length - 1)];
  if (addItem(inv, f.recipe, 1).added > 0) logAction(`${pName} found a recipe: ${f.name}!`);
}

function chestLoot(inv, dropX, dropY) {
  const pName = activePlayer().name;
  playSound("chest");
  logAction(`${pName} opened a chest.`);

  const tools = ["axe", "hammer", "pickaxe", "fishing_pole", "matches", "saw", "bucket", "wrench", "shovel", "spade", "knife", "bow_and_arrow", "cooking_pot", "frying_pan", "kitchen_knife", "cooking_spoon", "mixing_bowl", "cutting_board", "kettle", "juicer"];

  // Chance to find a Cipher (used to decipher runestones)
  if (state.data?.items?.cipher) {
    const already = getQty(inv, "cipher") > 0;

    // Higher chance until you have one, then rarer extras
    const chance = already ? 0.12 : 0.45;

    if (Math.random() < chance) {
      const res = addItemOrDrop(inv, "cipher", 1, dropX, dropY, pName);
      if (res.added > 0) logAction(`${pName} found a Cipher!`);
    }
  }

const allRecipeScrolls = Object.keys(state.data.items).filter(id =>
  isRecipeScroll(id) && recipeIdFromScroll(id) // only if it maps to a real recipe
);

// Only allow:
// - unlearned recipes freely
// - learned recipes only if we haven't dropped the "one extra" copy yet
const lootableRecipeScrolls = allRecipeScrolls.filter(scrollId => {
  const rid = recipeIdFromScroll(scrollId);
  if (!rid || itemDef(scrollId)?.group) return false;   // (furniture scrolls drop through rollFurnitureScroll below)
  if (!state.learnedRecipes.has(rid)) return true;
  return (state.recipeLootExtra[rid] ?? 0) < 1;
});

  const hashouseBlueprint = getQty(inv, "blueprint_house") > 0;
  const pieces = getQty(inv, "blueprint_piece");

  // Main loot roll
  const roll = Math.random();
  if (!hashouseBlueprint && pieces < 6 && roll < 0.65) {
    addItem(inv, "blueprint_piece", 1);
    logAction(`${pName} found a blueprint piece!`);
} else {
  // Chance to drop a recipe scroll; otherwise drop a tool like before
  if (lootableRecipeScrolls.length > 0 && Math.random() < 0.35) {
    const scrollId = lootableRecipeScrolls[randInt(0, lootableRecipeScrolls.length - 1)];
    const rid = recipeIdFromScroll(scrollId);

    addItem(inv, scrollId, 1);
    logAction(`${pName} found a ${itemDef(scrollId)?.name ?? scrollId}!`);

    // If it was already learned, this is the single allowed "extra" copy for trading
    if (rid && state.learnedRecipes.has(rid)) {
      state.recipeLootExtra[rid] = 1;
    }
  } else {
    const tool = tools[randInt(0, tools.length - 1)];
    addItem(inv, tool, 1);
    logAction(`${pName} found an ${itemDef(tool)?.name ?? tool}!`);
  }
}

  // Salvage for building things
  lootScraps(inv, pName, { metal_scrap: [0.35, 1, 3], electronic_scrap: [0.25, 1, 2], cloth: [0.25, 1, 3], glass: [0.2, 1, 2] });
  if (Math.random() < 0.35) rollFurnitureScroll(inv, pName);

  // Arrow-making supplies
  if (Math.random() < 0.3) { const amt = randInt(1, 3); addItem(inv, "feather", amt); logAction(`${pName} found ${amt} ${itemDef("feather")?.name ?? "feather"}${amt === 1 ? "" : "s"}!`); }
  if (Math.random() < 0.25) { const amt = randInt(1, 3); addItem(inv, "stone_arrowhead", amt); logAction(`${pName} found ${amt} ${itemDef("stone_arrowhead")?.name ?? "arrowhead"}${amt === 1 ? "" : "s"}!`); }
  if (Math.random() < 0.2) { const amt = randInt(2, 5); addItem(inv, "arrow", amt); logAction(`${pName} found ${amt} ${itemDef("arrow")?.name ?? "arrow"}${amt === 1 ? "" : "s"}!`); }

  // Extra small loot (log each if it happens)
  if (Math.random() < 0.35) {
    const amt = randInt(1, 3);
    addItem(inv, "stick", amt);
    logAction(`${pName} found ${amt} ${itemDef("stick")?.name ?? "stick"}${amt === 1 ? "" : "s"}!`);
  }

  if (Math.random() < 0.25) {
    const amt = randInt(1, 4);
    addItem(inv, "stone", amt);
    logAction(`${pName} found ${amt} ${itemDef("stone")?.name ?? "stone"}${amt === 1 ? "" : "s"}!`);
  }

  // Seeds for the garden (watermelons only grow from these)
  if (Math.random() < 0.2) {
    const seeds = Object.keys(state.data.items).filter((id) => itemDef(id)?.tags?.includes("seed"));
    if (seeds.length) { const sid = seeds[randInt(0, seeds.length - 1)]; addItem(inv, sid, randInt(1, 3)); logAction(`${pName} found some ${itemDef(sid)?.name ?? sid}!`); }
  }

  // Snacks (items tagged "snack")
  const snackIds = Object.keys(state.data.items).filter(id => {
    const it = itemDef(id);
    return Array.isArray(it?.tags) && it.tags.includes("snack");
  });

  if (snackIds.length > 0 && Math.random() < 0.30) {
    const snackId = snackIds[randInt(0, snackIds.length - 1)];
    const amt = randInt(1, 2);
    addItemOrDrop(inv, snackId, amt, dropX, dropY, pName);
    const nm = itemDef(snackId)?.name ?? snackId;
    logAction(`${pName} found ${amt} ${nm}${amt === 1 ? "" : "s"}!`);
  }
  
    // Treasure maps (special quest item)
  if (Math.random() < 0.10) {
    const res = addItemOrDrop(inv, "treasure_map", 1, dropX, dropY, pName);
    if (res.added > 0) logAction(`${pName} found a Treasure Map!`);
  }

    // Collectibles (items tagged "collectible")
  const collectibleIds = Object.keys(state.data.items).filter(id => {
    const it = itemDef(id);
    return Array.isArray(it?.tags) && it.tags.includes("collectible");
  });

  // Small chance to drop a collectible (1x)
  if (collectibleIds.length > 0 && Math.random() < 0.22) {
    const cid = collectibleIds[randInt(0, collectibleIds.length - 1)];
    const res = addItemOrDrop(inv, cid, 1, dropX, dropY, pName);

    if (res.added > 0) {
      const nm = itemDef(cid)?.name ?? cid;
      const article = /^[aeiou]/i.test(nm) ? "an" : "a";
	  playSound("achievement");
      logAction(`${pName} found ${article} ${nm}!`);
    }
  }

  // Auto-assemble blueprint at 6 pieces
const newPieces = getQty(inv, "blueprint_piece");
if (newPieces >= 6 && getQty(inv, "blueprint_house") === 0) {
  // Find a slot that contains blueprint pieces
  const idx = inv.findIndex(s => s && s.id === "blueprint_piece" && s.qty > 0);

  if (idx !== -1) {
    // Remove 6 pieces from that slot first
    inv[idx].qty -= 6;

    // If that stack is now empty (<=0), CONVERT THAT SLOT into the blueprint.
    if (inv[idx].qty <= 0) {
      inv[idx] = { id: "blueprint_house", qty: 1 };
    } else {
      // Otherwise, we still need to add the blueprint somewhere else.
      // This should succeed because we didn't rely on a "freed slot".
      const ok = addItem(inv, "blueprint_house", 1);
      if (!ok) {
        // If your addItem can fail when full, drop it instead
        addDroppedItem(activePlayer().x, activePlayer().y, "blueprint_house", 1);
      }
    }

    playSound("achievement");
    logAction(`${pName} assembled a House Blueprint!`);
  }
}
}

function openContainerObject(mapX, mapY) {
  if (state.mode !== "overworld") return;

  const obj = state.world.objects?.[mapY]?.[mapX];
  if (!obj) return;

  const def = objDef(obj.id);
  if (!def?.container) return;

  if (obj.id === "chest") {
    chestLoot(activeInv(), mapX, mapY);
setOverworldObject(mapX, mapY, null);
    closeMenu();
    return;
  }

  if (obj.id === "stockpile") {
    state.stockpileOpen = { key: obj.meta?.key };
    closeMenu();
    return;
  }

  if (obj.id === "toolbox") {
    const amount = def.container?.amount ?? 1;
    toolboxLoot(activeInv(), amount, mapX, mapY);
setOverworldObject(mapX, mapY, null);
    closeMenu();
    return;
  }
}

function openToolkitForActivePlayer() {
  const inv = activeInv();
  if (getQty(inv, "toolkit") <= 0) return;

  const pName = activePlayer().name;

  // consume toolkit
  removeItem(inv, "toolkit", 1);
  playSound("pickup");
  logAction(`${pName} opened a toolkit.`);

  // starter matches for testing campfire
  addItem(inv, "matches", 24);
  logAction(`${pName} got 24 ${itemDef("matches")?.name ?? "matches"}!`);

  // TEMP TEST LOADOUT – one of everything
  const starterTools = [
    "axe",
    "hammer",
    "pickaxe",
    "fishing_pole",
    "saw",
    "knife",
    "bow_and_arrow",
    "bucket",
    "shovel",
    "spade"
  ];

  for (const toolId of starterTools) {
    if (!itemDef(toolId)) continue;
    addItem(inv, toolId, 1);
    const nm = itemDef(toolId)?.name ?? toolId;
    logAction(`${pName} got a ${nm}!`);
  }
}

function openCraftingScreen(mode) {
  state.craftingOpen = true;
  state.craftingMode = mode; // "craft" | "cook"
  state.selectedForCraft.clear();
}

function closeCraftingScreen() {
  state.craftingOpen = false;
  state.craftingMode = null;
  state.selectedForCraft.clear();
}

function tryEnterAt(x, y) {
  const obj = state.world.objects[y]?.[x];
  if (!obj) return;
  const def = objDef(obj.id);
  if (def?.type !== "house" && obj.id !== "house") return;

  // Store where the ACTIVE player entered from (so only they return)
  const p = activePlayer();
  state.interiorReturn = { x: p.x, y: p.y };

  // If we’re trying to keep players independent, don’t “link” them across maps.
  state.holdingHands = null;

  state.interiorId = obj.meta?.interiorId || "house_small";
  state.interior = generateInterior(state.interiorId);
  state.mode = "interior";

  // Place ONLY the active player near interior door
  p.x = 2; 
  p.y = INTERIOR_H - 2;
  p.fx = p.x; 
  p.fy = p.y;
  p.path = [];

  // Stop the other player from continuing a path inside the wrong map context
  for (const pl of state.players) {
    if (pl !== p) pl.path = [];
  }

  state.cam.x = 0; 
  state.cam.y = 0;
  clampCamera();
  closeMenu();
}

// DEV: enter an interior without needing a built house
function devEnterInterior(interiorId = "house_small") {
  state.interiorId = interiorId;
  state.interior = generateInterior(state.interiorId);
  state.mode = "interior";

  // place players near interior door (same as tryEnterAt)
  state.players[0].x = 2; state.players[0].y = INTERIOR_H - 2; state.players[0].fx = 2; state.players[0].fy = INTERIOR_H - 2;
  state.players[1].x = 3; state.players[1].y = INTERIOR_H - 2; state.players[1].fx = 3; state.players[1].fy = INTERIOR_H - 2;

  state.cam.x = 0; state.cam.y = 0;
  clampCamera();
  closeMenu();

  logAction(`DEV: entered interior "${state.interiorId}".`);
}

// DEV: jump to nearest cave/hole and enter dungeon
function devEnterNearestDungeon() {
  if (state.mode !== "overworld") {
    logAction("DEV: must be in overworld to enter a dungeon.");
    return false;
  }

  const p = activePlayer();
  const W = WORLD_W, H = WORLD_H;

  let best = null;
  let bestD = Infinity;

  for (let y = 0; y < H; y++) {
    const row = state.world.objects?.[y];
    if (!row) continue;
    for (let x = 0; x < W; x++) {
      const o = row[x];
      if (!o) continue;
      if (o.id !== "cave" && o.id !== "hole") continue;

      const d = Math.abs(x - p.x) + Math.abs(y - p.y);
      if (d < bestD) { bestD = d; best = { x, y, id: o.id }; }
    }
  }

  if (!best) {
    logAction("DEV: no cave/hole found on the map.");
    return false;
  }

  // Snap player near it first (optional but nice)
  state.players[0].x = best.x; state.players[0].y = best.y + 1;
  state.players[0].fx = state.players[0].x; state.players[0].fy = state.players[0].y; state.players[0].path = [];
  state.players[1].x = best.x + 1; state.players[1].y = best.y + 1;
  state.players[1].fx = state.players[1].x; state.players[1].fy = state.players[1].y; state.players[1].path = [];

  clampCamera();

  // Enter the dungeon using your real pipeline
  return tryEnterDungeonAt(best.x, best.y);
}

function tryExitInterior() {
  if (state.mode !== "interior") return false;
  const p = activePlayer();
  const doorTile = state.data.interiors[state.interiorId].doorTile;

  const nearDoor = neighbors4(p.x, p.y).some(([nx, ny]) =>
    inBounds(nx, ny, INTERIOR_W, INTERIOR_H) && state.interior.tiles[ny][nx] === doorTile
  );
  if (!nearDoor) return false;

  state.mode = "overworld";

  // Return ONLY the active player to where they entered from
  const ret = state.interiorReturn;
  const rx = ret?.x ?? 2;
  const ry = ret?.y ?? 2;

  p.x = rx; 
  p.y = ry;
  p.fx = rx; 
  p.fy = ry;
  p.path = [];

  // Safety: don’t let the other player “keep walking” with overworld rules mid-transition
  for (const pl of state.players) {
    if (pl !== p) pl.path = [];
  }

  clampCamera();
  closeMenu();

  // Clear any leftover move queue; server position already matches the return position
  // because netTick was suppressed while inside the interior.
  if (state.net?.enabled) {
    state.net.moveQueue = [];
    state.net._pendingMove = null;
  }

  return true;
}


function tryEnterDungeonAt(x, y) {
  if (state.mode !== "overworld") return false;
  const obj = state.world.objects?.[y]?.[x];
  if (!obj) return false;
  if (obj.id !== "cave" && obj.id !== "hole") return false;

  const type = obj.id;
  const dungeonId = dungeonIdForEntrance(type, x, y);
  state.dungeonReturn = { x, y, type };

  let saved = loadDungeonLayout(dungeonId);
  if (saved && saved.v !== 2) saved = null;   // an old-style layout: start fresh with the new puzzle layout

const map = saved ? buildDungeonFromPayload(saved) : generateDungeon(dungeonId, { type, x, y });
// console.log("[DUNGEON] source", saved ? "SAVED" : "GENERATED");

  state.dungeon = map;
  state.dungeonId = dungeonId;
  state.mode = "dungeon";

// Stop ambience immediately
if (state.music.ambienceAudio) {
  beginAmbFadeTo(0, 300, () => {
    try { state.music.ambienceAudio.pause(); } catch (_) {}
  });
}
 // --- Fade out current music, switch to a random dungeon track, fade back in ---
  beginFadeTo(0, 300);
  setTimeout(() => {
    const nextName = pickRandomDungeonTrack(state.music.lastTrack);
    state.music.lastTrack = nextName;

    const a = ensureMusicAudio();
    a.src = `src/music/${nextName}.mp3`;
    a.currentTime = 0;

    a.play().then(() => {
      // fade back to slider volume
      beginFadeTo(getMusicVolume(), 600);
    }).catch(() => {
      // if autoplay blocks, at least don't crash
    });
  }, 300);

  const sx = map.spawn?.x ?? 2;
const sy = map.spawn?.y ?? 2;

// Independence mode: entering player goes in, the other stays put.
const p = activePlayer();

// Also kill holding hands so the “drag” logic doesn’t yank the other player across maps.
state.holdingHands = null;

p.x = sx; 
p.y = sy;
p.fx = sx; 
p.fy = sy;
p.path = [];

// Stop non-active from marching around in dungeon rules
for (const pl of state.players) {
  if (pl !== p) pl.path = [];
}


// ---- Dungeon fog-of-war init + first reveal ----
{
  const { w, h } = currentDims();
  if (!state.dungeon.explored || state.dungeon.explored.length !== h || state.dungeon.explored[0]?.length !== w) {
    state.dungeon.explored = Array.from({ length: h }, () => Array.from({ length: w }, () => false));
  }
  revealAroundPlayers(); // reveals around both players using VIS_RADIUS (and holdingHands mult)
}

 const { viewW, viewH } = viewTiles();
state.cam.x = Math.floor(sx - viewW / 2);
state.cam.y = Math.floor(sy - viewH / 2);
clampCamera();
  closeMenu();
  logAction(`${activePlayer().name} entered a dungeon...`);
  return true;
}

function exitDungeon() {
  if (state.mode !== "dungeon") return false;
  const p = activePlayer();

  let nearExit = false;
  for (const [nx, ny] of [[p.x, p.y], ...neighbors4(p.x, p.y)]) {
    const o = state.dungeon?.objects?.[ny]?.[nx];
    if (o && o.id === "dungeon_exit") { nearExit = true; break; }
  }
  if (!nearExit) return false;

  saveDungeonLayout(state.dungeonId);

  const ret = state.dungeonReturn;
  state.mode = "overworld";
  playAmbienceForContext(true);
playRandomMusicForContext(true);
  state.dungeon = null;
  state.dungeonId = null;

const rx = ret?.x ?? 2;
const ry = ret?.y ?? 2;

// Return ONLY the active player
const p2 = activePlayer();
p2.x = rx; 
p2.y = ry;
p2.fx = rx; 
p2.fy = ry;
p2.path = [];

// Keep other player stable
for (const pl of state.players) {
  if (pl !== p2) pl.path = [];
}

  clampCamera();
  closeMenu();
  logAction(`${p.name} escaped the dungeon.`);

  // Clear any leftover move queue from before entering the dungeon.
  // The server kept the player at the dungeon entrance while inside (netTick is suppressed
  // for non-overworld modes), so the server position already matches the return position.
  if (state.net?.enabled) {
    state.net.moveQueue = [];
    state.net._pendingMove = null;
  }

  return true;
}

// house placement (placeholder construction)
function canBuildhouseNow() {
  const inv = activeInv();
  return getQty(inv, "blueprint_house") > 0 && getQty(inv, "hammer") > 0;
}

function placehouseAt(x, y) {
  if (state.mode !== "overworld") return false;
  if (!canBuildhouseNow()) return false;

  // 2x2 footprint
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const tx = x + dx, ty = y + dy;
    if (!inBounds(tx, ty, WORLD_W, WORLD_H)) return false;
    if (!isPassable(tx, ty)) return false;
  }

  removeItem(activeInv(), "blueprint_house", 1);

  state.world.objects[y][x] = { id: "house", hp: 999, meta: { interiorId: "house_small" } };
  state.world.objects[y][x + 1] = { id: "occupied", hp: 999, meta: { parent: [x, y] } };
  state.world.objects[y + 1][x] = { id: "occupied", hp: 999, meta: { parent: [x, y] } };
  state.world.objects[y + 1][x + 1] = { id: "occupied", hp: 999, meta: { parent: [x, y] } };

  saveHouseAt(x, y);

  // Log placement with coords
  const pName = activePlayer().name;
  logAction(`${pName} placed a house at (${x},${y}).`);

  return true;
}

// Stockpile placement + inventory
function placeStockpileAt(x, y) {
  if (state.mode !== "overworld") return false;
  if (!isPassable(x, y)) return false;

  const key = `stockpile:${x},${y}:${Date.now()}`;
  const inv = [];
  state.structures.stockpiles.push({ key, x, y, inv });
  state.world.objects[y][x] = { id: "stockpile", hp: 999, meta: { key, inv } };

  saveStockpileAt(x, y, key);

  // Log placement with coords (requested)
  const pName = activePlayer().name;
  logAction(`${pName} placed a stockpile at (${x},${y}).`);

  return true;
}

function getStockpileByKey(key) {
  if (typeof key === "string" && key.startsWith("f:")) return state._furnStore?.[key] || null;   // a cupboard, drawer or fridge (see openFurnitureStorage)
  // The contents live on the stockpile object itself (meta.inv), so they survive a reload and reach the other player;
  // the record in state.structures is only a cache that is rebuilt from the world on demand.
  const m = /^stockpile:(\d+),(\d+):/.exec(String(key));
  if (m) {
    const o = state.world?.objects?.[+m[2]]?.[+m[1]];
    if (o?.id === "stockpile" && o.meta?.key === key) {
      o.meta.inv = Array.isArray(o.meta.inv) ? o.meta.inv : [];
      let rec = state.structures.stockpiles.find(s => s.key === key);
      if (!rec) { rec = { key, x: +m[1], y: +m[2], inv: o.meta.inv }; state.structures.stockpiles.push(rec); }
      rec.inv = o.meta.inv;
      return rec;
    }
  }
  return state.structures.stockpiles.find(s => s.key === key) || null;
}

/** Open the contents of a storage piece of furniture in the stockpile sheet. The items live on the object itself (meta.inv). */
function openFurnitureStorage(x, y) {
  const obj = state.world.objects?.[y]?.[x], f = obj && state.data.furniture?.[obj.id]; if (!f?.storage) return;
  obj.meta = obj.meta || {}; obj.meta.inv = obj.meta.inv || [];
  const key = `f:${x},${y}`; state._furnStore = state._furnStore || {};
  state._furnStore[key] = { key, x, y, inv: obj.meta.inv, title: f.name, cap: f.cap || INV_SLOTS, furniture: true };
  state.stockpileOpen = { key };
}

// ------------------------------------------------------------------------------ Context menu ----
function openMenu(opts) {
  state.menu = {
    screenX: opts.screenX,
    screenY: opts.screenY,
    title: opts.title,
    options: opts.options,
    hoverIndex: -1,
    _justOpened: true
  };
}

function closeMenu() { state.menu = null; }

function openMenuForPlayer(plIndex, screenX, screenY) {
  const pl = state.players[plIndex];
  const inv = activeInv();
  const options = [];

  if (state.holdingHands && (state.holdingHands.a === plIndex || state.holdingHands.b === plIndex)) {
    options.push({ label: "Let go of hands", action: () => { endHoldingHands(`${pl.name} let go.`); closeMenu(); } });
  }

  if (pl.pose?.kind === "sit") options.push({ label: "Stand up", action: () => { setPose(plIndex, null); closeMenu(); } });
  if (pl.pose?.kind === "sit") {
    const lapCat = catPerchedOn(pl.pose.tx, pl.pose.ty);
    if (lapCat) options.push({ label: "Pet the cat", action: withSfx("cat", () => { petCat(lapCat.x, lapCat.y, plIndex); logAction(`${pl.name} pets the cat.`); closeMenu(); return true; }) });
  }

  options.push({
    label: pl.sneak ? "Stand up" : "Sneak",
    action: () => { setSneak(plIndex, !pl.sneak); closeMenu(); }
  });

  if (!pl.resting) {
    options.push({
      label: "Rest",
      action: () => {
        pl.resting = true;
        pl.path = [];
        endHandsFor(plIndex, `${pl.name} sat down to rest.`);
        logAction(`${pl.name} started resting.`);
        closeMenu();
      }
    });
  } else {
    options.push({
      label: "Stop resting",
      action: () => {
        pl.resting = false;
        logAction(`${pl.name} stopped resting.`);
        closeMenu();
      }
    });
  }

  // ---- dev: open the house builder from anywhere ----
  if (window.__devMode && state.view3d && typeof window.openBuilder3D === "function") options.push({ label: "Build house (dev)", action: () => { closeMenu(); window.openBuilder3D(); } });

  // ---- Craft (no station needed: torches and other things you can make with your hands) ----
  options.push({
    label: "Craft",
    action: () => {
      openCraftingScreen("hand");
      closeMenu();
    }
  });

  // ---- Dig option (requires shovel) ----
  if (hasTool(inv, "shovel")) {
    let digDisabled = null;
    if (state.mode !== "overworld") digDisabled = "Overworld only";
    else if (tileAt(pl.x, pl.y) !== "grass") digDisabled = "Grass only";
    else if (objectAt(pl.x, pl.y)) digDisabled = "Tile occupied";

    options.push({
      label: "Dig",
      disabledReason: digDisabled,
      action: withSfx("dig", () => {
        if (digDisabled) return;
        digAtPlayerTile();
        closeMenu();
      })
    });
  }

  options.push({
    label: "Place stockpile",
    action: () => {
      playSound("pop");
      state.placingStockpile = true;
      closeMenu();
    }
  });

  openMenu({
    screenX,
    screenY,
    title: pl.name,
    options
  });
}

function sendInteractionRequest(type, fromIndex, toIndex) {
  // One request at a time. Humans can’t even handle one, so this is generous.
  if (state.interactionRequest) return;

  state.interactionRequest = {
    type,
    fromIndex,
    toIndex,
    createdAt: Date.now()
  };

  const fromName = state.players[fromIndex].name;
  const toName = state.players[toIndex].name;

  logAction(`${fromName} requested: ${type} → ${toName}.`);
  closeMenu();

  // Online: send request to the other player’s tab
  if (state.net?.enabled) {
    sendNetInput({ type: "interaction_request", reqType: type, fromIndex, toIndex });
  }
}

function acceptInteractionRequest() {
  const req = state.interactionRequest;
  if (!req) return;

  // Only the intended receiver can accept
  if (state.activePlayer !== req.toIndex) return;

  const from = state.players[req.fromIndex].name;
  const to = state.players[req.toIndex].name;

  if (req.type === "Hold hands") {
    logAction(`${to} accepted: Hold hands with ${from}.`);
    playSound("message");
    beginCouple("hold", req.fromIndex, req.toIndex);
  } else if (req.type === "Kiss") {
    logAction(`${to} accepted: Kiss from ${from}.`);
    playSound("message");
    beginCouple("kiss", req.fromIndex, req.toIndex);
  } else if (req.type === "Hug") {
    logAction(`${to} accepted: Hug from ${from}.`);
    playSound("message");
    beginCouple("hug", req.fromIndex, req.toIndex);
  } else if (req.type === "Trade") {
    logAction(`${to} and ${from} started a trade.`);
    playSound("pickup");
    openTradeUI(req.fromIndex, req.toIndex);
  }

  // Online: tell the requester’s tab to react (open trade UI, etc.)
  if (state.net?.enabled) {
    sendNetInput({ type: "interaction_respond", accepted: true, reqType: req.type, fromIndex: req.fromIndex, toIndex: req.toIndex });
  }

  state.interactionRequest = null;
}

function declineInteractionRequest() {
  const req = state.interactionRequest;
  if (!req) return;

  // Only the intended receiver can decline
  if (state.activePlayer !== req.toIndex) return;

  const from = state.players[req.fromIndex].name;
  const to = state.players[req.toIndex].name;

  logAction(`${to} declined: ${req.type} from ${from}.`);

  // Online: tell the requester's tab the request was declined
  if (state.net?.enabled) {
    sendNetInput({ type: "interaction_respond", accepted: false, reqType: req.type, fromIndex: req.fromIndex, toIndex: req.toIndex });
  }

  state.interactionRequest = null;
}

// ============================================================
// TRADE UI
// ============================================================

const TRADE_OFFER_SLOTS = 6;
const TRADE_CELL = 44;
const TRADE_GAP  = 4;
const TRADE_INV_CELL = 28;
const TRADE_INV_GAP  = 3;

function openTradeUI(p0idx, p1idx) {
  state.trade = {
    open: true,
    p0idx,          // index of the first player (requester)
    p1idx,          // index of the second player (receiver)
    p0offer: [],    // [{id, qty}] – removed from inv[p0idx] into escrow
    p1offer: [],    // [{id, qty}] – removed from inv[p1idx] into escrow
    confirm0: false,
    confirm1: false,
    drag: null,     // {srcPlayer, srcKind:"inv"|"offer", srcSlot, item:{id,qty}, x, y}
    _ui: {}
  };

  // Online: share our inventory so the other player's trade UI shows our actual items
  if (state.net?.enabled) {
    const myIdx = state.activePlayer | 0;
    sendNetInput({ type: "trade_inv", playerIdx: myIdx, inv: JSON.parse(JSON.stringify(state.inventories[myIdx])) });
  }
}

function closeTradeUI(cancelled = true) {
  const t = state.trade;
  if (!t?.open) return;

  // Online: tell the other tab to close trade (only if WE initiated the cancel, not a network cancel)
  if (cancelled && state.net?.enabled && !t._netCancel) {
    sendNetInput({ type: "trade_cancel" });
  }

  // Return escrowed items to their owners (only items belonging to this player)
  const myIdx = state.activePlayer | 0;
  const myOffer = myIdx === t.p0idx ? t.p0offer : t.p1offer;
  if (myOffer?.length) {
    const inv = state.inventories[myIdx];
    const p = state.players[myIdx];
    for (const st of myOffer) addItemOrDrop(inv, st.id, st.qty, p.x, p.y, p.name);
  }

  if (cancelled) logAction("Trade cancelled.");
  state.trade = { open: false };
}

// Broadcast current player's trade offer + confirm state to the other tab
function syncTradeState() {
  if (!state.net?.enabled || !state.trade?.open) return;
  const t = state.trade;
  const myIdx = state.activePlayer | 0;
  const offer = myIdx === t.p0idx ? t.p0offer : t.p1offer;
  const confirmMe = myIdx === t.p0idx ? t.confirm0 : t.confirm1;
  sendNetInput({
    type: "trade_state",
    senderIdx: myIdx,
    offer: JSON.parse(JSON.stringify(offer)),
    confirmMe,
    inv: JSON.parse(JSON.stringify(state.inventories[myIdx]))
  });
}

function executeTrade() {
  const t = state.trade;
  if (!t?.open) return;

  const inv0 = state.inventories[t.p0idx];
  const inv1 = state.inventories[t.p1idx];
  const p0 = state.players[t.p0idx];
  const p1 = state.players[t.p1idx];

  // Items are already removed from inventories (in escrow in offer arrays).
  // Give each player the other's offered items.
  for (const st of t.p0offer) addItemOrDrop(inv1, st.id, st.qty, p1.x, p1.y, p1.name);
  for (const st of t.p1offer) addItemOrDrop(inv0, st.id, st.qty, p0.x, p0.y, p0.name);

  logAction(`${p0.name} and ${p1.name} completed a trade.`);
  playSound("chest");
  state.trade = { open: false };
}

// ---- Drawing ----

function drawTradeUI() { hudDrawTrade(); }   // src/ui/panels3.js

function handleTradePointerDown(px, py) {
  const t = state.trade;
  if (!t?.open) return false;
  if (!t._ui?.panel) return true; // panel not yet drawn – eat the click

  const ap = state.activePlayer;
  const ui = t._ui;

  // Determine which offer/inv arrays belong to the active player
  const myInvSlots    = ap === t.p0idx ? ui.p0inv    : ui.p1inv;
  const myOfferSlots  = ap === t.p0idx ? ui.p0offer  : ui.p1offer;

  // Click own inventory slot → start drag (item stays in inv until dropped on offer)
  for (const slot of (myInvSlots ?? [])) {
    if (!hitRect(px, py, slot)) continue;
    const inv = state.inventories[ap];
    const stack = inv[slot.i];
    if (!stack || stack.qty <= 0) return true;

    t.drag = { srcKind: "inv", srcSlot: slot.i, srcPlayer: ap, item: { id: stack.id, qty: stack.qty }, x: px, y: py, x0: px, y0: py };
    return true;
  }

  // Click own offer slot → start drag (remove from offer, place somewhere on drop)
  for (const slot of (myOfferSlots ?? [])) {
    if (!hitRect(px, py, slot)) continue;
    const offer = ap === t.p0idx ? t.p0offer : t.p1offer;
    const stack = offer[slot.i];
    if (!stack) return true;

    // Un-confirm when offer changes
    if (ap === t.p0idx) t.confirm0 = false;
    else t.confirm1 = false;

    const item = { ...stack };
    offer.splice(slot.i, 1);
    t.drag = { srcKind: "offer", srcSlot: slot.i, srcPlayer: ap, item, x: px, y: py, x0: px, y0: py };
    syncTradeState();
    return true;
  }

  return true; // eat all clicks while trade is open
}

function handleTradeDrag(px, py) {
  const t = state.trade;
  if (!t?.open || !t.drag) return false;
  t.drag.x = px;
  t.drag.y = py;
  return true;
}

function handleTradePointerUp(px, py) {
  const t = state.trade;
  if (!t?.open) return false;

  const ui = t._ui;
  const ap = state.activePlayer;

  // Confirm button
  const myConfirmBtn = ap === t.p0idx ? ui?.p0confirm : ui?.p1confirm;
  if (myConfirmBtn && hitRect(px, py, myConfirmBtn) && !t.drag) {
    const confirmed = ap === t.p0idx ? t.confirm0 : t.confirm1;
    if (ap === t.p0idx) t.confirm0 = !confirmed;
    else t.confirm1 = !confirmed;

    syncTradeState();
    if (t.confirm0 && t.confirm1) executeTrade();
    return true;
  }

  // Cancel button / close button / tap outside the sheet
  if ((ui?.cancel && hitRect(px, py, ui.cancel)) || (ui?.close && hitRect(px, py, ui.close)) || (!t.drag && ui?.panel && !hitRect(px, py, ui.panel))) {
    closeTradeUI(true);
    return true;
  }

  // Resolve drag drop
  if (t.drag) {
    const d = t.drag;
    t.drag = null;

    const myOfferSlots = ap === t.p0idx ? ui?.p0offer : ui?.p1offer;
    const offer = ap === t.p0idx ? t.p0offer : t.p1offer;
    const inv = state.inventories[ap];
    const p = state.players[ap];

    // Check if dropped on an offer slot
    let targetOfferSlot = -1;
    for (const slot of (myOfferSlots ?? [])) {
      if (hitRect(px, py, slot)) { targetOfferSlot = slot.i; break; }
    }

    // A tap (barely moved) is a shortcut: a backpack stack jumps into the offer, an offered stack goes back to the backpack.
    const tapped = Math.hypot(px - (d.x0 ?? px), py - (d.y0 ?? py)) < 10;
    if (tapped) targetOfferSlot = d.srcKind === "inv" ? 0 : -1;

    if (d.srcKind === "inv") {
      // Dragged from inventory
      if (targetOfferSlot >= 0 && offer.length < TRADE_OFFER_SLOTS) {
        // Move from inv to offer
        const existing = offer.find(s => s.id === d.item.id);
        if (existing) {
          existing.qty += d.item.qty;
        } else {
          offer.push({ ...d.item });
        }
        removeItem(inv, d.item.id, d.item.qty);
        if (ap === t.p0idx) t.confirm0 = false;
        else t.confirm1 = false;
        syncTradeState();
      }
      // else: dropped outside offer zone, item stays in inventory (no-op)
    } else {
      // Dragged from offer — already removed from offer array on pointerdown
      if (targetOfferSlot >= 0 && offer.length < TRADE_OFFER_SLOTS) {
        // Drop back onto an offer slot
        const existing = offer.find(s => s.id === d.item.id);
        if (existing) {
          existing.qty += d.item.qty;
        } else {
          offer.push({ ...d.item });
        }
      } else {
        // Dropped outside offer zone — return to inventory
        addItemOrDrop(inv, d.item.id, d.item.qty, p.x, p.y, p.name);
        syncTradeState();
      }
    }

    return true;
  }

  return true; // eat all pointerup while trade open
}

// ============================================================
// END TRADE UI
// ============================================================

function openMenuForOtherPlayer(targetIndex, screenX, screenY) {
  const me = state.activePlayer;
  const other = targetIndex;

  const otherName = state.players[other].name;

  const reqBusy = !!state.interactionRequest;
  const holding = state.holdingHands &&
    (state.holdingHands.a === me || state.holdingHands.b === me);

  const options = [
    {
      label: "Hold hands",
      disabledReason: reqBusy ? "Pending request" : (holding ? "Already holding hands" : null),
      action: () => sendInteractionRequest("Hold hands", me, other)
    },
    {
      label: "Kiss",
      disabledReason: reqBusy ? "Pending request" : null,
      action: () => sendInteractionRequest("Kiss", me, other)
    },
    {
      label: "Hug",
      disabledReason: reqBusy ? "Pending request" : null,
      action: () => sendInteractionRequest("Hug", me, other)
    },
    {
      label: "Trade",
      disabledReason: reqBusy ? "Pending request" : null,
      action: () => sendInteractionRequest("Trade", me, other)
    }
  ];

  // If already holding hands, allow ending it from either player
  if (holding) {
    options.unshift({
      label: "End holding hands",
      action: () => {
        endHoldingHands(`${state.players[me].name} let go.`);
        closeMenu();
      }
    });
  }

  openMenu({ screenX, screenY, title: otherName, options });
}

function openMenuForHoldingHands(screenX, screenY) {
  const hh = state.holdingHands;
  if (!hh) return;

  const aName = state.players[hh.a].name;
  const bName = state.players[hh.b].name;

  openMenu({
    screenX, screenY,
    title: "Holding Hands",
    options: [
      { label: `${aName} + ${bName}`, disabledReason: "Aww." },
      {
        label: "End holding hands",
        action: () => {
          endHoldingHands("Holding hands ended.");
          closeMenu();
        }
      }
    ]
  });
}

function openMenuForTile(mapX, mapY, screenX, screenY) {
let obj = objectAt(mapX, mapY);
if (!obj) return;

// ---- INTERIOR PROXY RESOLVE ----
if (state.mode === "interior") {
  const isProxy =
    obj.id === "occupied" ||
    obj.id === "occupied_pass" ||
    (typeof obj.id === "string" && obj.id.startsWith("occupied"));

  const a = obj.meta?.anchor;

  if (isProxy && a && typeof a.x === "number" && typeof a.y === "number") {
    const real = objectAt(a.x, a.y);
    if (real) {
      obj = real;
      mapX = a.x;
      mapY = a.y;
    }
  }
}

  const p = activePlayer();
  const inv = activeInv();

// ---- Bed: sleep ----
if (obj.id === "bed") {
  openMenu({
    screenX, screenY,
    title: "Bed",
    options: [
      {
        label: "Sleep",
        action: withSfx("click", () => {
          closeMenu();
          sleepInBed(mapX, mapY);
        })
      }
    ]
  });
  return;
}

if (state.mode === "dungeon" && obj.id === "dungeon_exit") {
  const tooFar = !isAdjacentOrSame(p.x, p.y, mapX, mapY);
  openMenu({
    screenX, screenY,
    title: "Exit",
    options: [{
      label: "Exit dungeon",
      disabledReason: tooFar ? "Too far" : null,
      action: withSfx("door_open", () => {
        if (tooFar) return;
        closeMenu();
        exitDungeon();
      })
    }]
  });
  return;
}

if (state.mode === "dungeon" && obj.id === "dungeon_gate") {
  const tooFar = !isAdjacentOrSame(p.x, p.y, mapX, mapY);
  const needKey = !hasTool(inv, "dungeon_key");

  openMenu({
    screenX, screenY,
    title: "Locked Gate",
    options: [{
      label: "Unlock (1 Dungeon Key)",
      disabledReason: tooFar ? "Too far" : (needKey ? "Need Dungeon Key" : null),
      action: withSfx("click", () => {
        if (tooFar || needKey) return;
        removeItem(inv, "dungeon_key", 1);
        getCurrentMap().objects[mapY][mapX] = { id: "dungeon_gate_open", hp: 999, meta: {} };
        saveDungeonLayout(state.dungeonId);
		playSound("unlock");
        logAction(`${p.name} unlocked a gate.`);
        closeMenu();
      })
    }]
  });
  return;
}

// --- Runestone: Decipher (requires cipher in inventory) ---
if (obj.id === "runestone") {
  const hasCipher = getQty(inv, "cipher") > 0;

  let disabledReason = null;
  if (!isAdjacentOrSame(p.x, p.y, mapX, mapY)) disabledReason = "Too far";
  else if (!hasCipher) disabledReason = "Needs cipher";

  openMenu({
    screenX, screenY,
    title: "Runestone",
    options: [
      {
        label: "Decipher",
        disabledReason,
        action: withSfx("pickup", () => {
          if (disabledReason) return;

          const msg = obj.meta?.msg || "(The stone is weathered beyond reading.)";
          openRunestoneReader(obj.meta?.riddle && !obj.meta?.solved ? "The stone asks…" : "Runestone", msg);
          closeMenu();
        })
      }
    ]
  });
  return;
}

// --- Puzzle Chest: Rune Combination Lock ---
if (state.mode === "dungeon" && obj.id === "dungeon_chest") {
  const tooFar = !isAdjacentOrSame(p.x, p.y, mapX, mapY);

  openMenu({
    screenX, screenY,
    title: obj.meta?.reward === "treasure" ? "Treasure Chest (locked)" : "Locked Chest",
    options: [{
      label: obj.meta?.puzzle === "riddle" ? "Answer the riddle" : "Unlock",
      disabledReason: tooFar ? "Too far" : null,
      action: withSfx("click", () => {
        if (tooFar) return;
        closeMenu();
        if (obj.meta?.puzzle === "riddle") openRiddleLockForChest(mapX, mapY);
        else openRuneComboLockForChest(mapX, mapY);
      })
    }]
  });
  return;
}

// --- Dungeon Chest: Open ---
if (state.mode === "dungeon" && obj.id === "chest") {
  const tooFar = !isAdjacentOrSame(p.x, p.y, mapX, mapY);

  openMenu({
    screenX, screenY,
    title: "Chest",
    options: [{
      label: "Open",
      disabledReason: tooFar ? "Too far" : null,
      action: withSfx("chest", () => {
        if (tooFar) return;

        chestLoot(inv, mapX, mapY);
        getCurrentMap().objects[mapY][mapX] = null;
        saveDungeonLayout(state.dungeonId);
        closeMenu();
      })
    }]
  });

  return;
}

  // ---- Dropped item special menu (must be before objDef) ----
  if (obj.id === "dropped_item") {
    const tooFar = !isAdjacentOrSame(p.x, p.y, mapX, mapY);

    const itemId = obj.meta?.itemId;
    const qty = obj.meta?.qty ?? 1;
    const name = itemDef(itemId)?.name ?? itemId ?? "item";

    openMenu({
      screenX, screenY,
      title: name,
      options: [
        // Eat (only if item has nourishment)
        ...(typeof itemDef(itemId)?.nourishment === "number" ? [{
          label: `Eat (+${itemDef(itemId).nourishment})`,
          disabledReason: tooFar ? "Too far" : null,
          action: withSfx("eat", () => { 
            if (tooFar) return;

            const n = itemDef(itemId).nourishment;
            p.hunger = clamp((p.hunger ?? 0) - n, 0, HUNGER_MAX);

            // consume 1 from the ground stack
            const newQty = (obj.meta?.qty ?? 1) - 1;
            if (newQty <= 0) {
              setOverworldObject(mapX, mapY, null);
            } else {
              obj.meta = obj.meta || {};
              obj.meta.itemId = itemId;
              obj.meta.qty = newQty;
            }

            logAction(`${p.name} ate ${name}.`);
            closeMenu();
          })
        }] : []),

        {
          label: `Pick up (${qty})`,
          disabledReason: tooFar ? "Too far" : null,
          action: withSfx("pickup", () => {
  if (tooFar) return;

  // IMPORTANT: this expects addItem() to return { added, remaining, ok }
  const res = addItem(inv, itemId, qty);

  // Fallback if your addItem still returns boolean (old behavior)
  // (This won't do partial pickup until addItem is updated.)
  if (typeof res === "boolean") {
    if (res) {
      setOverworldObject(mapX, mapY, null);
      logAction(`${p.name} picked up ${qty} ${name}${qty === 1 ? "" : "s"}.`);
    } else {
      logAction(`${p.name}'s inventory is full. Couldn't pick up ${qty} ${name}${qty === 1 ? "" : "s"}.`);
    }
    closeMenu();
    return;
  }

  if (res.added > 0) {
    logAction(`${p.name} picked up ${res.added} ${name}${res.added === 1 ? "" : "s"}.`);
  }

  if (res.remaining <= 0) {
    getCurrentMap().objects[mapY][mapX] = null;
  } else {
    // Leave the remainder on the ground
    obj.meta = obj.meta || {};
    obj.meta.itemId = itemId;
    obj.meta.qty = res.remaining;

    logAction(`${p.name}'s inventory is full. ${res.remaining} ${name}${res.remaining === 1 ? "" : "s"} stayed on the ground.`);
  }

  closeMenu();
})
        }
      ]
    });

    return;
  }

  // ---- Planted seed special menu ----
  if (obj.id === "planted_seed") {
    const tooFar = !isAdjacentOrSame(p.x, p.y, mapX, mapY);
    const m = obj.meta ?? (obj.meta = {});
    const seedId = m.seedId;
    const seedName = itemDef(seedId)?.name ?? seedId ?? "Planted Seed";

    const today = state.time.day;
    const wateredToday = (m.lastWaterDay === today);
    const ready = !!m.ready || (m.progress ?? 0) >= GROW_DAYS;

    // bucket IDs you already use elsewhere
    const emptyBucketId = firstExistingItemId(["bucket", "empty_bucket"]);
    const filledBucketId = firstExistingItemId(["bucket_water", "water_bucket", "bucket_of_water"]);

    let waterDisabled = null;
    if (tooFar) waterDisabled = "Too far";
    else if (!filledBucketId) waterDisabled = "No water bucket item exists";
    else if (getQty(inv, filledBucketId) <= 0) waterDisabled = "Needs bucket of water";
    else if (wateredToday) waterDisabled = "Already watered today";

    let harvestDisabled = null;
    if (tooFar) harvestDisabled = "Too far";
    else if (!ready) harvestDisabled = `Not ready (${m.progress ?? 0}/${GROW_DAYS} days)`;

    openMenu({
      screenX, screenY,
      title: seedName,
      options: [
        { label: `Progress: ${m.progress ?? 0}/${GROW_DAYS}`, disabledReason: " " },
        { label: wateredToday ? "Watered: Yes (today)" : (m.wateredEver ? "Watered: No (today)" : "Watered: Never"), disabledReason: " " },
        {
          label: "Water",
          disabledReason: waterDisabled,
          action: withSfx("water", () => {
            if (waterDisabled) return;

            // spend 1 water bucket, return empty bucket
            removeItem(inv, filledBucketId, 1);
            if (emptyBucketId) addItem(inv, emptyBucketId, 1);

            m.lastWaterDay = today;
            m.wateredEver = true;

            logAction(`${p.name} watered the ${seedName}.`);
            closeMenu();
          })
        },
        {
          label: "Harvest",
          disabledReason: harvestDisabled,
          action: withSfx("pickup", () => {
            if (harvestDisabled) return;

            const growsTo = seedGrowsToItemId(seedId);
            if (!growsTo) return;

            getCurrentMap().objects[mapY][mapX] = {
              id: "dropped_item",
              hp: 1,
              meta: { itemId: growsTo, qty: 1 }
            };

            logAction(`${p.name} harvested ${itemDef(growsTo)?.name ?? growsTo}!`);
            closeMenu();
          })
        }
      ]
    });

    return;
  }

  const def = objDef(obj.id);
  if (!def) return;

  // Allow ranged interaction for huntable animals if player has bow_and_arrow (up to BOW_MAX_RANGE tiles, while on screen)
  const dist = Math.abs(p.x - mapX) + Math.abs(p.y - mapY);
  const huntData = def.hunt || def.harvest; // support either key
  const isHuntable =
    (Array.isArray(def.tags) && def.tags.includes("hunt")) ||
    (huntData && huntData.requiresTool === "bow_and_arrow");

  const hasBow = canShootBow(inv);
  const allowRangedHunt = isHuntable && hasBow && bowCanReach(mapX, mapY);

// Bed is always interactable if clicked (even if you're far away)
if (obj.id !== "bed" && !isAdjacentOrSame(p.x, p.y, mapX, mapY) && !allowRangedHunt) return;

  const options = [];

  // ---- Campfire menu ----
if (obj.id === "workbench") {
  options.push({
    label: "Craft",
    action: () => {
      openCraftingScreen("craft");
      closeMenu();
    }
  });

  // Modular house building (3D view): needs the house blueprint, then the builder opens
  const buildDisabled = !state.view3d || typeof window.openBuilder3D !== "function" ? "Needs the 3D view"
    : getQty(activeInv(), "blueprint_house") < 1 ? "Needs the house blueprint"
    : null;
  options.push({
    label: "Build house",
    disabledReason: buildDisabled,
    action: () => {
      if (buildDisabled) return;
      closeMenu();
      window.openBuilder3D();
    }
  });
}

// ---- Stove menu ----
if (obj.id === "stove") {
  options.push({
    label: "Cook",
    action: () => {
      openCraftingScreen("cook");
      closeMenu();
    }
  });
}

// ---- Counter menu ----
if (obj.id === "counter") {
  options.push({
    label: "Prepare",
    action: () => {
      openCraftingScreen("prep");
      closeMenu();
    }
  });
}

if (state.mode === "overworld" && (obj.id === "cave" || obj.id === "hole")) {
  const tooFar = !isAdjacentOrSame(p.x, p.y, mapX, mapY);
  options.push({
    label: "Enter dungeon",
    disabledReason: tooFar ? "Too far" : null,
    action: withSfx("door_open", () => {
      if (tooFar) return;
      tryEnterDungeonAt(mapX, mapY);
      closeMenu();
    })
  });
}

// ---- Bed menu ----
if (obj.id === "bed") {
  const tooFar = !isAdjacentOrSame(p.x, p.y, mapX, mapY);

  options.push({
    label: "Sleep",
    disabledReason: tooFar ? "Too far" : null,
    action: () => {
      if (tooFar) return;
      closeMenu();
      sleepInBed(mapX, mapY);
    }
  });
}

if (obj.id === "campfire") {
  obj.meta = obj.meta || {};
  const fireT = obj.meta.fireT ?? 0;
  const lit = fireT > 0;

  // Info line
  options.push({
    label: lit ? `Fire: ${Math.ceil(fireT)}s remaining` : "Fire: Out",
    disabledReason: " "
  });

  // Cook only if burning
  options.push({
    label: "Cook",
    disabledReason: lit ? null : "Fire is out",
    action: () => {
      if (!lit) return;
      openCraftingScreen("cook");
      closeMenu();
    }
  });

  // Relight a burnt-out fire: a match and a piece of wood, always works
  if (!lit) {
    const farAway = !isAdjacentOrSame(p.x, p.y, mapX, mapY);
    options.push({
      label: "Relight (1 match + 1 wood)",
      disabledReason: farAway ? "Too far" : (getQty(inv, "matches") < 1 ? "Needs matches" : (getQty(inv, "wood") < 1 ? "Needs wood" : null)),
      action: withSfx("lightfire", () => {
        if (farAway || getQty(inv, "matches") < 1 || getQty(inv, "wood") < 1) return;
        removeItem(inv, "matches", 1);
        removeItem(inv, "wood", 1);
        obj.meta.fireT = CAMPFIRE_ADD_WOOD_SECONDS * 2;
        logAction(`${p.name} relit the campfire.`);
        closeMenu();
      })
    });
  }

  // Add wood: +20s per wood
  const tooFar = !isAdjacentOrSame(p.x, p.y, mapX, mapY);
  let addDisabled = null;
  if (tooFar) addDisabled = "Too far";
  else if (getQty(inv, "wood") <= 0) addDisabled = "Needs wood";

  options.push({
    label: lit ? `Add wood (+${CAMPFIRE_ADD_WOOD_SECONDS}s)` : "Try lighting with wood (70%)",
    disabledReason: addDisabled,
    action: withSfx("pickup", () => {
      if (addDisabled) return;

            removeItem(inv, "wood", 1);

      const wasOut = (obj.meta.fireT ?? 0) <= 0;

      // If the fire is currently OUT, lighting it can fail.
      if (wasOut) {
        const FIRE_LIGHT_CHANCE = 0.70; // tweak this
        const chk = rollCheck(FIRE_LIGHT_CHANCE);

        if (!chk.ok) {
          logAction(`${p.name} tried to light the campfire… failed. (d${chk.sides}: ${chk.roll} > ${chk.target})`);
          closeMenu();
          return;
        }

        playSound("lightfire");
      }

      // Only add time if it actually lit (or was already burning)
      obj.meta.fireT = (obj.meta.fireT ?? 0) + CAMPFIRE_ADD_WOOD_SECONDS;

      logAction(`${p.name} added wood to the campfire (+${CAMPFIRE_ADD_WOOD_SECONDS}s).`);
      closeMenu();
    })
  });

  // Extinguish: kill the fire (leave the campfire object so you can re-fuel it)
  options.push({
    label: "Put out",
    disabledReason: tooFar ? "Too far" : (lit ? null : "Already out"),
    action: withSfx("extinguish", () => {
  if (tooFar) return false;

  // put the fire out but leave the stone ring, so it can be re-lit with wood
  obj.meta = obj.meta || {};
  obj.meta.fireT = 0;
  logAction(`${p.name} put out the campfire at (${mapX},${mapY}).`);
  closeMenu();
  return true;
})
  });

  openMenu({ screenX, screenY, title: def.name, options });
  return;
}

  // ---- Cat special: Pet instead of Hunt ----
  if (obj.id === "cat") {
    const pc = obj.meta?.perch, tooFar = !isAdjacentOrSame(p.x, p.y, mapX, mapY) && !(pc && isAdjacentOrSame(p.x, p.y, pc.x, pc.y));

    options.push({
  label: "Pet",
  disabledReason: tooFar ? "Too far" : null,
  action: withSfx("cat", () => {
    if (tooFar) return false;
    petCat(mapX, mapY, state.activePlayer | 0);
    logAction(`${p.name} pets ${def.name ?? "the cat"}.`);
    closeMenu();
    return true;
  })
});

    // IMPORTANT: don't fall through and add Hunt/Harvest
    openMenu({ screenX, screenY, title: def.name, options });
    return;
  }

// ---- Stump behavior ----
if (obj.id === "stump") {
  const tooFar = !isAdjacentOrSame(p.x, p.y, mapX, mapY);
  let disabled = null;

  if (tooFar) disabled = "Too far";
  else if (!hasTool(inv, "axe")) disabled = "Needs axe";

  openMenu({
    screenX, screenY,
    title: "Tree Stump",
    options: [
      {
        label: "Remove stump",
        disabledReason: disabled,
        action: withSfx("chop", () => {
          if (disabled) return;
          setOverworldObject(mapX, mapY, null);
          logAction(`${p.name} removed a tree stump.`);
          closeMenu();
        })
      }
    ]
  });
  return;
}

  // ---- Chicken: pluck a feather (up to 5 per chicken, they grow back by the next day) ----
  if (obj.id === "chicken") {
    obj.meta = obj.meta || {};
    if (obj.meta.pluckDay !== state.time.day) { obj.meta.pluckDay = state.time.day; obj.meta.plucked = 0; }
    const left = CHICKEN_MAX_FEATHERS - (obj.meta.plucked | 0);
    const near = isAdjacentOrSame(p.x, p.y, mapX, mapY);
    options.push({
      label: left > 0 ? `Pluck a feather (${left} left)` : "Pluck a feather",
      disabledReason: !near ? "Too far" : (left <= 0 ? "Nothing left to pluck" : null),
      action: withSfx("pickup", () => {
        if (!near || left <= 0) return;
        const res = addItemOrDrop(inv, "feather", 1, mapX, mapY, p.name);
        if (res.added > 0 || res.dropped > 0) { obj.meta.plucked = (obj.meta.plucked | 0) + 1; logAction(`${p.name} plucked a feather from the chicken.`); }
        closeMenu();
      })
    });
  }

  // ---- Furniture inside a house: sleep, cook, prepare, turn it, pick it up again ----
  if (def.furniture) {
    const f = state.data.furniture?.[obj.id], near = isAdjacentOrSame(p.x, p.y, mapX, mapY);
    if (def.sleep) options.push({ label: "Sleep", disabledReason: near ? null : "Too far", action: () => { if (!near) return; closeMenu(); sleepInBed(mapX, mapY); } });
    if (SEAT_CATS.has(f?.cat)) options.push({ label: "Sit", disabledReason: near ? null : "Too far", action: withSfx("click", () => { if (!near) return; closeMenu(); sitOn(state.activePlayer | 0, mapX, mapY); }) });
    if (def.station === "stove") options.push({ label: "Cook", disabledReason: near ? null : "Too far", action: () => { closeMenu(); openCraftingScreen("cook"); } });
    if (def.station === "counter") options.push({ label: "Prepare", disabledReason: near ? null : "Too far", action: () => { closeMenu(); openCraftingScreen("prep"); } });
    if (f?.storage) options.push({ label: `Open ${f.storage.toLowerCase()}`, disabledReason: near ? null : "Too far", action: withSfx("chest", () => { if (!near) return; closeMenu(); openFurnitureStorage(mapX, mapY); }) });
    const catHere = catPerchedOn(mapX, mapY);
    if (catHere) options.push({ label: "Pet the cat", disabledReason: near ? null : "Too far", action: withSfx("cat", () => { if (!near) return false; petCat(catHere.x, catHere.y, state.activePlayer | 0); logAction(`${p.name} pets the cat.`); closeMenu(); return true; }) });
    options.push({
      label: "Rotate",
      action: withSfx("click", () => { setOverworldObject(mapX, mapY, { ...obj, meta: { ...(obj.meta || {}), rot: (((obj.meta?.rot | 0) + 1) % 4) } }); closeMenu(); })
    });
    options.push({
      label: "Move",
      disabledReason: near ? null : "Too far",
      action: withSfx("click", () => { if (!near) return; closeMenu(); window.__r3d?.builder?.moveFurnitureAt(mapX, mapY); })
    });
    options.push({
      label: "Dismantle",
      disabledReason: near ? (obj.meta?.inv?.length ? "Empty it first" : null) : "Too far",
      action: withSfx("pickup", () => {
        if (!near || obj.meta?.inv?.length) return;
        for (const [id, n] of Object.entries(f?.cost || {})) addItemOrDrop(inv, id, n, p.x, p.y, p.name);   // the materials come back
        setOverworldObject(mapX, mapY, null);
        logAction(`${p.name} dismantled the ${def.name.toLowerCase()}.`);
        closeMenu();
      })
    });
  }

  // ---- Existing object behavior ----
  const interact = def.hunt || def.harvest;

  if (interact) {
    const requiredTool = interact.requiresTool || null;
    let disabledReason = null;

if (obj.meta?.depleted) disabledReason = "Depleted";

    // Ranged hunting rules
    if (isHuntable) {
      if (getQty(inv, "bow_and_arrow") <= 0) disabledReason = "Needs bow and arrow";
      else if (getQty(inv, "arrow") <= 0) disabledReason = "Out of arrows";
      else if (!bowCanReach(mapX, mapY)) disabledReason = "Too far";
    } else {
      // Normal harvesting stays adjacent-only
      if (!isAdjacentOrSame(p.x, p.y, mapX, mapY)) disabledReason = "Too far";
      else if (requiredTool && !hasTool(inv, requiredTool)) {
        disabledReason = `Requires ${itemDef(requiredTool)?.name ?? requiredTool}`;
      }
    }

   let sfx = "harvest";

// ---------------------------------------------------------------------------- Resource SFX -----
if (isHuntable) {
  sfx = (dist <= 1 ? "hunt" : "hunt");
} else {
  if (/^tree\d+$/.test(obj.id)) sfx = "chop";
else if (obj.id === "apple_tree") sfx = "harvest";
  else if (["rock", "stone", "ore"].includes(obj.id)) sfx = "pickaxe";
  else if (["bush", "berry_bush", "grapevine"].includes(obj.id)) sfx = "harvest";
  else if (obj.id === "fish_spot") sfx = "fishingreel";
  else if (obj.id === "cow") sfx = "cow";
}

options.push({
  label: isHuntable ? (dist <= 1 ? "Hunt" : "Hunt") : "Harvest resource",
  disabledReason,
  action: withSfx(sfx, () => {
    if (disabledReason) return false;
    harvestObject(mapX, mapY);
    closeMenu();
    return true;
  })
});

  }

if (def.pickup) {

  // Eat directly from the map: food lying about (strawberries, mushrooms, bananas, wheat...) is eaten on the spot.
  // The nourishment is on the item, so add up what this patch would give you.
  const eatGain = Object.entries(def.pickup.gives || {}).reduce((n, [id, amt]) => n + (typeof itemDef(id)?.nourishment === "number" ? itemDef(id).nourishment * amt : 0), typeof def.nourishment === "number" ? def.nourishment : 0);
  if (eatGain > 0) {
    const eatFar = !isAdjacentOrSame(p.x, p.y, mapX, mapY);
    options.push({
      label: `Eat (+${eatGain})`,
      disabledReason: eatFar ? "Too far" : null,
      action: withSfx("eat", () => {
        if (eatFar) return false;

        p.hunger = clamp((p.hunger ?? 0) - eatGain, 0, HUNGER_MAX);
        logAction(`${p.name} ate the ${def.name.toLowerCase()}.`);

        // remove object from map after eating
        setOverworldObject(mapX, mapY, null);

        closeMenu();
      })
    });
  }

  // Normal pickup
  options.push({
    label: "Pick up",
    action: withSfx("pickup", () => pickupObject(mapX, mapY))
  });

}

  // ---- Chop down option (anti-softlock) ----
if (["bush", "berry_bush", "apple_tree"].includes(obj.id)) {
  let chopDisabled = null;

  if (!isAdjacentOrSame(p.x, p.y, mapX, mapY)) chopDisabled = "Too far";
  else if (!hasTool(inv, "axe")) chopDisabled = "Needs axe";

  options.push({
    label: "Chop down",
    disabledReason: chopDisabled,
    action: withSfx("chop", () => {
      if (chopDisabled) return;
      chopDownObject(mapX, mapY);
      closeMenu();
    })
  });
}

  if (def.container) {
  let label = "Open";
  if (def.id === "stockpile") label = "Open stockpile";
  else if (def.id === "chest") label = "Open chest";
  else if (def.id === "toolbox") label = "Open toolbox";

  options.push({
  label,
  action: withSfx("chest", () => openContainerObject(mapX, mapY))
});

}

if (def.type === "house" || obj.id === "house") {
    options.push({
  label: "Enter",
  action: withSfx("door_open", () => tryEnterAt(mapX, mapY))
});

  }

if (obj.id === "build_site" || obj.id === "foundation" || obj.id === "framing") {
  options.push({
    label: "+ Contribute materials",
    action: () => {
      closeMenu();
      openConstructionUI(mapX, mapY);
    }
  });
}

  if (options.length === 0) return;

  openMenu({ screenX, screenY, title: def.name, options });
}

// --------------------------
// Construction UI (modal)
// --------------------------

// returns stage object from BUILD_STAGES by id
function buildStageDef(id) {
  return BUILD_STAGES.find(s => s.id === id) || null;
}

function buildStageIndex(id) {
  const i = BUILD_STAGES.findIndex(s => s.id === id);
  return i < 0 ? 0 : i;
}

// aggregated remaining needs across current stage + future stages (total house)
function buildRemainingTotal(stageId, mats) {
  const startIdx = buildStageIndex(stageId);
  const remaining = {};

  for (let i = startIdx; i < BUILD_STAGES.length; i++) {
    const needs = BUILD_STAGES[i].needs;
    if (!needs) continue;
    for (const k of Object.keys(needs)) {
      remaining[k] = (remaining[k] || 0) + needs[k];
    }
  }

  // subtract what has already been deposited (proj.mats holds total deposit)
  for (const k of Object.keys(remaining)) {
    const have = mats?.[k] || 0;
    remaining[k] = Math.max(0, remaining[k] - have);
  }

  return remaining; // matId -> qtyRemaining
}

// remaining needs for the CURRENT stage only (what’s required to build the next stage)
function buildRemainingStage(stageId, mats) {
  const stage = buildStageDef(stageId);
  const needs = stage?.needs || null;
  const remaining = {};
  if (!needs) return remaining;
  for (const k of Object.keys(needs)) {
    const have = mats?.[k] || 0;
    remaining[k] = Math.max(0, needs[k] - have);
  }
  return remaining; // matId -> qtyRemaining for this stage
}

function stageLabel(stageId) {
  if (!stageId) return "";
  return stageId.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function buildTotalRequiredAll() {
  const total = {};
  for (const s of BUILD_STAGES) {
    if (!s.needs) continue;
    for (const k of Object.keys(s.needs)) {
      total[k] = (total[k] || 0) + s.needs[k];
    }
  }
  return total; // matId -> totalNeeded
}

const _BUILD_TOTAL_REQ = buildTotalRequiredAll();

function buildOverallProgressPct(stageId, mats) {
  // We measure overall progress by total required materials across all stages.
  let needSum = 0;
  let haveSum = 0;
  for (const k of Object.keys(_BUILD_TOTAL_REQ)) {
    const need = _BUILD_TOTAL_REQ[k];
    const have = mats?.[k] || 0;
    needSum += need;
    haveSum += Math.min(need, have);
  }
  if (needSum <= 0) return 0;
  return Math.max(0, Math.min(1, haveSum / needSum));
}

// filter inventory stacks to only those that are relevant (still needed >0)
function constructionRelevantInvStacks(inv, remaining) {
  const out = [];
  for (let i = 0; i < inv.length; i++) {
    const st = inv[i];
    if (!st || !st.id || !st.qty) continue;
    if ((remaining[st.id] || 0) <= 0) continue;
    out.push({ idx: i, stack: st });
  }
  return out;
}

function openConstructionUI(x, y) {
  const obj = state.world.objects?.[y]?.[x];
  if (!obj) return;

  const key = obj.meta?.key || `${x},${y}`;
  const proj = state.buildProjects[key];
  if (!proj) return;

  state.constructionOpen = { key, x, y };
  state.constructionSelectedInvIdx = -1;
  state.constructionLogScroll = 0;
}

function closeConstructionUI() {
  state.constructionOpen = null;
  state.constructionSelectedInvIdx = -1;
  state.constructionLogScroll = 0;
}

// record contributions in proj.contribLog
function pushContribLog(proj, playerName, itemId, qty) {
  proj.contribLog = proj.contribLog || [];
  proj.contribLog.push({
    t: Date.now(),
    who: playerName,
    itemId,
    qty
  });

  // cap to keep it sane
  if (proj.contribLog.length > 80) proj.contribLog.splice(0, proj.contribLog.length - 80);
}

// deposit from inventory into project mats (stockpile)
function contributeMaterial(proj, itemId, qty) {
  const inv = activeInv();
  const p = activePlayer();

  // clamp qty to what’s needed for the CURRENT stage
  const obj = state.world.objects?.[state.constructionOpen.y]?.[state.constructionOpen.x];
  const stageId = obj?.id || "build_site";
  const remaining = buildRemainingStage(stageId, proj.mats);
  const canUse = remaining[itemId] || 0;

  if (canUse <= 0) return false;

  // Sum quantity across ALL stacks (your getQty() only grabs first stack)
  let haveInv = 0;
  for (const st of inv) if (st?.id === itemId) haveInv += (st.qty || 0);

  // allow partial deposits
  const want = Math.max(1, Math.floor(qty || 0));
  const give = Math.min(want, canUse, haveInv);
  if (give <= 0) return false;

  const actuallyTaken = takeFromAllStacks(inv, itemId, give);
  if (actuallyTaken <= 0) return false;
  
  // ✅ concrete consumes a bucket: give empty bucket(s) back
  // If your empty bucket item id is different, change "bucket" here.
  if (itemId === "concrete") {
    addItem(inv, "bucket", actuallyTaken);
  }
  
  proj.mats = proj.mats || {};
  proj.mats[itemId] = (proj.mats[itemId] || 0) + actuallyTaken;

  pushContribLog(proj, p.name, itemId, actuallyTaken);
  playSound("click");
  return true;
}

function takeFromAllStacks(inv, itemId, qty) {
  let left = qty;

  for (let i = 0; i < inv.length && left > 0; i++) {
    const st = inv[i];
    if (!st || st.id !== itemId || !st.qty) continue;

    const take = Math.min(st.qty, left);
    st.qty -= take;
    left -= take;

    if (st.qty <= 0) inv[i] = null;
  }

  // optional cleanup: collapse nulls if you already do this elsewhere
  // inv = inv.filter(Boolean);

  return qty - left; // actually taken
}

// withdraw from stockpile back to inventory (optional but handy)
function withdrawMaterial(proj, itemId, qty) {
  const have = proj.mats?.[itemId] || 0;
  if (have <= 0) return false;

  const want = Math.max(1, Math.floor(qty || 0));
  const take = Math.min(want, have);

  const inv = activeInv();
  const res = addItem(inv, itemId, take);

  // If we couldn't add anything, deny and do nothing.
  if (!res || res.added <= 0) { playSound("deny"); return false; }

  // Only remove what we actually managed to put into inventory.
  const pulled = res.added;

  proj.mats[itemId] = have - pulled;
  if (proj.mats[itemId] <= 0) delete proj.mats[itemId];

  const p = activePlayer();
  pushContribLog(proj, p.name, itemId, -pulled);

  // If inventory was full and we only took part, let the player know.
  if (res.remaining > 0) logAction(`${p.name} couldn't carry all of it and only withdrew ${pulled}.`);

  playSound("click");
  return true;
}

// UI layout constants (match your other modals vibe)
function constructionUILayout() {
  const pad = 12;
  const leftW = 380;
  const rightW = 400;
  const boxW = leftW + rightW + (pad * 3);
  const boxH = Math.min(520, window.innerHeight - 120);
  const x = Math.floor((window.innerWidth - boxW) / 2);
  const y = Math.floor((window.innerHeight - boxH) / 2);

  return { x, y, boxW, boxH, pad, leftW, rightW };
}

function drawConstructionUI() {
  if (!state.constructionOpen) return;

  const { key, x: bx, y: by } = state.constructionOpen;
  const proj = state.buildProjects[key];
  const obj = state.world.objects?.[by]?.[bx];
  if (!proj || !obj) { closeConstructionUI(); return; }

  const stageId = obj.id;
  const stage = buildStageDef(stageId);
  const inv = activeInv();

  // what we still need for the NEXT stage only
  const remainingStage = buildRemainingStage(stageId, proj.mats);
  const invList = constructionRelevantInvStacks(inv, remainingStage);

  const { x, y, boxW, boxH, pad, leftW, rightW } = constructionUILayout();

  // panel
  drawRect(x, y, boxW, boxH, "rgba(20,20,20,0.96)");
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.strokeRect(x, y, boxW, boxH);

  drawText(`Construction`, x + 14, y + 18, 16);
  drawText(`(${bx},${by}) • Stage: ${stageId}`, x + 14, y + 38, 12, "left", "rgba(255,255,255,0.75)");

  // close button (top-right)
  const closeBtn = { x: x + boxW - 34, y: y + 10, w: 24, h: 24 };
  drawRect(closeBtn.x, closeBtn.y, closeBtn.w, closeBtn.h, "rgba(255,255,255,0.08)");
  drawText("✕", closeBtn.x + 12, closeBtn.y + 14, 14, "center", "rgba(255,255,255,0.85)");

  state._constructionUI = { closeBtn, x, y, boxW, boxH, leftW, rightW, pad, invList };

  // left: relevant inventory
  const lx = x + pad;
  const ly = y + 60;
  const lh = boxH - 70;

  drawRect(lx, ly, leftW, lh, "rgba(0,0,0,0.22)");
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.strokeRect(lx, ly, leftW, lh);

  drawText("Inventory", lx + 10, ly + 18, 13);

  // Move All button (inventory side)
  const allBtn = { x: lx + leftW - 120, y: ly + 8, w: 110, h: 22 };
  drawRect(allBtn.x, allBtn.y, allBtn.w, allBtn.h, "rgba(255,255,255,0.08)");
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.strokeRect(allBtn.x, allBtn.y, allBtn.w, allBtn.h);
  drawText("Move All >>", allBtn.x + allBtn.w / 2, allBtn.y + 15, 11, "center", "rgba(255,255,255,0.85)");
  state._constructionUI.allBtn = allBtn;

  const rowH = 34;
  let invY = ly + 34;

  for (let i = 0; i < invList.length; i++) {
    const { idx, stack } = invList[i];
    const item = itemDef(stack.id);
    const label = `${item?.name || stack.id}`;

    const row = { x: lx + 8, y: invY, w: leftW - 16, h: rowH };
    const selected = (state.constructionSelectedInvIdx === idx);

    drawRect(row.x, row.y, row.w, row.h, selected ? "rgba(120,200,255,0.18)" : "rgba(255,255,255,0.05)");
    drawText(`${label}`, row.x + 36, row.y + 20, 12, "left", "rgba(255,255,255,0.92)");

    // inventory side should ONLY show you have, not "needed"
    drawText(`x${stack.qty}`, row.x + row.w - 10, row.y + 20, 12, "right", "rgba(255,255,255,0.80)");

    // icon (shift label right enough so it never overlaps)
    if (item?.icon) drawCenteredEmoji(item.icon, row.x + 18, row.y + 18, 18);

    invList[i].hit = row;
    invY += rowH + 6;
    if (invY > ly + lh - rowH - 10) break;
  }

  if (invList.length === 0) {
    drawText("No relevant materials in inventory.", lx + 10, ly + 60, 12, "left", "rgba(255,255,255,0.55)");
  }

  // right: construction stockpile + big icon + progress + needs + log
  const rx = lx + leftW + pad;
  const ry = ly;
  const rh = lh;
  
const stageTitle = stage
  ? stage.id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  : "Construction";

  drawRect(rx, ry, rightW, rh, "rgba(0,0,0,0.22)");
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.strokeRect(rx, ry, rightW, rh);
  drawText(stageTitle, rx + 10, ry + 18, 13);

  // big stage icon (full size)
  const stageDef = buildStageDef(stageId);
  if (stageDef?.icon) {
    const ico = { type: "image", src: `src/icons/${stageDef.icon}` };
    drawCenteredEmoji(ico, rx + 56, ry + 68, 96);
  }

  // build button label must say what we're building toward
  const target = BUILD_NEXT[stageId];
  const buildLabel = target ? `Build ${stageLabel(target)}` : "Build";

  // build button (top-right)
  const stageNeeds = stage?.needs || null;
  let buildBtn = null;

  if (stageNeeds) {
    const ready = Object.keys(stageNeeds).every(matId => (proj.mats?.[matId] || 0) >= stageNeeds[matId]);
    buildBtn = { x: rx + rightW - 130, y: ry + 12, w: 120, h: 26 };
    drawRect(buildBtn.x, buildBtn.y, buildBtn.w, buildBtn.h, ready ? "rgba(120,220,120,0.25)" : "rgba(255,255,255,0.06)");
    drawText(buildLabel, buildBtn.x + buildBtn.w / 2, buildBtn.y + 17, 12, "center",
      ready ? "rgba(120,220,120,0.95)" : "rgba(255,255,255,0.75)"
    );
    state._constructionUI.buildBtn = ready ? buildBtn : null;
  } else {
    state._constructionUI.buildBtn = null;
  }

  // overall progress bar (avoid overlap with button)
  const pct = buildOverallProgressPct(stageId, proj.mats);
  const progressX = rx + 110;
  const progressY = ry + 88;

  drawText(`Overall Progress: ${Math.round(pct * 100)}%`, progressX, progressY, 12, "left", "rgba(255,255,255,0.85)");

  const pbx = progressX;
  const pby = ry + 99;
  const pbw = Math.max(260, (rx + rightW) - pbx - 170);
  const pbh = 8;

  drawRect(pbx, pby, pbw, pbh, "rgba(0,0,0,0.55)");
  drawRect(pbx, pby, Math.floor(pbw * pct), pbh, "rgba(120,220,120,0.9)");

    // --- Right panel columns (prevents overlap) ---
  const needColW = Math.min(240, Math.floor(rightW * 0.44));
  const stockColW = rightW - needColW - 30; // padding + gutter
  const needX = pbx;   // right column start
  const needTitleY = ry + 32;

  drawText("Needed for construction:", needX, needTitleY, 13, "left", "rgba(255,255,255,0.90)");

  const remaining = buildRemainingStage(stageId, proj.mats);
  const needKeys = Object.keys(remaining).filter(k => remaining[k] > 0);

  let ny = needTitleY + 18;
  for (const matId of needKeys.slice(0, 6)) {
    const item = itemDef(matId);
    const label = item?.name || matId;
    drawText(`${label}: ${remaining[matId]}`, needX, ny, 16, "left", "rgba(255,230,10,0.80)");
    ny += 16;
  }
  if (needKeys.length === 0) {
    drawText("Nothing. Ready to build!", needX, ny, 16, "left", "rgba(120,220,120,0.9)");
    ny += 16;
  }

  // --- Site Stockpile: under Still Needed (left half) ---
  const stockTitleY = ry + 128;
  drawText("Site Stockpile", rx + 10, stockTitleY, 13);

  let sy = stockTitleY + 18;

  const mats = proj.mats || {};
  const matKeys = Object.keys(mats).sort();
  const stockRows = [];

  // keep it compact so the log can be BIG
  const stockStopY = ry + 230;

  for (const matId of matKeys) {
    const qty = mats[matId] || 0;
    if (qty <= 0) continue;

    const item = itemDef(matId);
    const label = item?.name || matId;

    const row = { x: rx + 10, y: sy, w: stockColW, h: 28, matId };
    drawRect(row.x, row.y, row.w, row.h, "rgba(255,255,255,0.05)");
    if (item?.icon) drawCenteredEmoji(item.icon, row.x + 14, row.y + 14, 16);

    // Fix overlap: push name right so icons never collide with text
    drawText(`${label}`, row.x + 36, row.y + 18, 12, "left", "rgba(255,255,255,0.90)");
    drawText(`x${qty}`, row.x + row.w - 10, row.y + 18, 12, "right", "rgba(255,255,255,0.75)");

    stockRows.push(row);
    sy += 34;

    if (sy > stockStopY) break;
  }

  // contribution log
  const logTitleY = stockStopY + 18;
  drawText("Contributions", rx + 10, logTitleY, 13);

  const logBox = { x: rx + 12, y: logTitleY + 15, w: rightW - (pad * 2), h: (ry + rh - pad) - (logTitleY + 18) };
  drawRect(logBox.x, logBox.y, logBox.w, logBox.h, "rgba(0,0,0,0.35)");

  const logs = proj.contribLog || [];
  const maxLines = Math.floor(logBox.h / 16) - 1;
  const start = Math.max(0, logs.length - maxLines);

  let ly2 = logBox.y + 18;
  for (let i = start; i < logs.length; i++) {
    const e = logs[i];
    const sign = e.qty >= 0 ? "+" : "";
    drawText(`${e.who} ${sign}${e.qty} ${e.itemId}`, logBox.x + 8, ly2, 11, "left", "rgba(255,255,255,0.70)");
    ly2 += 16;
  }

  // store clickable rows + (we keep invList already stored)
  state._constructionUI.stockRows = stockRows;
}

function handleConstructionTap(px, py) {
  if (!state.constructionOpen) return false;
  const ui = state._constructionUI;
  if (!ui) return true;

  // close
  if (ui.closeBtn && hitRect(px, py, ui.closeBtn)) {
    playSound("click");
    closeConstructionUI();
    return true;
  }
  
  // Move All (to next-stage needs only)
if (ui.allBtn && hitRect(px, py, ui.allBtn)) {
  const { key, x: bx, y: by } = state.constructionOpen;
  const proj = state.buildProjects[key];
  const obj = state.world.objects?.[by]?.[bx];
  if (!proj || !obj) return true;

  const stageId = obj.id;
  const inv = activeInv();
  const who = activePlayer().name;

  const remaining = buildRemainingStage(stageId, proj.mats);

  for (const itemId of Object.keys(remaining)) {
    const need = remaining[itemId] || 0;
    if (need <= 0) continue;
    contributeMaterialToProject(stageId, proj, inv, itemId, need, who);
  }

  playSound("click");
  return true;
}

if (ui.stockRows) {
  for (const r of ui.stockRows) {
    if (hitRect(px, py, r)) {
      const { key, x: bx, y: by } = state.constructionOpen;
      const proj = state.buildProjects[key];
      const inv = activeInv();
      const who = activePlayer().name;

      // example: withdraw 5 per click
      withdrawMaterialFromProject(proj, inv, r.matId, 5, bx, by, who);

      playSound("click");
      return true;
    }
  }
}

  const { key, x: bx, y: by } = state.constructionOpen;
  const proj = state.buildProjects[key];
  const obj = state.world.objects?.[by]?.[bx];
  if (!proj || !obj) { closeConstructionUI(); return true; }
  
  // Move All button
if (ui.allBtn && hitRect(px, py, ui.allBtn)) {
  playSound("click");
  const stageId = obj.id;
  const remainingStage = buildRemainingStage(stageId, proj.mats);
  for (const matId of Object.keys(remainingStage)) {
    const need = remainingStage[matId] || 0;
    if (need > 0) contributeMaterialToProject(stageId, proj, activeInv(), matId, need, activePlayer().name);
  }
  return true;
}

  // click inventory list rows
  for (const row of ui.invList) {
    if (row.hit && hitRect(px, py, row.hit)) {
      state.constructionSelectedInvIdx = row.idx;
      playSound("click");

      // single-click deposits 1 (simple, fast testing)
      contributeMaterial(proj, row.stack.id, 1);
      return true;
    }
  }

  // click stockpile rows to withdraw 1 (optional convenience)
  for (const r of (ui.stockRows || [])) {
    if (hitRect(px, py, r)) {
      withdrawMaterial(proj, r.matId, 1);
      return true;
    }
  }

  // build button
  if (ui.buildBtn && hitRect(px, py, ui.buildBtn)) {
    const stageId = obj.id;
    playSound("click");
    closeConstructionUI();
    startBuildTimer(key, bx, by, stageId);
    return true;
  }

  return true; // modal eats clicks
}

// ------------------------------------------------------------------------------------ Crafting & Recipes ----
function recipeList() { return Object.values(state.data.recipes); }

function canCraftRecipe(r) {
  const inv = activeInv();

   if (r.station && !recipeHasStation(r, "hand")) {
    const p = activePlayer();
    let ok = false;

    const needStations = recipeStations(r);

    // include SAME tile + adjacent tiles
    const tilesToCheck = [[p.x, p.y], ...neighbors4(p.x, p.y)];

    for (const [nx, ny] of tilesToCheck) {
      const obj = objectAt(nx, ny);
      if (!obj) continue;
      if (obj.id === "campfire" && !((obj.meta?.fireT ?? 0) > 0)) continue;   // a burnt-out campfire can't cook
      const odef = objDef(obj.id);

      // station match (supports recipes that list multiple valid stations)
      if (odef?.station && needStations.includes(odef.station)) { ok = true; break; }
    }

    if (!ok) return { ok: false, reason: `Needs ${needStations.join(" or ")}` };
  }

  if (r.requiresTool && !hasTool(inv, r.requiresTool)) {
    return { ok: false, reason: `Requires ${itemDef(r.requiresTool)?.name ?? r.requiresTool}` };
  }
  for (const t of (r.requiresTools ?? [])) {
    if (!hasTool(inv, t)) return { ok: false, reason: `Requires ${itemDef(t)?.name ?? t}` };
  }

  // recipes that place something on your own tile (workbench, campfire)
  if (r.builds) {
    if (state.mode !== "overworld") return { ok: false, reason: "Overworld only" };
    const bp = activePlayer();
    if (state.world.objects?.[bp.y]?.[bp.x]) return { ok: false, reason: "Tile occupied" };
  }

  for (const [id, amt] of Object.entries(r.in)) {
    if (getQty(inv, id) < amt) return { ok: false, reason: "Missing items" };
  }
  return { ok: true };
}

function isRecipeScroll(itemId) {
  const def = itemDef(itemId);
  return !!def?.tags?.includes("recipe");
}

// recipe scroll items can either match a recipe id exactly, OR be <id>_recipe while the recipe is <id>
function recipeIdFromScroll(scrollItemId) {
  if (state.data.recipes[scrollItemId]) return scrollItemId;
  if (scrollItemId.endsWith("_recipe")) {
    const maybe = scrollItemId.slice(0, -"_recipe".length);
    if (state.data.recipes[maybe]) return maybe;
  }
  return null;
}

function recipeStations(r) {
  if (!r || !r.station) return [];
  return Array.isArray(r.station) ? r.station : [r.station];
}

function recipeHasStation(r, stationId) {
  return recipeStations(r).includes(stationId);
}

// ---- Crafting modes: "craft" (workbench), "cook" (campfire/stove), "prep" (counter), "hand" (no station: Craft in your own context menu) ----
// One place decides which recipes and which inventory items each mode shows (the popup and its click handlers all use these).
function craftingModeHasRecipe(r) {
  const m = state.craftingMode;
  if (m === "craft") return recipeHasStation(r, "workbench");
  if (m === "cook")  return recipeHasStation(r, "campfire") || recipeHasStation(r, "stove");
  if (m === "prep")  return recipeHasStation(r, "counter");
  if (m === "hand")  return recipeHasStation(r, "hand");
  return false;
}
function craftingModeRecipes() { return recipeList().filter(craftingModeHasRecipe); }
const _modeIngredients = {};
function craftingModeHasItem(def) {
  const tags = def?.tags ?? [];
  const m = state.craftingMode;
  // anything one of this mode's recipes uses can be mixed in, whatever its tags (planks, matches...), so every recipe can be stumbled on
  if (!_modeIngredients[m]) _modeIngredients[m] = new Set(craftingModeRecipes().flatMap(r => Object.keys(r.in ?? {})));
  if (def?.id && _modeIngredients[m].has(def.id)) return true;
  if (m === "craft" || m === "hand") return tags.includes("resource");
  if (m === "cook") return tags.includes("food");
  if (m === "prep") return tags.includes("food") || tags.includes("dish") || tags.includes("resource");
  return false;
}
// hand recipes are known from the start; everything else is learned from scrolls or by experimenting
function recipeKnown(r) { return state.learnedRecipes.has(r.id) || (recipeHasStation(r, "hand") && !r.locked); }

// Furniture pieces you may build from the start; every other piece needs its recipe scroll found and learned.
const STARTER_FURNITURE = ["f_chair_a", "f_table_a", "f_bed_double", "f_cupboard_a", "f_shelf_a", "f_carpet_a", "f_food_plate", "f_wood_stool_1", "f_wood_table_1"];
function seedStarterRecipes() {
  for (const id of STARTER_FURNITURE) { const rid = state.data?.furniture?.[id]?.recipe; if (rid) state.learnedRecipes.add(rid); }
}
function furnitureUnlocked(id) { if (window.__devMode) return !!state.data?.furniture?.[id]; const rid = state.data?.furniture?.[id]?.recipe; return !!rid && state.learnedRecipes.has(rid); }   // dev mode (?dev=1) has everything
/** How many pieces are unlocked / exist (for the builder's list). */
function furnitureUnlockCount() { const all = Object.values(state.data?.furniture ?? {}); return { have: all.filter((f) => state.learnedRecipes.has(f.recipe)).length, total: all.length }; }
const CRAFT_MODE_TITLE = { craft: "Crafting", cook: "Cooking", prep: "Preparing", hand: "Crafting" };
const CRAFT_MODE_VERB = { craft: "Craft", cook: "Cook", prep: "Prepare", hand: "Craft" };

// After building something on your own tile you are standing inside it: walk to a free neighbouring tile.
function stepAsideFromBuild() {
  const p = activePlayer();
  for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) {
    const nx = p.x + dx, ny = p.y + dy;
    if (!inBounds(nx, ny, currentDims().w, currentDims().h)) continue;
    if (!isPassable(nx, ny) || getCurrentMap().objects?.[ny]?.[nx]) continue;
    setPathTo(nx, ny);
    return true;
  }
  return false;
}

function buildWorkbenchAtPlayer() {
  if (state.mode !== "overworld") return false;

  const p = activePlayer();
  const inv = activeInv();

  if (state.world.objects[p.y][p.x]) return false;
  if (getQty(inv, "wood") < 10) return false;
  if (!hasTool(inv, "hammer")) return false;
  if (!hasTool(inv, "saw")) return false;

  removeItem(inv, "wood", 10);

  playSound("hammer");
  state.world.objects[p.y][p.x] = { id: "workbench", hp: 999 };

  // AUTO-MARK
  addMarker("Workbench", p.x, p.y, "workbench");

  logAction(`${p.name} built a workbench at (${p.x},${p.y}).`);
  stepAsideFromBuild();
  return true;
}

function buildCampfireAtPlayer() {
  if (state.mode !== "overworld") return false;

  const p = activePlayer();
  const inv = activeInv();

  // Don’t stack campfires like it’s a Minecraft exploit
  if (state.world.objects[p.y][p.x]) return false;

  if (getQty(inv, "wood") < 3) return false;
  if (getQty(inv, "matches") < 1) return false;

  removeItem(inv, "wood", 3);
  removeItem(inv, "matches", 1);

  state.world.objects[p.y][p.x] = {
    id: "campfire",
    hp: 999,
    meta: { fireT: CAMPFIRE_BURN_SECONDS }
  };

  // AUTO-MARK
  addMarker("Campfire", p.x, p.y, "campfire");

  playSound("lightfire");
  logAction(`${p.name} built a campfire at (${p.x},${p.y}).`);
  stepAsideFromBuild();
  return true;
}

function getEmptyBucketId() {
  // Prefer an explicit empty bucket id if you have one, otherwise fall back to "bucket"
  const cands = ["empty_bucket", "bucket_empty", "bucket"];
  for (const id of cands) {
    if (state.data?.items?.[id]) return id;
  }
  return "bucket";
}

function refundContainerForConsumedItem(inv, itemId, qty) {
  // Concrete is assumed to be "concrete in a bucket"
  if (itemId === "concrete" && qty > 0) {
    addItem(inv, getEmptyBucketId(), qty);
  }
}

function craftRecipe(recipeId) {
  const r = state.data.recipes[recipeId];
  if (!r) return;

  const chk = canCraftRecipe(r);
  if (!chk.ok) return;

  const inv = activeInv();

  // placed things do their own paying, placing, logging and stepping aside
  if (r.builds === "campfire") { buildCampfireAtPlayer(); return; }
  if (r.builds === "workbench") { buildWorkbenchAtPlayer(); return; }

 // consume inputs (+ refund containers like empty buckets)
for (const [id, amt] of Object.entries(r.in)) {
  removeItem(inv, id, amt);
  refundContainerForConsumedItem(inv, id, amt);
}

  // produce outputs
  for (const [id, amt] of Object.entries(r.out)) addItem(inv, id, amt);

  // log crafting (exclude movement, include crafting)
  const pName = activePlayer().name;
  
const isCooking = recipeHasStation(r, "campfire") || recipeHasStation(r, "stove");
playSound(isCooking ? "cook" : recipeHasStation(r, "hand") ? "pickup" : "saw");

  logAction(`${pName} crafted ${r.name}!`);
}

// Furniture can't be crafted into your pack, but mixing exactly what a piece costs at the workbench gives you the idea for one you don't know yet.
function furnitureHunch() {
  if (state.craftingMode !== "craft") return null;
  const sel = state.selectedForCraft; if (!sel || !sel.size) return null;
  const list = Object.values(state.data?.furniture ?? {}).filter(f => {
    if (state.learnedRecipes.has(f.recipe)) return false;
    const ids = Object.keys(f.cost ?? {});
    return ids.length === sel.size && ids.every(id => (sel.get(id) ?? 0) === f.cost[id]);
  });
  return list.length ? list : null;
}

function attemptManualCraft() {
  if (state.selectedForCraft.size === 0) return;

  const sel = state.selectedForCraft; // Map itemId -> qty

  // Find recipe that matches selected ids AND selected quantities are a clean multiple of inputs
  // only this mode's recipes (10 wood is also "Plank x10", which is a workbench recipe), the one you picked first
  const modeRecipes = craftingModeRecipes().sort((a, b) => (b.id === state.selectedRecipeId) - (a.id === state.selectedRecipeId));
  const r = modeRecipes.find(r => {
    const ins = r.in ?? {};
    const inIds = Object.keys(ins);

    if (inIds.length !== sel.size) return false;

    // all selected ingredients must be present
    for (const id of inIds) {
      const s = sel.get(id) ?? 0;
      if (s <= 0) return false;

      const need = ins[id] ?? 0;
      if (need <= 0) return false;

      // must be an integer multiple
      if (s % need !== 0) return false;
    }

    // and all multiples must be the same across all inputs
    let mult = null;
    for (const id of inIds) {
      const m = (sel.get(id) ?? 0) / ins[id];
      if (mult === null) mult = m;
      else if (m !== mult) return false;
    }

    return mult !== null && mult >= 1;
  });

  if (!r) {
    const hunch = furnitureHunch();
    if (!hunch) return;
    const f = hunch[randInt(0, hunch.length - 1)];
    learnRecipe(f.recipe, true);
    logAction(`${activePlayer().name} had an idea: ${f.name}! (Recipe learned)`);
    playSound?.("achievement");
    state.selectedForCraft.clear();
    closeCraftingScreen();
    return true;
  }

  // Station gating (supports station arrays)
if (state.craftingMode === "craft" && !recipeHasStation(r, "workbench")) return;
if (state.craftingMode === "cook" && !(recipeHasStation(r, "campfire") || recipeHasStation(r, "stove"))) return;
if (state.craftingMode === "prep" && !recipeHasStation(r, "counter")) return;
if (state.craftingMode === "hand" && !recipeHasStation(r, "hand")) return;

  // Determine multiplier again (safe, since we validated)
  let mult = null;
  for (const [id, need] of Object.entries(r.in ?? {})) {
    const m = (sel.get(id) ?? 0) / need;
    mult = (mult === null) ? m : Math.min(mult, m);
  }
  mult = Math.floor(mult ?? 1);
  if (mult < 1) return;

  // Craft N times
  let crafted = 0;
  for (let i = 0; i < mult; i++) {
    const chk = canCraftRecipe(r);
    if (!chk.ok) break;
    craftRecipe(r.id);
    crafted++;
  }

  // Learn recipe on success (if at least one craft occurred)
  learnRecipe(r.id);

  // Clear selection after crafting
  state.selectedForCraft.clear();

  // The menu closes once something has been made (the log says what)
  if (crafted > 0) closeCraftingScreen();
  return crafted > 0;
}

function recipesMatchingSelection() {
  const selected = state.selectedForCraft;
  const list = recipeList();
  return list.filter(r => {
    if (selected.size === 0) return true;
    return Object.keys(r.in).every(id => selected.has(id));
  });
}

function learnRecipe(recipeId, silent = false) {
  if (!recipeId) return;
  if (!state.learnedRecipes.has(recipeId)) {
    state.learnedRecipes.add(recipeId);
    saveInventoriesSoon();

    if (!silent) {
      const r = state.data.recipes[recipeId];
      logAction(`Learned recipe: ${r?.name ?? recipeId}`);
      playSound?.("achievement");
    }
  }
}

// ---- Drawing ----
function drawRect(x, y, w, h, fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }

function drawText(text, x, y, size, align, color, font = BASE_FONT) {
  // Backward compat: some calls pass (color, align) instead of (align, color).
  // Detect and swap if align looks like a color and color looks like an alignment.
  const isAlign = (v) => v === "left" || v === "center" || v === "right";
  const looksLikeColor = (v) =>
    typeof v === "string" && (
      v.startsWith("rgb") ||
      v.startsWith("#") ||
      v.startsWith("hsl") ||
      v === "white" || v === "black"
    );

  // Handle omitted args safely
  if (align === undefined) align = "left";
  if (color === undefined) color = "#fff";

  // Swap if passed as (color, align)
  if (looksLikeColor(align) && isAlign(color)) {
    const tmp = align;
    align = color;
    color = tmp;
  }

  // Final safety: never feed canvas garbage
  if (!isAlign(align)) align = "left";
  if (typeof color !== "string") color = "#fff";
  if (!font) font = BASE_FONT;

  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawWrappedText(
  text,
  x,
  y,
  maxWidth,
  lineHeight,
  size = 14,
  align = "center",
  color = "#fff",
  font = BASE_FONT
) {
  ctx.save();
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";

  const paras = String(text ?? "").split("\n"); // ✅ respect manual line breaks
  let yy = y;

  for (let p = 0; p < paras.length; p++) {
    const words = paras[p].split(" ");
    let line = "";

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const test = line ? (line + word + " ") : (word + " ");
      const w = ctx.measureText(test).width;

      if (w > maxWidth && line) {
        ctx.fillText(line, x, yy);
        line = word + " ";
        yy += lineHeight;
      } else {
        line = test;
      }
    }

    if (line) {
      ctx.fillText(line, x, yy);
      yy += lineHeight;
    }

    // optional extra spacing between paragraphs (tweak or remove)
    if (p < paras.length - 1) yy += Math.floor(lineHeight * 0.5);
  }

  ctx.restore();
}

function drawCenteredEmoji(icon, cx, cy, size = 24) {
  // Unicode / emoji path
  if (typeof icon === "string") {
    ctx.font = `${size}px system-ui, Apple Color Emoji, Segoe UI Emoji`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(icon, cx, cy);
    return;
  }

  // Image icon path
  if (icon && icon.type === "image") {
    const img = getIconImage(icon.src);
    if (img && img.complete) {
      const iw = img.naturalWidth;
const ih = img.naturalHeight;

const scale = size / Math.max(iw, ih);

const w = iw * scale;
const h = ih * scale;

ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);

    }
  }
}

function drawIconFitWidth(icon, x, y, targetW) {
  if (!icon) return;

  // Emoji/string path: just center it in the tile width
  if (typeof icon === "string") {
    ctx.font = `${Math.floor(targetW * 0.6)}px system-ui, Apple Color Emoji, Segoe UI Emoji`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(icon, x + targetW / 2, y + TILE_SIZE / 2);
    return;
  }

  // Image path: scale to match target width, preserve aspect ratio
  if (icon.type === "image" && icon.src) {
    const img = getIconImage(icon.src); // ✅ your existing cache loader
    if (!img || !img.complete || img.naturalWidth <= 0) return;

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const scale = targetW / iw;
    const w = targetW;
    const h = ih * scale;

    // anchor to tile bottom so tall sprites look natural
    const dx = x;
    const dy = y + TILE_SIZE - h;

    ctx.drawImage(img, dx, dy, w, h);
  }
}

// Overworld object sizing based on def.size
function objSizeParams(def) {
  const s = (def?.size || "medium").toLowerCase();
  if (s === "large") return { scale: 1.5, yOff: Math.round(TILE_SIZE * 0.5) }; // spill into tile above
  if (s === "small") return { scale: 0.5, yOff: 0 };
  if (s === "tiny")  return { scale: 0.25, yOff: 0 };
  return { scale: 1.0, yOff: 0 }; // medium/default
}

// Draw an overworld object icon honoring size category.
// - Images: anchored to tile bottom, scaled by TILE_SIZE * scale, with optional upward offset.
// - Emoji: placed near tile bottom so "large" doesn't float weirdly.
function drawOverworldObjectIcon(def, icon, sx, sy) {
  const { scale, yOff } = objSizeParams(def);

  // Emoji / string path
  if (typeof icon === "string") {
    const sizePx = Math.round(26 * scale); // base 26 like your current overworld draw
    ctx.font = `${sizePx}px system-ui, Apple Color Emoji, Segoe UI Emoji`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    // anchor near bottom of tile, then push up if large
    const cx = sx + TILE_SIZE / 2;
    const cy = sy + TILE_SIZE - 6 - yOff;
    ctx.fillStyle = "#fff";
    ctx.fillText(icon, Math.round(cx), Math.round(cy));
    return;
  }

  // Image path
  if (icon && icon.type === "image" && icon.src) {
    const img = getIconImage(icon.src);
    if (!img || !img.complete || img.naturalWidth <= 0) return;

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    // Scale by HEIGHT relative to tile (like avatars): 1.0 = 1 tile tall
    const h = TILE_SIZE * scale;
    const w = iw * (h / ih);

    const dx = sx + (TILE_SIZE - w) / 2;
    const dy = sy + TILE_SIZE - h - yOff; // bottom-anchored + optional upward spill

    ctx.drawImage(
      img,
      Math.round(dx),
      Math.round(dy),
      Math.round(w),
      Math.round(h)
    );
  }
}

// Draw avatar with a chosen HEIGHT multiplier; width is natural from aspect ratio.
// Bottom anchored to tile, centered horizontally on the tile.
function drawAvatarTall(icon, tileX, tileY, scaleY = 1) {
  if (!icon) return;

  // Emoji fallback
  if (typeof icon === "string") {
    const cx = tileX + TILE_SIZE / 2;
    const cy = tileY + TILE_SIZE / 2;
    ctx.font = `${Math.floor(28 * scaleY)}px system-ui, Apple Color Emoji, Segoe UI Emoji`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(icon, cx, cy);
    return;
  }

  // Image
  if (icon.type === "image" && icon.src) {
    const img = getIconImage(icon.src);
    if (!img || !img.complete || img.naturalWidth <= 0) return;

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    // Base height: fit inside 1 tile by height (instead of forcing width)
    const baseH = TILE_SIZE;

    // Desired height (grows upward)
    const h = baseH * scaleY;

    // Natural width from aspect ratio
    const w = iw * (h / ih);

    // Bottom-align; keep centered on the tile
    const dx = tileX + (TILE_SIZE - w) / 2;
    const dy = tileY + TILE_SIZE - h;

    const yOff = 6; // move avatar up; adjust to taste

    ctx.drawImage(
      img,
      Math.round(dx),
      Math.round(dy - yOff),
      Math.round(w),
      Math.round(h)
    );
  }
}


// -------------------------------------------------------- DROPPING ITEMS ----
function isTileOccupiedForDrop(x, y) {
  x = Math.round(x);
  y = Math.round(y);

  const map = getCurrentMap();
  const obj = map.objects?.[y]?.[x];
  if (!obj) return false;

  // Allow stacking onto an existing dropped_item
  if (obj.id === "dropped_item") return false;

  const def = objDef(obj.id);
  if (def?.blocks) return true;

  return true;
}

function dropItemOnTile(itemId, qty, x, y) {
  x = Math.round(x);
  y = Math.round(y);

  const map = getCurrentMap();
  if (!map?.objects?.[y]) return false;

  const existing = map.objects[y][x];
  if (existing && existing.id === "dropped_item" && existing.meta?.itemId === itemId) {
    existing.meta.qty = (existing.meta.qty ?? 0) + qty;
    return true;
  }

  if (existing) return false;

  map.objects[y][x] = {
    id: "dropped_item",
    hp: 1,
    meta: { itemId, qty }
  };
  return true;
}

// -------------------------------------------------- MAP GENERATION ----
function drawWorld() {
  const map = getCurrentMap();
  if (!map) return;

    // ---- Safety guards: maps can be null/half-built for a frame during transitions/net sync ----
  if (!state.data?.tiles) return;

  const tiles = map.tiles;
  if (!Array.isArray(tiles) || tiles.length === 0 || !Array.isArray(tiles[0])) return;

  const h = tiles.length;
  const w = tiles[0].length;

  // Ensure objects grid exists and matches tiles
  if (!Array.isArray(map.objects) || map.objects.length !== h || !Array.isArray(map.objects[0])) {
    map.objects = Array.from({ length: h }, () => Array.from({ length: w }, () => null));
  }

  // explored is optional, but if you want it always present during overworld/dungeon:
  // if ((state.mode === "overworld" || state.mode === "dungeon") && !Array.isArray(map.explored)) {
  //   map.explored = emptyExplored(w, h);
  // }

  const { viewW, viewH } = viewTiles();
  const camX = state.cam.x;
  const camY = state.cam.y;
  const deferredBuildIcons = [];
  const deferredWindowBeams = [];
  const deferredLargeObjects = []; // overworld "large" objects for proper occlusion
  const deferredInteriorMulti = [];

  // Will hold "large" overworld objects that must draw AFTER players
let _largeFront = null;

  const deferredInteriorWallFront = [];
  const playerTileSet = new Set();

  // Cache player tiles for this frame (so wall can cover player only when on same tile)
  {
    const hh = state.holdingHands;
    if (hh) {
      const leadIndex = (typeof hh.leader === "number") ? hh.leader : hh.a;
      const lead = state.players[leadIndex];
      playerTileSet.add(`${Math.floor(lead.fx + 0.5)},${Math.floor(lead.fy + 0.5)}`);
    } else {
      for (const pl of state.players) {
        playerTileSet.add(`${Math.floor(pl.fx + 0.5)},${Math.floor(pl.fy + 0.5)}`);
      }
    }
  }

for (let y = Math.max(0, camY); y < Math.min(h, camY + viewH); y++) {
  for (let x = Math.max(0, camX); x < Math.min(w, camX + viewW); x++) {
      const { sx, sy } = mapToScreen(x, y);

const tileId = map.tiles?.[y]?.[x];
if (tileId == null) continue;

const t = state.data.tiles?.[tileId] ?? null;

const obj = map.objects?.[y]?.[x] ?? null;


// For dungeon + overworld, use that map's explored[][]
let explored = true;
if (state.mode === "overworld" || state.mode === "dungeon") {
  // Safety: if explored grid missing, treat as unexplored until revealAroundPlayers runs
  explored = !!(map.explored?.[y]?.[x]);
}

const isDay = !!state.time?.isDay;

// Night rules only apply to overworld (campfire, darkness, etc.)
const visNow =
  (state.mode === "overworld")
    ? (isDay ? explored : (isInPlayerSight(x, y) || isLitByCampfire(x, y)))
    : (state.mode === "dungeon")
      ? explored // dungeon visibility is strictly fog-based
      : true;     // interior: always visible

     // --- Tile draw (with planted dirt if visible) ---
let tileColor = t?.color ?? "#333";

if (state.mode === "dungeon") {
  if (tileId === "wall") tileColor = "#1b1b1b";
  else if (tileId === "floor") tileColor = "#3a3a3a";
  else tileColor = "#2a2a2a";
}

// Overworld special-case
if (visNow && obj && obj.id === "planted_seed") {
  tileColor = "#6b4f2a"; // dirt brown
}

if (state.mode === "interior") {
  const idef = state.data.interiors?.[state.interiorId];
  const wallTile = idef?.wallTile;
  const doorTile = idef?.doorTile;

  const isWall = (tileId === wallTile);
  const isDoor = (tileId === doorTile);

  // Base palette (solid colors, no textures)
  const floorA = "#7a5534";   // wood
  const floorB = "#6f4d30";   // wood shade
  const wallOuter = "#3e2a17";
  const wallInner = "#523621";
  const doorOuter = "#2b1b10";
  const doorInner = "#3a2415";
  // ---- Interior wall cap styling (shared)
const capH = 7;
const capWood = "rgba(180,120,60,0.60)";
const capHi   = "rgba(255,255,255,0.18)";
const capSh   = "rgba(0,0,0,0.30)";

  // Subtle floor variation (checker-ish) for depth
  if (!isWall && !isDoor) {
    const alt = ((x + y) & 1) === 0;
    drawRect(sx, sy, TILE_SIZE, TILE_SIZE, alt ? floorA : floorB);

    // inner vignette to fake “room depth”
    drawRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4, "rgba(0,0,0,0.10)");
  } else {
    // Walls / door = thicker, raised look
    const outer = isDoor ? doorOuter : wallOuter;
    const inner = isDoor ? doorInner : wallInner;

const isLeftWall  = (x === 0);
const isRightWall = (x === INTERIOR_W - 1);
const isTopWall   = (y === 0);
const isBottomWall = (y === INTERIOR_H - 1);

const half = Math.floor(TILE_SIZE / 2);
const inset = 4;

// --- Side walls: half thickness ---
if (isLeftWall) {
  // draw on right half of tile
  drawRect(sx + half, sy, half, TILE_SIZE, outer);
  drawRect(sx + half + inset, sy + inset, half - inset * 2, TILE_SIZE - inset * 2, inner);

} else if (isRightWall) {
  // draw on left half of tile
  drawRect(sx, sy, half, TILE_SIZE, outer);
  drawRect(sx + inset, sy + inset, half - inset * 2, TILE_SIZE - inset * 2, inner);

} else {
  // --- Top & bottom walls stay full thickness ---
  drawRect(sx, sy, TILE_SIZE, TILE_SIZE, outer);
  drawRect(sx + inset, sy + inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2, inner);
}

    const midX = Math.floor(INTERIOR_W / 2);
    const doorHere = isDoor || (isBottomWall && x === midX); // visual fallback door

    // ===== CLIPPED highlights + CLIPPED exterior logs (works with half-width side walls) =====

    // Compute the wall "slab" bounds for THIS tile (matches your half-width side wall rendering)
    const _half = Math.floor(TILE_SIZE / 2);
    let _wx = sx, _ww = TILE_SIZE;

    // Left wall tile: slab is on the RIGHT half
    if (x === 0) { _wx = sx + _half; _ww = _half; }
    // Right wall tile: slab is on the LEFT half
    else if (x === INTERIOR_W - 1) { _wx = sx; _ww = _half; }

    const _lipInset = Math.max(3, Math.floor(_ww * 0.12));

    // --- Bottom wall = exterior log wall (CLIPPED at corners to match half-width side walls) ---
	// Grass strip "outside" the cabin (at the very bottom edge of the tile)
if (isBottomWall) {
  const isDayNow = !!(state.time?.isDay);
  const gCol = isDayNow ? "#2f6f3a" : "rgba(47,111,58,0.35)";

  // Clip width at corners the same way as the logs do
  let _gx = sx, _gw = TILE_SIZE;
  const _half = Math.floor(TILE_SIZE / 2);
  if (x === 0) { _gx = sx + _half; _gw = _half; }
  else if (x === INTERIOR_W - 1) { _gx = sx; _gw = _half; }

  drawRect(_gx, sy + TILE_SIZE - 8, _gw, 8, gCol);
}

    if (isBottomWall && !doorHere) {
      const logA = "#c8923b";
      const logB = "#b47c2f";
      const chink = "rgba(40,20,8,0.55)";
      const hi = "rgba(255,255,255,0.10)";

      // Clip logs on bottom-left/bottom-right corners using the slab bounds
      let _lx = sx, _lw = TILE_SIZE;
      if (x === 0) { _lx = sx + _half; _lw = _half; }
      else if (x === INTERIOR_W - 1) { _lx = sx; _lw = _half; }

      const usableH = TILE_SIZE - (capH + 2) - 6; // space below cap and above grass/edge
const _bandH = Math.floor(usableH / 3);
      const _insetX = Math.max(4, Math.floor(_lw * 0.14));
      const _startY = sy + capH + 2; // start BELOW the bottom cap so nothing overlaps it

      for (let i = 0; i < 3; i++) {
        const yy = _startY + i * _bandH;
        const alt = ((x + i) & 1) === 0;

        drawRect(_lx + _insetX, yy, _lw - _insetX * 2, _bandH - 2, alt ? logA : logB);
        drawRect(_lx + _insetX, yy + 1, _lw - _insetX * 2, 1, hi);

        if (i < 2) {
          const _cx = _lx + Math.max(3, _insetX - 2);
          const _cw = _lw - Math.max(3, _insetX - 2) * 2;
          drawRect(_cx, yy + _bandH - 2, _cw, 2, chink);
        }
      }
    } else if (isBottomWall) {
      // Bottom wall but not log-painted (door area): subtle inner lip
      drawRect(sx + 4, sy + 4, TILE_SIZE - 8, 2, "rgba(255,255,255,0.12)");
    }

    // --- Door details (cabin style) ---
    if (doorHere) {
      // Door frame
      drawRect(sx + 6, sy + 6, TILE_SIZE - 12, TILE_SIZE - 12, "#8c5b22");

      // Door panel
      drawRect(sx + 10, sy + 14, TILE_SIZE - 20, TILE_SIZE - 26, "#744615");
      drawRect(sx + 12, sy + 16, TILE_SIZE - 24, TILE_SIZE - 30, "rgba(255,255,255,0.06)");

      // Knob
      drawRect(sx + TILE_SIZE - 18, sy + TILE_SIZE - 28, 3, 3, "#d8d8d8");

      // Threshold (exterior edge)
      if (isBottomWall) {
        drawRect(sx + 8, sy + TILE_SIZE - 6, TILE_SIZE - 16, 3, "rgba(0,0,0,0.35)");
        drawRect(sx + 10, sy + TILE_SIZE - 3, TILE_SIZE - 20, 1, "rgba(255,255,255,0.12)");
      }
    }

// ===== FINAL: wall caps drawn LAST so nothing draws over them =====

// Helper: corner clip width to match your half-thickness side walls (same idea as logs/grass)
function capSpanForRow() {
  // default: full tile width (no inset) to avoid seams/ticks between tiles
  let cx = sx;
  let cw = TILE_SIZE;

  // left corner: wall mass is effectively the right half
  if (x === 0) {
    cx = sx + half;
    cw = half;
  }
  // right corner: wall mass is effectively the left half
  else if (x === INTERIOR_W - 1) {
    cx = sx;
    cw = half;
  }

  if (cw < 2) cw = 2;
  return { cx, cw };
}

// TOP wall: cap at VERY TOP of the wall tile (does NOT touch floor tiles)
if (isTopWall) {
  const { cx, cw } = capSpanForRow();
  drawRect(cx, sy, cw, capH, capWood);
  drawRect(cx, sy, cw, 1, capHi);
  drawRect(cx, sy + capH - 1, cw, 1, capSh);
}

const sideCapH = isBottomWall ? capH : TILE_SIZE;

if (isLeftWall) {
  const lx = sx + half;
  drawRect(lx, sy, capH, sideCapH, capWood);
  drawRect(lx, sy, 1, sideCapH, capHi);
  drawRect(lx + capH - 1, sy, 1, sideCapH, capSh);
}

if (isRightWall) {
  const rx = sx + half - capH;
  drawRect(rx, sy, capH, sideCapH, capWood);
  drawRect(rx, sy, 1, sideCapH, capHi);
  drawRect(rx + capH - 1, sy, 1, sideCapH, capSh);
}


// BOTTOM wall: cap at TOP of the bottom wall tile (between wall + floor tiles)
if (isBottomWall) {
  const { cx, cw } = capSpanForRow();
  drawRect(cx, sy, cw, capH, capWood);
  drawRect(cx, sy, cw, 1, capHi);
  drawRect(cx, sy + capH - 1, cw, 1, capSh);
}

  }

  // Windows (drawn as insets on wall tiles)
// 8x8: put 2 windows per wall, avoid corners, avoid door
const midX = Math.floor(INTERIOR_W / 2);  // 4 for 8
const winXs = [2, INTERIOR_W - 3];        // [2,5]
const winYs = [2, INTERIOR_H - 3];        // [2,5]

let isWindowSpot = false;

// Top wall
if (y === 0 && winXs.includes(x)) isWindowSpot = true;
// Bottom wall (skip door position)
if (y === INTERIOR_H - 1 && winXs.includes(x) && x !== midX) isWindowSpot = true;
// Left wall
if (x === 0 && winYs.includes(y)) isWindowSpot = true;
// Right wall
if (x === INTERIOR_W - 1 && winYs.includes(y)) isWindowSpot = true;

if (isWindowSpot && isWall) {
  const isLeftWall  = (x === 0);
  const isRightWall = (x === INTERIOR_W - 1);
  const isTopWall   = (y === 0);
  const isBottomWall = (y === INTERIOR_H - 1);

  const half = Math.floor(TILE_SIZE / 2);
  const inset = 4;

  // Compute the wall "slab" bounds (matches your half-width side walls)
  let wx = sx, wy = sy, ww = TILE_SIZE, wh = TILE_SIZE;

  if (isLeftWall) {
    wx = sx + half; ww = half;              // left wall slab is on the right half
  } else if (isRightWall) {
    wx = sx; ww = half;                     // right wall slab is on the left half
  }

  // Door area safety: don't draw window over it
  const doorHere = (isBottomWall && x === midX);
  if (doorHere) {
    // nothing
  } else {
    // Window frame sized relative to slab
    const pad = Math.max(6, Math.floor(ww * 0.20));
    let fx = wx + pad;
    let fy = wy + 10;
    let fw = ww - pad * 2;
    let fh = TILE_SIZE - 20;

    // Bottom exterior wall: keep the window a bit higher so it sits in the "wall"
    // and doesn't clash with your log bands/door threshold vibe.
    if (isBottomWall) {
      fy = wy + 8;
      fh = TILE_SIZE - 24;
    }

    // Clamp in case slab is tight
    if (fw < 8 || fh < 8) return;

const isDayNow = !!(state.time?.isDay);

// Interior windows (top/left/right):
// - Day: pale glass + rays
// - Night: dark glass
//
// Exterior-facing bottom wall windows:
// - Day: brown tint (seeing floor through)
// - Night: warm glow (lights on)
const glassColor = (isBottomWall)
  ? (isDayNow ? "#6b4a2b" : "rgba(255,210,140,0.92)")
  : (isDayNow ? "rgba(210,230,255,0.70)" : "rgba(25,25,35,0.65)");

const innerSheen = (isBottomWall)
  ? (isDayNow ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.22)")
  : (isDayNow ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)");

// Frame stays the same
drawRect(fx, fy, fw, fh, "rgba(255,255,255,0.25)");                 // outer frame
drawRect(fx + 2, fy + 2, fw - 4, fh - 4, glassColor);              // glass
drawRect(fx + 3, fy + 3, fw - 6, fh - 6, innerSheen);

    // Cross muntin
    drawRect(fx + Math.floor(fw / 2) - 1, fy + 4, 2, fh - 8, "rgba(255,255,255,0.35)");
    drawRect(fx + 4, fy + Math.floor(fh / 2) - 1, fw - 8, 2, "rgba(255,255,255,0.35)");
	
	// ---- Defer window light beam so floors drawn later can't cover it
// (This only affects interior-facing beams; bottom wall windows are "exterior view" in your setup.)
if (!isBottomWall && (state.time?.isDay ?? true)) {
  const beamLen = TILE_SIZE * 3;

  if (isTopWall) {
    // Top wall beams go DOWN into the room
    deferredWindowBeams.push({
      dir: "down",
      x: fx + 2,
      y: fy + fh,
      w: fw - 4,
      h: beamLen
    });
  } else if (isLeftWall) {
    // Left wall beams go RIGHT into the room
    deferredWindowBeams.push({
      dir: "right",
      x: fx + fw,
      y: fy + 6,
      w: beamLen,
      h: fh - 12
    });
  } else if (isRightWall) {
    // Right wall beams go LEFT into the room
    deferredWindowBeams.push({
      dir: "left",
      x: fx - beamLen,
      y: fy + 6,
      w: beamLen,
      h: fh - 12
    });
  }
}

  }
}

  // IMPORTANT: don’t draw tile icons in interior mode (that’s your “brick texture”)
} else {
  // Overworld: keep your normal behavior
  drawRect(sx, sy, TILE_SIZE, TILE_SIZE, tileColor);

  // Tile icon stays (tiles aren't "objects")
  if (t?.icon) drawCenteredEmoji(t.icon, sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, 24);
}
	 
	    // --- 6x6 placement highlight (preview) ---
  if (state.placement?.active && typeof state.pointer.x === "number") {
    const { x: hx, y: hy } = screenToMap(state.pointer.x, state.pointer.y);

    for (let dy = 0; dy < BUILD_FOOTPRINT; dy++) {
      for (let dx = 0; dx < BUILD_FOOTPRINT; dx++) {
        const tx = hx + dx;
        const ty = hy + dy;
        const s = mapToScreen(tx, ty);
        drawRect(s.sx, s.sy, TILE_SIZE, TILE_SIZE, "rgba(100,200,255,0.25)");
      }
    }
  }

          // --- Objects (hidden at night unless visible now) ---
      if (obj && visNow) {
		  // --- Dungeon rune clue decal (floor-painted rune) ---
if (obj.id === "rune_clue") {
  const rune = obj.meta?.rune ?? 1;
  const img = getRuneImg(rune);

  // subtle "painted" look: slightly lower and smaller than a normal icon
  try {
    ctx.globalAlpha = 0.85;
    ctx.drawImage(
      img,
      sx + TILE_SIZE / 2 - 14,
      sy + TILE_SIZE / 2 - 12,
      28,
      28
    );
  } catch (_) {}
  ctx.globalAlpha = 1;

  // IMPORTANT: don't let normal object drawing run for this tile
  continue;
}

        // Special-case dropped items (not in objects.json)
        if (obj.id === "dropped_item") {
          const id = obj.meta?.itemId;
          const def = itemDef(id);
          const icon = def?.icon ?? "📦";
          drawCenteredEmoji(icon, sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, 24);

          // qty label
          const q = obj.meta?.qty ?? 1;
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.font = "12px system-ui";
          ctx.textAlign = "right";
          ctx.textBaseline = "bottom";
          ctx.fillText(String(q), sx + TILE_SIZE - 4, sy + TILE_SIZE - 3);

        } else {
          const o = objDef(obj.id);
          if (o?.icon) {
            const isBuildStage =
              (obj.id === "build_site" || obj.id === "foundation" || obj.id === "framing" || obj.id === "house");

            if (isBuildStage) {
              const size = TILE_SIZE * BUILD_FOOTPRINT;
              deferredBuildIcons.push({
                icon: o.icon,
                sx,
                sy,
                size
              });

            } else {
                           // Interior: household image icons should be fit-to-tile-width (bed is 2 tiles)
              if (state.mode === "interior") {
                // Skip occupied proxies (right-half of bed)
                if (obj.id === "occupied" && obj.meta?.anchor) {
                  // draw nothing
                } else {
                  const wTiles = obj.meta?.wTiles ?? (obj.id === "bed" ? 2 : 1);
                  const targetW = TILE_SIZE * wTiles;
                  const isHousehold = Array.isArray(o.tags) && o.tags.includes("household");
                  const yOff = isHousehold ? Math.floor(TILE_SIZE / 2) : 0;

                  // IMPORTANT:
                  // Multi-tile sprites (bed) spill into the next tile.
                  // The next tile's floor draws later and overwrites the spill.
                  // So we defer multi-tile interior objects until AFTER the tile loops.
                  if (wTiles > 1) {
                    deferredInteriorMulti.push({
                      icon: o.icon,
                      sx,
                      sy,
                      yOff,
                      targetW
                    });
                  } else {
                    drawIconFitWidth(o.icon, sx, sy - yOff, targetW);
                  }
                }

              } else {

  // Overworld: defer "large" so we can draw it in front of the player when needed
  const sizeTag = String(o?.size ?? "medium").toLowerCase();
  const isLarge = (sizeTag === "large");

  if (isLarge) {
    deferredLargeObjects.push({ def: o, sx, sy, x, y });
  } else {
    drawOverworldObjectIcon(o, o.icon, sx, sy);
  }
}


            }
          }

          // Build progress bar (if object is tied to a build project)
          const key = obj?.meta?.key;
          if (key) {
            const proj = state.buildProjects[key];
            if (proj?.building && proj.timeLeft != null && proj.stageId) {
              const total = BUILD_STAGE_TIME_SEC[proj.stageId] || 1;
              const done = Math.max(0, Math.min(1, 1 - (proj.timeLeft / total)));

              const barW = TILE_SIZE * BUILD_FOOTPRINT;
              const barH = 5;

              drawRect(sx, sy - 8, barW, barH, "rgba(0,0,0,0.6)");
              drawRect(sx, sy - 8, barW * done, barH, "rgba(120,220,120,0.9)");
            }
          }

          // Optional coord labels (only if you can see the object)
          if (state.mode === "overworld" && (obj.id === "house" || obj.id === "stockpile")) {
            drawText(`(${x},${y})`, sx + TILE_SIZE / 2, sy + 8, 11, "center", "rgba(255,255,255,0.85)");
          }
        }
      }

// --- Interior players are drawn PER-TILE for correct occlusion/order ---
if (state.mode === "interior") {
  const hh = state.holdingHands;

  // Helper: does this tile contain the (visual) player for this frame?
  const tileKey = `${x},${y}`;
  const playerHere = playerTileSet.has(tileKey);

  // Draw player(s) on THIS tile
  if (hh) {
    const leadIndex = (typeof hh.leader === "number") ? hh.leader : hh.a;
    const lead = state.players[leadIndex];

    const tx = Math.floor(lead.fx + 0.5);
    const ty = Math.floor(lead.fy + 0.5);

    if (tx === x && ty === y) {
      const psx = sx + (lead.fx - x) * TILE_SIZE;
      const psy = sy + (lead.fy - y) * TILE_SIZE;
      drawCenteredEmoji(HOLDING_HANDS_ICON, psx + TILE_SIZE / 2, psy + TILE_SIZE / 2, 34);
    }
  } else {
    for (let i = 0; i < state.players.length; i++) {
      const pl = state.players[i];
      const tx = Math.floor(pl.fx + 0.5);
      const ty = Math.floor(pl.fy + 0.5);
      if (tx !== x || ty !== y) continue;

      const psx = sx + (pl.fx - x) * TILE_SIZE;
      const psy = sy + (pl.fy - y) * TILE_SIZE;
      drawAvatarTall(pl.icon, psx, psy, 1.25);
    }
  }

  // --- Perimeter bottom wall occlusion ONLY when player stands on the SAME wall tile ---
  // Re-draw the "front" portion of the bottom exterior wall AFTER the player so legs get hidden.
  if (playerHere) {
    const idef = state.data.interiors?.[state.interiorId];
    const wallTile = idef?.wallTile;
    const doorTile = idef?.doorTile;

    const tileId2 = map.tiles[y][x];
    const isWall2 = (tileId2 === wallTile);
    const isDoor2 = (tileId2 === doorTile);

    const isBottomWall = (y === INTERIOR_H - 1);
    if ((isWall2 || isDoor2) && isBottomWall) {
      const midX = Math.floor(INTERIOR_W / 2);
      const doorHere = isDoor2 || (x === midX);

      // Clip to a bottom band so ONLY “wall height” hides sprites on this tile
      const band = 40;
      const y0 = sy + TILE_SIZE - band;

      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, y0, TILE_SIZE, band);
      ctx.clip();

      // Match your existing bottom-wall look (grass strip + logs/threshold)
      const capH = 7;
      const half = Math.floor(TILE_SIZE / 2);

      // Grass strip (clipped at corners like your wall slabs)
      {
        const isDayNow = !!(state.time?.isDay);
        const gCol = isDayNow ? "#2f6f3a" : "rgba(47,111,58,0.35)";
        let _gx = sx, _gw = TILE_SIZE;
        if (x === 0) { _gx = sx + half; _gw = half; }
        else if (x === INTERIOR_W - 1) { _gx = sx; _gw = half; }
        drawRect(_gx, sy + TILE_SIZE - 8, _gw, 8, gCol);
      }

      // Logs (skip if door tile)
      if (!doorHere) {
        const logA = "#c8923b";
        const logB = "#b47c2f";
        const chink = "rgba(40,20,8,0.55)";
        const hi = "rgba(255,255,255,0.10)";

        let _lx = sx, _lw = TILE_SIZE;
        if (x === 0) { _lx = sx + half; _lw = half; }
        else if (x === INTERIOR_W - 1) { _lx = sx; _lw = half; }

        const usableH = TILE_SIZE - (capH + 2) - 6;
        const _bandH = Math.floor(usableH / 3);
        const _insetX = Math.max(4, Math.floor(_lw * 0.14));
        const _startY = sy + capH + 2;

        for (let i = 0; i < 3; i++) {
          const yy = _startY + i * _bandH;
          const alt = ((x + i) & 1) === 0;

          drawRect(_lx + _insetX, yy, _lw - _insetX * 2, _bandH - 2, alt ? logA : logB);
          drawRect(_lx + _insetX, yy + 1, _lw - _insetX * 2, 1, hi);

          if (i < 2) {
            const _cx = _lx + Math.max(3, _insetX - 2);
            const _cw = _lw - Math.max(3, _insetX - 2) * 2;
            drawRect(_cx, yy + _bandH - 2, _cw, 2, chink);
          }
        }
      } else {
        // Door threshold vibe (matches your existing bottom-wall door styling)
        drawRect(sx + 8, sy + TILE_SIZE - 6, TILE_SIZE - 16, 3, "rgba(0,0,0,0.35)");
        drawRect(sx + 10, sy + TILE_SIZE - 3, TILE_SIZE - 20, 1, "rgba(255,255,255,0.12)");
      }

      ctx.restore();
    }
  }
}

  // --- Interior built HORIZONTAL + VERTICAL walls (per-tile) ---
// This must be INSIDE the tile loop and AFTER objects on this tile.
if (state.mode === "interior") {
  const walls = state.interior?.walls;

  // -------- HORIZONTAL (already working) --------
  if (walls?.h?.[y]?.[x]) {
    const band = 40;
    const inset = 2;

    const wallOuter = "#3e2a17";
    const wallInner = "#523621";

    const capH = 3;
    const capWood = "rgba(180,120,60,0.55)";
    const capHi   = "rgba(255,255,255,0.16)";
    const capSh   = "rgba(0,0,0,0.28)";

    const y0 = sy + TILE_SIZE - band;

    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, y0, TILE_SIZE, band);
    ctx.clip();

    drawRect(sx, y0, TILE_SIZE, band, wallOuter);
    drawRect(sx + inset, y0 + inset, TILE_SIZE - inset * 2, band - inset * 2, wallInner);

    drawRect(sx, y0, TILE_SIZE, capH, capWood);
    drawRect(sx, y0, TILE_SIZE, 1, capHi);
    drawRect(sx, y0 + capH - 1, TILE_SIZE, 1, capSh);

    ctx.restore();
  }

  // -------- VERTICAL (thin implied line + cap; continuous; no 3D) --------
{
  const thick = 2;
  const lineCol = "rgba(30,18,10,0.85)";
  const capCol  = "rgba(180,120,60,0.60)";
  const capHi   = "rgba(255,255,255,0.18)";
  const capSh   = "rgba(0,0,0,0.25)";

  const capW = 10;
  const capH = 3;

  const band = 40;                 // match horizontal band
  const yBandTop = sy + TILE_SIZE - band;

  // Draw only ONE copy of each edge: walls.v[y][x] owns the RIGHT edge of tile (x,y)
  if (walls?.v?.[y]?.[x]) {
    const lx = sx + TILE_SIZE - thick;

    // Full-height line so it doesn't look "unfinished"
    drawRect(lx, sy, thick, TILE_SIZE, lineCol);

    // Cap only at start of a continuous run (no segment above)
    // Continuous "cap" look: a highlight + shadow that runs down the wall *within the band*
// ---- Vertical "cap" strip: offset UP, and EXCLUDE bottom portion ----
const CAP_Y_OFF = 18;        // move it UP more (try 18–26)
const CAP_BOTTOM_CUT = 40;   // how much to remove at the very bottom of the run

const hasBelow = (y < INTERIOR_H - 1) && !!(walls?.v?.[y + 1]?.[x]);
const bottomCut = hasBelow ? 0 : CAP_BOTTOM_CUT;

let capBottom = (sy + TILE_SIZE) - bottomCut;
let capTop = yBandTop - CAP_Y_OFF;

// Clamp so we never invert or draw outside tile bounds
capTop = Math.max(sy, capTop);
capBottom = Math.min(sy + TILE_SIZE, capBottom);

const capHgt = Math.max(0, capBottom - capTop);
if (capHgt > 0) {
  // subtle wood-ish edge (optional)
  drawRect(lx - 1, capTop, 1, capHgt, capCol);

  // highlight edge
  drawRect(lx - 2, capTop, 1, capHgt, capHi);

  // shadow edge
  drawRect(lx + thick, capTop, 1, capHgt, capSh);
}

  }
}
}

// --- Fog + night darkness overlays ---
if (state.mode === "overworld" || state.mode === "dungeon") {
  // Unexplored tiles remain fogged always
  if (!explored) {
    // slightly different fog for dungeon vs overworld (optional, but nice)
    const fog = (state.mode === "dungeon")
      ? "rgba(0,0,0,0.92)"
      : "rgba(70,70,70,0.88)";
    drawRect(sx, sy, TILE_SIZE, TILE_SIZE, fog);
  } else if (state.mode === "overworld") {
    // At night: explored tiles are dark everywhere, except campfire glow
    if (!isDay) {
      const byFire = isLitByCampfire(x, y);

      if (!byFire) {
        drawRect(sx, sy, TILE_SIZE, TILE_SIZE, `rgba(0,0,0,${NIGHT_DARK_ALPHA})`);
      } else {
        drawRect(sx, sy, TILE_SIZE, TILE_SIZE, `rgba(0,0,0,${CAMPFIRE_LIT_DARK_ALPHA})`);
      }
    }
  }
}
    }
  }

// Draw deferred window beams ON TOP (so floor tiles can't cover them)
if (state.mode === "interior" && deferredWindowBeams.length) {
  for (const b of deferredWindowBeams) {
    ctx.save();

    if (b.dir === "down") {
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, "rgba(255,240,200,0.05)");
      g.addColorStop(1, "rgba(255,240,200,0.00)");
      ctx.fillStyle = g;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    } else if (b.dir === "right") {
      const g = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
      g.addColorStop(0, "rgba(255,240,200,0.05)");
      g.addColorStop(1, "rgba(255,240,200,0.00)");
      ctx.fillStyle = g;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    } else if (b.dir === "left") {
      const g = ctx.createLinearGradient(b.x + b.w, 0, b.x, 0);
      g.addColorStop(0, "rgba(255,240,200,0.05)");
      g.addColorStop(1, "rgba(255,240,200,0.00)");
      ctx.fillStyle = g;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }

    ctx.restore();
  }
}

// --- Deferred overworld "large" objects: split into back vs front (occlusion) ---
function _tileOfPlayer(pl) {
  // fx/fy are floats; use the tile we're actually in (prevents half-tile flicker)
  return { x: Math.floor(pl.fx), y: Math.floor(pl.fy) };
}

function _playerIsAboveObject(objX, objY) {
  // If holding hands, treat the combined icon as the only "player" tile
  const hh = state.holdingHands;
  if (hh) {
    const leadIndex = (typeof hh.leader === "number") ? hh.leader : hh.a;
    const lead = state.players[leadIndex];
    const t = _tileOfPlayer(lead);
    return (t.x === objX && t.y === objY - 1);
  }

  // Otherwise check each player
  for (const pl of state.players) {
    const t = _tileOfPlayer(pl);
    if (t.x === objX && t.y === objY - 1) return true;
  }
  return false;
}

// Draw the "back" large objects now (before players)
_largeFront = [];
if (state.mode === "overworld" && deferredLargeObjects.length) {
  for (const d of deferredLargeObjects) {
    if (_playerIsAboveObject(d.x, d.y)) _largeFront.push(d);
    else drawOverworldObjectIcon(d.def, d.def.icon, d.sx, d.sy);
  }
}

  // Draw deferred interior multi-tile icons AFTER all tiles are drawn
  // so floor tiles can't overwrite the spill (fixes bed missing half)
  if (state.mode === "interior" && deferredInteriorMulti.length) {
    for (const d of deferredInteriorMulti) {
      drawIconFitWidth(d.icon, d.sx, d.sy - d.yOff, d.targetW);
    }
  }

    // Draw deferred big build-stage icons ON TOP so tiles don’t overwrite them
  for (const d of deferredBuildIcons) {
    const cx = d.sx + d.size / 2;
    const cy = d.sy + d.size / 2;
    drawCenteredEmoji(d.icon, cx, cy, d.size * 0.9);
  }

  // Built interior walls: back pass before players, front pass after players
if (state.mode === "overworld") {
  // --- Players (use fx/fy for smooth movement) ---
const hh = state.holdingHands;

// If holding hands: hide both players and draw ONE combined icon on the leader tile
if (hh) {
  const leadIndex = (typeof hh.leader === "number") ? hh.leader : hh.a;
  const lead = state.players[leadIndex];

  const px = lead.fx;
  const py = lead.fy;

  if (px >= camX && px < camX + viewW && py >= camY && py < camY + viewH) {
    const sx = UI_LEFTBAR_W + (px - camX) * TILE_SIZE;
    const sy = UI_TOP_H + (py - camY) * TILE_SIZE;

    drawCenteredEmoji(HOLDING_HANDS_ICON, sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, 34);
  }

} else {
  // Normal: draw each player icon
  for (let i = 0; i < state.players.length; i++) {
    const pl = state.players[i];

    const px = pl.fx;
    const py = pl.fy;

    if (px < camX || px >= camX + viewW || py < camY || py >= camY + viewH) continue;

    const sx = UI_LEFTBAR_W + (px - camX) * TILE_SIZE;
    const sy = UI_TOP_H + (py - camY) * TILE_SIZE;

    drawAvatarTall(pl.icon, sx, sy, 1.25);
  }
}
}

// --- Dungeon players (simple draw, no overworld depth sorting junk) ---
if (state.mode === "dungeon") {
  for (const pl of state.players) {
    const { sx, sy } = mapToScreen(pl.fx ?? pl.x, pl.fy ?? pl.y);
    drawAvatarTall(pl.icon, sx, sy, 1.25);
  }
}

// Draw any "front" large objects AFTER players (so player looks behind them)
if (state.mode === "overworld" && _largeFront && _largeFront.length) {
  for (const d of _largeFront) {
    drawOverworldObjectIcon(d.def, d.def.icon, d.sx, d.sy);
  }
}

}



function invIndexAtScreen(px, py) {
  const g = HUD?.ui?.invGrid;            // the backpack sheet's grid (null while it's closed)
  if (!g) return -1;
  const col = Math.floor((px - g.x) / (g.cell + g.gap)), row = Math.floor((py - g.y) / (g.cell + g.gap));
  if (col < 0 || col >= g.cols || row < 0 || row >= g.rows) return -1;
  // ignore the gutters between slots
  if (((px - g.x) % (g.cell + g.gap)) > g.cell || ((py - g.y) % (g.cell + g.gap)) > g.cell) return -1;
  const idx = row * g.cols + col;
  return idx < INV_SLOTS ? idx : -1;
}

// ------------------------------------------------------------------------ CRAFTING FUNCTIONS ----
// (the crafting popup lives in src/ui/panels.js: drawCraftingPopup, hudCraftDown / Move / Up)

function selectedQty(itemId) {
  return state.selectedForCraft.get(itemId) ?? 0;
}

function setSelectedQty(itemId, qty) {
  if (qty <= 0) state.selectedForCraft.delete(itemId);
  else state.selectedForCraft.set(itemId, qty);
  state.lastCraftItemId = itemId;
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function itemIcon(itemId) {
  const def = itemDef(itemId);
  return def?.icon ?? "•";
}


function getCraftingInvFiltered() {
  return (activeInv() || [])
    .filter(st => st && st.id)
    .filter(st => craftingModeHasItem(itemDef(st.id)));
}

// --- DIGGING (shovel) ----------------------------------------------------

const DIG_CRITTER_CHANCE = 0.25; // 25% chance per dig
const DIG_SEED_CHANCE = 0.15; // 15% chance per dig to find seeds
const DIG_HOLE_CHANCE = 0.06; // 6% chance per dig to discover a hole

function getCritterIdsFromObjects() {
  const objs = state.data?.objects ?? {};
  return Object.keys(objs).filter(id => {
    const tags = objs[id]?.tags ?? [];
    return tags.includes("critter");
  });
}

function digAtPlayerTile() {
  const p = activePlayer();
  const inv = activeInv();

  if (state.mode !== "overworld") {
    logAction(`${p.name} can't dig in here.`);
    return;
  }

  const tile = tileAt(p.x, p.y);
  if (tile !== "grass") {
    logAction(`${p.name} can't dig here (grass only).`);
    return;
  }
  
  // Don't dig on top of objects (prevents digging "through" holes, chests, etc.)
const px0 = Math.round(p.x);
const py0 = Math.round(p.y);
if (state.world?.objects?.[py0]?.[px0]) {
  logAction(`${p.name} can't dig here (something's in the way).`);
  return;
}

    // Treasure target check (from a revealed Treasure Map)
  const px = Math.round(p.x);
  const py = Math.round(p.y);
  if (state.treasureTarget && state.treasureTarget.x === px && state.treasureTarget.y === py) {
    playSound("dig");

    const collectibleIds = allCollectibleIds();
    if (collectibleIds.length > 0) {
      const cid = collectibleIds[randInt(0, collectibleIds.length - 1)];
      const res = addItemOrDrop(inv, cid, 1, px, py, p.name);

      if (res.added > 0) {
        const nm = itemDef(cid)?.name ?? cid;
        const article = /^[aeiou]/i.test(nm) ? "an" : "a";
		playSound("achievement");
        logAction(`${p.name} followed a treasure map and found ${article} ${nm}!`);
      } else {
        logAction(`${p.name} followed a treasure map, but couldn't carry the treasure.`);
      }
    } else {
      logAction(`${p.name} dug up an empty spot. (No collectibles exist yet.)`);
    }

    // Clear target (one map = one treasure)
    state.treasureTarget = null;
    state.treasureOpen = false;
    return;
  }

  playSound("dig");

  const r = Math.random();

// ---- Holes ----
if (objDef("hole") && r < DIG_HOLE_CHANCE) {
  getCurrentMap().objects[py][px] = {
    id: "hole",
    hp: objDef("hole")?.hp ?? 1,
    meta: { discoveredBy: p.name }
  };
  logAction(`${p.name} uncovered a hole!`);
  return;
}

  // ---- Seeds ----
  if (r < DIG_SEED_CHANCE) {
    const seeds = getSeedItemIds();

    if (seeds.length > 0) {
      const seedId = seeds[randInt(0, seeds.length - 1)];
      addItem(inv, seedId, 1);

      const name = itemDef(seedId)?.name ?? seedId;
      logAction(`${p.name} found ${name}!`);
    } else {
      logAction(`${p.name} dug around and found nothing.`);
    }

    return;
  }

  // ---- Critters ----
  if (r < DIG_SEED_CHANCE + DIG_CRITTER_CHANCE) {
    const critters = getCritterItemIds();

    if (critters.length > 0) {
      const critterId = critters[randInt(0, critters.length - 1)];
      addItem(inv, critterId, 1);

      const name = itemDef(critterId)?.name ?? critterId;
      logAction(`${p.name} dug up a ${name}!`);
    } else {
      logAction(`${p.name} dug around and found nothing.`);
    }

    return;
  }

  // ---- Nothing ----
  logAction(`${p.name} dug around and found nothing.`);
}

function getCritterItemIds() {
  const items = state.data?.items ?? {};
  return Object.keys(items).filter(id => {
    const tags = items[id]?.tags ?? [];
    return tags.includes("critter");
  });
}

function getSeedItemIds() {
  const items = state.data?.items ?? {};
  return Object.keys(items).filter(id => {
    const tags = items[id]?.tags ?? [];
    return tags.includes("seed");
  });
}

function openMenuForInventoryItem(invIdx, screenX, screenY) {
  const inv = activeInv();
  const st = inv[invIdx];
  if (!st) return;

  const p = activePlayer();
  const map = getCurrentMap();

  const itemId = st.id;
  const def = itemDef(itemId);
  const itemName = def?.name ?? itemId;

  const emptyBucketId = firstExistingItemId(["bucket", "empty_bucket"]);
  const filledBucketId = firstExistingItemId(["bucket_water", "water_bucket", "bucket_of_water"]);

    // NOTE: drop sometimes failed because p.x/p.y can be non-integers (movement smoothing).
  // That made dropItemOnTile() return false, and the revert addItem() shoved the stack to the last slot.
  const drop = (qty) => {
    // Lock to a real tile coordinate
    const tx = Math.round(p.x);
    const ty = Math.round(p.y);

    // Re-check occupancy at the moment of dropping (player may have moved since menu opened)
    const blocked = isTileOccupiedForDrop(tx, ty);
    if (blocked) return;

    // Snapshot for a clean revert that preserves the slot
    const beforeQty = st.qty;

    if (!removeItem(inv, itemId, qty)) return;

    const ok = dropItemOnTile(itemId, qty, tx, ty);
    if (!ok) {
      // Revert WITHOUT reordering inventory
      if (beforeQty <= qty) {
        // We removed the whole stack, so put it back in the same slot
        inv.splice(invIdx, 0, { id: itemId, qty: beforeQty });
      } else {
        // We reduced qty on the existing stack, restore it
        st.qty = beforeQty;
      }
      return;
    }

    logAction(`${p.name} dropped ${qty} ${itemName}${qty === 1 ? "" : "s"} at (${tx},${ty}).`);
    closeMenu();
  };

  const dropBlocked = isTileOccupiedForDrop(Math.round(p.x), Math.round(p.y));

  const canDump = filledBucketId && emptyBucketId && itemId === filledBucketId;

  openMenu({
    screenX, screenY,
    title: itemName,
    options: [
      // Learn a recipe scroll (also: double-tap it)
      ...(isRecipeScroll(itemId) ? [{
        label: "Learn recipe",
        disabledReason: (() => { const rid = recipeIdFromScroll(itemId); return !rid ? "No matching recipe" : (state.learnedRecipes.has(rid) ? "Already learned" : null); })(),
        action: withSfx("achievement", () => {
          const rid = recipeIdFromScroll(itemId); if (!rid || state.learnedRecipes.has(rid)) return;
          learnRecipe(rid); removeItem(inv, itemId, 1);
          logAction(`${p.name} learned ${state.data.recipes[rid]?.name ?? rid}!`);
          closeMenu();
        })
      }] : []),
      // Equip a torch (held in the left hand, lights the way)
      ...(itemId === "torch" ? [{
        label: p.equipped === "torch" ? "Put torch away" : "Equip torch",
        action: withSfx("click", () => {
          p.equipped = p.equipped === "torch" ? null : "torch";
          logAction(p.equipped ? `${p.name} lit a torch.` : `${p.name} put the torch away.`);
          closeMenu();
        })
      }] : []),
      // Eat (only if this item has nourishment)
      ...(typeof def?.nourishment === "number" ? [{
        label: `Eat (+${def.nourishment})`,
        action: withSfx("eat", () => { 
          // hunger system uses "fills as you get hungry", so eating reduces hunger
          p.hunger = clamp((p.hunger ?? 0) - def.nourishment, 0, HUNGER_MAX);
          if (!removeItem(inv, itemId, 1)) return;
          logAction(`${p.name} ate ${itemName}.`);
          closeMenu();
        })
      }] : []),
	        // Examine (shows items.json description)
      ...(typeof def?.description === "string" ? [{
        label: "Examine",
        disabledReason: (def.description.trim().length ? null : "No description"),
        action: withSfx("click", () => {
          const desc = def.description.trim();
          openRunestoneReader(itemName, desc.length ? desc : "(No description.)");
          closeMenu();
        })
      }] : []),
      {
  label: "Drop 1",
  disabledReason: dropBlocked ? "Tile occupied" : (st.qty >= 1 ? null : "None"),
  action: () => {
    playSound("pop");
    drop(1);
  },
},
      {
  label: `Drop all (${st.qty})`,
  disabledReason: dropBlocked ? "Tile occupied" : null,
  action: () => {
    playSound("pop");
    drop(st.qty);
  },
},

      ...(itemId === "shovel" ? [{
        label: "Dig (grass tile)",
        disabledReason: (() => {
          if (state.mode !== "overworld") return "Overworld only";
          if (tileAt(p.x, p.y) !== "grass") return "Grass only";
          if (objectAt(p.x, p.y)) return "Tile occupied";
          return null;
        })(),
        action: withSfx("dig", () => {
          digAtPlayerTile();
          closeMenu();
        })
      }] : []),
      ...( (def?.tags ?? []).includes("seed") ? [{
        label: "Plant (on your tile)",
        disabledReason: (() => {
  if (state.mode !== "overworld") return "Overworld only";
  if (!hasTool(activeInv(), "spade")) return "Needs spade";
  if (tileAt(p.x, p.y) !== "grass") return "Grass only";
  if (objectAt(p.x, p.y)) return "Tile occupied";
  if (!seedGrowsToItemId(itemId)) return "No crop item found";
  return null;
})(),
        action: withSfx("pickup", () => {
          plantSeedAtPlayerTile(itemId);
          closeMenu();
        })
      }] : []),
      ...(canDump ? [{
        label: "Dump out water",
        action: withSfx("water", () => {
          // convert filled -> empty
          if (!removeItem(inv, filledBucketId, 1)) return;
          addItem(inv, emptyBucketId, 1);
          logAction(`${p.name} dumped out a bucket of water.`);
          closeMenu();
        })
      }] : [])
    ]
  });
}

function drawInteractionRequestDialog() { hudDrawInteraction(); }   // src/ui/panels3.js

function drawMenu() { hudDrawMenu(); }   // src/ui/panels.js

function openRunestoneReader(title, text) {
  state.runestoneReader = {
    open: true,
    title: title || "Runestone",
    text: String(text ?? "")
  };
}

function closeRunestoneReader() {
  if (state.runestoneReader) state.runestoneReader.open = false;
}

function drawCoordsModal() { hudDrawCoords(); }   // src/ui/panels2.js

function isLoveLetterId(itemId) {
  // You intentionally tagged it as "gift", so we key off ID.
  return itemId === "love_letter";
}

function drawCollectiblesModal() { hudDrawCollectibles(); }   // src/ui/panels2.js

function handleCollectiblesTap(px, py) {
  const ui = state._collectiblesUI;
  if (!ui) return false;

  if (!hitRect(px, py, ui)) { state.collectiblesOpen = false; state.collectiblesView = "list"; state.collectiblesSelected = null; return true; }   // tap outside the sheet closes it

  // Close
  if (hitRect(px, py, ui.close)) {
    playSound("click");
    state.collectiblesOpen = false;
    state.collectiblesView = "list";
    state.collectiblesSelected = null;
    return true;
  }

  // Back (reader -> list)
  if (ui.backBtn && hitRect(px, py, ui.backBtn)) {
    playSound("click");
    state.collectiblesView = "list";
    state.collectiblesSelected = null;
    return true;
  }

  // Tabs now mean FILTER, not "Archive/Reader"
  if (ui.tabList && hitRect(px, py, ui.tabList)) {
    playSound("click");
    state.collectiblesFilter = "all";
    state.collectiblesView = "list";
    state.collectiblesSelected = null;
    return true;
  }
  if (ui.tabRead && hitRect(px, py, ui.tabRead)) {
    playSound("click");
    state.collectiblesFilter = "love";
    state.collectiblesView = "list";
    state.collectiblesSelected = null;
    return true;
  }

  // Click a row (only in list view)
  if (state.collectiblesView !== "reader" && ui.rows && ui.rows.length) {
    const found = state.collectiblesFound || {};
    for (const r of ui.rows) {
      if (hitRect(px, py, r) && found[r.id]) {
        playSound("click");
        state.collectiblesView = "reader";
        state.collectiblesSelected = r.id;
        return true;
      }
    }
  }

  return true;
}

function drawTreasureModal() { hudDrawTreasure(); }   // src/ui/panels3.js

function handleTreasureTap(px, py) {
  const ui = state._treasureUI;
  if (!ui) return false;

  if ((ui.close && hitRect(px, py, ui.close)) || (ui.panel && !hitRect(px, py, ui.panel))) {
    playSound("click");
    state.treasureOpen = false;
    state._treasureUI = null;
    return true;
  }

  // Eat clicks so it doesn't move the character behind the modal.
  return true;
}

function drawStockpileModal() { hudDrawStockpile(); }   // src/ui/panels3.js

function formatIO(obj) {
  return Object.entries(obj).map(([id, amt]) => `${amt} ${itemDef(id)?.name ?? id}`).join(", ");
}

// ---- Hit testing ----
function isInWorldArea(py) {
  return py >= UI_TOP_H && py <= (window.innerHeight - UI_BOTTOM_H);
}

function isInInventoryArea(px, py) {
  const r = HUD?.ui?.invPanel;
  return !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function playerScreenRects() {
  const { viewW, viewH } = viewTiles();
  const camX = state.cam.x, camY = state.cam.y;

  const rects = [];
  for (let i = 0; i < state.players.length; i++) {
    const pl = state.players[i];
    const px = pl.fx, py = pl.fy;

    if (px < camX || px >= camX + viewW || py < camY || py >= camY + viewH) continue;

    const sx = (px - camX) * TILE_SIZE;
    const sy = UI_TOP_H + (py - camY) * TILE_SIZE;

    rects.push({ i, x: sx, y: sy, w: TILE_SIZE, h: TILE_SIZE });
  }
  return rects;
}

function hitRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function upgradeBuildSite(x, y) {
  const key = `${x},${y}`;
  const proj = state.buildProjects[key];
  if (!proj) return;

  const obj = state.world.objects?.[y]?.[x];
  if (!obj) return;

  const stageId = obj.id; // "build_site" | "foundation" | "framing"
  const stage = BUILD_STAGES.find(s => s.id === proj.stageId);
  const req = stage?.needs;

  if (!req) return;

  const p = activePlayer();

  // Build menu: show remaining needs + deposit buttons + Build when ready
  const options = [];

  for (const matId of Object.keys(req)) {
    const need = req[matId];
    const have = proj.mats?.[matId] || 0;

    options.push({
      label: `${matId}: ${have}/${need}`,
      action: () => {
        if (removeItem(activeInv(), matId, 1)) {
          proj.mats = proj.mats || {};
          proj.mats[matId] = (proj.mats[matId] || 0) + 1;
          playSound("click");
          // reopen menu so the counts update
          upgradeBuildSite(x, y);
        } else {
          playSound("deny");
        }
      }
    });
  }

  const ready = Object.keys(req).every(matId => (proj.mats?.[matId] || 0) >= req[matId]);

  if (ready) {
    options.push({
      label: "Build",
      action: () => startBuildTimer(key, x, y, stageId)
    });
  }

  openMenu({
    screenX: (state.menu?.screenX ?? 200),
    screenY: (state.menu?.screenY ?? 200),
    title: `Construction: ${stageId}`,
    options
  });
}

function startBuildTimer(key, x, y, stageId) {
  const proj = state.buildProjects[key];
  if (!proj || proj.building) return;

  proj.building = true;
// Preserve partial progress if you paused mid-build.
const sameStage = (proj.stageId === stageId);
proj.stageId = stageId;
if (!sameStage || !isFinite(proj.timeLeft) || proj.timeLeft <= 0) {
  proj.timeLeft = BUILD_STAGE_TIME_SEC[stageId];
}

  // Add the active player as a builder
  const me = activePlayer();
  if (!proj.builders.includes(me.id)) proj.builders.push(me.id);

  playLoopSound("hammer");
  logAction(`${me.name} started building (${stageId})...`);
}

function stopBuildTimer(key) {
  const proj = state.buildProjects[key];
  if (!proj) return;
  proj.building = false;
  stopLoopSound("hammer");
}

function finishBuildStage(key, x, y) {
  const obj = state.world.objects?.[y]?.[x];
  if (!obj) return;

  const next = buildStageDef(obj.id)?.next || null;
  const proj = state.buildProjects[key];

  stopBuildTimer(key);

  if (next === "house") {
    // final: becomes enterable house door
    state.world.objects[y][x] = { id: "house", hp: 999, meta: { interiorId: "house_small" } };
    delete state.buildProjects[key];
    saveHouseAt(x, y);
    playSound("achievement");
    logAction(`${activePlayer().name} completed construction → House`);
    return;
  }

  // advance to next stage object
  obj.id = next;
  if (proj) {
    proj.mats = {};
    proj.building = false;
    proj.timeLeft = 0;
    proj.stageId = next;
  }

  playSound("achievement");
  logAction(`${activePlayer().name} advanced construction → ${next}`);
}

function playLoopSound(name) {
  const s = sounds[name];
  if (!s) return;
  s.loop = true;
  if (s.paused) {
    s.currentTime = 0;
    s.play().catch(() => {});
  }
}

function stopLoopSound(name) {
  const s = sounds[name];
  if (!s) return;
  try { s.pause(); } catch (_) {}
  s.loop = false;
  s.currentTime = 0;
}

// ---- Input handling ----
function handleMenuHover(px, py) {
  if (!state.menu || !state.menu._hit) return;
  let idx = -1;
  for (const h of state.menu._hit) {
    if (hitRect(px, py, h)) { idx = h.index; break; }
  }
  state.menu.hoverIndex = idx;
}

function handleMenuTap(px, py) {
  if (!state.menu || !state.menu._hit) return false;
  if (state.menu._closeRect && hitRect(px, py, state.menu._closeRect)) { playSound("click"); closeMenu(); return true; }
  for (const h of state.menu._hit) {
    if (hitRect(px, py, h)) {
      if (h.opt.disabledReason) return true;
      h.opt.action();
      return true;
    }
  }
  closeMenu();
  return true;
}

function handleCoordsTap(px, py) {
  const ui = state._coordsUI;
  if (!ui) return false;

  if (ui.panel && !hitRect(px, py, ui.panel)) { state.coordsOpen = false; return true; }   // tap outside the sheet closes it

  if (hitRect(px, py, ui.close)) {
    playSound("click");
    state.coordsOpen = false;
    return true;
  }

  if (hitRect(px, py, ui.mark)) {
    const p = activePlayer();
    const n = state.markers.filter(m => m.type === "marker").length + 1;
    addMarker(`Marker ${n}`, p.x, p.y, "marker");
    return true;
  }

  // select a row
  for (const r of ui.list || []) {
    if (hitRect(px, py, r)) {
      state.coordsSelected = r.key;
      return true;
    }
  }

  // travel
  if (hitRect(px, py, ui.travel)) {
    if (!state.coordsSelected) return true;

    const m = savedPlaces().find(mm => markerKey(mm) === state.coordsSelected);
    if (!m) return true;

    setPathTo(m.x, m.y);
    state.coordsOpen = false;
    return true;
  }

  return true; // modal eats clicks
}

function handleStockpileTap(px, py) {
  const key = state.stockpileOpen?.key, before = key && getStockpileByKey(key) ? JSON.stringify(getStockpileByKey(key).inv) : null;
  const r = handleStockpileTapInner(px, py);
  const sp = key && String(key).startsWith("stockpile:") ? getStockpileByKey(key) : null;
  if (sp && JSON.stringify(sp.inv) !== before && state.net?.enabled) {   // tell the other player what is in it now
    const o = state.world.objects[sp.y]?.[sp.x];
    if (o) sendWorldOp({ kind: "set_obj", mode: "overworld", x: sp.x, y: sp.y, value: { ...o, meta: { ...o.meta, inv: JSON.parse(JSON.stringify(sp.inv)) } } });
  }
  return r;
}
function handleStockpileTapInner(px, py) {
  const ui = state._stockUI;
  const key = state.stockpileOpen?.key;
  const sp = key ? getStockpileByKey(key) : null;
  if (!ui || !sp) return false;

  const pName = activePlayer().name;

  if (hitRect(px, py, ui.close) || (ui.panel && !hitRect(px, py, ui.panel))) {
    state.stockpileOpen = null;
    return true;
  }

  // phone layout: Backpack | Stockpile tabs
  if (ui._tab_mine && hitRect(px, py, ui._tab_mine)) { playSound("click"); state._stockTab = "mine"; return true; }
  if (ui._tab_pile && hitRect(px, py, ui._tab_pile)) { playSound("click"); state._stockTab = "pile"; return true; }

  // Move full stack from player -> stockpile
  for (const r of ui.left) {
    if (hitRect(px, py, r)) {
      const inv = activeInv();
      const st = inv[r.i];
      if (!st) return true;

      const qty = st.qty;
      const id = st.id;

      // try it on a copy first: it must fit the slot count, or nothing moves
      const probe = JSON.parse(JSON.stringify(sp.inv)), fit = addItem(probe, id, qty);
      if (fit.remaining > 0 || probe.length > (sp.cap || INV_SLOTS)) { logAction(`${sp.title || "The stockpile"} is full.`); playSound("error"); return true; }
      removeItem(inv, id, qty);
      addItem(sp.inv, id, qty);

      const itemName = itemDef(id)?.name ?? id;
      logAction(`${pName} stored ${qty} ${itemName}${qty === 1 ? "" : "s"}.`);

      return true;
    }
  }

  // Move full stack from stockpile -> player
  for (const r of ui.right) {
    if (hitRect(px, py, r)) {
      const st = sp.inv[r.i];
      if (!st) return true;

      const qty = st.qty;
      const id = st.id;

      // try add, then remove from stockpile if success
      const res = addItem(activeInv(), id, qty);
      if (res.ok) {
        removeItem(sp.inv, id, qty);

        const itemName = itemDef(id)?.name ?? id;
        logAction(`${pName} retrieved ${qty} ${itemName}${qty === 1 ? "" : "s"}.`);
      }

      return true;
    }
  }

  return true;
}

function handleInventoryTap(px, py) {
  // crafting recipe clicks
  if (state.craftingOpen) {
    const matches = recipesMatchingSelection();
    for (const r of matches.slice(0, 6)) {
      if (!r._ui) continue;
      if (hitRect(px, py, r._ui)) {
        if (r._ui.craftable) craftRecipe(r.id);
        return true;
      }
    }
  }

  // inventory grid (laid out by the backpack sheet in hud.js)
  const idx = invIndexAtScreen(px, py);
  if (idx < 0) return false;
  const inv = activeInv();
  const stack = inv[idx];
  if (!stack) return false;

// Blueprint interaction
if (stack.id === "blueprint_house") {
  openMenu({
    screenX: px,
    screenY: py,
    title: "House Blueprint",
    options: [
      {
        label: "Begin Construction",
        disabledReason: state.view3d ? "Use a workbench: Build house" : null,
        action: () => {
          if (state.view3d) return;   // 3D: houses are built piece by piece from a workbench
          // Enter placement mode (do not place yet)
          state.placement.active = true;
          state.placement.dragging = false;
          state.placement.anchorX = null;
          state.placement.anchorY = null;

          state.placement.blueprintItemId = "blueprint_house";
          state.placement.placeId = "build_site";

          logAction(`${activePlayer().name} is placing a 6x6 build site...`);
          closeMenu();
        }
      }
    ]
  });
  return true;
}

const now = performance.now();

// Guard first-ever click (state.lastInvClick may not exist yet)
const last = state.lastInvClick || { idx: -1, t: -1e9 };
const isDouble = (last.idx === idx) && (now - last.t <= DOUBLE_CLICK_MS);

state.lastInvClick = { idx, t: now };

  // double click toolkit opens it (requested)
  if (isDouble && stack.id === "toolkit") {
    openToolkitForActivePlayer();
    return true;
  }

// double click recipe scroll learns it + consumes 1
if (isDouble && isRecipeScroll(stack.id)) {
  const rid = recipeIdFromScroll(stack.id);
  if (!rid) {
    logAction(`That recipe scroll doesn't match any recipe.`);
    return true;
  }

  if (state.learnedRecipes.has(rid)) {
    // Already learned: do NOT consume (so it can be traded)
    logAction(`Already learned: ${state.data.recipes[rid]?.name ?? rid}.`);
    return true;
  }

  learnRecipe(rid);
  removeItem(activeInv(), stack.id, 1);

  playSound("achievement");
  logAction(`${activePlayer().name} learned ${state.data.recipes[rid]?.name ?? rid}!`);
  return true;
}

// double click collectible OR love letter opens it + consumes 1 + archives it
if (isDouble && (isCollectible(stack.id) || isLoveLetterId(stack.id))) {
  const pName = activePlayer().name;

  // Archive first (so even if inventory math goes weird, it's recorded)
  markCollectibleFound(stack.id, pName);

  // Consume one copy
  removeItem(activeInv(), stack.id, 1);

// Love letters: open them in the Collectibles READER (since that UI actually renders)
if (isLoveLetterId(stack.id)) {
  state.collectiblesOpen = true;
  state.collectiblesView = "reader";
  state.collectiblesSelected = stack.id;
  state.collectiblesFilter = "love"; // jump straight to Love Letters tab/filter

  playSound("click");
  closeMenu();
  return true;
}

  // Other collectibles: open the collectibles reader modal
  state.collectiblesOpen = true;
  state.collectiblesView = "reader";
  state.collectiblesSelected = stack.id;

  playSound("click");
  closeMenu();
  return true;
}

// double click treasure map: consume 1, reveal coords, set dig target
if (isDouble && stack.id === "treasure_map") {
  // Consume one map (stacked maps are treated as "one use = one roll")
  removeItem(activeInv(), stack.id, 1);

  // Roll a valid overworld grass coordinate
  const tgt = rollTreasureCoord();
  state.treasureTarget = { x: tgt.x, y: tgt.y, by: activePlayer().name };
  state.treasureOpen = true;

  playSound("click");
  closeMenu();
  return true;
}

  // toggle selection for crafting filters
 if (state.craftingOpen) {
  // crafting mode: clicking inventory selects ingredients
  if (state.selectedForCraft.has(stack.id))
    state.selectedForCraft.delete(stack.id);
  else
    state.selectedForCraft.add(stack.id);
} else {
  // normal gameplay: clicking inventory selects the slot; clicking the selected slot again deselects it
  state.selectedInvIdx = (state.selectedInvIdx === idx) ? -1 : idx;
  playSound("click");
}

return true;
}

// Pointer events (CAPTURE gatekeeper to prevent click-through into world)
function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  // IMPORTANT: return CSS pixel coordinates to match draw-space (ctx is DPR-scaled)
  return {
    px: e.clientX - r.left,
    py: e.clientY - r.top,
  };
}

function isInWorldBounds(px, py) {
  // The play area is the whole screen; HUD pieces floating over it (src/ui/hud.js) are not part of the world.
  const worldPxW = viewTiles().viewW * TILE_SIZE;
  if (px < UI_LEFTBAR_W || px >= UI_LEFTBAR_W + worldPxW || py < UI_TOP_H || py >= window.innerHeight) return false;
  return !hudHit(px, py);
}

function isInRightSidebar(px) {
  // There is no right sidebar anymore.
  return false;
}

function ensureActivityLogDOM() {
  // Disabled: we do NOT use a separate DOM activity log panel.
  return null;
}

function renderActivityLogDOM() {
  // Disabled: the in-game activity log is rendered by draw/UI using state.actionLog.
  return;
}

// tiny helper so logs can't break the overlay
function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isInActivityLog(px, py) {
  if (hudModalOpen()) return false;   // a dialog over the toasts gets the tap
  // Prefer the real rect if it exists
  if (state._logUI) return hitRect(px, py, state._logUI);

    // Fallback: match the overlay layout (right-anchored)
  const pad = 10;
  const { viewW } = viewTiles();
  const worldLeft = UI_LEFTBAR_W + pad;
  const worldW = (viewW * TILE_SIZE) - pad * 2;

  const logW = Math.min(worldW, 520);
  const logX = worldLeft + worldW - logW;
  const logY = UI_TOP_H + pad;

  const logH = state.logExpanded
    ? Math.min(260, Math.floor((window.innerHeight - UI_TOP_H - UI_BOTTOM_H) * 0.45))
    : (pad + 3 * 20 + pad);

  return px >= logX && px <= (logX + logW) && py >= logY && py <= (logY + logH);

}

function updateMapCursor(px, py) {
  // Title screen: always default cursor
  if (state.title?.open) {
    canvas.style.cursor = "default";
    return;
  }

  // UI + modals always use default cursor
  if (
  state.settingsOpen ||
    state.coordsOpen ||
    state.stockpileOpen ||
    isInRightSidebar(px) ||
    isInActivityLog(px, py) ||
    !isInWorldBounds(px, py)
  ) {
    canvas.style.cursor = "default";
    return;
  }

  // While pointer is held down in the world (and not blocked), show grab/grabbing
  if (state.pointer.down && !state.pointer.blocked) {
    canvas.style.cursor = state.pointer.dragging ? "grabbing" : "grab";
    return;
  }

  // Hover world object → object-specific cursor
  const { x, y } = screenToMap(px, py);
  const obj = objectAt(x, y);

  // 1) Bushes → grab hand cursor
  if (obj && ["bush", "berry_bush"].includes(obj.id)) {
    canvas.style.cursor = "grab";
    return;
  }

  // 2) Explicit cursor icon mappings (axe/pick/key etc.)
  if (obj && OBJECT_CURSORS[obj.id]) {
    const c = OBJECT_CURSORS[obj.id];
    canvas.style.cursor = cursorFromIcon(c.icon, c.hotX, c.hotY);
    return;
  }

// 2b) Harvest tool cursor (auto: axe/pickaxe/fishing pole, etc.)
if (obj) {
  const def = objDef(obj.id);
  const tool = def?.harvest?.requiresTool;

  if (tool === "axe") {
    canvas.style.cursor = cursorFromIcon("axe.png", 10, 10);
    return;
  }
  if (tool === "pickaxe") {
    canvas.style.cursor = cursorFromIcon("pick.png", 10, 10);
    return;
  }
  if (tool === "fishing_pole") {
    canvas.style.cursor = cursorFromIcon("fishing_pole.png", 10, 10);
    return;
  }
}

  // 3) Pickup-able objects (sticks, stones, etc.) → hand cursor
  if (obj) {
    const def = objDef(obj.id);
    if (def?.pickup) {
      canvas.style.cursor = "grab";
      return;
    }
  }

  // Default world hover
  canvas.style.cursor = "default";
}

// ---- Cursor icon mapping for world objects ----
// Images must exist in: src/icons/
const OBJECT_CURSORS = {
  tree1: { icon: "axe.png", hotX: 10, hotY: 10 },
  tree2: { icon: "axe.png", hotX: 10, hotY: 10 },
    tree3: { icon: "axe.png", hotX: 10, hotY: 10 },
	  tree4: { icon: "axe.png", hotX: 10, hotY: 10 },
	    tree5: { icon: "axe.png", hotX: 10, hotY: 10 },
		  tree6: { icon: "axe.png", hotX: 10, hotY: 10 },
		    tree7: { icon: "axe.png", hotX: 10, hotY: 10 },
			  tree8: { icon: "axe.png", hotX: 10, hotY: 10 },
  rock: { icon: "pick.png", hotX: 10, hotY: 10 },
  chest: { icon: "search.png", hotX: 8, hotY: 4 },
  toolbox: { icon: "search.png", hotX: 8, hotY: 4 },
  fish_spot: { icon: "fishing_pole.png", hotX: 10, hotY: 10 },
  berry_bush: { icon: "basket.png", hotX: 10, hotY: 10 },
  apple_tree: { icon: "basket.png", hotX: 10, hotY: 10 },
  deer: { icon: "bow_and_arrow.png", hotX: 10, hotY: 10 },
  doe: { icon: "bow_and_arrow.png", hotX: 10, hotY: 10 },
  squirrel: { icon: "bow_and_arrow.png", hotX: 10, hotY: 10 },
  rabbit: { icon: "bow_and_arrow.png", hotX: 10, hotY: 10 },
  cow: { icon: "bucket.png", hotX: 10, hotY: 10 },
  pig: { icon: "bow_and_arrow.png", hotX: 10, hotY: 10 },
  chicken: { icon: "bow_and_arrow.png", hotX: 10, hotY: 10 }
};

function cursorFromIcon(icon, hotX = 0, hotY = 0, fallback = "pointer") {
  return `url("./src/icons/${icon}") ${hotX} ${hotY}, ${fallback}`;
}

canvas.addEventListener("pointerdown", (e) => {
  const { px, py } = pointerPos(e);

  // Was a sheet already open when this press began? A press that OPENS a sheet (a rail button) must not also count as a
  // "tap outside" when its release arrives, so sheet taps are ignored unless the press started while they were open.
  state.pointer.downOnModal = !!(state.coordsOpen || state.collectiblesOpen || state.treasureOpen || state.stockpileOpen);

  // TITLE MENU ALWAYS EATS INPUT
  if (state.title?.open) {
    state.pointer.down = true;
    state.pointer.dragging = false;
    state.pointer.startX = px;
    state.pointer.startY = py;
    state.pointer.lastX = px;
    state.pointer.lastY = py;
    state.pointer.blocked = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    return;
  }

  state.pointer.down = true;
  state.pointer.dragging = false;
  state.pointer.startX = px;
  state.pointer.startY = py;
  state.pointer.lastX = px;
  state.pointer.lastY = py;

  // Settings modal MUST eat pointerdown so UI can be clicked (tabs, toggles, sliders).
  if (state.settingsOpen) {
    state.pointer.blocked = true;
    handleSettingsPointerDown(px, py);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    return;
  }

  // Rune combo lock / riddle lock modals MUST eat pointerdown so the map doesn't start a drag/move.
  if (state.comboLock?.open || state.riddleLock?.open) {
    state.pointer.blocked = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    return;
  }

  // Trade UI eats all pointer input while open
  if (state.trade?.open) {
    handleTradePointerDown(px, py);
    state.pointer.blocked = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    return;
  }

 // HUD (src/ui/hud.js): left buttons + volume slider, dock (backpack / chat), sheets. A consumed press never reaches the world.
if (!hudModalOpen() && handleLeftSidebarTap(px, py)) { state.pointer.blocked = true; return; }
if (handleHudTap(px, py)) return;

// If any popup menu is open, it MUST eat the whole interaction.
// This prevents tiny mouse movement from being treated as a map drag that closes the menu.
if (state.menu) {
  state.pointer.blocked = true;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  return;
}

  // Crafting/Cooking modal eats clicks. No map interaction.
  if (state.craftingOpen) {
    state.pointer.blocked = true;
    hudCraftDown(px, py);
    return;
  }

  // Saved places / journal / stockpile: eat the press (the map must not pan behind them); a drag scrolls their lists
  if (state.coordsOpen || state.collectiblesOpen || state.treasureOpen || state.stockpileOpen) {
    state.pointer.blocked = true;
    hudScrollDown(px, py);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    return;
  }

// Crafting/Cooking modal eats clicks. No map interaction.
  // Interior Edit Mode: clicking tiles edits instead of moving
if (state.mode === "interior" && state.interiorEdit?.on && isInWorldBounds(px, py)) {
  const { x, y } = screenToMap(px, py);
  openInteriorEditMenu(x, y, px, py);
  return;
}

// Placement mode: start drag anchor in world, but DO NOT place until pointerup
if (state.placement?.active && isInWorldBounds(px, py)) {
  const { x, y } = screenToMap(px, py);

  state.placement.anchorX = x;
  state.placement.anchorY = y;
  state.placement.dragging = true;

  state.pointer.blocked = true; // eat map drag + world clicks while placing
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  return;
}


  // Block if the press started outside world OR inside the activity log area.
  state.pointer.blocked = !isInWorldBounds(px, py) || isInActivityLog(px, py);

  // Keep getting move/up events even if pointer slips outside canvas while dragging.
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}

  updateMapCursor(px, py);
});

canvas.addEventListener("pointermove", (e) => {
  const { px, py } = pointerPos(e);
  
    // keep a live cursor position for placement highlight
  state.pointer.x = px;
  state.pointer.y = py;

// dragging the left-sidebar slider
if (handleLeftSidebarDrag(px, py)) return;
hudPointerMove(px, py);

  // Trade UI drag tracking
  if (state.trade?.open) {
    handleTradeDrag(px, py);
    return;
  }

  // Settings modal drag (sliders)
  if (state.settingsOpen) {
    if (handleSettingsDrag(px, py)) return;
    return; // settings modal blocks map dragging/hover
  }

if (state.craftingOpen) {
  hudCraftMove(px, py);
  return;
}
if (state.coordsOpen || state.collectiblesOpen || state.treasureOpen || state.stockpileOpen) {
  hudScrollMove(px, py);
  return;
}

  // hover effects
  if (state.menu) handleMenuHover(px, py);

  // crafting recipe hover
  state.hoveredUI = null;
  if (state.craftingOpen && isInInventoryArea(px, py)) {
    const matches = recipesMatchingSelection();
    for (const r of matches.slice(0, 6)) {
      if (r._ui && hitRect(px, py, r._ui)) {
        state.hoveredUI = { type: "recipe", id: r.id };
        break;
      }
    }
  }

  // Cursor feedback even when not dragging
  updateMapCursor(px, py);

  if (!state.pointer.down) return;
  if (state.pointer.blocked) return; // <- key line

  const dx = px - state.pointer.startX;
  const dy = py - state.pointer.startY;

  if (!state.pointer.dragging && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
    state.pointer.dragging = true;
    closeMenu();
    updateMapCursor(px, py);
  }

  if (state.pointer.dragging) {
    const mx = px - state.pointer.lastX;
    const my = py - state.pointer.lastY;

    const tileShiftX = Math.round(-mx / TILE_SIZE);
    const tileShiftY = Math.round(-my / TILE_SIZE);

    if (tileShiftX !== 0 || tileShiftY !== 0) {
      state.cam.x += tileShiftX;
      state.cam.y += tileShiftY;
      clampCamera();
    }

    state.pointer.lastX = px;
    state.pointer.lastY = py;
  }
});

// Pointer up: handle UI clicks + world clicks
canvas.addEventListener("pointerup", (e) => {
  const wasDragging = state.pointer.dragging;

  state.pointer.down = false;
  state.pointer.dragging = false;

  const { px, py } = pointerPos(e);

// Cutscene modal: block all other input
if (state.cutscene?.open) {
  state.cutscene.index++;

  if (state.cutscene.index >= CUTSCENE_SLIDES.length) {
    state.cutscene.open = false;
    state.cutscene.seen = true;
    saveCutsceneSeen(true);

    // Always uncheck after playing (same logic as tutorial)
    state.wantCutscene = false;
    saveWantCutscene(false);

    // Decide what comes next
    if (state.cutscene._after === "tutorial") {
      state.tutorial.open = true;
      state.tutorial.index = 0;
      return;
    }

    // Otherwise start game
    titleStartOrContinue();
  }

  return;
}

// Tutorial modal: block all other input
if (state.tutorial?.open) {
  state.tutorial.index++;

  if (state.tutorial.index >= TUTORIAL_SLIDES.length) {
    state.tutorial.open = false;
state.tutorial.seen = true;
saveTutorialSeen(true);
state.wantTutorial = false; // uncheck next time, using the real flag
saveWantTutorial(false);
// Force character select on true first play
if (!ensureProfileSelectedBeforePlay()) return;
// Cristina first-play gift (after tutorial, when game begins)
grantCristinaFirstLetter();

// Mark first play as “done” once we’re actually starting
localStorage.setItem(FIRST_PLAY_DONE_KEY, "1");

titleStartOrContinue(); // start game after tutorial
  }

  return;
}

if (state.constructionOpen) {
  handleConstructionTap(px, py);
  state.pointer.blocked = false;
  return;
}

// Runestone reader modal: swallow pointerup so world doesn't move
if (state.runestoneReader?.open) {
  const ui = state._runestoneUI;
  if (ui?.closeBtn && px >= ui.closeBtn.x && px <= ui.closeBtn.x + ui.closeBtn.w &&
      py >= ui.closeBtn.y && py <= ui.closeBtn.y + ui.closeBtn.h) {
    closeRunestoneReader();
  } else if (ui?.panel) {
    // click outside panel closes
    const inside = (px >= ui.panel.x && px <= ui.panel.x + ui.panel.w &&
                    py >= ui.panel.y && py <= ui.panel.y + ui.panel.h);
    if (!inside) closeRunestoneReader();
  }
  state.pointer.blocked = false;
  return;
}

// Rune combo lock modal: swallow pointerup so the world doesn't interpret it as a move
if (state.comboLock?.open) {
  handleRuneComboLockClick(px, py);
  state.pointer.blocked = false;
  return;
}
if (state.riddleLock?.open) {
  handleRiddleLockClick(px, py);
  state.pointer.blocked = false;
  return;
}

  // Settings modal: swallow pointerup so the world doesn't interpret it as a move
  if (state.settingsOpen) {
    handleSettingsPointerUp();
    state.pointer.blocked = false;
    return;
  }

if (state.title?.open) {
  handleTitleMenuTap(px, py);
  return;
}

// Activity log overlay: tap to toggle expanded/collapsed, and eat the click.
if (isInActivityLog(px, py)) {
  state.logExpanded = !state.logExpanded;
  if (typeof playSound === "function") playSound("click");
  state.pointer.blocked = false;
  return;
}

  if (typeof updateMapCursor === "function") updateMapCursor(px, py);

// stop dragging if we were dragging volume
state.ui.musicDragging = false;

  // Crafting popup: end drag + eat click
  if (state.craftingOpen) {
    hudCraftUp(px, py);
    state.pointer.blocked = false;
    return;
  }
  
  // Placement mode: place on release
  if (state.placement?.active && state.placement.dragging) {
    const ok = placeBuildSite(state.placement.anchorX, state.placement.anchorY);

    if (ok) {
      // consume blueprint only AFTER successful placement
      removeItem(activeInv(), state.placement.blueprintItemId, 1);
    } else {
      logAction("Can't place a build site there.");
    }

    state.placement.active = false;
    state.placement.dragging = false;
    state.pointer.blocked = false;
    return;
  }

  // If we were dragging the map, we’re done. Don’t treat it as a click.
  if (wasDragging) {
    state.pointer.blocked = false;
    return;
  }

  // Trade UI: handle all pointer-up events while trade is open
  if (state.trade?.open) {
    handleTradePointerUp(px, py);
    state.pointer.blocked = false;
    return;
  }

  // Interaction request dialog has top priority (blocks everything else)
  if (state.interactionRequest && state.activePlayer === state.interactionRequest.toIndex) {
    const ui = state.interactionRequest._ui;
    if (ui) {
      if (hitRect(px, py, ui.accept)) { acceptInteractionRequest(); state.pointer.blocked = false; return; }
      if (hitRect(px, py, ui.decline)) { declineInteractionRequest(); state.pointer.blocked = false; return; }
    }
    // Clicking outside does nothing (forces an explicit choice)
    state.pointer.blocked = false;
    return;
  }

  // a drag that scrolled a list is not a tap; neither is the release of the press that opened the sheet
  if ((state.coordsOpen || state.collectiblesOpen || state.treasureOpen || state.stockpileOpen) && (hudScrollUp() || !state.pointer.downOnModal)) { state.pointer.blocked = false; return; }

  // UI should still work even if pointer.blocked is true (inventory is outside world bounds).
  if (state.coordsOpen) { handleCoordsTap(px, py); state.pointer.blocked = false; return; }
  if (state.collectiblesOpen) { handleCollectiblesTap(px, py); state.pointer.blocked = false; return; }
  if (state.treasureOpen) { handleTreasureTap(px, py); state.pointer.blocked = false; return; }
  if (state.stockpileOpen) { handleStockpileTap(px, py); state.pointer.blocked = false; return; }
  hudPointerUp();   // a finger lifted off a backpack slot (a long press already opened its menu)
  if (state.menu) {
  // If a menu was opened on pointerdown, do NOT let the immediate pointerup auto-close it.
  if (state.menu._justOpened) {
    state.menu._justOpened = false;
    state.pointer.blocked = false;
    return;
  }
  handleMenuTap(px, py);
  state.pointer.blocked = false;
  return;
}


  if (isInInventoryArea(px, py)) {
    handleInventoryTap(px, py);
    state.pointer.blocked = false;
    return;
  }

  // From here down: world clicks only.
  if (state.pointer.blocked) {
    state.pointer.blocked = false;
    return;
  }
  state.pointer.blocked = false;

  // Hard rule: log area is never a map click.
  if (isInActivityLog(px, py)) return;

  // Absolute rule: outside world rectangle = NOT a map click.
  if (!isInWorldBounds(px, py)) return;

  const { x, y } = screenToMap(px, py);

  // placement modes
  if (state.placinghouse) {
    if (placehouseAt(x, y)) state.placinghouse = false;
    return;
  }
  if (state.placingStockpile) {
    if (placeStockpileAt(x, y)) state.placingStockpile = false;
    return;
  }

  // Holding hands visual merge: clicking either person opens the holding-hands menu
  if (state.holdingHands) {
    const hh = state.holdingHands;
    const a = state.players[hh.a];
    const b = state.players[hh.b];

    if ((x === a.x && y === a.y) || (x === b.x && y === b.y)) {
      openMenuForHoldingHands(px, py);
      return;
    }
  }


// clicking a player => open menu (no more switching active player by clicking)
const clickedPlayerIndex = state.players.findIndex(pl => pl.x === x && pl.y === y);
if (clickedPlayerIndex !== -1) {
  if (clickedPlayerIndex === state.activePlayer) {
    // clicking yourself keeps the existing self menu
    openMenuForPlayer(clickedPlayerIndex, px, py);
  } else {
    // clicking the other player will become the interaction menu (next step)
    openMenuForOtherPlayer(clickedPlayerIndex, px, py);
  }
  return;
}

  // adjacent object => context menu (FIRST)
  const obj = objectAt(x, y);
  if (obj) {
    const def = objDef(obj.id);
    const pl = activePlayer();
    const dist = manhattan(pl.x, pl.y, x, y);

    const canShoot =
      isHuntableDef(def) &&
      dist <= 3 &&
      canShootBow(activeInv());

    if (canShoot || isAdjacentOrSame(pl.x, pl.y, x, y)) {
      openMenuForTile(x, y, e.clientX, e.clientY);
      return;
    }
  }

  // water tile interaction (fill bucket) (ONLY if no object handled it)
  const t = tileAt(x, y);
  if (t === "water") {
    const pl = activePlayer();
    if (isAdjacentOrSame(pl.x, pl.y, x, y)) {
      openMenuForWaterTile(x, y, e.clientX, e.clientY);
      return;
    }
  }
  
// --- Interior door tile: context menu to Exit ---
if (state.mode === "interior") {
  const pl = activePlayer();
  const idef = state.data.interiors?.[state.interiorId];
  const doorTile = idef?.doorTile;
  const t2 = tileAt(x, y);

  if (doorTile && t2 === doorTile && isAdjacentOrSame(pl.x, pl.y, x, y)) {
    openMenu({
      screenX: e.clientX,
      screenY: e.clientY,
      title: "Door",
      options: [
        {
          label: "Exit",
          action: withSfx("door_open", () => {
            tryExitInterior();
            closeMenu();
          })
        }
      ]
    });
    return;
  }
}
  // DEV: Ctrl+Click to teleport active player to the clicked tile
  if (e.ctrlKey) {
    const p = activePlayer();
    const { w, h } = currentDims();
    if (inBounds(x, y, w, h)) {
      p.x = x; p.y = y;
      p.fx = x; p.fy = y;
      p.path = [];
      p.resting = false;
      if (state.net?.enabled) {
        // Notify server of new position via a direct move isn't possible tile-by-tile,
        // so just clear the queue and let the next snapshot reconcile.
        state.net.moveQueue = [];
        state.net._pendingMove = null;
      }
      if (state.mode === "overworld") revealAroundPlayers();
      ensureCameraEdgeScroll();
      logAction(`DEV: teleported ${p.name} to (${x}, ${y}).`);
    }
    return;
  }

  setPathTo(x, y);
});

// Right click: inventory context menu OR quick-harvest on map
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();

  const { px, py } = pointerPos(e);

  // --- Inventory right-click stays the same ---
  if (isInInventoryArea(px, py)) {
    const idx = invIndexAtScreen(px, py);
    if (idx < 0) return;

    const inv = activeInv();
    if (!inv[idx]) return;

    openMenuForInventoryItem(idx, px, py);
    return;
  }

  // --- World right-click: quick harvest/hunt (bypass context menu) ---

  // Don’t let right-click interact through overlays/menus
  if (state.coordsOpen || state.stockpileOpen) return;
  if (state.menu) closeMenu();

  // Hard rule: log area is never a map click.
  if (isInActivityLog(px, py)) return;

  // Outside world rectangle = no map interaction.
  if (!isInWorldBounds(px, py)) return;

  const { x, y } = screenToMap(px, py);

  const obj = objectAt(x, y);
  if (!obj) return;

  const def = objDef(obj.id);
  if (!def) return;

  // Chest / toolbox / stockpile: the quick action opens it (adjacent only)
  if (def.container) {
    if (!isAdjacentOrSame(activePlayer().x, activePlayer().y, x, y)) return;
    playSound("chest");
    openContainerObject(x, y);
    return;
  }

  const p = activePlayer();
  const inv = activeInv();
  const dist = manhattan(p.x, p.y, x, y);

  // Dropped item: adjacent-only pickup (matches your menu logic)
  if (obj.id === "dropped_item") {
    if (!isAdjacentOrSame(p.x, p.y, x, y)) return;

    const itemId = obj.meta?.itemId;
    const qty = obj.meta?.qty ?? 1;
    if (!itemId) return;

    playSound("pickup");
    const res = addItem(inv, itemId, qty);
    const took = typeof res === "object" ? (res.added ?? 0) : qty, left = qty - took;

    const name = itemDef(itemId)?.name ?? itemId;
    if (left > 0) {   // part (or all) of it didn't fit (a full backpack, or the stack limit, e.g. one Cipher): leave the rest on the ground
      obj.meta.qty = left;
      if (took > 0) logAction(`${p.name} picked up ${took} ${name}${took === 1 ? "" : "s"}.`);
      else logAction(`${p.name} can't carry any more ${name}.`);
      return;
    }
    // Use setOverworldObject in overworld so the pickup is broadcast to the other player;
    // direct write is fine in interior/dungeon (those aren't synced).
    if (state.mode === "overworld") {
      setOverworldObject(x, y, null);
    } else {
      getCurrentMap().objects[y][x] = null;
    }
    logAction(`${p.name} picked up ${qty} ${name}${qty === 1 ? "" : "s"}.`);
    return;
  }

  // Pickup-able world object (sticks, stones, etc.): adjacent-only
  if (def.pickup) {
    if (!isAdjacentOrSame(p.x, p.y, x, y)) return;
    playSound("pickup");
    pickupObject(x, y);
    return;
  }

  // Harvest / Hunt quick action
  const interact = def.hunt || def.harvest;
  if (!interact) return;

  // Renewable-but-depleted objects stay but don't harvest
  if (obj.meta?.depleted) return;

  const isHuntable = isHuntableDef(def);
  const hasBow = canShootBow(inv);
  const allowRangedHunt = isHuntable && hasBow && bowCanReach(x, y);
  const allowAdjacent = isAdjacentOrSame(p.x, p.y, x, y);

  if (!allowRangedHunt && !allowAdjacent) return;

  // Tool gate for quick-harvest: don't play SFX (or harvest) if tool is missing
  const requiredTool = interact.requiresTool || null;
  if (!isHuntable && requiredTool && !hasTool(inv, requiredTool)) {
    logAction(`${p.name} needs ${itemDef(requiredTool)?.name ?? requiredTool} for that.`);
    playSound("error");
    return;
  }

  let sfx = "harvest";
  if (isHuntable) sfx = "hunt";
  else {
if (/^tree\d+$/.test(obj.id)) sfx = "chop";
else if (obj.id === "apple_tree") sfx = "harvest";
    else if (["rock", "stone", "ore"].includes(obj.id)) sfx = "pickaxe";
    else if (["bush", "berry_bush"].includes(obj.id)) sfx = "harvest";
    else if (obj.id === "fish_spot") sfx = "fishingreel";
    else if (obj.id === "cow") sfx = "cow";
  }

  playSound(sfx);
  harvestObject(x, y);
});

// Keyboard controls
// Escape closes whatever is on top. Returns true if something was closed (so the key does nothing else).
function closeTopModal() {
  if (state.title?.open || state.cutscene?.open || state.tutorial?.open) return false;
  if (state.interactionRequest && state.activePlayer === state.interactionRequest.toIndex) { declineInteractionRequest(); return true; }
  if (state.settingsOpen) { closeSettingsDialog(); return true; }
  if (state.comboLock?.open) { closeRuneComboLock(); return true; }
  if (state.riddleLock?.open) { closeRiddleLock(); return true; }
  if (state.runestoneReader?.open) { closeRunestoneReader(); return true; }
  if (state.trade?.open) { closeTradeUI(true); return true; }
  if (state.constructionOpen) { closeConstructionUI(); return true; }
  if (state.craftingOpen) { closeCraftingScreen(); return true; }
  if (state.stockpileOpen) { state.stockpileOpen = null; return true; }
  if (state.collectiblesOpen) {
    if (state.collectiblesView && state.collectiblesView !== "list") { state.collectiblesView = "list"; state.collectiblesSelected = null; }
    else state.collectiblesOpen = false;
    return true;
  }
  if (state.treasureOpen) { state.treasureOpen = false; state._treasureUI = null; return true; }
  if (state.coordsOpen) { state.coordsOpen = false; return true; }
  if (state.placement?.active) { state.placement.active = false; state.placement.dragging = false; return true; }
  if (state.placinghouse || state.placingStockpile) { state.placinghouse = false; state.placingStockpile = false; return true; }
  if (state.menu) { closeMenu(); return true; }
  if (state.ui?.musicSliderOpen) { state.ui.musicSliderOpen = false; return true; }
  if (HUD.chat.open) { hudToggleChat(false); return true; }
  if (HUD.inv.open) { hudToggleInventory(false); return true; }
  return false;
}

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();

  if (k === "escape" && document.activeElement?.id !== "chatInput" && closeTopModal()) { e.preventDefault(); return; }

  // T = focus chat input (standard game convention)
  if (k === "t" && document.activeElement !== document.getElementById("chatInput")) {
    e.preventDefault();
    hudToggleChat(true, true);   // opens the chat sheet and focuses its input
    return;
  }
  if (k === "i" && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement !== document.getElementById("chatInput")) { e.preventDefault(); hudToggleInventory(); return; }

if (state.craftingOpen) {
  if (k === "c") {
    e.preventDefault();
    attemptManualCraft();
    return; // IMPORTANT: stop here so nothing else runs
  }
  if (k === "escape") {
    e.preventDefault();
    closeCraftingScreen();
    return;
  }
}

if (k === "c" && !e.ctrlKey && !e.metaKey && !e.altKey && !state.craftingOpen && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
  e.preventDefault();
  toggleSneak();
  return;
}

if (k === "r") {
  const pl = activePlayer();

  if (!pl.resting) {
    pl.resting = true;
    pl.path = [];
    endHandsFor(state.players.indexOf(pl), `${pl.name} sat down to rest.`);
    logAction(`${pl.name} started resting.`);
  } else {
    pl.resting = false;
    logAction(`${pl.name} stopped resting.`);
  }

  closeMenu();
}

  if (k === "b") {
    state.placinghouse = true;
    state.placingStockpile = false;
    closeMenu();
  }
  
// F = recenter camera on active player
if (k === "f") {
  const pl = activePlayer();
  recenterCameraOnPlayer(pl);
  return;
}

  if (k === "m") {
    state.coordsOpen = !state.coordsOpen;
    state.stockpileOpen = null;
    closeMenu();
  }

// DEV: Shift+I = enter/exit interior instantly (testing)
if (k === "i" && e.shiftKey) {
  e.preventDefault();

  if (state.mode !== "interior") {
    devEnterInterior("house_small"); // change id if you want
  } else {
    state.mode = "overworld";
    closeMenu();
    logAction("DEV: exited interior.");
  }
  return;
}

// DEV: Shift+D = enter nearest dungeon instantly (testing)
if (k === "d" && e.shiftKey) {
  e.preventDefault();
  devEnterNearestDungeon();
  return;
}

// E = Eat selected inventory item (only if it has nourishment)
if (k === "e") {
  const idx = state.selectedInvIdx;
  if (idx == null) return;

  const inv = activeInv();
  const st = inv[idx];
  if (!st) return;

  const def = itemDef(st.id);
  if (!def || typeof def.nourishment !== "number") return;

  eatItem(st.id, 1); // your existing eat logic handles hunger + remove + log/sfx
  return;
}

// X = drop 1 of selected inventory item
if (k === "x") {
  const idx = state.selectedInvIdx;
  if (idx == null) return;

  const inv = activeInv();
  const st = inv[idx];
  if (!st) return;

  const p = activePlayer();
  const name = itemDef(st.id)?.name ?? st.id;

  const spot = findDropSpotNear(p.x, p.y, st.id, 4);
  if (!spot) {
    playSound("deny");
    logAction(`${p.name} had nowhere to drop ${name}.`);
    return;
  }

  // Drop exactly 1
  if (!removeItem(inv, st.id, 1)) return;

  dropItemOnTile(st.id, 1, spot.x, spot.y);

  playSound("pickup"); // swap sound if you want
  logAction(`${p.name} dropped 1 ${name} at (${spot.x},${spot.y}).`);
  return;
}

// ---- WASD Movement ----
const moveDir = {
  w: { dx: 0, dy: -1 },
  a: { dx: -1, dy: 0 },
  s: { dx: 0, dy: 1 },
  d: { dx: 1, dy: 0 }
};

if (moveDir[k]) {
  const { dx, dy } = moveDir[k];

  // walks locally, online or not (the position is published as each step lands)
  const p = activePlayer();
  const nx = p.x + dx;
  const ny = p.y + dy;

if (canStep(p.x, p.y, nx, ny) && p.stamina > 0) {
  // Don't spam-overwrite if the destination is already the next step
  const alreadyQueued = p.path.length > 0 && p.path[0].x === nx && p.path[0].y === ny;
  if (!alreadyQueued) {
    p.resting = false;
    noteMoveInputForHands();
    p.path = [{ x: nx, y: ny }];
  }
}
}

});

// ---- Held movement keys: keep walking while W/A/S/D is held (no OS key-repeat delay) ----
const heldMoveKeys = [];   // most recently pressed last
const HELD_DIR = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] };
function typingInTextField() { const t = document.activeElement?.tagName; return t === "INPUT" || t === "TEXTAREA"; }
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (!HELD_DIR[k] || e.ctrlKey || e.metaKey || e.altKey || (e.shiftKey && k === "d") || typingInTextField()) return;
  const i = heldMoveKeys.indexOf(k); if (i >= 0) heldMoveKeys.splice(i, 1);
  heldMoveKeys.push(k);
});
window.addEventListener("keyup", (e) => { const i = heldMoveKeys.indexOf(e.key.toLowerCase()); if (i >= 0) heldMoveKeys.splice(i, 1); });
window.addEventListener("blur", () => { heldMoveKeys.length = 0; });

function stepHeldMoveKeys() {
  if (!heldMoveKeys.length) return;
  if (state.title?.open || state.menu || state.craftingOpen || state.settingsOpen || state.cutscene?.open || state.tutorial?.open || state.trade?.open || state.coordsOpen || state.stockpileOpen || typingInTextField()) return;
  const [dx, dy] = HELD_DIR[heldMoveKeys[heldMoveKeys.length - 1]];
  const p = activePlayer();
  if (p.stamina <= 0) { notifyNoEnergy(); return; }
  if (p.path.length > 1) return;
  const bx = p.path.length ? p.path[0].x : p.x, by = p.path.length ? p.path[0].y : p.y;   // queue the next step before the current one finishes: no stop between tiles
  if (canStep(bx, by, bx + dx, by + dy)) {
    p.resting = false;
    noteMoveInputForHands();
    p.path.push({ x: bx + dx, y: by + dy });
  }
}

// ------------------------------------------------------------------------ TIME FUNCTIONS ----

function seedGrowsToItemId(seedId) {
  // Convention: carrot_seeds -> carrot, tomato_seeds -> tomato, etc.
  if (typeof seedId !== "string") return null;
  if (!seedId.endsWith("_seeds")) return null;

  let base = seedId.slice(0, -"_seeds".length);

  // tiny plural/irregular helpers (adjust as your items demand)
  if (base === "pea") base = "peas";
  if (base === "grape") base = "grapes";

  // Only return it if the item actually exists
  return itemDef(base) ? base : null;
}

function plantSeedAtPlayerTile(seedId) {
  const p = activePlayer();
  const inv = activeInv();

  if (state.mode !== "overworld") {
    logAction(`${p.name} can't plant in here.`);
    return false;
  }

  if (tileAt(p.x, p.y) !== "grass") {
    logAction(`${p.name} can only plant on grass (for now).`);
    return false;
  }

  const map = getCurrentMap();
  if (map.objects?.[p.y]?.[p.x]) {
    logAction(`${p.name} can't plant here (tile occupied).`);
    return false;
  }

  const growsTo = seedGrowsToItemId(seedId);
  if (!growsTo) {
    logAction(`${p.name} can't plant that.`);
    return false;
  }

  if (!removeItem(inv, seedId, 1)) return false;

 map.objects[p.y][p.x] = {
  id: "planted_seed",
  hp: 1,
  meta: {
    seedId,
    plantedDay: state.time.day,

    // growth system
    progress: 0,        // 0..GROW_DAYS
    lost: 0,            // cumulative days "lost"
    wateredEver: false, // won't grow until first watering
    lastWaterDay: null, // day number last watered
    ready: false
  }
};

  logAction(`${p.name} planted ${itemDef(seedId)?.name ?? seedId}.`);
  return true;
}

function updateRenewablesOnNewDay() {
  if (state.mode !== "overworld") return;

  const map = state.world;
  if (!map?.objects) return;

  const today = state.time.day;

  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const obj = map.objects[y][x];
      if (!obj?.meta?.depleted) continue;

      const def = objDef(obj.id);
      if (!def || !isRenewableDef(def)) continue;

      const depletedDay = obj.meta.depletedDay;
      if (typeof depletedDay !== "number") continue;

      const daysGone = today - depletedDay;
      const waitDays = def.renewDays ?? RENEWABLE_RESPAWN_DAYS;

      if (daysGone >= waitDays) {
        obj.meta.depleted = false;
        delete obj.meta.depletedDay;
        obj.hp = def.hp ?? 1;
      }
    }
  }
}

function updatePlantsOnNewDay() {
  if (state.mode !== "overworld") return;

  const map = state.world;
  if (!map?.objects) return;

  const today = state.time.day;
  const yesterday = today - 1;

  let matured = 0;
  let died = 0;

  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const obj = map.objects[y][x];
      if (!obj || obj.id !== "planted_seed") continue;

      const m = obj.meta ?? (obj.meta = {});
      const plantedDay = m.plantedDay ?? today;
      const ageDays = today - plantedDay;

      // Hard fail-safe: if not adequately watered within 6 days, death.
      // (This includes never-watered seeds.)
      if (ageDays >= 6 && (m.progress ?? 0) < GROW_DAYS) {
        setOverworldObject(x, y, null);
        died++;
        continue;
      }

      // If never watered, it doesn't grow (but still ages toward the 6-day death rule above)
      if (!m.wateredEver) continue;

      const lastWater = m.lastWaterDay;

      // Watered yesterday → grow 1 day
      if (lastWater === yesterday) {
        m.progress = Math.min(GROW_DAYS, (m.progress ?? 0) + 1);
      } else {
        // Missed watering yesterday
        // - missed 1 day → halt (no change)
        // - missed 2+ days → lose days
        if (typeof lastWater === "number") {
          const missed = yesterday - lastWater; // 1 = missed 1 day, 2 = missed 2 days, etc.

          if (missed >= 2) {
            const loss = missed - 1; // 2 days missed => lose 1, 3 days missed => lose 2, etc.
            m.lost = (m.lost ?? 0) + loss;
            m.progress = Math.max(0, (m.progress ?? 0) - loss);

            // If it loses more days than it has been planted, it dies
            if ((m.lost ?? 0) > ageDays) {
              setOverworldObject(x, y, null);
              died++;
              continue;
            }
          }
        }
      }

      // Ready to harvest once progress hits target
      if ((m.progress ?? 0) >= GROW_DAYS) {
        m.ready = true;
        matured++;
      }
    }
  }

  if (died > 0) logAction(`${died} plant${died === 1 ? "" : "s"} died.`);
  if (matured > 0) logAction(`${matured} plant${matured === 1 ? "" : "s"} ready to harvest.`);
}

function updateTreeRegrowthOnNewDay() {
  if (state.mode !== "overworld") return;

  const map = state.world;

  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const obj = map.objects[y][x];
      if (!obj || obj.id !== "stump" && obj.id !== "stump_seedling") continue;

      const meta = (obj.meta ||= {});
      const age = state.time.day - (meta.regrowDay ?? state.time.day);

      // ---- Stage 1: stump → stump_seedling ----
if (obj.id === "stump" && age >= TREE_REGROW_DAYS_STAGE1) {
  setOverworldObject(x, y, {
    id: "stump_seedling",
    hp: obj.hp ?? 1,
    meta: {
      ...(obj.meta || {}),
      regrowStage: "seedling",
      regrowDay: state.time.day
    }
  });
  continue;
}

      // ---- Stage 2: seedling → original tree ----
 if (obj.id === "stump_seedling" && age >= (TREE_REGROW_DAYS_STAGE2 - TREE_REGROW_DAYS_STAGE1)) {
  const treeId = meta.originalTree || "tree1";
  setOverworldObject(x, y, { id: treeId, hp: obj.hp ?? 1, meta: {} });
}
    }
  }
}

function updateChickenEggsOnNewDay() {
  if (state.mode !== "overworld") return;

  const map = state.world;
  const { w, h } = currentDims();

  // Tweakables:
  const EGG_CHANCE_PER_CHICKEN = 0.55; // 55% chance each chicken lays an egg each day
  const EGG_OBJECT_ID = "egg_pickup";

  let dropped = 0;

  // helper: list of nearby tiles to try (randomized)
  const offsets = [
    [0, 1], [1, 0], [0, -1], [-1, 0],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ].sort(() => Math.random() - 0.5);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const obj = map.objects?.[y]?.[x];
      if (!obj || obj.id !== "chicken") continue;

      // Ensure meta exists
      obj.meta = obj.meta || {};

      // Already handled today? (belt + suspenders)
      if (obj.meta.lastEggDay === state.time.day) continue;
      obj.meta.lastEggDay = state.time.day;

      // Random chance this chicken lays today
      if (Math.random() > EGG_CHANCE_PER_CHICKEN) continue;

      // Find an empty neighboring tile (walkable, not water, no object, no player)
      let placed = false;
      for (const [dx, dy] of offsets) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny, w, h)) continue;

        if (map.tiles?.[ny]?.[nx] === "water") continue;
        if (map.objects?.[ny]?.[nx]) continue;
        if (state.players.some(p => p.x === nx && p.y === ny)) continue;

        setOverworldObject(nx, ny, { id: EGG_OBJECT_ID, hp: 1, meta: {} });
        dropped++;
        placed = true;
        break;
      }

      // If it couldn't find space, it just doesn't drop today. Chickens are rude like that.
      if (!placed) continue;
    }
  }

  if (dropped > 0) logAction(`Chickens laid ${dropped} egg${dropped === 1 ? "" : "s"}.`);
  dropFeathersNearChickens();
}

/** Chickens shed feathers: on a new day some of them leave one on a neighbouring tile (at most FEATHER_MAX_ON_MAP lying around). */
const FEATHER_MAX_ON_MAP = 12, FEATHER_CHANCE_PER_CHICKEN = 0.4;
function dropFeathersNearChickens() {
  if (state.mode !== "overworld") return;
  const map = state.world, { w, h } = currentDims();
  let lying = 0; const chickens = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = map.objects?.[y]?.[x]; if (o?.id === "feather_pickup") lying++; else if (o?.id === "chicken") chickens.push([x, y]); }
  let dropped = 0;
  for (const [x, y] of chickens) {
    if (lying + dropped >= FEATHER_MAX_ON_MAP) break;
    if (Math.random() > FEATHER_CHANCE_PER_CHICKEN) continue;
    const offsets = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].sort(() => Math.random() - 0.5);
    for (const [dx, dy] of offsets) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny, w, h) || map.tiles?.[ny]?.[nx] === "water" || map.objects?.[ny]?.[nx] || state.players.some(p => p.x === nx && p.y === ny)) continue;
      if (typeof structureTileAt === "function" && structureTileAt(nx, ny)) continue;
      setOverworldObject(nx, ny, { id: "feather_pickup", hp: 1, meta: {} }); dropped++; break;
    }
  }
}

// Minimum chest counts the overworld should always have.
// If looting drives either below these thresholds, new ones are
// placed on empty grass tiles at the start of the next in-game day.
const MIN_CHESTS   = 6;
const MIN_TOOLBOXES = 6;

function updateChestsOnNewDay() {
  if (state.mode !== "overworld") return;

  const map = state.world;
  if (!map?.objects || !map?.tiles) return;

  // Count existing chests and toolboxes
  let chestCount   = 0;
  let toolboxCount = 0;
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const id = map.objects[y][x]?.id;
      if (id === "chest")   chestCount++;
      if (id === "toolbox") toolboxCount++;
    }
  }

  const needChests   = Math.max(0, MIN_CHESTS   - chestCount);
  const needToolboxes = Math.max(0, MIN_TOOLBOXES - toolboxCount);
  if (!needChests && !needToolboxes) return;

  // Collect candidate tiles: empty grass tiles not occupied by a player
  const candidates = [];
  for (let y = 1; y < WORLD_H - 1; y++) {
    for (let x = 1; x < WORLD_W - 1; x++) {
      if (map.tiles[y][x] !== "grass") continue;
      if (map.objects[y][x]) continue;
      if (state.players.some(p => p.x === x && p.y === y)) continue;
      candidates.push({ x, y });
    }
  }

  // Shuffle candidates
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  let idx = 0;
  const place = (id) => {
    while (idx < candidates.length) {
      const { x, y } = candidates[idx++];
      // Re-check: a previous placement may have filled this spot
      if (map.objects[y][x]) continue;
      setOverworldObject(x, y, { id, hp: objDef(id)?.hp ?? 1, meta: {} });
      return true;
    }
    return false;
  };

  let placedChests = 0, placedToolboxes = 0;
  for (let i = 0; i < needChests;    i++) if (place("chest"))   placedChests++;
  for (let i = 0; i < needToolboxes; i++) if (place("toolbox")) placedToolboxes++;

  if (placedChests > 0 || placedToolboxes > 0) {
    logAction(`New supplies appeared in the world (${placedChests} chest${placedChests !== 1 ? "s" : ""}, ${placedToolboxes} toolbox${placedToolboxes !== 1 ? "es" : ""}).`);
  }
}

function updateTime(dt) {
// Online: clients can advance *visual* time locally,
// but only host should run world-changing "new day" systems.
const netEnabled = !!state.net?.enabled;
const isHost = !netEnabled || !!state.net?.isHost;

 // Don't advance time until the player actually starts the game
  if (state.title?.open || state.tutorial?.open) return;

  const t = state.time;

  t.t += dt;
  t.phaseT += dt;

  const wasDay = t.isDay;
  t.isDay = t.phaseT < DAYLIGHT_SECONDS;

  // Day/night transition sound
  if (t.isDay !== wasDay) {
    playSound(t.isDay ? "day" : "night");
  }

if (t.phaseT >= DAY_SECONDS) {
  t.phaseT -= DAY_SECONDS;
  t.day += 1;

  // Only host mutates world state on day change
  if (isHost) {
    updatePlantsOnNewDay();
    updateTreeRegrowthOnNewDay();
    updateRenewablesOnNewDay();
    updateChickenEggsOnNewDay();
    updateChestsOnNewDay();
  }
}

// Host broadcasts authoritative time periodically so non-host stays in sync
if (isHost && netEnabled) {
  state.net._timeSyncAccum = (state.net._timeSyncAccum || 0) + dt;
  if (state.net._timeSyncAccum >= 5) {
    state.net._timeSyncAccum = 0;
    sendNetInput({ type: "time_sync", phaseT: t.phaseT, day: t.day, t: t.t });
  }
}

}

function advanceTimeSeconds(secs) {
  // Keep behavior consistent with updateTime(dt)
  if (state.title?.open || state.tutorial?.open) return;

  const t = state.time;
  const netEnabled = !!state.net?.enabled;
const isHost = !netEnabled || !!state.net?.isHost;

  if (!t) return;

  // Track day/night change
  const wasDay = t.isDay;

  t.t += secs;
  t.phaseT += secs;

  // Handle day rollover(s) and run "new day" systems exactly like updateTime
 while (t.phaseT >= DAY_SECONDS) {
  t.phaseT -= DAY_SECONDS;
  t.day += 1;

  if (isHost) {
    updatePlantsOnNewDay();
    updateTreeRegrowthOnNewDay();
    updateRenewablesOnNewDay();
    updateChickenEggsOnNewDay();
    updateChestsOnNewDay();
  }
}

  // Recompute day/night after final phaseT
  t.isDay = t.phaseT < DAYLIGHT_SECONDS;

  // Transition sound (same as updateTime)
  if (t.isDay !== wasDay) {
    playSound(t.isDay ? "day" : "night");
  }
}

function startScreenFadeToBlackThenBack(opts = {}) {
  const outSec = opts.outSec ?? 0.35;
  const holdSec = opts.holdSec ?? 0.10;
  const inSec = opts.inSec ?? 0.35;
  const onMid = typeof opts.onMid === "function" ? opts.onMid : null;
  const onEnd = typeof opts.onEnd === "function" ? opts.onEnd : null;

  state.screenFade = {
    active: true,
    phase: "out",      // "out" -> "hold" -> "in"
    t: 0,
    alpha: 0,
    outSec, holdSec, inSec,
    didMid: false,
    onMid, onEnd
  };
}

function updateScreenFade(dt) {
  const f = state.screenFade;
  if (!f?.active) return;

  f.t += dt;

  if (f.phase === "out") {
    f.alpha = clamp(f.t / f.outSec, 0, 1);
    if (f.t >= f.outSec) {
      // Midpoint action happens at full black
      if (!f.didMid) {
        f.didMid = true;
        try { f.onMid && f.onMid(); } catch (e) { console.error(e); }
      }
      f.phase = "hold";
      f.t = 0;
      f.alpha = 1;
    }
    return;
  }

  if (f.phase === "hold") {
    f.alpha = 1;
    if (f.t >= f.holdSec) {
      f.phase = "in";
      f.t = 0;
    }
    return;
  }

  if (f.phase === "in") {
    f.alpha = 1 - clamp(f.t / f.inSec, 0, 1);
    if (f.t >= f.inSec) {
      state.screenFade = null;
      try { f.onEnd && f.onEnd(); } catch (e) { console.error(e); }
    }
  }
}

function drawScreenFadeOverlay() {
  const f = state.screenFade;
  if (!f?.active) return;
  drawRect(0, 0, window.innerWidth, window.innerHeight, `rgba(0,0,0,${f.alpha})`);
}

function sleepInBed(bx, by) {
  // Don’t stack sleeps like some kind of cursed time machine
  if (state.screenFade?.active || state._sleeping) return;

  const p = activePlayer(), idx = state.activePlayer | 0;
  const bed = bx == null ? null : state.world?.objects?.[by]?.[bx];
  if (bed) setPose(idx, { kind: "sleep", tx: bx, ty: by, yaw: ((bed.meta?.rot | 0) * Math.PI) / 2 });
  state._sleeping = true;

  // lie down first, then the screen fades
  setTimeout(() => startScreenFadeToBlackThenBack({
    outSec: 0.6,
    holdSec: 0.5,
    inSec: 0.6,
    onMid: () => {
      // 50% of *current* day length, automatically scales if you change DAY_SECONDS
      advanceTimeSeconds(DAY_SECONDS * 0.50);

      // Full stamina
      p.stamina = STAMINA_MAX;
      p.resting = false;
      p.path = [];

      logAction(`${p.name} slept. Stamina fully restored. (+50% day)`);
    },
    onEnd: () => { state._sleeping = false; setTimeout(() => { if (state.players[idx]?.pose?.kind === "sleep") setPose(idx, null); }, 500); }   // a moment in bed after waking, then up
  }), bed ? 1300 : 0);
}

function drawNightOverlay() {
  if (!state.time || state.time.isDay) return;
if (state.mode === "interior") return;

  // Darken the world area (leave top bar + bottom UI readable)
  const y = UI_TOP_H;
  const h = window.innerHeight - UI_TOP_H - UI_BOTTOM_H;
  if (h <= 0) return;

  drawRect(0, y, window.innerWidth, h, "rgba(0,0,0,0.45)");
}

// ------------------------------------------------------------------------ Main loop & Render ----
function update(dt) {
  netTick();

  // Always update title/menu/cutscene stuff first so clicks work even before world arrives.
  updateTitleMenu(dt);
  updateScreenFade(dt);
  tickPoses();
  updateMusic(dt);

  // Multiplayer boot: don't run overworld sim until server world arrives
  // (but DO allow title/menu to function above)
  if (state.mode === "overworld" && !overworldReady()) return;

  // ============================================================
  // CO-OP RULE:
  // Only the HOST is allowed to run "world simulation" that
  // mutates the overworld map (spawns, day rollover, campfires, etc.)
  // Everyone can still move/act (their actions send world ops),
  // but background sim must not run on both clients.
  // ============================================================
  const hostSim = !(state.net?.enabled) || !!state.net.isHost;

  if (hostSim) {
    updateTime(dt);       // runs new-day systems that mutate the world
    updateAnimals(dt);    // overworld critters wandering / changes
    updateSpawns(dt);     // spawner writes into map.objects
    updateCampfires(dt);  // can null out campfires when they die
    updateBuildTimers(dt);
  }

  // Players should always update (movement, input, UI state, etc.)
  updatePlayers(dt);
  updateCouple();
}

// --- Draw function ----
function render() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  setChatInputVisible(!state.title?.open);

if (state.cutscene?.open) drawCutscene();

if (state.tutorial?.open) {
  drawTutorial();
  return;
}

// Cutscene overlay: draw it and STOP. Otherwise title UI draws over it.
if (state.cutscene?.open) {
  drawCutscene();
  return;
}

  // If title is open, render ONLY the title screen (no world behind it)
  if (state.title?.open) {
    drawTitleMenu();
    return;
  }

  if (!state.view3d) drawWorld();   // 3D view (src/render3d) draws the overworld itself; this canvas is then just the HUD/menu layer
  drawSpeechBubbles();
  if (!state.view3d) drawNightOverlay();   // 3D has its own day/night
  drawHud();   // src/ui/hud.js: status card, day pill, left buttons, activity toasts, dock, backpack and chat sheets
  drawMenu();
  drawRunestoneReader();
  drawRuneComboLockModal();
  drawRiddleLockModal();
  drawInteractionRequestDialog();
  drawTradeUI();
  drawCraftingPopup();
  drawSettingsModal();
    if (state.coordsOpen) drawCoordsModal();
  if (state.collectiblesOpen) drawCollectiblesModal();
  if (state.treasureOpen) drawTreasureModal();     // (these two were never called from render(): the dialogs were invisible but still ate taps)
  if (state.stockpileOpen) drawStockpileModal();
  drawConstructionUI();
  drawScreenFadeOverlay();
}

function loop(now) {
  const dt = Math.min(0.05, (now - state._lastTime) / 1000);
  state._lastTime = now;

  update(dt);
  render();

  requestAnimationFrame(loop);
}

function isSpawnableTile(map, x, y, occupied) {
  const h = map?.tiles?.length ?? 0;
  const w = map?.tiles?.[0]?.length ?? 0;
  if (x < 0 || y < 0 || x >= w || y >= h) return false;

  if (map.tiles[y][x] === "water") return false;
  if (map.objects?.[y]?.[x]) return false;
  if (occupied.has(`${x},${y}`)) return false;

  return true;
}

function findNearestSpawn(map, sx, sy, occupied) {
  const h = map?.tiles?.length ?? 0;
  const w = map?.tiles?.[0]?.length ?? 0;

  const q = [[sx, sy]];
  const seen = new Set([`${sx},${sy}`]);

  while (q.length) {
    const [x, y] = q.shift();
    if (isSpawnableTile(map, x, y, occupied)) return [x, y];

    const nb = [
      [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1],
      [x + 1, y + 1], [x - 1, y + 1], [x + 1, y - 1], [x - 1, y - 1]
    ];

    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      seen.add(key);
      q.push([nx, ny]);
    }
  }

  return [1, 1];
}

function ensurePlayersNotOnWater(map) {
  const occupied = new Set();

  for (const p of state.players) {
    // Clamp to valid map bounds first (guards against saved negative/out-of-range coords)
    p.x = Math.max(0, Math.min(WORLD_W - 1, p.x | 0));
    p.y = Math.max(0, Math.min(WORLD_H - 1, p.y | 0));
    p.fx = p.x;
    p.fy = p.y;

    if (!isSpawnableTile(map, p.x, p.y, occupied)) {
      const [nx, ny] = findNearestSpawn(map, p.x, p.y, occupied);
      p.x = p.fx = nx;
      p.y = p.fy = ny;
    }
    occupied.add(`${p.x},${p.y}`);
  }
}

// ---- Loading Screen ----
function setLoadProgress(pct, label) {
  const bar = document.getElementById("loading-bar");
  const lbl = document.getElementById("loading-label");
  if (bar) bar.style.width = pct + "%";
  if (lbl && label) lbl.textContent = label;
}

function showLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (!overlay) return;
  overlay.style.opacity = "1";
  overlay.style.display = "flex";
}

function hideLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (!overlay) return;
  overlay.style.pointerEvents = "none"; // stop blocking input immediately
  overlay.style.opacity = "0";
  setTimeout(() => { overlay.style.display = "none"; }, 420);
}

// ---- World Setup (called after Continue is clicked) ----
function doWorldSetup() {
  setLoadProgress(20, "Loading world...");

  // ---------------- Worlds: ensure at least one exists, then load selected ----------------
  const wid = getActiveWorldId();
  let payload = wid ? loadWorldPayload(wid) : null;

  if (!payload) {
    setLoadProgress(30, "Generating world...");
    const gen = generateOverworld();
    const seed = makeSeed ? makeSeed() : ((Math.random() * 2147483647) | 0);
    payload = worldToPayload(gen, wid || 1, seed);
    if (wid) saveWorldPayload(wid, payload);
  }

  state.currentWorldId = wid || 1;
  state.world = payloadToWorld(payload);

  setLoadProgress(65, "Restoring save...");

  // Load inventories for this world (if any exist)
  loadInventoriesForWorld(state.currentWorldId);

  // ✅ CO-OP: re-enable overworld object broadcast proxy after loading world
  enableOverworldObjectsProxy();
  state.interior = state.interior || generateInterior(state.interiorId);

  // Island worlds: players still at the old default corner (or standing in the sea) start at the island's spawn point
  if (state.world.spawn) {
    const sp = state.world.spawn;
    state.players.forEach((p, i) => {
      const atDefault = p.y === 2 && p.x === 2 + i, wet = state.world.tiles?.[p.y]?.[p.x] === "water";
      if (atDefault || wet) { p.x = p.fx = sp.x + i; p.y = p.fy = sp.y; p.path = []; }
    });
  }

  // Make sure players don’t start in water / invalid tiles.
  ensurePlayersNotOnWater(state.world);

  // camera start
  state.cam.x = 0;
  state.cam.y = 0;
  clampCamera();

  setLoadProgress(85, "Finishing up...");

  // (no starter kit: tools are looted from toolboxes and chests, which respawn each day: updateChestsOnNewDay)

  // reveal initial fog
  revealAroundPlayers();

  logAction(`> Running build ${GAME_BUILD}`);

  state._worldSetupDone = true;

  setLoadProgress(100, "Ready!");
  hideLoadingOverlay();
}

// ---- Boot ----
async function boot() {
  const [tiles, objects, items, recipes, buildings, interiors, riddles, furniture] = await Promise.all([
    loadJSON("./src/data/tiles.json"),
    loadJSON("./src/data/objects.json"),
    loadJSON("./src/data/items.json"),
    loadJSON("./src/data/recipes.json"),
    loadJSON("./src/data/buildings.json"),
    loadJSON("./src/data/interiors.json"),
    loadJSON("./src/data/riddles.json").catch(() => []),
    loadJSON("./src/data/furniture.json").catch(() => []),
  ]);

  state.data = {
    tiles: Object.fromEntries(tiles.map(x => [x.id, x])),
    objects: Object.fromEntries(objects.map(x => [x.id, x])),
    items: Object.fromEntries(items.map(x => [x.id, x])),
    recipes: Object.fromEntries(recipes.map(x => [x.id, x])),
    buildings: Object.fromEntries(buildings.map(x => [x.id, x])),
    interiors: Object.fromEntries(interiors.map(x => [x.id, x])),
    riddles: Object.fromEntries((riddles || []).map(x => [x.id, x])),
    furniture: Object.fromEntries((furniture || []).map(x => [x.id, x])),
  };
  // every piece of furniture is also a world object (so it can stand on a tile, block the way, and act as a cooking / prep station)
  // ...and every piece has a recipe scroll (an item) that must be found and learned before it can be built
  for (const f of furniture || []) {
    state.data.items[f.recipe] = { id: f.recipe, name: `${f.name} Recipe`, icon: "📃", stack: 2, tags: ["recipe"], group: f.cat, description: `Double-tap to learn how to build: ${f.name}.` };
    state.data.recipes[f.recipe] = { id: f.recipe, name: f.name, station: "furnish", furniture: f.id, in: f.cost || {}, out: {} };
  }
  seedStarterRecipes();
  for (const f of furniture || []) {
    state.data.objects[f.id] = { id: f.id, name: f.name, icon: f.icon, blocks: !!f.blocks, size: "medium", hp: 999, tags: ["furniture"], furniture: true, ...(f.station ? { station: f.station } : {}), ...(f.sleep ? { sleep: true } : {}) };
  }

  // Ensure at least one world exists in localStorage (bookkeeping only, no generation)
  ensureAtLeastOneWorld();

  // Connect to co-op (Firebase Auth + Firestore/RTDB — same project as
  // apps/couples-app, no separate login and no server to host anymore).
  if (!state.net?.enabled) {
    connectOnline();
  }

  // Start the game loop — title screen is open by default, world loads on Continue
  ensureChatInput();
  requestAnimationFrame(loop);
}

boot().catch(err => {
  console.error(err);
  alert(err.message);
 
});
