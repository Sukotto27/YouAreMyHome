import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import StartRound from '../components/qa/StartRound'
import AnswerForm from '../components/qa/AnswerForm'
import WaitingView from '../components/qa/WaitingView'
import RevealView from '../components/qa/RevealView'
import RewindList from '../components/qa/RewindList'
import { useMarkSeen } from '../hooks/useMarkSeen'

const DEMO_PARTNER_UID = 'demo-partner'

function isComplete(round) {
  return Object.keys(round.answers || {}).length >= 2
}

export default function QA() {
  const { user } = useAuth()
  useMarkSeen('qa')
  const [rounds, setRounds] = useState(firebaseReady ? [] : readDemoList('qaRounds'))
  const [loading, setLoading] = useState(firebaseReady)
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)
  const [rewinding, setRewinding] = useState(false)
  const [rewindTarget, setRewindTarget] = useState(null)

  useEffect(() => {
    if (!firebaseReady) return
    const roundsQuery = query(collection(db, 'qaRounds'), orderBy('createdAt', 'desc'), limit(30))
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

  async function startRound({ text, options }) {
    setBusy(true)
    try {
      if (!firebaseReady) {
        const newRound = {
          id: crypto.randomUUID(),
          questionText: text,
          options: options || null,
          answers: {},
          createdAt: new Date().toISOString(),
        }
        persistDemoRounds([newRound, ...rounds])
        setComposing(false)
        return
      }
      await addDoc(collection(db, 'qaRounds'), {
        questionText: text,
        options: options || null,
        answers: {},
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      })
      setComposing(false)
    } finally {
      setBusy(false)
    }
  }

  async function submitAnswer(round, text) {
    setBusy(true)
    try {
      if (!firebaseReady) {
        const withMyAnswer = rounds.map((r) =>
          r.id === round.id
            ? { ...r, answers: { ...r.answers, [user.uid]: { text, name: user.displayName } } }
            : r,
        )
        persistDemoRounds(withMyAnswer)
        setTimeout(() => {
          setRounds((prev) => {
            const next = prev.map((r) =>
              r.id === round.id
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
        return
      }
      await updateDoc(doc(db, 'qaRounds', round.id), {
        [`answers.${user.uid}`]: {
          text,
          name: user.displayName || user.email,
          submittedAt: serverTimestamp(),
        },
      })
    } finally {
      setBusy(false)
    }
  }

  if (rewindTarget) {
    return (
      <RevealView
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
    return (
      <RewindList
        rounds={past}
        onSelect={setRewindTarget}
        onBack={() => setRewinding(false)}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-hand text-2xl text-ink-soft">just a moment...</p>
      </div>
    )
  }

  const latest = rounds[0]
  const showStart = !latest || composing

  if (showStart) {
    return (
      <StartRound onStart={startRound} starting={busy} onRewind={() => setRewinding(true)} />
    )
  }

  const answers = latest.answers || {}
  const ownAnswer = answers[user.uid]
  const answerCount = Object.keys(answers).length

  if (answerCount >= 2) {
    return (
      <RevealView
        questionText={latest.questionText}
        answers={answers}
        currentUid={user.uid}
        onAskAgain={() => setComposing(true)}
        startingNew={busy}
      />
    )
  }

  if (ownAnswer) {
    return <WaitingView questionText={latest.questionText} ownAnswer={ownAnswer.text} />
  }

  return (
    <AnswerForm
      questionText={latest.questionText}
      options={latest.options}
      partnerHasAnswered={answerCount > 0}
      onSubmit={(text) => submitAnswer(latest, text)}
      submitting={busy}
    />
  )
}
