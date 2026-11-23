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
import { INTRO, bubbleState, cineParams, createIntro, introClick, tapToStart, updateIntro } from './intro.js'
import { createTouchUI } from './touchui.js'
import { PAL, PIXEL_FONT } from './pixel.js'
import { createInput } from './input.js'
import { parseLevel } from './levels.js'
import { createDebugOverlay } from './debug.js'
import { makeCamera, updateCamera } from './camera.js'
import { createOverlay } from './overlay.js'
import { createFootsteps } from './footsteps.js'
import { createSfx } from './sfx.js'
import { IDLE_INPUT, inputOf, maskOf } from './coopInput.js'

// the campaign: every levels/chNN-*.json, in order
const CAMPAIGN = Object.entries(import.meta.glob('./levels/ch*-*.json', { eager: true }))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, module]) => module.default)

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

// `coop` (online co-op, see coopNet.js) is { net, role: 'blue'|'pink', isHost, partnerName, restore } — or null for
// the original same-device game. In co-op this device plays one character; the host runs the real simulation and the
// guest mirrors it (while also simulating locally so its own character responds instantly).
export function startDoors(container, coop = null) {
  // dev server only: ?room=N starts at room N of the campaign (no opening scene), for looking at a room quickly
  const devRoom = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('room')) || 0 : 0
  const startIndex = devRoom > 0 && devRoom <= CAMPAIGN.length ? devRoom - 1 : 0
  let level = parseLevel(CAMPAIGN[startIndex])
  let game = createGame(level)
  const input = createInput()
  const myIndex = coop ? (coop.role === 'pink' ? 1 : 0) : -1
  const theirIndex = coop ? 1 - myIndex : -1
  const isGuest = !!coop && !coop.isHost
  if (coop) {
    input.setMode(coop.role)
    input.lock()
  }
  const footsteps = createFootsteps()
  const sfx = createSfx()
  const debug = createDebugOverlay(container)
  container.style.touchAction = 'none' // (the touch controls and drawing use pointer events; the page must not scroll or zoom)
  // the on-screen controls (touchui.js): on by default on a phone, and the T key shows them anywhere
  const touchUI = createTouchUI(container, input, {
    onReset: () => requestReset(),
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
    const last = campaignIndex >= 0 && campaignIndex === CAMPAIGN.length - 1
    const more = touchUI.enabled
      ? last ? 'TAP TO PLAY THE CHAPTER AGAIN' : 'NEXT ROOM STARTING...<br>(TAP TO SKIP THE WAIT)'
      : last ? 'N: PLAY THE CHAPTER AGAIN' : 'NEXT ROOM STARTING...<br>(N: SKIP THE WAIT)'
    const title = last ? 'CHAPTER COMPLETE!' : 'ROOM CLEAR!'
    const teaser = last ? `<div style="${PX(8, '1.8')}color:${PAL.gold};margin-top:12px">NEXT: CHAPTER 2 - THE SKYSCRAPER<br>(COMING SOON)</div>` : ''
    return `${title}${teaser}<div style="${PX(8, '1.8')}color:#fff;margin-top:12px">${more}</div>`
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
    if (isGuest) coop.net.sendCommand({ t: 'dialog' })
    sfx.ui()
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

  // ---- the campaign: title screen, the opening scene, room title cards, "out of hearts" ----
  let stage = 'play' // 'title' (black, waiting for a tap) | 'intro' (the opening scene) | 'play'
  let campaignIndex = -1 // which campaign room this is
  let intro = null
  let failTimer = 0
  const layer = (css) => {
    const node = document.createElement('div')
    node.style.cssText = css
    container.appendChild(node)
    return node
  }
  const titleEl = layer('position:absolute;inset:0;z-index:9;background:#000;display:none;flex-direction:column;align-items:center;justify-content:center;gap:34px;cursor:pointer;touch-action:none')
  titleEl.innerHTML =
    `<div style="${PX(30, '1.2')}color:${PAL.gold};text-shadow:4px 4px 0 #6b3b00;letter-spacing:4px">DOORS</div>` +
    `<div class="px-blink" style="${PX(12)}color:#fff">[ TAP TO START ]</div>`
  const flashEl = layer('position:absolute;inset:0;z-index:6;background:#000;opacity:0;pointer-events:none')
  // a chat bubble over each head in the opening scene; tapping one makes that character speak
  function makeBubble(who) {
    const color = who === 'blue' ? '#3b82f6' : '#ec4899'
    const node = layer(
      `position:absolute;z-index:7;display:none;padding:7px 10px;background:#fff;color:${PAL.ink};border:4px solid ${PAL.ink};box-shadow:4px 4px 0 ${color};` +
        `${PX(14)}cursor:pointer;touch-action:none;transform:translate(-50%,-100%)`,
    )
    node.innerHTML = `<span>...</span><div style="position:absolute;left:50%;bottom:-14px;margin-left:-8px;width:0;height:0;border:8px solid transparent;border-top-color:${PAL.ink}"></div>`
    node.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
      event.preventDefault()
      if (intro) introClick(intro, who)
    })
    return node
  }
  const bubbleEls = { blue: makeBubble('blue'), pink: makeBubble('pink') }
  const talkEl = layer(
    'position:absolute;left:50%;bottom:16%;transform:translateX(-50%);z-index:7;display:none;min-width:200px;max-width:86%;padding:12px 16px;' +
      `${PX(10, '1.8')}color:#fff;background:${PAL.ink};border:4px solid #fff;box-shadow:5px 5px 0 #000;pointer-events:none`,
  )
  const cardEl = layer(
    'position:absolute;left:50%;top:14%;transform:translateX(-50%);z-index:5;display:none;padding:10px 16px;text-align:center;' +
      `${PX(10, '1.8')}color:#fff;background:${PAL.ink};border:4px solid ${PAL.gold};box-shadow:5px 5px 0 #000;pointer-events:none;white-space:nowrap`,
  )
  let cardTimer = 0
  function showRoomCard() {
    const c = level.campaign
    if (!c) return
    cardEl.innerHTML = `<div style="color:${PAL.gold}">CHAPTER ${c.chapter} - ROOM ${c.index}</div><div style="margin-top:6px">${escapeHtml(c.title.toUpperCase())}</div>`
    cardEl.style.display = 'block'
    clearTimeout(cardTimer)
    cardTimer = setTimeout(() => (cardEl.style.display = 'none'), 3400)
  }
  const failEl = layer(
    'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);z-index:8;display:none;padding:16px 22px;text-align:center;' +
      `${PX(14, '1.8')}color:${PAL.danger};background:${PAL.ink};border:4px solid ${PAL.danger};box-shadow:6px 6px 0 #000;pointer-events:none`,
  )
  failEl.innerHTML = `OUT OF HEARTS!<div style="${PX(8, '1.8')}color:#fff;margin-top:10px">THE ROOM RESTARTS WITH ALL YOUR HEARTS</div>`

  function beginIntro() {
    if (!intro || stage !== 'title') return
    titleEl.style.display = 'none'
    sfx.ui()
    tapToStart(intro, game)
    stage = 'intro'
  }
  titleEl.addEventListener('pointerdown', (event) => {
    event.stopPropagation()
    beginIntro()
  })
  function onTitleKey(event) {
    if (stage !== 'title' || (event.code !== 'Enter' && event.code !== 'Space' && event.code !== 'NumpadEnter')) return
    event.preventDefault()
    beginIntro()
  }
  window.addEventListener('keydown', onTitleKey)

  // The opening scene's screen furniture, once a frame: the white flash, the bubbles over the heads, the dialogue.
  // After the opening scene: whoever moves first says the first line and the other answers (the game keeps running)
  let afterTalk = null // { state: 'wait' | 'talk' | 'done', who?, text?, t, second? }
  const AFTER_LINES = { first: "Let's find a way out of here!", second: 'Ok, my love!' }
  function watchFirstMove(inputs) {
    if (afterTalk?.state !== 'wait') return
    const i = inputs.findIndex((s) => s && (s.left || s.right || s.jump))
    if (i < 0) return
    afterTalk = { state: 'talk', who: game.players[i].id, text: AFTER_LINES.first, t: 0, second: false }
  }
  function updateAfterTalk(dt) {
    if (afterTalk?.state !== 'talk') return
    afterTalk.t += dt
    if (afterTalk.t < INTRO.LINE) return
    if (afterTalk.second) afterTalk = { state: 'done' }
    else afterTalk = { state: 'talk', who: afterTalk.who === 'blue' ? 'pink' : 'blue', text: AFTER_LINES.second, t: 0, second: true }
  }

  function updateIntroDom() {
    flashEl.style.opacity = intro ? String(intro.flash) : '0'
    const states = intro && stage === 'intro' ? bubbleState(intro) : []
    for (const who of ['blue', 'pink']) {
      const node = bubbleEls[who]
      const b = states.find((s) => s.who === who)
      if (!b || !b.visible || !view) {
        node.style.display = 'none'
        continue
      }
      const p = game.players[who === 'blue' ? 0 : 1]
      const at = view.project(0, panes[0], p.x, p.y - 1.75 - 0.35)
      node.style.display = 'block'
      node.style.left = `${at.x}px`
      node.style.top = `${at.y}px`
      node.classList.toggle('px-blink', !!b.ready)
    }
    if (intro && stage === 'intro' && intro.dialog) {
      const who = intro.dialog.who
      talkEl.style.display = 'block'
      talkEl.style.borderColor = who === 'blue' ? '#3b82f6' : '#ec4899'
      talkEl.innerHTML = `<div style="color:${who === 'blue' ? '#7db4ff' : '#ff8cc6'};margin-bottom:6px">${who.toUpperCase()}</div>${escapeHtml(intro.dialog.text)}`
    } else if (afterTalk?.state === 'talk' && stage === 'play') {
      const who = afterTalk.who
      talkEl.style.display = 'block'
      talkEl.style.borderColor = who === 'blue' ? '#3b82f6' : '#ec4899'
      talkEl.innerHTML = `<div style="color:${who === 'blue' ? '#7db4ff' : '#ff8cc6'};margin-bottom:6px">${who.toUpperCase()}</div>${escapeHtml(afterTalk.text)}`
    } else talkEl.style.display = 'none'
  }

  function loadCampaign(index, carry = null, { withIntro = false } = {}) {
    campaignIndex = index
    if (coop?.isHost) {
      roomSeq += 1
      roomMeta = { seq: roomSeq, index, carry }
      forceFull = true
    }
    afterTalk = null
    level = parseLevel(CAMPAIGN[index])
    game = createGame(level, carry)
    snapCameras = true
    view?.setLevel(level, game)
    failTimer = 0
    failEl.style.display = 'none'
    showHint(false)
    updateHud()
    if (withIntro && level.intro) {
      intro = createIntro(game)
      stage = 'title'
      titleEl.style.display = 'flex'
    } else {
      intro = null
      stage = 'play'
      titleEl.style.display = 'none'
      showRoomCard()
    }
  }

  let autoNext = 0
  // on to the next room, keeping the abilities and hearts found so far (after a room is complete)
  function nextRoom() {
    if (!game.complete) return
    if (isGuest) {
      coop.net.sendCommand({ t: 'next' }) // the host moves both of you on
      return
    }
    if (campaignIndex >= 0) loadCampaign(campaignIndex + 1 < CAMPAIGN.length ? campaignIndex + 1 : 0, campaignIndex + 1 < CAMPAIGN.length ? exportAbilities(game) : null)
  }

  function updateHud() {
    if (level.campaign) {
      const c = level.campaign
      hud.textContent = `CHAPTER ${c.chapter} - ROOM ${c.index}: ${c.title}`.toUpperCase()
      return
    }
    hud.textContent = level.name.toUpperCase()
  }

  // handy for poking at the game from the browser console while testing
  container.__doorsGame = () => game

  // --- the mouse: whoever is in draw mode draws with it, in EITHER view ---
  const paneAt = (x, y) => panes.findIndex((pane) => x >= pane.x && x < pane.x + pane.w && y >= pane.y && y < pane.y + pane.h)
  const mouseCandidates = () => (coop ? [game.players[myIndex]] : game.players)
  const drawer = () => mouseCandidates().find((p) => p && (p.draw.mode === 'aiming' || p.draw.mode === 'drawing'))
  const ropeAimer = () => mouseCandidates().find((p) => p && p.rope.mode === 'aiming')
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
        if (isGuest) coop.net.sendCommand({ t: 'rope', x: target.x, y: target.y })
        event.preventDefault()
      }
      return
    }
    if (event.button !== 0 || !who || who.draw.mode !== 'aiming') return
    const point = pointerWorld(event)
    if (!point) return
    beginStroke(game, who, point.x, point.y)
    if (isGuest) coop.net.sendCommand({ t: 'sb', x: point.x, y: point.y })
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
      if (point) {
        setAim(who, point.x, point.y) // the caster turns and points at the mouse while aiming a line
        if (isGuest && performance.now() - lastAimSent > 60) {
          lastAimSent = performance.now()
          coop.net.sendCommand({ t: 'aim', x: point.x, y: point.y })
        }
      }
    }
    if (!who || who.draw.mode !== 'drawing') return
    const point = pointerWorld(event)
    if (point) {
      extendStroke(game, who, point.x, point.y)
      if (isGuest) strokeBuf.push([point.x, point.y])
    }
  }
  function onPointerUp() {
    const who = mouseCandidates().find((p) => p && p.draw.mode === 'drawing')
    if (who) {
      endStroke(game, who)
      if (isGuest) {
        flushStroke()
        coop.net.sendCommand({ t: 'se' })
      }
    }
  }
  banner.addEventListener('pointerdown', (event) => {
    // (touch) tap the "room clear" box for the next room
    event.stopPropagation()
    if (game.complete) sfx.ui()
    nextRoom()
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
      if (view) {
        status.textContent = '3D characters unavailable — using placeholders'
        setTimeout(() => status.remove(), 5000)
        return
      }
      // Without the 3D view there is nothing to draw but black, so say so and keep saying so.
      status.style.cssText += ';max-width:80%;white-space:normal;text-align:center;line-height:1.6;border-color:#ff5c5c'
      status.textContent = `THE 3D VIEW COULDN'T START ON THIS DEVICE (${String(error?.message || error).slice(0, 80)}). CLOSE OTHER APPS AND REOPEN DOORS.`
    })

  // Two panes (one per player) — but with the touch controls up this device plays ONE character, so their
  // pane fills the screen and the other is not shown.
  function currentPanes() {
    if (!touchUI.enabled && !coop) return layoutPanes(size.w, size.h)
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
  // start-up: the first campaign room, in the dark, waiting for a tap (rooms without an opening scene just begin)
  if (level.campaign && level.intro && startIndex === 0 && !devRoom && !coop) {
    campaignIndex = 0
    intro = createIntro(game)
    stage = 'title'
    titleEl.style.display = 'flex'
    showHint(false)
  } else if (level.campaign) campaignIndex = startIndex
  updateHud()
  touchUI.setEnabled(!!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches)
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()
  updateHud()
  showHint(true)

  // ---- online co-op ----
  let roomSeq = 0
  let roomMeta = null // host: { seq, index, carry } — the guest loads whatever room this names
  let localRoomSeq = -1 // guest: the room version it has loaded
  let forceFull = false
  let hostDialogs = [] // guest: the "you obtained..." boxes, exactly as the host has them
  let hostMask = 0 // guest: the host's current input, so their character keeps moving between snapshots
  let hostInputMask = 0 // host: my own current input, published for the guest
  let pendingState = null // guest: state that arrived since the last frame
  const lastStr = {} // JSON last published (host) / last received (guest), per key
  let lastHeard = performance.now() // guest: when the host's heartbeat last arrived
  let accMask = 0
  let lastMask = 0
  let lastMoveAt = 0 // when I last held left/right
  let lastSentMask = -1
  let lastInputSent = 0
  let lastPublish = 0
  let lastHeartbeat = 0
  let lastAimSent = 0
  let lastStrokeFlush = 0
  const strokeBuf = []
  const deferredStrokes = [] // host: strokes that arrived before the draw key did
  const roundNumbers = (key, value) => (typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 10000) / 10000 : value)
  const awayEl = layer(
    'position:absolute;left:50%;top:70px;transform:translateX(-50%);z-index:7;display:none;padding:7px 12px;text-align:center;' +
      `${PX(8)}color:#fff;background:${PAL.ink};border:3px solid ${PAL.danger};pointer-events:none;white-space:nowrap`,
  )

  function requestReset() {
    if (isGuest) {
      coop.net.sendCommand({ t: 'reset' })
      return
    }
    resetGame(game)
    snapCameras = true
  }

  function flushStroke() {
    if (strokeBuf.length) coop.net.sendCommand({ t: 'sx', pts: strokeBuf.splice(0) })
    lastStrokeFlush = performance.now()
  }

  // The inputs for this step. Co-op: mine from the keyboard/touch controls, the other character's from the network.
  function stepInputs() {
    const inputs = input.players()
    if (!coop) return inputs
    lastMask = maskOf(inputs[myIndex])
    if (lastMask & 3) lastMoveAt = performance.now()
    accMask |= lastMask
    if (coop.isHost) {
      hostInputMask = lastMask
      const remote = coop.net.remote()
      inputs[theirIndex] = performance.now() - remote.at < 600 ? inputOf(remote.mask) : IDLE_INPUT // (a stalled link must not leave a key stuck)
    } else inputs[theirIndex] = inputOf(hostMask)
    return inputs
  }

  // Guest: tell the host what I am pressing. Several steps' presses are merged so a quick tap is never lost.
  function flushInput(now) {
    if (!isGuest) return
    if ((accMask !== lastSentMask || now - lastInputSent > 400) && now - lastInputSent >= 30) {
      coop.net.sendInput(accMask)
      lastSentMask = accMask
      lastInputSent = now
      accMask = lastMask
    }
  }

  // Host: the one-off commands from the guest.
  function handleCommand(c) {
    const who = game.players[theirIndex]
    switch (c.t) {
      case 'reset':
        resetGame(game)
        snapCameras = true
        break
      case 'next':
        nextRoom()
        break
      case 'dialog':
        game.dialogs.shift()
        break
      case 'sb':
        if (who.draw.mode === 'aiming') beginStroke(game, who, c.x, c.y)
        else deferredStrokes.push({ x: c.x, y: c.y, until: performance.now() + 700, pts: [] })
        break
      case 'sx':
        if (deferredStrokes.length) deferredStrokes[deferredStrokes.length - 1].pts.push(...c.pts)
        else for (const [x, y] of c.pts || []) extendStroke(game, who, x, y)
        break
      case 'se':
        if (deferredStrokes.length) deferredStrokes[deferredStrokes.length - 1].ended = true
        else endStroke(game, who)
        break
      case 'aim':
        setAim(who, c.x, c.y)
        break
      case 'rope':
        fireRope(game, who, { x: c.x, y: c.y })
        break
      default:
    }
  }
  // a stroke whose "start drawing" key press is still on its way
  function retryDeferredStrokes(now) {
    const who = game.players[theirIndex]
    while (deferredStrokes.length) {
      const d = deferredStrokes[0]
      if (who.draw.mode === 'aiming') {
        beginStroke(game, who, d.x, d.y)
        for (const [x, y] of d.pts) extendStroke(game, who, x, y)
        if (d.ended) endStroke(game, who)
        deferredStrokes.shift()
      } else if (now > d.until) deferredStrokes.shift()
      else break
    }
  }

  // Host: publish what changed since last time (everything, right after a room loads).
  function publishState(now) {
    if (now - lastPublish < 66 && !forceFull) return
    lastPublish = now
    const changed = {}
    const put = (key, text) => {
      if (forceFull || lastStr[key] !== text) {
        lastStr[key] = text
        changed[key] = text
      }
    }
    for (const key of Object.keys(game)) {
      if (key !== 'level') put(key, JSON.stringify(game[key], roundNumbers) ?? 'null')
    }
    put('hi', String(hostInputMask))
    if (roomMeta) put('roomMeta', JSON.stringify(roomMeta))
    if (now - lastHeartbeat > 1000) {
      lastHeartbeat = now
      changed.hb = String(Date.now())
    }
    forceFull = false
    if (Object.keys(changed).length) coop.net.publish(changed)
  }

  // Guest: take in the host's latest state. The world comes straight from the host; my own character is kept as I
  // simulated it (so it does not snap back to where the host last saw me) unless the two have really diverged.
  function mergePlayers(fresh) {
    const mine = game.players[myIndex]
    const theirs = fresh[myIndex]
    if (mine && theirs) {
      const apart = Math.hypot(theirs.x - mine.x, theirs.y - mine.y)
      const changed =
        theirs.deaths !== mine.deaths ||
        theirs.hearts !== mine.hearts ||
        theirs.grav !== mine.grav ||
        theirs.carriedBy !== mine.carriedBy ||
        theirs.carrying !== mine.carrying ||
        JSON.stringify(theirs.abilities) !== JSON.stringify(mine.abilities)
      // While I am running the host's copy of me is always a little behind (the network delay), so that is not a
      // difference to correct — only a big one (a respawn, a teleport) or a change of state is.
      if (!changed && apart <= 2.5) {
        // Once I have stopped, settle onto where the host has me, so both of us agree where I am standing.
        if (performance.now() - lastMoveAt > 250 && apart > 0.03) {
          mine.x += (theirs.x - mine.x) * 0.3
          mine.y += (theirs.y - mine.y) * 0.3
        }
        fresh[myIndex] = mine
      }
    }
    game.players = fresh
  }

  function applyRemoteState() {
    if (!pendingState) return
    const state = pendingState
    pendingState = null
    if (state.roomMeta && state.roomMeta.seq !== localRoomSeq) {
      localRoomSeq = state.roomMeta.seq
      loadCampaign(state.roomMeta.index, state.roomMeta.carry)
    }
    for (const [key, value] of Object.entries(state)) {
      if (key === 'roomMeta') continue
      if (key === 'hi') hostMask = Number(value) || 0
      else if (key === 'players') mergePlayers(value)
      else if (key === 'dialogs') hostDialogs = value
      else game[key] = value
    }
  }

  if (isGuest) {
    coop.net.onState((all) => {
      const now = performance.now()
      for (const [key, text] of Object.entries(all)) {
        if (lastStr[key] === text) continue
        lastStr[key] = text
        if (key === 'hb') {
          lastHeard = now
          continue
        }
        try {
          pendingState = pendingState || {}
          pendingState[key] = JSON.parse(text)
        } catch {
          // a half-written value: the next update replaces it
        }
      }
    })
  } else if (coop) {
    coop.net.onCommand(handleCommand)
    roomMeta = { seq: 0, index: Math.max(campaignIndex, 0), carry: null }
    forceFull = true
    if (coop.restore) {
      // coming back to a game in progress: carry on from the last state the host published
      try {
        const saved = coop.restore.roomMeta ? JSON.parse(coop.restore.roomMeta) : null
        if (saved) {
          roomSeq = saved.seq
          roomMeta = saved
          if (saved.index !== campaignIndex) loadCampaign(saved.index, saved.carry)
        }
        for (const [key, text] of Object.entries(coop.restore)) {
          if (key !== 'roomMeta' && key !== 'hi' && key !== 'hb') game[key] = JSON.parse(text)
        }
        forceFull = true
      } catch {
        // an unreadable save: start the room fresh
      }
    }
  }

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
    const cine = intro && !intro.done ? cineParams(intro) : null
    if (intro && !intro.done) updateIntro(intro, game, elapsed)
    if (intro && intro.done && stage === 'intro') {
      stage = 'play'
      afterTalk = { state: 'wait', t: 0 }
      snapCameras = true
      showRoomCard()
    }
    touchUI.suspend(stage !== 'play')
    hud.style.display = stage === 'play' ? 'block' : 'none'
    const wanted = cine ? [{ x: 0, y: 0, w: size.w, h: size.h }, DEAD_PANE] : currentPanes()
    if (JSON.stringify(wanted) !== JSON.stringify(panes)) {
      panes = wanted
      snapCameras = true
    }
    if (input.consumeHint()) showHint(hintEl.style.display === 'none')
    input.consumeRoom() // (the number keys used to jump between test rooms)
    if (input.consumeNext()) {
      if (game.complete) sfx.ui()
      nextRoom()
    }
    // in the campaign the next room follows by itself a moment after the exit (N / a tap just skips the wait)
    if (!isGuest && game.complete && campaignIndex >= 0 && campaignIndex + 1 < CAMPAIGN.length) {
      autoNext += elapsed
      if (autoNext > 3.2) {
        autoNext = 0
        nextRoom()
      }
    } else autoNext = 0
    if (input.consumeReset()) requestReset()
    if (isGuest) applyRemoteState()
    else if (coop) retryDeferredStrokes(now)

    // out of hearts: a moment to read it, then the room restarts with every heart refilled
    if (game.outOfHearts && failTimer <= 0 && stage === 'play') {
      failTimer = 2.4
      failEl.style.display = 'block'
    }
    if (failTimer > 0) {
      failTimer -= elapsed
      if (failTimer <= 0) {
        resetGame(game)
        failEl.style.display = 'none'
        snapCameras = true
      }
    }

    // fixed-step simulation, independent of the display's refresh rate (paused during a dialog, the cutscene, a failure)
    if (stage !== 'play' || failTimer > 0 || game.dialogs.length > 0) {
      input.players() // (discard anything pressed meanwhile)
      accumulator = 0
    } else {
      accumulator += elapsed
      let steps = 0
      while (accumulator >= SIM.STEP && steps < SIM.MAX_STEPS_PER_FRAME) {
        const inputs = stepInputs()
        watchFirstMove(inputs)
        stepGame(game, inputs, SIM.STEP)
        footsteps.update(game, SIM.STEP)
        sfx.update(game)
        accumulator -= SIM.STEP
        steps++
      }
      if (steps === SIM.MAX_STEPS_PER_FRAME) accumulator = 0 // fell far behind (tab was hidden) — don't spiral
    }
    updateAfterTalk(elapsed)
    if (isGuest) {
      game.dialogs = hostDialogs // (the host decides what the boxes say and when they are gone)
      flushInput(now)
      if (strokeBuf.length && now - lastStrokeFlush > 50) flushStroke()
    } else if (coop) publishState(now)
    if (coop) {
      const gone = isGuest ? now - lastHeard > 4000 : now - coop.net.remote().at > 4000
      awayEl.style.display = gone ? 'block' : 'none'
      if (gone) awayEl.textContent = `WAITING FOR ${String(coop.partnerName || 'YOUR PARTNER').toUpperCase()}...`
    }
    renderDialog()

    game.players.forEach((player, i) => {
      if (panes[i].w >= 1) updateCamera(cams[i], player, panes[i], level, elapsed, snapCameras)
    })
    snapCameras = false

    container.style.cursor = drawer() || ropeAimer() ? 'crosshair' : ''
    view?.render(game, panes, cams, elapsed, cine)
    if (cine) overlay.clear()
    else overlay.draw(game, panes, view, debug.visible, input.mode, { touch: touchUI.enabled })
    updateIntroDom()
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
      sfx.stop()
      coop?.net.dispose()
      cancelAnimationFrame(rafId)
      observer.disconnect()
      input.dispose()
      debug.dispose()
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onDialogKey)
      window.removeEventListener('keydown', onTitleKey)
      for (const node of [titleEl, flashEl, talkEl, cardEl, failEl, awayEl, ...Object.values(bubbleEls)]) node.remove()
      clearTimeout(cardTimer)
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
