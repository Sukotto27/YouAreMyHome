import { useAuth } from '../../context/AuthContext'
import { toDate } from '../../lib/chatGrouping'

export default function JournalEntry({ entry }) {
  const { user } = useAuth()
  const isMine = entry.authorUid === user.uid
  const time = toDate(entry.createdAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-3">
      <Body entry={entry} isMine={isMine} />
      <p className="mt-1 font-body text-xs text-ink-soft/60">{time}</p>
    </div>
  )
}

function Body({ entry, isMine }) {
  switch (entry.type) {
    case 'mood':
      return (
        <p className="font-body text-sm text-ink">
          {isMine ? 'You' : entry.authorName} felt {entry.emoji} {entry.label}
        </p>
      )
    case 'thumbkiss':
      return <p className="font-body text-sm text-ink">🤙 You shared a thumbkiss</p>
    case 'mail':
      return entry.isCard ? (
        <p className="font-body text-sm text-ink">
          💐 {isMine ? 'You sent' : `${entry.authorName} sent`} a card for {entry.occasion}
        </p>
      ) : (
        <p className="font-body text-sm text-ink">
          💌 {isMine ? 'You sent a letter' : `${entry.authorName} sent you a letter`}
        </p>
      )
    case 'scrapbook':
    case 'gallery':
      return (
        <div>
          <p className="mb-2 font-body text-sm text-ink">
            {isMine ? 'You' : entry.authorName} {entry.type === 'scrapbook' ? 'saved a drawing' : 'added a photo'}
          </p>
          {entry.imageDataUrl && (
            <img src={entry.imageDataUrl} alt="" className="h-24 w-24 rounded-xl object-cover" />
          )}
        </div>
      )
    case 'custom':
      return (
        <div>
          <p className="font-body text-xs font-medium text-rose">{entry.authorName}</p>
          <p className="whitespace-pre-wrap font-body text-sm text-ink">{entry.text}</p>
        </div>
      )
    case 'gratitude':
      return (
        <div>
          <p className="font-body text-xs font-medium text-rose">
            🙏 {isMine ? 'You' : entry.authorName} felt grateful for
          </p>
          <p className="whitespace-pre-wrap font-body text-sm text-ink">{entry.text}</p>
        </div>
      )
    case 'assessment':
      return (
        <p className="font-body text-sm text-ink">
          📋 {isMine ? 'You' : entry.authorName} completed the {entry.title} assessment
        </p>
      )
    case 'madlib':
      return (
        <p className="font-body text-sm text-ink">
          🎲 {isMine ? 'You' : entry.authorName} filled in the Mad Lib "{entry.title}"
        </p>
      )
    case 'dateNight':
      return <p className="font-body text-sm text-ink">💕 Date Night: {entry.title}</p>
    case 'checkin':
      return (
        <div>
          <p className="font-body text-xs font-medium text-rose">
            📝 {isMine ? 'You' : entry.authorName} checked in
            {entry.mood ? ` feeling ${entry.mood.emoji} ${entry.mood.label}` : ''}
          </p>
          <div className="mt-1 space-y-1">
            {entry.mind && (
              <p className="whitespace-pre-wrap font-body text-sm text-ink">
                <span className="text-ink-soft">On their mind:</span> {entry.mind}
              </p>
            )}
            {entry.stress && (
              <p className="whitespace-pre-wrap font-body text-sm text-ink">
                <span className="text-ink-soft">Stressed about:</span> {entry.stress}
              </p>
            )}
            {entry.gratitude && (
              <p className="whitespace-pre-wrap font-body text-sm text-ink">
                <span className="text-ink-soft">Grateful for:</span> {entry.gratitude}
              </p>
            )}
            {entry.doingNow && (
              <p className="whitespace-pre-wrap font-body text-sm text-ink">
                <span className="text-ink-soft">Doing:</span> {entry.doingNow}
              </p>
            )}
          </div>
        </div>
      )
    default:
      return null
  }
}
