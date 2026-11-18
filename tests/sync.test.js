const vm = require("vm"), fs = require("fs"), path = require("path"), os = require("os");
const APP = process.argv[2] || path.join(__dirname, "..");
process.env.DATA_DIR = fs.mkdtempSync(path.join(process.argv[3] || os.tmpdir(), "mochi-sync-"));
const { server, db } = require(path.join(APP, "server.js"));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("  ok", m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function device(base, name) {
  const store = {}; let cookie = "";
  const el = () => ({ value: "", innerHTML: "", textContent: "", hidden: false, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], focus() {} });
  const ctx = {
    console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, Date, Math, JSON, URL, Blob: function () {}, Promise,
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] },
    location: { hash: "" },
    document: { getElementById: () => el(), querySelector: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, style: { setProperty() {} } }, body: { dataset: {}, classList: { toggle() {} } }, addEventListener() {}, hidden: false },
    addEventListener() {}, confirm: () => true, scrollTo() {},
    fetch: async (url, opts = {}) => {
      const headers = { ...(opts.headers || {}) }; if (cookie) headers.Cookie = cookie;
      const r = await fetch(base + url, { ...opts, headers });
      const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
      return r;
    },
  };
  ctx.window = ctx;
  ctx.FSRS = {
    createEmptyCard: (d) => ({ due: d, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, state: 0, last_review: undefined }),
    fsrs: () => ({
      next: (c, now, g) => { const days = [0, 0.001, 1, 3, 8][g] * (c.reps + 1); return { card: { ...c, due: new Date(+now + days * 864e5), stability: days * 3, reps: c.reps + 1, state: 2, last_review: now }, log: { elapsed_days: 0, scheduled_days: days, state: c.state } }; },
      repeat: (c, now) => ({ 1: { card: { due: now } }, 2: { card: { due: now } }, 3: { card: { due: now } }, 4: { card: { due: now } } }),
    }),
  };
  vm.createContext(ctx);
  for (const f of ["content.js", "app.js", "exercises.js", "placement.js", "library.js", "missions.js", "story.js", "keyboard.js", "hangul.js", "cosmetics.js", "tour.js"]) vm.runInContext(fs.readFileSync(path.join(APP, f), "utf8"), ctx, { filename: f });
  const run = (code) => vm.runInContext(code, ctx);
  return { run, ctx, name, store, wait: () => sleep(200) };
}

server.listen(0, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // 1. Appareil A : progression en invité, puis inscription → tout est envoyé
    const A = device(base, "A"); await A.wait();
    A.run(`serverOn === true`) || ok(false, "serveur détecté");
    A.run(`
      for (const t of TEXTS.en.slice(0, 2)) for (const s of t.parsed) s.words.forEach((w, wi) => w.segs.forEach((g, gi) => { if (g.lemmas.length) captureSeg("en", s, wi, gi, t.id); }));
      state.cards.filter((c) => c.lang === "en").slice(0, 5).forEach((c) => rateCard(c.id, 3));
      state.langs.en.known.hello = true; state.goal = 15; save();
    `);
    const nCards = A.run(`state.cards.length`), xpA0 = A.run(`state.langs.en.xp`);
    await A.run(`api("POST", "/api/signup", { email: "sync@test.fr", password: "motdepasse1", name: "Sam" }).then((d) => applyAuth(d, { isNew: true }))`);
    ok(A.run(`account && account.email`) === "sync@test.fr", "inscription A");
    ok(db.prepare("SELECT COUNT(*) n FROM sync_cards").get().n === nCards, `cartes envoyées (${nCards})`);
    ok(db.prepare("SELECT COUNT(*) n FROM review_logs").get().n === 5, "5 révisions envoyées");
    ok(db.prepare("SELECT value FROM sync_counters WHERE key = 'xp.en'").get().value === xpA0, "XP envoyée");

    // 2. Appareil B se connecte → récupère tout
    const B = device(base, "B"); await B.wait();
    await B.run(`api("POST", "/api/login", { email: "sync@test.fr", password: "motdepasse1" }).then((d) => applyAuth(d))`);
    ok(B.run(`state.cards.length`) === nCards && B.run(`state.logs.length`) === 5, "B a les cartes et révisions");
    ok(B.run(`state.langs.en.xp`) === xpA0 && B.run(`state.goal`) === 15 && B.run(`state.langs.en.known.hello`) === true, "B a XP, objectif, mots connus");

    // 3. Modifications concurrentes sur les deux appareils (hors ligne l'un de l'autre)
    A.run(`const ca = state.cards.find((c) => c.fsrs.state === 0); globalThis.cardA = ca.id; rateCard(ca.id, 4); state.langs.en.known.coffee = true; track("en", "sec", 60); state.langs.en.seconds += 60; save();`);
    B.run(`const cb = state.cards.filter((c) => c.fsrs.state === 0)[1]; globalThis.cardB = cb.id; rateCard(cb.id, 2); state.settings.retention = 0.85; track("en", "sec", 120); state.langs.en.seconds += 120; save();`);
    const idA = A.run("cardA"), idB = B.run("cardB");
    A.run(`globalThis.cardB = ${JSON.stringify(idB)}`); B.run(`globalThis.cardA = ${JSON.stringify(idA)}`);
    ok(idA !== idB, "deux cartes différentes");
    await A.run(`syncNow()`); await B.run(`syncNow()`); await A.run(`syncNow()`);
    for (const D of [A, B]) {
      ok(D.run(`state.logs.length`) === 7, `${D.name} : 7 révisions (union, aucune perdue)`);
      ok(D.run(`state.cards.find((c) => c.id === cardA).fsrs.reps`) === 1 && D.run(`state.cards.find((c) => c.id === cardB).fsrs.reps`) === 1, `${D.name} : les deux cartes révisées`);
      ok(D.run(`state.langs.en.xp`) === xpA0 + 4, `${D.name} : XP additionnée (${D.run("state.langs.en.xp")})`);
      ok(D.run(`state.langs.en.seconds`) === 180 && D.run(`state.history[today()].en.sec`) === 180, `${D.name} : temps additionné`);
      ok(D.run(`state.settings.retention`) === 0.85 && D.run(`state.langs.en.known.coffee`) === true, `${D.name} : réglage de B + mot connu de A`);
    }

    // 4. Conflit sur la même clé : la modification la plus récente gagne, même si elle arrive en premier
    A.run(`state.goal = 5; save();`); await sleep(20);
    B.run(`state.goal = 20; save();`);
    await B.run(`syncNow()`); await A.run(`syncNow()`); await B.run(`syncNow()`);
    ok(A.run(`state.goal`) === 20 && B.run(`state.goal`) === 20, "la plus récente gagne (20)");

    // 5. Suppression d'une clé (mot plus « connu »)
    A.run(`delete state.langs.en.known.hello; save();`);
    await A.run(`syncNow()`); await B.run(`syncNow()`);
    ok(B.run(`state.langs.en.known.hello`) === undefined, "suppression propagée");

    // 6. Modification locale pendant une requête : elle n'est pas écrasée
    const p = A.run(`syncNow()`); A.run(`state.goal = 10; save();`); await p; await A.run(`syncNow()`); await B.run(`syncNow()`);
    ok(A.run(`state.goal`) === 10 && B.run(`state.goal`) === 10, "modif pendant la requête conservée");

    // 7. Rechargement de la page avec des modifications hors ligne
    A.run(`state.langs.en.known.milk = true; save();`);
    const A2store = { ...A.store };
    const A2 = device(base, "A2"); Object.assign(A2.store, A2store);
    A2.run(`attachAccount(${JSON.stringify(A.run("account"))}, {})`);
    ok(A2.run(`state.langs.en.known.milk`) === true, "état local rechargé");
    // cookie de A pour A2 : on réutilise A directement pour l'envoi
    await A.run(`syncNow()`); await B.run(`syncNow()`);
    ok(B.run(`state.langs.en.known.milk`) === true, "modif hors ligne envoyée");

    // 8. Réinitialisation sur A → B repart de zéro
    A.run(`actions.reset()`); await sleep(100); await A.run(`syncNow()`);
    await B.run(`syncNow()`);
    ok(B.run(`state.cards.length`) === 0 && B.run(`state.logs.length`) === 0 && B.run(`state.langs.en.xp`) === 0, "reset propagé à B");
    B.run(`state.goal = 15; save();`); await B.run(`syncNow()`); await A.run(`syncNow()`);
    ok(A.run(`state.goal`) === 15, "synchro normale après reset");

    // 9. Migration de l'ancien format
    const C = device(base, "C"); await C.wait();
    await C.run(`api("POST", "/api/signup", { email: "old@test.fr", password: "motdepasse1" })`);
    const uid = db.prepare("SELECT id FROM users WHERE email = 'old@test.fr'").get().id;
    db.prepare("UPDATE users SET sync_rev = 0 WHERE id = ?").run(uid);
    db.prepare("DELETE FROM sync_kv WHERE user_id = ?").run(uid);
    db.prepare("INSERT INTO user_state (user_id, state, updated_at) VALUES (?, ?, ?)").run(uid, JSON.stringify({ goal: 20, langs: { ko: { xp: 42, hangulDone: true } }, cards: [], logs: [] }), new Date().toISOString());
    const D = device(base, "D"); await D.wait();
    await D.run(`api("POST", "/api/login", { email: "old@test.fr", password: "motdepasse1" }).then((d) => applyAuth(d))`);
    ok(D.run(`state.goal`) === 20 && D.run(`state.langs.ko.xp`) === 42 && D.run(`state.langs.ko.hangulDone`) === true, "ancien format migré");
    ok(db.prepare("SELECT value FROM sync_counters WHERE user_id = ? AND key = 'xp.ko'").get(uid)?.value === 42, "migration envoyée au serveur");

    // 10. Validation serveur
    const bad = await D.run(`api("POST", "/api/sync", { cursor: -1, epoch: 0 }).then(() => "accepté", (e) => e.status)`);
    ok(bad === 400, "curseur invalide refusé");
    const bad2 = await D.run(`api("POST", "/api/sync", { cursor: 0, epoch: 0, cards: [{ id: "x", data: [1], t: 1 }] }).then(() => "accepté", (e) => e.status)`);
    ok(bad2 === 400, "carte invalide refusée");
  } catch (e) { fails++; console.log("ERREUR", e); }
  console.log(fails ? `\n${fails} échec(s)` : "\nOK : synchronisation multi-appareils");
  server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
});
