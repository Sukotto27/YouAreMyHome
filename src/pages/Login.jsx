import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { firebaseReady } from '../firebase'
import heartLeft from '../assets/images/heart-left.png'
import heartRight from '../assets/images/heart-right.png'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    const redirectTo = location.state?.from ?? '/chat'
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/chat', { replace: true })
    } catch {
      setError("That didn't work — check your email and password and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-paper px-6 text-ink">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-multiply"
        style={{
          backgroundImage:
            'radial-gradient(rgba(54,37,33,0.09) 0.6px, transparent 0.6px)',
          backgroundSize: '3px 3px',
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="relative inline-block h-10 w-11">
            <img src={heartLeft} alt="" className="absolute inset-0 h-full w-full object-contain" />
            <img src={heartRight} alt="" className="absolute inset-0 h-full w-full object-contain" />
          </span>
          <h1 className="font-display text-3xl italic text-ink">Welcome back</h1>
          <p className="font-hand text-xl text-ink-soft">glad you're here</p>
        </div>

        {!firebaseReady && (
          <p className="mb-4 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink-soft">
            Firebase isn't configured yet, so sign-in won't work until that's set up.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="font-body text-sm text-ink-soft">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-ink/15 bg-white/60 px-4 py-2.5 font-body text-ink outline-none transition-colors focus:border-rose"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="font-body text-sm text-ink-soft">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-ink/15 bg-white/60 px-4 py-2.5 font-body text-ink outline-none transition-colors focus:border-rose"
            />
          </div>

          {error && <p className="text-sm text-rose">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !firebaseReady}
            className="w-full rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {submitting ? 'Signing in…' : 'Come on in'}
          </button>
        </form>
      </div>
    </div>
  )
}
