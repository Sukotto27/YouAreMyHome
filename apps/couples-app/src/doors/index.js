// Doors — a 2-player co-op platformer. This is the bootstrap: it owns the
// canvases, the fixed-timestep loop and the two split-screen panes, and wires
// the engine, input, renderers and debug overlay together. Everything it
// drives is plain framework-free JS, so it can be mounted by anything that
// can hand it a DOM element (see components/games/DoorsGame.jsx).
import { SIM } from './config.js'
import { createGame, exportAbilities, resetGame, stepGame } from './engine.js'
import { doorDebugLines } from './doors.js'
import { trapDebugLines } from './traps.js'
import { beginStroke, drawDebugLines, endStroke, extendStroke, setAim } from './drawing.js'
import { fireRope } from './rope.js'
import { abilityDialog } from './abilities.js'
import { createTouchUI } from './touchui.js'
import { PAL, PIXEL_FONT } from './pixel.js'
import { createInput } from './input.js'
import { parseLevel } from './levels.js'
import { createDebugOverlay } from './debug.js'
import { makeCamera, updateCamera } from './camera.js'
import { createOverlay } from './overlay.js'
import room1 from './levels/room-1-movement.json'
import room2 from './levels/room-2-doors.json'
import room3 from './levels/room-3-drawing.json'
import room4 from './levels/room-4-crushers-wind.json'
import room5 from './levels/room-5-carry.json'
import room6 from './levels/room-6-doors-gallery.json'
import room7 from './levels/room-7-gravity.json'
import room8 from './levels/room-8-crystals.json'
import room9 from './levels/room-9-abilities.json'
import room10 from './levels/room-10-echo-rope.json'

const ROOMS = [room1, room2, room3, room4, room5, room6, room7, room8, room9, room10]

const PANE_GAP = 4
const PX = (size, line = '') => `font:${size}px${line ? '/' + line : ''} ${PIXEL_FONT};` // text in the pixel font
const DEAD_PANE = { x: 0, y: 0, w: 0, h: 0 } // a pane that is not shown

// Two panes side by side on a landscape screen, stacked on a portrait one.
function layoutPanes(w, h) {
  if (w >= h) {
    const half = (w - PANE_GAP) / 2
    return [
      { x: 0, y: 0, w: half, h },
      { x: half + PANE_GAP, y: 0, w: half, h },
    ]
  }
  const half = (h - PANE_GAP) / 2
  return [
    { x: 0, y: 0, w, h: half },
    { x: 0, y: half + PANE_GAP, w, h: half },
  ]
}

export function startDoors(container) {
  let level = parseLevel(ROOMS[0])
  let game = createGame(level)
  let roomIndex = 0
  const input = createInput()
  const debug = createDebugOverlay(container)
  container.style.touchAction = 'none' // (the touch controls and drawing use pointer events; the page must not scroll or zoom)
  // the on-screen controls (touchui.js): on by default on a phone, and the T key shows them anywhere
  const touchUI = createTouchUI(container, input, {
    onSwitch: () => {
      input.setMode(input.mode === 'pink' ? 'blue' : 'pink')
      snapCameras = true
    },
    onReset: () => {
      resetGame(game)
      snapCameras = true
    },
  })

  // the 3D view (a WebGL canvas) is inserted underneath by view3d.js; this
  // transparent 2D canvas sits on top for labels and markers
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;display:block;z-index:1;pointer-events:none'
  container.appendChild(canvas)
  const overlay = createOverlay(canvas)

  const status = document.createElement('div')
  status.style.cssText =
    'position:absolute;left:50%;top:8px;transform:translateX(-50%);padding:6px 10px;' +
    PX(8) + `color:#fff;background:${PAL.ink};border:3px solid #fff;pointer-events:none;z-index:4`
  status.textContent = 'LOADING…'
  container.appendChild(status)

  const hud = document.createElement('div')
  hud.style.cssText =
    'position:absolute;left:50%;bottom:8px;transform:translateX(-50%);padding:5px 10px;' +
    PX(8) + `color:#fff;background:${PAL.ink};border:3px solid ${PAL.dim};pointer-events:none;z-index:4;white-space:nowrap`
  container.appendChild(hud)

  const banner = document.createElement('div')
  banner.style.cssText =
    'position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);padding:16px 22px;max-width:86%;' +
    PX(16, '1.5') + `color:${PAL.gold};background:${PAL.ink};text-align:center;pointer-events:none;z-index:6;display:none;` +
    `border:4px solid ${PAL.gold};box-shadow:6px 6px 0 #000`
  function bannerHtml() {
    const more = touchUI.enabled
      ? 'TAP FOR THE NEXT ROOM<br>(YOU KEEP YOUR ABILITIES)'
      : 'N: NEXT ROOM (KEEPS YOUR ABILITIES)<br>R: PLAY AGAIN · NUMBER KEYS PICK A ROOM'
    return `ROOM CLEAR!<div style="${PX(8, '1.8')}color:#fff;margin-top:12px">${more}</div>`
  }
  container.appendChild(banner)

  // "Blue has obtained Jump Boost" — a box that explains the new ability. The game is paused until it is
  // dismissed (Enter, Space or a click), so nobody misses what it says.
  const dialogEl = document.createElement('div')
  dialogEl.style.cssText =
    'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(5,3,12,0.62);z-index:8;cursor:pointer;touch-action:none'
  const dialogCard = document.createElement('div')
  dialogCard.style.cssText =
    'max-width:min(560px,90%);max-height:92%;overflow:auto;padding:18px 20px;' + PX(8, '1.9') +
    `color:#fff;background:${PAL.ink};text-align:center;border:5px solid #fff;box-shadow:7px 7px 0 #000`
  dialogEl.appendChild(dialogCard)
  container.appendChild(dialogEl)
  const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  let shownDialog = null
  function renderDialog() {
    const d = game.dialogs[0]
    if (!d) {
      dialogEl.style.display = 'none'
      shownDialog = null
      return
    }
    if (d === shownDialog) return
    shownDialog = d
    const info = abilityDialog(d, touchUI.enabled)
    dialogCard.style.borderColor = info.color
    const more = game.dialogs.length > 1 ? ` (${game.dialogs.length - 1} more)` : ''
    dialogCard.innerHTML =
      `<div style="${PX(11, '1.6')}color:${info.color}">◆ ${escapeHtml(info.title.toUpperCase())}</div>` +
      `<div style="${PX(8)}color:${PAL.gold};margin:6px 0 12px">${escapeHtml(info.subtitle.toUpperCase())}</div>` +
      info.lines.map((line) => `<p style="margin:10px 0">${escapeHtml(line)}</p>`).join('') +
      `<div class="px-blink" style="margin-top:16px;color:${PAL.dim}">${touchUI.enabled ? 'TAP' : 'PRESS ENTER'} TO CONTINUE${more.toUpperCase()}</div>`
    dialogEl.style.display = 'flex'
  }
  function dismissDialog() {
    if (!game.dialogs.length) return
    game.dialogs.shift()
    shownDialog = null
    renderDialog()
  }
  dialogEl.addEventListener('pointerdown', (event) => {
    event.stopPropagation() // (the game area underneath also listens for the drawing mouse)
    dismissDialog()
  })
  function onDialogKey(event) {
    if (!game.dialogs.length || (event.code !== 'Enter' && event.code !== 'NumpadEnter' && event.code !== 'Space')) return
    event.preventDefault()
    dismissDialog()
  }
  window.addEventListener('keydown', onDialogKey)

  // the room's how-to hint: shown when a room loads (and fades after a while); H shows/hides it
  const hintEl = document.createElement('div')
  hintEl.style.cssText =
    'position:absolute;left:50%;top:44px;transform:translateX(-50%);max-width:min(560px,86%);padding:10px 12px;' +
    PX(8, '1.8') + `color:#fff;background:${PAL.ink};border:3px solid ${PAL.dim};box-shadow:4px 4px 0 #000;` +
    'pointer-events:none;z-index:5;display:none;text-align:center'
  container.appendChild(hintEl)
  let hintTimer = 0
  function showHint(visible) {
    clearTimeout(hintTimer)
    hintEl.textContent = level.hint
    hintEl.style.display = visible && level.hint ? 'block' : 'none'
    if (visible && level.hint) hintTimer = setTimeout(() => (hintEl.style.display = 'none'), 20000)
  }

  function updateHud() {
    hud.textContent = touchUI.enabled
      ? `ROOM ${roomIndex + 1}: ${level.name}`.toUpperCase()
      : `ROOM ${roomIndex + 1}/${ROOMS.length}: ${level.name}   ·   KEYS ${ROOMS.length > 9 ? '1-9, 0' : `1-${ROOMS.length}`}: ROOM   ·   H: HINT   ·   T: TOUCH CONTROLS`.toUpperCase()
  }

  // carry: bring the abilities found so far into the room (after finishing the previous one). Picking a
  // room with a number key starts it with only what the room itself provides.
  function loadRoom(index, carry = null) {
    roomIndex = index
    level = parseLevel(ROOMS[index])
    game = createGame(level, carry)
    snapCameras = true
    view?.setLevel(level, game)
    updateHud()
    showHint(true)
  }

  // handy for poking at the game from the browser console while testing
  container.__doorsGame = () => game

  // --- the mouse: whoever is in draw mode draws with it, in EITHER view ---
  const paneAt = (x, y) => panes.findIndex((pane) => x >= pane.x && x < pane.x + pane.w && y >= pane.y && y < pane.y + pane.h)
  const drawer = () => game.players.find((p) => p.draw.mode === 'aiming' || p.draw.mode === 'drawing')
  const ropeAimer = () => game.players.find((p) => p.rope.mode === 'aiming')
  function pointerWorld(event) {
    if (!view) return null
    const rect = container.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const index = paneAt(x, y)
    return index < 0 ? null : view.unproject(index, panes[index], x, y)
  }
  function onPointerDown(event) {
    const who = drawer()
    if (event.button === 0 && !who) {
      // aiming a Light Rope: the click picks where it shoots
      const roper = ropeAimer()
      const target = roper && pointerWorld(event)
      if (roper && target) {
        fireRope(game, roper, target)
        event.preventDefault()
      }
      return
    }
    if (event.button !== 0 || !who || who.draw.mode !== 'aiming') return
    const point = pointerWorld(event)
    if (!point) return
    beginStroke(game, who, point.x, point.y)
    try {
      container.setPointerCapture?.(event.pointerId) // keep the stroke going if the mouse leaves the game area
    } catch {
      // not a capturable pointer (e.g. a synthetic event) — the stroke still works
    }
    event.preventDefault()
  }
  function onPointerMove(event) {
    const who = drawer()
    if (who && who.draw.mode === 'aiming') {
      const point = pointerWorld(event)
      if (point) setAim(who, point.x, point.y) // the caster turns and points at the mouse while aiming a line
    }
    if (!who || who.draw.mode !== 'drawing') return
    const point = pointerWorld(event)
    if (point) extendStroke(game, who, point.x, point.y)
  }
  function onPointerUp() {
    const who = game.players.find((p) => p.draw.mode === 'drawing')
    if (who) endStroke(game, who)
  }
  banner.addEventListener('pointerdown', (event) => {
    // (touch) tap the "room clear" box for the next room
    event.stopPropagation()
    if (!game.complete) return
    if (roomIndex + 1 < ROOMS.length) loadRoom(roomIndex + 1, exportAbilities(game))
    else resetGame(game)
  })
  container.addEventListener('pointerdown', onPointerDown)
  container.addEventListener('pointermove', onPointerMove)
  container.addEventListener('pointerup', onPointerUp)
  container.addEventListener('pointercancel', onPointerUp)

  const cams = [makeCamera(), makeCamera()]
  let panes = layoutPanes(1, 1)
  let size = { w: 1, h: 1 }
  let view = null // the 3D view, once loaded
  let snapCameras = true
  let disposed = false

  import('./view3d.js')
    .then(({ createView3D }) => createView3D(container))
    .then((created) => {
      if (disposed) return created.dispose()
      view = created
      view.resize(size.w, size.h)
      view.setLevel(level, game)
      status.textContent = 'Loading characters…'
      return view.loadModels().then(() => {
        status.remove()
      })
    })
    .catch((error) => {
      console.warn('[doors] 3D view unavailable', error)
      status.textContent = view ? '3D characters unavailable — using placeholders' : '3D view unavailable (WebGL?)'
      setTimeout(() => status.remove(), 5000)
    })

  // Two panes (one per player) — but with the touch controls up this device plays ONE character, so their
  // pane fills the screen and the other is not shown.
  function currentPanes() {
    if (!touchUI.enabled) return layoutPanes(size.w, size.h)
    const full = { x: 0, y: 0, w: size.w, h: size.h }
    return input.mode === 'pink' ? [DEAD_PANE, full] : [full, DEAD_PANE]
  }

  function resize() {
    const rect = container.getBoundingClientRect()
    size = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) }
    panes = currentPanes()
    touchUI.resize(size.w, size.h)
    overlay.resize(size.w, size.h, Math.min(window.devicePixelRatio || 1, 2))
    view?.resize(size.w, size.h)
    snapCameras = true
  }
  touchUI.setEnabled(!!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches)
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()
  updateHud()
  showHint(true)

  let last = performance.now()
  let accumulator = 0
  let fps = 60
  let rafId = 0

  function debugText() {
    const lines = [`FPS ${fps.toFixed(0)}   room: ${level.name} (${level.cols}x${level.rows})   control: ${input.mode}`, '']
    for (const p of game.players) {
      lines.push(
        `${p.id.padEnd(4)} ${p.grav < 0 ? 'CEIL' : 'floor'} x ${p.x.toFixed(2).padStart(6)}  y ${p.y.toFixed(2).padStart(6)}  vx ${p.vx.toFixed(1).padStart(5)}  vy ${p.vy.toFixed(1).padStart(5)}`,
        `     ${p.onGround ? 'ground' : 'air   '} ${p.crouching ? 'crouch' : 'stand '} coyote ${p.coyote.toFixed(2)}  deaths ${p.deaths}  abilities ${Object.entries(p.abilities).map(([k, v]) => `${k}:${v}`).join(' ')}  airJumps ${p.airJumps}`,
      )
    }
    lines.push('', ...doorDebugLines(game.doors), '', ...drawDebugLines(game), '', ...trapDebugLines(game.traps))
    lines.push('', 'Blue: WASD, S crouch, E interact, Q draw, F teleport, G change   Pink: arrows, Down crouch, / interact, . draw, , teleport, M change   mouse draws   R reset   N next room   Tab solo/switch   ` two players   F1 this panel')
    return lines.join('\n')
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame)
    const elapsed = Math.min(0.25, (now - last) / 1000)
    last = now
    fps += (1 / Math.max(elapsed, 0.001) - fps) * 0.1

    if (input.consumeDebug()) debug.toggle()
    if (input.consumeTouchToggle()) {
      touchUI.setEnabled(!touchUI.enabled)
      updateHud()
    }
    const wanted = currentPanes()
    if (JSON.stringify(wanted) !== JSON.stringify(panes)) {
      panes = wanted
      snapCameras = true
    }
    if (input.consumeHint()) showHint(hintEl.style.display === 'none')
    const roomKey = input.consumeRoom()
    if (roomKey !== null && roomKey < ROOMS.length) loadRoom(roomKey)
    if (input.consumeNext() && game.complete && roomIndex + 1 < ROOMS.length) loadRoom(roomIndex + 1, exportAbilities(game))
    if (input.consumeReset()) {
      resetGame(game)
      snapCameras = true
    }

    // fixed-step simulation, independent of the display's refresh rate (paused while a dialog is up)
    if (game.dialogs.length > 0) {
      input.players() // (discard anything pressed meanwhile)
      accumulator = 0
    } else {
      accumulator += elapsed
      let steps = 0
      while (accumulator >= SIM.STEP && steps < SIM.MAX_STEPS_PER_FRAME) {
        stepGame(game, input.players(), SIM.STEP)
        accumulator -= SIM.STEP
        steps++
      }
      if (steps === SIM.MAX_STEPS_PER_FRAME) accumulator = 0 // fell far behind (tab was hidden) — don't spiral
    }
    renderDialog()

    game.players.forEach((player, i) => {
      if (panes[i].w >= 1) updateCamera(cams[i], player, panes[i], level, elapsed, snapCameras)
    })
    snapCameras = false

    container.style.cursor = drawer() || ropeAimer() ? 'crosshair' : ''
    view?.render(game, panes, cams, elapsed)
    overlay.draw(game, panes, view, debug.visible, input.mode, { touch: touchUI.enabled })
    debug.update(debugText())
    banner.style.display = game.complete ? 'block' : 'none'
    if (game.complete) {
      const html = bannerHtml()
      if (banner.dataset.html !== html) {
        banner.innerHTML = html
        banner.dataset.html = html
      }
      banner.style.pointerEvents = touchUI.enabled ? 'auto' : 'none'
    }
    touchUI.update(game, input.mode)
  }
  rafId = requestAnimationFrame(frame)

  return {
    dispose() {
      disposed = true
      cancelAnimationFrame(rafId)
      observer.disconnect()
      input.dispose()
      debug.dispose()
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onDialogKey)
      touchUI.dispose()
      dialogEl.remove()
      container.style.cursor = ''
      view?.dispose()
      canvas.remove()
      status.remove()
      hud.remove()
      banner.remove()
      clearTimeout(hintTimer)
      hintEl.remove()
    },
  }
}
