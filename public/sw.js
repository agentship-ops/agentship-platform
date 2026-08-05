// Agentship push service worker
self.addEventListener('push', function (event) {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: 'Agentship', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Agentship'
  const options = {
    body: data.body || '',
    badge: '/icon-192.png',
    icon: '/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          return
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
