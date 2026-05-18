// Service Worker pour notifications push Lily Gourmet
// Charge dans le navigateur du cafe et reste actif meme app fermee.

self.addEventListener('install', (event) => {
  // Active le nouveau SW immediatement, sans attendre le rechargement de l'onglet
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Prend le controle de tous les clients (onglets ouverts) immediatement
  event.waitUntil(self.clients.claim())
})

// Reception d'un push : affiche la notification systeme
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = { title: 'Lily Gourmet', body: event.data ? event.data.text() : 'Nouvelle notification' }
  }

  const title = payload.title || 'Lily Gourmet'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/Logo_LG.jpg',
    badge: payload.badge || '/Logo_LG.jpg',
    tag: payload.tag || 'lily-default',  // meme tag = remplace la notif precedente
    renotify: true,                       // re-ding meme si meme tag
    requireInteraction: true,             // reste affichee tant que pas cliquee
    data: {
      url: payload.url || '/',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Clic sur la notification : ouvre/focus l'onglet de l'app sur la bonne page
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si un onglet de l'app est deja ouvert, on le focus et navigue vers la cible
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          if ('navigate' in client) client.navigate(targetUrl)
          return
        }
      }
      // Sinon on ouvre un nouvel onglet
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})
