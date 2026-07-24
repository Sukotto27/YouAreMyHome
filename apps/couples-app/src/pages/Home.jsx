import { useNavigate } from 'react-router-dom'
import RelationshipCounter from '../components/counter/RelationshipCounter'
import InstallBanner from '../components/InstallBanner'
import NotificationBanner from '../components/NotificationBanner'
import LocationClocks from '../components/LocationClocks'
import MoodBubble from '../components/MoodBubble'
import { useAuth } from '../context/AuthContext'
import { useMoods } from '../hooks/useMoods'
import { useChatSettings } from '../hooks/useChatSettings'
import { useUnreadBadges } from '../hooks/useUnreadBadges'
import { avatarFor, preferredNameFor } from '../lib/avatars'
import { APP_VERSION_LABEL } from '../lib/appVersion'
import heartLeft from '../assets/images/heart-left.png'
import heartRight from '../assets/images/heart-right.png'

export default function Home() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { moods, setMyMood } = useMoods()
  const [chatSettings] = useChatSettings()
  const unread = useUnreadBadges()

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

        <div className="flex items-start gap-6 sm:gap-10">
          <Avatar
            src={avatarFor('Cristina', chatSettings.avatars)}
            name={preferredNameFor('Cristina', chatSettings.preferredNames)}
            ring="ring-blush"
            mood={moodFor('Cristina', user, moods)}
            isMine={user.displayName === 'Cristina'}
            onSetMood={setMyMood}
            onOpenSettings={() => navigate('/settings')}
            showUnreadChat={user.displayName !== 'Cristina' && unread.chat}
            onOpenChat={() => navigate('/chat')}
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
            showUnreadChat={user.displayName !== 'Scott' && unread.chat}
            onOpenChat={() => navigate('/chat')}
          />
        </div>

        <LocationClocks />
      </div>

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

function Avatar({ src, name, ring, mood, isMine, onSetMood, onOpenSettings, showUnreadChat, onOpenChat }) {
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
        {showUnreadChat && (
          <button
            type="button"
            onClick={onOpenChat}
            aria-label={`Unread messages from ${name} — open chat`}
            className="absolute -right-1 -top-1 flex h-6 w-6 animate-bounce items-center justify-center rounded-full bg-rose text-xs shadow-md ring-2 ring-paper transition-transform hover:scale-110"
          >
            💬
          </button>
        )}
      </div>
      <span className="font-body text-sm text-ink-soft">{name}</span>
      <MoodBubble mood={mood} isMine={isMine} onSetMood={onSetMood} />
    </div>
  )
}
