// Mot de passe oublié et vérification de l'adresse (ROADMAP P0)
const fs = require("fs"), path = require("path"), os = require("os");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-mail-"));
process.env.PUBLIC_URL = "https://mochi.example/";
delete process.env.RESEND_API_KEY;
const print = console.log; console.log = () => {}; // les e-mails « console » ne polluent pas la sortie
const { server, mail, db } = require(path.join(__dirname, "..", "server.js"));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; print("FAIL", m); } };
const tick = () => new Promise((r) => setTimeout(r, 20));
server.listen(0, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body, ck = "") => {
    const r = await fetch(base + url, { method, headers: { "X-Mochi": "1", "Content-Type": "application/json", ...(ck ? { Cookie: ck } : {}) }, body: body && JSON.stringify(body) });
    return { status: r.status, data: await r.json().catch(() => null), cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
  };
  const tokenIn = (m, kind) => m.text.match(new RegExp(`https://mochi\\.example/#/${kind}/([A-Za-z0-9_-]+)`))?.[1];
  try {
    // Mode Resend : requête HTTP correcte (fausse API)
    let seen; const M = require(path.join(__dirname, "..", "mailer.js"));
    const R = M.create({ env: { RESEND_API_KEY: "re_test", MAIL_FROM: "Mochi <a@b.fr>" }, fetchImpl: async (u, o) => { seen = { u, o }; return { ok: true }; } });
    await R.send({ to: "x@y.fr", ...M.mails.reset("Léa <b>", "https://m.fr/#/reinitialiser/T") });
    const body = JSON.parse(seen.o.body);
    ok(R.mode === "resend" && seen.u === "https://api.resend.com/emails" && seen.o.headers.Authorization === "Bearer re_test" && body.to[0] === "x@y.fr" && body.from === "Mochi <a@b.fr>", "envoi Resend");
    ok(body.html.includes("Léa &lt;b&gt;") && !body.html.includes("<b>"), "HTML échappé");
    // Inscription → e-mail de vérification, compte non vérifié
    let r = await call("POST", "/api/signup", { email: "Zoe@Test.fr", password: "motdepasse1", name: "Zoé" });
    const ck1 = r.cookie; await tick();
    ok(r.data.user.email_verified === false, "non vérifié à l'inscription");
    let m = mail.outbox.at(-1);
    ok(m && m.to === "Zoe@Test.fr" && /Confirme/.test(m.subject) && m.text.includes("Zoé"), "e-mail de vérification " + JSON.stringify(m));
    const vtok = tokenIn(m, "verifier");
    ok(vtok && vtok.length >= 40, "lien de vérification basé sur PUBLIC_URL");
    ok(!db.prepare("SELECT 1 FROM email_tokens WHERE token_hash = ?").get(vtok), "jeton stocké haché");
    // Renvoi : remplace l'ancien lien
    ok((await call("POST", "/api/email/resend", {}, ck1)).status === 200, "renvoi");
    await tick(); const vtok2 = tokenIn(mail.outbox.at(-1), "verifier");
    ok(vtok2 !== vtok && (await call("POST", "/api/email/verify", { token: vtok })).status === 400, "l'ancien lien est annulé");
    ok((await call("POST", "/api/email/verify", { token: vtok2 })).status === 200, "vérification");
    ok((await call("POST", "/api/email/verify", { token: vtok2 })).status === 400, "lien à usage unique");
    ok((await call("GET", "/api/me", undefined, ck1)).data.user.email_verified === true, "adresse vérifiée");
    ok((await call("POST", "/api/email/resend", {}, ck1)).data.already === true, "renvoi inutile si déjà vérifiée");

    // Mot de passe oublié : même réponse pour une adresse inconnue, aucun e-mail envoyé
    const n = mail.outbox.length;
    r = await call("POST", "/api/password/forgot", { email: "inconnu@test.fr" }); await tick();
    ok(r.status === 200 && mail.outbox.length === n, "adresse inconnue : réponse identique, pas d'e-mail");
    ok((await call("POST", "/api/password/forgot", { email: "pas-un-email" })).status === 400, "adresse invalide");
    r = await call("POST", "/api/password/forgot", { email: "zoe@test.fr" }); await tick();
    m = mail.outbox.at(-1);
    ok(r.status === 200 && JSON.stringify(r.data) === '{"ok":true}' && /Réinitialiser/.test(m.subject), "e-mail de réinitialisation");
    const rtok = tokenIn(m, "reinitialiser");
    ok((await call("POST", "/api/password/reset", { token: rtok, password: "court" })).status === 400, "mot de passe trop court");
    ok((await call("POST", "/api/password/reset", { token: "faux", password: "nouveaumdp1" })).status === 400, "jeton inconnu");
    r = await call("POST", "/api/password/reset", { token: rtok, password: "nouveaumdp1" });
    ok(r.status === 200 && r.data.user.email === "Zoe@Test.fr" && r.cookie.startsWith("mochi_sid="), "réinitialisation + connexion");
    ok((await call("GET", "/api/me", undefined, ck1)).data.user === null, "anciennes sessions fermées");
    ok((await call("POST", "/api/password/reset", { token: rtok, password: "autremdp12" })).status === 400, "jeton à usage unique");
    ok((await call("POST", "/api/login", { email: "zoe@test.fr", password: "nouveaumdp1" })).status === 200, "connexion avec le nouveau mot de passe");
    ok((await call("POST", "/api/login", { email: "zoe@test.fr", password: "motdepasse1" })).status === 401, "ancien mot de passe refusé");
    // Expiration (30 min)
    await call("POST", "/api/password/forgot", { email: "zoe@test.fr" }); await tick();
    const etok = tokenIn(mail.outbox.at(-1), "reinitialiser");
    db.prepare("UPDATE email_tokens SET expires_at = ? WHERE kind = 'reset'").run(new Date(Date.now() - 1000).toISOString());
    ok((await call("POST", "/api/password/reset", { token: etok, password: "nouveaumdp2" })).status === 400, "lien expiré");
    // Admin : refusé aux comptes normaux, accordé par tools/admin.js
    r = await call("POST", "/api/login", { email: "zoe@test.fr", password: "nouveaumdp1" });
    const ckz = r.cookie;
    ok(r.data.user.is_admin === false && (await call("GET", "/api/admin/stats", undefined, ckz)).status === 403, "stats admin refusées");
    ok((await call("GET", "/api/admin/stats")).status === 401, "stats admin : connexion requise");
    const { execFileSync } = require("child_process");
    const out = execFileSync(process.execPath, [path.join(__dirname, "..", "tools", "admin.js"), "add", "ZOE@test.fr"], { env: { ...process.env }, encoding: "utf8" });
    ok(/est admin/.test(out), "outil admin " + out);
    let bad = false; try { execFileSync(process.execPath, [path.join(__dirname, "..", "tools", "admin.js"), "add", "personne@test.fr"], { stdio: "pipe" }); } catch { bad = true; }
    ok(bad, "outil admin : compte inexistant refusé");
    ok((await call("GET", "/api/me", undefined, ckz)).data.user.is_admin === true, "is_admin exposé");
    r = await call("GET", "/api/admin/stats", undefined, ckz);
    ok(r.status === 200 && r.data.users.total >= 1 && r.data.users.admins === 1 && r.data.list[0].email && r.data.mail === "console" && !("pass" in r.data.list[0]), "stats admin " + JSON.stringify(r.data).slice(0, 200));
    // Jeu de rôle (mode histoire) : validation stricte, scénario fixé côté serveur
    ok((await call("POST", "/api/roleplay", { mission: "ko-cafe", history: [{ who: "me", text: "안녕하세요" }] })).status === 401, "jeu de rôle : connexion requise");
    ok((await call("POST", "/api/roleplay", { mission: "inconnue", history: [{ who: "me", text: "hi" }] }, ckz)).status === 400, "mission inconnue");
    ok((await call("POST", "/api/roleplay", { mission: "toString", history: [{ who: "me", text: "hi" }] }, ckz)).status === 400, "pas de propriété héritée");
    ok((await call("POST", "/api/roleplay", { mission: "en-cafe", history: [{ who: "npc", text: "hi" }] }, ckz)).status === 400, "le dernier message doit venir de l'apprenant");
    ok((await call("POST", "/api/roleplay", { mission: "en-cafe", history: [{ who: "me", text: "x".repeat(301) }] }, ckz)).status === 400, "message trop long");
    const before = db.prepare("SELECT COALESCE(sum(count), 0) n FROM llm_usage").get().n;
    r = await call("POST", "/api/roleplay", { mission: "en-cafe", history: [{ who: "npc", text: "Hi there!" }, { who: "me", text: "An iced coffee, please." }] }, ckz);
    ok([200, 503].includes(r.status), "jeu de rôle : réponse ou IA indisponible " + r.status);
    if (r.status === 503) ok(db.prepare("SELECT COALESCE(sum(count), 0) n FROM llm_usage").get().n === before, "échec non décompté du quota");
    // Limitation : 5 demandes libres par adresse, puis freinage
    let last; for (let i = 0; i < 6; i++) last = await call("POST", "/api/password/forgot", { email: "spam@test.fr" });
    ok(last.status === 429, "limitation des demandes");
  } catch (e) { fails++; print("ERREUR", e); }
  print(fails ? `${fails} échec(s)` : "OK : mot de passe oublié et vérification de l'adresse");
  server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
});
