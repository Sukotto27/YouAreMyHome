import { Link } from 'react-router-dom'
import RelationshipCounter from '../components/counter/RelationshipCounter'
import Wordmark from '../components/layout/Wordmark'
import heartLeft from '../assets/images/heart-left.png'
import heartRight from '../assets/images/heart-right.png'
import cristina from '../assets/images/cristina.jpg'
import scott from '../assets/images/scott.jpg'

export default function Landing() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-paper text-ink">
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

      <div className="relative mx-auto flex min-h-svh max-w-3xl flex-col px-6">
        <header className="flex items-center gap-2 pt-8">
          <span className="relative inline-block h-5 w-5">
            <img src={heartLeft} alt="" className="absolute inset-0 h-full w-full object-contain" />
            <img src={heartRight} alt="" className="absolute inset-0 h-full w-full object-contain" />
          </span>
          <Wordmark animated />
        </header>

        <main className="flex flex-1 flex-col items-center justify-center gap-10 py-16 text-center">
          <div className="relative h-28 w-32 sm:h-36 sm:w-40" aria-hidden="true">
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

          <div className="space-y-4">
            <h1 className="font-display text-5xl italic tracking-tight text-ink sm:text-6xl">
              You Are My Home
            </h1>
            <p className="font-hand text-2xl text-rose sm:text-3xl">
              a little corner of the internet, just for the two of us
            </p>
          </div>

          <RelationshipCounter />

          <div className="flex items-center gap-6 sm:gap-10">
            <Avatar src={cristina} name="Cristina" ring="ring-blush" />
            <span className="font-display text-2xl text-gold">&amp;</span>
            <Avatar src={scott} name="Scott" ring="ring-teal" />
          </div>

          <Link
            to="/login"
            className="group relative rounded-full bg-rose px-8 py-3 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-8px_rgba(226,125,122,0.8)] active:translate-y-0"
          >
            Come on in
          </Link>
        </main>

        <footer className="pb-8 text-center">
          <p className="font-hand text-lg text-ink-soft">
            — always us, always ours · sempre nós, sempre nosso —
          </p>
        </footer>
      </div>
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
