// ============================================================
//  Mochi — app.js : Démarrage
//  Script classique chargé dans l'ordre par index.html (voir la liste là-bas) :
//  les déclarations de haut niveau sont partagées entre les fichiers.
// ============================================================
// Démarrage : si le serveur répond et qu'une session existe, on charge le compte
// Hors ligne (appli installée, métro…) : on retrouve le dernier compte connu et sa
// progression locale ; la synchro reprendra au retour du réseau.
const LAST_ACCOUNT = "mochi-last-account";
const rememberAccount = (d) => { try { if (d) localStorage.setItem(LAST_ACCOUNT, JSON.stringify(d)); else localStorage.removeItem(LAST_ACCOUNT); } catch {} };
(async function boot() {
  try {
    const r = await fetch("/api/me", { credentials: "same-origin" });
    if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
      serverOn = true;
      const d = await r.json();
      features = d.features || features;
      if (d.user) attachAccount(d.user, { legacy: d.legacy_state });
      rememberAccount(d.user ? { user: d.user, features } : null);
    }
  } catch {
    let last = null; try { last = JSON.parse(localStorage.getItem(LAST_ACCOUNT)); } catch {}
    if (last?.user) { serverOn = true; features = last.features || features; attachAccount(last.user); sync.status = "error"; }
  }
  route();
  if (account) syncNow();
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && location.protocol?.startsWith("http")) navigator.serviceWorker.register("/sw.js").catch(() => {});
  // Préchargement de l'audio : seulement quand la page est inactive, et pas si le serveur
  // annonce des voix lentes (il les garde pour les clics).
  if (!features.ttsSlow) {
    const whenIdle = typeof requestIdleCallback === "function" ? (f) => setTimeout(() => requestIdleCallback(f, { timeout: 20000 }), 3000) : (f) => setTimeout(f, 8000);
    whenIdle(prefetchAudio);
  }
})();

// Pré-télécharge l'audio des cartes à revoir dans les 2 prochains jours (vraies voix),
// pour réviser hors ligne. En basse priorité (p=low : les clics passent devant côté serveur),
// lentement, et on s'arrête dès que l'utilisateur lance une lecture.
async function prefetchAudio() {
  if (typeof navigator === "undefined" || !navigator.onLine || !("caches" in window)) return;
  const plays = audioPlays;
  const soon = Date.now() + 2 * 864e5, seen = new Set();
  const list = state.cards.filter((c) => c.context && new Date(c.due) <= soon && audioSource(c.lang) === "server")
    .map((c) => ttsUrl(c.context, c.lang, defaultServerVoice(c.lang))).filter((u) => !seen.has(u) && seen.add(u));
  const cache = await caches.open("mochi-audio");
  for (const u of list.slice(0, 15)) {
    if (!navigator.onLine || audioPlays !== plays) return;
    if (await cache.match(u)) continue;
    try { const r = await fetch(`${u}&p=low`); if (!r.ok) return; } catch { return; } // le service worker range la réponse (même clé que le clic)
    await new Promise((r) => setTimeout(r, 3000));
  }
}
