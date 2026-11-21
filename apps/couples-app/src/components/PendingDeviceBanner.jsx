import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useDevices } from '../hooks/useDevices'
import { usePartnerUid } from '../hooks/usePartnerUid'

// A persistent nudge, on top of the push notification, while any new device is
// waiting for one of you to approve it. Disappears the moment it's dealt with.
export default function PendingDeviceBanner() {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const mine = useDevices(user?.uid)
  const theirs = useDevices(partnerUid)

  const pending = [...mine, ...theirs].filter((d) => d.status === 'pending')
  if (pending.length === 0) return null

  return (
    <Link
      to="/settings"
      className="block bg-rose/15 px-4 py-2 text-center font-body text-xs font-medium text-ink transition-colors hover:bg-rose/25"
    >
      🔔 A new device is asking to join{pending.length > 1 ? ` (${pending.length})` : ''} — tap to review
    </Link>
  )
}
