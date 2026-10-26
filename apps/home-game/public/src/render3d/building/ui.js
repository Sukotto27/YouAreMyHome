// The builder's on-screen controls: a plain DOM panel over the world (touch-sized buttons), driven by the builder's state.
import { TEXTURES, CHOICES, TINTS, ROLE_LABELS } from "./paint.js";
import { furnitureDefs, furnitureCategories, furnitureCostText } from "../furniture.js";

const CSS = `
#build-ui{position:fixed;left:8px;right:8px;bottom:66px;z-index:30;font:500 13px/1.2 "Figtree","Segoe UI",system-ui,sans-serif;color:#362521;display:none;pointer-events:none;flex-direction:column;justify-content:flex-end;max-width:560px;margin:0 auto}
#build-ui .panel{pointer-events:auto;background:rgba(251,242,233,.95);border:1px solid rgba(54,37,33,.14);border-radius:16px;padding:6px 8px;margin-top:4px;box-shadow:0 4px 16px rgba(54,37,33,.25)}
#build-ui .row{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
#build-ui .scroll{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
#build-ui .scroll::-webkit-scrollbar{display:none}
#build-ui .scroll>*{flex:0 0 auto}
#build-ui .row+.row{margin-top:5px}
#build-ui button{min-height:34px;min-width:36px;padding:3px 11px;border-radius:17px;border:1px solid rgba(54,37,33,.16);background:#f3e6d8;color:#362521;font:inherit;font-weight:600;cursor:pointer;white-space:nowrap}
#build-ui button:hover{background:#fbdad7}
#build-ui button.on{background:#e27d7a;color:#fbf2e9;border-color:#e27d7a}
#build-ui button.ok{background:#6fb8b5;color:#fff;border-color:#6fb8b5}
#build-ui button.ok[disabled]{opacity:.4;background:#f3e6d8;color:#6b5850;border-color:rgba(54,37,33,.16)}
#build-ui button.no{background:transparent;color:#6b5850}
#build-ui .msg{flex:1;min-width:120px;color:#362521;font-family:"Fraunces",Georgia,serif;font-style:italic;font-size:13.5px}
#build-ui .msg.bad{color:#c2554f}
#build-ui .sw{width:26px;height:26px;min-width:26px;min-height:26px;padding:0;border-radius:50%}
#build-ui .sw.on{outline:3px solid #e27d7a}
#build-ui .tx{width:44px;height:44px;min-width:44px;min-height:44px;padding:0;background-size:cover;background-position:center;position:relative;border-radius:11px;overflow:hidden}
#build-ui .tx span{position:absolute;left:0;right:0;bottom:0;font-size:9px;background:rgba(54,37,33,.62);color:#fbf2e9;padding:1px 2px}
#build-ui .tx.on{outline:3px solid #e27d7a}
#build-ui .items{display:flex;flex-wrap:wrap;gap:5px;max-height:15vh;overflow-y:auto;margin-top:5px}
#build-ui .items button{min-height:30px;padding:2px 9px;font-size:12px}
#build-ui .label{color:#6b5850;font-size:11.5px;font-weight:600;margin-right:2px}
#build-ui .cost{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
#build-ui .chip{background:#f3e6d8;border:1px solid rgba(54,37,33,.12);border-radius:12px;padding:2px 8px;font-weight:600;font-size:12px}
#build-ui .chip.short{border-color:#e27d7a;color:#c2554f}
`;
const TOOLS = [["room", "🏠 Room"], ["door", "🚪 Door"], ["window", "🪟 Window"], ["arch", "⛩ Arch"], ["roof", "🛖 Roof"], ["paint", "🎨 Paint"], ["furnish", "🛋 Furnish"], ["remove", "🗑 Remove"]];
const STYLES = [["lean", "Lean-to"], ["gable", "A-frame"], ["hip", "Hip"]];
const hex = (n) => "#" + n.toString(16).padStart(6, "0");

export function createBuilderUI(builder) {
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  const el = document.createElement("div"); el.id = "build-ui"; document.body.appendChild(el);
  let paintRole = "wall", collapsed = false;
  addEventListener("keydown", (e) => { if (e.key === "Escape" && builder.active) { e.preventDefault(); builder.cancel(); } });   // steps back: ghost -> selection -> tool -> closes the builder
  const mk = (tag, cls, text, on) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; if (on) e.onclick = on; return e; };
  const panel = (cls = "") => { const p = mk("div", "panel"), row = mk("div", "row " + cls); p.appendChild(row); el.appendChild(p); return row; };
  const rowIn = (row, cls = "") => { const r = mk("div", "row " + cls); row.parentElement.appendChild(r); return r; };   // another line inside the same panel

  function render() {
    el.textContent = "";
    el.style.display = builder.active ? "flex" : "none";
    if (!builder.active) return;
    // tools
    const tools = panel("scroll");
    if (!collapsed) for (const [m, label] of TOOLS) tools.appendChild(mk("button", builder.mode === m ? "on" : "", label, () => builder.setMode(builder.mode === m ? null : m)));
    tools.prepend(mk("button", "ok", "✓ Finish", () => builder.close()));
    tools.appendChild(mk("button", "no", collapsed ? "▴ Tools" : "▾", () => { collapsed = !collapsed; render(); }));
    // context
    const ctx = panel();
    const bad = !builder.valid && builder.ghost;
    ctx.appendChild(mk("div", "msg" + (bad ? " bad" : ""), builder.msg));
    const c = builder.cost;
    if (c && Object.keys(c.items).length) {
      const box = mk("div", "cost");
      box.appendChild(mk("span", "label", "Cost"));
      for (const k of Object.keys(c.items)) box.appendChild(mk("span", "chip" + (c.have[k] >= c.items[k] ? "" : " short"), `${c.items[k]} ${k}` + (Number.isFinite(c.have[k]) ? ` (you have ${c.have[k]})` : "")));
      ctx.appendChild(box);
    } else if (builder.ghost || builder.target) ctx.appendChild(mk("div", "cost", "Free"));
    if (builder.mode === "roof") {
      ctx.appendChild(mk("span", "label", "Style"));
      for (const [id, label] of STYLES) ctx.appendChild(mk("button", builder.roofStyle === id ? "on" : "", label, () => builder.setRoofStyle(id)));
      ctx.appendChild(mk("button", "", "⟲ Rotate", () => builder.rotate()));
    }
    if (builder.mode === "furnish" && (builder.furnGhost || builder.target?.type === "furniture")) ctx.appendChild(mk("button", "", "⟲ Rotate", () => builder.rotate()));
    if (builder.ghost || builder.target || builder.furnGhost) {
      const ok = mk("button", "ok", "✓ " + (builder.mode === "remove" ? "Remove" : builder.mode === "furnish" ? (builder.furnGhost ? "Place" : "Pick up") : builder.ghost ? "Build" : "Place"), () => builder.confirm());
      ok.disabled = !builder.canConfirm; ctx.appendChild(ok);
      ctx.appendChild(mk("button", "no", "✗", () => builder.cancel()));
    }
    // furnish: pick a category, then a piece (one slim panel: a scrolling row of categories, then the pieces)
    if (builder.mode === "furnish" && !collapsed) {
      const open = (d) => typeof furnitureUnlocked !== "function" || furnitureUnlocked(d.id), have = furnitureDefs().filter(open);
      const cats = furnitureCategories().filter((c) => have.some((d) => d.cat === c)), cat = cats.includes(builder.furn.cat) ? builder.furn.cat : cats[0];
      const catRow = panel("scroll"); for (const c of cats) catRow.appendChild(mk("button", c === cat ? "on" : "", c, () => builder.setFurnCat(c)));
      const list = mk("div", "items"); catRow.parentElement.appendChild(list);
      for (const d of have.filter((x) => x.cat === cat)) list.appendChild(mk("button", builder.furn.item === d.id ? "on" : "", `${d.icon} ${d.name}`, () => builder.setFurnItem(d.id)));
      const sel = furnitureDefs().find((d) => d.id === builder.furn.item);
      const note = sel ? `${sel.name}: ${furnitureCostText(sel)}` : typeof furnitureUnlockCount === "function" ? `${furnitureUnlockCount().have} of ${furnitureUnlockCount().total} pieces unlocked` : "";
      if (note) catRow.parentElement.appendChild(mk("div", "label", note));
    }
    // paint: one panel, three scrolling lines (what, texture, colour)
    if (builder.mode === "paint" && builder.selected() && !collapsed) {
      const s = builder.selected(), cur = s.paint?.[paintRole] || {};
      const roles = panel("scroll");
      for (const r of Object.keys(ROLE_LABELS)) roles.appendChild(mk("button", paintRole === r ? "on" : "", ROLE_LABELS[r], () => { paintRole = r; render(); }));
      const tex = rowIn(roles, "scroll");
      tex.appendChild(mk("button", !cur.tex ? "on" : "", "Original", () => builder.setPaint(paintRole, { tex: null })));
      for (const key of CHOICES[paintRole]) {
        const b = mk("button", "tx" + (cur.tex === key ? " on" : ""), undefined, () => builder.setPaint(paintRole, { tex: key }));
        b.style.backgroundImage = `url("${TEXTURES[key].url}")`; b.title = TEXTURES[key].label; b.appendChild(mk("span", "", TEXTURES[key].label)); tex.appendChild(b);
      }
      const col = rowIn(roles, "scroll");
      for (const t of TINTS) {
        const b = mk("button", "sw" + (((cur.tint ?? null) === t.tint) ? " on" : ""), t.tint == null ? "∅" : "", () => builder.setPaint(paintRole, { tint: t.tint }));
        if (t.tint != null) b.style.background = hex(t.tint); b.title = t.label; col.appendChild(b);
      }
    }
  }
  builder.onChange(render);
  el.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
  render();
  return { render };
}
