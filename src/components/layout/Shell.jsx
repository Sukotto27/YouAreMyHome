import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { firebaseReady } from '../../firebase'
import { nicknameFor } from '../../lib/nicknames'
import { useUnreadBadges } from '../../hooks/useUnreadBadges'
import CompactCounter from '../counter/CompactCounter'
import NavIcon from './NavIcon'
import Wordmark from './Wordmark'
import heartLeft from '../../assets/images/heart-left.png'
import heartRight from '../../assets/images/heart-right.png'

const NAV_ITEMS = [
  { to: '/chat', label: 'Chat', icon: 'chat', badgeKey: 'chat' },
  { to: '/qa', label: 'Q&A', icon: 'qa', badgeKey: 'qa' },
  { to: '/draw', label: 'Draw', icon: 'draw' },
  { to: '/scrapbook', label: 'Scrapbook', icon: 'scrapbook', badgeKey: 'scrapbook' },
  { to: '/gallery', label: 'Gallery', icon: 'gallery', badgeKey: 'gallery' },
  { to: '/mail', label: 'Mail', icon: 'mail', badgeKey: 'mail' },
  { to: '/milestones', label: 'Milestones', icon: 'calendar', badgeKey: 'milestones' },
]

const GREETED_KEY = 'you-are-my-home:greeted'

export default function Shell() {
  const { user, logout } = useAuth()
  const [greeting, setGreeting] = useState(null)
  const unread = useUnreadBadges()

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
    <div className="flex min-h-svh flex-col bg-paper text-ink">
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

      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-center border-t border-ink/10 bg-paper/95 backdrop-blur sm:static sm:border-t-0 sm:bg-transparent sm:py-2">
        <div className="flex w-full max-w-2xl overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 px-2 py-2 font-body text-[11px] transition-colors ${
                  isActive ? 'text-rose' : 'text-ink-soft hover:text-ink'
                }`
              }
            >
              <span className="relative inline-flex">
                <NavIcon name={item.icon} className="h-5 w-5" />
                {item.badgeKey && unread[item.badgeKey] && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-rose" />
                )}
              </span>
              <span className="whitespace-nowrap">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
