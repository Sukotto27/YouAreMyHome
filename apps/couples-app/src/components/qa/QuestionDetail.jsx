import AnswerForm from './AnswerForm'
import WaitingView from './WaitingView'
import RevealView from './RevealView'

// The per-question view reached by clicking a row in QuestionList (or the
// featured random question). Answer state is derived fresh from `round` on
// every render, so submitting an answer here — or the partner doing so
// elsewhere — flips this straight into the reveal once both are in, with no
// separate transition step needed.
export default function QuestionDetail({ question, round, currentUid, onSubmit, submitting, onBack }) {
  const answers = round?.answers || {}
  const ownAnswer = answers[currentUid]
  const answerCount = Object.keys(answers).length
  const bothAnswered = answerCount >= 2

  if (bothAnswered) {
    return (
      <RevealView
        roundId={round.id}
        questionText={question.text}
        answers={answers}
        currentUid={currentUid}
        onAskAgain={onBack}
        rewind
        askAgainLabel="← Back"
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="self-start font-body text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
      >
        ← Back
      </button>
      {ownAnswer ? (
        <WaitingView questionText={question.text} ownAnswer={ownAnswer.text} />
      ) : (
        <AnswerForm
          questionText={question.text}
          options={question.options}
          partnerHasAnswered={answerCount > 0}
          onSubmit={onSubmit}
          submitting={submitting}
        />
      )}
    </div>
  )
}
