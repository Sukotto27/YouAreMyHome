// Firebase data model for the co-op game. Replaces server/server.js's WS
// protocol (hello/welcome/snapshot/world_set/world_op/move/log/chat/
// time_sync/interaction_*) from the original YouAreMyHome repo.
//
// Split by durability, same reasoning apps/couples-app already uses for
// Draw's live strokes vs. its Firestore-backed features:
//   - Firestore: authoritative, low-frequency writes, needs to survive a
//     refresh/late join (world blob, activity log, chat, inventories).
//   - Realtime Database: ephemeral, high-frequency or "is this happening
//     right now" state (positions, presence, op hints, day/night clock) —
//     same pattern as useThumbkiss.js and DrawingCanvas.jsx's live points.
//
// Role replaces the old "room=scott-cristina&want=scott/cristina" URL
// params: there is only ever one couple, so role is derived from the
// signed-in Firebase user, same matching convention as nicknames.js. The
// host (p1/Scott) is the sole writer of the authoritative world doc,
// mirroring server.js's "only p1 can authoritatively set the world" rule.

export const HOST_ROLE = 'host' // was p1 / "scott"
export const PARTNER_ROLE = 'partner' // was p2 / "cristina"

export function roleFor(user) {
  const name = (user?.displayName || user?.email || '').toLowerCase()
  if (name.includes('scott')) return HOST_ROLE
  if (name.includes('cristina')) return PARTNER_ROLE
  return null
}

export function isHost(user) {
  return roleFor(user) === HOST_ROLE
}

// ---- Firestore (durable) ----
// Flat top-level collections partitioned by a `worldId` field, matching
// apps/couples-app's flat-collection style (no per-couple nesting, since
// there's only ever one couple/world at a time).

export const FIRESTORE = {
  // Doc id = worldId. { hostUid, hostName, worldJson: string, version, updatedAt }
  // worldJson is the JSON-serialized { tiles, objects, meta } blob (was
  // server.js's `activeWorldPayload`) stored as a single string field
  // in one doc — deliberately NOT structured Firestore arrays/maps, so it
  // isn't subject to Firestore's per-field auto-indexing overhead. Fine
  // under the 1MiB doc cap at current 80x80 size (~150-250KB estimated);
  // if the map grows enough to approach that cap, swap worldJson for a
  // Cloud Storage object reference instead — same doc shape otherwise.
  worlds: 'gameWorlds',

  // Doc id = worldId. { inventories: [inv0, inv1], buildings, farms, updatedAt }
  // Changes at a different cadence than terrain, so kept separate from
  // gameWorlds rather than bloating that doc on every inventory tweak.
  state: 'gameState',

  // Query: where('worldId','==',id).orderBy('seq','desc').limit(200)
  // { worldId, seq, text, by (uid), at (serverTimestamp) }
  // Mirrors server.js's actionLog 200-entry cap for late joiners.
  log: 'gameLog',

  // Query: where('worldId','==',id).orderBy('at','desc').limit(100)
  // { worldId, text, by (uid), at (serverTimestamp) }
  chat: 'gameChat',
}

// ---- Realtime Database (ephemeral) ----
// All rooted under game/{worldId}/... — RTDB paths nest naturally, unlike
// Firestore collections, so worldId as a path segment is idiomatic here.

export const rtdbPaths = {
  // { x, y, facing, animState, mode, updatedAt } — each client writes only
  // its own uid's node; onDisconnect().remove() replaces the old 25s
  // ping/pong heartbeat + connectedSlots presence tracking.
  player: (worldId, uid) => `game/${worldId}/players/${uid}`,
  players: (worldId) => `game/${worldId}/players`,

  // push()-streamed { op, by, at } hints for the partner's client to
  // animate immediately (harvest, build-stage progress, etc.) — NOT the
  // source of truth, gameWorlds.worldJson is. Mirrors the old world_op
  // relay, which server.js also never applied to its own state directly.
  worldOps: (worldId) => `game/${worldId}/worldOps`,

  // { day, phaseT, t, updatedAt } — written by the host only, both clients
  // read. Replaces the old time_sync relay.
  time: (worldId) => `game/${worldId}/time`,

  // Ephemeral handshake payload for interaction_request/respond and
  // trade_state/trade_inv/trade_cancel — same shape as those old WS
  // payloads, just synced via RTDB instead of relayed through a server.
  interaction: (worldId) => `game/${worldId}/interaction`,

  // { online: true, name } + onDisconnect().remove()
  presence: (worldId, uid) => `game/${worldId}/presence/${uid}`,
}
