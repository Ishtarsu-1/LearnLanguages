const fs = require("fs"), path = require("path"), os = require("os");
process.env.DATA_DIR = fs.mkdtempSync(path.join(process.argv[3] || os.tmpdir(), "mochi-data-"));
const { server } = require(path.join((process.argv[2] || path.join(__dirname, "..")), "server.js"));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } };
server.listen(0, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const call = async (method, url, body, { raw, type, csrf = true, ck = cookie } = {}) => {
    const h = {}; if (csrf) h["X-Mochi"] = "1"; if (ck) h.Cookie = ck;
    if (raw) h["Content-Type"] = type; else if (body !== undefined) h["Content-Type"] = "application/json";
    const r = await fetch(base + url, { method, headers: h, body: raw || (body !== undefined ? JSON.stringify(body) : undefined) });
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
    return { status: r.status, data: await r.json().catch(() => null), headers: r.headers };
  };
  try {
    { // En-têtes de sécurité
      const r = await fetch(base + "/");
      ok(r.status === 200, "index");
      const csp = r.headers.get("content-security-policy") || "";
      ok(/script-src 'self'(;|$)/.test(csp) && /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp), "CSP sur GET / : " + csp);
      ok(r.headers.get("permissions-policy")?.includes("camera=()") && r.headers.get("cross-origin-opener-policy") === "same-origin", "Permissions-Policy + COOP");
      ok(r.headers.get("strict-transport-security") === null, "pas de HSTS sans COOKIE_SECURE");
      const html = await r.text();
      ok((html.match(/data-nav="(aujourdhui|lire|reviser)"/g) || []).length === 6, "une navigation en haut (ordinateur) et une en bas (mobile), mêmes entrées");
    }
    { // Adresse IP du client derrière un proxy (TRUST_PROXY)
      const { clientIp } = require(path.join((process.argv[2] || path.join(__dirname, "..")), "server.js"));
      const req = (peer, xff) => ({ socket: { remoteAddress: peer }, headers: xff ? { "x-forwarded-for": xff } : {} });
      const warn = console.warn; console.warn = () => {};
      ok(clientIp(req("127.0.0.1", "1.2.3.4")) === "127.0.0.1", "sans TRUST_PROXY, X-Forwarded-For ignoré");
      console.warn = warn;
      const trusted = new Set(["127.0.0.1"]);
      ok(clientIp(req("127.0.0.1", "9.9.9.9, 5.6.7.8"), trusted) === "5.6.7.8", "proxy de confiance : dernière entrée");
      ok(clientIp(req("::ffff:127.0.0.1", "9.9.9.9, 5.6.7.8"), trusted) === "5.6.7.8", "proxy en IPv4 mappée");
      ok(clientIp(req("127.0.0.1", "abc"), trusted) === "127.0.0.1", "valeur invalide → IP du pair");
      ok(clientIp(req("10.0.0.9", "5.6.7.8"), trusted) === "10.0.0.9", "pair non fiable → en-tête ignoré");
      ok(clientIp(req("2001:db8:1:2:aaaa::1")) === clientIp(req("2001:db8:1:2:bbbb::2")), "IPv6 regroupées par /64");
      ok(clientIp(req("2001:db8:1:2:aaaa::1")) !== clientIp(req("2001:db8:1:3::1")), "autre /64 → autre clé");
      ok(clientIp(req("::1")) === "0:0:0:0::/64", "::1 développé");
      ok(clientIp(req("::ffff:10.0.0.1")) === "10.0.0.1", "IPv4 mappée → IPv4");
    }
    ok((await fetch(base + "/server.js")).status === 404, "server.js non servi");
    { // Appli installable (PWA)
      const sw = await fetch(base + "/sw.js"); ok(sw.status === 200 && /javascript/.test(sw.headers.get("content-type")), "service worker servi");
      const mf = await fetch(base + "/manifest.webmanifest"); ok(mf.status === 200 && (await mf.json()).icons.length === 4, "manifeste");
      ok((await fetch(base + "/icons/mochi-maskable-512.png")).headers.get("content-type") === "image/png", "icône");
      ok((await fetch(base + "/icons/../server.js")).status === 404 && (await fetch(base + "/icons/autre.png")).status === 404, "icônes : liste stricte");
      // Tous les fichiers précachés par le service worker existent (sinon l'installation échoue)
      const list = JSON.parse((await sw.text()).match(/const SHELL_FILES = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
      for (const f of list) ok((await fetch(base + f)).status === 200, "précache " + f);
      // Chaque script de index.html est servi et précaché (sinon : page cassée hors ligne)
      for (const f of require("./scripts.js")(process.argv[2] || path.join(__dirname, ".."))) {
        ok((await fetch(base + "/" + f)).status === 200, "script servi " + f);
        ok(list.includes("/" + f), "script précaché " + f);
      }
    }
    ok((await fetch(base + "/data/mochi.db")).status === 404, "db non servie");
    ok((await fetch(base + "/../package.json")).status === 404, "traversal");
    ok((await call("GET", "/api/me")).data.user === null, "me anonyme");
    ok((await call("POST", "/api/signup", { email: "a@b.co", password: "12345678", accept: true }, { csrf: false })).status === 403, "csrf");
    ok((await call("POST", "/api/signup", { email: "pasunemail", password: "12345678", accept: true })).status === 400, "email invalide");
    ok((await call("POST", "/api/signup", { email: "a@b.co", password: "123", accept: true })).status === 400, "mdp court");
    ok((await call("POST", "/api/signup", { email: "sans@cgu.fr", password: "motdepasse1" })).status === 400, "conditions non acceptées → refus");
    let r = await call("POST", "/api/signup", { email: "Lea@Test.fr", password: "motdepasse1", accept: true, name: "Léa" });
    ok(r.status === 201 && r.data.user.name === "Léa" && cookie.startsWith("mochi_sid="), "signup " + JSON.stringify(r.data));
    ok(r.data.user.avatar_emoji === "mochi", "avatar par défaut : Mochi");
    ok(require(path.join((process.argv[2] || path.join(__dirname, "..")), "server.js")).db.prepare("SELECT terms_version, terms_accepted_at FROM users WHERE email = 'Lea@Test.fr'").get().terms_accepted_at, "acceptation des conditions enregistrée");
    ok(/HttpOnly/.test(r.headers.get("set-cookie")) && /SameSite=Lax/.test(r.headers.get("set-cookie")), "cookie flags");
    const c1 = cookie;
    ok((await call("POST", "/api/signup", { email: "lea@test.fr", password: "motdepasse1", accept: true })).status === 409, "doublon insensible casse");
    r = await call("POST", "/api/sync", { cursor: 0, epoch: 0, cards: [{ id: "c1", data: { a: 1 }, t: Date.now() }, { id: "c2", data: { a: 2 }, t: Date.now() }] });
    ok(r.status === 200 && r.data.cards.length === 2 && r.data.cursor === 1, "sync " + JSON.stringify(r.data));
    r = await call("GET", "/api/me"); ok(r.data.user.email === "Lea@Test.fr" && r.data.legacy_state === null, "me");
    ok((await call("PUT", "/api/state", { state: {} })).status === 404, "ancienne route retirée");
    ok((await call("PATCH", "/api/me", { avatar_emoji: "💀" })).status === 400, "emoji refusé");
    r = await call("PATCH", "/api/me", { name: "  Léa B\u0001 ", avatar_emoji: "🦊" }); ok(r.data.user.name === "Léa B" && r.data.user.avatar_emoji === "🦊", "patch " + JSON.stringify(r.data));
    // avatar
    ok((await call("POST", "/api/avatar", undefined, { raw: Buffer.from("<svg onload=alert(1)>"), type: "image/png" })).status === 400, "faux png refusé");
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5860000000049454e44ae426082", "hex");
    r = await call("POST", "/api/avatar", undefined, { raw: png, type: "image/png" }); ok(r.status === 200 && /^\/avatars\/\d+-[0-9a-f]{16}\.png$/.test(r.data.user.avatar_url), "avatar " + JSON.stringify(r.data));
    const img = await fetch(base + r.data.user.avatar_url); ok(img.status === 200 && img.headers.get("content-type") === "image/png" && img.headers.get("x-content-type-options") === "nosniff", "avatar servi");
    ok((await call("POST", "/api/avatar", undefined, { raw: Buffer.alloc(1100000, 0xff), type: "image/jpeg" })).status === 413, "avatar trop gros");
    const old = r.data.user.avatar_url;
    r = await call("DELETE", "/api/avatar"); ok(r.data.user.avatar_url === null, "avatar retiré");
    await new Promise((s) => setTimeout(s, 50)); ok((await fetch(base + old)).status === 404, "ancien fichier supprimé");
    // logout / login
    ok((await call("POST", "/api/logout")).status === 200, "logout");
    ok((await call("GET", "/api/me", undefined, { ck: c1 })).data.user === null, "session révoquée");
    cookie = "";
    ok((await call("POST", "/api/login", { email: "lea@test.fr", password: "mauvais!!" })).status === 401, "mauvais mdp");
    r = await call("POST", "/api/login", { email: "lea@test.fr", password: "motdepasse1" }); ok(r.status === 200 && r.data.user, "login");
    r = await call("POST", "/api/sync", { cursor: 0, epoch: 0 }); ok(r.data.cards.length === 2, "cartes retrouvées après reconnexion");
    const devA = cookie;
    await call("POST", "/api/login", { email: "lea@test.fr", password: "motdepasse1" }); const devB = cookie;
    r = await call("GET", "/api/sessions"); ok(r.data.sessions.length === 2 && r.data.sessions.filter((x) => x.current).length === 1, "sessions");
    ok((await call("POST", "/api/password", { current: "faux", next: "nouveaumdp1" })).status === 401, "pwd actuel faux");
    ok((await call("POST", "/api/password", { current: "motdepasse1", next: "nouveaumdp1" })).status === 200, "pwd changé");
    ok((await call("GET", "/api/me", undefined, { ck: devA })).data.user === null, "autre appareil déconnecté");
    ok((await call("GET", "/api/me", undefined, { ck: devB })).data.user !== null, "appareil courant gardé");
    // rate limit
    cookie = "";
    for (let i = 0; i < 10; i++) await call("POST", "/api/login", { email: "x@y.fr", password: "nope" });
    r = await call("POST", "/api/login", { email: "x@y.fr", password: "nope" });
    ok(r.status === 429 && Number(r.headers.get("retry-after")) > 0, "rate limit + Retry-After");
    // stockée en base : survit à un redémarrage
    ok(require(path.join((process.argv[2] || path.join(__dirname, "..")), "server.js")).db.prepare("SELECT count FROM login_attempts WHERE key = 'login-email:x@y.fr'").get()?.count >= 6, "compteur persistant");
    // freinage progressif, plafonné par compte (on simule le temps)
    const { limiter: L } = require(path.join((process.argv[2] || path.join(__dirname, "..")), "server.js"));
    let t = 1e12;
    for (let i = 0; i < 5; i++) L.recordAttempt("login-email:z@z.fr", t);
    ok(L.waitFor("login-email:z@z.fr", t) === 0, "5 essais gratuits");
    L.recordAttempt("login-email:z@z.fr", t); ok(L.waitFor("login-email:z@z.fr", t) === 1, "puis 1 s");
    L.recordAttempt("login-email:z@z.fr", t); ok(L.waitFor("login-email:z@z.fr", t) === 2, "puis 2 s");
    for (let i = 0; i < 20; i++) L.recordAttempt("login-email:z@z.fr", t);
    ok(L.waitFor("login-email:z@z.fr", t) === 60, "plafond 60 s par compte");
    ok(L.waitFor("login-email:z@z.fr", t + 2 * 3600e3) === 0, "fenêtre expirée");
    for (let i = 0; i < 10; i++) L.recordAttempt("feedback:1", t);
    ok(L.waitFor("feedback:1", t) === 0, "10 corrections/min OK");
    L.recordAttempt("feedback:1", t + 20e3); ok(L.waitFor("feedback:1", t + 20e3) === 40, "11e : attendre la fin de la minute");
    // suppression
    cookie = devB;
    ok((await call("DELETE", "/api/me", { password: "motdepasse1" })).status === 401, "delete mauvais mdp");
    ok((await call("DELETE", "/api/me", { password: "nouveaumdp1" })).status === 200, "delete");
    ok((await call("GET", "/api/me", undefined, { ck: devB })).data.user === null, "compte supprimé");
  } catch (e) { fails++; console.log("ERREUR", e); }
  console.log(fails ? `${fails} échec(s)` : "OK : API comptes");
  server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
});
