import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useDevices } from '../hooks/useDevices'
import { usePartnerUid } from '../hooks/usePartnerUid'
import { callReviewDevice } from '../lib/deviceApi'
import { getDeviceIdentity } from '../lib/deviceIdentity'
import { partnerNameFor } from '../lib/names'

function when(ts) {
  const ms = ts?.toMillis?.()
  if (!ms) return '—'
  return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function DeviceRow({ device, ownerUid, isThisDevice, onReview, busy }) {
  const pending = device.status === 'pending'
  return (
    <li className={`rounded-xl border px-3 py-2.5 ${pending ? 'border-rose/50 bg-rose/5' : 'border-ink/10 bg-white/50'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-body text-sm font-medium text-ink">
            {device.label || 'Unknown device'}
            {isThisDevice && <span className="ml-2 rounded-full bg-teal/15 px-2 py-0.5 text-[11px] text-ink-soft">this device</span>}
            {pending && <span className="ml-2 rounded-full bg-rose/15 px-2 py-0.5 text-[11px] text-rose">waiting</span>}
          </p>
          <p className="mt-0.5 font-body text-xs text-ink-soft">
            {device.lastIp || device.firstIp || 'IP unknown'} · first seen {when(device.firstSeenAt)} · last seen {when(device.lastSeenAt)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {pending && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onReview(ownerUid, device.id, 'approve')}
                className="rounded-full bg-rose px-3 py-1 font-body text-xs font-medium text-paper disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onReview(ownerUid, device.id, 'deny')}
                className="rounded-full border border-ink/15 px-3 py-1 font-body text-xs text-ink-soft hover:border-rose disabled:opacity-50"
              >
                Deny
              </button>
            </>
          )}
          {device.status === 'approved' && !isThisDevice && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Remove "${device.label || 'this device'}"? It will be locked out straight away.`)) {
                  onReview(ownerUid, device.id, 'revoke')
                }
              }}
              className="rounded-full border border-ink/15 px-3 py-1 font-body text-xs text-ink-soft hover:border-rose hover:text-rose disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

function DeviceList({ title, ownerUid, devices, thisDeviceId, onReview, busy }) {
  // Denied / removed devices stay on record server-side; they just aren't worth showing.
  const visible = devices.filter((d) => d.status === 'approved' || d.status === 'pending')
  const hidden = devices.length - visible.length
  return (
    <div>
      <p className="mb-1.5 font-body text-xs font-medium text-ink-soft">{title}</p>
      {visible.length === 0 ? (
        <p className="font-body text-xs text-ink-soft">No devices yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((device) => (
            <DeviceRow
              key={device.id}
              device={device}
              ownerUid={ownerUid}
              isThisDevice={ownerUid === thisDeviceId.uid && device.id === thisDeviceId.deviceId}
              onReview={onReview}
              busy={busy}
            />
          ))}
        </ul>
      )}
      {hidden > 0 && <p className="mt-1 font-body text-[11px] text-ink-soft/60">{hidden} removed or denied device{hidden === 1 ? '' : 's'} not shown.</p>}
    </div>
  )
}

// Settings → Devices. Both accounts are listed so either of you can approve a
// new device for either of you (the server also requires the one approving to
// be on an already-approved device).
export default function DevicesPanel() {
  const { user } = useAuth()
  const partnerUid = usePartnerUid()
  const myDevices = useDevices(user.uid)
  const partnerDevices = useDevices(partnerUid)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const partnerName = partnerNameFor(user)
  const thisDevice = { uid: user.uid, deviceId: getDeviceIdentity().deviceId }

  async function review(targetUid, deviceId, action) {
    setBusy(true)
    setError('')
    try {
      await callReviewDevice({ targetUid, deviceId, action })
    } catch (err) {
      setError(err?.message || 'That didn’t work — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="font-body text-xs text-ink-soft">
        Only devices on this list can open the app. A new device has to be approved by one of you first, and you’ll both get a notification when one asks.
      </p>
      <DeviceList title="Your devices" ownerUid={user.uid} devices={myDevices} thisDeviceId={thisDevice} onReview={review} busy={busy} />
      {partnerUid && (
        <DeviceList
          title={`${partnerName}’s devices`}
          ownerUid={partnerUid}
          devices={partnerDevices}
          thisDeviceId={thisDevice}
          onReview={review}
          busy={busy}
        />
      )}
      {error && <p className="font-body text-xs text-rose">{error}</p>}
    </div>
  )
}
