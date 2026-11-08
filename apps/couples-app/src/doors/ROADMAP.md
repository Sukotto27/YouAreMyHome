# Doors — roadmap & design decisions

> The story mode (opening scene, chapter 1, outlines for later chapters) is described in [CAMPAIGN.md](CAMPAIGN.md).

Working title. A 2-player co-op side-view platformer: Blue (Scott) and Pink
(Cristina), one room per level, both must reach the brown exit door. Game core
is plain framework-free ES modules in this folder; `components/games/DoorsGame.jsx`
is a thin React shell.

## Decisions made so far

- Characters are the existing 3D models (three.js layer, strictly side view).
- Lives inside the couples app (Vite-built), core stays framework-free.
- **Each player has their own camera pane** (side by side; stacked on portrait).
- Local same-keyboard play only for now. Fixed 60 Hz simulation.
- Units are tiles (1 tile = 1 m). All tunables live in `config.js`.
- Players are solid to each other (see M1b). Corridors 3 tiles tall mean the
  only way past a partner is crouch + jump.
- The view is a real 3D scene (narrow-FOV perspective camera, slightly yawed and
  pitched): tiles are blocks with depth, doors use the household door model.
- Solo testing: purple BYPASS switches in test rooms open co-op-only doors.
- Solo testing: Tab controls one character at a time (the other stands still);
  Backquote returns to two players.
- Drawing: one line each; the drawer may draw in EITHER view and is frozen from
  pressing the draw key until the line fades; you can only start drawing while
  grounded; one mouse, so one drawer at a time. Lines are chains of small bricks
  (solid to the partner only); traps will treat them as solid for everyone (M4).
- Level files: one JSON per room, grid of strings + object lists.

## Milestones

| # | Scope | Status |
|---|-------|--------|
| 1 | Engine, two players, move/jump/crouch, tile collision, reset | done |
| 1b | **Player-to-player collision** — you can't walk through each other; to swap sides one crouches and the other jumps over | done |
| 2 | Doors: gray, blue/pink, switch, plate (incl. both-players), exit + test room | done (awaiting your test) |
| 3 | Co-op drawing: freeze, lifetime, ink limit, cooldown + long-gap test room | done (awaiting your test) |
| 3b | **Shoulder carry** (below) | done, test room 5 (awaiting your test) |
| 4 | Traps, one at a time, each with a test room showing how a drawn line answers it | Done: room 3 (fire jets, lasers, arrows, spikes, collapsing floor, boulders, checkpoints) and room 4 (crushers, swinging blades, wind fans). Awaiting your test |
| 5 | Remaining doors: key, flip-on-pass, linked, one-way, swap, portal, random | done, test room 6 (awaiting your test) |
| 6 | Gravity doors and the ceiling second floor | done, test room 7 (awaiting your test) |
| 7 | Five handcrafted levels, one new idea each | |

## Touch controls and the pixel look (as built)

- `touchui.js` (DOM) over `touchstate.js` (pure logic, tested). On by default on a phone
  (`hover: none` + `pointer: coarse`); the T key toggles them anywhere.
  - **Floating joystick**, lower left: drag left/right to move, down to crouch (up does nothing).
  - **JUMP**, lower right, held for the full jump. **USE** beside it works the selected ability. **ACT** is
    the small teal button for switches and handing over keys. **NEXT** (only with Teleport II+) cycles
    the teleport action.
  - **Toolbelt**: a sideways-scrolling row of the abilities you have found; tap to select. Passive ones
    (Jump Boost) are shown as AUTO and can't be selected. The USE button shows what it will do (DRAW,
    CANCEL, GO TO PARTNER, MARK, RETURN, PICK UP, ECHO, ROPE, LET GO) and any cooldown.
  - Solid Light and Light Rope still aim by touching the screen after USE (draw = drag, rope = tap).
    Rope: joystick down reels in, JUMP lets go.
  - Top-left: switch which character this device plays, and restart the room (for one-device testing).
- With the touch controls up a device plays ONE character, so their pane fills the screen and the
  other isn't shown (the other stands still; the keyboard still works too). In the networked game each
  phone will be one player.
- Pixel look: Press Start 2P (loaded in index.html), a stepped-circle / nibbled-square clip-path for
  buttons, 12x12 bitmap icons (`pixel.js`, one per ability and control, tinted with the ability's colour),
  all canvas text through one `px()` that upper-cases and drops glyphs the font lacks. The obtained-
  ability dialog is the same style and says "toolbelt / USE / NEXT" instead of key names on touch.

## Unlockable abilities (as built; not one of the numbered milestones)

- `abilities.js`. Players find crystals (`"crystals"` in the level: `{id,x,y,ability,for}`, one
  per player per room, taken only by the player it is `for`). A crystal (a dialog explains the ability and pauses the game until dismissed) raises that player's
  ability by one level (0 = not found, max 3). `"abilities"` in the level is the minimum each
  player has on entering; rooms without the key give Solid Light 1, which is how all the older
  rooms already worked. Abilities carry into the next room with N after a room is complete;
  number keys start a room with only its own minimum, and R restores the abilities as at entry.
- **Solid Light** (the drawing; frozen while it lasts; the caster points an arm at the line): L1 12 tiles / 3s (unchanged from before),
  L2 18 / 5s, L3 24 / until the caster moves. Numbers in `ABILITY.SOLID_LIGHT` (config.js).
- **Jump Boost**: L1 jump speed x1.08 and a burst of light; L2 one mid-air jump off a stepping
  stone; L3 three, chosen by what is held: nothing = up, a direction = diagonal, direction +
  crouch = straight forward (a dash). Stones are short-lived `line`s (solid to the partner and to
  hazards) that don't freeze the caster.
- **Teleport**: L1 to your partner (beside them, or on their shoulders); L2 also swap places;
  L3 adds a Marker action: the first use places a mark, using it again from elsewhere teleports you back to it, and using it while standing on the mark picks it up. The key (F / `,`) does the selected action; the change
  key (G / M) cycles them. 1s cooldown; refuses if the destination is solid, a closed door, or you
  are frozen drawing. Ends a shoulder carry; adopts the partner's gravity.
- Test rooms: 8 (crystals: Blue's needs a shoulder carry, Pink's needs a held plate) and 9 (all
  abilities at 3, a 7-tall wall, a 10-wide gap, and a sealed chamber with the exit).
- Each ability has its own crystal/HUD colour (`ABILITY.COLORS`): Solid Light cyan, Jump Boost
  yellow, Teleport violet, Light Echo green, Light Rope orange.
- While drawing a line the caster turns toward it and extends an arm at it, with a glow of the
  ability's colour at the hand (view3d.js `extendArm`; `setAim` in drawing.js).
- **Light Echo** (X / `;`): leaves a translucent copy where you stand (on the ground, not while
  drawing). It looks like a player to pressure plates (including ceiling plates and colour-
  restricted ones, by its owner), so it holds a plate for you. Lasts 5 / 10 / 20s by level; one
  each (a new echo replaces the old), 1.5s cooldown; reset clears it.
- **Light Rope** (C / `'`, then click a spot in either view; rope.js): shoots from the hand along
  the line to the click, up to 7 / 11 / 16 tiles, and latches onto the FIRST thing it meets: a
  solid surface (swing like a pendulum; left/right pump, crouch reels in, jump lets go and keeps
  your speed), your partner (crouch reels them across to you), or a loose key (crouch reels it
  in). Lasts 4 / 7 / 12s. Needs the mouse, so only one of you can aim a rope or a line at a time.
- Test rooms: 8 (crystals: Blue's needs a shoulder carry, Pink's needs a held plate), 9 (all
  abilities at 3, a 7-tall wall, a 10-wide gap, and a sealed chamber with the exit) and 10 (key `0`:
  an echo holds a plate, two 12-wide pits crossed by swinging, a key fetched from an island with
  the rope, and Pink pulled across a pit by Blue).

## M6 — Gravity (as built)

- `gravity.js`. A player has `grav` (+1 floor, -1 ceiling). The ceiling's underside is the
  "second floor": no extra geometry, the same tile grid walked upside down. `y` stays the
  FEET, so an upside-down body hangs below it; every system uses `bodyTop/bodyBottom/headY`.
- **Gravity doors** (`"gravity": [...]` in the level): a one-tile-wide field. Walking into it
  (once per entry) sends you to the ceiling (`up`) or the floor (`down`). There is no toggling
  door: it sent you straight back the moment you touched it.
  Your body doesn't move; the feet swap ends and you fall to the other surface.
- **Physics**: a flipped player is simulated in a vertically mirrored copy of the room
  (`stepPlayer` in engine.js), so there is no second collision implementation.
  Left/right are swapped for them.
- **View**: the flipped player's pane rolls 180 degrees (eased) and their character tumbles about
  the middle of the body, so on their screen they are upright and the ceiling is their floor.
  Mouse drawing works in either pane because it unprojects through the rolled camera.
- **Rules settled with the other mechanics**: shoulder carry needs matching gravity and ends if
  either player flips; checkpoints remember which way up you were (`"ceiling": true` flags
  hang from the ceiling); plates and switches take `"ceiling": true` and are used by players on
  the ceiling (a floor plate ignores them); a drawing player is frozen, so can't walk into a
  gravity door; dying respawns at the last flag, upright unless it was a ceiling flag.
- Fixed on the way: a vertical drawn line was climbed like a staircase if it had been drawn from
  the bottom up (step-up judged the first brick in drawing order, not the topmost).

## M5 — The remaining doors (as built; the roadmap only had names, so these are my readings)

- **key**: a key lies in a cell; walking onto it picks it up (one key each, carried above
  the head). Interact beside your partner hands it over; dying sends it home. A key door
  opens for good when the holder reaches it.
- **flip-on-pass**: toggles every time someone crosses it, so by default it shuts behind
  you. `flips: [ids]` also toggles other flip doors, which is how one player's passage
  opens the other's route.
- **linked**: a see-saw: open exactly while its partner is shut (`mirror: false` = same state).
- **one-way**: passable only in its `dir`; once you are fully through, it's a wall.
- **swap**: a colour door that changes to the other player's colour after its owner passes.
- **random**: re-rolls open/shut every `period` seconds from a seeded generator (the same
  every run, so it stays deterministic and testable).
- **portals**: `portals` list; walk into one, come out of its partner, speed kept. A
  carrying pair goes together.
- No door ever changes state while someone stands in the doorway.

## M3b — Shoulder carry (as built)

Landing on the head of a grounded, non-drawing partner LINKS the pair (engine.js,
`updateCarry`). The rider moves with the carrier (walk, jump, crouch); the carrier
walks at 70% speed and their collision box counts the rider's height, so the stack
can't walk under a ceiling the rider doesn't fit under. The rider leaves by jumping or
walking off the head. A jump off a RISING carrier adds half of the carrier's upward
speed (chained boost: ~7 tiles above the floor, vs ~4 for a standing carrier). The
link ends when either player dies or the carrier starts drawing (a frozen drawer is
just a platform again). Decisions taken on the open questions below: traps hurt each
player separately; a crouching carrier lowers the rider rather than dropping them;
handing keys down waits for the key doors (M5). No arms-up clip exists in the
animation set, so view3d.js raises the carrier's upper-arm bones (up and forward, eased in/out) on top of whatever clip is playing.

### Original design notes

Jumping directly on top of the partner lets you stand on their shoulders; the
bottom player raises their arms and holds the upper player's feet.

- **Use:** reach a tall surface that one player alone can't.
- **Upper player jumps higher** because they start from a higher point.
- **Chained boost:** bottom player jumps, then the upper player jumps off the
  rising partner for an extra boost.
- Needs (builds on M1b collision): detect "landed on partner's head" -> enter a
  *carried* state; the carried player moves with the bottom player; bottom
  player shows the arms-up animation (needs a suitable clip from the UAL set, or
  a posed fallback); define what the bottom player can do while carrying
  (walk slower? jump?).
- Why after M3: it interacts with the drawing freeze (a frozen drawer can't be
  the carrier, and a carried drawer is "frozen" on someone's shoulders) and with
  gravity flags (M6), so those rules should be settled together. Can be moved
  earlier if you want to design levels around it sooner.

Open questions for M3b: can the carried player be knocked off by traps? Does
the carrier crouching drop the rider? Can a rider hand a key down, etc.?
