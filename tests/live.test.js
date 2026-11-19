// Duel en direct (live.js) : réponses acceptées, arbitrage côté serveur, temps réel (SSE).
const fs = require("fs"), path = require("path"), os = require("os");
const { create, answersOf, isRight, wordPool } = require("../live.js");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("  ok", m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // Réponses : accents, articles, « être », plusieurs sens, fautes de frappe
  ok(JSON.stringify(answersOf("être bien, bon (좋아요 = c'est bien)")) === '["etre bien","bien","bon"]', "réponses tirées du lexique");
  ok(isRight("Café", answersOf("café")) && isRight("le cafe", answersOf("café")) && isRight("BIEN", answersOf("être bien, bon")), "accents, majuscules, articles, être");
  ok(isRight("hopitall", answersOf("hôpital")) && isRight("aeroprot", answersOf("aéroport")) && !isRight("chat", answersOf("chien")), "fautes de frappe tolérées, pas les autres mots");
  ok(!isRight("", answersOf("café")) && !isRight("le", answersOf("café")), "réponse vide ou article seul refusés");
  for (const l of ["en", "ko"]) ok(wordPool(l).length >= 100 && wordPool(l).every((w) => w.answers.length), `${l} : assez de mots jouables`);
  ok(!wordPool("ko").some((w) => ["은", "는", "이다"].includes(w.word)) && !wordPool("en").some((w) => ["the", "to", "a"].includes(w.word)), "ni particules ni mots-outils");

  // Partie complète avec des délais courts
  const users = { 1: { name: "Léa" }, 2: { name: "Tom" }, 3: { name: "Sam" } };
  const db = { prepare: () => ({ get: (id) => users[id] }) };
  const social = { areFriends: (a, b) => [a, b].sort().join() === "1,2" };
  const L = create({ social, db, roundMs: 300, pauseMs: 20, countdownMs: 20 });
  const events = { 1: [], 2: [] }, closers = [];
  const stream = (uid) => { const req = { on: (ev, f) => closers.push(f) }; const res = { writeHead() {}, write: (s) => { const m = s.match(/^data: (.*)\n\n$/); if (m) events[uid].push(JSON.parse(m[1])); } }; L.handle("GET /api/live/stream", uid, null, req, res); };
  stream(1); stream(2);
  const call = (uid, route, body) => L.handle(route, uid, async () => body || {}, {});
  await call(1, "POST /api/live/invite", { friend: 3, lang: "en" }).then(() => ok(false, "duel avec un non-ami"), (e) => ok(e.status === 403, "duel seulement entre amis"));
  const { match } = await call(1, "POST /api/live/invite", { friend: 2, lang: "ko" });
  ok(match.status === "waiting" && events[2].some((e) => e.type === "invite" && e.match.id === match.id), "invitation reçue en direct");
  await call(1, "POST /api/live/invite", { friend: 2, lang: "ko" }).then(() => ok(false, "deux duels"), (e) => ok(e.status === 409, "un seul duel à la fois"));
  await call(1, `POST /api/live/${match.id}/join`).then(() => ok(false, "l'inviteur rejoint"), (e) => ok(e.status === 409, "seul l'invité peut rejoindre"));
  await call(2, `POST /api/live/${match.id}/join`);
  await wait(60);
  const m = L.matches.get(match.id);
  ok(m.status === "playing" && m.round.n === 1, "compte à rebours puis manche 1");
  const snap = events[2].at(-1).match;
  ok(snap.round.word === m.round.word && !("answers" in snap.round) && !JSON.stringify(snap).includes(`"${m.round.fr}"`), "le client reçoit le mot, jamais les réponses");
  ok((await call(2, `POST /api/live/${match.id}/answer`, { round: 1, text: "zzzz" })).ok === false, "mauvaise réponse : pas de point");
  ok((await call(2, `POST /api/live/${match.id}/answer`, { round: 1, text: m.round.answers[0] })).ok === true && m.score[1] === 1, "bonne réponse : point");
  ok((await call(1, `POST /api/live/${match.id}/answer`, { round: 1, text: m.round.answers[0] })).late, "trop tard pour l'autre");
  // Manche sans réponse : personne ne marque
  await wait(40); const before = m.score.join(); await wait(320);
  ok(m.score.join() === before && m.history.at(-1).winner === null, "temps écoulé : manche perdue pour les deux");
  // Léa gagne 5 manches d'affilée
  for (let i = 0; i < 5; i++) { await wait(40); await call(1, `POST /api/live/${match.id}/answer`, { round: m.round.n, text: m.round.answers[0] }); }
  await wait(40);
  ok(m.status === "finished" && m.winner === 1 && m.score[0] === 5, `premier à 5 points gagne (${m.score.join(" – ")})`);
  ok(events[1].at(-1).match.status === "finished" && events[1].at(-1).match.history.length >= 6, "fin envoyée à tous, avec les mots de la partie");
  // Abandon : l'autre gagne
  const m2 = (await call(2, "POST /api/live/invite", { friend: 1, lang: "en" })).match;
  await call(1, `POST /api/live/${m2.id}/join`); await wait(40);
  await call(2, `POST /api/live/${m2.id}/cancel`);
  ok(L.matches.get(m2.id).winner === 1 && L.matches.get(m2.id).reason === "forfeit", "abandon : victoire de l'autre");
  closers.forEach((f) => f());
  ok(!L.streams.size, "flux fermés proprement");

  // Serveur : flux SSE réservé aux comptes, en-têtes corrects
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-live-")); process.env.MAIL_QUIET = "1";
  const { server } = require("../server.js");
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  ok((await fetch(base + "/api/live/stream")).status === 401, "flux : connexion requise");
  const s = await fetch(base + "/api/signup", { method: "POST", headers: { "X-Mochi": "1", "Content-Type": "application/json" }, body: JSON.stringify({ email: "z@t.fr", password: "motdepasse1", accept: true }) });
  const ck = s.headers.get("set-cookie").split(";")[0], ac = new AbortController();
  const st = await fetch(base + "/api/live/stream", { headers: { Cookie: ck }, signal: ac.signal });
  ok(st.status === 200 && /text\/event-stream/.test(st.headers.get("content-type")), "flux : text/event-stream");
  ac.abort();
  ok((await fetch(base + "/api/live/invite", { method: "POST", headers: { Cookie: ck, "X-Mochi": "1", "Content-Type": "application/json" }, body: JSON.stringify({ friend: 99, lang: "en" }) })).status === 403, "duel avec un inconnu refusé");
  server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
})().catch((e) => { fails++; console.log("ERREUR", e); }).finally(() => { console.log(fails ? `${fails} échec(s)` : "OK : duel en direct"); process.exit(fails ? 1 : 0); });
