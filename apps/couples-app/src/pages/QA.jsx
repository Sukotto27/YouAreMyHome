import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, orderBy, query, limit, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePartnerUid } from '../hooks/usePartnerUid'
import { useChatSettings } from '../hooks/useChatSettings'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { QUESTION_LIBRARY } from '../data/questionLibrary'
import QaMenu from '../components/qa/QaMenu'
import QuestionList from '../components/qa/QuestionList'
import QuestionDetail from '../components/qa/QuestionDetail'
import RewindList from '../components/qa/RewindList'
import RevealView from '../components/qa/RevealView'
import AssessmentsPanel from '../components/qa/AssessmentsPanel'
import { useMarkSeen } from '../hooks/useMarkSeen'

const DEMO_PARTNER_UID = 'demo-partner'
const ROUNDS_LIMIT = 500

function isComplete(round) {
  return Object.keys(round.answers || {}).length >= 2
}

export default function QA() {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const [chatSettings] = useChatSettings()
  useMarkSeen('qa')

  // In demo mode there's never a real partner to discover via presence, but
  // the simulated partner answer (see answerQuestion) always uses this uid —
  // falling back to it here keeps "Awaiting Your Answer" and the avatar
  // checkmarks testable/working in preview mode too.
  const effectivePartnerUid = firebaseReady ? partnerUid : DEMO_PARTNER_UID
  // Avatars are keyed by the exact 'Scott'/'Cristina' strings used everywhere
  // else in the app (NamePrompt, chat settings) — normalizing "mine" the same
  // way `partnerName` already was keeps the two always distinct, instead of
  // falling through to a raw email (or the demo placeholder name) that
  // matches nothing in the chat avatar map and no longer resolves to "you".
  const mineLabel = user.displayName === 'Cristina' ? 'Cristina' : 'Scott'
  const partnerName = mineLabel === 'Scott' ? 'Cristina' : 'Scott'

  const [rounds, setRounds] = useState(firebaseReady ? [] : readDemoList('qaRounds'))
  const [loading, setLoading] = useState(firebaseReady)
  const [busy, setBusy] = useState(false)
  const [rewinding, setRewinding] = useState(false)
  const [rewindTarget, setRewindTarget] = useState(null)

  // 'menu' | 'category' | 'assessments' | 'question' — the landing screen is
  // always the category menu now; browsing a category (or the virtual
  // "awaiting"/"Custom" ones) is the primary way to find a question to
  // answer, with the featured random pick as a shortcut into the same detail
  // view. A placeholder ahead of a bigger Q&A rework.
  const [view, setView] = useState('menu')
  const [activeCategory, setActiveCategory] = useState(null) // string | 'awaiting' | 'Custom'
  const [activeQuestion, setActiveQuestion] = useState(null)
  const [randomPick, setRandomPick] = useState(null)

  useEffect(() => {
    if (!firebaseReady) return
    const roundsQuery = query(collection(db, 'qaRounds'), orderBy('createdAt', 'desc'), limit(ROUNDS_LIMIT))
    const unsubscribe = onSnapshot(roundsQuery, (snapshot) => {
      setRounds(snapshot.docs.map((roundDoc) => ({ id: roundDoc.id, ...roundDoc.data() })))
      setLoading(false)
    })
    return unsubscribe
  }, [])

  function persistDemoRounds(next) {
    setRounds(next)
    writeDemoList('qaRounds', next)
  }

  // questionId -> round, for library questions that have been asked/answered
  const roundByQuestionId = useMemo(() => {
    const map = {}
    rounds.forEach((round) => {
      if (round.questionId) map[round.questionId] = round
    })
    return map
  }, [rounds])

  const customRounds = useMemo(() => rounds.filter((round) => !round.questionId), [rounds])

  // Questions where your partner has answered and you haven't — symmetric:
  // each of you sees only the ones the other person answered first.
  const awaitingRounds = useMemo(
    () => rounds.filter((round) => round.answers?.[effectivePartnerUid] && !round.answers?.[user.uid]),
    [rounds, effectivePartnerUid, user.uid],
  )

  // Library questions neither of you has answered yet — the pool the
  // featured "random question" card and its shuffle button draw from.
  const freshPool = useMemo(
    () =>
      QUESTION_LIBRARY.filter((q) => {
        const round = roundByQuestionId[q.id]
        const answers = round?.answers || {}
        return !answers[user.uid] && !answers[effectivePartnerUid]
      }),
    [roundByQuestionId, user.uid, effectivePartnerUid],
  )

  // Re-roll the featured pick only when it becomes stale (answered, or the
  // pool changes under it) — not on every render.
  useEffect(() => {
    setRandomPick((current) => {
      if (current && freshPool.some((q) => q.id === current.id)) return current
      return freshPool.length > 0 ? freshPool[Math.floor(Math.random() * freshPool.length)] : null
    })
  }, [freshPool])

  function shuffleRandom() {
    if (freshPool.length === 0) return
    const pool = freshPool.filter((q) => q.id !== randomPick?.id)
    const source = pool.length > 0 ? pool : freshPool
    setRandomPick(source[Math.floor(Math.random() * source.length)])
  }

  function roundForQuestion(question) {
    if (question.questionId) return roundByQuestionId[question.questionId]
    return rounds.find((round) => round.id === question.id) || null
  }

  function enrichQuestion(question, questionId) {
    const round = questionId ? roundByQuestionId[questionId] : rounds.find((r) => r.id === question.id)
    const answers = round?.answers || {}
    return {
      ...question,
      questionId: questionId || null,
      answeredByMe: !!answers[user.uid],
      answeredByPartner: !!answers[effectivePartnerUid],
    }
  }

  function questionsForCategory(cat) {
    if (cat === 'awaiting') {
      return awaitingRounds.map((round) =>
        enrichQuestion(
          { id: round.questionId || round.id, text: round.questionText, category: round.category, options: round.options },
          round.questionId,
        ),
      )
    }
    if (cat === 'Custom') {
      return customRounds.map((round) =>
        enrichQuestion({ id: round.id, text: round.questionText, category: 'Custom', options: round.options }, null),
      )
    }
    return QUESTION_LIBRARY.filter((q) => q.category === cat).map((q) => enrichQuestion(q, q.id))
  }

  function openQuestion(question) {
    setActiveQuestion(question)
    setView('question')
  }

  async function answerQuestion(question, text) {
    setBusy(true)
    try {
      const round = roundForQuestion(question)
      const authorName = user.displayName || user.email

      if (!firebaseReady) {
        if (!round) {
          const newRound = {
            id: crypto.randomUUID(),
            questionText: question.text,
            questionId: question.questionId || null,
            category: question.category || null,
            options: question.options || null,
            answers: { [user.uid]: { text, name: authorName } },
            createdBy: user.uid,
            createdAt: new Date().toISOString(),
          }
          persistDemoRounds([newRound, ...rounds])
          setTimeout(() => {
            setRounds((prev) => {
              const next = prev.map((r) =>
                r.id === newRound.id
                  ? {
                      ...r,
                      answers: {
                        ...r.answers,
                        [DEMO_PARTNER_UID]: {
                          text: "(preview) I'll answer for real once we're both connected!",
                          name: 'Your partner',
                        },
                      },
                    }
                  : r,
              )
              writeDemoList('qaRounds', next)
              return next
            })
          }, 1500)
        } else {
          persistDemoRounds(
            rounds.map((r) =>
              r.id === round.id ? { ...r, answers: { ...r.answers, [user.uid]: { text, name: authorName } } } : r,
            ),
          )
        }
        return
      }

      if (!round) {
        await addDoc(collection(db, 'qaRounds'), {
          questionText: question.text,
          questionId: question.questionId || null,
          category: question.category || null,
          options: question.options || null,
          answers: { [user.uid]: { text, name: authorName, submittedAt: serverTimestamp() } },
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
          lastActivityByUid: user.uid,
          commentCount: 0,
        })
      } else {
        await updateDoc(doc(db, 'qaRounds', round.id), {
          [`answers.${user.uid}`]: { text, name: authorName, submittedAt: serverTimestamp() },
        })
      }
    } finally {
      setBusy(false)
    }
  }

  async function askCustomQuestion(text) {
    const trimmed = text.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      if (!firebaseReady) {
        const newRound = {
          id: crypto.randomUUID(),
          questionText: trimmed,
          questionId: null,
          category: 'Custom',
          options: null,
          answers: {},
          createdAt: new Date().toISOString(),
        }
        persistDemoRounds([newRound, ...rounds])
        return
      }
      await addDoc(collection(db, 'qaRounds'), {
        questionText: trimmed,
        questionId: null,
        category: 'Custom',
        options: null,
        answers: {},
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
        lastActivityByUid: user.uid,
        commentCount: 0,
      })
    } finally {
      setBusy(false)
    }
  }

  if (rewindTarget) {
    return (
      <RevealView
        roundId={rewindTarget.id}
        questionText={rewindTarget.questionText}
        answers={rewindTarget.answers}
        currentUid={user.uid}
        onAskAgain={() => setRewindTarget(null)}
        startingNew={false}
        rewind
        askAgainLabel="← Back to Rewind"
      />
    )
  }

  if (rewinding) {
    const past = rounds.filter(isComplete)
    return <RewindList rounds={past} onSelect={setRewindTarget} onBack={() => setRewinding(false)} />
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-hand text-2xl text-ink-soft">just a moment...</p>
      </div>
    )
  }

  const backTarget = () => setView(activeCategory ? 'category' : 'menu')

  if (view === 'question' && activeQuestion) {
    return (
      <QuestionDetail
        question={activeQuestion}
        round={roundForQuestion(activeQuestion)}
        currentUid={user.uid}
        submitting={busy}
        onSubmit={(text) => answerQuestion(activeQuestion, text)}
        onBack={backTarget}
      />
    )
  }

  if (view === 'assessments') {
    return <AssessmentsPanel onBack={() => setView('menu')} />
  }

  if (view === 'category' && activeCategory) {
    const categoryTitle =
      activeCategory === 'awaiting' ? 'Awaiting Your Answer' : activeCategory === 'Custom' ? 'Custom' : activeCategory
    return (
      <QuestionList
        title={categoryTitle}
        questions={questionsForCategory(activeCategory)}
        mineLabel={mineLabel}
        partnerLabel={partnerName}
        avatars={chatSettings.avatars}
        showCategoryTag={activeCategory === 'awaiting'}
        onSelectQuestion={openQuestion}
        onBack={() => setView('menu')}
        onAskCustom={activeCategory === 'Custom' ? askCustomQuestion : null}
        submittingCustom={busy}
      />
    )
  }

  return (
    <QaMenu
      randomQuestion={randomPick}
      onShuffleRandom={shuffleRandom}
      onAnswerRandom={() => randomPick && openQuestion(enrichQuestion(randomPick, randomPick.id))}
      onSelectCategory={(cat) => {
        setActiveCategory(cat)
        setView('category')
      }}
      onSelectAwaiting={() => {
        setActiveCategory('awaiting')
        setView('category')
      }}
      onSelectCustom={() => {
        setActiveCategory('Custom')
        setView('category')
      }}
      onSelectAssessments={() => setView('assessments')}
      onRewind={() => setRewinding(true)}
      awaitingCount={awaitingRounds.length}
    />
  )
}
