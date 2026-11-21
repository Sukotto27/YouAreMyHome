#!/usr/bin/env node
// Break-glass control for device trust. Runs on your machine with admin
// credentials, so it works even if both of you are locked out of the app.
//
//   node functions/scripts/security-admin.js status
//   node functions/scripts/security-admin.js enforce on [--force]
//   node functions/scripts/security-admin.js enforce off
//   node functions/scripts/security-admin.js approve <email|uid> [deviceIdPrefix]
//   node functions/scripts/security-admin.js revoke  <email|uid> <deviceIdPrefix>
//   node functions/scripts/security-admin.js sync
//
// Credentials (either one):
//   * a service-account key:  set GOOGLE_APPLICATION_CREDENTIALS=path\to\key.json
//   * or: gcloud auth application-default login
// Project + database URL are read from the repo-root .env.local (the same
// VITE_FIREBASE_* values the app uses).
//
// `enforce on` refuses to run until it can see proof that approved devices are
// actually holding device tokens (otherwise turning it on would lock everyone
// out). `--force` overrides that — you almost never want to.

const fs = require('node:fs')
const path = require('node:path')
const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getDatabase } = require('firebase-admin/database')
const { FieldValue, getFirestore } = require('firebase-admin/firestore')
const { ALLOWED_UIDS, isAllowedUid } = require('../lib/allowed')

function readEnvLocal() {
  const file = path.join(__dirname, '..', '..', '.env.local')
  const env = {}
  if (!fs.existsSync(file)) return env
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const env = readEnvLocal()
initializeApp({
  projectId: env.VITE_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
})
const db = getFirestore()
const cfgRef = db.doc('securityState/main')

function fmt(ts) {
  const ms = ts?.toMillis?.()
  return ms ? new Date(ms).toLocaleString() : '—'
}

async function resolveUid(who) {
  if (!who) throw new Error('Missing account (email or uid).')
  if (isAllowedUid(who)) return who
  const record = await getAuth().getUserByEmail(who)
  if (!isAllowedUid(record.uid)) throw new Error(`${who} is not one of the two allowed accounts.`)
  return record.uid
}

async function listDevices(uid) {
  const snap = await db.collection(`devices/${uid}/list`).get()
  return snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
}

async function labelFor(uid) {
  try {
    const record = await getAuth().getUser(uid)
    return record.email || record.displayName || uid
  } catch {
    return uid
  }
}

async function status() {
  const cfg = (await cfgRef.get()).data() || {}
  console.log(`Enforcement:        ${cfg.enforce === true ? 'ON' : 'off (monitor mode)'}`)
  console.log(`Learning window to: ${fmt(cfg.learningUntil)}`)
  console.log(`Last token mint OK: ${fmt(cfg.lastMintOkAt)}`)
  if (cfg.lastMintError) console.log(`Last mint ERROR:    ${cfg.lastMintError} (${fmt(cfg.lastMintErrorAt)})`)
  for (const uid of ALLOWED_UIDS) {
    console.log(`\n${await labelFor(uid)}  [${uid}]`)
    const devices = (await listDevices(uid)).sort((a, b) => (b.lastSeenAt?.toMillis?.() || 0) - (a.lastSeenAt?.toMillis?.() || 0))
    if (devices.length === 0) console.log('  (no devices yet)')
    for (const d of devices) {
      console.log(
        `  ${d.id.slice(0, 8)}…  ${String(d.status).padEnd(8)} ${d.label || '?'}  ip=${d.lastIp || '?'}  last=${fmt(d.lastSeenAt)}  token=${d.tokenIssuedAt ? 'yes' : 'no'}`,
      )
    }
  }
}

// Rebuilds the RTDB mirror from Firestore truth so it can't have drifted.
async function sync() {
  const approved = {}
  for (const uid of ALLOWED_UIDS) {
    for (const d of await listDevices(uid)) {
      if (d.status === 'approved') (approved[uid] ||= {})[d.id] = true
    }
  }
  await getDatabase().ref('approvedDevices').set(Object.keys(approved).length ? approved : null)
  const total = Object.values(approved).reduce((n, o) => n + Object.keys(o).length, 0)
  console.log(`Synced ${total} approved device(s) to the Realtime Database mirror.`)
}

async function setEnforce(on, force) {
  if (on) {
    const cfg = (await cfgRef.get()).data() || {}
    const problems = []
    if (!cfg.lastMintOkAt) {
      problems.push(
        'No device token has ever been minted successfully. The Cloud Functions service account probably needs the "Service Account Token Creator" role.' +
          (cfg.lastMintError ? ` Last error: ${cfg.lastMintError}` : ''),
      )
    }
    for (const uid of ALLOWED_UIDS) {
      const ready = (await listDevices(uid)).filter((d) => d.status === 'approved' && d.tokenIssuedAt)
      if (ready.length === 0) {
        problems.push(`${await labelFor(uid)} has no approved device that has received a device token yet — open the app on one of their devices first.`)
      }
    }
    if (problems.length && !force) {
      console.error('Not turning enforcement on:\n - ' + problems.join('\n - '))
      console.error('\n(Use --force only if you are certain.)')
      process.exitCode = 1
      return
    }
    await sync()
  }
  await getDatabase().ref('security/enforce').set(on)
  await cfgRef.set({ enforce: on, enforceChangedAt: FieldValue.serverTimestamp() }, { merge: true })
  console.log(`Enforcement is now ${on ? 'ON' : 'off'}.`)
  if (on) console.log('Anyone on an unapproved device is locked out until approved. Turn off with: enforce off')
}

async function review(who, prefix, nextStatus) {
  const uid = await resolveUid(who)
  const devices = await listDevices(uid)
  let candidates = devices.filter((d) => (prefix ? d.id.startsWith(prefix) : d.status === 'pending'))
  if (nextStatus === 'revoked') candidates = candidates.filter((d) => d.status === 'approved')
  if (candidates.length === 0) throw new Error('No matching device.')
  candidates.sort((a, b) => (b.firstSeenAt?.toMillis?.() || 0) - (a.firstSeenAt?.toMillis?.() || 0))
  const target = candidates[0]
  await target.ref.update({
    status: nextStatus,
    reviewedBy: 'admin-script',
    reviewedAt: FieldValue.serverTimestamp(),
  })
  await getDatabase().ref(`approvedDevices/${uid}/${target.id}`).set(nextStatus === 'approved' ? true : null)
  console.log(`${nextStatus}: ${target.label || '?'} (${target.id.slice(0, 8)}…) for ${await labelFor(uid)}`)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const args = rest.filter((a) => !a.startsWith('--'))
  const force = rest.includes('--force')
  switch (command) {
    case 'status':
      return status()
    case 'sync':
      return sync()
    case 'enforce':
      if (!['on', 'off'].includes(args[0])) throw new Error('Usage: enforce on|off')
      return setEnforce(args[0] === 'on', force)
    case 'approve':
      return review(args[0], args[1], 'approved')
    case 'revoke':
      if (!args[1]) throw new Error('Usage: revoke <email|uid> <deviceIdPrefix>')
      return review(args[0], args[1], 'revoked')
    default:
      console.log('Commands: status | enforce on|off [--force] | approve <email|uid> [idPrefix] | revoke <email|uid> <idPrefix> | sync')
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exitCode = 1
})
