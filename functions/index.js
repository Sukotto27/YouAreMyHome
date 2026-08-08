const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { FieldValue, getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onRequest } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { buildIcsFeed } = require('./lib/ics')
const { extractOgTags } = require('./lib/ogTags')
const { zonedTimeToUtc } = require('./lib/timezone')

initializeApp()
const db = getFirestore()

// Mirrors src/hooks/useUnreadBadges.js on the client — Draw is excluded
// there for the same reason (it's a live canvas, not a read/unread feed).
// activityField/activityAuthorField point at lastActivityAt/
// lastActivityByUid instead of createdAt/authorField for most features — a
// comment/reaction (or edit) bumps those without changing who created the
// doc, so "is this mine" must compare against who acted last, not who
// authored it. Chat: a reaction (see notifyOnReaction below and the client's
// toggleReaction) bumps these the same way a new message does.
const FEATURES = [
  { key: 'chat', collection: 'messages', activityField: 'lastActivityAt', activityAuthorField: 'lastActivityByUid' },
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

async function sendToUid(uid, { title, body, url }) {
  const [tokenDocs, badgeCount] = await Promise.all([tokensForUser(uid), computeUnreadCount(uid)])
  if (tokenDocs.length === 0) return

  const response = await getMessaging().sendEachForMulticast({
    tokens: tokenDocs.map((t) => t.token),
    data: { title, body, url, badgeCount: String(badgeCount) },
  })

  const staleDocIds = response.responses
    .map((result, index) => (!result.success && isUnregisteredError(result.error) ? tokenDocs[index].id : null))
    .filter(Boolean)
  await Promise.all(staleDocIds.map((id) => db.doc(`fcmTokens/${uid}/tokens/${id}`).delete()))
}

async function notifyPartner(authorUid, payload) {
  if (!authorUid) return
  const recipients = await partnerUids(authorUid)
  await Promise.all(recipients.map((uid) => sendToUid(uid, payload)))
}

// Unlike notifyPartner (which deliberately excludes whoever caused the
// event), reminders aren't "authored" by either of you — both should be
// pinged, including whoever set the Date Night up in the first place.
async function notifyEveryone(payload) {
  const docs = await db.collection('fcmTokens').listDocuments()
  await Promise.all(docs.map((docRef) => sendToUid(docRef.id, payload)))
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

// Together since 3/30/24, 8:16pm — must stay in sync with
// src/lib/relationship.js's ANNIVERSARY. Duplicated rather than shared
// across the two separate deployable packages (this is CommonJS, the client
// is ESM); it's one constant, not worth a cross-package import.
const ANNIVERSARY = new Date(2024, 2, 30, 20, 16, 0)

// Which anniversary-year "section" of the Tree of Union a date falls into
// (0 = the first year together, 1 = the second, etc.) — matches the `years`
// component of the client's getElapsedBreakdown(ANNIVERSARY, date).
function yearIndexFor(date) {
  let years = date.getFullYear() - ANNIVERSARY.getFullYear()
  const anniversaryThisYear = new Date(
    date.getFullYear(),
    ANNIVERSARY.getMonth(),
    ANNIVERSARY.getDate(),
    ANNIVERSARY.getHours(),
    ANNIVERSARY.getMinutes(),
    ANNIVERSARY.getSeconds(),
  )
  if (date < anniversaryThisYear) years -= 1
  return Math.max(0, years)
}

function treeEventDate(timestamp) {
  if (!timestamp) return new Date()
  return typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp)
}

function dateKey(date) {
  return date.toISOString().slice(0, 10)
}

// Tree of Union — every feature's milestone-level interactions (never
// individual dice rolls/card plays, see the per-trigger comments below)
// land here as one doc each, keyed by a deterministic id so retried
// triggers and the one-time history backfill can both safely re-write the
// same doc without duplicating a branch. `parentEventId` nests a smaller
// "twig" (e.g. a comment) under the interaction branch it belongs to; leave
// it null for a top-level branch off a feature's main stem.
async function logTreeEvent(id, { createdAt, ...fields }) {
  const date = treeEventDate(createdAt)
  await db
    .collection('treeEvents')
    .doc(id)
    .set(
      {
        ...fields,
        createdAt: createdAt || FieldValue.serverTimestamp(),
        yearIndex: yearIndexFor(date),
      },
      { merge: true },
    )
}

// For high-frequency, low-distinctiveness interactions (kisses, thumbkiss
// connects) — same-day events collapse into one doc with a running count
// instead of one branch per tap, so a heavy day of "sending love" doesn't
// bury the tree in identical twigs. Callers pass a day-scoped `id`.
async function logAggregatedTreeEvent(id, { createdAt, summary, ...fields }) {
  const date = treeEventDate(createdAt)
  await db
    .collection('treeEvents')
    .doc(id)
    .set(
      {
        ...fields,
        lastSummary: summary,
        lastAt: createdAt || FieldValue.serverTimestamp(),
        yearIndex: yearIndexFor(date),
        count: FieldValue.increment(1),
      },
      { merge: true },
    )
}

// Chat is end-to-end encrypted client-side — `data.text` doesn't exist
// server-side (it's inside `encryptedContent`, which this function never
// touches), so the body is generic by type rather than a content preview.
exports.notifyOnMessage = onDocumentCreated('messages/{id}', async (event) => {
  const data = event.data.data()
  const senderName = data.senderName || 'They'
  const body =
    data.type === 'image'
      ? `${senderName} sent a${data.vanishing ? ' vanishing' : ''} photo`
      : data.type === 'link'
        ? `${senderName} shared a link`
        : `${senderName} sent a message`
  await notifyPartner(data.senderUid, {
    title: 'New message',
    body,
    url: '/YouAreMyHome/#/chat',
  })
})

// Reactions are treated like a new message for notification purposes — the
// client bumps lastActivityAt/lastActivityByUid on add/change (not removal,
// see toggleReaction), and this diffs the before/after reactions maps the
// same way to find who reacted, so it only fires for a genuinely new or
// changed reaction, never for one being taken away.
exports.notifyOnReaction = onDocumentUpdated('messages/{id}', async (event) => {
  const before = event.data.before.data()
  const after = event.data.after.data()
  const beforeReactions = before.reactions || {}
  const afterReactions = after.reactions || {}

  const reactorUid = Object.keys(afterReactions).find(
    (uid) => afterReactions[uid] && afterReactions[uid] !== beforeReactions[uid],
  )
  if (!reactorUid) return

  const emoji = afterReactions[reactorUid]
  let reactorName = 'They'
  try {
    const reactorRecord = await getAuth().getUser(reactorUid)
    reactorName = reactorRecord.displayName || reactorRecord.email || reactorName
  } catch {
    // best effort — notification still makes sense with the generic fallback
  }

  const isSelfReact = after.senderUid === reactorUid
  const target = isSelfReact ? 'their own' : 'your'
  const kind = after.type === 'image' ? 'photo' : 'message'

  await notifyPartner(reactorUid, {
    title: 'New reaction',
    body: `${reactorName} reacted ${emoji} to ${target} ${kind}`,
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

// The Tree of Union branch is "both of us answered this" (see QA.jsx's own
// isComplete), not either individual answer — so this only fires the moment
// a round crosses from one answer to two, never on creation (which always
// starts at zero or one answer).
exports.logTreeOnQaComplete = onDocumentUpdated('qaRounds/{id}', async (event) => {
  const before = event.data.before.data()
  const after = event.data.after.data()
  const beforeCount = Object.keys(before.answers || {}).length
  const afterCount = Object.keys(after.answers || {}).length
  if (beforeCount >= 2 || afterCount < 2) return
  await logTreeEvent(`qa_${event.params.id}`, {
    feature: 'qa',
    kind: 'answered',
    refId: event.params.id,
    byUids: Object.keys(after.answers),
    category: after.category || null,
    summary: `You both answered "${truncate(after.questionText, 100)}"`,
    createdAt: after.lastActivityAt || FieldValue.serverTimestamp(),
  })
})

exports.notifyOnScrapbook = onDocumentCreated('scrapbook/{id}', async (event) => {
  const data = event.data.data()
  await Promise.all([
    notifyPartner(data.savedBy, {
      title: 'New drawing',
      body: `${data.savedByName || 'They'} saved a drawing to the scrapbook`,
      url: '/YouAreMyHome/#/games',
    }),
    mirrorToJournal({
      type: 'scrapbook',
      sourceId: event.params.id,
      imageDataUrl: data.imageDataUrl,
      authorUid: data.savedBy,
      authorName: data.savedByName,
    }),
    logTreeEvent(`games_draw_${event.params.id}`, {
      feature: 'games',
      kind: 'draw',
      gameName: 'draw',
      refId: event.params.id,
      byUid: data.savedBy,
      summary: `${data.savedByName || 'They'} saved a drawing to the scrapbook`,
      createdAt: data.createdAt,
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
    // Gallery photos are end-to-end encrypted client-side — a doc created
    // after that shipped has `encryptedImage`, not `imageDataUrl`. Passing
    // through whichever field actually exists (never both, never neither)
    // avoids writing an explicit `undefined`, which Firestore's Admin SDK
    // rejects and would otherwise throw on every future gallery upload.
    mirrorToJournal({
      type: 'gallery',
      sourceId: event.params.id,
      authorUid: data.uploadedBy,
      authorName: data.uploadedByName,
      ...(data.encryptedImage ? { encryptedImage: data.encryptedImage } : { imageDataUrl: data.imageDataUrl }),
    }),
    logTreeEvent(`gallery_${event.params.id}`, {
      feature: 'gallery',
      kind: 'uploaded',
      refId: event.params.id,
      byUid: data.uploadedBy,
      summary: `${data.uploadedByName || 'They'} added a photo to the gallery`,
      createdAt: data.createdAt,
    }),
  ])
})

exports.notifyOnMail = onDocumentCreated('loveLetters/{id}', async (event) => {
  const data = event.data.data()
  const isCard = data.type === 'card'
  // No body preview for plain letters on purpose — content stays off the
  // lock screen. Cards are a gift announcement, not a private message, so a
  // preview is fine (and part of the fun) there.
  await Promise.all([
    notifyPartner(data.fromUid, {
      title: isCard ? 'A gift is waiting!' : 'New love letter',
      body: isCard
        ? `${data.fromName || 'They'} sent you a card for ${data.occasion}${data.withFlowers ? ' with flowers 💐' : ''}`
        : 'You have a new letter waiting',
      url: '/YouAreMyHome/#/mail',
    }),
    mirrorToJournal({
      type: 'mail',
      sourceId: event.params.id,
      authorUid: data.fromUid,
      authorName: data.fromName,
      isCard,
      occasion: data.occasion || null,
    }),
    logTreeEvent(`mail_${event.params.id}`, {
      feature: 'mail',
      kind: isCard ? 'card' : 'letter',
      refId: event.params.id,
      byUid: data.fromUid,
      summary: isCard
        ? `${data.fromName || 'They'} sent a card for ${data.occasion}`
        : `${data.fromName || 'They'} sent a love letter`,
      createdAt: data.createdAt,
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
  // migrations.js seeds a couple of milestones (anniversary, birthdays) with
  // addedBy: null — no real actor, so nothing to hang a branch on.
  if (data.addedBy) {
    await logTreeEvent(`calendar_${event.params.id}`, {
      feature: 'calendar',
      kind: data.category || 'milestone',
      refId: event.params.id,
      byUid: data.addedBy,
      summary: `${data.addedByName || 'They'} added "${truncate(data.title, 60)}"`,
      createdAt: data.createdAt,
    })
  }
})

// A Date Night doc tracks its own upcoming occurrence (`nextOccurrenceDate`)
// separately from its original `date`, so a recurring one can roll forward
// after each occurrence without losing the original anchor. `remindersSent`
// is a one-shot flag pair per occurrence, reset on rollover; `lastActivityAt`
// gets bumped with a null author whenever a reminder fires, which is what
// piggybacks this onto the existing Calendar nav badge (see
// useUnreadBadges.js/FEATURES above) for both of you, not just "the partner."
function advanceOccurrence(dateStr, recurrenceType) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (recurrenceType === 'weekly') date.setUTCDate(date.getUTCDate() + 7)
  else if (recurrenceType === 'biweekly') date.setUTCDate(date.getUTCDate() + 14)
  else if (recurrenceType === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1)
  else if (recurrenceType === 'yearly') date.setUTCFullYear(date.getUTCFullYear() + 1)
  else return null
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

exports.sendDateNightReminders = onSchedule('every 15 minutes', async () => {
  const snapshot = await db.collection('milestones').where('category', '==', 'dateNight').get()
  const now = Date.now()

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data()
    if (data.completed || !data.time || !data.nextOccurrenceDate || !data.timezone) continue

    const occurrenceMs = zonedTimeToUtc(data.nextOccurrenceDate, data.time, data.timezone).getTime()
    const minutesUntil = (occurrenceMs - now) / 60000
    const remindersSent = data.remindersSent || {}
    const updates = {}

    if (minutesUntil <= 24 * 60 && minutesUntil > -30 && !remindersSent.dayBefore) {
      await notifyEveryone({
        title: 'Date Night tomorrow 💕',
        body: `${truncate(data.title)} is coming up`,
        url: '/YouAreMyHome/#/calendar',
      })
      updates['remindersSent.dayBefore'] = true
    }
    if (minutesUntil <= 15 && minutesUntil > -30 && !remindersSent.fifteenMin) {
      await notifyEveryone({
        title: 'Date Night starting soon 💕',
        body: `${truncate(data.title)} starts in 15 minutes`,
        url: '/YouAreMyHome/#/calendar',
      })
      updates['remindersSent.fifteenMin'] = true
    }
    if (Object.keys(updates).length > 0) {
      updates.lastActivityAt = FieldValue.serverTimestamp()
      updates.lastActivityByUid = null
      await docSnap.ref.update(updates)
    }

    // 30 minutes past start: mirror to the Journal once per occurrence, then
    // roll a recurring Date Night forward (resetting reminders) or mark a
    // one-off as completed so it's skipped on future runs.
    if (minutesUntil < -30) {
      const tasks = []
      if (data.journaledDate !== data.nextOccurrenceDate) {
        tasks.push(
          mirrorToJournal({
            type: 'dateNight',
            title: data.title,
            authorUid: null,
            authorName: null,
          }),
        )
      }
      const nextDate = advanceOccurrence(data.nextOccurrenceDate, data.recurrenceType)
      tasks.push(
        docSnap.ref.update(
          nextDate
            ? { nextOccurrenceDate: nextDate, remindersSent: {}, journaledDate: data.nextOccurrenceDate }
            : { completed: true, journaledDate: data.nextOccurrenceDate },
        ),
      )
      await Promise.all(tasks)
    }
  }
})

// Backstop for the client's own vanish-on-a-timer logic (Chat.jsx) — that
// only fires while someone has Chat open. This is the guarantee that a
// vanishing image actually disappears within about a minute of being
// opened even if neither device reopens the app afterward. Deletion needs
// no plaintext access, just the (unencrypted) vanishing/viewedAt metadata.
exports.expireVanishingImages = onSchedule('* * * * *', async () => {
  const snapshot = await db.collection('messages').where('vanishing', '==', true).get()
  const now = Date.now()
  const deletions = snapshot.docs
    .filter((docSnap) => {
      const viewedAt = docSnap.data().viewedAt
      return viewedAt && now - viewedAt.toMillis() >= 60_000
    })
    .map((docSnap) => docSnap.ref.delete())
  await Promise.all(deletions)
})

// Shared by every game's "Invite partner" button (Draw, Mad Libs,
// Never-Ending Story, Farkle, Uno, Obstacle Drop) rather than each having its own
// invite collection/trigger — see the client's useGameInvite hook. Like the
// old per-game invite docs, this one exists purely to cause a notification:
// useGameInvite's onSnapshot listener on the same collection does double
// duty as the in-app popup (GameInvitePopup), the same way Thumbkiss's RTDB
// write drives its overlay but without needing a push.
exports.notifyOnGameInvite = onDocumentCreated('gameInvites/{id}', async (event) => {
  const data = event.data.data()
  const label = data.gameLabel || 'a game'
  await notifyPartner(data.fromUid, {
    title: `${label} together?`,
    body: `${data.fromName || 'They'} wants to play ${label} with you!`,
    url: '/YouAreMyHome/#/games',
  })
})

// Every new storyTurns doc leaves a fresh blank for the *other* partner —
// including order:0 (the very first turn, which starts the story) — so a
// plain onDocumentCreated trigger is enough; no need to distinguish start
// vs. continue the way notifyOnLoveNote distinguishes kiss vs. note.
exports.notifyOnStoryTurn = onDocumentCreated('storyTurns/{id}', async (event) => {
  const data = event.data.data()
  await notifyPartner(data.authorUid, {
    title: 'Never-Ending Story',
    body: `${data.authorName || 'They'} left you a blank to fill in`,
    url: '/YouAreMyHome/#/games',
  })
})

// A turn is two writes (create the blank, then update it once the *other*
// partner fills it in) — the tree branch represents the completed pair, not
// either half alone, so this only fires on the fill-in update.
exports.logTreeOnStoryTurn = onDocumentUpdated('storyTurns/{id}', async (event) => {
  const before = event.data.before.data()
  const after = event.data.after.data()
  if (before.filledWord || !after.filledWord) return
  await logTreeEvent(`games_story_${event.params.id}`, {
    feature: 'games',
    kind: 'story',
    gameName: 'story',
    refId: event.params.id,
    byUids: [after.authorUid, after.filledByUid].filter(Boolean),
    summary: `${after.authorName || 'They'} left a blank, and it got filled in`,
    createdAt: after.filledAt || FieldValue.serverTimestamp(),
  })
})

// farkleGame/match is a single ever-live doc (see useFarkle), so a turn
// change is an update, not a create — startGame's initial write leaves
// currentTurnUid pointed at the starter themself (no notification needed),
// and every following write that actually hands the turn to someone else
// pings that specific person directly (sendToUid, not notifyPartner — this
// needs the new current player, not "everyone but whoever just acted", since
// the person banking/farkling and the person losing the turn are the same
// one). Skipped once the match is finished, since applyBank/applyFarkle
// still set a currentTurnUid there even though nobody's turn is next.
exports.notifyOnFarkleTurn = onDocumentUpdated('farkleGame/{id}', async (event) => {
  const before = event.data.before.data()
  const after = event.data.after.data()
  // farkleGame/match is a single ever-live doc, so there's no stable
  // per-match id to key a tree event on — event.id (unique per trigger
  // invocation, stable across Cloud Functions' at-least-once retries of the
  // SAME invocation) stands in instead.
  if (after.status === 'finished' && before.status !== 'finished') {
    await logTreeEvent(`games_farkle_${event.id}`, {
      feature: 'games',
      kind: 'farkle',
      gameName: 'farkle',
      refId: event.params.id,
      byUids: Object.keys(after.scores || {}),
      summary: 'Finished a game of Farkle',
      createdAt: FieldValue.serverTimestamp(),
    })
  }
  if (after.status !== 'playing' || before.currentTurnUid === after.currentTurnUid) return
  await sendToUid(after.currentTurnUid, {
    title: 'Farkle',
    body: 'Your turn to roll!',
    url: '/YouAreMyHome/#/games',
  })
})

// Same pattern as notifyOnFarkleTurn above, for unoGame/match (see useUno).
exports.notifyOnUnoTurn = onDocumentUpdated('unoGame/{id}', async (event) => {
  const before = event.data.before.data()
  const after = event.data.after.data()
  // See notifyOnFarkleTurn above for why event.id stands in for a match id.
  if (after.status === 'finished' && before.status !== 'finished') {
    await logTreeEvent(`games_uno_${event.id}`, {
      feature: 'games',
      kind: 'uno',
      gameName: 'uno',
      refId: event.params.id,
      byUids: Object.keys(after.hands || {}),
      summary: 'Finished a game of Uno',
      createdAt: FieldValue.serverTimestamp(),
    })
  }
  if (after.status !== 'playing' || before.currentTurnUid === after.currentTurnUid) return
  await sendToUid(after.currentTurnUid, {
    title: 'Uno',
    body: 'Your turn to play!',
    url: '/YouAreMyHome/#/games',
  })
})

// A kiss or love note from the SendLoveMenu — like notifyOnGameInvite, this
// doc exists purely to cause a notification; the client's useLoveNotes hook
// listens to the same collection live for the in-app popup.
exports.notifyOnLoveNote = onDocumentCreated('loveNotes/{id}', async (event) => {
  const data = event.data.data()
  await notifyPartner(data.fromUid, {
    title: data.category === 'kiss' ? 'Sending a kiss' : 'Sending love',
    body: data.message,
    url: '/YouAreMyHome/#/',
  })
  // Kisses especially can happen many times a day — day-aggregated so the
  // tree gets one growing twig per person per day instead of one per tap.
  const day = dateKey(treeEventDate(data.createdAt))
  await logAggregatedTreeEvent(`love_${data.category || 'note'}_${data.fromUid}_${day}`, {
    feature: 'love',
    kind: data.category === 'kiss' ? 'kiss' : 'note',
    byUid: data.fromUid,
    summary:
      data.category === 'kiss'
        ? `${data.fromName || 'They'} sent a kiss`
        : `${data.fromName || 'They'} sent: ${truncate(data.message)}`,
    createdAt: data.createdAt,
  })
})

// Each new comment bumps its parent doc's lastActivityAt/lastActivityByUid
// (which is what the badge queries above actually look at) and its
// commentCount, then notifies the partner the same way every other feature
// does. Comments are add-only in v1 — no decrement path needed.
// contentEncrypted: true (only gallery comments, so far) means
// `comment.text` doesn't exist server-side — it's inside encryptedContent,
// which this function never touches — so the body drops the text preview.
// Maps each commentable collection to the Tree of Union feature/parent-event
// id its comments should nest under — must match the deterministic ids used
// by that collection's own logTreeEvent call above (calendar_/qa_/
// games_draw_/gallery_), since there's no lookup, just string-building.
const COMMENT_TREE_TARGET = {
  milestones: { feature: 'calendar', parentEventId: (id) => `calendar_${id}` },
  qaRounds: { feature: 'qa', parentEventId: (id) => `qa_${id}` },
  scrapbook: { feature: 'games', parentEventId: (id) => `games_draw_${id}` },
  gallery: { feature: 'gallery', parentEventId: (id) => `gallery_${id}` },
}

function notifyOnComment(parentCollection, { title, url, contentEncrypted = false }) {
  return onDocumentCreated(`${parentCollection}/{parentId}/comments/{commentId}`, async (event) => {
    const comment = event.data.data()
    const parentRef = db.doc(`${parentCollection}/${event.params.parentId}`)
    await parentRef.update({
      lastActivityAt: comment.createdAt,
      lastActivityByUid: comment.authorUid,
      commentCount: FieldValue.increment(1),
    })
    const authorName = comment.authorName || 'They'
    await notifyPartner(comment.authorUid, {
      title,
      body: contentEncrypted ? `${authorName} commented` : `${authorName} commented: ${truncate(comment.text)}`,
      url,
    })

    // Nests as a small twig under the branch it's replying to — if that
    // branch doesn't exist yet (e.g. a comment on a Q&A round only one of
    // you has answered so far), this just leaves an orphaned doc the tree
    // renderer skips rather than erroring; not worth a lookup to prevent.
    const target = COMMENT_TREE_TARGET[parentCollection]
    if (target) {
      await logTreeEvent(`${parentCollection}_${event.params.parentId}_c_${event.params.commentId}`, {
        feature: target.feature,
        kind: 'comment',
        refId: event.params.commentId,
        byUid: comment.authorUid,
        parentEventId: target.parentEventId(event.params.parentId),
        summary: contentEncrypted ? `${authorName} commented` : `${authorName} commented: ${truncate(comment.text)}`,
        createdAt: comment.createdAt,
      })
    }
  })
}

exports.notifyOnMilestoneComment = notifyOnComment('milestones', {
  title: 'New comment',
  url: '/YouAreMyHome/#/calendar',
})
exports.notifyOnQaComment = notifyOnComment('qaRounds', { title: 'New comment', url: '/YouAreMyHome/#/qa' })
exports.notifyOnScrapbookComment = notifyOnComment('scrapbook', {
  title: 'New comment',
  url: '/YouAreMyHome/#/games',
})
exports.notifyOnGalleryComment = notifyOnComment('gallery', {
  contentEncrypted: true,
  title: 'New comment',
  url: '/YouAreMyHome/#/gallery',
})

// journalEvents holds mirrors of scrapbook/gallery/mail (already notified by
// their own triggers above) plus thumbkiss connects (intentionally quiet —
// it's a live, already-witnessed-by-both-of-you event) alongside genuinely
// new mood/custom/gratitude/assessment/checkin/madlib entries — only those
// last six should notify here, or everything else would double-notify.
const JOURNAL_NOTIFY_TYPES = new Set(['mood', 'custom', 'gratitude', 'assessment', 'checkin', 'madlib'])

exports.notifyOnJournalEvent = onDocumentCreated('journalEvents/{id}', async (event) => {
  const data = event.data.data()
  if (!JOURNAL_NOTIFY_TYPES.has(data.type)) return

  const titles = {
    mood: 'Mood update',
    gratitude: 'Gratitude entry',
    assessment: 'Assessment completed',
    checkin: 'Daily check-in',
    madlib: 'Mad Libs',
  }
  const body =
    data.type === 'mood'
      ? `${data.authorName || 'They'} is feeling ${data.emoji} ${data.label}`
      : data.type === 'gratitude'
        ? `${data.authorName || 'They'} is grateful for: ${truncate(data.text)}`
        : data.type === 'assessment'
          ? `${data.authorName || 'They'} completed the ${data.title} assessment`
          : data.type === 'checkin'
            ? `${data.authorName || 'They'} checked in${data.mood ? ` feeling ${data.mood.emoji} ${data.mood.label}` : ''}`
            : data.type === 'madlib'
              ? `${data.authorName || 'They'} filled in "${data.title}" — your turn!`
              : `${data.authorName || 'They'}: ${truncate(data.text)}`

  await notifyPartner(data.authorUid, {
    title: titles[data.type] || 'New journal entry',
    body,
    url: data.type === 'madlib' ? '/YouAreMyHome/#/games' : '/YouAreMyHome/#/journal',
  })
})

function journalTreeSummary(data) {
  switch (data.type) {
    case 'mood':
      return `${data.authorName || 'They'} logged feeling ${data.label || data.emoji || 'a mood'}`
    case 'gratitude':
      return `${data.authorName || 'They'} wrote a gratitude entry`
    case 'checkin':
      return `${data.authorName || 'They'} checked in`
    case 'assessment':
      return `${data.authorName || 'They'} completed the ${data.title || ''} assessment`.trim()
    default:
      return `${data.authorName || 'They'} added a journal entry`
  }
}

// journalEvents is a mixed bag (see JOURNAL_NOTIFY_TYPES above): mirrors of
// scrapbook/gallery/mail/dateNight (already logged to the tree at their own
// source, so skipped here), a mutual thumbkiss connect (no single author —
// day-aggregated under "love" the same way kisses are), a Mad Libs
// submission (only becomes a tree branch once BOTH of you have submitted,
// same "joint completion" rule as Q&A — checked by reading the underlying
// madLibs doc), and genuinely-authored journal entries.
const JOURNAL_TREE_SKIP_TYPES = new Set(['scrapbook', 'gallery', 'mail', 'dateNight'])

exports.logTreeOnJournalEvent = onDocumentCreated('journalEvents/{id}', async (event) => {
  const data = event.data.data()
  if (JOURNAL_TREE_SKIP_TYPES.has(data.type)) return

  if (data.type === 'thumbkiss') {
    const day = dateKey(treeEventDate(data.createdAt))
    await logAggregatedTreeEvent(`love_thumbkiss_${day}`, {
      feature: 'love',
      kind: 'thumbkiss',
      byUid: null,
      summary: 'You both connected with a thumbkiss',
      createdAt: data.createdAt,
    })
    return
  }

  if (data.type === 'madlib') {
    if (!data.storyId) return
    const storySnap = await db.doc(`madLibs/${data.storyId}`).get()
    const answers = storySnap.exists ? storySnap.data().answers || {} : {}
    if (Object.keys(answers).length < 2) return
    await logTreeEvent(`games_madlibs_${data.storyId}`, {
      feature: 'games',
      kind: 'madlibs',
      gameName: 'madlibs',
      refId: data.storyId,
      summary: `You both finished "${data.title || 'a Mad Libs story'}"`,
      createdAt: data.createdAt,
    })
    return
  }

  await logTreeEvent(`journal_${event.params.id}`, {
    feature: 'journal',
    kind: data.type,
    refId: event.params.id,
    byUid: data.authorUid || null,
    summary: journalTreeSummary(data),
    createdAt: data.createdAt,
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
