const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { FieldValue, getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { onRequest } = require('firebase-functions/v2/https')
const { buildIcsFeed } = require('./lib/ics')
const { extractOgTags } = require('./lib/ogTags')

initializeApp()
const db = getFirestore()

// Mirrors src/hooks/useUnreadBadges.js on the client — Draw is excluded
// there for the same reason (it's a live canvas, not a read/unread feed).
// For the 4 commentable features, activityField/activityAuthorField point
// at lastActivityAt/lastActivityByUid instead of createdAt/authorField — a
// comment (or edit) bumps those without changing who created the doc, so
// "is this mine" must compare against who acted last, not who authored it.
const FEATURES = [
  { key: 'chat', collection: 'messages', activityField: 'createdAt', activityAuthorField: 'senderUid' },
  { key: 'qa', collection: 'qaRounds', activityField: 'lastActivityAt', activityAuthorField: 'lastActivityByUid' },
  {
    key: 'scrapbook',
    collection: 'scrapbook',
    activityField: 'lastActivityAt',
    activityAuthorField: 'lastActivityByUid',
  },
  {
    key: 'gallery',
    collection: 'gallery',
    activityField: 'lastActivityAt',
    activityAuthorField: 'lastActivityByUid',
  },
  { key: 'mail', collection: 'loveLetters', activityField: 'createdAt', activityAuthorField: 'fromUid' },
  {
    key: 'milestones',
    collection: 'milestones',
    activityField: 'lastActivityAt',
    activityAuthorField: 'lastActivityByUid',
  },
  { key: 'journal', collection: 'journalEvents', activityField: 'createdAt', activityAuthorField: 'authorUid' },
]

async function computeUnreadCount(recipientUid) {
  const presenceSnap = await db.doc(`presence/${recipientUid}`).get()
  const presence = presenceSnap.exists ? presenceSnap.data() : {}

  let count = 0
  for (const { key, collection, activityField, activityAuthorField } of FEATURES) {
    const latestSnap = await db.collection(collection).orderBy(activityField, 'desc').limit(1).get()
    if (latestSnap.empty) continue
    const doc = latestSnap.docs[0].data()
    if (!doc[activityField] || doc[activityAuthorField] === recipientUid) continue
    const seenAt = presence[key]
    if (!seenAt || doc[activityField].toMillis() > seenAt.toMillis()) count += 1
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

// Plain data mirror into the Couple's Journal timeline — never calls
// notifyPartner itself, since the collection this data came from already
// has its own notifyOn* trigger handling that.
function mirrorToJournal(fields) {
  return db.collection('journalEvents').add({ createdAt: FieldValue.serverTimestamp(), ...fields })
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
  await Promise.all([
    notifyPartner(data.savedBy, {
      title: 'New drawing',
      body: `${data.savedByName || 'They'} saved a drawing to the scrapbook`,
      url: '/YouAreMyHome/#/scrapbook',
    }),
    mirrorToJournal({
      type: 'scrapbook',
      sourceId: event.params.id,
      imageDataUrl: data.imageDataUrl,
      authorUid: data.savedBy,
      authorName: data.savedByName,
    }),
  ])
})

exports.notifyOnGallery = onDocumentCreated('gallery/{id}', async (event) => {
  const data = event.data.data()
  await Promise.all([
    notifyPartner(data.uploadedBy, {
      title: 'New photo',
      body: `${data.uploadedByName || 'They'} added a photo to the gallery`,
      url: '/YouAreMyHome/#/gallery',
    }),
    mirrorToJournal({
      type: 'gallery',
      sourceId: event.params.id,
      imageDataUrl: data.imageDataUrl,
      authorUid: data.uploadedBy,
      authorName: data.uploadedByName,
    }),
  ])
})

exports.notifyOnMail = onDocumentCreated('loveLetters/{id}', async (event) => {
  const data = event.data.data()
  // No body preview here on purpose — the letter content stays off the lock screen.
  await Promise.all([
    notifyPartner(data.fromUid, {
      title: 'New love letter',
      body: 'You have a new letter waiting',
      url: '/YouAreMyHome/#/mail',
    }),
    mirrorToJournal({
      type: 'mail',
      sourceId: event.params.id,
      authorUid: data.fromUid,
      authorName: data.fromName,
    }),
  ])
})

exports.notifyOnMilestone = onDocumentCreated('milestones/{id}', async (event) => {
  const data = event.data.data()
  await notifyPartner(data.addedBy, {
    title: 'New milestone',
    body: truncate(data.title) || 'Added a new milestone',
    url: '/YouAreMyHome/#/calendar',
  })
})

// Each new comment bumps its parent doc's lastActivityAt/lastActivityByUid
// (which is what the badge queries above actually look at) and its
// commentCount, then notifies the partner the same way every other feature
// does. Comments are add-only in v1 — no decrement path needed.
function notifyOnComment(parentCollection, { title, url }) {
  return onDocumentCreated(`${parentCollection}/{parentId}/comments/{commentId}`, async (event) => {
    const comment = event.data.data()
    const parentRef = db.doc(`${parentCollection}/${event.params.parentId}`)
    await parentRef.update({
      lastActivityAt: comment.createdAt,
      lastActivityByUid: comment.authorUid,
      commentCount: FieldValue.increment(1),
    })
    await notifyPartner(comment.authorUid, {
      title,
      body: `${comment.authorName || 'They'} commented: ${truncate(comment.text)}`,
      url,
    })
  })
}

exports.notifyOnMilestoneComment = notifyOnComment('milestones', {
  title: 'New comment',
  url: '/YouAreMyHome/#/calendar',
})
exports.notifyOnQaComment = notifyOnComment('qaRounds', { title: 'New comment', url: '/YouAreMyHome/#/qa' })
exports.notifyOnScrapbookComment = notifyOnComment('scrapbook', {
  title: 'New comment',
  url: '/YouAreMyHome/#/scrapbook',
})
exports.notifyOnGalleryComment = notifyOnComment('gallery', {
  title: 'New comment',
  url: '/YouAreMyHome/#/gallery',
})

// journalEvents holds mirrors of scrapbook/gallery/mail (already notified by
// their own triggers above) plus thumbkiss connects (intentionally quiet —
// it's a live, already-witnessed-by-both-of-you event) alongside genuinely
// new mood/custom/gratitude/assessment entries — only those last four
// should notify here, or everything else would double-notify.
const JOURNAL_NOTIFY_TYPES = new Set(['mood', 'custom', 'gratitude', 'assessment'])

exports.notifyOnJournalEvent = onDocumentCreated('journalEvents/{id}', async (event) => {
  const data = event.data.data()
  if (!JOURNAL_NOTIFY_TYPES.has(data.type)) return

  const titles = { mood: 'Mood update', gratitude: 'Gratitude entry', assessment: 'Assessment completed' }
  const body =
    data.type === 'mood'
      ? `${data.authorName || 'They'} is feeling ${data.emoji} ${data.label}`
      : data.type === 'gratitude'
        ? `${data.authorName || 'They'} is grateful for: ${truncate(data.text)}`
        : data.type === 'assessment'
          ? `${data.authorName || 'They'} completed the ${data.title} assessment`
          : `${data.authorName || 'They'}: ${truncate(data.text)}`

  await notifyPartner(data.authorUid, {
    title: titles[data.type] || 'New journal entry',
    body,
    url: '/YouAreMyHome/#/journal',
  })
})

// Public (unauthenticated) — calendar apps can't send Firebase auth headers,
// so a random token (generated client-side, stored in config/calendarFeed)
// gates access instead. `invoker: 'public'` is required for 2nd-gen HTTPS
// functions, which otherwise default to rejecting unauthenticated calls.
exports.calendarFeed = onRequest({ invoker: 'public' }, async (req, res) => {
  const configSnap = await db.doc('config/calendarFeed').get()
  const expectedToken = configSnap.exists ? configSnap.data().token : null

  if (!expectedToken || req.query.token !== expectedToken) {
    res.status(403).send('Forbidden')
    return
  }

  const snap = await db.collection('milestones').get()
  const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

  res.set('Content-Type', 'text/calendar; charset=utf-8')
  res.send(buildIcsFeed(items))
})

const LINK_PREVIEW_TIMEOUT_MS = 5000
const LINK_PREVIEW_MAX_BYTES = 2 * 1024 * 1024 // plenty for <head>, avoids pulling down huge pages

// Unlike calendarFeed, this is only ever called by our own logged-in
// frontend — `invoker: 'public'` just makes the Cloud Run endpoint network-
// reachable (2nd-gen HTTPS functions reject all traffic without it); the
// real gate is the Firebase Auth ID token checked below. Not exhaustively
// SSRF-hardened (no private-IP-range blocking) — an accepted, bounded risk
// given only the two known accounts can ever reach this, not public input.
exports.linkPreview = onRequest({ invoker: 'public' }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  const authHeader = req.get('Authorization') || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!idToken) {
    res.status(401).json({ error: 'Missing Authorization header' })
    return
  }
  try {
    await getAuth().verifyIdToken(idToken)
  } catch {
    res.status(401).json({ error: 'Invalid token' })
    return
  }

  const targetUrl = req.query.url
  if (!targetUrl || typeof targetUrl !== 'string') {
    res.status(400).json({ error: 'Missing url parameter' })
    return
  }

  let parsed
  try {
    parsed = new URL(targetUrl)
  } catch {
    res.status(400).json({ error: 'Invalid url' })
    return
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.status(400).json({ error: 'Only http/https URLs are supported' })
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LINK_PREVIEW_TIMEOUT_MS)

  try {
    const response = await fetch(parsed.href, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YouAreMyHomeLinkPreview/1.0)' },
    })
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let html = ''
    let bytesRead = 0
    while (bytesRead < LINK_PREVIEW_MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      bytesRead += value.length
      html += decoder.decode(value, { stream: true })
    }
    reader.cancel().catch(() => {})

    const { title, description, image } = extractOgTags(html, parsed.href)
    res.json({ title, description, image, domain: parsed.hostname })
  } catch {
    res.status(502).json({ error: 'Could not fetch preview' })
  } finally {
    clearTimeout(timeout)
  }
})
