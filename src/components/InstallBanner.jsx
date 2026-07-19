import { useState } from 'react'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

const DISMISS_KEY = 'you-are-my-home:install-dismissed'

function isIOS() {
  const ua = navigator.userAgent
  const iOSDevice = /iPad|iPhone|iPod/.test(ua)
  // iPadOS 13+ reports as "MacIntel" in the UA string unless spoofed; touch
  // support is what actually distinguishes it from a real Mac.
  const iPadOS13Up = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return iOSDevice || iPadOS13Up
}

export default function InstallBanner() {
  const { canInstall, promptInstall, isStandalone } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  function dismiss() {
    setDismissed(true)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  if (isStandalone || dismissed) return null
  const ios = isIOS()
  if (!canInstall && !ios) return null

  return (
    <div className="relative mx-auto mb-2 flex w-full max-w-md items-center gap-3 rounded-2xl border border-rose/30 bg-blush-soft/50 px-4 py-3 text-left">
      <p className="flex-1 font-body text-sm text-ink">
        {ios ? (
          <>Add this to your home screen: tap the Share icon, then "Add to Home Screen."</>
        ) : (
          <>Install this on your home screen for the full app experience — no browser bar, just us.</>
        )}
      </p>
      {!ios && (
        <button
          type="button"
          onClick={promptInstall}
          className="shrink-0 rounded-full bg-rose px-4 py-1.5 font-body text-sm font-medium text-paper"
        >
          Install
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 font-body text-lg text-ink-soft transition-colors hover:text-rose"
      >
        ×
      </button>
    </div>
  )
}
