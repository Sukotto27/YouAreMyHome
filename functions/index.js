const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const { onDocumentCreated } = require('firebase-functions/v2/firestore')

initializeApp()
const db = getFirestore()

// Mirrors src/hooks/useUnreadBadges.js on the client — Draw is excluded
// there for the same reason (it's a live canvas, not a read/unread feed).
const FEATURES = [
  { key: 'chat', collection: 'messages', authorField: 'senderUid' },
  { key: 'qa', collection: 'qaRounds', authorField: 'createdBy' },
  { key: 'scrapbook', collection: 'scrapbook', authorField: 'savedBy' },
  { key: 'gallery', collection: 'gallery', authorField: 'uploadedBy' },
  { key: 'mail', collection: 'loveLetters', authorField: 'fromUid' },
  { key: 'milestones', collection: 'milestones', authorField: 'addedBy' },
]

async function computeUnreadCount(recipientUid) {
  const presenceSnap = await db.doc(`presence/${recipientUid}`).get()
  const presence = presenceSnap.exists ? presenceSnap.data() : {}

  let count = 0
  for (const { key, collection, authorField } of FEATURES) {
    const latestSnap = await db.collection(collection).orderBy('createdAt', 'desc').limit(1).get()
    if (latestSnap.empty) continue
    const doc = latestSnap.docs[0].data()
    if (!doc.createdAt || doc[authorField] === recipientUid) continue
    const seenAt = presence[key]
    if (!seenAt || doc.createdAt.toMillis() > seenAt.toMillis()) count += 1
  }
  return count
}

async function tokensForUser(uid) {
  const snap = await db.collection(`fcmTokens/${uid}/tokens`).get()
  return snap.docs.map((doc) => ({ id: doc.id, token: doc.data().token })).filter((t) => t.token)
}

async function partnerUids(authorUid) {
  // Every doc under fcmTokens/{uid} represents a known user; in this
  // two-person app "everyone but the author" is exactly "the partner."
  const docs = await db.collection('fcmTokens').listDocuments()
  return docs.map((docRef) => docRef.id).filter((uid) => uid !== authorUid)
}

function isUnregisteredError(error) {
  const code = error?.code || ''
  return (
    code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token'
  )
}

async function notifyPartner(authorUid, { title, body, url }) {
  if (!authorUid) return
  const recipients = await partnerUids(authorUid)
  if (recipients.length === 0) return

  for (const uid of recipients) {
    const [tokenDocs, badgeCount] = await Promise.all([tokensForUser(uid), computeUnreadCount(uid)])
    if (tokenDocs.length === 0) continue

    const response = await getMessaging().sendEachForMulticast({
      tokens: tokenDocs.map((t) => t.token),
      data: { title, body, url, badgeCount: String(badgeCount) },
    })

    const staleDocIds = response.responses
      .map((result, index) => (!result.success && isUnregisteredError(result.error) ? tokenDocs[index].id : null))
      .filter(Boolean)
    await Promise.all(
      staleDocIds.map((id) => db.doc(`fcmTokens/${uid}/tokens/${id}`).delete())
    )
  }
}

function truncate(text, max = 80) {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

exports.notifyOnMessage = onDocumentCreated('messages/{id}', async (event) => {
  const data = event.data.data()
  await notifyPartner(data.senderUid, {
    title: 'New message',
    body: data.type === 'image' ? `${data.senderName || 'They'} sent a photo` : truncate(data.text),
    url: '/YouAreMyHome/#/chat',
  })
})

exports.notifyOnQaRound = onDocumentCreated('qaRounds/{id}', async (event) => {
  const data = event.data.data()
  await notifyPartner(data.createdBy, {
    title: 'New Q&A',
    body: truncate(data.questionText) || 'Started a new question',
    url: '/YouAreMyHome/#/qa',
  })
})

exports.notifyOnScrapbook = onDocumentCreated('scrapbook/{id}', async (event) => {
  const data = event.data.data()
  await notifyPartner(data.savedBy, {
    title: 'New drawing',
    body: `${data.savedByName || 'They'} saved a drawing to the scrapbook`,
    url: '/YouAreMyHome/#/scrapbook',
  })
})

exports.notifyOnGallery = onDocumentCreated('gallery/{id}', async (event) => {
  const data = event.data.data()
  await notifyPartner(data.uploadedBy, {
    title: 'New photo',
    body: `${data.uploadedByName || 'They'} added a photo to the gallery`,
    url: '/YouAreMyHome/#/gallery',
  })
})

exports.notifyOnMail = onDocumentCreated('loveLetters/{id}', async (event) => {
  const data = event.data.data()
  // No body preview here on purpose — the letter content stays off the lock screen.
  await notifyPartner(data.fromUid, {
    title: 'New love letter',
    body: 'You have a new letter waiting',
    url: '/YouAreMyHome/#/mail',
  })
})

exports.notifyOnMilestone = onDocumentCreated('milestones/{id}', async (event) => {
  const data = event.data.data()
  await notifyPartner(data.addedBy, {
    title: 'New milestone',
    body: truncate(data.title) || 'Added a new milestone',
    url: '/YouAreMyHome/#/milestones',
  })
})
