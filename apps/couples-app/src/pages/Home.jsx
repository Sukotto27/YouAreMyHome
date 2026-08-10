import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RelationshipCounter from '../components/counter/RelationshipCounter'
import InstallBanner from '../components/InstallBanner'
import NotificationBanner from '../components/NotificationBanner'
import LocationClocks from '../components/LocationClocks'
import MoodBubble from '../components/MoodBubble'
import AvatarBadge from '../components/AvatarBadge'
import LoveNoteCard from '../components/LoveNoteCard'
import { useAuth } from '../context/AuthContext'
import { useMoods } from '../hooks/useMoods'
import { useChatSettings } from '../hooks/useChatSettings'
import { useUnreadBadges } from '../hooks/useUnreadBadges'
import { useUpcomingDateNight } from '../hooks/useUpcomingDateNight'
import { useUpcomingCalendarItems } from '../hooks/useUpcomingCalendarItems'
import { useAwaitingQa } from '../hooks/useAwaitingQa'
import { useCheckIn } from '../hooks/useCheckIn'
import { useLoveNotes } from '../hooks/useLoveNotes'
import { markSeenNow } from '../hooks/useMarkSeen'
import { avatarFor, preferredNameFor } from '../lib/avatars'
import { CALENDAR_TAB_FOR_CATEGORY } from '../lib/milestones'
import { APP_VERSION_LABEL } from '../lib/appVersion'
import { formatCountdown } from '../lib/countdown'
import heartLeft from '../assets/images/heart-left.png'
import heartRight from '../assets/images/heart-right.png'

export default function Home() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { moods, setMyMood } = useMoods()
  const [chatSettings] = useChatSettings()
  const { unread, detail } = useUnreadBadges()
  const upcomingDateNight = useUpcomingDateNight()
  const upcomingCalendarCategory = useUpcomingCalendarItems()
  const awaitingQa = useAwaitingQa()
  const { myCheckIn, partnerCheckIn } = useCheckIn()
  const { incoming: incomingLoveNote, sendReply } = useLoveNotes()
  const [loveNoteOpen, setLoveNoteOpen] = useState(false)
  const [loveNoteReplied, setLoveNoteReplied] = useState(false)

  function openLoveNote() {
    markSeenNow(user, 'loveNotes')
    setLoveNoteOpen(true)
  }

  function closeLoveNote() {
    setLoveNoteOpen(false)
    setLoveNoteReplied(false)
  }

  function replyToLoveNote() {
    sendReply(incomingLoveNote)
    setLoveNoteReplied(true)
  }

  function badgesFor(isMine) {
    const badges = []
    if (!isMine) {
      if (unread.chat) {
        badges.push({ type: 'chat', emoji: '💬', label: 'Unread messages — open chat', onClick: () => navigate('/chat') })
      }
      if (unread.mail) {
        badges.push({
          type: 'mail',
          emoji: detail.mail ? '💐' : '💌',
          label: 'New mail — open Mail',
          onClick: () => navigate('/mail'),
        })
      }
      if (unread.loveNotes) {
        badges.push({
          type: 'sendLove',
          emoji: detail.loveNotes || '💕',
          label: 'They sent you love — tap to view',
          onClick: openLoveNote,
        })
      }
    } else {
      if (awaitingQa) {
        badges.push({
          type: 'qa',
          emoji: '❓',
          label: 'A question is awaiting your answer',
          onClick: () => navigate('/qa', { state: { category: 'awaiting' } }),
        })
      }
      if (partnerCheckIn && !myCheckIn) {
        badges.push({
          type: 'journal',
          emoji: '📝',
          label: 'Your partner checked in — check in too',
          onClick: () => navigate('/journal', { state: { tab: 'status' } }),
        })
      }
    }
    if (upcomingCalendarCategory) {
      badges.push({
        type: 'calendar',
        emoji: '📅',
        label: 'Something is coming up soon — open Calendar',
        onClick: () => navigate('/calendar', { state: { tab: CALENDAR_TAB_FOR_CATEGORY[upcomingCalendarCategory] } }),
      })
    }
    return badges
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto">
      {/* faint paper grain */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-multiply"
        style={{
          backgroundImage:
            'radial-gradient(rgba(54,37,33,0.09) 0.6px, transparent 0.6px)',
          backgroundSize: '3px 3px',
        }}
      />
      {/* soft vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(54,37,33,0.06)_100%)]" />

      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-10 px-6 py-10 text-center">
        <InstallBanner />
        <NotificationBanner />

        <div className="relative h-24 w-28 sm:h-32 sm:w-36" aria-hidden="true">
          <img
            src={heartLeft}
            alt=""
            className="absolute inset-y-0 left-0 h-full w-1/2 object-contain object-right animate-heart-in-left motion-reduce:animate-none"
          />
          <img
            src={heartRight}
            alt=""
            className="absolute inset-y-0 right-0 h-full w-1/2 object-contain object-left animate-heart-in-right motion-reduce:animate-none"
          />
        </div>

        <div className="space-y-3">
          <h1 className="font-display text-4xl italic tracking-tight text-ink sm:text-5xl">
            You Are My Home
          </h1>
          <p className="font-hand text-xl text-rose sm:text-2xl">
            a little corner of the internet, just for the two of us
          </p>
        </div>

        <RelationshipCounter />

        <div className="relative flex items-start gap-6 sm:gap-10">
          {upcomingDateNight && (
            <button
              type="button"
              onClick={() => navigate('/calendar', { state: { tab: 'dateNights' } })}
              aria-label={`Date Night "${upcomingDateNight.item.title}" is about to start — open Calendar`}
              className="absolute -top-6 left-1/2 flex -translate-x-1/2 animate-bounce items-center gap-1 whitespace-nowrap rounded-full bg-rose px-3 py-1 font-body text-xs font-medium text-paper shadow-md transition-transform hover:scale-105"
            >
              🎬 {formatCountdown(upcomingDateNight.msUntil)}
            </button>
          )}
          <Avatar
            src={avatarFor('Cristina', chatSettings.avatars)}
            name={preferredNameFor('Cristina', chatSettings.preferredNames)}
            ring="ring-blush"
            mood={moodFor('Cristina', user, moods)}
            isMine={user.displayName === 'Cristina'}
            onSetMood={setMyMood}
            onOpenSettings={() => navigate('/settings')}
            badges={badgesFor(user.displayName === 'Cristina')}
          />
          <span className="mt-6 font-display text-2xl text-gold sm:mt-8">&amp;</span>
          <Avatar
            src={avatarFor('Scott', chatSettings.avatars)}
            name={preferredNameFor('Scott', chatSettings.preferredNames)}
            ring="ring-teal"
            mood={moodFor('Scott', user, moods)}
            isMine={user.displayName === 'Scott'}
            onSetMood={setMyMood}
            onOpenSettings={() => navigate('/settings')}
            badges={badgesFor(user.displayName === 'Scott')}
          />
        </div>

        <LocationClocks />
      </div>

      {loveNoteOpen && incomingLoveNote && (
        <LoveNoteCard note={incomingLoveNote} replied={loveNoteReplied} onReply={replyToLoveNote} onClose={closeLoveNote} />
      )}

      <footer className="relative pb-6 text-center">
        <p className="font-hand text-lg text-ink-soft">
          — always us, always ours · sempre nós, sempre nosso —
        </p>
        <p className="mt-1.5 font-body text-[10px] text-ink-soft/40">{APP_VERSION_LABEL}</p>
      </footer>
    </div>
  )
}

function moodFor(name, user, moods) {
  if (name === user.displayName) return moods[user.uid]
  const partnerEntry = Object.entries(moods).find(([uid]) => uid !== user.uid)
  return partnerEntry?.[1]
}

function Avatar({ src, name, ring, mood, isMine, onSetMood, onOpenSettings, badges }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <img
          src={src}
          alt={name}
          onClick={isMine ? onOpenSettings : undefined}
          className={`h-16 w-16 rounded-full object-cover ring-4 ring-offset-4 ring-offset-paper sm:h-20 sm:w-20 ${ring} ${
            isMine ? 'cursor-pointer transition-transform hover:scale-105' : ''
          }`}
        />
        {badges.map((badge) => (
          <AvatarBadge key={badge.type} type={badge.type} emoji={badge.emoji} label={badge.label} onClick={badge.onClick} />
        ))}
      </div>
      <span className="font-body text-sm text-ink-soft">{name}</span>
      <MoodBubble mood={mood} isMine={isMine} onSetMood={onSetMood} />
    </div>
  )
}
