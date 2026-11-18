// ============================================================
//  Mochi — service worker (ROADMAP P2 « Application installable + hors ligne »)
//  - Coquille de l'appli : réseau d'abord (toujours la dernière version en ligne),
//    copie en cache pour le mode hors ligne.
//  - Polices, avatars, audio des vraies voix : cache d'abord (fichiers immuables).
//  - Le reste de l'API n'est jamais mis en cache : la synchro gère le hors-ligne
//    (les changements attendent le retour du réseau, voir syncNow dans sync.js).
// ============================================================
const VERSION = "mochi-v10";
const SHELL = `${VERSION}-shell`, STATIC = `${VERSION}-static`, AUDIO = "mochi-audio"; // l'audio survit aux mises à jour
const SHELL_FILES = [
  "/", "/state.js", "/sync.js", "/ui.js", "/audio.js", "/reader.js", "/fsrs-cards.js", "/today.js", "/lessons.js", "/profile.js", "/router.js", "/actions.js", "/app.js", "/content.js", "/exercises.js", "/placement.js", "/library.js", "/missions.js", "/story.js", "/keyboard.js", "/hangul.js", "/cosmetics.js", "/tour.js", "/legal.js", "/styles.css", "/tokens.css",
  "/fonts/pretendard.css", "/fonts/jua.css", "/fonts/fredoka.css", "/favicon.svg", "/vendor/ts-fsrs-5.2.3.umd.js",
  "/manifest.webmanifest", "/icons/mochi-192.png",
];
const AUDIO_MAX = 400; // phrases gardées au plus (les plus anciennes partent d'abord)

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC && k !== AUDIO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    // Navigation hors ligne : la page d'accueil sert pour toutes les routes (#/…)
    return (await cache.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? cache.match("/") : Response.error());
  }
}
async function cacheFirst(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    if (max) cache.keys().then((keys) => keys.length > max && Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k))));
  }
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname === "/api/tts") return e.respondWith(cacheFirst(req, AUDIO, AUDIO_MAX));
  if (url.pathname.startsWith("/api/")) return; // jamais en cache
  if (url.pathname.startsWith("/fonts/") && url.pathname.endsWith(".woff2")) return e.respondWith(cacheFirst(req, STATIC));
  if (url.pathname.startsWith("/avatars/") || url.pathname.startsWith("/icons/")) return e.respondWith(cacheFirst(req, STATIC));
  e.respondWith(networkFirst(req));
});
