// Panels, part 3: the smaller dialogs — interaction request (hug / kiss / hold hands / trade), treasure map, runestone reader and the
// stockpile. Same paper style and toolkit as panels.js / panels2.js. Classic script, defines functions only.

// ------------------------------------------------------------------ interaction request (the other player asks for something)
const HUD_ASKS = { "Hold hands": "hold your hand", Kiss: "give you a kiss", Hug: "give you a hug", Trade: "trade with you" };
function hudDrawInteraction() {
  const req = state.interactionRequest; if (!req || state.activePlayer !== req.toIndex) return;
  const from = state.players[req.fromIndex], W = window.innerWidth, w = Math.min(380, W - 20), h = 214, x = (W - w) / 2, y = Math.max(70, window.innerHeight * 0.2);
  ctx.fillStyle = "rgba(54,37,33,0.4)"; ctx.fillRect(0, 0, W, window.innerHeight);
  hudPanel(x, y, w, h, { r: 24, blur: 28 });
  const av = req.fromIndex === 0 ? "src/images/scott_thumbnail.jpg" : "src/images/cristina_thumbnail.jpg";
  hudAvatar(av, x + w / 2, y + 12, 30, { ring: req.fromIndex === 0 ? HUD_C.teal : HUD_C.rose });
  hudText(from.name, x + w / 2, y + 56, 20, { family: HUD_DISPLAY, weight: 600, italic: true, align: "center" });
  hudText(`would like to ${HUD_ASKS[req.type] ?? req.type.toLowerCase()}`, x + w / 2, y + 84, 15, { align: "center", color: HUD_C.inkSoft });
  hudIcon("heart", x + w / 2, y + 112, 16, HUD_C.rose);
  const bw = (w - 48 - 12) / 2, by = y + h - 70, bh = 48;
  req._ui = { accept: hudButton(x + 24, by, bw, bh, "Yes please", { kind: "primary" }), decline: hudButton(x + 24 + bw + 12, by, bw, bh, "Not now", { kind: "plain" }) };
}

// ------------------------------------------------------------------ treasure map
function hudDrawTreasure() {
  const t = state.treasureTarget, L = hudSheetRect({ maxW: 400, maxH: 300 }), h = 250, r = { ...L, h, y: (window.innerHeight - h) / 2 };
  const S = hudSheetDraw(r, "Treasure map"), b = S.body;
  hudText("X marks the spot", b.x + b.w / 2, b.y + 24, 26, { family: HUD_HAND, weight: 700, align: "center", color: HUD_C.rose });
  hudText(t ? `${t.x}, ${t.y}` : "?, ?", b.x + b.w / 2, b.y + 66, 34, { family: HUD_DISPLAY, weight: 600, align: "center" });
  if (t?.by) hudText(`found by ${t.by}`, b.x + b.w / 2, b.y + 98, 13, { align: "center", color: HUD_C.inkSoft });
  hudText("Bring a shovel and dig.", b.x + b.w / 2, b.y + 128, 13, { align: "center", color: HUD_C.inkSoft });
  state._treasureUI = { close: S.close, panel: { x: r.x, y: r.y, w: r.w, h: r.h } };
}

// ------------------------------------------------------------------ runestone reader (an inscription on old stone)
function hudDrawRunestone() {
  const rs = state.runestoneReader; if (!rs?.open) return;
  const L = hudSheetRect({ maxW: 460, maxH: 420 }), S = hudSheetDraw(L, rs.title || "Runestone"), b = S.body;
  hudPath(b.x, b.y, b.w, b.h, 18); ctx.fillStyle = HUD_C.paperDeep; ctx.fill();
  const lines = hudWrap(rs.text || "", b.w - 44, 24, { family: HUD_HAND, weight: 600 }), lh = 30, area = { x: b.x, y: b.y + 8, w: b.w, h: b.h - 16 };
  const off = hudScrollList("rune", area, lines.length * lh + 24);
  hudClip(area, () => lines.forEach((l, i) => hudText(l, b.x + b.w / 2, area.y + 26 + i * lh - off, 24, { family: HUD_HAND, weight: 600, align: "center" })));
  state._runestoneUI = { panel: { x: L.x, y: L.y, w: L.w, h: L.h }, closeBtn: S.close };
}

// ------------------------------------------------------------------ stockpile (store / retrieve whole stacks)
function hudDrawStockpile() {
  const key = state.stockpileOpen?.key, sp = key ? getStockpileByKey(key) : null;
  if (!sp) { state.stockpileOpen = null; return; }
  const title = sp.title || "Stockpile", L = hudSheetRect({ maxW: 720, maxH: 600 }), S = hudSheetDraw(L, title), b = S.body, wide = L.w >= 640;
  const ui = state._stockUI = { close: S.close, panel: { x: L.x, y: L.y, w: L.w, h: L.h }, left: [], right: [] };
  if (!sp.furniture) hudText(`at ${sp.x}, ${sp.y}`, L.x + 20 + 108, L.y + 31, 12, { color: HUD_C.inkSoft });
  const pInv = activeInv() || [], sInv = sp.inv || [];
  if (!state._stockTab) state._stockTab = "mine";
  let cols;
  if (wide) { const cw = (b.w - 14) / 2; cols = [["mine", { x: b.x, y: b.y + 26, w: cw, h: b.h - 26 }, pInv, ui.left], ["pile", { x: b.x + cw + 14, y: b.y + 26, w: cw, h: b.h - 26 }, sInv, ui.right]]; hudText("Your backpack", b.x + 2, b.y + 8, 13, { weight: 700, color: HUD_C.inkSoft }); hudText(`${title} (${sInv.length}/${sp.cap || INV_SLOTS})`, b.x + cw + 16, b.y + 8, 13, { weight: 700, color: HUD_C.inkSoft }); }
  else {
    hudSegmented({ x: b.x, y: b.y - 4, w: b.w, h: 38 }, [["mine", `Backpack (${pInv.length})`], ["pile", `${title} (${sInv.length}/${sp.cap || INV_SLOTS})`]], state._stockTab, (id, r) => { ui["_tab_" + id] = r; });
    const list = { x: b.x, y: b.y + 46, w: b.w, h: b.h - 46 }; cols = [[state._stockTab, list, state._stockTab === "mine" ? pInv : sInv, state._stockTab === "mine" ? ui.left : ui.right]];
  }
  for (const [name, rect, inv, hits] of cols) {
    const rowH = 54, off = hudScrollList("stock_" + name, rect, inv.length * rowH), mine = name === "mine";
    if (!inv.length) hudText(mine ? "Your backpack is empty." : "Nothing in here yet.", rect.x + rect.w / 2, rect.y + 36, 19, { family: HUD_HAND, weight: 600, align: "center", color: HUD_C.inkSoft });
    hudClip(rect, () => inv.forEach((st, i) => {
      const def = itemDef(st.id), r = { i, x: rect.x, y: rect.y + i * rowH - off, w: rect.w - 8, h: rowH - 6 };
      if (r.y + r.h < rect.y || r.y > rect.y + rect.h) return;
      hudPath(r.x, r.y, r.w, r.h, 14); ctx.fillStyle = "rgba(54,37,33,0.05)"; ctx.fill();
      drawCenteredEmoji(def?.icon ?? "❓", r.x + 26, r.y + r.h / 2, 28);
      hudText(hudFit(def?.name ?? st.id, r.w - 150, 15, { weight: 600 }), r.x + 52, r.y + r.h / 2 - 6, 15, { weight: 600 });
      hudText(`× ${st.qty}`, r.x + 52, r.y + r.h / 2 + 12, 12, { color: HUD_C.inkSoft });
      hudText(mine ? "Store all ›" : "‹ Take all", r.x + r.w - 14, r.y + r.h / 2, 12, { weight: 700, color: HUD_C.rose, align: "right" });
      const hit = hudClipRows(r, rect); if (hit) hits.push(hit);
    }));
  }
}

// ------------------------------------------------------------------ trade (two people swap items; drag a stack, or just tap it)
function hudSlotBox(x, y, size, stack, o = {}) {
  hudPath(x, y, size, size, Math.max(7, size * 0.2)); ctx.fillStyle = o.fill || "rgba(54,37,33,0.06)"; ctx.fill();
  ctx.lineWidth = o.ring ? 2 : 1; ctx.strokeStyle = o.ring || "rgba(54,37,33,0.12)"; hudPath(x, y, size, size, Math.max(7, size * 0.2)); ctx.stroke();
  if (!stack) { if (o.plus) hudText("+", x + size / 2, y + size / 2 + 1, size * 0.5, { color: "rgba(54,37,33,0.22)", align: "center", weight: 500 }); return; }
  ctx.save(); if (o.dim) ctx.globalAlpha = 0.45;
  drawCenteredEmoji(itemDef(stack.id)?.icon ?? "❓", x + size / 2, y + size / 2 - (stack.qty > 1 ? 1 : 0), Math.round(size * 0.58));
  if (stack.qty > 1) {
    const fs = size > 40 ? 11 : 10; ctx.font = `700 ${fs}px ${HUD_BODY}`; const tw = ctx.measureText(String(stack.qty)).width + 8, bh = fs + 4;
    hudPath(x + size - tw - 2, y + size - bh - 2, tw, bh, bh / 2); ctx.fillStyle = HUD_C.ink; ctx.fill(); hudText(String(stack.qty), x + size - tw / 2 - 2, y + size - bh / 2 - 1.5, fs, { weight: 700, color: HUD_C.paper, align: "center" });
  }
  ctx.restore();
}
function hudDrawTrade() {
  const t = state.trade; if (!t?.open) return;
  const ap = state.activePlayer, me = ap === t.p0idx ? "0" : "1", otherIdx = ap === t.p0idx ? t.p1idx : t.p0idx, other = state.players[otherIdx];
  const myOffer = ap === t.p0idx ? t.p0offer : t.p1offer, theirOffer = ap === t.p0idx ? t.p1offer : t.p0offer, myConf = ap === t.p0idx ? t.confirm0 : t.confirm1, theirConf = ap === t.p0idx ? t.confirm1 : t.confirm0;
  const L = hudSheetRect({ maxW: 560, maxH: 700 }), S = hudSheetDraw(L, `Trade with ${other.name}`), b = S.body, ui = {};
  const oc = Math.min(54, Math.floor((b.w - (TRADE_OFFER_SLOTS - 1) * 6) / TRADE_OFFER_SLOTS)), og = 6;
  let y = b.y - 2;
  // their offer (read only)
  hudText(`${other.name} offers`, b.x + 2, y + 8, 13, { weight: 700, color: HUD_C.inkSoft });
  if (theirConf) { hudPath(b.x + b.w - 78, y - 3, 78, 22, 11); ctx.fillStyle = HUD_C.teal; ctx.fill(); hudText("✓ ready", b.x + b.w - 39, y + 8.5, 12, { weight: 700, color: HUD_C.paper, align: "center" }); }
  y += 20;
  for (let i = 0; i < TRADE_OFFER_SLOTS; i++) hudSlotBox(b.x + i * (oc + og), y, oc, theirOffer[i] ?? null, { fill: "rgba(54,37,33,0.04)" });
  y += oc + 16;
  // my offer (drop targets)
  hudText("You offer", b.x + 2, y + 8, 13, { weight: 700, color: HUD_C.inkSoft }); y += 20;
  const offerSlots = [], draggingOffer = t.drag?.srcKind === "offer" && t.drag?.srcPlayer === ap ? t.drag.srcSlot : -1;
  for (let i = 0; i < TRADE_OFFER_SLOTS; i++) {
    const sx = b.x + i * (oc + og); hudSlotBox(sx, y, oc, i === draggingOffer ? null : (myOffer[i] ?? null), { plus: true, ring: myConf ? HUD_C.teal : null, fill: "rgba(226,125,122,0.10)" });
    offerSlots.push({ x: sx, y, w: oc, h: oc, i, playerIdx: ap });
  }
  y += oc + 12;
  const bw = b.w, bh = 46; ui["p" + me + "confirm"] = { ...hudButton(b.x, y, bw, bh, myConf ? "✓  Ready — tap to undo" : "Confirm trade", { kind: myConf ? "plain" : "primary", disabled: false }), playerIdx: ap };
  y += bh + 16;
  // my backpack
  hudText("Your backpack · tap or drag items up", b.x + 2, y + 8, 13, { weight: 700, color: HUD_C.inkSoft }); y += 20;
  const inv = state.inventories[ap] || [], cols = hudInvCols(), gap = 4, cell = Math.min(48, Math.floor((b.w - (cols - 1) * gap) / cols)), invSlots = [], dragSlot = t.drag?.srcKind === "inv" && t.drag?.srcPlayer === ap ? t.drag.srcSlot : -1;
  const gx = b.x + (b.w - (cols * cell + (cols - 1) * gap)) / 2;
  for (let i = 0; i < INV_SLOTS; i++) {
    const sx = gx + (i % cols) * (cell + gap), sy = y + Math.floor(i / cols) * (cell + gap);
    hudSlotBox(sx, sy, cell, i === dragSlot ? null : (inv[i] ?? null), { ring: i === dragSlot ? HUD_C.gold : null });
    invSlots.push({ x: sx, y: sy, w: cell, h: cell, i, playerIdx: ap });
  }
  y += Math.ceil(INV_SLOTS / cols) * (cell + gap) + 6;
  ui["p" + me + "inv"] = invSlots; ui["p" + me + "offer"] = offerSlots; ui["p" + (me === "0" ? "1" : "0") + "inv"] = []; ui["p" + (me === "0" ? "1" : "0") + "offer"] = []; ui["p" + (me === "0" ? "1" : "0") + "confirm"] = null;
  const cb = { x: b.x, y: Math.min(y, b.y + b.h - 40), w: b.w, h: 40 };
  ui.cancel = hudButton(cb.x, cb.y, cb.w, cb.h, "Cancel trade", { kind: "ghost", size: 14 });
  ui.panel = { x: L.x, y: L.y, w: L.w, h: L.h }; ui.close = S.close;
  // the stack being dragged follows the finger
  if (t.drag) { const d = t.drag; ctx.save(); ctx.shadowColor = "rgba(54,37,33,0.4)"; ctx.shadowBlur = 10; drawCenteredEmoji(itemDef(d.item.id)?.icon ?? "❓", d.x, d.y - 4, 30); ctx.restore(); if (d.item.qty > 1) hudText(`×${d.item.qty}`, d.x, d.y + 20, 12, { weight: 700, align: "center" }); }
  t._ui = ui;
}

// ------------------------------------------------------------------ rune combination lock (dungeon chests)
function hudDrawComboLock() {
  const cl = state.comboLock; if (!cl?.open) return;
  const L = hudSheetRect({ maxW: 440, maxH: 360 }), h = 330, r = { ...L, h, y: (window.innerHeight - h) / 2 }, S = hudSheetDraw(r, "Runic lock"), b = S.body;
  hudText("Tap a rune to turn it", b.x + b.w / 2, b.y + 8, 15, { family: HUD_HAND, weight: 600, align: "center", color: HUD_C.inkSoft });
  const n = RUNE_COMBO_LEN, gap = 10, slotW = Math.min(88, Math.floor((b.w - gap * (n - 1)) / n)), slotH = Math.round(slotW * 1.25), startX = b.x + (b.w - (slotW * n + gap * (n - 1))) / 2, slotY = b.y + 30, digitRects = [];
  for (let i = 0; i < n; i++) {
    const rc = { x: startX + i * (slotW + gap), y: slotY, w: slotW, h: slotH }; digitRects.push(rc);
    hudPath(rc.x, rc.y, rc.w, rc.h, 16); ctx.fillStyle = HUD_C.paperDeep; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(54,37,33,0.14)"; ctx.stroke();
    const img = getRuneImg(cl.digits[i]), s = slotW * 0.72;
    try { ctx.drawImage(img, rc.x + (rc.w - s) / 2, rc.y + 10, s, s); } catch (_) {}
    hudText(String(i + 1), rc.x + rc.w / 2, rc.y + rc.h - 14, 12, { color: HUD_C.inkSoft, align: "center", weight: 600 });
  }
  const unlockBtn = hudButton(b.x, b.y + b.h - 52, b.w, 48, "Unlock", { kind: "primary" });
  hudText(`Attempts: ${cl.tries ?? 0}`, b.x + b.w / 2, slotY + slotH + 22, 12, { color: HUD_C.inkSoft, align: "center" });
  state._comboLockUI = { panel: { x: r.x, y: r.y, w: r.w, h: r.h }, closeBtn: S.close, digitRects, unlockBtn };
}

// ------------------------------------------------------------------ riddle lock (dungeon chests that want a one-word answer)
function hudEnsureRiddleInput() {
  let el = document.getElementById("riddleInput");
  if (el) return el;
  el = document.createElement("input");
  el.id = "riddleInput"; el.type = "text"; el.autocomplete = "off"; el.autocapitalize = "none"; el.spellcheck = false; el.maxLength = 24; el.placeholder = "Your answer…";
  Object.assign(el.style, { position: "absolute", zIndex: "40", display: "none", textAlign: "center" });
  el.addEventListener("keydown", (e) => {
    e.stopPropagation();                         // typing must not walk the character
    if (e.key === "Enter") { e.preventDefault(); submitRiddleAnswer(el.value); el.select(); }
    else if (e.key === "Escape") { e.preventDefault(); closeRiddleLock(); }
  });
  el.addEventListener("keyup", (e) => e.stopPropagation());
  document.body.appendChild(el);
  return el;
}
function hudDrawRiddleLock() {
  const rl = state.riddleLock, el = hudEnsureRiddleInput();
  if (!rl?.open) { el.style.display = "none"; return; }
  // anchored near the top so a phone keyboard never covers the answer field
  const L = hudSheetRect({ maxW: 440, maxH: 300 }), h = 268, r = { ...L, h, y: Math.max(12 + HUD.safe.t, Math.min(L.y, window.innerHeight * 0.14)) };
  const S = hudSheetDraw(r, "Locked chest"), b = S.body, now = performance.now(), shake = rl.flash && now - rl.flash < 380 ? Math.sin((now - rl.flash) / 38) * 6 * (1 - (now - rl.flash) / 380) : 0;
  hudText("Speak the answer to the stone's riddle.", b.x + b.w / 2, b.y + 14, 15, { family: HUD_HAND, weight: 600, align: "center", color: HUD_C.inkSoft });
  hudText("One word.", b.x + b.w / 2, b.y + 36, 13, { align: "center", color: HUD_C.inkSoft });
  // the real <input> sits over this well
  const well = { x: b.x + 10 + shake, y: b.y + 58, w: b.w - 20, h: 50 };
  hudPath(well.x, well.y, well.w, well.h, 25); ctx.fillStyle = HUD_C.paperDeep; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = rl.flash && now - rl.flash < 380 ? HUD_C.rose : "rgba(54,37,33,0.16)"; ctx.stroke();
  const s = el.style; s.display = "block"; s.left = `${well.x + 8}px`; s.top = `${well.y + 7}px`; s.width = `${well.w - 16}px`; s.height = `${well.h - 14}px`; s.boxSizing = "border-box";
  s.border = "none"; s.background = "transparent"; s.outline = "none"; s.color = HUD_C.ink; s.font = `600 20px ${HUD_DISPLAY}`; s.lineHeight = "normal";
  if (rl.note) hudText(rl.note, b.x + b.w / 2, well.y + well.h + 18, 13, { weight: 600, align: "center", color: HUD_C.rose });
  hudText(`Attempts: ${rl.tries ?? 0}`, b.x + 4, b.y + b.h - 70, 11, { color: HUD_C.inkSoft });
  const unlockBtn = hudButton(b.x, b.y + b.h - 54, b.w, 48, "Try it", { kind: "primary" });
  state._riddleLockUI = { panel: { x: r.x, y: r.y, w: r.w, h: r.h }, closeBtn: S.close, unlockBtn, well };
}
