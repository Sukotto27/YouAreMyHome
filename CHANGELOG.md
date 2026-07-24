# Changelog

Every shipped change gets an entry here and a version bump in
`apps/couples-app/package.json` — patch for fixes/tweaks, minor for new
features, major for breaking/large redesigns. The version shown at the
bottom of Home always reflects the latest entry below.

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
