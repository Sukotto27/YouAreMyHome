// HUD v2: the in-game overlay, restyled after the Couples app (warm paper panels, ink text, rose / teal / gold accents,
// Fraunces + Figtree type) and laid out for phones: the play area is the whole screen, and everything floats over it.
//
//   top-left   status card (who you are, stamina, hunger)          top-center/right  day pill + coordinates + activity toasts
//   left       round buttons: compass, music, settings, journal    bottom dock       backpack | selected item | chat
//   backpack and chat open as sheets above the dock (one at a time on narrow screens)
//
// Classic script loaded after main.js: it shares main.js's globals (ctx, state, drawRect, itemDef, ...). main.js calls
// drawHud() once per frame (after the world), handleHudTap() on pointer-down, and uses hudHit() as "is this press on the HUD?".
// It also publishes the space the HUD covers to the world via UI_LEFTBAR_W / UI_TOP_H / UI_BOTTOM_H so the camera keeps the
// player in the visible part of the screen (see scene3d.fitView).

const HUD_C = {
  paper: "#fbf2e9", paperDeep: "#f3e6d8", ink: "#362521", inkSoft: "#6b5850",
  blush: "#f6b8b6", blushSoft: "#fbdad7", rose: "#e27d7a", teal: "#6fb8b5", gold: "#c89b3c", night: "#6d6a9c",
};
const HUD_BODY = '"Figtree","Segoe UI",system-ui,sans-serif', HUD_DISPLAY = '"Fraunces","Georgia",serif', HUD_HAND = '"Caveat","Segoe Script",cursive';
const HUD_PANEL_FILL = "rgba(251,242,233,0.96)", HUD_PANEL_EDGE = "rgba(54,37,33,0.14)";

const HUD = {
  inv: { open: false, anim: 0 },
  chat: { open: false, anim: 0, seen: 0, unread: 0 },
  ui: {},                       // named rects (hit-testing)
  block: [],                    // every rect that should swallow world presses this frame
  log: { newAt: 0, len: 0, top: "" },
  press: null,                  // a finger resting on an inventory slot (long press opens its menu)
  last: 0, inset: { bottom: 0 }, imgs: {}, safe: { t: 0, r: 0, b: 0, l: 0 },
  toast: null,                  // { text, sub, color, until }: a short message in the middle of the screen
};
/** Show a short message on screen (e.g. "Out of energy"). */
function hudToast(text, o = {}) { HUD.toast = { text, sub: o.sub || "", icon: o.icon || "bolt", color: o.color || HUD_C.rose, start: performance.now(), until: performance.now() + (o.ms || 2200) }; }
/** Called when the player tries something that costs energy while at zero. Rate-limited so held keys don't spam it. */
function notifyNoEnergy() {
  const now = performance.now(); if (HUD.noEnergyAt && now - HUD.noEnergyAt < 1800) return; HUD.noEnergyAt = now;
  hudToast("Out of energy", { sub: "Rest for a moment (R)", icon: "bolt" });
  try { playSound("error"); } catch (_) {}
}

// ------------------------------------------------------------------ setup
(function hudInit() {
  try {
    for (const f of ['500 14px "Figtree"', '700 14px "Figtree"', '600 16px "Fraunces"', 'italic 500 16px "Fraunces"', '600 18px "Caveat"']) document.fonts?.load(f);
  } catch (_) {}
  const readSafe = () => {
    try {
      const d = document.createElement("div");
      d.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
      document.body.appendChild(d); const cs = getComputedStyle(d);
      HUD.safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
      d.remove();
    } catch (_) {}
  };
  if (document.body) readSafe(); else addEventListener("DOMContentLoaded", readSafe);
  // the mouse wheel scrolls the crafting lists (and must not zoom the 3D camera while it is open)
  document.getElementById("game")?.addEventListener("wheel", (e) => {
    if (typeof state === "undefined") return;
    if (state.craftingOpen) { if (typeof hudCraftWheel === "function") hudCraftWheel(e.deltaY); e.preventDefault(); e.stopImmediatePropagation(); }
    else if (state.coordsOpen || state.collectiblesOpen || state.stockpileOpen) { if (typeof hudScrollWheel === "function") hudScrollWheel(e.deltaY); e.preventDefault(); e.stopImmediatePropagation(); }
  }, { passive: false });
  addEventListener("resize", readSafe);
})();

// ------------------------------------------------------------------ drawing helpers
function hudPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/** A paper panel with a soft shadow. */
function hudPanel(x, y, w, h, o = {}) {
  ctx.save();
  if (o.shadow !== false) { ctx.shadowColor = "rgba(54,37,33,0.28)"; ctx.shadowBlur = o.blur ?? 14; ctx.shadowOffsetY = 3; }
  hudPath(x, y, w, h, o.r ?? 16); ctx.fillStyle = o.fill || HUD_PANEL_FILL; ctx.fill();
  ctx.shadowColor = "transparent"; ctx.lineWidth = 1; ctx.strokeStyle = o.edge || HUD_PANEL_EDGE; ctx.stroke();
  ctx.restore();
}
function hudText(str, x, y, size, o = {}) {
  ctx.font = `${o.italic ? "italic " : ""}${o.weight ?? 500} ${size}px ${o.family || HUD_BODY}`;
  ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "middle"; ctx.fillStyle = o.color || HUD_C.ink;
  ctx.fillText(str, x, y);
}
function hudFit(str, maxW, size, o = {}) {   // truncate with an ellipsis so text never spills out of its panel
  ctx.font = `${o.italic ? "italic " : ""}${o.weight ?? 500} ${size}px ${o.family || HUD_BODY}`;
  if (ctx.measureText(str).width <= maxW) return str;
  while (str.length > 1 && ctx.measureText(str + "…").width > maxW) str = str.slice(0, -1);
  return str + "…";
}
function hudWrap(str, maxW, size, o = {}) {
  ctx.font = `${o.weight ?? 500} ${size}px ${o.family || HUD_BODY}`;
  const out = []; let line = "";
  for (const word of String(str).split(/\s+/)) {
    const t = line ? line + " " + word : word;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line); return out;
}
function hudBar(x, y, w, h, pct, color) {
  pct = Math.max(0, Math.min(1, pct));
  hudPath(x, y, w, h, h / 2); ctx.fillStyle = "rgba(54,37,33,0.13)"; ctx.fill();
  if (pct > 0.005) { const fw = Math.max(h, w * pct); hudPath(x, y, fw, h, h / 2); ctx.fillStyle = color; ctx.fill(); ctx.save(); hudPath(x, y, fw, h, h / 2); ctx.clip(); ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.fillRect(x, y, fw, h * 0.42); ctx.restore(); }
}
function hudAvatar(src, cx, cy, r, o = {}) {
  let img = HUD.imgs[src]; if (!img) { img = HUD.imgs[src] = new Image(); img.src = src; }
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.fillStyle = HUD_C.paperDeep; ctx.fill(); ctx.clip();
  if (img.complete && img.naturalWidth) { if (o.gray) ctx.filter = "grayscale(1)"; ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2); }
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = o.ring || "rgba(251,242,233,0.95)"; ctx.stroke(); ctx.restore();
}
function hudDot(cx, cy, r, color) { ctx.beginPath(); ctx.arc(cx, cy, r + 1.5, 0, 7); ctx.fillStyle = HUD_C.paper; ctx.fill(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = color; ctx.fill(); }

/** Line icons (24-unit grid), drawn with paths so they look the same on every device. */
function hudIcon(name, cx, cy, size, color = HUD_C.ink, lw = 1.9) {
  ctx.save(); ctx.translate(cx, cy); const u = size / 24; ctx.scale(u, u);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const P = (d) => { ctx.stroke(new Path2D(d)); };
  switch (name) {
    case "compass": ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(4.2, -4.2); ctx.lineTo(1.4, 1.4); ctx.lineTo(-4.2, 4.2); ctx.lineTo(-1.4, -1.4); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(4.2, -4.2); ctx.lineTo(1.4, 1.4); ctx.lineTo(-1.4, -1.4); ctx.closePath(); ctx.fill(); break;
    case "volume": P("M-9 -3.5h3.8l5.2-4.4v16l-5.2-4.4H-9z"); ctx.beginPath(); ctx.arc(1.5, 0, 5, -0.85, 0.85); ctx.stroke(); ctx.beginPath(); ctx.arc(1.5, 0, 9, -0.8, 0.8); ctx.stroke(); break;
    case "muted": P("M-9 -3.5h3.8l5.2-4.4v16l-5.2-4.4H-9z"); P("M5 -4l7 8M12 -4l-7 8"); break;
    case "gear": ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, a0 = a - 0.2, a1 = a + 0.2; ctx.lineTo(Math.cos(a0) * 7.2, Math.sin(a0) * 7.2); ctx.lineTo(Math.cos(a0 + 0.04) * 10, Math.sin(a0 + 0.04) * 10); ctx.lineTo(Math.cos(a1 - 0.04) * 10, Math.sin(a1 - 0.04) * 10); ctx.lineTo(Math.cos(a1) * 7.2, Math.sin(a1) * 7.2); ctx.arc(0, 0, 7.2, a1, a + Math.PI / 4 - 0.2); } ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.stroke(); break;
    case "exit": P("M-2 -9h-5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"); P("M2 -5l5 5-5 5M7 0H-3"); break;
    case "journal": P("M-9 -7.5q4.5-1.6 9 1.2q4.5-2.8 9-1.2v14.5q-4.5-1.6-9 1.2q-4.5-2.8-9-1.2z"); P("M0 -6.3v14.5"); break;
    case "pencil": P("M-7 8l1-4.5L5.5 -7a2 2 0 0 1 3 0l1 1a2 2 0 0 1 0 3L-1.5 7z"); P("M3.5 -5l3 3"); break;
    case "bag": P("M-8.5 9.5V-1a8.5 7.5 0 0 1 17 0v10.5a2.5 2.5 0 0 1-2.5 2.5h-12a2.5 2.5 0 0 1-2.5-2.5z"); P("M-2.6 -7.6v-1.6a2.6 2.6 0 0 1 5.2 0v1.6"); P("M-5 12V6.2a1.6 1.6 0 0 1 1.6-1.6h6.8A1.6 1.6 0 0 1 5 6.2V12"); P("M-8.5 0.8q8.5 4 17 0"); break;
    case "chat": P("M-9 -6.5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8.5a3 3 0 0 1-3 3H-1.5L-6 14.5V11h0a3 3 0 0 1-3-3z"); ctx.beginPath(); for (const dx of [-4.2, 0, 4.2]) { ctx.moveTo(dx + 0.6, -1); ctx.arc(dx, -1, 0.6, 0, 7); } ctx.stroke(); break;
    case "close": P("M-6 -6l12 12M6 -6l-12 12"); break;
    case "pin": P("M0 11.5C-6 5.5-8 2.5-8-1.5a8 8 0 0 1 16 0c0 4-2 7-8 13z"); ctx.beginPath(); ctx.arc(0, -1.5, 2.6, 0, 7); ctx.stroke(); break;
    case "sun": ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, 7); ctx.fill(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 7.6, Math.sin(a) * 7.6); ctx.lineTo(Math.cos(a) * 10.4, Math.sin(a) * 10.4); ctx.stroke(); } break;
    case "moon": ctx.beginPath(); ctx.arc(0, 0, 8.5, 0.55, Math.PI * 2 - 0.55); ctx.arc(3.8, -1.6, 7.1, Math.PI * 2 - 0.9, 0.9, true); ctx.closePath(); ctx.fill(); break;
    case "flame": ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(7, -3, 8, 2, 6, 6); ctx.bezierCurveTo(4, 10, -4, 10, -6, 6); ctx.bezierCurveTo(-8, 2, -5, -2, -3, -4); ctx.bezierCurveTo(-3, -1, -1, -1, -1, -3); ctx.bezierCurveTo(-1, -6, 0, -8, 0, -10); ctx.closePath(); ctx.fill(); break;
    case "hand": P("M-5 10l-3-7q-1-3 2-3l2 3V-8q0-2 2-2t2 2v5V-9q0-2 2-2t2 2v6V-7q0-2 2-2t2 2v11q0 6-5 8z"); break;
    case "axe": P("M-8 10L4 -4"); ctx.beginPath(); ctx.moveTo(1, -9); ctx.lineTo(10, -3); ctx.lineTo(7, 1); ctx.lineTo(-1, -5); ctx.closePath(); ctx.fill(); break;
    case "hammer": P("M-8 10L2 0"); ctx.fillRect(-1, -9, 12, 7); break;
    case "eye": P("M-11 0q11-12 22 0q-11 12-22 0"); ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, 7); ctx.fill(); break;
    case "box": P("M-9 -2h18v11h-18z"); P("M-9 -2q0-8 9-8t9 8"); ctx.beginPath(); ctx.arc(0, 3, 1.8, 0, 7); ctx.fill(); break;
    case "door": P("M-6 11V-10h12v21"); P("M-9 11h18"); ctx.beginPath(); ctx.arc(3, 1, 1.5, 0, 7); ctx.fill(); break;
    case "swap": P("M-9 -4h16M3 -9l5 5-5 5M9 5H-7M-3 0l-5 5 5 5"); break;
    case "drop": P("M0 -10v14M-6 -3l6 7 6-7M-10 10h20"); break;
    case "target": ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, 7); ctx.fill(); break;
    case "drip": P("M0 -10C6 -2 8 2 8 5a8 8 0 0 1-16 0C-8 2-6-2 0-10z"); break;
    case "sprout": P("M0 10V-1M0 3Q-9 3-9-6Q0-6 0 3M0 -1Q9-1 9-9Q0-9 0-1"); break;
    case "key": ctx.beginPath(); ctx.arc(-5, -4, 4.5, 0, 7); ctx.stroke(); P("M-2 0L9 11M5 7l3-3M8 10l2-2"); break;
    case "feather": P("M8 -10C-2-9-8 0-8 9M8 -10C9 0 3 7-6 8M-8 9L-11 12M-1 3l5-5"); break;
    case "fish": P("M-10 0q8-9 16 0q-8 9-16 0M6 0l6-5v10z"); break;
    case "plus": P("M0 -8v16M-8 0h16"); break;
    case "dots": for (const dx of [-6, 0, 6]) { ctx.beginPath(); ctx.arc(dx, 0, 1.9, 0, 7); ctx.fill(); } break;
    case "rotate": ctx.beginPath(); ctx.arc(0, 0, 8, -0.4, 4.2); ctx.stroke(); P("M7 -9l1 6-6 0"); break;
    case "trash": P("M-8 -6h16M-5 -6l1 14h8l1-14M-3 -6v-3h6v3"); break;
    case "bed": P("M-10 8V-6M10 8V1M-10 3h20M-10 3V-1h8a3 3 0 0 1 3 3"); break;
    case "heart": ctx.beginPath(); ctx.moveTo(0, 9); ctx.bezierCurveTo(-13, 0, -9, -9, 0, -3.5); ctx.bezierCurveTo(9, -9, 13, 0, 0, 9); ctx.closePath(); ctx.fill(); break;
    case "bolt": ctx.beginPath(); ctx.moveTo(2.5, -10); ctx.lineTo(-6, 2); ctx.lineTo(-0.5, 2); ctx.lineTo(-2.5, 10); ctx.lineTo(6, -2.5); ctx.lineTo(0.5, -2.5); ctx.closePath(); ctx.fill(); break;
    case "apple": ctx.beginPath(); ctx.moveTo(0, -4.5); ctx.bezierCurveTo(-3, -8.5, -10, -5, -8.5, 1.5); ctx.bezierCurveTo(-7.5, 7.5, -3, 10.5, 0, 8.6); ctx.bezierCurveTo(3, 10.5, 7.5, 7.5, 8.5, 1.5); ctx.bezierCurveTo(10, -5, 3, -8.5, 0, -4.5); ctx.closePath(); ctx.fill(); P("M0 -4.5q.5-4 3.6-5.6"); break;
  }
  ctx.restore();
}
/** A round paper button with an icon. Returns its hit rect. */
function hudRoundButton(cx, cy, r, icon, o = {}) {
  ctx.save();
  ctx.shadowColor = "rgba(54,37,33,0.28)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = o.active ? HUD_C.rose : HUD_PANEL_FILL; ctx.fill();
  ctx.shadowColor = "transparent"; ctx.lineWidth = 1; ctx.strokeStyle = o.active ? "rgba(255,255,255,0.5)" : HUD_PANEL_EDGE; ctx.stroke();
  ctx.restore();
  hudIcon(icon, cx, cy, r * 1.05, o.active ? HUD_C.paper : HUD_C.ink);
  const rect = { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }; HUD.block.push(rect); return rect;
}

// ------------------------------------------------------------------ layout + frame
const hudNarrow = () => window.innerWidth < 600;
const hudEase = (cur, target, dt, k = 14) => cur + (target - cur) * Math.min(1, dt * k);
const hudInvCols = () => (window.innerWidth >= 720 ? 12 : 9);

function drawHud() {
  const now = performance.now(), dt = Math.min(0.05, (now - (HUD.last || now)) / 1000); HUD.last = now;
  const W = window.innerWidth, H = window.innerHeight, S = HUD.safe, m = 10, narrow = hudNarrow();
  HUD.block = []; HUD.ui = {};
  const p = activePlayer(), inv = activeInv() || [];

  // ---- chat unread bookkeeping + activity log timing ----
  const msgs = state.chatMessages || [];
  if (HUD.chat.open) { HUD.chat.seen = msgs.length; HUD.chat.unread = 0; }
  else if (msgs.length > HUD.chat.seen) { for (let i = HUD.chat.seen; i < msgs.length; i++) if (msgs[i].fromIndex !== (state.activePlayer | 0)) HUD.chat.unread++; HUD.chat.seen = msgs.length; }
  const lg = state.actionLog || [];
  if (lg.length !== HUD.log.len || lg[0] !== HUD.log.top) { if (lg.length && lg[0] !== HUD.log.top) HUD.log.newAt = now; HUD.log.len = lg.length; HUD.log.top = lg[0]; }

  // ---- sheets animate open / closed; on a narrow screen only one is open at a time ----
  HUD.inv.anim = hudEase(HUD.inv.anim, HUD.inv.open ? 1 : 0, dt, 16);
  HUD.chat.anim = hudEase(HUD.chat.anim, HUD.chat.open ? 1 : 0, dt, 16);

  const top = m + S.t, left = m + S.l, right = W - m - S.r, bottom = H - m - S.b;

  drawHudStatus(left, top, narrow, p);
  const dayBottom = drawHudDay(left, top, right, narrow);
  drawHudRail(left, top + 54 + 12, narrow);
  drawHudLog(right, dayBottom + 8, narrow, now);
  drawHudToast(now, narrow, top);
  for (const [i, pl] of state.players.entries()) if (pl.equipped === "torch" && getQty(state.inventories[i], "torch") <= 0) pl.equipped = null;   // the torch left the backpack

  // ---- bottom dock + sheets ----
  const dockH = 48, dockY = bottom - dockH;
  const dockTop = dockY - 8;
  const invH = drawHudInventory(left, right, dockTop, narrow, inv);
  drawHudChat(left, right, dockTop, narrow, msgs);
  drawHudDock(left, right, dockY, dockH, narrow, inv);

  // ---- tell the world how much of the screen the HUD covers, so the camera keeps the player in the clear part ----
  const wantBottom = Math.round(H - dockY + 4 + Math.max(invH * HUD.inv.anim, HUD.chat.anim * (HUD.ui.chatPanel?.h || 0)));
  if (Math.abs(wantBottom - HUD.inset.bottom) >= 1) {
    HUD.inset.bottom = wantBottom; UI_BOTTOM_H = wantBottom; UI_TOP_H = 0; UI_LEFTBAR_W = 0;
    try { window.__r3d?.fitView?.(); } catch (_) {}
  }
  hudPlaceChatInput();
}

// ---- top-left: who you are + stamina / hunger ----
function drawHudStatus(x, y, narrow, p) {
  const w = narrow ? Math.min(176, window.innerWidth * 0.5) : 216, h = 54;
  hudPanel(x, y, w, h, { r: 18 }); HUD.block.push({ x, y, w, h }); HUD.ui.status = { x, y, w, h };
  const idx = state.activePlayer | 0, src = idx === 0 ? "src/images/scott_thumbnail.jpg" : "src/images/cristina_thumbnail.jpg";
  hudAvatar(src, x + 27, y + 27, 19, { ring: idx === 0 ? HUD_C.teal : HUD_C.rose });
  const bx = x + 54, bw = w - 54 - 12;
  const rest = p.resting ? "resting" : (p.stamina <= 0 ? "exhausted" : "");
  hudText(p.name, bx, y + 13, 13, { family: HUD_DISPLAY, weight: 600 });
  if (p.equipped === "torch") { ctx.font = `600 13px ${HUD_DISPLAY}`; const nw = ctx.measureText(p.name).width; hudIcon("flame", bx + nw + 12, y + 13, 12, "#e9a35e"); }
  if (rest) hudText(rest, x + w - 12, y + 13, 11, { family: HUD_HAND, weight: 600, color: HUD_C.rose, align: "right", italic: false });
  const sp = (p.stamina ?? 0) / STAMINA_MAX, hp = clamp((p.hunger ?? 0) / HUNGER_MAX, 0, 1);
  hudIcon("bolt", bx + 5, y + 29, 13, HUD_C.teal); hudBar(bx + 14, y + 25.5, bw - 14, 7, sp, sp < 0.25 ? HUD_C.rose : HUD_C.teal);
  hudIcon("apple", bx + 5, y + 43, 13, HUD_C.gold); hudBar(bx + 14, y + 39.5, bw - 14, 7, hp, hp > 0.75 ? HUD_C.rose : HUD_C.gold);
}

// ---- top-center (top-right on phones): day / night + where you are ----
function drawHudDay(left, top, right, narrow) {
  const w = 132, h = 36, x = narrow ? right - w : (window.innerWidth - w) / 2, y = top;
  hudPanel(x, y, w, h, { r: 18 }); HUD.block.push({ x, y, w, h });
  const t = state.time || {}, isDay = t.isDay ?? true, day = t.day ?? 1;
  hudIcon(isDay ? "sun" : "moon", x + 20, y + 15, 16, isDay ? HUD_C.gold : HUD_C.night, 1.6);
  hudText(`Day ${day}`, x + 36, y + 15, 15, { family: HUD_DISPLAY, weight: 600, italic: true });
  // the day's track: daylight in gold, night in dusk blue, a pip for "now"
  const tx = x + 36, tw = w - 36 - 14, ty = y + 27, lf = DAYLIGHT_SECONDS / DAY_SECONDS;
  hudPath(tx, ty, tw, 3.5, 2); ctx.fillStyle = HUD_C.night; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
  hudPath(tx, ty, tw * lf, 3.5, 2); ctx.fillStyle = HUD_C.gold; ctx.fill();
  const nowX = tx + tw * clamp((t.phaseT ?? 0) / DAY_SECONDS, 0, 1);
  ctx.beginPath(); ctx.arc(nowX, ty + 1.75, 3.4, 0, 7); ctx.fillStyle = HUD_C.paper; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = HUD_C.ink; ctx.stroke();

  // coordinates (small, under the pill on phones, beside it on wide screens)
  const loc = { dungeon: "Cave", interior: "Indoors" }[state.mode] || "";
  const me = state.players[state.activePlayer | 0];
  let label = `${loc ? loc + " · " : ""}${me.x}, ${me.y}`;
  if (!narrow && (state.mode === "overworld" || state.mode === "dungeon")) label = `${state.players[0].name[0]} ${state.players[0].x},${state.players[0].y}  ·  ${state.players[1].name[0]} ${state.players[1].x},${state.players[1].y}`;
  ctx.font = `500 11px ${HUD_BODY}`; const cw = ctx.measureText(label).width + 30, ch = 22;
  const cx = narrow ? right - cw : right - cw, cy = narrow ? y + h + 6 : y + 7;
  hudPanel(cx, cy, cw, ch, { r: 11, blur: 8 }); HUD.block.push({ x: cx, y: cy, w: cw, h: ch });
  hudIcon("pin", cx + 12, cy + 11, 11, HUD_C.rose, 2); hudText(label, cx + 22, cy + 11.5, 11, { color: HUD_C.inkSoft });
  return narrow ? cy + ch : y + h;
}

// ---- left rail: compass, music, settings, journal (+ edit in interiors), exit. Same hit-test shape main.js already expects. ----
function drawHudRail(x0, y0, narrow) {
  const r = 22, gap = 10, cx = x0 + r, step = r * 2 + gap;
  let i = 0; const at = () => ({ cx, cy: y0 + r + (i++) * step });
  const vol = typeof getMusicVolume === "function" ? getMusicVolume() : 1;
  const mk = (icon, active) => { const a = at(); return hudRoundButton(a.cx, a.cy, r, icon, { active }); };
  const compassBtn = mk("compass", !!state.coordsOpen);
  const volBtn = mk(vol <= 0.001 ? "muted" : "volume", !!state.ui.musicSliderOpen);
  const settingsBtn = mk("gear", !!state.settingsOpen);
  const collectiblesBtn = mk("journal", !!state.collectiblesOpen);
  const editBtn = state.mode === "interior" ? mk("pencil", !!state.interiorEdit?.on) : null;
  const exitBtn = mk("exit", performance.now() < (state.ui.exitArmedUntil || 0));   // lit while it waits for the confirming second tap
  const ui = state._leftbarUI = { compassBtn, volBtn, settingsBtn, collectiblesBtn, editBtn, exitBtn, sliderBox: null, sliderTrack: null, sliderKnob: null };

  if (!state.ui.musicSliderOpen) return;
  const boxW = Math.min(230, window.innerWidth - (volBtn.x + volBtn.w + 20)), boxH = 62, bx = volBtn.x + volBtn.w + 10, by = volBtn.y + volBtn.h / 2 - boxH / 2;
  hudPanel(bx, by, boxW, boxH, { r: 16 }); HUD.block.push({ x: bx, y: by, w: boxW, h: boxH });
  hudText("Music", bx + 16, by + 18, 13, { family: HUD_DISPLAY, weight: 600, italic: true });
  hudText(`${Math.round(vol * 100)}%`, bx + boxW - 16, by + 18, 12, { color: HUD_C.inkSoft, align: "right" });
  const track = { x: bx + 16, y: by + 36, w: boxW - 32, h: 8 };
  hudBar(track.x, track.y, track.w, track.h, vol, HUD_C.rose);
  const kx = track.x + track.w * vol; ctx.save(); ctx.shadowColor = "rgba(54,37,33,0.35)"; ctx.shadowBlur = 5; ctx.beginPath(); ctx.arc(kx, track.y + 4, 8, 0, 7); ctx.fillStyle = HUD_C.paper; ctx.fill(); ctx.restore(); ctx.beginPath(); ctx.arc(kx, track.y + 4, 8, 0, 7); ctx.lineWidth = 1.5; ctx.strokeStyle = HUD_C.rose; ctx.stroke();
  ui.sliderBox = { x: bx, y: by, w: boxW, h: boxH };
  ui.sliderTrack = { x: track.x - 6, y: track.y - 10, w: track.w + 12, h: track.h + 20 };      // generous touch target
  ui.sliderKnob = { x: kx - 8, y: track.y - 4, w: 16, h: 16 };
}

// ---- a short message in the upper middle of the screen ----
function drawHudToast(now, narrow, top) {
  const t = HUD.toast; if (!t) return;
  if (now > t.until) { HUD.toast = null; return; }
  const k = Math.min(1, (now - t.start) / 160, (t.until - now) / 380), e = k * k * (3 - 2 * k);
  ctx.font = `700 16px ${HUD_BODY}`; const tw = Math.max(ctx.measureText(t.text).width, 120), w = tw + 70, h = t.sub ? 58 : 44;
  const x = (window.innerWidth - w) / 2, y = top + (narrow ? 118 : 70) - (1 - e) * 10;
  ctx.save(); ctx.globalAlpha = e;
  hudPanel(x, y, w, h, { r: h / 2, blur: 16 });
  ctx.beginPath(); ctx.arc(x + 30, y + h / 2, 15, 0, 7); ctx.fillStyle = t.color; ctx.fill(); hudIcon(t.icon, x + 30, y + h / 2, 17, HUD_C.paper);
  hudText(t.text, x + 56, y + (t.sub ? 20 : h / 2) , 16, { weight: 700 });
  if (t.sub) hudText(t.sub, x + 56, y + 40, 12, { color: HUD_C.inkSoft });
  ctx.restore();
}

// ---- top-right: recent activity. No panel behind it, just outlined text. New messages show in full for a few seconds, then it
//      settles to the last 3 (dimmer); tap it to expand a longer list, tap again (or wait) to fold it back. ----
function hudOutlineText(str, x, y, size, o = {}) {
  ctx.font = `${o.weight ?? 600} ${size}px ${HUD_BODY}`; ctx.textAlign = o.align || "right"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  ctx.lineWidth = 4; ctx.strokeStyle = `rgba(36,24,18,${0.62 * (o.alpha ?? 1)})`; ctx.strokeText(str, x, y);
  ctx.globalAlpha = o.alpha ?? 1; ctx.fillStyle = o.color || HUD_C.paper; ctx.fillText(str, x, y); ctx.globalAlpha = 1;
}
function drawHudLog(right, y0, narrow, now) {
  state._logUI = null;
  const all = state.actionLog; if (!Array.isArray(all) || !all.length) return;
  const L = HUD.log;
  // when was each line added? (the log is newest-first; work out how many lines are new since last frame)
  if (!L.times) L.times = [];
  if (all[0] !== L.stamped || all.length !== L.times.length) {
    const prevTop = L.stamped, k = prevTop === undefined ? all.length : (all[0] === prevTop ? 0 : (all.indexOf(prevTop) >= 0 ? all.indexOf(prevTop) : all.length));
    L.times = [...new Array(Math.min(k, all.length)).fill(now), ...L.times].slice(0, all.length);
    while (L.times.length < all.length) L.times.push(0);
    L.stamped = all[0];
    if (k > 0 && prevTop !== undefined) { L.newAt = now; if (state.logExpanded && !L.holdOpen) L.expandedAt = now; }
  }
  const maxW = Math.min(narrow ? 290 : 340, window.innerWidth - 90), lineH = 22, fs = 13;
  const cat = (raw) => { const l = raw.toLowerCase();
    if (/harvest|caught|picked up/.test(l)) return HUD_C.teal; if (/crafted/.test(l)) return HUD_C.gold; if (/placed|built|constructed/.test(l)) return "#e9a35e";
    if (/found|discovered|opened|got|learned/.test(l)) return "#a9a6dd"; if (/hurt|damaged|hit/.test(l)) return HUD_C.rose; return HUD_C.blush; };
  const clean = (s) => s.replace(/\b(\d+)\s+Woods\b/g, "$1 Wood").replace(/\ban\s+([bcdfghjklmnpqrstvwxyz])/gi, "a $1");
  if (state.logExpanded && !L.expandedAt) L.expandedAt = now;
  if (state.logExpanded && now - L.expandedAt > 14000) { state.logExpanded = false; L.expandedAt = 0; }   // folds itself back after a while

  const expanded = !!state.logExpanded, n = expanded ? Math.min(all.length, narrow ? 8 : 10) : Math.min(all.length, 6);
  const lines = []; let widest = 0;
  for (let i = 0; i < n; i++) {
    const age = (now - (L.times[i] || 0)) / 1000;
    let a;
    if (expanded) a = Math.max(0.55, 1 - i * 0.06);
    else if (i < 3) a = age < 5 ? 1 : Math.max(0.5, 0.78 - i * 0.12);                // the last 3 stay, dimmer once they are old news
    else a = age < 5 ? 0.9 : Math.max(0, 1 - (age - 5) / 1.2) * 0.9;                // extra fresh lines fade away
    if (a <= 0.01) continue;
    const raw = clean(all[i]); ctx.font = `600 ${fs}px ${HUD_BODY}`;
    const text = hudFit(raw, maxW - 18, fs, { weight: 600 }); widest = Math.max(widest, ctx.measureText(text).width + 18);
    lines.push({ text, raw, a });
  }
  if (!lines.length) return;
  lines.forEach((ln, i) => {
    const yy = y0 + i * lineH + lineH / 2;
    hudOutlineText(ln.text, right, yy, fs, { alpha: ln.a });
    ctx.font = `600 ${fs}px ${HUD_BODY}`; const w = ctx.measureText(ln.text).width;
    ctx.beginPath(); ctx.arc(right - w - 9, yy, 3.2, 0, 7); ctx.globalAlpha = ln.a; ctx.fillStyle = cat(ln.raw); ctx.fill(); ctx.globalAlpha = 1;
  });
  const h = lines.length * lineH + 6;
  if (!expanded && all.length > 3) hudOutlineText("tap for more", right, y0 + h + 6, 11, { alpha: 0.55, weight: 500, color: HUD_C.blush });
  state._logUI = { x: right - widest - 14, y: y0 - 2, w: widest + 14, h: h + (!expanded && all.length > 3 ? 18 : 0) }; HUD.block.push(state._logUI);
}

// ---- bottom dock: backpack | selected item | chat ----
function drawHudDock(left, right, y, h, narrow, inv) {
  const U = HUD.ui;
  // backpack pill
  const bw = 104, bx = left;
  hudPanel(bx, y, bw, h, { r: h / 2 }); U.bagBtn = { x: bx, y, w: bw, h }; HUD.block.push(U.bagBtn);
  if (HUD.inv.open) { hudPath(bx + 3, y + 3, bw - 6, h - 6, (h - 6) / 2); ctx.fillStyle = HUD_C.blushSoft; ctx.fill(); }
  hudIcon("bag", bx + 28, y + h / 2 - 1, 25, HUD_C.ink);
  hudText(`${inv.length}`, bx + 50, y + h / 2 + 1, 17, { family: HUD_DISPLAY, weight: 600 });
  hudText(`/${INV_SLOTS}`, bx + 50 + (String(inv.length).length * 9.3), y + h / 2 + 2, 12, { color: HUD_C.inkSoft });

  // chat button
  const cw = h, cx = right - cw;
  hudPanel(cx, y, cw, h, { r: h / 2 }); U.chatBtn = { x: cx, y, w: cw, h }; HUD.block.push(U.chatBtn);
  if (HUD.chat.open) { hudPath(cx + 3, y + 3, cw - 6, h - 6, (h - 6) / 2); ctx.fillStyle = HUD_C.blushSoft; ctx.fill(); }
  hudIcon("chat", cx + cw / 2, y + h / 2, 24, HUD_C.ink);
  if (HUD.chat.unread > 0 && !HUD.chat.open) {
    const bx2 = cx + cw - 9, by2 = y + 9; ctx.beginPath(); ctx.arc(bx2, by2, 9, 0, 7); ctx.fillStyle = HUD_C.rose; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = HUD_C.paper; ctx.stroke();
    hudText(String(Math.min(9, HUD.chat.unread)), bx2, by2 + 0.5, 11, { weight: 700, color: HUD_C.paper, align: "center" });
  }

  // selected item (only while a sheet isn't covering the dock's middle)
  const sel = inv[state.selectedInvIdx], mid0 = bx + bw + 8, mid1 = cx - 8;
  if (sel && mid1 - mid0 > 80) {
    const def = itemDef(sel.id), name = def?.name ?? sel.id, sw = Math.min(mid1 - mid0, 200);
    const sx = narrow ? mid0 + (mid1 - mid0 - sw) / 2 : (window.innerWidth - sw) / 2;
    hudPanel(sx, y + 4, sw, h - 8, { r: (h - 8) / 2, blur: 8 }); U.selChip = { x: sx, y: y + 4, w: sw, h: h - 8 }; HUD.block.push(U.selChip);
    drawCenteredEmoji(def?.icon ?? "❓", sx + 22, y + h / 2, 24);
    hudText(hudFit(name, sw - 82, 13, { weight: 600 }), sx + 42, y + h / 2 + 0.5, 13, { weight: 600 });
    U.selClear = { x: sx + sw - 38, y: y + 4, w: 34, h: h - 8 };           // a small × to deselect without opening the backpack
    ctx.beginPath(); ctx.arc(sx + sw - 21, y + h / 2, 11, 0, 7); ctx.fillStyle = HUD_C.paperDeep; ctx.fill(); hudIcon("close", sx + sw - 21, y + h / 2, 11, HUD_C.inkSoft, 2.2);
  }
}

// ---- backpack sheet ----
function drawHudInventory(left, right, dockTop, narrow, inv) {
  const a = HUD.inv.anim; if (a < 0.02) { HUD.ui.invPanel = null; HUD.ui.invGrid = null; return 0; }
  const cols = hudInvCols(), rows = Math.ceil(INV_SLOTS / cols), gap = narrow ? 3 : 5, pad = 14;
  const avail = right - left, cellMax = 48;
  const panelW = narrow ? avail : Math.min(avail, cols * (cellMax + gap) - gap + pad * 2);
  const cell = Math.min(cellMax, Math.floor((panelW - pad * 2 - (cols - 1) * gap) / cols));
  const headH = 44, footH = 46, gridH = rows * cell + (rows - 1) * gap, panelH = headH + gridH + footH + 6;
  const x = narrow ? left : left, y0 = dockTop - panelH, slide = (1 - a) * (panelH + 30), y = y0 + slide;
  ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.6);
  hudPanel(x, y, panelW, panelH, { r: 20 }); const rect = { x, y, w: panelW, h: panelH }; HUD.ui.invPanel = rect; HUD.block.push(rect);
  hudText("Backpack", x + pad + 2, y + 24, 19, { family: HUD_DISPLAY, weight: 600, italic: true });
  hudText(`${inv.length} of ${INV_SLOTS}`, x + pad + 2 + 92, y + 26, 12, { color: HUD_C.inkSoft });
  const cb = { x: x + panelW - pad - 32, y: y + 7, w: 32, h: 32 }; HUD.ui.invClose = cb;
  ctx.beginPath(); ctx.arc(cb.x + 16, cb.y + 16, 14, 0, 7); ctx.fillStyle = HUD_C.paperDeep; ctx.fill(); hudIcon("close", cb.x + 16, cb.y + 16, 14, HUD_C.inkSoft, 2.2);

  const gx = x + (panelW - (cols * cell + (cols - 1) * gap)) / 2, gy = y + headH;
  HUD.ui.invGrid = { x: gx, y: gy, cell, gap, cols, rows };
  for (let i = 0; i < INV_SLOTS; i++) {
    const r = Math.floor(i / cols), c = i % cols, sx = gx + c * (cell + gap), sy = gy + r * (cell + gap), st = inv[i];
    const selected = !state.craftingOpen && i === state.selectedInvIdx;
    hudPath(sx, sy, cell, cell, 9); ctx.fillStyle = selected ? HUD_C.blushSoft : (st ? "rgba(54,37,33,0.07)" : "rgba(54,37,33,0.045)"); ctx.fill();
    ctx.lineWidth = selected ? 2 : 1; ctx.strokeStyle = selected ? HUD_C.rose : "rgba(54,37,33,0.10)"; hudPath(sx + (selected ? 1 : 0), sy + (selected ? 1 : 0), cell - (selected ? 2 : 0), cell - (selected ? 2 : 0), 9); ctx.stroke();
    if (!st) continue;
    drawCenteredEmoji(itemDef(st.id)?.icon ?? "❓", sx + cell / 2, sy + cell / 2 - (st.qty > 1 ? 1 : 0), Math.round(cell * 0.62));
    if (st.qty > 1) {
      ctx.font = `700 ${cell > 40 ? 11 : 10}px ${HUD_BODY}`; const tw = ctx.measureText(String(st.qty)).width + 8, bh = cell > 40 ? 15 : 14;
      hudPath(sx + cell - tw - 2, sy + cell - bh - 2, tw, bh, bh / 2); ctx.fillStyle = HUD_C.ink; ctx.fill();
      hudText(String(st.qty), sx + cell - tw / 2 - 2, sy + cell - bh / 2 - 1.5, cell > 40 ? 11 : 10, { weight: 700, color: HUD_C.paper, align: "center" });
    }
    if (state.selectedForCraft.has(st.id)) { ctx.lineWidth = 2; ctx.strokeStyle = HUD_C.gold; hudPath(sx + 2, sy + 2, cell - 4, cell - 4, 7); ctx.stroke(); }
  }
  // footer: what's selected, or a hint
  const fy = gy + gridH + 10, sel = inv[state.selectedInvIdx], def = sel && itemDef(sel.id);
  if (def) {
    hudText(hudFit(def.name ?? sel.id, panelW - pad * 2, 15, { family: HUD_DISPLAY, weight: 600 }), x + pad + 2, fy + 9, 15, { family: HUD_DISPLAY, weight: 600 });
    const lines = hudWrap(def.description || (def.nourishment ? `Restores ${def.nourishment} hunger.` : ""), panelW - pad * 2 - 4, 12);
    if (lines[0]) hudText(hudFit(lines[0] + (lines[1] ? " " + lines[1] : ""), panelW - pad * 2 - 4, 12), x + pad + 2, fy + 28, 12, { color: HUD_C.inkSoft });
  } else hudText("Tap an item to select it · hold for options", x + pad + 2, fy + 18, 12, { color: HUD_C.inkSoft, family: HUD_HAND, weight: 600 });
  ctx.restore();
  return panelH + 8;
}

// ---- chat sheet (the DOM <input> sits at its foot) ----
function drawHudChat(left, right, dockTop, narrow, msgs) {
  const a = HUD.chat.anim; if (a < 0.02) { HUD.ui.chatPanel = null; return; }
  const w = narrow ? right - left : 340, x = right - w, listH = narrow ? 150 : 170, headH = 44, inputH = 52, h = headH + listH + inputH;
  const y = dockTop - h + (1 - a) * (h + 30);
  ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.6);
  hudPanel(x, y, w, h, { r: 20 }); const rect = HUD.ui.chatPanel = { x, y, w, h }; HUD.block.push(rect);
  hudText("Chat", x + 16, y + 24, 19, { family: HUD_DISPLAY, weight: 600, italic: true });
  // who's here
  const slots = Array.isArray(state.net?.connectedSlots) ? state.net.connectedSlots : [], wsOpen = !!(state.net?.enabled && state.net?.ws?.readyState === 1), me = state.activePlayer | 0;
  [["src/images/scott_thumbnail.jpg", 0], ["src/images/cristina_thumbnail.jpg", 1]].forEach(([src, i], k) => {
    const online = wsOpen && (i === me || slots.includes(i)), ax = x + 84 + k * 28, ay = y + 22;
    hudAvatar(src, ax, ay, 11, { alpha: online ? 1 : 0.45, gray: !online }); if (online) hudDot(ax + 8, ay + 8, 3.4, "#46c46d");
  });
  const cb = HUD.ui.chatClose = { x: x + w - 46, y: y + 7, w: 32, h: 32 };
  ctx.beginPath(); ctx.arc(cb.x + 16, cb.y + 16, 14, 0, 7); ctx.fillStyle = HUD_C.paperDeep; ctx.fill(); hudIcon("close", cb.x + 16, cb.y + 16, 14, HUD_C.inkSoft, 2.2);

  // messages, newest at the bottom; mine on the right in blush, theirs on the left on deep paper
  ctx.save(); hudPath(x + 8, y + headH, w - 16, listH, 12); ctx.clip();
  const maxBubble = w * 0.7, items = [];
  for (const m of msgs.slice(-12)) {
    const lines = hudWrap(m.text, maxBubble - 20, 13), bh = lines.length * 17 + 14; items.push({ m, lines, bh });
  }
  let yy = y + headH + listH - 6;
  if (!items.length) hudText("Say something sweet", x + w / 2, y + headH + listH / 2, 20, { family: HUD_HAND, weight: 600, color: HUD_C.inkSoft, align: "center" });
  for (let i = items.length - 1; i >= 0 && yy > y + headH; i--) {
    const { m, lines, bh } = items[i], mine = m.fromIndex === me; ctx.font = `500 13px ${HUD_BODY}`;
    const bw = Math.min(maxBubble, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 22), bx = mine ? x + w - 14 - bw : x + 14;
    yy -= bh; hudPath(bx, yy, bw, bh, 13); ctx.fillStyle = mine ? HUD_C.blush : HUD_C.paperDeep; ctx.fill();
    lines.forEach((l, k) => hudText(l, bx + 11, yy + 7 + k * 17 + 8.5, 13));
    yy -= 6;
  }
  ctx.restore();
  // input well (the real <input> is positioned over it)
  const iy = y + headH + listH + 8; HUD.ui.chatInput = { x: x + 12, y: iy, w: w - 24, h: 36 };
  ctx.restore();
}

/** The chat <input> is a DOM element (so phones can type): park it inside the sheet, or hide it. */
function hudPlaceChatInput() {
  const wrap = document.getElementById("chatWrap"), input = document.getElementById("chatInput"), ind = document.getElementById("onlineIndicator");
  if (ind) ind.style.display = "none";                                                  // presence is drawn in the chat sheet now
  if (!wrap || !input) return;
  const r = HUD.ui.chatInput, show = !!(r && HUD.chat.open && HUD.chat.anim > 0.9 && !state.title?.open);
  wrap.style.display = show ? "flex" : "none";
  if (!show) return;
  wrap.style.left = `${r.x}px`; wrap.style.top = `${r.y}px`; wrap.style.width = `${r.w}px`;
  const s = input.style; s.width = `${r.w}px`; s.maxWidth = s.width; s.height = `${r.h}px`; s.boxSizing = "border-box";
  s.padding = "0 16px"; s.borderRadius = "18px"; s.border = "1px solid rgba(54,37,33,0.16)"; s.background = HUD_C.paperDeep; s.color = HUD_C.ink; s.font = `500 14px ${HUD_BODY}`; s.outline = "none"; s.lineHeight = "normal";
  input.placeholder = "Write a message…";
}

// ------------------------------------------------------------------ input
function hudHit(px, py) { for (const r of HUD.block) if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return true; return false; }
function hudModalOpen() {
  return !!(state.craftingOpen || state.coordsOpen || state.collectiblesOpen || state.treasureOpen || state.stockpileOpen || state.constructionOpen || state.runestoneReader?.open
    || state.comboLock?.open || state.riddleLock?.open || state.trade?.open || state.settingsOpen || (state.interactionRequest && state.activePlayer === state.interactionRequest.toIndex));
}
function hudToggleInventory(force) {
  HUD.inv.open = force ?? !HUD.inv.open;
  if (!HUD.inv.open) state.selectedInvIdx = -1;      // closing the backpack deselects whatever was selected
  if (HUD.inv.open && hudNarrow()) HUD.chat.open = false;
  playSound?.("click");
}
function hudToggleChat(force, focus) {
  HUD.chat.open = force ?? !HUD.chat.open;
  if (HUD.chat.open) { HUD.chat.unread = 0; if (hudNarrow()) HUD.inv.open = false; }
  else document.getElementById("chatInput")?.blur();
  playSound?.("click");
  if (HUD.chat.open && focus) { HUD.chat.anim = 1; HUD.ui.chatInput = HUD.ui.chatInput || null; setTimeout(() => { hudPlaceChatInput(); const i = document.getElementById("chatInput"); if (i) { i.focus(); } }, 30); }
}
/** Pointer-down on the HUD. Returns true when the press belongs to the HUD (the world must not see it). */
function handleHudTap(px, py) {
  if (hudModalOpen()) return false;
  const U = HUD.ui, hit = (r) => r && hitRect(px, py, r);
  // anything the HUD takes is marked "blocked", so the 3D input never also treats it as a tap on the ground underneath
  if (hudHit(px, py)) state.pointer.blocked = true;
  if (hit(U.bagBtn)) { hudToggleInventory(); return true; }
  if (hit(U.chatBtn)) { hudToggleChat(); return true; }
  if (HUD.inv.open && hit(U.invClose)) { hudToggleInventory(false); return true; }
  if (HUD.chat.open && hit(U.chatClose)) { hudToggleChat(false); return true; }
  if (hit(U.selClear)) { state.selectedInvIdx = -1; playSound?.("click"); return true; }
  if (hit(U.selChip)) { hudToggleInventory(true); return true; }
  // a finger on a backpack slot: remember it so a long press can open the item's menu
  if (HUD.inv.open && hit(U.invPanel)) {
    const idx = invIndexAtScreen(px, py);
    clearTimeout(HUD.press?.timer); HUD.press = null;
    if (idx >= 0 && activeInv()?.[idx]) { HUD.press = { idx, x: px, y: py, timer: setTimeout(() => { if (HUD.press) { HUD.press.fired = true; openMenuForInventoryItem(idx, px, py); } }, 480) }; }
    state.pointer.blocked = true; return true;
  }
  if (HUD.chat.open && hit(U.chatPanel)) { state.pointer.blocked = true; return true; }
  if (hudHit(px, py)) { state.pointer.blocked = true; return true; }            // status card, day pill, toasts...: eat the press
  return false;
}
function hudPointerMove(px, py) { if (HUD.press && Math.hypot(px - HUD.press.x, py - HUD.press.y) > 10) { clearTimeout(HUD.press.timer); HUD.press = null; } }
function hudPointerUp() { if (HUD.press) { clearTimeout(HUD.press.timer); const fired = HUD.press.fired; HUD.press = null; return fired; } return false; }
