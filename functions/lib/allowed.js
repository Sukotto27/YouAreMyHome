// The two accounts this app exists for. Mirrors the UID lists in
// firestore.rules and database.rules.json — change all three together.
//
// Anyone holding the (public) Firebase API key can mint themselves a valid
// Firebase Auth user, so "has a valid ID token" never means "is one of us".
// Every Cloud Function that does real work must check this list.
const ALLOWED_UIDS = ['s4paZwepVtbpjFH4703rIyWoYmx2', 'VdgsIIL7sRbDSNfj6Ln7TEqg4Nw1']

function isAllowedUid(uid) {
  return typeof uid === 'string' && ALLOWED_UIDS.includes(uid)
}

function otherUid(uid) {
  return ALLOWED_UIDS.find((candidate) => candidate !== uid) || null
}

module.exports = { ALLOWED_UIDS, isAllowedUid, otherUid }
