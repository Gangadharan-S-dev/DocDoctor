/* DocDoctor service worker: offline app shell + cache-first hashed assets & offline fonts. */
const VERSION = 'dd-v3'
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/robots.txt']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  // API calls always go to the network.
  if (url.pathname.startsWith('/api/')) return

  // Cache same-origin assets, workers, and fonts
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/assets/') || /\.(woff2?|svg|png|jpg|jpeg|webp|ico|webmanifest)$/i.test(url.pathname)) {
      e.respondWith(
        caches.match(e.request).then((hit) => hit ?? fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put(e.request, copy))
          }
          return res
        })),
      )
      return
    }

    // Navigations: network-first, fall back to the cached shell offline.
    if (e.request.mode === 'navigate') {
      e.respondWith(
        fetch(e.request)
          .then((res) => {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put('/index.html', copy))
            return res
          })
          .catch(() => caches.match('/index.html')),
      )
    }
  }
})
