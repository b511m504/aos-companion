const CACHE_NAME = "aos-companion-v4"
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./404.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
]

function isFactionJsonRequest(url) {
  try {
    const u = new URL(url)
    return u.pathname.includes("structured/factions") && u.pathname.endsWith(".json")
  } catch {
    return false
  }
}

function wantsHtml(request) {
  const accept = request.headers.get("accept") || ""
  return accept.includes("text/html")
}

function sameOrigin(urlStr) {
  try {
    return new URL(urlStr).origin === self.location.origin
  } catch {
    return false
  }
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))).then(() =>
        self.clients.claim()
      )
    )
  )
})

self.addEventListener("fetch", event => {
  const req = event.request
  if (req.method !== "GET") return

  if (isFactionJsonRequest(req.url)) {
    event.respondWith(staleWhileRevalidateFaction(event, req))
    return
  }

  /** Offline shell for navigation + PWABuilder expectations */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {})
            return res
          }
          return caches.match("/index.html").then(hit => hit || serveAppShell())
        })
        .catch(() => caches.match("/index.html").then(hit => hit || serveAppShell()))
    )
    return
  }

  if (sameOrigin(req.url) && wantsHtml(req)) {
    event.respondWith(networkFirstHtmlShell(req))
    return
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached
      return fetch(req).then(res => {
        const copy = res.clone()
        if (res.ok && sameOrigin(req.url)) {
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {})
        }
        return res
      })
    })
  )
})

/** Stale-while-revalidate for faction JSON. */
function staleWhileRevalidateFaction(event, req) {
  return caches.open(CACHE_NAME).then(cache =>
    cache.match(req).then(cached => {
      const update = fetch(req).then(res => {
        if (res.ok) cache.put(req, res.clone())
        return res
      })

      if (cached) {
        event.waitUntil(update.catch(() => {}))
        return cached
      }
      return update
    })
  )
}

/** Network-first for HTML (non-navigate); fallback to app shell. */
function networkFirstHtmlShell(req) {
  return fetch(req)
    .then(res => {
      if (res.ok) {
        const copy = res.clone()
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {})
        return res
      }
      return serveAppShell()
    })
    .catch(() => serveAppShell())
}

function serveAppShell() {
  return caches.open(CACHE_NAME).then(async cache => {
    const tryPaths = [
      "/index.html",
      "./index.html",
      "index.html",
      "./404.html",
      "./"
    ]
    for (const p of tryPaths) {
      const hit = await cache.match(p)
      if (hit) return hit
    }
    try {
      return await fetch("./index.html")
    } catch {
      return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
    }
  })
}
