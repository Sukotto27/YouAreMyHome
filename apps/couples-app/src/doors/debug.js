// The F1 debug overlay: a plain-text panel over the game. Later milestones add
// door states, linked groups, trap timers and line lifetime as extra sections
// — each caller just contributes lines of text.
export function createDebugOverlay(container) {
  const el = document.createElement('pre')
  el.style.cssText =
    'position:absolute;left:8px;bottom:8px;margin:0;padding:8px 10px;max-width:92%;overflow:hidden;' +
    'font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#d1fae5;background:rgba(0,0,0,0.72);' +
    'border:1px solid rgba(255,255,255,0.15);border-radius:6px;pointer-events:none;display:none;z-index:5;white-space:pre'
  container.appendChild(el)

  let visible = false
  let lastText = ''

  return {
    get visible() {
      return visible
    },
    toggle() {
      visible = !visible
      el.style.display = visible ? 'block' : 'none'
    },
    update(text) {
      if (!visible || text === lastText) return
      lastText = text
      el.textContent = text
    },
    dispose() {
      el.remove()
    },
  }
}
