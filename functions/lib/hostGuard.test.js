// Run with: node --test functions/lib/hostGuard.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { isBlockedHost } = require('./hostGuard')

test('blocks loopback, private, link-local and metadata addresses', () => {
  for (const host of [
    'localhost',
    'foo.localhost',
    'metadata.google.internal',
    'printer.local',
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '[::1]',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '',
  ]) {
    assert.equal(isBlockedHost(host), true, host)
  }
})

test('allows ordinary public hosts and public IPs', () => {
  for (const host of ['example.com', 'www.youtube.com', 'github.io', '8.8.8.8', '172.32.0.1', '172.15.0.1', '2606:4700::1111']) {
    assert.equal(isBlockedHost(host), false, host)
  }
})

test('URL parsing normalizes numeric tricks into forms we block', () => {
  for (const url of ['http://2130706433/', 'http://0x7f.0.0.1/', 'http://0177.0.0.1/', 'http://127.1/']) {
    assert.equal(isBlockedHost(new URL(url).hostname), true, url)
  }
})
