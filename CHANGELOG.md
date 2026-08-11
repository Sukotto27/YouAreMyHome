# Changelog

Every shipped change gets an entry here and a version bump in
`apps/couples-app/package.json` — patch for fixes/tweaks, minor for new
features, major for breaking/large redesigns. The version shown at the
bottom of Home always reflects the latest entry below.

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
