import { clientsClaim } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'

self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)

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
  const tasks = [
    self.registration.showNotification(title, {
      body,
      icon: '/YouAreMyHome/icons/icon-192.png',
      badge: '/YouAreMyHome/icons/icon-192.png',
      data: { url },
    }),
  ]
  if ('setAppBadge' in navigator) {
    tasks.push(count > 0 ? navigator.setAppBadge(count).catch(() => {}) : navigator.clearAppBadge().catch(() => {}))
  }
  event.waitUntil(Promise.all(tasks))
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
