// A transparent 2D canvas stacked above the 3D view: pane labels, the little
// marker above each player's head, "press E" hints beside switches, and (in
// debug) hitboxes. It never draws the world itself — that's all 3D now.
import { ABILITY, COLORS, DOORS, DRAW } from './config.js'
const ABILITY_COLORS = ABILITY.COLORS
import { solidLightParams } from './drawing.js'
import { ABILITY_IDS, ABILITY_NAMES, levelName, teleportLabel } from './abilities.js'
import { PIXEL_FONT } from './pixel.js'

// The pixel font only has plain capitals and a little punctuation, so all canvas text goes through this.
const px = (text) => String(text).toUpperCase().replace(/[—–]/g, '-').replace(/·/g, '|').replace(/[✏◆●]/g, '*')
import { bodyBottom, bodyTop, headY } from './gravity.js'

export function createOverlay(canvas) {
  const ctx = canvas.getContext('2d')
  const rawFill = ctx.fillText.bind(ctx)
  const rawStroke = ctx.strokeText.bind(ctx)
  ctx.fillText = (text, x, y, maxWidth) => rawFill(px(text), x, y, maxWidth)
  ctx.strokeText = (text, x, y, maxWidth) => rawStroke(px(text), x, y, maxWidth)
  let width = 0
  let height = 0

  function resize(w, h, dpr) {
    width = w
    height = h
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  // top-right of each pane: that player's drawing status (mode, ink, line life, cooldown)
  function drawHud(game, player, pane, ui = {}) {
    const d = player.draw
    const params = solidLightParams(player)
    if (!params) return // no Solid Light found yet
    const strokeLength = game.stroke && game.stroke.owner === player.id ? game.stroke.length : 0
    const myLine = game.lines.find((l) => l.owner === player.id && !l.stone)
    const key = player.id === 'blue' ? 'Q' : '.'
    const right = pane.x + pane.w - 12
    let label = ''
    let fill = null // 0..1 bar
    let barColor = COLORS[player.id]
    if (d.mode === 'aiming') {
      label = ui.touch ? 'DRAG TO DRAW' : `DRAG TO DRAW | ${key} CANCELS`
      fill = 1
    } else if (d.mode === 'drawing') {
      label = 'DRAWING...'
      fill = 1 - Math.min(1, strokeLength / params.ink)
    } else if (d.mode === 'active') {
      if (myLine && myLine.life === Infinity) {
        label = 'MOVE TO LET GO'
        fill = 1
      } else {
        label = 'LINE FADING'
        fill = myLine ? 1 - myLine.age / myLine.life : 0
      }
      barColor = '#facc15'
    } else if (d.cooldown > 0) {
      label = `READY IN ${d.cooldown.toFixed(1)}S`
      fill = 1 - d.cooldown / DRAW.DRAW_COOLDOWN
      barColor = '#9ca3af'
    } else {
      ctx.globalAlpha = 0.6
      label = ui.touch ? 'SOLID LIGHT' : `${key}: DRAW`
    }
    ctx.font = `8px ${PIXEL_FONT}`
    ctx.textAlign = 'right'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.65)'
    ctx.strokeText(label, right, pane.y + 20)
    ctx.fillStyle = '#fff'
    ctx.fillText(label, right, pane.y + 20)
    if (fill !== null) {
      const w = 130
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(right - w, pane.y + 27, w, 6)
      ctx.fillStyle = barColor
      ctx.fillRect(right - w, pane.y + 27, w * Math.max(0, Math.min(1, fill)), 6)
    }
    ctx.textAlign = 'start'
    ctx.globalAlpha = 1
  }

  // bottom-left of each pane: the abilities this player has found (and which teleport action is selected)
  function drawAbilities(game, player, pane) {
    const rows = []
    for (const name of ABILITY_IDS) {
      const level = player.abilities[name]
      if (level > 0) rows.push({ name, text: `${ABILITY_NAMES[name]} ${levelName(level)}` })
    }
    if (!rows.length) return
    const keys = player.id === 'blue' ? { tp: 'F', cycle: 'G', echo: 'X', rope: 'C' } : { tp: ',', cycle: 'M', echo: ';', rope: "'" }
    const myEcho = game.echoes.find((e) => e.id === player.id)
    ctx.font = `8px ${PIXEL_FONT}`
    ctx.textAlign = 'left'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.65)'
    rows.forEach((row, i) => {
      let text = '◆ ' + row.text
      if (row.name === 'teleport') {
        const cooldown = player.tpCooldown > 0 ? ` (${player.tpCooldown.toFixed(1)}s)` : ''
        text += ` — ${keys.tp}: ${teleportLabel(player)}${cooldown}${player.abilities.teleport > 1 ? `   ${keys.cycle}: change` : ''}`
      } else if (row.name === 'lightEcho') {
        const note = myEcho ? `  — echo ${(myEcho.life - myEcho.age).toFixed(1)}s left` : player.echoCooldown > 0 ? ` (${player.echoCooldown.toFixed(1)}s)` : ''
        text += ` — ${keys.echo}: leave an echo${note}`
      } else if (row.name === 'lightRope') {
        const r = player.rope
        if (r.mode === 'aiming') text += ` — click where to shoot it (${keys.rope} cancels)`
        else if (r.mode === 'attached') text += ` — crouch reels in · jump lets go (${Math.max(0, r.life - r.age).toFixed(1)}s)`
        else text += ` — ${keys.rope}: aim, then click a spot`
      } else if (row.name === 'jumpBoost') {
        text += `${player.abilities.jumpBoost >= 2 ? `  — jump again in the air (${player.airJumps} left)` : ''}`
      }
      const y = pane.y + pane.h - 14 - (rows.length - 1 - i) * 17
      ctx.strokeText(text, pane.x + 12, y)
      ctx.fillStyle = ABILITY_COLORS[row.name]
      ctx.fillText(text, pane.x + 12, y)
    })
  }

  // "Blue found Jump Boost I!" — near the top of every pane for a few seconds
  function drawNotices(game, pane) {
    ctx.font = `10px ${PIXEL_FONT}`
    ctx.textAlign = 'center'
    game.notices.forEach((n, i) => {
      const left = ABILITY.NOTICE_TIME - n.age
      ctx.globalAlpha = Math.max(0, Math.min(1, left / 0.8, n.age / 0.15))
      const y = pane.y + pane.h * 0.18 + i * 26
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'
      ctx.strokeText(n.text, pane.x + pane.w / 2, y)
      ctx.fillStyle = COLORS[n.player]
      ctx.fillText(n.text, pane.x + pane.w / 2, y)
    })
    ctx.globalAlpha = 1
    ctx.textAlign = 'start'
  }

  function drawPane(game, pane, index, view, debug, mode, ui = {}) {
    const project = (x, y) => view.project(index, pane, x, y)
    ctx.save()
    ctx.beginPath()
    ctx.rect(pane.x, pane.y, pane.w, pane.h)
    ctx.clip()

    // marker above each player's head (the pane's own player drawn last, on top)
    const order = [...game.players.keys()].sort((a, b) => (a === index ? 1 : 0) - (b === index ? 1 : 0))
    for (const i of order) {
      const p = game.players[i]
      const head = project(p.x, headY(p) - p.grav * 0.15)
      const size = pane.h / 55
      ctx.fillStyle = COLORS[p.id]
      ctx.beginPath()
      ctx.moveTo(head.x, head.y)
      ctx.lineTo(head.x - size, head.y - size * 1.7)
      ctx.lineTo(head.x + size, head.y - size * 1.7)
      ctx.closePath()
      ctx.fill()

      if (debug) {
        const a = project(p.x - p.w / 2, bodyTop(p))
        const b = project(p.x + p.w / 2, bodyBottom(p))
        ctx.strokeStyle = '#facc15'
        ctx.lineWidth = 1
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
      }
    }

    // "press E" / "press /" beside a switch when that player is close enough
    for (const sw of game.doors.switches) {
      for (const q of game.players) {
        if (sw.who !== 'any' && sw.who !== q.id) continue
        if (Math.abs(q.x - (sw.x + 0.5)) > DOORS.SWITCH_REACH) continue
        const spot = project(sw.x + 0.5, sw.ceiling ? sw.y + 1.35 : sw.y - 0.35)
        const key = q.id === 'blue' ? 'E' : '/'
        ctx.font = `${Math.max(10, Math.round(pane.h / 28))}px ${PIXEL_FONT}`
        ctx.textAlign = 'center'
        ctx.lineWidth = 4
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'
        ctx.strokeText(key, spot.x, spot.y)
        ctx.fillStyle = COLORS[q.id]
        ctx.fillText(key, spot.x, spot.y)
        ctx.textAlign = 'start'
        break
      }
    }

    drawHud(game, game.players[index], pane, ui)
    if (!ui.touch) drawAbilities(game, game.players[index], pane) // (the touch toolbelt shows them instead)
    drawNotices(game, pane)

    // pane label; when playing solo, show which character you are controlling
    const id = game.players[index].id
    const solo = mode !== 'both'
    const active = !solo || mode === id
    ctx.font = `8px ${PIXEL_FONT}`
    ctx.fillStyle = COLORS[id]
    ctx.globalAlpha = active ? 1 : 0.55
    ctx.fillText(`${index === 0 ? 'Blue' : 'Pink'}${solo ? (active ? '  ● you' : '  (waiting)') : ''}`, pane.x + 10, pane.y + 20)
    ctx.globalAlpha = 1
    if (solo && active) {
      ctx.strokeStyle = COLORS[id]
      ctx.lineWidth = 4
      ctx.strokeRect(pane.x + 2, pane.y + 2, pane.w - 4, pane.h - 4)
    }
    ctx.restore()
  }

  function draw(game, panes, view, debug, mode = 'both', ui = {}) {
    ctx.clearRect(0, 0, width, height)
    if (!view) return
    panes.forEach((pane, i) => {
      if (pane.w >= 1 && pane.h >= 1) drawPane(game, pane, i, view, debug, mode, ui)
    })
  }

  return { resize, draw }
}
