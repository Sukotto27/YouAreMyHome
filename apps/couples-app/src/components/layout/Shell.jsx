import { useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { firebaseReady } from '../../firebase'
import { nicknameFor } from '../../lib/nicknames'
import { seedHistoryMilestones, seedBirthdays } from '../../lib/migrations'
import { useUnreadBadges } from '../../hooks/useUnreadBadges'
import { useNotificationSounds } from '../../hooks/useNotificationSounds'
import { useThumbkiss } from '../../hooks/useThumbkiss'
import { useThumbkissGesture } from '../../hooks/useThumbkissGesture'
import CompactCounter from '../counter/CompactCounter'
import NamePrompt from '../NamePrompt'
import CheckInReminder from '../CheckInReminder'
import GameInvitePopup from '../GameInvitePopup'
import ThumbkissOverlay from '../ThumbkissOverlay'
import SendLoveMenu from '../SendLoveMenu'
import IncomingLoveNotePopup from '../IncomingLoveNotePopup'
import SwipeableNav from './SwipeableNav'
import Wordmark from './Wordmark'
import heartLeft from '../../assets/images/heart-left.png'
import heartRight from '../../assets/images/heart-right.png'

const NAV_ITEMS = [
  { key: 'home', to: '/', label: 'Home', icon: 'home' },
  { key: 'chat', to: '/chat', label: 'Chat', icon: 'chat', badgeKey: 'chat' },
  { key: 'qa', to: '/qa', label: 'Q&A', icon: 'qa', badgeKey: 'qa' },
  { key: 'games', to: '/games', label: 'Games', icon: 'games', badgeKey: 'scrapbook' },
  { key: 'music', to: '/music', label: 'Music', icon: 'music' },
  { key: 'gallery', to: '/gallery', label: 'Gallery', icon: 'gallery', badgeKey: 'gallery' },
  { key: 'mail', to: '/mail', label: 'Mail', icon: 'mail', badgeKey: 'mail' },
  { key: 'calendar', to: '/calendar', label: 'Calendar', icon: 'calendar', badgeKey: 'milestones' },
  { key: 'thumbkiss', action: 'sendLove', label: 'Send Love', icon: 'thumbkiss' },
  { key: 'journal', to: '/journal', label: 'Journal', icon: 'journal', badgeKey: 'journal' },
]

const GREETED_KEY = 'you-are-my-home:greeted'

export default function Shell() {
  const { user } = useAuth()
  const [greeting, setGreeting] = useState(null)
  const [sendLoveOpen, setSendLoveOpen] = useState(false)
  const unread = useUnreadBadges()
  useNotificationSounds(unread)
  const thumbkiss = useThumbkiss()
  useThumbkissGesture(thumbkiss.startPress, thumbkiss.endPress)

  // App Badging API: shows a count on the home-screen icon once installed.
  // Chromium (Android/desktop) only — Safari/iOS has no equivalent API.
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    const count = Object.values(unread).filter(Boolean).length
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {})
    } else {
      navigator.clearAppBadge().catch(() => {})
    }
  }, [unread])

  useEffect(() => {
    if (firebaseReady) {
      seedHistoryMilestones()
      seedBirthdays()
    }
  }, [])

  useEffect(() => {
    if (sessionStorage.getItem(GREETED_KEY)) return
    const nickname = nicknameFor(user)
    if (!nickname) return
    sessionStorage.setItem(GREETED_KEY, '1')
    setGreeting(nickname)
    const timer = setTimeout(() => setGreeting(null), 4000)
    return () => clearTimeout(timer)
  }, [user])

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-paper text-ink">
      <NamePrompt />
      <CheckInReminder />
      <GameInvitePopup />
      <IncomingLoveNotePopup />
      <SendLoveMenu
        open={sendLoveOpen}
        onClose={() => setSendLoveOpen(false)}
        thumbkiss={{ startPress: thumbkiss.startPress, endPress: thumbkiss.endPress }}
      />
      <ThumbkissOverlay
        myPressing={thumbkiss.myPressing}
        partnerPressing={thumbkiss.partnerPressing}
        both={thumbkiss.both}
      />
      {!firebaseReady && (
        <div className="bg-gold/15 px-4 py-1.5 text-center font-body text-xs text-ink-soft">
          Previewing without Firebase connected — nothing here is saved or synced yet.
        </div>
      )}
      {greeting && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-20 flex justify-center px-4">
          <div className="animate-reveal-in rounded-full border border-rose/30 bg-paper px-5 py-2 shadow-lg">
            <p className="font-hand text-lg text-rose">welcome back, {greeting}</p>
          </div>
        </div>
      )}
      <header className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-2 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-70">
          <span className="relative inline-block h-5 w-5 shrink-0">
            <img src={heartLeft} alt="" className="absolute inset-0 h-full w-full object-contain" />
            <img src={heartRight} alt="" className="absolute inset-0 h-full w-full object-contain" />
          </span>
          <span className="hidden sm:inline">
            <Wordmark />
          </span>
        </Link>

        <CompactCounter />

        <Link
          to="/settings"
          aria-label="Settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-rose"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </header>

      <main className="flex flex-1 flex-col overflow-hidden pb-16 sm:pb-0">
        <Outlet />
      </main>

      <SwipeableNav items={NAV_ITEMS} unread={unread} onOpenSendLove={() => setSendLoveOpen(true)} />
    </div>
  )
}
