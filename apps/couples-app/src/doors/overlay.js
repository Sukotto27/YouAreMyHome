// A transparent 2D canvas stacked above the 3D view: pane labels, the little
// marker above each player's head, "press E" hints beside switches, and (in
// debug) hitboxes. It never draws the world itself — that's all 3D now.
import { ABILITY, COLORS, DOORS, DRAW } from './config.js'
const ABILITY_COLORS = ABILITY.COLORS
import { solidLightParams } from './drawing.js'
import { ABILITY_IDS, ABILITY_NAMES, levelName, teleportLabel } from './abilities.js'
import { PIXEL_FONT } from './pixel.js'
import scottUrl from '../assets/images/scott.jpg'
import cristinaUrl from '../assets/images/cristina.jpg'

// Blue is Scott and Pink is Cristina: their pictures sit beside their hearts
const AVATARS = {}
for (const [id, url] of [['blue', scottUrl], ['pink', cristinaUrl]]) {
  const img = new Image()
  img.src = url
  AVATARS[id] = img
}

// The pixel font only has plain capitals and a little punctuation, so all canvas text goes through this.
const px = (text) => String(text).toUpperCase().replace(/[—–]/g, '-').replace(/·/g, '|').replace(/[✏◆●]/g, '*')
import { bodyBottom, bodyCenter, bodyTop, headY } from './gravity.js'

// pixel art for the HUD: '.' empty, 'x' filled
const HEART = ['.xx.xx.', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...']
const ARROW_DOWN = ['...xxx...', '...xxx...', '...xxx...', '...xxx...', 'xxxxxxxxx', '.xxxxxxx.', '..xxxxx..', '...xxx...', '....x....']

// rotates a bitmap a quarter turn clockwise
function rotate(rows) {
  const h = rows.length
  const w = rows[0].length
  const out = []
  for (let x = 0; x < w; x++) {
    let line = ''
    for (let y = h - 1; y >= 0; y--) line += rows[y][x]
    out.push(line)
  }
  return out
}
const ARROWS = { down: ARROW_DOWN }
ARROWS.left = rotate(ARROWS.down)
ARROWS.up = rotate(ARROWS.left)
ARROWS.right = rotate(ARROWS.up)

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
      const left = (n.life || ABILITY.NOTICE_TIME) - n.age
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

  // a bitmap in `fill`, with a 1-cell dark outline so it reads on any background
  function bitmap(rows, x, y, cell, fill, outline = '#0b0820') {
    ctx.fillStyle = outline
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (rows[r][c] !== 'x') continue
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillRect(x + (c + dx) * cell, y + (r + dy) * cell, cell, cell)
      }
    }
    ctx.fillStyle = fill
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === 'x') ctx.fillRect(x + c * cell, y + r * cell, cell, cell)
    }
  }

  // top-left of each pane (under the name): this player's hearts, and their partner's smaller ones
  function drawHearts(game, player, pane) {
    if (!player.heartsOn) return
    const cell = 3
    const draw = (p, x, y, scale) => {
      for (let i = 0; i < p.maxHearts; i++) {
        const full = i < p.hearts
        bitmap(HEART, x + i * (HEART[0].length + 2) * scale, y, scale, full ? ABILITY_COLORS.heart : '#3a3a55')
      }
    }
    // a framed square portrait in the player's colour (cropped to the face, kept chunky like the rest of the HUD)
    const avatar = (p, x, y, size) => {
      const img = AVATARS[p.id]
      ctx.fillStyle = COLORS[p.id]
      ctx.fillRect(x - 3, y - 3, size + 6, size + 6)
      ctx.fillStyle = '#0b0820'
      ctx.fillRect(x - 1, y - 1, size + 2, size + 2)
      if (img && img.complete && img.naturalWidth) {
        const side = Math.min(img.naturalWidth, img.naturalHeight)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, (img.naturalWidth - side) / 2, 0, side, side, x, y, size, size)
        ctx.imageSmoothingEnabled = true
      }
    }
    const big = HEART.length * cell + 14 // a portrait as tall as the hearts, a little taller
    avatar(player, pane.x + 15, pane.y + 33, big)
    draw(player, pane.x + 15 + big + 12, pane.y + 30 + (big - HEART.length * cell) / 2, cell)
    const partner = game.players.find((p) => p !== player)
    const small = HEART.length * 2 + 8
    const row2 = pane.y + 33 + big + 12
    avatar(partner, pane.x + 15, row2, small)
    draw(partner, pane.x + 15 + big + 12, row2 + (small - HEART.length * 2) / 2, 2)
  }

  // Replaces {jump}/{crouch}/{act} in a tutorial prompt with what THIS player presses.
  function promptText(text, player, touch) {
    const blue = player.id === 'blue'
    const keys = touch ? { jump: 'JUMP', crouch: 'STICK DOWN', act: 'ACT', draw: 'USE', echo: 'USE', teleport: 'USE', rope: 'USE' } : blue ? { jump: 'W', crouch: 'S', act: 'E', draw: 'Q', echo: 'X', teleport: 'F', rope: 'C' } : { jump: 'UP', crouch: 'DOWN', act: '/', draw: '.', echo: ';', teleport: ',', rope: "'" }
    return text.replace(/\{(jump|crouch|act|draw|echo|teleport|rope)\}/g, (_, k) => keys[k])
  }

  // The tutorial arrows: a bobbing arrow at an obstacle, with what to do, shown to whoever is near it.
  function drawPrompts(game, player, pane, ui, project) {
    const list = game.level.objects.prompts
    if (!list.length) return
    const cy = bodyCenter(player)
    for (const prm of list) {
      if (prm.for && prm.for !== player.id) continue
      if (player.x < prm.x - (prm.range ?? 8) || player.x > prm.x + (prm.after ?? 4)) continue
      if (Math.abs(cy - prm.y) > (prm.rangeY ?? 6)) continue
      const at = project(prm.x, prm.y)
      const cell = Math.max(3, Math.round(pane.h / 120))
      const bob = Math.sin(performance.now() / 160) * cell * 2
      const dir = prm.dir || 'down'
      const rows = ARROWS[dir]
      const w = rows[0].length * cell
      const h = rows.length * cell
      const off = { down: [0, bob], up: [0, -bob], left: [-bob, 0], right: [bob, 0] }[dir]
      const ax = at.x - w / 2 + off[0]
      const ay = at.y - h / 2 + off[1]
      bitmap(rows, ax, ay, cell, ABILITY_COLORS.jumpBoost)
      // the words, in a little pixel box on the far side of the arrow
      const text = px(promptText(prm.text, player, ui.touch))
      ctx.font = `${Math.max(8, Math.round(pane.h / 50))}px ${PIXEL_FONT}`
      const tw = ctx.measureText(text).width
      const padX = 8
      const boxW = tw + padX * 2
      const boxH = 24
      let bx = at.x - boxW / 2
      let by = ay - boxH - 8
      if (dir === 'up') by = ay + h + 8
      if (dir === 'right') {
        bx = ax - boxW - 10
        by = at.y - boxH / 2
      }
      if (dir === 'left') {
        bx = ax + w + 10
        by = at.y - boxH / 2
      }
      bx = Math.max(pane.x + 6, Math.min(pane.x + pane.w - boxW - 6, bx))
      ctx.fillStyle = '#0b0820'
      ctx.fillRect(bx - 3, by - 3, boxW + 6, boxH + 6)
      ctx.fillStyle = '#f8f8f8'
      ctx.fillRect(bx - 1, by - 1, boxW + 2, boxH + 2)
      ctx.fillStyle = '#0b0820'
      ctx.fillRect(bx + 1, by + 1, boxW - 2, boxH - 2)
      ctx.fillStyle = '#ffd23f'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, bx + padX, by + boxH / 2 + 1)
      ctx.textBaseline = 'alphabetic'
    }
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
    drawHearts(game, game.players[index], pane)
    drawPrompts(game, game.players[index], pane, ui, project)
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

  function clear() {
    ctx.clearRect(0, 0, width, height)
  }

  return { resize, draw, clear }
}
