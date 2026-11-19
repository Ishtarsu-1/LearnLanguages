// Test de restauration (ROADMAP P0) : « une sauvegarde qu'on n'a jamais restaurée ne compte pas ».
// 1. un vrai serveur tourne, un compte écrit des cartes ; 2. sauvegarde PENDANT qu'il tourne ;
// 3. on restaure dans un dossier vierge ; 4. un nouveau serveur démarre dessus : connexion, cartes,
// photo de profil, santé. Plus : rotation, sauvegarde corrompue refusée, base actuelle mise de côté.
const fs = require("fs"), path = require("path"), os = require("os");
const { spawn } = require("child_process");
const { backup, restore, list } = require("../tools/backup.js");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("  ok", m); };
const ROOT = path.join(__dirname, "..");

function startServer(data) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const p = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: { ...process.env, DATA_DIR: data, PORT: String(port), HOST: "127.0.0.1", MAIL_QUIET: "1", MOCHI_LLM: "off", TTS_URL: "", TTS_URL_EN: "", TTS_URL_KO: "" }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  const ready = (async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); } throw new Error("le serveur ne démarre pas"); })();
  return { base, ready, stop: () => new Promise((r) => { p.on("exit", r); p.kill(); }) };
}
async function call(base, method, url, body, cookie) {
  const h = { "X-Mochi": "1" }; if (cookie) h.Cookie = cookie; if (body) h["Content-Type"] = "application/json";
  const r = await fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, cookie: r.headers.get("set-cookie")?.split(";")[0], data: await r.json().catch(() => null) };
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-backup-")), A = path.join(tmp, "prod"), B = path.join(tmp, "machine-vierge");
  try {
    // 1. Un serveur en marche, avec un compte et des cartes
    const s1 = startServer(A); await s1.ready;
    const h = await call(s1.base, "GET", "/api/health");
    ok(h.status === 200 && h.data.ok && h.data.db === "ok" && !JSON.stringify(h.data).includes("@"), "santé : /api/health (sans donnée personnelle)");
    const su = await call(s1.base, "POST", "/api/signup", { email: "lea@test.fr", password: "motdepasse1", accept: true, name: "Léa" });
    const card = { id: "c1", lang: "ko", lemma: "커피", fsrs: { stability: 9 } };
    const sy = await call(s1.base, "POST", "/api/sync", { cursor: 0, epoch: 0, kv: [{ k: "goal", v: 20, t: Date.now() }], cards: [{ id: "c1", data: card, t: Date.now() }], logs: [], counters: [{ k: "xp.ko", d: 120 }] }, su.cookie);
    ok(su.status === 201 && sy.status === 200, "compte et progression écrits");
    fs.writeFileSync(path.join(A, "avatars", `${su.data.user.id}-abc.webp`), "image");

    // 2. Sauvegarde à chaud (serveur allumé)
    const b = backup({ data: A, now: new Date("2026-11-19T10:00:00Z") });
    ok(b.ok && b.users === 1 && b.cards === 1 && b.avatars === 1, `sauvegarde à chaud vérifiée (${b.name})`);
    await call(s1.base, "POST", "/api/sync", { cursor: sy.data.cursor, epoch: sy.data.epoch, cards: [{ id: "c2", data: { ...card, id: "c2", lemma: "차" }, t: Date.now() }] }, su.cookie);
    await s1.stop();

    // 3. Restauration sur une machine vierge
    const r = restore(b.name, { data: B, dir: path.join(A, "backups") });
    ok(r.ok && r.users === 1 && !r.aside, "restauration dans un dossier vierge");

    // 4. Le site redémarre sur la sauvegarde
    const s2 = startServer(B); await s2.ready;
    const li = await call(s2.base, "POST", "/api/login", { email: "lea@test.fr", password: "motdepasse1" });
    ok(li.status === 200 && li.data.user.name === "Léa", "connexion avec le compte restauré");
    const pull = await call(s2.base, "POST", "/api/sync", { cursor: 0, epoch: 0 }, li.cookie);
    ok(pull.data.cards.length === 1 && pull.data.cards[0].data.lemma === "커피" && pull.data.counters.some((c) => c.k === "xp.ko" && c.v === 120), "cartes et XP restaurées (état au moment de la sauvegarde)");
    ok(fs.existsSync(path.join(B, "avatars", `${su.data.user.id}-abc.webp`)), "photo de profil restaurée");
    await s2.stop();

    // Restaurer par-dessus une base existante : elle est mise de côté, jamais supprimée
    const r2 = restore(b.name, { data: B, dir: path.join(A, "backups") });
    ok(r2.aside && fs.existsSync(path.join(r2.aside, "mochi.db")), "base actuelle mise de côté avant restauration");

    // Rotation : on garde les N plus récentes
    for (let i = 1; i <= 4; i++) backup({ data: A, keep: 3, now: new Date(Date.UTC(2026, 10, 19, 11, i)) });
    const l = list({ data: A });
    ok(l.length === 3 && l[0].name === "mochi-20261119-110400", `rotation : ${l.length} sauvegardes gardées, la plus récente d'abord`);
    // Sauvegarde corrompue ou nom piégé : refus
    fs.writeFileSync(path.join(A, "backups", l[0].name, "mochi.db"), "pas une base");
    let refused = false; try { restore(l[0].name, { data: B, dir: path.join(A, "backups") }); } catch { refused = true; }
    ok(refused, "sauvegarde corrompue refusée");
    refused = false; try { restore("../../etc", { data: B, dir: path.join(A, "backups") }); } catch { refused = true; }
    ok(refused, "nom de sauvegarde piégé refusé");
  } catch (e) { fails++; console.log("ERREUR", e); }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails ? `${fails} échec(s)` : "OK : sauvegarde et restauration");
  process.exit(fails ? 1 : 0);
})();
