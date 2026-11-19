// Amis et défis (social.js) : demandes, lien d'invitation, blocage, confidentialité,
// défis calculés côté serveur à partir des données synchronisées.
const fs = require("fs"), path = require("path"), os = require("os");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-social-"));
process.env.MAIL_QUIET = "1";
const { server, db, social } = require(path.join(__dirname, "..", "server.js"));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("  ok", m); };

server.listen(0, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = {};
  const call = async (who, method, url, body) => {
    const h = { "X-Mochi": "1" }; if (jar[who]) h.Cookie = jar[who]; if (body !== undefined) h["Content-Type"] = "application/json";
    const r = await fetch(base + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    const sc = r.headers.get("set-cookie"); if (sc) jar[who] = sc.split(";")[0];
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  try {
    ok((await call("x", "GET", "/api/friends")).status === 401, "sans compte → 401");
    const ids = {};
    for (const [who, name] of [["a", "Léa"], ["b", "Tom"], ["c", "Minji"]]) ids[who] = (await call(who, "POST", "/api/signup", { email: `${who}@test.fr`, password: "motdepasse1", accept: true, name })).data.user.id;

    // Pseudo
    ok((await call("b", "POST", "/api/friends/request", { username: "lea" })).status === 400, "demande impossible sans pseudo");
    ok((await call("a", "POST", "/api/friends/username", { username: "Lé a!" })).status === 400, "pseudo invalide refusé");
    ok((await call("a", "POST", "/api/friends/username", { username: "Lea_92" })).data.username === "lea_92", "pseudo en minuscules");
    ok((await call("b", "POST", "/api/friends/username", { username: "lea_92" })).status === 409, "pseudo déjà pris");
    await call("b", "POST", "/api/friends/username", { username: "tom" });
    await call("c", "POST", "/api/friends/username", { username: "minji" });

    // Demande par pseudo → acceptée
    ok((await call("b", "POST", "/api/friends/request", { username: "personne" })).status === 404, "pseudo inconnu → 404");
    ok((await call("b", "POST", "/api/friends/request", { username: "@lea_92" })).data.sent, "demande envoyée");
    let A = (await call("a", "GET", "/api/friends")).data;
    ok(A.incoming.length === 1 && A.incoming[0].username === "tom" && A.pending === 1, "demande reçue");
    ok((await call("a", "GET", "/api/me")).data.user.social_pending === 1, "badge dans /api/me");
    ok(!JSON.stringify(A).includes("@test.fr"), "aucun e-mail exposé");
    await call("a", "POST", "/api/friends/respond", { id: ids.b, accept: true });
    A = (await call("a", "GET", "/api/friends")).data;
    ok(A.friends.length === 1 && A.friends[0].name === "Tom" && (await call("b", "GET", "/api/friends")).data.friends[0].name === "Léa", "amis des deux côtés");

    // Lien d'invitation : C devient ami de A directement
    ok((await call("a", "POST", "/api/friends/invite", { code: A.me.invite })).status === 400, "son propre lien → refusé");
    ok((await call("c", "POST", "/api/friends/invite", { code: "pasuncodevalide" })).status === 404, "lien invalide → 404");
    ok((await call("c", "POST", "/api/friends/invite", { code: A.me.invite })).data.friend.name === "Léa", "lien d'invitation → amis");
    const old = A.me.invite;
    await call("a", "POST", "/api/friends/invite-reset");
    ok((await call("b", "POST", "/api/friends/invite", { code: old })).status === 404, "ancien lien invalidé");

    // Défis : seulement avec des amis, duel à deux
    ok((await call("b", "POST", "/api/challenges/new", { type: "time", mode: "coop", days: 7, lang: "all", target: 60, friends: [ids.c] })).status === 403, "défi avec un non-ami refusé");
    ok((await call("a", "POST", "/api/challenges/new", { type: "solid", mode: "duel", days: 7, lang: "en", friends: [ids.b, ids.c] })).status === 400, "duel à plus de deux refusé");
    ok((await call("a", "POST", "/api/challenges/new", { type: "time", mode: "coop", days: 5, lang: "all", target: 60, friends: [ids.b] })).status === 400, "durée invalide refusée");
    ok((await call("a", "POST", "/api/challenges/new", { type: "time", mode: "coop", days: 7, lang: "all", target: 61, friends: [ids.b] })).status === 400, "objectif hors liste refusé");

    const today = social.dayOf();
    const ctr = (uid, key, v) => db.prepare("INSERT INTO sync_counters (user_id, key, value, rev) VALUES (?, ?, ?, 1) ON CONFLICT (user_id, key) DO UPDATE SET value = value + excluded.value").run(uid, key, v);
    const kv = (uid, key, v) => db.prepare("INSERT INTO sync_kv (user_id, key, value, updated_at, rev) VALUES (?, ?, ?, 0, 1) ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value").run(uid, key, JSON.stringify(v));
    const card = (uid, id, lemma, stability) => db.prepare("INSERT INTO sync_cards (user_id, id, data, updated_at, rev) VALUES (?, ?, ?, 0, 1) ON CONFLICT (user_id, id) DO UPDATE SET data = excluded.data").run(uid, id, JSON.stringify({ id, lang: "en", lemma, fsrs: { stability } }));

    // Temps ensemble (coopératif) : calculé depuis les compteurs du jour, avant le défi ne compte pas
    ctr(ids.a, "h.2020-01-01.en.sec", 99999);
    const t = (await call("a", "POST", "/api/challenges/new", { type: "time", mode: "coop", days: 7, lang: "all", target: 60, friends: [ids.b] })).data.challenge;
    ok(t.state === "active" && t.progress.value === 0 && t.invited.length === 1 && t.daysLeft === 7, "défi temps créé, invitation en attente");
    let B = (await call("b", "GET", "/api/friends")).data;
    ok(B.challengeInvites.length === 1 && B.pending === 1, "invitation au défi reçue");
    await call("b", "POST", `/api/challenges/${t.id}/respond`, { accept: true });
    ctr(ids.a, `h.${today}.en.sec`, 40 * 60); ctr(ids.b, `h.${today}.ko.sec`, 25 * 60);
    let c1 = (await call("b", "GET", "/api/friends")).data.challenges.find((c) => c.id === t.id);
    ok(c1.progress.value === 65 && c1.state === "success" && c1.people.length === 2, `temps additionné et objectif atteint (${c1.progress.value} min)`);

    // Mots solides en duel : seule la progression depuis le début du défi compte
    card(ids.a, "c1", "coffee", 30); // déjà solide avant le défi
    const s = (await call("a", "POST", "/api/challenges/new", { type: "solid", mode: "duel", days: 7, lang: "en", friends: [ids.c] })).data.challenge;
    await call("c", "POST", `/api/challenges/${s.id}/respond`, { accept: true });
    card(ids.a, "c2", "tea", 8); card(ids.a, "c3", "milk", 2); card(ids.c, "c4", "go + to", 12); card(ids.c, "c5", "dog", 9);
    kv(ids.c, "langs.en.known.cat", true);
    let sv = (await call("a", "GET", "/api/friends")).data.challenges.find((c) => c.id === s.id);
    const val = (who) => sv.people.find((p) => p.id === ids[who]).value;
    ok(val("a") === 1 && val("c") === 4 && JSON.stringify(sv.progress.leaders) === JSON.stringify([ids.c]), `mots solides gagnés depuis le début (Léa ${val("a")}, Minji ${val("c")})`);

    // Semaine régulière (chacun) et même chapitre
    const r = (await call("a", "POST", "/api/challenges/new", { type: "regular", days: 3, lang: "ko", friends: [ids.b] })).data.challenge;
    await call("b", "POST", `/api/challenges/${r.id}/respond`, { accept: true });
    kv(ids.a, `langs.ko.fullDays.${today}`, true); kv(ids.a, `langs.en.fullDays.${today}`, true);
    const rv = (await call("a", "GET", "/api/friends")).data.challenges.find((c) => c.id === r.id);
    ok(rv.progress.perPerson === 3 && rv.people.find((p) => p.me).value === 1 && rv.state === "active", "semaine régulière : 1 jour sur 3, seulement la langue du défi");
    ok((await call("a", "POST", "/api/challenges/new", { type: "chapter", days: 7, lang: "en", ref: "../../x", friends: [ids.b] })).status === 400, "chapitre invalide refusé");
    const ch = (await call("a", "POST", "/api/challenges/new", { type: "chapter", days: 7, lang: "en", ref: "en-lost-cat:1", refTitle: "The Lost Cat · 1", friends: [ids.b] })).data.challenge;
    await call("b", "POST", `/api/challenges/${ch.id}/respond`, { accept: true });
    kv(ids.a, "langs.en.books.en-lost-cat:1", 2); kv(ids.b, "langs.en.books.en-lost-cat:1", 1);
    ok((await call("a", "GET", "/api/friends")).data.challenges.find((c) => c.id === ch.id).state === "success", "même chapitre : lu par les deux → réussi");

    // Défi terminé : plus « en cours », sans message culpabilisant côté serveur (juste l'état)
    db.prepare("UPDATE challenges SET start_day = ?, end_day = ? WHERE id = ?").run(social.addDays(today, -10), social.addDays(today, -4), r.id);
    ok((await call("a", "GET", "/api/friends")).data.challenges.find((c) => c.id === r.id).state === "finished", "défi passé → terminé");

    // Confidentialité : stats masquées
    await call("b", "POST", "/api/friends/settings", { shareStats: false });
    A = (await call("a", "GET", "/api/friends")).data;
    ok(!A.friends.find((f) => f.id === ids.b).stats && A.friends.find((f) => f.id === ids.c).stats, "stats masquées si l'ami le choisit");

    // Blocage : retire l'amitié, les demandes suivantes n'aboutissent pas (sans le révéler)
    await call("c", "POST", "/api/friends/block", { id: ids.a });
    ok(!(await call("a", "GET", "/api/friends")).data.friends.some((f) => f.id === ids.c), "bloqué → plus amis");
    ok((await call("a", "POST", "/api/friends/request", { username: "minji" })).data.sent && !(await call("c", "GET", "/api/friends")).data.incoming.length, "demande d'un compte bloqué : ignorée en silence");
    await call("c", "POST", "/api/friends/unblock", { id: ids.a });
    ok(!(await call("c", "GET", "/api/friends")).data.blocked.length, "débloquer");

    // Quitter un défi ; le dernier qui part le supprime
    await call("a", "POST", `/api/challenges/${s.id}/leave`); await call("c", "POST", `/api/challenges/${s.id}/leave`);
    ok(!db.prepare("SELECT 1 FROM challenges WHERE id = ?").get(s.id), "défi vide supprimé");
    // Suppression de compte : tout part en cascade
    await call("b", "DELETE", "/api/me", { password: "motdepasse1" });
    ok(!db.prepare("SELECT 1 FROM friendships WHERE user_id = ? OR friend_id = ?").get(ids.b, ids.b), "compte supprimé → amitiés supprimées");
  } catch (e) { fails++; console.log("ERREUR", e); }
  console.log(fails ? `${fails} échec(s)` : "OK : amis et défis");
  server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
});
