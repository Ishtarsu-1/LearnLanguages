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
  setTimeout(prefetchAudio, 8000);
})();

// Pré-télécharge l'audio des cartes à revoir dans les 2 prochains jours (vraies voix),
// pour réviser hors ligne. Lentement, pour ne pas épuiser la limite de génération.
async function prefetchAudio() {
  if (typeof navigator === "undefined" || !navigator.onLine || !("caches" in window)) return;
  const soon = Date.now() + 2 * 864e5, seen = new Set();
  const list = state.cards.filter((c) => c.context && new Date(c.due) <= soon && audioSource(c.lang) === "server")
    .map((c) => ttsUrl(c.context, c.lang, defaultServerVoice(c.lang))).filter((u) => !seen.has(u) && seen.add(u));
  const cache = await caches.open("mochi-audio");
  for (const u of list.slice(0, 15)) {
    if (!navigator.onLine) return;
    if (await cache.match(u)) continue;
    try { await fetch(u); } catch { return; } // le service worker range la réponse dans son cache
    await new Promise((r) => setTimeout(r, 3000));
  }
}
