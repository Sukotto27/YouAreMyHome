# Changelog

Every shipped change gets an entry here and a version bump in
`apps/couples-app/package.json` — patch for fixes/tweaks, minor for new
features, major for breaking/large redesigns. The version shown at the
bottom of Home always reflects the latest entry below.

## v1.47.1

- Doors is marked "Still in testing": a note on its card in the Games menu and
  an "In testing" badge in the game's header.

## v1.47.0

- Doors: mobile touch controls and a pixel-art look. On a phone (or with T on a
  desktop) you get a floating virtual joystick in the lower left (drag sideways
  to move, down to crouch), a JUMP button and a USE button in the lower right, a
  small ACT button, and a scrollable toolbelt of the abilities you have found:
  tap one to select it, then USE. A NEXT button cycles the teleport action. The
  device plays one character and their view fills the screen.
- Everything is restyled as an old-school platformer: the Press Start 2P pixel
  font, chunky bevelled pixel buttons, 12x12 pixel-art icons for each ability
  and control, pixel boxes for the HUD, hints, "room clear" and the obtained-
  ability dialog (which names the toolbelt buttons instead of keys on touch).
- Tap "room clear" for the next room. New `scripts/check-doors-touch.mjs`.

## v1.46.1

- Fix: the Teleport marker. "Mark here" and "Go to mark" were two separate actions,
  so once you had marked a spot the key just kept re-marking until you switched
  action. They are now one "Marker" action: the first use places the mark, using
  it again from anywhere teleports you back to it, and using it while standing on
  the mark picks it up (so you can place a new one). The HUD says which it will do.
- Obtaining an ability now opens a dialog box ("Blue has obtained Jump Boost II",
  the level, and how to use it with that player's own keys) and pauses the game
  until you press Enter, Space or click.

## v1.46.0

- Doors: two more abilities, and a distinct colour for each. Crystals are now
  Solid Light cyan, Jump Boost yellow, Teleport violet, Light Echo green and
  Light Rope orange (the HUD uses the same colours).
  - Light Echo (X / `;`): leaves a translucent copy of you that holds down a
    pressure plate. It lasts 5s at level 1, 10s at level 2, 20s at level 3.
  - Light Rope (C / `'`, then click a spot): a rope of light shoots to where
    you click (7 / 11 / 16 tiles by level) and latches onto the first thing it
    meets. On a surface, ideally the ceiling, you swing from it (left/right
    pump, crouch reels in, jump lets go). On a loose key, crouch reels it in. On
    your partner, crouch pulls them across to you. It lasts 4 / 7 / 12s.
- Solid Light: while drawing, the caster turns toward the line and extends an
  arm at it, with a glow at the hand.
- New test room 10 (key 0): an echo holds a plate, two pits crossed by swinging,
  a key fetched from an island with the rope, and Pink pulled over a pit. Room 9
  now has all five abilities. Verified by `scripts/check-doors-abilities2.mjs`
  and a scripted playthrough (`scripts/check-doors-room10.mjs`).

## v1.45.0

- Doors: unlockable abilities. Crystals (a spinning, shiny 3D shard, ringed in the colour
  of the player it is for) grant abilities: one crystal per player per room, placed so each
  needs the other's help. Each ability starts at level 1 and a further crystal raises it, up to 3.
  - Solid Light (the drawing): L1 as before (12 tiles, 3s); L2 18 tiles, 5s; L3 24 tiles and it
    lasts until the caster moves.
  - Jump Boost: L1 a slight lift with a burst of light; L2 a double jump off a stepping stone of
    solid light; L3 up to three stones: up, diagonal (hold a direction) or forward (direction +
    crouch).
  - Teleport (F / `,`; G / M change the action): L1 to your partner; L2 also swap places; L3 also
    mark a spot and return to it from anywhere.
  A HUD lists your abilities, found-crystal messages appear for both players, and N continues
  to the next room keeping them. New test rooms 8 (crystals) and 9 (all abilities at level 3).
  Verified by `scripts/check-doors-abilities.mjs` and scripted playthroughs of both rooms.

## v1.44.1

- Doors: removed the toggling ("flip") gravity door: touching one sent you
  straight back the way you came, so you could never get past it. Gravity doors
  are now "up" (ceiling) or "down" (floor) only, and a door does nothing to
  someone it can't change, so you can walk on through an "up" door once you
  are up on the ceiling. Room 7 uses an up/down pair at the pit.
- Fix: room 7's last door was 14 tiles tall. It is a normal 3-tile door on the
  ceiling now, with solid wall below it.

## v1.44.0

- Doors: gravity (milestone 6). Gravity doors flip you onto the ceiling, which
  is a walkable second floor (and back, or "up"/"down" explicitly). Your pane
  rolls upside down with you and your character tumbles, so on your own screen
  the ceiling is your floor; left/right follow your screen. Traps, doors, plates,
  switches, keys, portals, the exit, drawn lines and the camera all work for a
  flipped player; plates, switches and flags can hang from the ceiling. Shoulder
  carry works between two ceiling players (not mixed), and checkpoints remember
  which way up you were. New test room 7 (key 7): a wall only the ceiling
  passes, a ceiling plate opening a floor door, a pit crossed on the ceiling,
  and an exit up there. Verified completable by scripted play
  (`scripts/check-doors-room7.mjs`); rules in `scripts/check-doors-gravity.mjs`.
- Fix: a vertical drawn line could be climbed like stairs if it was drawn from
  the bottom up; it is now a wall whichever way it was drawn.

## v1.43.1

- Doors: every door type now has a symbol on the front of its leaf (it swings
  away with the door): ring (anyone), person in blue/pink (that player), arrow
  onto a pad (plate), lever (switch), key, opposing arrows (flip), two chain
  links (linked), a single arrow (one-way), blue and pink circling arrows
  (swap) and a die (random). Replaces the text labels above the doors.

## v1.43.0

- Doors: the remaining door types (milestone 5): key doors (pick up, carry and
  hand over keys), flip-on-pass doors, linked see-saw doors, one-way doors, swap
  doors that change colour after their owner passes, seeded random doors, and
  portals (a carrying pair goes through together). New test room 6 (key 6): a
  gate for each, including a two-level route where one player's passage opens
  the other's door. Verified completable by scripted play
  (`scripts/check-doors-room6.mjs`); rules in `scripts/check-doors-doors2.mjs`.

## v1.42.0

- Doors: shoulder carry (milestone 3b). Land on your partner's head and you ride
  their shoulders: you move with them as they walk (30% slower), jump and crouch.
  Jump to leave, or walk off. Jumping off a rising carrier gives a chained boost
  (about 7 tiles instead of 4). The carrier's collision box includes the rider, so
  the stack can't walk under low ceilings. The carry ends if either player dies
  or the carrier starts drawing. New test room 5 (key 5): a 4-tall and a 6-tall
  slab over doored tunnels, each opened by a switch on top. Verified completable
  by scripted play (`scripts/check-doors-room5.mjs`); rules in
  `scripts/check-doors-carry.mjs`.

## v1.41.0

- Doors: second batch of traps, in new test room 4 (key 4). Crushers slam,
  hold and rise (a drawn line under one props it open); swinging blades are
  stopped dead by a drawn line in their swing; wind fans (sideways, up, down)
  push players, are cut off by drawn lines, and can pulse. Wind never kills: it
  carries you across a gap, lifts you over a wall, or shoves you into something.
  New checks in `scripts/check-doors-traps2.mjs`.

## v1.40.0

- Doors: first batch of traps, placed on the obstacles in test room 3: fire
  jets, lasers, an arrow wall, falling spikes, collapsing floor and a rolling
  boulder, plus checkpoint flags (per player, with 0.8s of respawn protection).
  Drawn lines are solid to every hazard whoever drew them, so a line can shield
  a partner or deflect a boulder. Room 3 is verified completable with drawing
  alone by an autopilot test. Crushers, swinging blades and wind fans are still
  to come.

## v1.39.1

- Doors: each test room now shows a short how-to hint when it loads (it fades
  after a while; press **H** to show or hide it again) — e.g. room 3 explains
  that its walls and wide gaps can't be jumped and need a drawn ramp or bridge.

## v1.39.0

- **Doors: solo testing controls.** Press **Tab** to control just one
  character (the other stands still): the arrow keys, WASD, both draw keys and
  both interact keys all drive the character you're on, and Tab flips to the
  other one — so you can draw as Blue, press Tab, and run Pink across the line
  with the same keys. The active view gets a coloured border ("● you"); the
  other is marked "(waiting)". Press **`** to go back to two players.
- **Test room 3 has three more obstacles:** *stepping stones* (a 6-wide gap, a
  small stone, another 6-wide gap — needs two lines, since one line can't span
  both), a *wall 8 tall* (a long steep ramp using almost all your ink) and a
  *pit 6 wide and 6 deep* (bridge it, or climb down and draw a ramp out). The
  room is now 160 tiles long. A perfect running jump can clear a 5-wide gap but
  not a 6-wide one, so every drawing obstacle uses 6 or more; automated checks
  prove none of them can be beaten by jumping alone.

## v1.38.0

- **Doors milestone 3: co-op drawing.** Press **Q** (Blue) or **.** (Pink)
  while standing on the ground to enter draw mode, then drag the **mouse** in
  either player's view to draw a line. The line is solid **only to your
  partner**, lasts 3 seconds, and you stay frozen in place until it fades. A
  line has a maximum length (12 tiles of ink), a 2-second cooldown follows, and
  only one player can draw at a time. Press the key again to cancel. Lines are
  see-through to you and solid-looking to your partner, and fade out. A line
  drawn through your partner never traps them. Players now also step up small
  ledges, so a drawn ramp can lead onto a platform.
- New **Test room 3** (keys 1-3 switch rooms): an 8-wide gap, a 5-tall wall
  you can't jump, and a 10-wide gap — each needs you to draw for each other.
  All the numbers (lifetime, ink, cooldown, thickness) are in `config.js`.

## v1.37.1

- Fixed: the exit showed two doors. It is now a single door, centred in the
  (two-tile-wide) exit area where both players stand.

## v1.37.0

- **Doors are now built across the corridor.** A door blocks the way you
  walk, so its leaf now spans the tunnel's depth and faces along the corridor
  (seen mostly edge-on from the front, with a brass knob on each side and a
  little of its painted face showing). The frame runs the full depth of the
  surrounding blocks. A door hinges at the back and swings 90° to lie flat
  against the back wall when it opens; the exit's two leaves open in opposite
  directions. A door can set `"swing": -1` to open the other way.
- Slightly stronger camera angle (5° -> 7°) and a soft fill light from the
  camera's side so door faces and block sides aren't left dark.

## v1.36.1

- Fixed: doors hung on the wrong side. A door now hinges on the edge opposite
  its knob and swings back into the recess behind it; the exit's two leaves are
  mirrored so their knobs meet in the middle and they open from the outside
  edges.

## v1.36.0

- **Doors now swing open and shut.** Each door's leaf hangs on a hinge and
  swings back into the recess behind it (about 0.4s) when it opens, and
  swings closed again when it shuts. A coloured door swings open only on the
  pane of the player who can pass it. The exit's double doors swing open as you
  reach them.
- **Doors fit the 3D layout.** The door frame now runs the full depth of the
  surrounding blocks, so each door sits inside the wall like the tiles do
  instead of floating in front of it, and the knobs are brass.

## v1.35.0

- **Doors now has a real 3D look.** The whole side view is a 3D scene seen
  through a narrow camera tilted just slightly to the side and above, so tiles
  read as solid blocks with visible tops and sides, with a brick wall behind
  and a soft shadow under each player.
- **Real door models.** Every door is the household door model from the Home
  game, painted gray, blue or pink; the exit is the plain brown double door.
  A door is see-through when *you* can pass it, solid when you can't.
- **Test room 2 reworked for solo testing.** Corridors are now 3 tiles tall
  (so passing your partner takes a crouch + a jump), and purple **BYPASS**
  switches sit by each co-op-only door — the Blue/Pink lane doors, the plate
  gate and the both-players gate — so one person can skip them.
- Taps on a key that start and end between two frames are no longer missed.

## v1.34.0

- **Doors: players are now solid to each other.** You can't walk through your
  partner; to swap sides one crouches and the other jumps over (in a tight
  corridor that's the only way). You can also land on your partner's head and
  stand there.
- **Doors milestone 2: doors.** Gray (anyone), Blue and Pink (only that
  player), plate doors (open while a plate is held — one plate, either of
  several, or both players on their plates, with an optional hold-open
  timer), switch doors (flipped with **E** for Blue / **/** for Pink; toggle or
  one-shot), and the brown exit (both players must stand in it). A door never
  closes on someone standing in it. New **Test room 2** (keys 1/2 switch
  rooms) walks through every type; an automated autopilot confirms it can be
  completed.
- Shoulder-carry (jump on a partner to stand on their shoulders, jump higher
  from there) is on the roadmap as the next mechanic after drawing.

## v1.33.0

- **Doors (work in progress)** added to Games: a two-player co-op side-view
  platformer. This first milestone has the engine and movement: run, jump
  (hold for height), crouch (and crawl under one-tile gaps), tile collision,
  and a large test room with gaps, steps, a crawl tunnel, stairs, floating
  platforms and a climb. Each player gets their own camera pane; Blue and Pink
  are Scott and Cristina's 3D models seen from the side. Blue uses WASD + S,
  Pink uses the arrow keys; **R** resets the room and **F1** shows a debug
  panel. Doors, drawing and traps come in the next milestones.

## v1.32.0

- **Game notifications.** The Games icon in the nav now shows a dot whenever
  a game needs you, and each game on the Games screen gets a pill — **Invited!**
  when your partner invited you to it, or **Your turn** when they're waiting on
  you (Farkle and Uno turns, a Story blank to fill, a Song line to add, a Mad
  Lib they've answered, or a Cards Against Couples card to play).
- **Game invites on the avatar.** Your partner's avatar on Home gets a badge
  with the game's emoji when they've invited you to play; tap it to jump in.
  Opening the game clears its badge.

## v1.31.0

- **Bananagrams tiles can be dragged.** Click/touch and drag a tile from your
  rack or from the grid onto any square (the target square lights up, and the
  board scrolls when you drag near its edge). Drop a grid tile off the board
  to send it back to the rack. Tap-to-select still works too.

## v1.30.0

- **Bananagrams now starts with a Split.** Tiles are dealt face down; when
  either of you calls **Split**, you both flip your tiles over at the same
  moment and the race begins.
- New official how-to-play wording for **Farkle** and **Bananagrams** (the
  Farkle text now includes a quick scoring table).

## v1.29.0

- Preview/demo mode only: an **Edit instructions** button on each game's start
  screen lets the how-to-play wording be edited in place, with **Copy all my
  edits** to hand the final text over to be made official in the code. Not
  shown in the real app.

## v1.28.1

- Fixed: the End game button in Bananagrams did nothing.

## v1.28.0

- **Every game now has an End game button.** Obstacle Drop, Rock Paper
  Scissors, Pong, Bananagrams and Cards Against Couples get one in their top
  bar (tap twice to confirm); Farkle and Uno's "Cancel game" now uses the same
  button. Ending a game sends you both back to its start screen with a note
  saying who ended it.
- Fixed: starting a new Bananagrams game could show tiles pre-placed from the
  previous game's layout.

## v1.27.0

- **Cards Against Couples** added to Games. A fill-in-the-blank card game for
  two with couples-themed prompts and answers. Each round you both get the
  same prompt and secretly play a card from a hand of 7; both answers are
  revealed together, filled into the prompt. No judge and no score — just
  laughs, with emoji reactions. Includes Invite partner.

## v1.26.0

- **Bananagrams only accepts everyday words.** The dictionary is trimmed from
  ~173,000 Scrabble words to ~34,000 common ones, so obscure words like "qi",
  "aa" and "colchicine" no longer count. It also downloads about 5x less.

## v1.25.0

- **Bananagrams now checks words for you.** Invalid words turn red as you
  build, and the moment all your tiles form one connected grid of real words
  it **peels automatically** (or wins with **Bananas** once the pile is too
  small). The honor-system claim/challenge step is gone. Uses the public-domain
  ENABLE word list, loaded only when you open Bananagrams.

## v1.24.0

- **Bananagrams** added to Games. Both of you build your own word grid from a
  shared pile of letter tiles (Short: 72 tiles, Full: 144). Use every tile in
  a connected grid to **Peel** (you both draw one), **Dump** a tile for three,
  and when the pile runs low call **Bananas** — your partner checks your
  words and accepts or challenges. Honor-system word checking, like the real
  game. Includes Invite partner.

## v1.23.0

- **Pong** added to Games. Drag your paddle along the bottom, your partner's
  is at the top; the ball speeds up every hit and the angle depends on where
  it strikes the paddle. First to 5 or 7. Colorful hit and goal effects with
  sounds, a 3-2-1 start, and Invite partner. In preview/demo mode you play a
  slightly beatable AI.

## v1.22.0

- **Rock Paper Scissors** added to Games. Pick your move during a 3-2-1
  countdown (change it any time before 0); on 0 both picks are revealed
  together. Best of 3 wins, ties replay the round. Includes Invite partner.

## v1.21.0

- **Obstacle Drop upgrades.** A 3-2-1 countdown before each match, a much
  bouncier ball, and lines now vanish the moment the ball bounces off them
  (the 10-second timer remains only as a fallback for lines it never hits).
  Bounces and goals get colorful bursts, rings and a floating +1, plus sounds.

## v1.20.0

- **What's new walkthrough.** Cristina sees a one-time welcome message with a
  short slideshow of the major recent features (Smack Butt, games, chat
  bookmarks, music sessions, avatar quick actions). Shown once per device.

## v1.19.0

- **Press and hold your partner's avatar on Home** to open a quick menu:
  Send Message, Send Love Letter, Send Love, Invite to Game, Start Jam Session.
- **Smack Butt 🍑** added to Send Love — no once-a-day limit.
- Home weather now shows both temperatures in your own unit (°F for Scott,
  °C for Cristina), and the weather cards are a fixed size so they stay side
  by side instead of stacking.
- Removed the "a little corner of the internet…" tagline and changed the
  footer to "Meu amor, meu caminho, meu lar".

## v1.18.0

- **Chat bookmarks.** Long-press any message and pick **Bookmark** — a little
  colored ribbon appears down the right edge of Chat, and tapping it scrolls
  straight to that message (even if it's older than what's loaded). Each new
  bookmark gets a different color, and you take one off the same way you put
  it on (long-press → **Remove bookmark**). Bookmarks are per-person: yours
  only show up for you, hers only for her.
- Fixed a dead music session lingering for months: a leftover music node with
  a track but no host made the Home avatar show "hosting a live music
  session" and the Music tab say your partner was hosting, and the auto-expiry
  never cleaned it up because the node looked "not joined." The UI now only
  treats a session as live when it's actually active, a stray write can no
  longer recreate an ended session, and any leftover is swept automatically.
- Removed vanishing images entirely — the send-photo dialog is now just a
  preview with Send/Cancel, and the every-minute `expireVanishingImages`
  Cloud Function is gone (it was the main source of the small Firebase
  charges).

## v1.17.0

- New game: **The Never-Ending Song**. Same take-turns-forever shape as the
  Never-Ending Story, but every line you add has to be a real song title (or
  a few strung together) — you can only sprinkle in small filler words to
  make it read grammatically, and you can't change the titles themselves.
  Each turn also records which song(s) you used. Has its own "Invite
  partner" ping and in-app popup like the other games.

## v1.16.0

- Every tab now has a consistent back button in the header, and it always
  returns you to whichever tab you were actually on before — not hardcoded
  to Home. (Settings, for instance, used to always dump you back on Home
  even if you opened it from Chat or Music.) Tabs that had no back button at
  all before (Chat, Music, Tree) now get one too.

## v1.15.0

- Mad Libs no longer blocks you from seeing your own filled-in story while
  waiting on your partner — whoever finishes first sees theirs immediately,
  with the other side's card appearing as soon as they submit too.
- The Music tab now shows a play count on every track, and shuffle now
  favors songs that have been played less — heavily-played tracks still come
  up, just less often.
- Gallery photos can now be deleted (with a confirm step) — removes the
  photo and its comments for both of us, since there's nothing to keep on
  just one side.

## v1.14.0

- Fixed live music sessions not auto-ending when a phone locks, the app gets
  closed, or the connection drops — the 10-minutes-both-inactive cleanup used
  to only notice an explicit pause, so a session could get "stuck" showing as
  live (and, on reopening, unexpectedly jump to a random new track) forever.
  It now also treats a device that's gone silent as inactive.
- The Music tab now shows the other person's avatar right next to the host's
  whenever you're both actually listening at the same moment, not just both
  "in" the session.
- Fixed pausing music, closing the app, and reopening it later resuming
  playback anyway — your pause now persists for that session and is restored
  the moment the app reconnects to it.
- Chat settings now shows how many texts we've exchanged in total, plus our
  daily chatting streak (going since Jan 18, 2024 — the day it all started).
- The Music tab now shows a running total of how much time we've spent
  actually listening together (both of us active at once), across every
  session ever.

## v1.13.0

- Music sessions no longer auto-play on your partner's device the moment you
  start one — they now get a "Join session" prompt on the Music tab instead
  (plus a badge on the Music tab and the existing 🎵 avatar badge if the
  session was already going when they opened the app).
- If you're both already in the app when one of you starts a session, the
  other now gets a live popup asking if they want to join.

## v1.12.0

- Music tab: every track now lists inline on the page itself (no more
  separate "all tracks" or "Favorites" screens) — tap the heart on any row
  to favorite it, and see whose favorite it is by their avatar.
- Added a one-time popup explaining how live music sessions work, shown the
  first time either of us opens the Music tab.
- The host's avatar now shows next to "hosted by" on the Music tab; a 🎵
  badge appears on whichever of us is hosting a live session, right on the
  Home page avatars.
- Added a mute button (Music tab and mini bar), separate from the volume
  slider — mutes without losing your volume level.

## v1.11.0

- Music is now a shared "radio station": whoever starts a session is the
  host, and it keeps playing as if live until the host ends it. Pausing on
  your device no longer pauses it for your partner — it just stops your own
  audio, and resuming snaps you back in sync with wherever the session
  actually is.
- If you're both paused for more than 10 minutes, the session ends
  automatically, and the mini bar disappears until someone starts a new one.
- Added a circular progress ring around the spinning record, and a thin
  progress bar across the top of the mini bar, both showing how far into the
  current track the session is.

## v1.10.0

- Fixed the Music tab only showing 7 of 58 songs — the rest had been
  incorrectly split off into a separate folder for the game. All 58 tracks
  now live in one shared source and serve double duty as both the game's
  background music and the Music tab's library.
- Larger, easier-to-read title text on the spinning record.
- Added shuffle (on by default, shared between you both — same as the rest
  of playback).
- Added a volume slider, in both the mini bar and the Music tab — deliberately
  per-device, not synced, so you can each set your own listening volume.
- Added favorites: tap the heart on the mini bar or in the Music tab, and a
  new Favorites view lists every song either of you has favorited, showing
  whose it is.
- Added a sleep timer (Music tab, 15/30/45/60 min) that pauses playback on
  your device only, without interrupting your partner if they're still
  listening.

## v1.9.0

- Added a "See all tracks & comment on them" link to the Music tab — opens a
  full list of every song, each with its own comment thread (same
  add-a-comment pattern already used on Calendar events, Q&A rounds, and
  Gallery photos), so you can leave a note on a specific song without it
  crowding the main now-playing screen.

## v1.8.1

- Fixed Music tab track titles: they now come from each file's embedded ID3
  Title tag (read once at build time) instead of the filename — so files
  that share a filename pattern but are genuinely different songs (or are
  named with technical/internal names) show their real titles. Also
  consolidated audio storage: both this app and the game now draw every
  track from one shared `music/` folder at the repo root instead of each
  keeping its own copy, so there's exactly one place to add or update a
  file going forward.

## v1.8.0

- Added a real Music tab: drop a retitled `.mp3` into `src/assets/music/` and
  it shows up automatically (the filename is the title, no extra setup).
  Playback is synced between the two of you — whoever starts a song
  establishes a shared session, and opening the app later on the other side
  picks up right where it should be, automatically, no need to both be
  looking at the app at the same time. A thin control bar (play/pause/next/
  previous) stays visible above the bottom nav on every page while a song is
  active. On the Music page itself, the spinning record shows the current
  track's title arced around the label, and only spins while actually
  playing.

## v1.7.0

- Replaced missed-activity dialogs with passive avatar badges. Send Love no
  longer pops up a modal (live or otherwise) — like every other feature now,
  it's a small icon that waits patiently instead of ambushing you when you
  open the app. Each notification type has its own fixed position around the
  avatars (a consistent six-slot ring): Chat, Mail, Send Love, Calendar
  (something's coming up in the next week), Q&A (a question is awaiting your
  answer), and Journal (your partner checked in and you haven't yet). Mail
  and Send Love badges show on your partner's avatar; Q&A and Journal show on
  your own; Calendar shows on both.

## v1.6.0

- Journal and Calendar now surface unread activity at the sub-tab level, not
  just as a single badge on the nav icon — Journal points at Status or Daily
  Goals when that's specifically where the new activity is (everything else
  defaults to Timeline), and Calendar points at whichever of
  Milestones/Date Night/Plans/Goals the latest unseen item belongs to.
- Added Date Night "Sync-Up": once a scheduled Date Night is within an hour
  of starting, its Calendar row shows a live countdown and, once the time
  arrives, a "Start Together" button. Each of you tapping ready shows both
  your local start times and a ready indicator for the other; once you're
  both ready, a synchronized 5-second countdown counts you both into
  starting something (a movie, etc.) at the same moment.
- The Home page now shows a small countdown icon near the avatars whenever a
  Date Night is about to start (same one-hour window as Sync-Up), tapping it
  jumps straight to the Date Night tab in Calendar.

## v1.5.0

- Added the Tree of Union — a new tab that grows a stylized branching tree
  from everything the two of you do in the app (besides Chat): one main
  branch per feature, sized and colored consistently, with smaller branches
  for each interaction and twigs for comments on them. The trunk is sectioned
  by anniversary year, tallest at the base (the first year together) and
  still visibly growing in the current one. Tap or hover any branch to see
  what it was. Backed by a new `treeEvents` collection that Cloud Functions
  write to at each feature's existing milestone moments (both answering a
  Q&A, a finished game, a photo upload, and so on — never every small step
  within one, so years of daily use stay legible instead of cluttered); a
  one-time "Rebuild from history" action on the page reconstructs everything
  that already happened before this shipped. Known gap: Farkle and Uno keep
  only their current match, not a history of past ones, so past finished
  games can't be reconstructed — only new ones from here on will show
- Q&A: added an "Answered by Both" category showing every question you've
  both answered, tagged with its original category

## v1.4.0

- Added Uno to Games — the standard 108-card deck, played 2-player on a
  single ever-live shared match (same pattern as Farkle): match color or
  number or play a Wild, Skip/Reverse hand the turn right back to you since
  there's only the two of you, first to empty their hand wins

## v1.3.6

- Fixed "Submit my words" in Mad Libs silently doing nothing — the write
  to Firestore actually succeeded, but it used a dotted string key
  (`answers.${uid}`) with `setDoc(..., { merge: true })`, which (unlike
  `updateDoc`) stores that as one literal field named `answers.<uid>`
  instead of nesting into the `answers` map. The app reads
  `round.answers[uid]`, which never matched, so the screen never advanced
  even though the answers were saved. Fixed by writing a real nested
  object (`{ answers: { [uid]: answers } }`) instead

## v1.3.5

- Jump-to-latest-messages button in Chat is now white/translucent and
  centered at the bottom instead of a solid rose circle in the corner

## v1.3.4

- Fixed Chat opening scrolled to the top instead of the bottom — the
  auto-scroll-on-load only fired when the message count changed, but
  messages often finish loading before the encryption gate clears, so by
  the time the real chat UI (and its scroll target) actually mounted, the
  count had already stopped changing and nothing scrolled it
- Fixed the "jump to latest messages" button never appearing when scrolled
  up — it was a child of the scrolling message list itself, so it scrolled
  out of view along with everything else instead of staying pinned to the
  visible corner; also replaced the IntersectionObserver-based visibility
  check with a direct scroll-position check, which proved more reliable

## v1.3.3

- Fixed the new unsupported-notifications diagnostic (v1.3.2) not actually
  showing reasons on devices where the Notification API itself is missing
  — it was gated behind the same check it was meant to diagnose, so the
  most likely real-world case fell through to the old generic message

## v1.3.2

- Push notifications: when unsupported, Settings now shows *why* (missing
  Service Worker/Push API, cookies disabled, IndexedDB blocked, etc.)
  instead of a generic message — makes remote diagnosis possible
- Sending a photo (Chat or Gallery) that fails now shows the actual error
  on screen instead of silently doing nothing

## v1.3.1

- Fixed the "send a photo" file picker not opening on some mobile browsers
  (Chat, Gallery, and Settings' avatar upload) — the hidden file input now
  stays in the render tree (invisible, 1px) instead of `display:none`,
  which some mobile browsers won't invoke a native picker for

## v1.3.0

- Home: a small bouncing chat-bubble badge now appears on the other
  person's avatar whenever there's an unread chat message from them — tap
  it to jump straight to Chat

## v1.2.2

- Fixed the "jump to latest messages" button in Chat, which had stopped
  appearing — a side effect of the encryption gate delaying the chat UI's
  first real render past the point its scroll-tracking was set up

## v1.2.1

- Recipient's unopened vanishing-image placeholder now reads "Vanishing
  Image. Tap to view"
- Moved Settings to its own gear icon in the header (where Sign out used
  to be); Sign out moved into the bottom of the Settings page

## v1.2.0

- Tap any chat image to expand it full-screen (permanent or vanishing)
- Vanishing images: sender's unopened copy now reads "Unopened Vanishing
  Image." and shows with a slight transparency to set it apart from a
  normal photo; once opened, a small circular countdown ring (both of you
  see it) replaces the old plain-text timer

## v1.1.0

- New consolidated Settings page (replaces Profile) — avatar/display name,
  a sounds on/off toggle, notification status, chat background/color/font
  (moved out of the in-chat quick menu's now-removed duplicate Avatar tab),
  and Security (encryption key + migration), all in one place
- Fixed auto-download semantics: it's now the recipient's own preference
  (Settings → Photos in chat), not something the sender picks per-image —
  removed the "for them" checkbox from the send-image dialog

## v1.0.1

- Chat: removed the extra avatar button added in the top-left header —
  tapping your own avatar next to your messages (the one that was already
  there) now opens Profile instead

## v1.0.0

- End-to-end encryption for Chat messages and the shared Gallery
  (AES-256-GCM, client-side key setup, backup + migration tool in Profile
  → Security)
- Personal profile pages — avatar picker/upload and a cosmetic display
  name, reachable by tapping your avatar on Home or in Chat
- Send Love: "Sent!" confirmation + sound on send; no more "send one back"
  prompt when the incoming note is itself a reply to yours
- App version/commit/build-time shown at the bottom of Home
- Vanishing images in Chat — choose permanent or vanishing (disappears 1
  minute after the recipient opens it, skips the gallery) when sending a
  photo, plus an optional auto-download for the recipient
