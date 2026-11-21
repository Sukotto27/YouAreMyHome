// Device trust: every browser/phone that opens the app registers itself here.
//
//   registerDevice — called by the app on every open (the "silent check").
//     * known + approved device  -> quietly updates last-seen, no alert.
//     * brand-new device         -> monitor mode: allowed, but both of you get a
//                                   heads-up. Enforcing: held "pending" until
//                                   one of you approves it, and you both get a
//                                   push asking.
//     Approved devices are handed a Firebase custom token carrying a `did`
//     (device id) claim. Once enforcement is on, Firestore/RTDB rules require
//     that claim AND an approved device record, so a password alone — or a
//     direct call to Firebase's API — gets an attacker nothing.
//   reviewDevice — approve / deny / revoke, callable only from an already-
//     approved device. Either of you can review either account's devices.
//
// State lives in:
//   securityState/main                 { enforce, learningUntil, lastMintOkAt, ... }
//   devices/{uid}/list/{deviceId}      the visible device record (no secrets)
//   deviceSecrets/{deviceId}           { uid, hash } — SHA-256 of the device's secret
//   RTDB approvedDevices/{uid}/{id}    mirror of approvals, because RTDB rules
//                                      can't read Firestore
//   RTDB security/enforce              mirror of the enforce flag
//
// The device *secret* is what proves a caller is that device: a 256-bit random
// value that only ever lives in that device's localStorage (the server keeps
// just its hash). The device *id* is public — it's in token claims and readable
// by approved devices — so on its own it is not a credential.

const { createHash, timingSafeEqual } = require('node:crypto')
const { getAuth } = require('firebase-admin/auth')
const { getDatabase } = require('firebase-admin/database')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const logger = require('firebase-functions/logger')
const { HttpsError, onCall } = require('firebase-functions/v2/https')
const { ALLOWED_UIDS, isAllowedUid } = require('./lib/allowed')
const { LEARNING_WINDOW_MS, decideRegistration } = require('./lib/deviceDecision')

const DEVICE_ID_RE = /^[a-f0-9]{32}$/
const SECRET_RE = /^[a-f0-9]{64}$/
const SETTINGS_URL = '/YouAreMyHome/#/settings'

function requireAllowedCaller(request) {
  const uid = request.auth?.uid
  if (!isAllowedUid(uid)) throw new HttpsError('permission-denied', 'Not allowed.')
  return uid
}

function cleanLabel(value) {
  const text = typeof value === 'string' ? value : ''
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Unknown device'
}

function clientIp(request) {
  const forwarded = request.rawRequest?.headers?.['x-forwarded-for']
  const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : ''
  return (first || request.rawRequest?.ip || '').slice(0, 64)
}

function hashSecret(secret) {
  return createHash('sha256').update(secret).digest('hex')
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

module.exports = function createSecurityFunctions({ db, sendToUid }) {
  const cfgRef = db.doc('securityState/main')

  // RTDB mirrors. A failure here is logged, never thrown — registration still
  // succeeds. (The admin script's `enforce on` re-syncs the mirror before it
  // flips enforcement, so a missed write can't lock anyone out.)
  async function mirrorApproval(uid, deviceId, approved) {
    try {
      await getDatabase().ref(`approvedDevices/${uid}/${deviceId}`).set(approved ? true : null)
    } catch (error) {
      logger.error('RTDB approval mirror failed', error)
    }
  }

  async function mirrorEnforce(enforce) {
    try {
      await getDatabase().ref('security/enforce').set(enforce === true)
    } catch (error) {
      logger.error('RTDB enforce mirror failed', error)
    }
  }

  async function displayNameFor(uid) {
    try {
      const record = await getAuth().getUser(uid)
      return record.displayName || record.email || 'Someone'
    } catch {
      return 'Someone'
    }
  }

  async function pushToBoth(payload) {
    await Promise.all(ALLOWED_UIDS.map((uid) => sendToUid(uid, { ...payload, url: SETTINGS_URL })))
  }

  async function notifyNewDevice(kind, uid, label, ip) {
    try {
      const name = await displayNameFor(uid)
      const where = ip ? ` (${ip})` : ''
      await pushToBoth(
        kind === 'pending'
          ? {
              title: 'New device waiting for approval',
              body: `${name}'s account: ${label}${where}. Open Settings to approve or deny.`,
            }
          : {
              title: 'New device signed in',
              body: `${name}'s account was opened on a new device: ${label}${where}. If that wasn't expected, open Settings → Devices.`,
            },
      )
    } catch (error) {
      logger.error('notifyNewDevice failed', error)
    }
  }

  const registerDevice = onCall({ timeoutSeconds: 30 }, async (request) => {
    const uid = requireAllowedCaller(request)
    const { deviceId, secret, label: rawLabel } = request.data || {}
    if (!DEVICE_ID_RE.test(deviceId || '') || !SECRET_RE.test(secret || '')) {
      throw new HttpsError('invalid-argument', 'Bad device credentials.')
    }

    const label = cleanLabel(rawLabel)
    const ip = clientIp(request)
    const userAgent = String(request.rawRequest?.headers?.['user-agent'] || '').slice(0, 300)

    const devRef = db.doc(`devices/${uid}/list/${deviceId}`)
    const secretRef = db.doc(`deviceSecrets/${deviceId}`)
    const pendingQuery = db.collection(`devices/${uid}/list`).where('status', '==', 'pending')
    const secretHash = hashSecret(secret)

    const { decision, enforce } = await db.runTransaction(async (tx) => {
      const [cfgSnap, devSnap, secretSnap, pendingSnap] = await Promise.all([
        tx.get(cfgRef),
        tx.get(devRef),
        tx.get(secretRef),
        tx.get(pendingQuery),
      ])
      const now = Date.now()

      // Prove this really is the device that owns this id: its secret must hash
      // to what we stored when it first registered.
      if (secretSnap.exists) {
        const record = secretSnap.data()
        if (record.uid !== uid || !safeEqualHex(record.hash, secretHash)) {
          throw new HttpsError('permission-denied', 'This device could not be verified.')
        }
      } else if (devSnap.exists) {
        throw new HttpsError('permission-denied', 'This device could not be verified.')
      }

      let cfgData = cfgSnap.exists ? cfgSnap.data() : null
      if (!cfgData) {
        cfgData = { enforce: false, learningUntil: Timestamp.fromMillis(now + LEARNING_WINDOW_MS) }
        tx.set(cfgRef, cfgData)
      }
      const cfg = {
        enforce: cfgData.enforce === true,
        learningUntilMs: cfgData.learningUntil?.toMillis?.() ?? 0,
      }
      const pending = pendingSnap.docs.map((d) => ({ firstSeenMs: d.data().firstSeenAt?.toMillis?.() ?? 0 }))

      const result = decideRegistration({
        device: devSnap.exists ? devSnap.data() : null,
        cfg,
        pending,
        now,
      })

      if (result.action === 'create') {
        tx.set(devRef, {
          label,
          userAgent,
          status: result.status,
          source: result.status === 'pending' ? 'pending' : result.notify ? 'monitor' : 'baseline',
          firstSeenAt: FieldValue.serverTimestamp(),
          lastSeenAt: FieldValue.serverTimestamp(),
          firstIp: ip,
          lastIp: ip,
        })
        if (!secretSnap.exists) tx.set(secretRef, { uid, hash: secretHash, createdAt: FieldValue.serverTimestamp() })
      } else if (result.action === 'touch') {
        tx.update(devRef, { label, userAgent, lastSeenAt: FieldValue.serverTimestamp(), lastIp: ip })
      }

      return { decision: result, enforce: cfg.enforce }
    })

    let customToken = null
    let tokenError = false
    if (decision.status === 'approved') {
      await mirrorApproval(uid, deviceId, true)
      // Only mint when this session doesn't already carry the device claim.
      if (request.auth.token?.did !== deviceId) {
        try {
          customToken = await getAuth().createCustomToken(uid, { did: deviceId })
          await Promise.all([
            devRef.update({ tokenIssuedAt: FieldValue.serverTimestamp() }),
            cfgRef.set({ lastMintOkAt: FieldValue.serverTimestamp(), lastMintError: FieldValue.delete() }, { merge: true }),
          ])
        } catch (error) {
          tokenError = true
          logger.error('createCustomToken failed — grant the Cloud Functions service account the Service Account Token Creator role', error)
          await cfgRef
            .set(
              { lastMintError: String(error?.message || error).slice(0, 300), lastMintErrorAt: FieldValue.serverTimestamp() },
              { merge: true },
            )
            .catch(() => {})
        }
      }
    }
    await mirrorEnforce(enforce)

    if (decision.action === 'create' && decision.notify) {
      await notifyNewDevice(decision.notify, uid, label, ip)
    }

    return { status: decision.status, customToken, tokenError, enforce }
  })

  const reviewDevice = onCall({ timeoutSeconds: 30 }, async (request) => {
    const callerUid = requireAllowedCaller(request)

    // The caller must itself be an approved device — a bare password session
    // can't approve anything.
    const callerDid = request.auth.token?.did
    if (!DEVICE_ID_RE.test(callerDid || '')) {
      throw new HttpsError('failed-precondition', "This session isn't a registered device yet.")
    }
    const callerDevice = await db.doc(`devices/${callerUid}/list/${callerDid}`).get()
    if (!callerDevice.exists || callerDevice.data().status !== 'approved') {
      throw new HttpsError('permission-denied', 'This device is not approved.')
    }

    const { targetUid, deviceId, action } = request.data || {}
    if (!isAllowedUid(targetUid) || !DEVICE_ID_RE.test(deviceId || '') || !['approve', 'deny', 'revoke'].includes(action)) {
      throw new HttpsError('invalid-argument', 'Bad request.')
    }
    if (action === 'revoke' && targetUid === callerUid && deviceId === callerDid) {
      throw new HttpsError('failed-precondition', 'Use Sign out for the device you are on.')
    }

    const targetRef = db.doc(`devices/${targetUid}/list/${deviceId}`)
    const targetSnap = await targetRef.get()
    if (!targetSnap.exists) throw new HttpsError('not-found', 'No such device.')
    const target = targetSnap.data()

    const required = action === 'revoke' ? 'approved' : 'pending'
    if (target.status !== required) {
      throw new HttpsError('failed-precondition', `That device is ${target.status}, not ${required}.`)
    }

    const nextStatus = { approve: 'approved', deny: 'denied', revoke: 'revoked' }[action]
    await targetRef.update({
      status: nextStatus,
      reviewedBy: callerUid,
      reviewedByDevice: callerDid,
      reviewedAt: FieldValue.serverTimestamp(),
    })
    await mirrorApproval(targetUid, deviceId, nextStatus === 'approved')

    try {
      const [ownerName, reviewerName] = await Promise.all([displayNameFor(targetUid), displayNameFor(callerUid)])
      const verb = { approve: 'approved', deny: 'denied', revoke: 'removed' }[action]
      await pushToBoth({
        title: `Device ${verb}`,
        body: `${ownerName}'s ${target.label || 'device'} was ${verb} by ${reviewerName}.`,
      })
    } catch (error) {
      logger.error('reviewDevice notification failed', error)
    }

    return { ok: true, status: nextStatus }
  })

  return { registerDevice, reviewDevice }
}
