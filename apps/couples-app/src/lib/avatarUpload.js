import { getDownloadURL, ref, uploadString } from 'firebase/storage'
import { storage } from '../firebase'

// Uploads a square-cropped avatar (see squareThumbnailFromUrl) to Cloud
// Storage instead of stashing it in the shared settings doc — unlike gallery
// photos re-used as avatars, a fresh device photo hasn't been resized down
// for Firestore yet, and re-uploading on every profile visit would be wasteful.
export async function uploadAvatarPhoto(uid, dataUrl) {
  const avatarRef = ref(storage, `avatars/${uid}.jpg`)
  await uploadString(avatarRef, dataUrl, 'data_url')
  return getDownloadURL(avatarRef)
}
