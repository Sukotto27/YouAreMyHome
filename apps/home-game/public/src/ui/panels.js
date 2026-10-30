// Panels: the dialogs that open over the game (context menu, crafting, ...), in the same paper style as the HUD (hud.js, which
// this file builds on: HUD_C colours, hudPanel / hudText / hudIcon ...). Phones come first: sheets fill the width, rows are
// at least 44 px tall, lists scroll by dragging, nothing needs a hover or a drag handle.
//
// Classic script loaded after hud.js and before main.js; it only defines functions, main.js calls them from its own draw / pointer code.

// ------------------------------------------------------------------ toolkit
/** Where a centered sheet goes (no drawing). Phones: full width; wide screens: capped width. */
function hudSheetRect(o = {}) {
  const W = window.innerWidth, H = window.innerHeight, S = HUD.safe, narrow = W < 600, maxW = o.maxW || 560, maxH = o.maxH || 560;
  const w = narrow ? W - 20 : Math.min(maxW, W - 40), top = 12 + S.t, bot = 12 + S.b, h = Math.min(maxH, H - top - bot - (narrow ? 0 : 24));
  return { x: (W - w) / 2, y: Math.max(top, (H - h) / 2), w, h, narrow };
}
/** Scrim + paper sheet + title + close button. Returns the sheet rect plus `close` and `body` (the area under the header). */
function hudSheetDraw(rect, title, o = {}) {
  const W = window.innerWidth, H = window.innerHeight;
  ctx.fillStyle = "rgba(54,37,33,0.5)"; ctx.fillRect(0, 0, W, H);
  hudPanel(rect.x, rect.y, rect.w, rect.h, { r: 22, blur: 26 });
  hudText(title, rect.x + 20, rect.y + 29, 21, { family: HUD_DISPLAY, weight: 600, italic: true });
  const close = { x: rect.x + rect.w - 50, y: rect.y + 11, w: 36, h: 36 };
  ctx.beginPath(); ctx.arc(close.x + 18, close.y + 18, 16, 0, 7); ctx.fillStyle = HUD_C.paperDeep; ctx.fill(); hudIcon("close", close.x + 18, close.y + 18, 15, HUD_C.inkSoft, 2.2);
  if (o.rule !== false) { ctx.fillStyle = "rgba(54,37,33,0.10)"; ctx.fillRect(rect.x + 18, rect.y + 54, rect.w - 36, 1); }
  return { ...rect, close, body: { x: rect.x + 16, y: rect.y + 62, w: rect.w - 32, h: rect.h - 62 - 14 } };
}
/** A pill button. kind: "primary" (rose) | "plain" | "ghost". Returns its rect. */
function hudButton(x, y, w, h, label, o = {}) {
  const dis = !!o.disabled, kind = o.kind || "plain";
  ctx.save();
  if (!dis && kind === "primary") { ctx.shadowColor = "rgba(226,125,122,0.45)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2; }
  hudPath(x, y, w, h, h / 2);
  ctx.fillStyle = dis ? "rgba(54,37,33,0.08)" : kind === "primary" ? HUD_C.rose : kind === "ghost" ? "transparent" : HUD_C.paperDeep; ctx.fill();
  ctx.restore();
  if (kind !== "primary") { hudPath(x, y, w, h, h / 2); ctx.lineWidth = 1; ctx.strokeStyle = dis ? "rgba(54,37,33,0.08)" : "rgba(54,37,33,0.16)"; ctx.stroke(); }
  hudText(label, x + w / 2, y + h / 2 + 0.5, o.size || 15, { weight: 700, align: "center", color: dis ? "rgba(54,37,33,0.35)" : kind === "primary" ? HUD_C.paper : HUD_C.ink });
  return { x, y, w, h };
}
/** [-] n [+]. Returns { minus, plus } rects. */
function hudStepper(x, y, value, o = {}) {
  const b = o.size || 34, gap = o.gap || 36, dim = (on) => (on ? HUD_C.ink : "rgba(54,37,33,0.25)");
  const minus = { x, y, w: b, h: b }, plus = { x: x + b + gap, y, w: b, h: b };
  for (const [r, sym, on] of [[minus, "−", value > (o.min ?? 0)], [plus, "+", value < (o.max ?? 99)]]) {
    ctx.beginPath(); ctx.arc(r.x + b / 2, r.y + b / 2, b / 2, 0, 7); ctx.fillStyle = on ? HUD_C.paperDeep : "rgba(54,37,33,0.05)"; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(54,37,33,0.14)"; ctx.stroke();
    hudText(sym, r.x + b / 2, r.y + b / 2 + 0.5, 20, { weight: 600, align: "center", color: dim(on) });
  }
  hudText(String(value), x + b + gap / 2, y + b / 2 + 0.5, 15, { weight: 700, align: "center" });
  return { minus, plus };
}
function hudInRect(px, py, r) { return !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
function hudClip(r, fn) { ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); try { fn(); } finally { ctx.restore(); } }

// ------------------------------------------------------------------ context menu (radial)
// The options fan out around the spot you touched as round icon buttons with a short label, so nothing big covers the world.
// A small X in the middle closes it (tapping anywhere else, or Esc, does too). The game still builds menus as { title, options:[{label,
// action, disabledReason}] }; the icon for each option is picked from its label here.
const MENU_ICON_RULES = [
  [/stockpile/, "box"], [/^(close|cancel|back|never mind)/, "close"], [/pluck/, "feather"], [/relight|try lighting|light (a )?fire|equip torch|put torch|lit /, "flame"], [/put out|extinguish/, "drip"],
  [/^(hunt|shoot)/, "target"], [/harvest|chop|mine|gather/, "axe"], [/pick up|take|grab|collect/, "hand"], [/^eat|cook|prepare/, "apple"],
  [/^sneak/, "eye"], [/rest|sleep|sit/, "moon"], [/stop resting|stand/, "sun"], [/craft|build|put down|hammer|contribute|\+ /, "hammer"], [/^place/, "hammer"],
  [/stockpile/, "box"], [/drop/, "drop"], [/examine|decipher|read|inspect|look/, "eye"], [/open|unlock|stockpile|chest|toolbox|container/, "box"], [/answer|key|lock/, "key"],
  [/enter|exit|door|leave/, "door"], [/trade|swap|give/, "swap"], [/hug|kiss|hold hands|hold|let go|end holding|pet|love/, "heart"],
  [/fill|bucket|water|dump|dig/, "drip"], [/plant|seed|sow/, "sprout"], [/fish|cast|reel/, "fish"], [/bed|sleep in/, "bed"], [/rotate|turn/, "rotate"],
  [/remove|delete|trash|demolish|clear/, "trash"], [/edit|move|modify/, "pencil"], [/mark|save|map|travel|go to/, "pin"], [/dig/, "hammer"],
];
function menuIconFor(label) {
  const l = String(label || "").toLowerCase();
  for (const [re, ic] of MENU_ICON_RULES) if (re.test(l)) return ic;
  return "dots";
}
function hudDrawMenu() {
  const m = state.menu; if (!m) return;
  const W = window.innerWidth, H = window.innerHeight, now = performance.now();
  if (!m._t0) m._t0 = now;
  const grow = Math.min(1, (now - m._t0) / 170), e = 1 - Math.pow(1 - grow, 3);                  // the options pop out from the middle
  const opts = m.options.map((o, i) => ({ o, i })).filter((x) => x.o.disabledReason !== " ");     // " " marks an info line, drawn as a caption
  const info = m.options.filter((o) => o.disabledReason === " ").map((o) => o.label);
  const n = Math.max(1, opts.length), BTN = 54, R = Math.max(86, Math.ceil((n * (BTN + 20)) / (2 * Math.PI)));
  // keep the whole ring on screen (and clear of the dock): move the centre if the spot is near an edge
  const side = R + BTN / 2 + 10, topPad = side + 78 + HUD.safe.t, botPad = Math.max(side + 28, UI_BOTTOM_H + side * 0.6);
  const cx = clamp(m.screenX, side + 40, W - side - 40), cy = clamp(m.screenY, topPad, Math.max(topPad, H - botPad));
  m._center = { x: cx, y: cy };
  // a soft dim behind it so the buttons stand out, plus a ring guide
  ctx.save(); ctx.globalAlpha = 0.5 * e; const dim = ctx.createRadialGradient(cx, cy, 10, cx, cy, R + 90); dim.addColorStop(0, "rgba(36,24,18,0.35)"); dim.addColorStop(1, "rgba(36,24,18,0)"); ctx.fillStyle = dim; ctx.fillRect(cx - R - 100, cy - R - 100, 2 * R + 200, 2 * R + 200); ctx.restore();
  ctx.save(); ctx.globalAlpha = 0.45 * e; ctx.lineWidth = 1.5; ctx.setLineDash([2, 7]); ctx.lineCap = "round"; ctx.strokeStyle = HUD_C.paper; ctx.beginPath(); ctx.arc(cx, cy, R * e, 0, Math.PI * 2); ctx.stroke(); ctx.restore();

  m._hit = []; let topMost = cy - R - BTN / 2;
  const start = -Math.PI / 2;                                                                       // first option at the top, then clockwise
  const spots = opts.map((x, k) => { const a = start + (k / n) * Math.PI * 2; return { ...x, a, bx: cx + Math.cos(a) * R * e, by: cy + Math.sin(a) * R * e }; });
  for (const sp of spots) {
    const dis = !!sp.o.disabledReason, hot = sp.i === m.hoverIndex && !dis, r = BTN / 2 * (0.6 + 0.4 * e) * (hot ? 1.1 : 1);
    ctx.save(); ctx.globalAlpha = Math.min(1, e * 1.6);
    ctx.shadowColor = "rgba(54,37,33,0.35)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
    ctx.beginPath(); ctx.arc(sp.bx, sp.by, r, 0, 7); ctx.fillStyle = hot ? HUD_C.rose : (dis ? "rgba(236,226,214,0.92)" : HUD_PANEL_FILL); ctx.fill();
    ctx.shadowColor = "transparent"; ctx.lineWidth = 1.2; ctx.strokeStyle = hot ? "rgba(255,255,255,0.6)" : HUD_PANEL_EDGE; ctx.stroke();
    hudIcon(menuIconFor(sp.o.label), sp.bx, sp.by, r * 1.0, hot ? HUD_C.paper : (dis ? "rgba(54,37,33,0.32)" : HUD_C.ink), 1.9);
    // label, on the outside of the ring so labels never pile up in the middle
    if (e > 0.7) {
      const cos = Math.cos(sp.a), sin = Math.sin(sp.a), shortReason = dis ? sp.o.disabledReason : "";
      const text = hudFit(sp.o.label.replace(/\s*\([^)]*\)\s*$/, "").replace(/^\+\s*/, ""), 150, 12.5, { weight: 700 });
      ctx.font = `700 12.5px ${HUD_BODY}`; const tw = ctx.measureText(text).width;
      ctx.font = `500 10.5px ${HUD_BODY}`; const rw = shortReason ? Math.min(150, ctx.measureText(shortReason).width) : 0;
      const w = Math.max(tw, rw) + 18, h = shortReason ? 36 : 24, gap = r + 8;
      let lx, ly;
      if (Math.abs(cos) < 0.34) { lx = sp.bx - w / 2; ly = sin < 0 ? sp.by - gap - h : sp.by + gap; }            // top / bottom: above or below the button
      else { lx = cos > 0 ? sp.bx + gap : sp.bx - gap - w; ly = sp.by - h / 2; }                                 // sides: left or right of it
      if (lx < 6 || lx + w > W - 6) { lx = clamp(sp.bx - w / 2, 6, W - w - 6); ly = sin < 0.3 ? sp.by - gap - h : sp.by + gap; }   // no room at the side: go above / below instead
      topMost = Math.min(topMost, ly, sp.by - r);
      ctx.shadowColor = "rgba(54,37,33,0.28)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
      hudPath(lx, ly, w, h, h / 2); ctx.fillStyle = dis ? "rgba(240,232,222,0.94)" : HUD_PANEL_FILL; ctx.fill(); ctx.shadowColor = "transparent";
      hudText(text, lx + w / 2, ly + (shortReason ? 12 : h / 2) + 0.5, 12.5, { weight: 700, align: "center", color: dis ? "rgba(54,37,33,0.45)" : HUD_C.ink });
      if (shortReason) hudText(hudFit(shortReason, 150, 10.5), lx + w / 2, ly + 26, 10.5, { align: "center", color: HUD_C.rose });
      m._hit.push({ x: lx - 2, y: ly - 2, w: w + 4, h: h + 4, opt: sp.o, index: sp.i });
    }
    ctx.restore();
    m._hit.push({ x: sp.bx - BTN / 2 - 4, y: sp.by - BTN / 2 - 4, w: BTN + 8, h: BTN + 8, opt: sp.o, index: sp.i });
  }
  // the middle: a close button, the title above it
  ctx.save(); ctx.globalAlpha = Math.min(1, e * 1.4);
  ctx.shadowColor = "rgba(54,37,33,0.3)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2; ctx.beginPath(); ctx.arc(cx, cy, 19, 0, 7); ctx.fillStyle = HUD_PANEL_FILL; ctx.fill(); ctx.shadowColor = "transparent"; ctx.lineWidth = 1; ctx.strokeStyle = HUD_PANEL_EDGE; ctx.stroke();
  hudIcon("close", cx, cy, 14, HUD_C.inkSoft, 2.4);
  m._closeRect = { x: cx - 22, y: cy - 22, w: 44, h: 44 };
  if (m.title || info.length) {
    const lines = [m.title, ...info].filter(Boolean); ctx.font = `600 14px ${HUD_DISPLAY}`;
    const tw = Math.max(...lines.map((t, k) => { ctx.font = k === 0 ? `italic 600 14px ${HUD_DISPLAY}` : `500 11.5px ${HUD_BODY}`; return ctx.measureText(t).width; })) + 22, th = 12 + lines.length * 16;
    const tx = clamp(cx - tw / 2, 8, W - tw - 8), ty = Math.max(8 + HUD.safe.t, topMost - th - 8);
    ctx.shadowColor = "rgba(54,37,33,0.28)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2; hudPath(tx, ty, tw, th, 14); ctx.fillStyle = HUD_PANEL_FILL; ctx.fill(); ctx.shadowColor = "transparent";
    lines.forEach((t, k) => hudText(t, tx + tw / 2, ty + 6 + 8 + k * 16, k === 0 ? 14 : 11.5, k === 0 ? { family: HUD_DISPLAY, weight: 600, italic: true, align: "center" } : { align: "center", color: HUD_C.inkSoft }));
  }
  ctx.restore();
  m._drawRect = { x: cx - R - BTN, y: cy - R - BTN, w: 2 * (R + BTN), h: 2 * (R + BTN) };
}

// ------------------------------------------------------------------ crafting
const CRAFT = { tab: "recipes", scroll: { recipes: 0, ing: 0 }, mult: 1, hits: [], press: null, lists: {}, open: false };

function craftLayout() {
  const r = hudSheetRect({ maxW: 760, maxH: 600 }), wide = r.w >= 640, footH = 92;
  const bodyY = r.y + 62, bodyH = r.h - 62 - footH - 10;
  const foot = { x: r.x + 16, y: r.y + r.h - footH - 10, w: r.w - 32, h: footH };
  if (wide) {
    const cw = (r.w - 32 - 14) / 2;
    return { r, wide, foot, ing: { x: r.x + 16, y: bodyY + 26, w: cw, h: bodyH - 26 }, rec: { x: r.x + 16 + cw + 14, y: bodyY + 26, w: cw, h: bodyH - 26 }, heads: bodyY + 10 };
  }
  const tabs = { x: r.x + 16, y: bodyY, w: r.w - 32, h: 38 }, list = { x: r.x + 16, y: bodyY + 46, w: r.w - 32, h: bodyH - 46 };
  return { r, wide, foot, tabs, ing: list, rec: list };
}
const craftHave = (id) => getQty(activeInv(), id);
/** What a recipe shows as its picture and result line: an item, or (for recipes that place something) the placed object. */
const recipeIcon = (r) => (r.builds ? objDef(r.builds)?.icon : itemDef(Object.keys(r.out)[0])?.icon) ?? "❓";
const recipeResult = (r, mult = 1) => (r.builds ? `Places a ${(objDef(r.builds)?.name ?? r.builds).toLowerCase()} here` : Object.entries(r.out).map(([id, n]) => `${n * mult} ${itemDef(id)?.name ?? id}`).join(" + "));
/** The recipe the current selection makes (same rule attemptManualCraft uses), with how many times. */
function craftMatch() {
  const sel = state.selectedForCraft; if (!sel || !sel.size) return null;
  for (const r of craftingModeRecipes()) {
    const ins = r.in ?? {}, ids = Object.keys(ins); if (ids.length !== sel.size) continue;
    let mult = null, ok = true;
    for (const id of ids) { const s = sel.get(id) ?? 0, need = ins[id] ?? 0; if (s <= 0 || need <= 0 || s % need !== 0) { ok = false; break; } const k = s / need; if (mult === null) mult = k; else if (k !== mult) { ok = false; break; } }
    if (ok && mult >= 1) return { r, mult };
  }
  return null;
}
function craftSelectRecipe(r, mult) {
  state.selectedForCraft.clear();
  const maxM = r.builds ? 1 : Math.max(1, Math.min(...Object.entries(r.in).map(([id, n]) => Math.floor(craftHave(id) / n))));
  CRAFT.mult = clamp(mult, 1, maxM);
  for (const [id, n] of Object.entries(r.in)) setSelectedQty(id, n * CRAFT.mult);
  state.selectedRecipeId = r.id;
}
function craftClampSelection() {   // after crafting: the stacks shrank, so shrink the selection to match
  for (const [id, q] of [...state.selectedForCraft]) { const have = craftHave(id); if (have <= 0) state.selectedForCraft.delete(id); else if (q > have) state.selectedForCraft.set(id, have); }
  const rec = state.selectedRecipeId && state.data.recipes[state.selectedRecipeId];
  if (rec) { const ok = Object.entries(rec.in).every(([id, n]) => craftHave(id) >= n); if (ok) craftSelectRecipe(rec, CRAFT.mult); else { state.selectedRecipeId = null; state.selectedForCraft.clear(); } }
}

function drawCraftingPopup() {
  if (!state.craftingOpen) { CRAFT.open = false; return; }
  if (!CRAFT.open) { CRAFT.open = true; CRAFT.scroll = { recipes: 0, ing: 0 }; CRAFT.mult = 1; CRAFT.tab = "recipes"; state.selectedRecipeId = null; }
  const L = craftLayout(), S = hudSheetDraw(L.r, CRAFT_MODE_TITLE[state.craftingMode] ?? "Crafting"); CRAFT.close = S.close; CRAFT.sheet = L.r;
  CRAFT.hits = []; CRAFT.lists = {};
  const inv = getCraftingInvFiltered(), recipes = craftingModeRecipes().filter(recipeKnown), match = craftMatch();

  if (L.wide) {
    hudText("Ingredients", L.ing.x + 2, L.heads + 9, 13, { weight: 700, color: HUD_C.inkSoft });
    hudText("Recipes", L.rec.x + 2, L.heads + 9, 13, { weight: 700, color: HUD_C.inkSoft });
  } else {
    const t = L.tabs, half = t.w / 2;
    hudPath(t.x, t.y, t.w, t.h, t.h / 2); ctx.fillStyle = HUD_C.paperDeep; ctx.fill();
    [["recipes", "Recipes"], ["ing", "Ingredients"]].forEach(([id, label], i) => {
      const on = CRAFT.tab === id, rx = t.x + i * half;
      if (on) { hudPath(rx + 3, t.y + 3, half - 6, t.h - 6, (t.h - 6) / 2); ctx.fillStyle = HUD_C.paper; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(54,37,33,0.14)"; ctx.stroke(); }
      hudText(label, rx + half / 2, t.y + t.h / 2 + 0.5, 14, { weight: 700, align: "center", color: on ? HUD_C.ink : HUD_C.inkSoft });
      CRAFT.hits.push({ x: rx, y: t.y, w: half, h: t.h, fn: () => { CRAFT.tab = id; playSound("click"); } });
    });
  }
  if (L.wide || CRAFT.tab === "ing") craftDrawList("ing", L.ing, inv, (st, y, w) => craftDrawIngredient(st, L.ing.x, y, w), 54, "Nothing here to work with yet");
  if (L.wide || CRAFT.tab === "recipes") craftDrawList("recipes", L.rec, recipes, (r, y, w) => craftDrawRecipe(r, L.rec.x, y, w), 62, "No recipes known yet. Try mixing ingredients!");

  // footer: what you're about to make + Craft
  const f = L.foot; hudPath(f.x, f.y, f.w, f.h, 18); ctx.fillStyle = HUD_C.paperDeep; ctx.fill();
  const known = match && recipeKnown(match.r), chk = match ? canCraftRecipe(match.r) : null, hunch = !match && furnitureHunch(), canGo = !!(match && chk.ok) || !!hunch;
  const btnW = 128, btnH = 46, btn = { x: f.x + f.w - btnW - 14, y: f.y + (f.h - btnH) / 2, w: btnW, h: btnH };
  let title, sub, subColor = HUD_C.inkSoft;
  if (match && known) { title = `${match.r.name}${match.mult > 1 ? ` ×${match.mult}` : ""}`; sub = chk.ok ? recipeResult(match.r, match.mult) : chk.reason; if (!chk.ok) subColor = HUD_C.rose; }
  else if (match) { title = "Something new…"; sub = chk.ok ? "Try it and see what happens" : chk.reason; if (!chk.ok) subColor = HUD_C.rose; }
  else if (hunch) { title = "Something new…"; sub = "Try it and see what happens"; }
  else { title = state.selectedForCraft.size ? "Doesn't make anything yet" : "Pick a recipe"; sub = state.selectedForCraft.size ? "Adjust the amounts, or try another mix" : "or mix things to experiment"; }
  const tx = f.x + 16, tw = btn.x - tx - 12;
  hudText(hudFit(title, tw, 17, { family: HUD_DISPLAY, weight: 600, italic: true }), tx, f.y + 26, 17, { family: HUD_DISPLAY, weight: 600, italic: true });
  hudText(hudFit(sub, tw, 12), tx, f.y + 48, 12, { color: subColor });
  // how many times (only when a recipe is chosen)
  const rec = state.selectedRecipeId && state.data.recipes[state.selectedRecipeId];
  if (rec && match && match.r.id === rec.id && !rec.builds) {
    const maxM = Math.max(1, Math.min(...Object.entries(rec.in).map(([id, n]) => Math.floor(craftHave(id) / n))));
    const st = hudStepper(tx, f.y + f.h - 40, CRAFT.mult, { min: 1, max: maxM, size: 30, gap: 30 });
    CRAFT.hits.push({ ...st.minus, fn: () => { craftSelectRecipe(rec, CRAFT.mult - 1); playSound("click"); } }, { ...st.plus, fn: () => { craftSelectRecipe(rec, CRAFT.mult + 1); playSound("click"); } });
    hudText("times", tx + 30 + 30 + 30 + 10, f.y + f.h - 25, 12, { color: HUD_C.inkSoft });
  }
  hudButton(btn.x, btn.y, btn.w, btn.h, CRAFT_MODE_VERB[state.craftingMode] ?? "Craft", { kind: "primary", disabled: !canGo });
  state._craftBtnRect = btn;
  if (canGo) CRAFT.hits.push({ ...btn, fn: () => { attemptManualCraft(); craftClampSelection(); } });
}

/** A scrolling list: draws the visible rows through `drawRow(item, y, w)` and remembers its rect for dragging. */
function craftDrawList(name, rect, items, drawRow, rowH, emptyText) {
  CRAFT.lists[name] = rect;
  const total = items.length * rowH, maxScroll = Math.max(0, total - rect.h);
  CRAFT.scroll[name] = clamp(CRAFT.scroll[name], 0, maxScroll);
  if (!items.length) { hudText(emptyText, rect.x + rect.w / 2, rect.y + rect.h / 2, 19, { family: HUD_HAND, weight: 600, align: "center", color: HUD_C.inkSoft }); return; }
  hudClip(rect, () => {
    items.forEach((it, i) => { const y = rect.y + i * rowH - CRAFT.scroll[name]; if (y + rowH < rect.y || y > rect.y + rect.h) return; drawRow(it, y, rect.w); });
  });
  if (maxScroll > 0) {   // a slim scroll hint on the right edge
    const th = Math.max(28, rect.h * rect.h / total), ty = rect.y + (rect.h - th) * (CRAFT.scroll[name] / maxScroll);
    hudPath(rect.x + rect.w - 4, ty, 3, th, 1.5); ctx.fillStyle = "rgba(54,37,33,0.25)"; ctx.fill();
  }
}
function craftDrawIngredient(st, x, y, w) {
  const def = itemDef(st.id), sel = selectedQty(st.id), h = 48, row = { x, y, w: w - 8, h };
  hudPath(row.x, row.y, row.w, row.h, 14); ctx.fillStyle = sel > 0 ? HUD_C.blushSoft : "rgba(54,37,33,0.05)"; ctx.fill();
  drawCenteredEmoji(def?.icon ?? "❓", x + 26, y + h / 2, 28);
  hudText(hudFit(def?.name ?? st.id, w - 8 - 52 - 112, 14, { weight: 600 }), x + 48, y + 18, 14, { weight: 600 });
  hudText(`have ${st.qty}`, x + 48, y + 35, 11.5, { color: HUD_C.inkSoft });
  const sp = hudStepper(x + w - 8 - 12 - 34 - 34 - 30 - 6, y + 7, sel, { min: 0, max: st.qty, size: 34, gap: 30 });
  const set = (q) => { state.selectedRecipeId = null; setSelectedQty(st.id, clamp(q, 0, st.qty)); playSound("click"); };
  CRAFT.hits.push({ ...sp.minus, fn: () => set(sel - 1), clip: "ing" }, { ...sp.plus, fn: () => set(sel + 1), clip: "ing" }, { x: row.x, y: row.y, w: row.w - 112, h: row.h, fn: () => set(sel > 0 ? 0 : 1), clip: "ing" });
}
function craftDrawRecipe(r, x, y, w) {
  const chk = canCraftRecipe(r), on = state.selectedRecipeId === r.id, h = 56, row = { x, y, w: w - 8, h };
  hudPath(row.x, row.y, row.w, row.h, 14); ctx.fillStyle = on ? HUD_C.blushSoft : "rgba(54,37,33,0.05)"; ctx.fill();
  if (on) { hudPath(row.x + 1, row.y + 1, row.w - 2, row.h - 2, 13); ctx.lineWidth = 2; ctx.strokeStyle = HUD_C.rose; ctx.stroke(); }
  const dim = chk.ok ? 1 : 0.45;
  ctx.save(); ctx.globalAlpha = dim;
  drawCenteredEmoji(recipeIcon(r), x + 28, y + h / 2, 30);
  hudText(hudFit(r.name ?? r.id, w - 8 - 60, 15, { family: HUD_DISPLAY, weight: 600 }), x + 54, y + 20, 15, { family: HUD_DISPLAY, weight: 600 });
  const need = Object.entries(r.in).map(([id, n]) => `${n} ${itemDef(id)?.name ?? id}`).join(" · ") + (r.requiresTools?.length ? ` · tools: ${r.requiresTools.map((t) => itemDef(t)?.name ?? t).join(", ")}` : "");
  hudText(hudFit(chk.ok ? need : `${need}`, w - 8 - 62, 11.5), x + 54, y + 39, 11.5, { color: HUD_C.inkSoft });
  ctx.restore();
  if (!chk.ok) hudText(hudFit(chk.reason, 120, 11, { weight: 600 }), x + w - 8 - 12, y + 20, 11, { color: HUD_C.rose, weight: 600, align: "right" });
  CRAFT.hits.push({ x: row.x, y: row.y, w: row.w, h: row.h, clip: "recipes", fn: () => {
    if (!chk.ok) { playSound("click"); return; }
    if (on) { state.selectedRecipeId = null; state.selectedForCraft.clear(); } else craftSelectRecipe(r, 1);
    playSound("click");
  } });
}

// pointer plumbing: everything acts on release so dragging a list scrolls it instead of tapping a row
function hudCraftDown(px, py) {
  if (!CRAFT.open) return;
  const list = Object.entries(CRAFT.lists).find(([, r]) => hudInRect(px, py, r));
  CRAFT.press = { x: px, y: py, list: list?.[0] || null, start: list ? CRAFT.scroll[list[0]] : 0, moved: false };
}
function hudCraftMove(px, py) {
  const p = CRAFT.press; if (!p) return;
  if (Math.abs(py - p.y) > 8) p.moved = true;
  if (p.moved && p.list) CRAFT.scroll[p.list] = p.start - (py - p.y);   // clamped next frame
}
function hudCraftUp(px, py) {
  const p = CRAFT.press; CRAFT.press = null;
  if (!CRAFT.open || !p || p.moved) return;   // (no press = it began before the sheet opened)
  if (hudInRect(px, py, CRAFT.close) || !hudInRect(px, py, CRAFT.sheet)) { playSound("click"); closeCraftingScreen(); return; }
  for (let i = CRAFT.hits.length - 1; i >= 0; i--) {
    const h = CRAFT.hits[i];
    if (!hudInRect(px, py, h)) continue;
    if (h.clip && !hudInRect(px, py, CRAFT.lists[h.clip])) continue;   // a row half scrolled out of its list can't be tapped there
    h.fn(); return;
  }
}
function hudCraftWheel(dy) { for (const [n, r] of Object.entries(CRAFT.lists)) if (hudInRect(state.pointer?.x ?? 0, state.pointer?.y ?? 0, r)) { CRAFT.scroll[n] += dy; return true; } return false; }
