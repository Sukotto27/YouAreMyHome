// Gravity (milestone 6). Every player has `grav`: +1 normally, -1 when they have been
// flipped by a gravity door and walk on the CEILING (the underside of the room's top
// tiles — the "second floor"). Everything that used to say `p.y - p.h .. p.y` for a
// player's body goes through the helpers here instead.
//
// A player's `y` is always their FEET. Upright the body is [y - h, y]; flipped the feet
// are at the top and the body hangs below them: [y, y + h].
//
// The physics itself needs no second implementation: engine.js simulates a flipped
// player in a vertically MIRRORED copy of the room (y -> rows - y), where they are simply
// upright. Left/right are swapped for a flipped player, so the controls match the
// rolled view they are given (view3d.js turns their pane upside down).
//
// Level JSON: "gravity": [{ "id", "x", "y", "h"?, "set": "up"|"down", "who"?: "any"|"blue"|"pink" }]
//   a shimmering field one tile wide covering rows y..y+h-1. Walking into it sets you to the
//   ceiling ("up") or to the floor ("down"). There is deliberately no toggling door: it would send
//   you straight back the moment you touched it. A door only does anything to someone it can change,
//   so you can walk on through an "up" door once you are up there.
//   The body stays exactly where it is; only the feet and the direction of gravity change.

export const bodyTop = (p) => (p.grav < 0 ? p.y : p.y - p.h)
export const bodyBottom = (p) => (p.grav < 0 ? p.y + p.h : p.y)
export const bodyCenter = (p) => p.y - (p.grav < 0 ? -p.h : p.h) / 2
// the y of the end of the body opposite the feet (what a rider on their shoulders stands on)
export const headY = (p) => p.y - p.grav * p.h

// Changes a player's gravity without moving their body. Ends any shoulder carry they are in.
export function setGravity(game, p, grav) {
  if (p.grav === grav) return false
  const top = bodyTop(p)
  const bottom = bodyBottom(p)
  p.grav = grav
  p.y = grav < 0 ? top : bottom
  p.facing = -p.facing // so they keep facing the same way on THEIR screen (the pane rolls with them)
  p.onGround = false
  p.coyote = 0
  p.jumpBuffer = 0
  const partner = game.players.find((q) => q !== p)
  if (p.carrying === partner.id || p.carriedBy === partner.id) {
    p.carrying = p.carriedBy = null
    partner.carrying = partner.carriedBy = null
    partner.onGround = false
  }
  return true
}
