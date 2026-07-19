import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { firebaseReady } from '../firebase'
import heartLeft from '../assets/images/heart-left.png'
import heartRight from '../assets/images/heart-right.png'

function errorMessageFor(code) {
  switch (code) {
    case 'auth/too-many-requests':
      return "Too many attempts in a row — Firebase has temporarily paused sign-ins for this account. Wait a few minutes, or reset your password below."
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return "That password doesn't match what's on file. Try again, or reset it below."
    case 'auth/user-not-found':
      return "There's no account with that email."
    case 'auth/user-disabled':
      return 'This account has been disabled.'
    case 'auth/invalid-email':
      return "That doesn't look like a valid email address."
    default:
      return "That didn't work — check your email and password and try again."
  }
}

// Shown alongside the friendly message so issues can be diagnosed remotely
// without guessing — this is a 2-person app, not a public product, so a raw
// error code on screen is more useful than it is embarrassing.
function DebugCode({ code }) {
  if (!code) return null
  return <p className="font-body text-xs text-ink-soft/60">({code})</p>
}

export default function Login() {
  const { user, login, resetPassword } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetStatus, setResetStatus] = useState('')

  if (user) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setErrorCode('')
    setResetStatus('')
    setSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const emailValue = String(formData.get('email') || '').trim()
    const passwordValue = String(formData.get('password') || '')

    try {
      await login(emailValue, passwordValue)
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessageFor(err.code))
      setErrorCode(err.code || err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleForgotPassword(event) {
    setError('')
    setErrorCode('')
    setResetStatus('')
    const form = event.currentTarget.closest('form')
    const emailValue = String(new FormData(form).get('email') || '').trim()
    if (!emailValue) {
      setError('Enter your email above first, then tap "Forgot password?" again.')
      return
    }
    try {
      await resetPassword(emailValue)
      setResetStatus(`Check ${emailValue} for a reset link.`)
    } catch (err) {
      setError(errorMessageFor(err.code))
      setErrorCode(err.code || err.message)
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
              name="email"
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
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-ink/15 bg-white/60 px-4 py-2.5 font-body text-ink outline-none transition-colors focus:border-rose"
            />
          </div>

          {error && (
            <div>
              <p className="text-sm text-rose">{error}</p>
              <DebugCode code={errorCode} />
            </div>
          )}
          {resetStatus && <p className="text-sm text-teal">{resetStatus}</p>}

          <button
            type="submit"
            disabled={submitting || !firebaseReady}
            className="w-full rounded-full bg-rose px-6 py-2.5 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {submitting ? 'Signing in…' : 'Come on in'}
          </button>

          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={!firebaseReady}
            className="w-full font-body text-sm text-ink-soft transition-colors hover:text-rose disabled:cursor-not-allowed disabled:opacity-60"
          >
            Forgot password?
          </button>
        </form>
      </div>
    </div>
  )
}
