// Run with: node --test functions/lib/deviceDecision.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { decideRegistration, MAX_PENDING, PENDING_TTL_MS } = require('./deviceDecision')

const NOW = 1_000_000_000_000
const learningCfg = { enforce: false, learningUntilMs: NOW + 1000 }
const monitorCfg = { enforce: false, learningUntilMs: NOW - 1000 }
const enforceCfg = { enforce: true, learningUntilMs: NOW - 1000 }

test('a known approved device just checks in, silently', () => {
  for (const cfg of [learningCfg, monitorCfg, enforceCfg]) {
    const out = decideRegistration({ device: { status: 'approved' }, cfg, pending: [], now: NOW })
    assert.deepEqual(out, { status: 'approved', action: 'touch', notify: null })
  }
})

test('during the learning window a new device is baselined silently', () => {
  const out = decideRegistration({ device: null, cfg: learningCfg, pending: [], now: NOW })
  assert.deepEqual(out, { status: 'approved', action: 'create', notify: null })
})

test('in monitor mode a new device is allowed but raises a heads-up', () => {
  const out = decideRegistration({ device: null, cfg: monitorCfg, pending: [], now: NOW })
  assert.deepEqual(out, { status: 'approved', action: 'create', notify: 'new' })
})

test('when enforcing, a new device is held pending and alerts', () => {
  const out = decideRegistration({ device: null, cfg: enforceCfg, pending: [], now: NOW })
  assert.deepEqual(out, { status: 'pending', action: 'create', notify: 'pending' })
})

test('pending, denied and revoked devices stay as they are, no new alert', () => {
  for (const status of ['pending', 'denied', 'revoked']) {
    const out = decideRegistration({ device: { status }, cfg: enforceCfg, pending: [], now: NOW })
    assert.deepEqual(out, { status, action: 'none', notify: null })
  }
})

test('a stale approved->revoked device is not resurrected by leaving enforcement off', () => {
  const out = decideRegistration({ device: { status: 'revoked' }, cfg: monitorCfg, pending: [], now: NOW })
  assert.equal(out.status, 'revoked')
  assert.equal(out.action, 'none')
})

test('too many recent pending requests blocks further ones', () => {
  const pending = Array.from({ length: MAX_PENDING }, () => ({ firstSeenMs: NOW - 1000 }))
  const out = decideRegistration({ device: null, cfg: enforceCfg, pending, now: NOW })
  assert.deepEqual(out, { status: 'blocked', action: 'none', notify: null })
})

test('old pending requests stop counting toward the cap', () => {
  const pending = Array.from({ length: MAX_PENDING }, () => ({ firstSeenMs: NOW - PENDING_TTL_MS - 1 }))
  const out = decideRegistration({ device: null, cfg: enforceCfg, pending, now: NOW })
  assert.equal(out.status, 'pending')
})
