// The on-screen touch controls, in a chunky old-school pixel style. All the behaviour (what the joystick
// means, what USE does) is in touchstate.js; this just draws the controls and feeds pointer events in.
//
//   lower left   a floating joystick: drag left/right to move, down to crouch
//   lower right  JUMP, USE (works the selected ability), a small ACT button (switches, handing over keys),
//                NEXT (cycles a teleport's action) and above them the toolbelt: a row of the abilities you have
//                found, scrolled sideways, tap one to select it
//   top left     switch which character this device controls / restart the room (handy for one-device testing)
//
// Sizes come from one CSS variable, --u (1% of the shorter side), so it fits any phone in either orientation.
import { ABILITY } from './config.js'
import { ABILITY_NAMES, levelName } from './abilities.js'
import { PAL, PIXEL_CIRCLE, PIXEL_SQUARE, injectPixelCss, pixelIconURL } from './pixel.js'
import { beltAbilities, useLabel } from './touchstate.js'

const el = (tag, css = '', parent = null) => {
  const node = document.createElement(tag)
  node.style.cssText = css
  if (parent) parent.appendChild(node)
  return node
}
const u = (n) => `calc(var(--u) * ${n})`

// One chunky button: a dark outline plate, a bevelled face, an icon and a caption.
function pixelButton(parent, { size, shape = 'circle', color, icon, iconColor, caption = '', captionSize = 2.3, css = '' }) {
  const clip = shape === 'circle' ? PIXEL_CIRCLE : PIXEL_SQUARE
  const outer = el('div', `position:absolute;width:${u(size)};height:${u(size)};clip-path:${clip};background:${PAL.ink};pointer-events:auto;touch-action:none;cursor:pointer;${css}`, parent)
  const face = el(
    'div',
    `position:absolute;inset:${u(0.8)};clip-path:${clip};background:${color};` +
      `box-shadow:inset ${u(-1)} ${u(-1)} 0 rgba(0,0,0,0.35), inset ${u(1)} ${u(1)} 0 rgba(255,255,255,0.3);` +
      `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${u(0.5)}`,
    outer,
  )
  let img = null
  if (icon) {
    img = el('img', `width:${u(size * 0.44)};height:${u(size * 0.44)}`, face)
    img.className = 'px-img'
    img.draggable = false
    img.src = pixelIconURL(icon, iconColor)
  }
  const text = el('div', `font-size:${u(captionSize)};color:${PAL.white};text-shadow:${u(0.3)} ${u(0.3)} 0 ${PAL.ink};line-height:1.15;text-align:center;white-space:nowrap`, face)
  text.className = 'px-text'
  text.textContent = caption
  return { outer, face, img, text }
}

// pointer handling for a held / tapped button (with capture, so sliding off doesn't strand it)
function wire(node, onDown, onUp) {
  const press = (event) => {
    event.preventDefault()
    event.stopPropagation()
    try {
      node.setPointerCapture(event.pointerId)
    } catch {
      /* synthetic pointer: fine */
    }
    node.classList.add('px-press')
    onDown?.(event)
  }
  const release = (event) => {
    event.stopPropagation()
    node.classList.remove('px-press')
    onUp?.(event)
  }
  node.addEventListener('pointerdown', press)
  node.addEventListener('pointerup', release)
  node.addEventListener('pointercancel', release)
}

export function createTouchUI(container, input, { onSwitch, onReset } = {}) {
  injectPixelCss()
  const touch = input.touch
  const root = el('div', 'position:absolute;inset:0;z-index:7;pointer-events:none;touch-action:none;user-select:none;-webkit-user-select:none;display:none', container)
  root.style.setProperty('--u', '4px')
  let W = 1
  let H = 1
  let unit = 4

  // ------------------------------------------------------------ joystick
  const STICK = 30 // diameter, in u
  const zone = el('div', 'position:absolute;left:0;bottom:0;width:46%;height:64%;pointer-events:auto;touch-action:none', root)
  const base = el('div', `position:absolute;width:${u(STICK)};height:${u(STICK)};clip-path:${PIXEL_CIRCLE};background:${PAL.ink};opacity:0.7;pointer-events:none`, root)
  const baseFace = el('div', `position:absolute;inset:${u(1)};clip-path:${PIXEL_CIRCLE};background:${PAL.panel};box-shadow:inset ${u(1.2)} ${u(1.2)} 0 rgba(255,255,255,0.18)`, base)
  // arrows on the ring: which way each direction goes
  for (const [rot, pos] of [[-90, `left:${u(2.2)};top:50%;margin-top:${u(-2.4)}`], [90, `right:${u(2.2)};top:50%;margin-top:${u(-2.4)}`], [180, `bottom:${u(2.2)};left:50%;margin-left:${u(-2.4)}`]]) {
    const arrow = el('img', `position:absolute;width:${u(4.8)};height:${u(4.8)};opacity:0.5;transform:rotate(${rot}deg);${pos}`, baseFace)
    arrow.className = 'px-img'
    arrow.src = pixelIconURL('jump')
  }
  const knob = el('div', `position:absolute;width:${u(13)};height:${u(13)};clip-path:${PIXEL_CIRCLE};background:${PAL.ink};opacity:0.95;pointer-events:none`, root)
  el('div', `position:absolute;inset:${u(0.8)};clip-path:${PIXEL_CIRCLE};background:${PAL.gold};box-shadow:inset ${u(-1)} ${u(-1)} 0 rgba(0,0,0,0.3), inset ${u(1)} ${u(1)} 0 rgba(255,255,255,0.45)`, knob)
  let stickId = null
  let center = { x: 0, y: 0 }
  const restCenter = () => ({ x: unit * 21, y: H - unit * 24 })
  function placeStick(c, k) {
    base.style.left = `${c.x - (unit * STICK) / 2}px`
    base.style.top = `${c.y - (unit * STICK) / 2}px`
    knob.style.left = `${k.x - (unit * 13) / 2}px`
    knob.style.top = `${k.y - (unit * 13) / 2}px`
  }
  function restStick() {
    center = restCenter()
    placeStick(center, center)
    base.style.opacity = '0.45'
    knob.style.opacity = '0.6'
  }
  function moveStick(event) {
    const rect = root.getBoundingClientRect()
    const dx = event.clientX - rect.left - center.x
    const dy = event.clientY - rect.top - center.y
    const radius = unit * STICK * 0.4
    const len = Math.hypot(dx, dy) || 1
    const k = Math.min(1, len / radius)
    placeStick(center, { x: center.x + (dx / len) * k * radius, y: center.y + (dy / len) * k * radius })
    touch.setStick((dx / len) * k, (dy / len) * k)
  }
  zone.addEventListener('pointerdown', (event) => {
    if (stickId !== null) return
    event.preventDefault()
    event.stopPropagation()
    stickId = event.pointerId
    try {
      zone.setPointerCapture(event.pointerId)
    } catch {
      /* synthetic pointer */
    }
    // the stick appears where the thumb lands (kept on screen)
    const rect = root.getBoundingClientRect()
    const margin = (unit * STICK) / 2 + unit
    center = {
      x: Math.min(W - margin, Math.max(margin, event.clientX - rect.left)),
      y: Math.min(H - margin, Math.max(margin, event.clientY - rect.top)),
    }
    base.style.opacity = '0.85'
    knob.style.opacity = '1'
    moveStick(event)
  })
  zone.addEventListener('pointermove', (event) => {
    if (event.pointerId === stickId) moveStick(event)
  })
  const endStick = (event) => {
    if (event.pointerId !== stickId) return
    stickId = null
    touch.releaseStick()
    restStick()
  }
  zone.addEventListener('pointerup', endStick)
  zone.addEventListener('pointercancel', endStick)

  // ------------------------------------------------------------ right-hand buttons
  const jump = pixelButton(root, { size: 24, color: '#d6403b', icon: 'jump', caption: 'JUMP', css: `right:${u(4)};bottom:${u(5)}` })
  wire(jump.outer, () => touch.setJump(true), () => touch.setJump(false))
  const use = pixelButton(root, { size: 20, color: PAL.gold, icon: 'use', caption: '', css: `right:${u(29)};bottom:${u(7)}` })
  wire(use.outer, () => touch.pressUse())
  const act = pixelButton(root, { size: 12, color: '#1f9d8f', icon: 'interact', caption: 'ACT', captionSize: 2, css: `right:${u(6)};bottom:${u(30)}` })
  wire(act.outer, () => touch.pressInteract())
  const cycle = pixelButton(root, { size: 11, shape: 'square', color: '#5b4fcf', icon: 'cycle', caption: 'NEXT', captionSize: 1.9, css: `right:${u(31)};bottom:${u(28)}` })
  wire(cycle.outer, () => touch.pressCycle())

  // ------------------------------------------------------------ the toolbelt
  const belt = el(
    'div',
    `position:absolute;right:${u(3)};bottom:${u(44)};width:${u(50)};height:${u(14.5)};overflow-x:auto;overflow-y:hidden;display:flex;gap:${u(1.2)};align-items:center;pointer-events:auto;touch-action:pan-x`,
    root,
  )
  belt.className = 'px-belt'
  let beltSig = ''
  let slotNodes = new Map()
  function rebuildBelt(items) {
    belt.textContent = ''
    slotNodes = new Map()
    for (const item of items) {
      const slot = el(
        'div',
        `position:relative;flex:0 0 auto;width:${u(12.5)};height:${u(12.5)};clip-path:${PIXEL_SQUARE};background:${PAL.ink};cursor:pointer;opacity:${item.passive ? 0.6 : 1}`,
        belt,
      )
      const face = el('div', `position:absolute;inset:${u(0.8)};clip-path:${PIXEL_SQUARE};background:${PAL.panel};box-shadow:inset ${u(-0.9)} ${u(-0.9)} 0 rgba(0,0,0,0.35), inset ${u(0.9)} ${u(0.9)} 0 rgba(255,255,255,0.22);display:flex;align-items:center;justify-content:center`, slot)
      const img = el('img', `width:${u(7)};height:${u(7)}`, face)
      img.className = 'px-img'
      img.draggable = false
      img.src = pixelIconURL(item.id, ABILITY.COLORS[item.id])
      const tag = el('div', `position:absolute;right:${u(1.6)};bottom:${u(1)};font-size:${u(1.9)};color:${item.passive ? PAL.dim : PAL.white};text-shadow:${u(0.25)} ${u(0.25)} 0 ${PAL.ink}`, face)
      tag.className = 'px-text'
      tag.textContent = item.passive ? 'AUTO' : levelName(item.level)
      slot.title = `${ABILITY_NAMES[item.id]} ${levelName(item.level)}`
      slot.addEventListener('click', () => {
        if (item.passive) return
        touch.select(item.id)
        update.last = null
      })
      slotNodes.set(item.id, { slot, face })
    }
  }
  function styleSelection() {
    for (const [id, node] of slotNodes) {
      const on = id === touch.selected
      node.slot.style.background = on ? PAL.gold : PAL.ink
      node.slot.style.transform = on ? `translateY(${u(-0.8)})` : 'none'
    }
  }

  // ------------------------------------------------------------ top-left system buttons
  const swap = pixelButton(root, { size: 11, shape: 'square', color: PAL.panel, icon: 'switchPlayer', caption: '', css: `left:${u(2)};top:${u(9)}` })
  wire(swap.outer, null, () => onSwitch?.())
  const again = pixelButton(root, { size: 11, shape: 'square', color: PAL.panel, icon: 'reset', caption: '', css: `left:${u(14.5)};top:${u(9)}` })
  wire(again.outer, null, () => onReset?.())

  // ------------------------------------------------------------ per-frame refresh
  let enabled = false
  let lastLabel = null
  let lastIcon = null
  function update(game, mode) {
    if (!enabled) return
    const player = game.players[mode === 'pink' ? 1 : 0]
    const items = beltAbilities(player)
    const sig = items.map((i) => `${i.id}${i.level}`).join(',')
    if (sig !== beltSig) {
      beltSig = sig
      rebuildBelt(items)
    }
    touch.ensureSelection(player)
    styleSelection()
    const id = touch.selected
    const label = id ? useLabel(player, id) : 'NONE'
    if (label !== lastLabel) {
      use.text.textContent = label
      lastLabel = label
    }
    const iconKey = id || 'use'
    if (iconKey !== lastIcon) {
      lastIcon = iconKey
      use.img.src = id ? pixelIconURL(id, ABILITY.COLORS[id]) : pixelIconURL('use')
      use.face.style.background = id ? PAL.panelHi : PAL.dim
    }
    use.outer.style.opacity = id ? '1' : '0.45'
    const showCycle = id === 'teleport' && player.abilities.teleport > 1
    cycle.outer.style.display = showCycle ? 'block' : 'none'
    belt.style.display = items.length ? 'flex' : 'none'
  }
  update.last = null

  function resize(w, h) {
    W = w
    H = h
    unit = Math.max(3, Math.min(w, h) / 100)
    root.style.setProperty('--u', `${unit}px`)
    if (stickId === null) restStick()
  }

  return {
    resize,
    update,
    setEnabled(on) {
      enabled = !!on
      touch.enabled = enabled
      root.style.display = enabled ? 'block' : 'none'
      if (!enabled) {
        touch.releaseStick()
        touch.setJump(false)
      } else restStick()
    },
    get enabled() {
      return enabled
    },
    // hide the controls without turning them off (during the opening scene)
    suspend(on) {
      root.style.visibility = on ? 'hidden' : 'visible'
    },
    dispose() {
      root.remove()
    },
  }
}
