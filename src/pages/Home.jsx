import RelationshipCounter from '../components/counter/RelationshipCounter'
import InstallBanner from '../components/InstallBanner'
import NotificationBanner from '../components/NotificationBanner'
import LocationClocks from '../components/LocationClocks'
import heartLeft from '../assets/images/heart-left.png'
import heartRight from '../assets/images/heart-right.png'
import cristina from '../assets/images/cristina.jpg'
import scott from '../assets/images/scott.jpg'

export default function Home() {
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

        <div className="flex items-center gap-6 sm:gap-10">
          <Avatar src={cristina} name="Cristina" ring="ring-blush" />
          <span className="font-display text-2xl text-gold">&amp;</span>
          <Avatar src={scott} name="Scott" ring="ring-teal" />
        </div>

        <LocationClocks />
      </div>

      <footer className="relative pb-6 text-center">
        <p className="font-hand text-lg text-ink-soft">
          — always us, always ours · sempre nós, sempre nosso —
        </p>
      </footer>
    </div>
  )
}

function Avatar({ src, name, ring }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src={src}
        alt={name}
        className={`h-16 w-16 rounded-full object-cover ring-4 ring-offset-4 ring-offset-paper sm:h-20 sm:w-20 ${ring}`}
      />
      <span className="font-body text-sm text-ink-soft">{name}</span>
    </div>
  )
}
