// Refuses hostnames that point inside our own network: localhost, the cloud
// metadata server, private/link-local ranges. Used by linkPreview so it can't
// be turned into a probe of Google's internal network.
//
// Note: `new URL(...).hostname` already normalizes tricks like http://2130706433
// or http://0x7f.1 to a dotted-quad, so this only has to handle canonical forms.
// It does NOT defend against a public hostname whose DNS later resolves to a
// private address (DNS rebinding) — that would need resolving and pinning the IP.
function isBlockedHost(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  if (!host) return true

  if (
    host === 'localhost' ||
    host === 'metadata' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true
  }

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = v4.slice(1).map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, incl. the metadata server
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast / reserved
    )
  }

  if (host.includes(':')) {
    return (
      host === '::1' ||
      host === '::' ||
      /^f[cd]/.test(host) || // unique local
      /^fe[89ab]/.test(host) || // link-local
      host.startsWith('::ffff:') // IPv4-mapped
    )
  }

  return false
}

module.exports = { isBlockedHost }
