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
import DrawInvitePopup from '../DrawInvitePopup'
import ThumbkissOverlay from '../ThumbkissOverlay'
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
  { key: 'thumbkiss', action: 'thumbkiss', label: 'Kiss', icon: 'thumbkiss' },
  { key: 'journal', to: '/journal', label: 'Journal', icon: 'journal', badgeKey: 'journal' },
]

const GREETED_KEY = 'you-are-my-home:greeted'

export default function Shell() {
  const { user, logout } = useAuth()
  const [greeting, setGreeting] = useState(null)
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
      <DrawInvitePopup />
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

        <button
          type="button"
          onClick={logout}
          className="shrink-0 font-body text-sm text-ink-soft transition-colors hover:text-rose"
        >
          Sign out
        </button>
      </header>

      <main className="flex flex-1 flex-col overflow-hidden pb-16 sm:pb-0">
        <Outlet />
      </main>

      <SwipeableNav
        items={NAV_ITEMS}
        unread={unread}
        thumbkissHandlers={{
          onPointerDown: thumbkiss.startPress,
          onPointerUp: thumbkiss.endPress,
          onPointerLeave: thumbkiss.endPress,
          onPointerCancel: thumbkiss.endPress,
        }}
      />
    </div>
  )
}
