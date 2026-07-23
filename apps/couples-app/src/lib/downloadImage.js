// Triggers a real browser download of an already-decrypted data URL — used
// for the "auto-download for them" option on sent images. Data URLs (as
// opposed to Blob URLs) can be downloaded directly via a synthetic anchor
// click, no extra conversion needed.
export function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  link.click()
}
