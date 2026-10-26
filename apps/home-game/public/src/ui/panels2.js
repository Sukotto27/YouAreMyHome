// Panels, part 2: settings, saved places (compass) and the journal, plus a shared drag-scroll helper for simple lists.
// Same paper style and toolkit as panels.js (hudSheetRect / hudSheetDraw / hudButton / ...). Classic script, defines functions only.

// ------------------------------------------------------------------ shared drag-scrolling for simple lists
const SCROLL = { lists: {}, pos: {}, press: null };
/** Register a list's visible rect and total content height; returns the clamped scroll offset in px (and draws a slim scroll hint). */
function hudScrollList(name, rect, contentH) {
  const max = Math.max(0, contentH - rect.h); SCROLL.lists[name] = { rect, max };
  SCROLL.pos[name] = clamp(SCROLL.pos[name] || 0, 0, max);
  if (max > 0) { const th = Math.max(26, rect.h * rect.h / contentH), ty = rect.y + (rect.h - th) * (SCROLL.pos[name] / max); hudPath(rect.x + rect.w - 4, ty, 3, th, 1.5); ctx.fillStyle = "rgba(54,37,33,0.25)"; ctx.fill(); }
  return SCROLL.pos[name];
}
function hudScrollDown(px, py) {
  const e = Object.entries(SCROLL.lists).find(([, l]) => hudInRect(px, py, l.rect));
  SCROLL.press = e ? { name: e[0], y: py, start: SCROLL.pos[e[0]] || 0, moved: false } : null;
}
function hudScrollMove(px, py) {
  const p = SCROLL.press; if (!p) return;
  if (Math.abs(py - p.y) > 8) p.moved = true;
  if (p.moved) SCROLL.pos[p.name] = clamp(p.start - (py - p.y), 0, SCROLL.lists[p.name]?.max ?? 0);
}
/** True when the gesture was a drag-scroll (so the release must not count as a tap). */
function hudScrollUp() { const m = !!SCROLL.press?.moved; SCROLL.press = null; return m; }
function hudScrollWheel(dy) {
  for (const [n, l] of Object.entries(SCROLL.lists)) if (hudInRect(state.pointer?.x ?? 0, state.pointer?.y ?? 0, l.rect)) { SCROLL.pos[n] = clamp((SCROLL.pos[n] || 0) + dy, 0, l.max); return true; }
  return false;
}
/** A row's hit rect, cut to its list's visible area (null when scrolled out). */
function hudClipRows(r, clip) { const y0 = Math.max(r.y, clip.y), y1 = Math.min(r.y + r.h, clip.y + clip.h); return y1 > y0 ? { ...r, y: y0, h: y1 - y0 } : null; }
function hudSegmented(rect, items, current, onHit) {   // a pill with a sliding highlight; returns nothing, calls onHit(id, rect) for the hit list
  const gap = 0, w = rect.w / items.length;
  hudPath(rect.x, rect.y, rect.w, rect.h, rect.h / 2); ctx.fillStyle = HUD_C.paperDeep; ctx.fill();
  items.forEach(([id, label], i) => {
    const on = current === id, rx = rect.x + i * w;
    if (on) { hudPath(rx + 3, rect.y + 3, w - 6, rect.h - 6, (rect.h - 6) / 2); ctx.fillStyle = HUD_C.paper; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(54,37,33,0.14)"; ctx.stroke(); }
    hudText(label, rx + w / 2, rect.y + rect.h / 2 + 0.5, 14, { weight: 700, align: "center", color: on ? HUD_C.ink : HUD_C.inkSoft });
    onHit(id, { x: rx, y: rect.y, w, h: rect.h });
  });
}

// ------------------------------------------------------------------ settings
function hudDrawSettings() {
  if (!state.settingsOpen) return;
  const L = hudSheetRect({ maxW: 520, maxH: 640 }), S = hudSheetDraw(L, "Settings");
  const ui = { panel: { x: L.x, y: L.y, w: L.w, h: L.h }, close: S.close, tabs: {}, sliders: {}, toggles: {} };
  const b = S.body, tabs = { x: b.x, y: b.y - 4, w: b.w, h: 38 };
  hudSegmented(tabs, [["audio", "Audio"], ["controls", "Controls"]], state.settingsTab, (id, r) => { ui.tabs[id] = r; });
  let y = tabs.y + tabs.h + 20;
  if (state.settingsTab === "audio") {
    const slider = (key, label, v) => {
      v = clamp01(v);
      hudText(label, b.x + 4, y + 8, 14, { weight: 600 }); hudText(`${Math.round(v * 100)}%`, b.x + b.w - 4, y + 8, 13, { color: HUD_C.inkSoft, align: "right" });
      const tr = { x: b.x + 10, y: y + 26, w: b.w - 20, h: 8 }; hudBar(tr.x, tr.y, tr.w, tr.h, v, HUD_C.rose);
      const kx = tr.x + tr.w * v; ctx.save(); ctx.shadowColor = "rgba(54,37,33,0.35)"; ctx.shadowBlur = 5; ctx.beginPath(); ctx.arc(kx, tr.y + 4, 10, 0, 7); ctx.fillStyle = HUD_C.paper; ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.arc(kx, tr.y + 4, 10, 0, 7); ctx.lineWidth = 1.6; ctx.strokeStyle = HUD_C.rose; ctx.stroke();
      ui.sliders[key] = { key, track: { x: tr.x, y: tr.y - 14, w: tr.w, h: 36 }, knob: { x: kx - 14, y: tr.y - 10, w: 28, h: 28 } };   // generous touch area; value maps from x / w only
      y += 62;
    };
    slider("master", "Master volume", state.audio?.master ?? 1); slider("sfx", "Sound effects", state.audio?.sfx ?? 1);
    slider("music", "Music", state.music?.volume ?? 0.35); slider("ambient", "Ambient sounds", state.audio?.ambient ?? 1);
    y += 2;
    const toggle = (key, label, on) => {
      const row = { x: b.x, y: y - 6, w: b.w, h: 48 }; hudText(label, b.x + 4, y + 18, 14, { weight: 600 });
      const sw = { x: b.x + b.w - 56, y: y + 4, w: 48, h: 28 };
      hudPath(sw.x, sw.y, sw.w, sw.h, 14); ctx.fillStyle = on ? HUD_C.teal : "rgba(54,37,33,0.18)"; ctx.fill();
      ctx.save(); ctx.shadowColor = "rgba(54,37,33,0.3)"; ctx.shadowBlur = 4; ctx.beginPath(); ctx.arc(on ? sw.x + sw.w - 14 : sw.x + 14, sw.y + 14, 11, 0, 7); ctx.fillStyle = HUD_C.paper; ctx.fill(); ctx.restore();
      ui.toggles[key === "musicEnabled" ? "music" : "ambient"] = { key, box: sw, label: row }; y += 50;
    };
    toggle("musicEnabled", "Music", !!state.music?.enabled); toggle("ambientEnabled", "Ambient sounds", !!state.audio?.ambientEnabled);
  } else {
    const sect = (title, lines) => {
      hudText(title, b.x + 4, y + 8, 15, { family: HUD_DISPLAY, weight: 600, italic: true }); y += 26;
      for (const l of lines) { ctx.beginPath(); ctx.arc(b.x + 10, y + 7, 2.5, 0, 7); ctx.fillStyle = HUD_C.rose; ctx.fill(); hudText(hudFit(l, b.w - 28, 13), b.x + 22, y + 7, 13, { color: HUD_C.inkSoft }); y += 21; }
      y += 12;
    };
    sect("Touch", ["Tap: walk there", "Double tap: use it (pick up, harvest, open)", "Hold: options menu (also for your character)", "Drag: turn the camera", "Pinch: zoom"]);
    sect("Keyboard & mouse", ["W A S D: walk", "Click: walk there · double-click: use it", "Hold click: options menu", "Drag: turn camera · wheel: zoom", "Right-click: quick pick up / harvest", "R rest · E eat · X drop · M saved places", "I backpack · T chat · C craft · Esc close"]);
  }
  state._settingsUI = ui;
}

// ------------------------------------------------------------------ saved places (compass)
function hudDrawCoords() {
  const L = hudSheetRect({ maxW: 480, maxH: 600 }), S = hudSheetDraw(L, "Saved places"), b = S.body, p = activePlayer();
  hudIcon("pin", b.x + 10, b.y + 8, 15, HUD_C.rose, 2); hudText(`You are at ${p.x}, ${p.y}`, b.x + 26, b.y + 9, 13, { color: HUD_C.inkSoft, weight: 600 });
  const btnH = 48, list = { x: b.x, y: b.y + 26, w: b.w, h: b.h - 26 - btnH - 14 };
  const ui = state._coordsUI = { panel: { x: L.x, y: L.y, w: L.w, h: L.h }, close: S.close, list: [], mark: null, travel: null };
  const items = savedPlaces(), rowH = 56, off = hudScrollList("coords", list, items.length * rowH);
  if (items.length <= 1) hudText("Nothing else saved yet. Buildings are saved automatically.", list.x + list.w / 2, list.y + 40, 19, { family: HUD_HAND, weight: 600, align: "center", color: HUD_C.inkSoft });
  hudClip(list, () => items.forEach((m, i) => {
    const key = markerKey(m), r = { key, x: list.x, y: list.y + i * rowH - off, w: list.w - 8, h: rowH - 6 };
    if (r.y + r.h < list.y || r.y > list.y + list.h) return;
    const sel = state.coordsSelected === key;
    hudPath(r.x, r.y, r.w, r.h, 14); ctx.fillStyle = sel ? HUD_C.blushSoft : "rgba(54,37,33,0.05)"; ctx.fill();
    if (sel) { hudPath(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 13); ctx.lineWidth = 2; ctx.strokeStyle = HUD_C.rose; ctx.stroke(); }
    if (m.type === "partner") hudAvatar(m.playerIndex === 0 ? "src/images/scott_thumbnail.jpg" : "src/images/cristina_thumbnail.jpg", r.x + 24, r.y + r.h / 2, 17, { ring: m.playerIndex === 0 ? HUD_C.teal : HUD_C.rose });
    else hudIcon(m.type === "marker" ? "pin" : "bag", r.x + 24, r.y + r.h / 2, 20, sel ? HUD_C.rose : HUD_C.inkSoft, 2);
    hudText(hudFit(m.type === "partner" ? `${m.label} (right now)` : (m.label ?? "Place"), r.w - 130, 15, { family: HUD_DISPLAY, weight: 600 }), r.x + 46, r.y + r.h / 2 - 8, 15, { family: HUD_DISPLAY, weight: 600 });
    hudText(`${m.x}, ${m.y}`, r.x + 46, r.y + r.h / 2 + 11, 12, { color: HUD_C.inkSoft });
    const d = Math.abs(m.x - p.x) + Math.abs(m.y - p.y); hudText(d === 0 ? "here" : `${d} tiles`, r.x + r.w - 14, r.y + r.h / 2, 12, { color: HUD_C.inkSoft, align: "right" });
    const hit = hudClipRows(r, list); if (hit) ui.list.push(hit);
  }));
  const by = b.y + b.h - btnH, can = !!state.coordsSelected && savedPlaces().some((m) => markerKey(m) === state.coordsSelected), half = (b.w - 10) / 2;
  ui.mark = hudButton(b.x, by, half, btnH, "Mark this spot", { kind: "plain" });
  ui.travel = hudButton(b.x + half + 10, by, half, btnH, "Travel there", { kind: "primary", disabled: !can });
}

// ------------------------------------------------------------------ journal (collectibles + love letters)
function hudDrawCollectibles() {
  let ids = allCollectibleIds();
  if (state?.data?.items?.love_letter && !ids.includes("love_letter")) ids.push("love_letter");
  const f = state.collectiblesFilter || "all"; if (f === "love") ids = ids.filter(isLoveLetterId);
  const found = state.collectiblesFound || {};
  const L = hudSheetRect({ maxW: 560, maxH: 640 }), S = hudSheetDraw(L, "Journal"), b = S.body;
  const ui = state._collectiblesUI = { x: L.x, y: L.y, w: L.w, h: L.h, close: S.close, tabList: null, tabRead: null, rows: [], backBtn: null, prevBtn: null, nextBtn: null };

  if (state.collectiblesView === "reader" && state.collectiblesSelected) {
    const id = state.collectiblesSelected, it = itemDef(id);
    ui.backBtn = hudButton(b.x, b.y - 2, 92, 38, "‹  Back", { kind: "plain", size: 14 });
    const card = { x: b.x, y: b.y + 46, w: b.w, h: b.h - 46 };
    hudPath(card.x, card.y, card.w, card.h, 18); ctx.fillStyle = HUD_C.paperDeep; ctx.fill();
    if (!it) { hudText("Nothing selected.", card.x + 20, card.y + 30, 16, { family: HUD_DISPLAY }); return; }
    hudText(hudFit(it.name ?? id, card.w - 40, 20, { family: HUD_DISPLAY, weight: 600, italic: true }), card.x + 20, card.y + 30, 20, { family: HUD_DISPLAY, weight: 600, italic: true });
    const msg = typeof it.message === "string" && it.message.trim() ? it.message : "(This item has no message.)";
    const lines = [];
    for (const para of msg.split(/\n+/)) lines.push(...hudWrap(para, card.w - 44, 22, { family: HUD_HAND, weight: 600 }), "");
    const area = { x: card.x, y: card.y + 54, w: card.w, h: card.h - 54 - 34 }, off = hudScrollList("journal", area, lines.length * 27 + 20);
    hudClip(area, () => lines.forEach((l, i) => hudText(l, card.x + 22, area.y + 14 + i * 27 - off, 22, { family: HUD_HAND, weight: 600 })));
    const rec = found[id]; if (rec?.by) hudText(hudFit(`Found by ${Object.entries(rec.by).map(([n, c]) => `${n} (${c})`).join(", ")}`, card.w - 40, 12), card.x + 20, card.y + card.h - 18, 12, { color: HUD_C.inkSoft });
    return;
  }
  hudSegmented({ x: b.x, y: b.y - 4, w: b.w, h: 38 }, [["all", "Collectibles"], ["love", "Love letters"]], f, (id, r) => { if (id === "all") ui.tabList = r; else ui.tabRead = r; });
  const n = ids.filter((id) => found[id]).length;
  hudBar(b.x, b.y + 50, b.w - 64, 7, ids.length ? n / ids.length : 0, HUD_C.rose); hudText(`${n} of ${ids.length}`, b.x + b.w, b.y + 54, 12, { color: HUD_C.inkSoft, align: "right", weight: 600 });
  ids.sort((a, c) => (itemDef(a)?.name ?? a).localeCompare(itemDef(c)?.name ?? c));
  const list = { x: b.x, y: b.y + 70, w: b.w, h: b.h - 70 }, rowH = 54, off = hudScrollList("journal", list, ids.length * rowH);
  if (!ids.length) hudText("Nothing to collect here yet.", list.x + list.w / 2, list.y + 40, 19, { family: HUD_HAND, weight: 600, align: "center", color: HUD_C.inkSoft });
  hudClip(list, () => ids.forEach((id, i) => {
    const it = itemDef(id), got = !!found[id], r = { id, x: list.x, y: list.y + i * rowH - off, w: list.w - 8, h: rowH - 6 };
    if (r.y + r.h < list.y || r.y > list.y + list.h) return;
    hudPath(r.x, r.y, r.w, r.h, 14); ctx.fillStyle = got ? HUD_C.blushSoft : "rgba(54,37,33,0.05)"; ctx.fill();
    if (got) drawCenteredEmoji(it?.icon ?? "📜", r.x + 26, r.y + r.h / 2, 26); else hudText("?", r.x + 26, r.y + r.h / 2 + 1, 20, { family: HUD_DISPLAY, weight: 600, align: "center", color: "rgba(54,37,33,0.3)" });
    const by = got && found[id]?.by ? Object.keys(found[id].by).join(", ") : "";
    hudText(got ? hudFit(it?.name ?? id, r.w - 150, 15, { family: HUD_DISPLAY, weight: 600 }) : "Not found yet", r.x + 52, r.y + r.h / 2 - (by ? 6 : 0), 15, { family: HUD_DISPLAY, weight: 600, color: got ? HUD_C.ink : HUD_C.inkSoft });
    if (by) hudText(hudFit(`found by ${by}`, r.w - 70, 11.5), r.x + 52, r.y + r.h / 2 + 12, 11.5, { color: HUD_C.inkSoft });
    if (got) hudText("›", r.x + r.w - 16, r.y + r.h / 2, 22, { color: HUD_C.inkSoft, align: "right" });
    const hit = got && hudClipRows(r, list); if (hit) ui.rows.push({ ...hit, id });
  }));
}
