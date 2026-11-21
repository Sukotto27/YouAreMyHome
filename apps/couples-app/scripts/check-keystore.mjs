// Run: node scripts/check-keystore.mjs
// Exercises src/lib/keyStore.js (the E2EE key + app lock) against a fake
// localStorage, simulating page reloads by importing a fresh copy of the module.
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { generateRawKey, bytesToBase64 } from '../src/lib/e2ee.js'

// The app's source uses extensionless imports (Vite resolves them); Node's ESM
// loader doesn't, so retry relative specifiers with ".js" for this test only.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context)
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.')) return next(specifier + '.js', context)
    throw error
  }
}`),
  import.meta.url,
)

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
}

const KEY_STORAGE = 'you-are-my-home:e2ee-key'
const LOCK_STORAGE = 'you-are-my-home:app-lock'
let n = 0
const load = () => import(`../src/lib/keyStore.js?reload=${n++}`) // fresh module state, like a page reload

let passed = 0
async function check(name, fn) {
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const RAW = bytesToBase64(generateRawKey())
const PIN = 'correct horse battery'

let ks = await load()

await check('starts with no key and no lock', async () => {
  assert.deepEqual(ks.getKeyState(), { rawKeyBase64: null, locked: false, lockEnabled: false })
})

await check('saving a key persists it in the clear while the lock is off', async () => {
  ks.setRawKey(RAW)
  assert.equal(store.get(KEY_STORAGE), RAW)
  ks = await load()
  assert.equal(ks.getKeyState().rawKeyBase64, RAW)
})

await check('rejects an invalid key', async () => {
  assert.throws(() => ks.setRawKey('not-a-key'), /valid key/)
})

await check('a too-short PIN is rejected and nothing changes', async () => {
  await assert.rejects(ks.enableAppLock('12345'), /at least 6/)
  assert.equal(store.get(KEY_STORAGE), RAW)
  assert.equal(store.has(LOCK_STORAGE), false)
})

await check('enabling the lock removes the plaintext key but keeps the app unlocked', async () => {
  await ks.enableAppLock(PIN, 15)
  assert.equal(store.has(KEY_STORAGE), false)
  assert.equal(store.has(LOCK_STORAGE), true)
  assert.equal(ks.getKeyState().rawKeyBase64, RAW)
  assert.equal(ks.getKeyState().locked, false)
  assert.equal(ks.getAutoLockMinutes(), 15)
  // the raw key must not appear anywhere in what's stored
  assert.ok(!store.get(LOCK_STORAGE).includes(RAW))
})

await check('after a reload the app starts locked, with no key in memory', async () => {
  ks = await load()
  assert.deepEqual(ks.getKeyState(), { rawKeyBase64: null, locked: true, lockEnabled: true })
})

await check('a wrong PIN is refused and stays locked', async () => {
  await assert.rejects(ks.unlockWithPin('wrong wrong wrong'), /wrong-pin/)
  assert.equal(ks.getKeyState().locked, true)
  assert.equal(ks.getKeyState().rawKeyBase64, null)
})

await check('the right PIN unlocks and restores the exact key', async () => {
  await ks.unlockWithPin(PIN)
  assert.equal(ks.getKeyState().locked, false)
  assert.equal(ks.getKeyState().rawKeyBase64, RAW)
})

await check('lockNow drops the key from memory', async () => {
  ks.lockNow()
  assert.deepEqual(ks.getKeyState(), { rawKeyBase64: null, locked: true, lockEnabled: true })
  await ks.unlockWithPin(PIN)
})

await check('a tampered stored key refuses to unlock', async () => {
  const record = JSON.parse(store.get(LOCK_STORAGE))
  const bytes = Buffer.from(record.wrapped, 'base64')
  bytes[0] ^= 0xff
  store.set(LOCK_STORAGE, JSON.stringify({ ...record, wrapped: bytes.toString('base64') }))
  ks = await load()
  await assert.rejects(ks.unlockWithPin(PIN), /wrong-pin/)
  // put it back for the next checks
  store.set(LOCK_STORAGE, JSON.stringify(record))
  ks = await load()
  await ks.unlockWithPin(PIN)
})

await check('changing the PIN: old stops working, new works, key unchanged', async () => {
  await assert.rejects(ks.changeAppLockPin('nope nope nope', 'a brand new passphrase'), /wrong-pin/)
  await ks.changeAppLockPin(PIN, 'a brand new passphrase')
  ks = await load()
  await assert.rejects(ks.unlockWithPin(PIN), /wrong-pin/)
  await ks.unlockWithPin('a brand new passphrase')
  assert.equal(ks.getKeyState().rawKeyBase64, RAW)
  assert.equal(ks.getAutoLockMinutes(), 15) // setting survives a PIN change
})

await check('auto-lock minutes can be changed and ignores bad values', async () => {
  ks.setAutoLockMinutes(30)
  assert.equal(ks.getAutoLockMinutes(), 30)
  ks.setAutoLockMinutes(7)
  assert.equal(ks.getAutoLockMinutes(), 30)
})

await check('turning the lock off needs the PIN and restores the plaintext key', async () => {
  await assert.rejects(ks.disableAppLock('wrong wrong wrong'), /wrong-pin/)
  assert.equal(store.has(LOCK_STORAGE), true)
  await ks.disableAppLock('a brand new passphrase')
  assert.equal(store.get(KEY_STORAGE), RAW)
  assert.equal(store.has(LOCK_STORAGE), false)
  ks = await load()
  assert.deepEqual(ks.getKeyState(), { rawKeyBase64: RAW, locked: false, lockEnabled: false })
})

await check('"forgot my PIN" wipes the lock AND the key from this device', async () => {
  await ks.enableAppLock(PIN)
  ks = await load()
  assert.equal(ks.getKeyState().locked, true)
  ks.resetAppLock()
  assert.equal(store.has(KEY_STORAGE), false)
  assert.equal(store.has(LOCK_STORAGE), false)
  assert.deepEqual(ks.getKeyState(), { rawKeyBase64: null, locked: false, lockEnabled: false })
  ks = await load()
  assert.deepEqual(ks.getKeyState(), { rawKeyBase64: null, locked: false, lockEnabled: false })
})

await check('with the lock on, saving a key never writes it back to disk in the clear', async () => {
  ks.setRawKey(RAW)
  await ks.enableAppLock(PIN)
  const other = bytesToBase64(generateRawKey())
  ks.setRawKey(other)
  assert.equal(store.has(KEY_STORAGE), false)
  assert.equal(ks.getKeyState().rawKeyBase64, other)
})

console.log(`\n${passed} checks passed`)
