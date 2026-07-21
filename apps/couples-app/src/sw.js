import { clientsClaim } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'

self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)

const SHARE_TARGET_PATH = '/YouAreMyHome/share-target'
const SHARE_CACHE = 'share-target-v1'

// A static site has no server to receive the share_target POST, so the
// service worker intercepts it directly: stash any shared image in Cache
// Storage (simpler than IndexedDB for "hand a blob to the next page load"),
// pass title/text/url through as plain query params, then redirect into the
// SPA route that actually shows the confirm-and-send screen.
async function handleShareTarget(request) {
  const formData = await request.formData()
  const title = formData.get('title') || ''
  const text = formData.get('text') || ''
  const url = formData.get('url') || ''
  const image = formData.get('images')

  const params = new URLSearchParams()
  if (title) params.set('title', title)
  if (text) params.set('text', text)
  if (url) params.set('url', url)

  if (image && image.size > 0) {
    const cache = await caches.open(SHARE_CACHE)
    const key = `/share-target-image/${Date.now()}`
    await cache.put(key, new Response(image, { headers: { 'Content-Type': image.type } }))
    params.set('image', key)
  }

  return Response.redirect(`/YouAreMyHome/index.html#/share-target?${params.toString()}`, 303)
}

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)
  if (event.request.method === 'POST' && requestUrl.pathname === SHARE_TARGET_PATH) {
    event.respondWith(handleShareTarget(event.request))
  }
})

// FCM delivers data-only messages as a plain Push API event — no
// firebase-messaging-sw.js helper needed. Some browsers wrap the payload in
// a `data` object, others deliver it flat, so handle both.
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }
  const { title, body, url, badgeCount } = payload.data || payload
  if (!title) return

  const count = Number(badgeCount) || 0

  event.waitUntil(
    (async () => {
      // Skip the OS notification banner if the app is already open and
      // focused — the in-app UI (live Firestore listeners + its own sound
      // effects) already surfaces new activity, so a push on top would just
      // be a redundant/annoying duplicate. Falls back to showing it if the
      // browser doesn't report focus/visibility on WindowClient at all
      // (inconsistent support, notably on Safari) — a missed suppression is
      // a much smaller problem than a wrongly-suppressed real notification.
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const appInForeground = clientsList.some((client) => client.focused && client.visibilityState === 'visible')

      const tasks = []
      if (!appInForeground) {
        tasks.push(
          self.registration.showNotification(title, {
            body,
            icon: '/YouAreMyHome/icons/heart-notification-192.png',
            badge: '/YouAreMyHome/icons/heart-notification-192.png',
            data: { url },
          }),
        )
      }
      if ('setAppBadge' in navigator) {
        tasks.push(count > 0 ? navigator.setAppBadge(count).catch(() => {}) : navigator.clearAppBadge().catch(() => {}))
      }
      await Promise.all(tasks)
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetPath = event.notification.data?.url || '/YouAreMyHome/#/'
  const targetUrl = new URL(targetPath, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(targetUrl)
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
