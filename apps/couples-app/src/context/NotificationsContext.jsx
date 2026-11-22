import { createContext, useContext } from 'react'
import { useAuth } from './AuthContext'
import { useGameAttention } from './GameAttentionContext'
import { useMusicPlayer } from './MusicPlayerContext'
import { useAwaitingQa } from '../hooks/useAwaitingQa'
import { useCheckIn } from '../hooks/useCheckIn'
import { useChatSettings } from '../hooks/useChatSettings'
import { useUnreadBadges } from '../hooks/useUnreadBadges'
import { useUpcomingCalendarItems } from '../hooks/useUpcomingCalendarItems'
import { GAME_LABEL } from '../lib/gameInfo'
import { preferredNameFor } from '../lib/avatars'
import { CALENDAR_TAB_FOR_CATEGORY } from '../lib/milestones'

// Everything that shows up as an icon on the Home avatars, as one list of
// plain-text notifications — the source for both the avatar badges (Home) and
// the Notifications page (the bell in the header). Deliberately NOT the
// journal timeline: only things that currently have an avatar icon are here,
// and they disappear when the icon does.
//
// Each item: { id, type (the avatar slot, see AvatarBadge BADGE_ANGLE), side
// ('partner' | 'mine' | 'both': which avatar it sits on), emoji, title, text
// (worded like the push notification), to / state (where "Open" goes),
// action? }. Mounted once in Shell so it holds a single set of listeners.
const NotificationsContext = createContext({ items: [], unread: {}, detail: {}, musicUnjoined: false })

const TURN_TEXT = {
  farkle: (name) => `${name} played — your turn to roll!`,
  uno: (name) => `${name} played — your turn to play!`,
  story: (name) => `${name} left you a blank to fill in`,
  song: (name) => `${name} added a line — your turn to add the next one`,
  madlibs: (name) => `${name} filled in a Mad Libs — your turn!`,
  cac: (name) => `${name} played a card — your turn to pick one!`,
}

export function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const { unread, detail } = useUnreadBadges()
  const { byGame, invite } = useGameAttention()
  const { currentTrack, isHost, sessionActive, hasJoined } = useMusicPlayer()
  const [chatSettings] = useChatSettings()
  const awaitingQa = useAwaitingQa()
  const { myCheckIn, partnerCheckIn } = useCheckIn()
  const calendarCategory = useUpcomingCalendarItems()

  const partnerName = preferredNameFor(user?.displayName === 'Scott' ? 'Cristina' : 'Scott', chatSettings.preferredNames)
  const items = []

  if (unread.chat) {
    items.push({ id: 'chat', type: 'chat', side: 'partner', emoji: '💬', title: 'New message', text: `${partnerName} sent a message`, to: '/chat' })
  }
  if (unread.mail) {
    const isCard = !!detail.mail
    items.push({
      id: 'mail',
      type: 'mail',
      side: 'partner',
      emoji: isCard ? '💐' : '💌',
      title: isCard ? 'A gift is waiting!' : 'New love letter',
      text: isCard ? `${partnerName} sent you a card` : 'You have a new letter waiting',
      to: '/mail',
    })
  }
  if (unread.loveNotes) {
    items.push({
      id: 'loveNote',
      type: 'sendLove',
      side: 'partner',
      emoji: detail.loveNotes || '💕',
      title: 'Sending love',
      text: `${partnerName} sent you love`,
      to: '/',
      state: { openLoveNote: true },
      action: 'loveNote',
    })
  }
  if (invite) {
    const label = invite.gameLabel || GAME_LABEL[invite.game] || 'a game'
    items.push({
      id: `invite:${invite.id}`,
      type: 'game',
      side: 'partner',
      emoji: '🎮',
      title: `${label} together?`,
      text: `${partnerName} wants to play ${label} with you!`,
      to: '/games',
      state: { view: invite.game },
    })
  }
  for (const [game, kind] of Object.entries(byGame)) {
    if (kind !== 'turn') continue // an invite for the same game already has its own entry
    items.push({
      id: `turn:${game}`,
      type: 'game',
      side: 'partner',
      emoji: '🎮',
      title: GAME_LABEL[game] || 'Your turn',
      text: (TURN_TEXT[game] || ((name) => `${name} is waiting for your turn`))(partnerName),
      to: '/games',
      state: { view: game },
    })
  }
  if (awaitingQa) {
    items.push({
      id: 'qa',
      type: 'qa',
      side: 'mine',
      emoji: '❓',
      title: 'Q&A',
      text: `${partnerName} answered a question — it's waiting for your answer`,
      to: '/qa',
      state: { category: 'awaiting' },
    })
  }
  if (partnerCheckIn && !myCheckIn) {
    items.push({
      id: 'checkin',
      type: 'journal',
      side: 'mine',
      emoji: '📝',
      title: 'Daily check-in',
      text: `${partnerName} checked in — check in too`,
      to: '/journal',
      state: { tab: 'status' },
    })
  }
  if (currentTrack) {
    items.push({
      id: 'music',
      type: 'music',
      side: isHost ? 'mine' : 'partner',
      emoji: '🎵',
      title: 'Music',
      text: isHost ? 'You are hosting a live music session' : `${partnerName} is hosting a live music session`,
      to: '/music',
    })
  }
  if (calendarCategory) {
    items.push({
      id: 'calendar',
      type: 'calendar',
      side: 'both',
      emoji: '📅',
      title: 'Coming up soon',
      text: 'Something is coming up soon on your calendar',
      to: '/calendar',
      state: { tab: CALENDAR_TAB_FOR_CATEGORY[calendarCategory] },
    })
  }

  // `unread` is handed on too, so Shell doesn't open a second set of badge listeners
  const value = { items, unread, detail, musicUnjoined: sessionActive && !hasJoined }
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications() {
  return useContext(NotificationsContext)
}
