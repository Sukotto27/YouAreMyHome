import { useState } from 'react'
import { useKeyLockState } from '../hooks/useEncryptionKey'
import {
  AUTO_LOCK_OPTIONS,
  MIN_PIN_LENGTH,
  changeAppLockPin,
  disableAppLock,
  enableAppLock,
  getAutoLockMinutes,
  lockNow,
  setAutoLockMinutes,
} from '../lib/keyStore'

const inputClass =
  'w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-2 font-body text-sm text-ink outline-none focus:border-rose'
const primaryButton =
  'rounded-full bg-rose px-4 py-1.5 font-body text-sm font-medium text-paper disabled:opacity-50'
const ghostButton =
  'rounded-full border border-ink/15 px-4 py-1.5 font-body text-sm font-medium text-ink transition-colors hover:border-rose disabled:opacity-50'

function friendlyError(error) {
  if (error?.message === 'wrong-pin') return 'That’s not the right PIN.'
  return error?.message || 'That didn’t work — try again.'
}

// Settings → Security → App lock. Everything here needs the app unlocked
// (it's only reachable from Settings), and the PIN never leaves this device.
export default function AppLockPanel() {
  const { lockEnabled } = useKeyLockState()
  const [mode, setMode] = useState(null) // null | 'enable' | 'change' | 'disable'
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [oldPin, setOldPin] = useState('')
  const [minutes, setMinutes] = useState(getAutoLockMinutes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function reset() {
    setMode(null)
    setPin('')
    setPin2('')
    setOldPin('')
    setError('')
  }

  async function run(action, doneNotice) {
    setBusy(true)
    setError('')
    try {
      await action()
      reset()
      setNotice(doneNotice)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    if (mode === 'enable' || mode === 'change') {
      if (pin !== pin2) {
        setError('Those two don’t match.')
        return
      }
    }
    if (mode === 'enable') run(() => enableAppLock(pin, minutes), 'App lock is on.')
    else if (mode === 'change') run(() => changeAppLockPin(oldPin, pin), 'PIN changed.')
    else if (mode === 'disable') run(() => disableAppLock(oldPin), 'App lock is off.')
  }

  function changeMinutes(event) {
    const value = Number(event.target.value)
    setMinutes(value)
    setAutoLockMinutes(value)
  }

  const autoLockSelect = (
    <label className="flex items-center gap-2 font-body text-sm text-ink">
      Lock after
      <select value={minutes} onChange={changeMinutes} className="rounded-lg border border-ink/15 bg-white/70 px-2 py-1 text-sm">
        {AUTO_LOCK_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m} min
          </option>
        ))}
      </select>
      away or idle
    </label>
  )

  return (
    <div className="space-y-3 border-t border-ink/10 pt-4">
      <p className="font-body text-xs font-medium text-ink-soft">App lock</p>
      <p className="font-body text-xs text-ink-soft">
        Asks for a PIN when you open the app and after it’s been away or idle. Your encryption key is then kept scrambled
        under that PIN, so a borrowed or stolen phone can’t read chats or photos without it. The longer the PIN, the
        harder it is to guess.
      </p>

      {mode === null && !lockEnabled && (
        <button type="button" onClick={() => { setNotice(''); setMode('enable') }} className={ghostButton}>
          Turn on app lock
        </button>
      )}

      {mode === null && lockEnabled && (
        <div className="space-y-3">
          <p className="font-body text-sm text-ink">✅ App lock is on.</p>
          {autoLockSelect}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={lockNow} className={ghostButton}>
              Lock now
            </button>
            <button type="button" onClick={() => { setNotice(''); setMode('change') }} className={ghostButton}>
              Change PIN
            </button>
            <button type="button" onClick={() => { setNotice(''); setMode('disable') }} className={ghostButton}>
              Turn off
            </button>
          </div>
        </div>
      )}

      {mode !== null && (
        <form onSubmit={submit} className="space-y-2">
          {(mode === 'change' || mode === 'disable') && (
            <input
              type="password"
              autoComplete="off"
              value={oldPin}
              onChange={(event) => setOldPin(event.target.value)}
              placeholder={mode === 'change' ? 'Current PIN' : 'Enter your PIN to turn it off'}
              className={inputClass}
            />
          )}
          {(mode === 'enable' || mode === 'change') && (
            <>
              <input
                type="password"
                autoComplete="new-password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder={`${mode === 'change' ? 'New PIN' : 'Choose a PIN'} or passphrase (${MIN_PIN_LENGTH}+ characters)`}
                className={inputClass}
              />
              <input
                type="password"
                autoComplete="new-password"
                value={pin2}
                onChange={(event) => setPin2(event.target.value)}
                placeholder="Type it again"
                className={inputClass}
              />
            </>
          )}
          {mode === 'enable' && autoLockSelect}
          {error && <p className="font-body text-xs text-rose">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={primaryButton}>
              {busy ? 'Working…' : mode === 'enable' ? 'Turn on' : mode === 'change' ? 'Change PIN' : 'Turn off'}
            </button>
            <button type="button" onClick={reset} disabled={busy} className={ghostButton}>
              Cancel
            </button>
          </div>
          {mode === 'enable' && (
            <p className="font-body text-xs text-ink-soft">
              If you forget it, you’d remove the lock on this device and enter the encryption key again from your
              partner’s device — so make sure their device still has it. If this device is the only one holding the key,
              a forgotten PIN means the key is gone for good.
            </p>
          )}
        </form>
      )}

      {notice && mode === null && <p className="font-body text-xs text-teal">{notice}</p>}
    </div>
  )
}
