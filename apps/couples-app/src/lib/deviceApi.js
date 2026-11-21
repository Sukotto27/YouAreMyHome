import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

// Thin wrappers over the two Cloud Functions in functions/security.js.

export async function callRegisterDevice(payload) {
  const result = await httpsCallable(functions, 'registerDevice')(payload)
  return result.data
}

// action: 'approve' | 'deny' | 'revoke'
export async function callReviewDevice({ targetUid, deviceId, action }) {
  const result = await httpsCallable(functions, 'reviewDevice')({ targetUid, deviceId, action })
  return result.data
}
