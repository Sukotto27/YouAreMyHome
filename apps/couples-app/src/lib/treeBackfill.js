import { collection, collectionGroup, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { dateKey, yearIndexFor } from './tree'

// One-time reconstruction of Tree of Union history from everything that
// already happened before this feature shipped — going forward, the
// equivalent logic in functions/index.js (logTreeEvent/logTreeOnQaComplete/
// etc.) keeps the tree growing live. Deterministic doc ids throughout mean
// this is safe to re-run (e.g. after adding a new feature's backfill logic
// later) without duplicating branches.
//
// Known gap: farkleGame/match and unoGame/match are single ever-live docs
// that get overwritten every game (see useFarkle/useUno) — there's no
// archive of past finished matches to reconstruct, only whichever match (if
// any) happens to be sitting "finished" right now. Every game finished from
// here on will log live via the Cloud Function trigger, so this is a
// one-time gap in history, not an ongoing one.
export async function backfillTreeEvents(onProgress) {
  const report = (label, count) => onProgress?.(`${label}: ${count}`)
  const batches = new BatchWriter()

  await backfillQa(batches, report)
  await backfillScrapbook(batches, report)
  await backfillGallery(batches, report)
  await backfillMail(batches, report)
  await backfillCalendar(batches, report)
  await backfillLoveNotes(batches, report)
  await backfillJournalEvents(batches, report)
  await backfillStoryTurns(batches, report)
  await backfillCurrentGameMatches(batches, report)

  await batches.flush()
  return batches.total
}

// Batches writes in chunks under Firestore's 500-ops-per-batch limit,
// flushing automatically — callers just keep calling `set`.
class BatchWriter {
  constructor() {
    this.batch = writeBatch(db)
    this.pending = 0
    this.total = 0
  }

  async set(ref, data) {
    this.batch.set(ref, data, { merge: true })
    this.pending += 1
    this.total += 1
    if (this.pending >= 400) await this.flush()
  }

  async flush() {
    if (this.pending === 0) return
    await this.batch.commit()
    this.batch = writeBatch(db)
    this.pending = 0
  }
}

function toDate(timestamp) {
  if (!timestamp) return null
  return typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp)
}

function treeEvent(createdAt, fields) {
  const date = toDate(createdAt) || new Date()
  return { ...fields, createdAt: createdAt || date, yearIndex: yearIndexFor(date) }
}

function truncate(text, max = 80) {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

async function backfillQa(batches, report) {
  const roundsSnap = await getDocs(collection(db, 'qaRounds'))
  let count = 0
  for (const roundDoc of roundsSnap.docs) {
    const round = roundDoc.data()
    const answers = round.answers || {}
    if (Object.keys(answers).length < 2) continue
    await batches.set(
      doc(db, 'treeEvents', `qa_${roundDoc.id}`),
      treeEvent(round.lastActivityAt || round.createdAt, {
        feature: 'qa',
        kind: 'answered',
        refId: roundDoc.id,
        byUids: Object.keys(answers),
        category: round.category || null,
        summary: `You both answered "${truncate(round.questionText, 100)}"`,
      }),
    )
    count += 1
  }
  report('Q&A rounds answered by both', count)

  const commentsCount = await backfillCommentsFor('qaRounds', 'qa', (id) => `qa_${id}`, batches)
  report('Q&A comments', commentsCount)
}

async function backfillScrapbook(batches, report) {
  const snap = await getDocs(collection(db, 'scrapbook'))
  for (const d of snap.docs) {
    const data = d.data()
    await batches.set(
      doc(db, 'treeEvents', `games_draw_${d.id}`),
      treeEvent(data.createdAt, {
        feature: 'games',
        kind: 'draw',
        gameName: 'draw',
        refId: d.id,
        byUid: data.savedBy || null,
        summary: `${data.savedByName || 'They'} saved a drawing to the scrapbook`,
      }),
    )
  }
  report('Scrapbook drawings', snap.size)

  const commentsCount = await backfillCommentsFor('scrapbook', 'games', (id) => `games_draw_${id}`, batches)
  report('Draw comments', commentsCount)
}

async function backfillGallery(batches, report) {
  const snap = await getDocs(collection(db, 'gallery'))
  for (const d of snap.docs) {
    const data = d.data()
    await batches.set(
      doc(db, 'treeEvents', `gallery_${d.id}`),
      treeEvent(data.createdAt, {
        feature: 'gallery',
        kind: 'uploaded',
        refId: d.id,
        byUid: data.uploadedBy || null,
        summary: `${data.uploadedByName || 'They'} added a photo to the gallery`,
      }),
    )
  }
  report('Gallery photos', snap.size)

  const commentsCount = await backfillCommentsFor('gallery', 'gallery', (id) => `gallery_${id}`, batches)
  report('Gallery comments', commentsCount)
}

async function backfillMail(batches, report) {
  const snap = await getDocs(collection(db, 'loveLetters'))
  for (const d of snap.docs) {
    const data = d.data()
    const isCard = data.type === 'card'
    await batches.set(
      doc(db, 'treeEvents', `mail_${d.id}`),
      treeEvent(data.createdAt, {
        feature: 'mail',
        kind: isCard ? 'card' : 'letter',
        refId: d.id,
        byUid: data.fromUid || null,
        summary: isCard
          ? `${data.fromName || 'They'} sent a card for ${data.occasion}`
          : `${data.fromName || 'They'} sent a love letter`,
      }),
    )
  }
  report('Mail', snap.size)
}

async function backfillCalendar(batches, report) {
  const snap = await getDocs(collection(db, 'milestones'))
  let count = 0
  for (const d of snap.docs) {
    const data = d.data()
    // migrations.js seeds a couple of milestones (anniversary, birthdays)
    // with addedBy: null — no real actor, nothing to hang a branch on.
    if (!data.addedBy) continue
    await batches.set(
      doc(db, 'treeEvents', `calendar_${d.id}`),
      treeEvent(data.createdAt, {
        feature: 'calendar',
        kind: data.category || 'milestone',
        refId: d.id,
        byUid: data.addedBy,
        summary: `${data.addedByName || 'They'} added "${truncate(data.title, 60)}"`,
      }),
    )
    count += 1
  }
  report('Calendar entries', count)

  const commentsCount = await backfillCommentsFor('milestones', 'calendar', (id) => `calendar_${id}`, batches)
  report('Calendar comments', commentsCount)
}

// Same-day-per-person aggregation, matching logAggregatedTreeEvent in
// functions/index.js — folds a day's worth of taps into one growing twig.
async function backfillLoveNotes(batches, report) {
  const snap = await getDocs(collection(db, 'loveNotes'))
  const byDay = new Map() // id -> { data, count }
  for (const d of snap.docs) {
    const data = d.data()
    const date = toDate(data.createdAt)
    if (!data.fromUid || !date) continue
    const day = dateKey(date)
    const id = `love_${data.category || 'note'}_${data.fromUid}_${day}`
    const entry = byDay.get(id) || { count: 0, lastAt: null, kind: data.category === 'kiss' ? 'kiss' : 'note', byUid: data.fromUid }
    entry.count += 1
    if (!entry.lastAt || date > toDate(entry.lastAt)) {
      entry.lastAt = data.createdAt
      entry.lastSummary =
        data.category === 'kiss' ? `${data.fromName || 'They'} sent a kiss` : `${data.fromName || 'They'} sent: ${truncate(data.message)}`
    }
    byDay.set(id, entry)
  }
  for (const [id, entry] of byDay) {
    const date = toDate(entry.lastAt) || new Date()
    await batches.set(doc(db, 'treeEvents', id), {
      feature: 'love',
      kind: entry.kind,
      byUid: entry.byUid,
      count: entry.count,
      lastSummary: entry.lastSummary,
      lastAt: entry.lastAt,
      yearIndex: yearIndexFor(date),
    })
  }
  report('Send Love days', byDay.size)
}

async function backfillJournalEvents(batches, report) {
  const snap = await getDocs(collection(db, 'journalEvents'))
  const skipTypes = new Set(['scrapbook', 'gallery', 'mail', 'dateNight'])
  const thumbkissDays = new Map()
  const madlibStoryIds = new Set()
  let journalCount = 0

  for (const d of snap.docs) {
    const data = d.data()
    if (skipTypes.has(data.type)) continue

    if (data.type === 'thumbkiss') {
      const date = toDate(data.createdAt)
      if (!date) continue
      const day = dateKey(date)
      const entry = thumbkissDays.get(day) || { count: 0 }
      entry.count += 1
      entry.lastAt = data.createdAt
      thumbkissDays.set(day, entry)
      continue
    }

    if (data.type === 'madlib') {
      if (data.storyId) madlibStoryIds.add(data.storyId)
      continue
    }

    await batches.set(
      doc(db, 'treeEvents', `journal_${d.id}`),
      treeEvent(data.createdAt, {
        feature: 'journal',
        kind: data.type,
        refId: d.id,
        byUid: data.authorUid || null,
        summary: journalSummary(data),
      }),
    )
    journalCount += 1
  }
  report('Journal entries', journalCount)

  for (const [day, entry] of thumbkissDays) {
    const date = toDate(entry.lastAt) || new Date()
    await batches.set(doc(db, 'treeEvents', `love_thumbkiss_${day}`), {
      feature: 'love',
      kind: 'thumbkiss',
      byUid: null,
      count: entry.count,
      lastSummary: 'You both connected with a thumbkiss',
      lastAt: entry.lastAt,
      yearIndex: yearIndexFor(date),
    })
  }
  report('Thumbkiss days', thumbkissDays.size)

  let madlibsCount = 0
  for (const storyId of madlibStoryIds) {
    const storySnap = await getDoc(doc(db, 'madLibs', storyId))
    if (!storySnap.exists()) continue
    const story = storySnap.data()
    const answers = story.answers || {}
    if (Object.keys(answers).length < 2) continue
    await batches.set(
      doc(db, 'treeEvents', `games_madlibs_${storyId}`),
      treeEvent(story.createdAt, {
        feature: 'games',
        kind: 'madlibs',
        gameName: 'madlibs',
        refId: storyId,
        summary: `You both finished "${story.title || 'a Mad Libs story'}"`,
      }),
    )
    madlibsCount += 1
  }
  report('Mad Libs finished together', madlibsCount)
}

function journalSummary(data) {
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

async function backfillStoryTurns(batches, report) {
  const snap = await getDocs(collection(db, 'storyTurns'))
  let count = 0
  for (const d of snap.docs) {
    const data = d.data()
    if (!data.filledWord) continue
    await batches.set(
      doc(db, 'treeEvents', `games_story_${d.id}`),
      treeEvent(data.filledAt || data.createdAt, {
        feature: 'games',
        kind: 'story',
        gameName: 'story',
        refId: d.id,
        byUids: [data.authorUid, data.filledByUid].filter(Boolean),
        summary: `${data.authorName || 'They'} left a blank, and it got filled in`,
      }),
    )
    count += 1
  }
  report('Never-Ending Story turns', count)
}

// Best-effort only — see the module comment on why past finished
// matches can't be reconstructed, just whichever is live right now.
async function backfillCurrentGameMatches(batches, report) {
  let count = 0
  const farkleSnap = await getDoc(doc(db, 'farkleGame', 'match'))
  if (farkleSnap.exists() && farkleSnap.data().status === 'finished') {
    const data = farkleSnap.data()
    await batches.set(doc(db, 'treeEvents', 'games_farkle_backfill_current'), {
      feature: 'games',
      kind: 'farkle',
      gameName: 'farkle',
      byUids: Object.keys(data.scores || {}),
      summary: 'Finished a game of Farkle',
      createdAt: data.updatedAt || new Date(),
      yearIndex: yearIndexFor(toDate(data.updatedAt) || new Date()),
    })
    count += 1
  }
  const unoSnap = await getDoc(doc(db, 'unoGame', 'match'))
  if (unoSnap.exists() && unoSnap.data().status === 'finished') {
    const data = unoSnap.data()
    await batches.set(doc(db, 'treeEvents', 'games_uno_backfill_current'), {
      feature: 'games',
      kind: 'uno',
      gameName: 'uno',
      byUids: Object.keys(data.hands || {}),
      summary: 'Finished a game of Uno',
      createdAt: data.updatedAt || new Date(),
      yearIndex: yearIndexFor(toDate(data.updatedAt) || new Date()),
    })
    count += 1
  }
  report('Currently-finished game matches', count)
}

// Reads every `comments` subcollection under `parentCollection` in one
// collectionGroup query rather than looping each parent doc individually.
async function backfillCommentsFor(parentCollection, feature, parentEventId, batches) {
  const snap = await getDocs(collectionGroup(db, 'comments'))
  let count = 0
  for (const commentDoc of snap.docs) {
    const parentRef = commentDoc.ref.parent.parent
    if (!parentRef || parentRef.parent.id !== parentCollection) continue
    const comment = commentDoc.data()
    await batches.set(
      doc(db, 'treeEvents', `${parentCollection}_${parentRef.id}_c_${commentDoc.id}`),
      treeEvent(comment.createdAt, {
        feature,
        kind: 'comment',
        refId: commentDoc.id,
        byUid: comment.authorUid || null,
        parentEventId: parentEventId(parentRef.id),
        summary: comment.text ? `${comment.authorName || 'They'} commented: ${truncate(comment.text)}` : `${comment.authorName || 'They'} commented`,
      }),
    )
    count += 1
  }
  return count
}
