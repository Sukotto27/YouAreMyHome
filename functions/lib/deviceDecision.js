// Pure decision logic for registerDevice, kept free of Firebase so it can be
// unit-tested (see deviceDecision.test.js). Given what's already on record,
// says what should happen to a device that just checked in.

const LEARNING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000 // silent baselining after first rollout
const PENDING_TTL_MS = 24 * 60 * 60 * 1000 // pending requests older than this stop counting
const MAX_PENDING = 5 // per account — caps alert spam from a stranger minting device IDs

// device:  the existing devices/{uid}/list/{deviceId} data, or null if unseen
// cfg:     { enforce: boolean, learningUntilMs: number }
// pending: [{ firstSeenMs }] — this account's currently pending devices
// now:     epoch ms
//
// Returns:
//   status  — what to tell the device: approved | pending | denied | revoked | blocked
//   action  — 'create' (write a new device doc), 'touch' (update last-seen), or 'none'
//   notify  — null | 'new' (monitor mode: heads-up) | 'pending' (enforcing: needs approval)
function decideRegistration({ device, cfg, pending, now }) {
  if (device) {
    if (device.status === 'approved') return { status: 'approved', action: 'touch', notify: null }
    return { status: device.status, action: 'none', notify: null }
  }

  if (cfg.enforce) {
    const recentPending = pending.filter((p) => now - p.firstSeenMs < PENDING_TTL_MS).length
    if (recentPending >= MAX_PENDING) return { status: 'blocked', action: 'none', notify: null }
    return { status: 'pending', action: 'create', notify: 'pending' }
  }

  const learning = now < cfg.learningUntilMs
  return { status: 'approved', action: 'create', notify: learning ? null : 'new' }
}

module.exports = { decideRegistration, LEARNING_WINDOW_MS, PENDING_TTL_MS, MAX_PENDING }
