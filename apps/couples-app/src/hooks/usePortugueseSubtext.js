import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  markPortugueseNoticeSeen,
  portugueseNoticeSeen,
  portugueseSubtextEnabled,
  setPortugueseSubtextEnabled,
} from '../lib/deviceSettings'

// The Brazilian-Portuguese subtext toggle shared by the games. It's only
// offered on Cristina's account, and the choice is remembered per device.
// `available` says whether to show the toggle at all; `on` is already false
// when it isn't available. `gameKey` keys the one-time "this exists" notice
// (see PortugueseNotice), which is shown once per game per device.
export function usePortugueseSubtext(gameKey) {
  const { user } = useAuth()
  const available = user?.displayName === 'Cristina'
  const [enabled, setEnabled] = useState(portugueseSubtextEnabled)
  const [noticeSeen, setNoticeSeen] = useState(() => portugueseNoticeSeen(gameKey))

  function set(next) {
    setEnabled(next)
    setPortugueseSubtextEnabled(next)
  }

  return {
    available,
    on: available && enabled,
    toggle: () => set(!enabled),
    showNotice: available && !noticeSeen,
    dismissNotice(turnOn) {
      markPortugueseNoticeSeen(gameKey)
      setNoticeSeen(true)
      if (turnOn) set(true)
    },
  }
}
