import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import RelationshipCounter from '../components/counter/RelationshipCounter'
import InstallBanner from '../components/InstallBanner'
import NotificationBanner from '../components/NotificationBanner'
import LocationClocks from '../components/LocationClocks'
import MoodBubble from '../components/MoodBubble'
import AvatarBadge from '../components/AvatarBadge'
import LoveNoteCard from '../components/LoveNoteCard'
import PartnerActionMenu from '../components/PartnerActionMenu'
import { useAuth } from '../context/AuthContext'
import { useMoods } from '../hooks/useMoods'
import { useChatSettings } from '../hooks/useChatSettings'
import { useNotifications } from '../context/NotificationsContext'
import { useUpcomingDateNight } from '../hooks/useUpcomingDateNight'
import { useLoveNotes } from '../hooks/useLoveNotes'
import { markSeenNow } from '../hooks/useMarkSeen'
import { avatarFor, preferredNameFor } from '../lib/avatars'
import { APP_VERSION_LABEL } from '../lib/appVersion'
import { formatCountdown } from '../lib/countdown'
import heartLeft from '../assets/images/heart-left.png'
import heartRight from '../assets/images/heart-right.png'
import { myNameFor, partnerNameFor } from '../lib/names'

const LONG_PRESS_MS = 500

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { moods, setMyMood } = useMoods()
  const [chatSettings] = useChatSettings()
  const { items: notifications } = useNotifications()
  const upcomingDateNight = useUpcomingDateNight()
  const { incoming: incomingLoveNote, sendReply } = useLoveNotes()
  const [loveNoteOpen, setLoveNoteOpen] = useState(false)
  const [loveNoteReplied, setLoveNoteReplied] = useState(false)
  const [partnerMenuOpen, setPartnerMenuOpen] = useState(false)

  function openLoveNote() {
    markSeenNow(user, 'loveNotes')
    setLoveNoteOpen(true)
  }

  // arriving from the Notifications page's "Open" on a love note
  useEffect(() => {
    if (!location.state?.openLoveNote) return
    openLoveNote()
    navigate('/', { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  function closeLoveNote() {
    setLoveNoteOpen(false)
    setLoveNoteReplied(false)
  }

  function replyToLoveNote() {
    sendReply(incomingLoveNote)
    setLoveNoteReplied(true)
  }

  // The avatar icons come from the shared notifications list (context/NotificationsContext.jsx),
  // so they always match the Notifications page. All game icons (an invite, or it being your
  // turn) collapse into one 🎮 that opens the Notifications page rather than the game.
  function badgesFor(isMine) {
    const side = isMine ? 'mine' : 'partner'
    const badges = []
    let gameBadgeAdded = false
    for (const item of notifications) {
      if (item.side !== side && item.side !== 'both') continue
      if (item.type === 'game') {
        if (gameBadgeAdded) continue
        gameBadgeAdded = true
        badges.push({
          type: 'game',
          emoji: '🎮',
          label: 'A game is waiting for you — see notifications',
          onClick: () => navigate('/notifications'),
        })
        continue
      }
      badges.push({
        type: item.type,
        emoji: item.emoji,
        label: `${item.text} — tap to open`,
        onClick: item.action === 'loveNote' ? openLoveNote : () => navigate(item.to, item.state ? { state: item.state } : undefined),
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
            isMine={myNameFor(user) === 'Cristina'}
            onSetMood={setMyMood}
            onOpenSettings={() => navigate('/settings')}
            onLongPress={() => setPartnerMenuOpen(true)}
            badges={badgesFor(myNameFor(user) === 'Cristina')}
          />
          <span className="mt-6 font-display text-2xl text-gold sm:mt-8">&amp;</span>
          <Avatar
            src={avatarFor('Scott', chatSettings.avatars)}
            name={preferredNameFor('Scott', chatSettings.preferredNames)}
            ring="ring-teal"
            mood={moodFor('Scott', user, moods)}
            isMine={myNameFor(user) === 'Scott'}
            onSetMood={setMyMood}
            onOpenSettings={() => navigate('/settings')}
            onLongPress={() => setPartnerMenuOpen(true)}
            badges={badgesFor(myNameFor(user) === 'Scott')}
          />
        </div>

        <LocationClocks />
      </div>

      {partnerMenuOpen && (
        <PartnerActionMenu
          name={preferredNameFor(partnerNameFor(user), chatSettings.preferredNames)}
          onClose={() => setPartnerMenuOpen(false)}
          onNavigate={(path, state) => navigate(path, { state })}
        />
      )}

      {loveNoteOpen && incomingLoveNote && (
        <LoveNoteCard note={incomingLoveNote} replied={loveNoteReplied} onReply={replyToLoveNote} onClose={closeLoveNote} />
      )}

      <footer className="relative pb-6 text-center">
        <p className="font-hand text-lg text-ink-soft">
          Meu amor, meu caminho, meu lar
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

function Avatar({ src, name, ring, mood, isMine, onSetMood, onOpenSettings, onLongPress, badges }) {
  const pressTimer = useRef(null)

  function startPress() {
    if (isMine) return
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null
      onLongPress()
    }, LONG_PRESS_MS)
  }

  function cancelPress() {
    clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <img
          src={src}
          alt={name}
          onClick={isMine ? onOpenSettings : undefined}
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          onContextMenu={(event) => event.preventDefault()}
          draggable={false}
          style={{ WebkitTouchCallout: 'none' }}
          className={`h-16 w-16 select-none rounded-full object-cover ring-4 ring-offset-4 ring-offset-paper sm:h-20 sm:w-20 ${ring} ${
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
