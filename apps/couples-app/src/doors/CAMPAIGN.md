# Doors — the campaign

The story mode: a run of hand-built rooms in chapters of ten. Every room teaches or tests one or two things and cannot be
finished by one player alone. Level files live in `levels/chN-NN-name.json`; the game loads every `ch*-*.json` in name order
(so keep the two-digit room number).

## The rules we build rooms by

- Each room introduces **1–3 new obstacles**. Only a NEW obstacle gets an **arrow** (`prompts`) saying what to do; later rooms leave it to the player (`{jump}`,
  `{crouch}`, `{act}`, `{draw}`, `{echo}`, `{teleport}`, `{rope}` print the right key, or the touch button).
- Every obstacle has a purpose: it needs **both players**, an ability, or it sends them to a particular place (sometimes apart).
- **Abilities**: crystals (`crystals`, `for: blue|pink`). At least **two rooms between pickups** (rooms 3, 6, 9), a pickup room gives
  the two players **different** abilities, and both are needed to finish it. Extra hearts are crystals too (`ability: "heart"`).
- **Hearts**: 3 each; losing one sends you to your last **checkpoint**; reaching the exit refills both; run out and the room restarts.
- **Checkpoints** sit after every gate so a death never strands anyone for good. Gates are built so the partner on the wrong side
  can always get across (lever, drawbridge, ramp, rope, teleport).
- A chapter is 10 rooms. The 10th is the finale (uses everything) and ends with “CHAPTER COMPLETE”.
- **Crates** (`crates.js`) can be pushed: stand on them, weigh down a plate, or push one off a lever, key or crystal it hides. Place them with care: a crate on a plate can let ONE player hold a gate the pair were meant to share, so only use that where the room still needs both.
- No exploits: `scripts/check-doors-exploits.mjs` checks that a lone player cannot run a hazard gate, an ordinary jump cannot clear a boost-only pit, and that gates can't be skipped by teleporting (`teleportBarriers` in the level JSON).
- Proof: every room has a scripted playthrough (`scripts/check-doors-ch1-NN.mjs`) driving both players with only legal inputs.

## Opening scene (`intro.js`, `introrig.js`)

After **Tap to Start** the screen is black; a central door opens and a white light grows as it does. The two walk toward the
camera, the camera swings to side view (zoomed in), a chat bubble appears over each head; the first to click one says “Where are
we?”, the other answers “I'm not sure…”. The door shuts and locks, the camera zooms out, revealing a door on the far side of the
small room. Whoever reaches it first falls through a trapdoor to the lower level (still on screen), and it closes. The game begins.

## Chapter 1 — The Basement (brick) — built

| Room | Title | New | Gates |
|---|---|---|---|
| 1 | Separated | plates, levers, jump, crouch, trapdoor | split across two levels; plates and levers for each other; the upper level drops to join the lower |
| 2 | Pipe Dreams | pits, fire, doors | |
| 3 | First Light | **crystals**: Blue Jump Boost, Pink Solid Light | plate door; slab (carry); 3-tall door; drawn bridge |
| 4 | Stepping Stones | arrows, falling spikes | roof of light; 4-wide pit; combined gate |
| 5 | Heartbeat | boulders, collapsing floor, **extra hearts** | plate stops boulders; carry to a slab; ramp over a wall |
| 6 | Mirror Mirror | **crystals**: Blue Light Echo, Pink Teleport | two plate doors in a row; ramp + teleport |
| 7 | The Long Fall | crushers, lasers | two-plate door (echo + player); crushers; 4-tall door (ride); laser |
| 8 | Boiler Room | blades, wind | blade lane (+heart); updraft over a wall past a laser (+heart); blade pair |
| 9 | Hangman's Walk | **crystals**: Blue Light Rope, Pink Solid Light II | 4-wide pit (boost + rope); 14-wide bridge; crushers |
| 10 | The Furnace | finale | everything: echo, boulders, ramp, teleport, ride, boost + rope, long bridge, crushers (+last hearts, 6 each) |

(See each file's `notes` for the exact intent of its gates.)

## Later chapters — outlines only (not built)

**Chapter 2 — The Skyscraper.** Theme: office floors with real windows onto a pixel-art city (parallax skyline, day to dusk across
the chapter). **Ladders arrive here** (room 11), with a proper climbing animation (hands and feet alternate, hold to climb, jump to let go);
ladders are cut by doors, gated by plates, and carry-able only one at a time. New obstacles: elevators (call button on one floor, car
needs a weight), glass floors that crack, sprinklers (put out fire jets), swivel chairs/conveyor belts. Pickups at rooms 13, 16, 19
(second levels of earlier abilities and a new level of Light Rope for swinging between floors).

**Chapter 3 — The Rooftops.** Open sky: wind everywhere, antennas to swing from, zip lines, billboards that rotate into platforms.
Falling from a rooftop is a clear death; checkpoints are chimneys. Gravity doors return.

**Chapter 4 — Outer Space.** Low gravity zones, moving asteroids, airlocks (pressure plates that need both), flipped gravity
sections, and a final room reusing every ability at its highest level.
