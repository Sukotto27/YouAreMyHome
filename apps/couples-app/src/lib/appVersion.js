// Set at build time in vite.config.js — version from package.json, commit +
// timestamp from whatever was actually checked out when this bundle was
// built. Not something to read/write at runtime, just a freshness check.
const version = import.meta.env.VITE_APP_VERSION || '0.0.0'
const commit = import.meta.env.VITE_BUILD_COMMIT || 'dev'
const builtAt = import.meta.env.VITE_BUILD_TIME

const builtAtLabel = builtAt
  ? new Date(builtAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  : null

export const APP_VERSION_LABEL = builtAtLabel
  ? `v${version} · ${commit} · built ${builtAtLabel}`
  : `v${version} · ${commit}`
