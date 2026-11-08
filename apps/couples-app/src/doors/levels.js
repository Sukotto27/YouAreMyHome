// Level loading. Each room is one JSON file under ./levels with the tile grid
// as an array of strings, one per row, top to bottom:
//   '#'  solid tile            '.'  empty (a space also works)
//   'B'  Blue's spawn          'P'  Pink's spawn
// Doors, switches, plates and the exit are listed alongside the grid (their
// format is documented in doors.js); keys and traps follow in later
// milestones. The grid stays the source of truth for geometry.
// This file is pure (no JSON imports) so the engine and headless tests can use
// it directly; index.js owns the list of rooms.

export function parseLevel(json) {
  const rows = json.grid.length
  const cols = json.grid[0].length
  const solid = new Uint8Array(cols * rows)
  const spawns = {}

  json.grid.forEach((line, y) => {
    if (line.length !== cols) throw new Error(`Level "${json.name}": row ${y} is ${line.length} wide, expected ${cols}`)
    for (let x = 0; x < cols; x++) {
      const ch = line[x]
      if (ch === '#') solid[y * cols + x] = 1
      else if (ch === 'B') spawns.blue = { x: x + 0.5, y: y + 1 } // feet at the bottom of the marker cell
      else if (ch === 'P') spawns.pink = { x: x + 0.5, y: y + 1 }
    }
  })
  if (!spawns.blue || !spawns.pink) throw new Error(`Level "${json.name}" needs both a B and a P spawn`)

  const objects = {
    doors: json.doors || [],
    plates: json.plates || [],
    switches: json.switches || [],
    exit: json.exit || null,
    traps: json.traps || [],
    checkpoints: json.checkpoints || [],
    keys: json.keys || [],
    gravity: json.gravity || [],
    crystals: json.crystals || [],
    prompts: json.prompts || [], // tutorial arrows: { x, y, dir, text, for?, range? } (drawn by overlay.js)
    portals: json.portals || [],
    crates: json.crates || [], // pushable crates: [{ id?, x, y }] (crates.js)
    crateKeepClear: json.crateKeepClear || [], // extra cells a crate may not be pushed into: [{ x, y, w?, h? }]
    // [{ x, open? }]: a line a teleport may not cross (so a gate cannot be skipped); it stops counting once lever `open` is flipped
    teleportBarriers: json.teleportBarriers || [],
  }
  // abilities every player has at least on entering (rooms that don't say get Solid Light 1, as before)
  const abilities = json.abilities ?? { solidLight: 1 }
  // campaign rooms ("campaign": { chapter, index, title }) use hearts; the older test rooms never run out
  return {
    name: json.name,
    notes: json.notes || '',
    hint: json.hint || '',
    cols,
    rows,
    solid,
    spawns,
    objects,
    abilities,
    campaign: json.campaign || null,
    theme: json.theme || 'basement',
    scenery: json.scenery || {}, // { crates: [{x,y,w,h}], shelves: [{x,y,w}] }: see scenery.js
    intro: json.intro || null, // the opening cutscene's door: { doorX, doorY }
  }
}

// Solid-tile lookup. The left, right and top edges of the room are solid; the
// bottom is open (falling out of the room is a death, handled by the engine).
export function isSolid(level, tx, ty) {
  if (tx < 0 || tx >= level.cols || ty < 0) return true
  if (ty >= level.rows) return false
  return level.solid[ty * level.cols + tx] === 1
}
