// ============================================================
//  Mochi — duel en direct entre amis (« ⚡ Duel »)
//  Un mot s'affiche dans la langue étudiée ; le premier qui écrit sa traduction française
//  marque un point ; le premier à 5 points gagne. 15 manches au plus, 20 s par manche.
//  - Temps réel par Server-Sent Events (GET /api/live/stream) : natif, sans dépendance,
//    compatible avec la CSP (connect-src 'self') et un reverse proxy.
//  - C'est LE SERVEUR qui arbitre : il garde les réponses attendues, le client ne reçoit que le mot.
//  - Parties en mémoire (un redémarrage les annule) : rien à nettoyer en base.
//  - Pas d'XP (§16) : on joue pour le plaisir et pour réviser du vocabulaire.
// ============================================================
const L = require("./tools/content-lib.js");

const TARGET = 5, MAX_ROUNDS = 15;

// ---------- Réponses acceptées ----------
const ARTICLES = /^(le|la|les|l|un|une|des|du|de|d|se|s|to|a|an|the)\s+/;
function norm(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ").replace(/-/g, " ").replace(/\s+/g, " ").trim().replace(ARTICLES, "").trim();
}
// « être bien, bon (좋아요 = c'est bien) » → ["etre bien", "bien", "bon"]
function answersOf(fr) {
  const out = new Set();
  for (const part of String(fr).replace(/\([^)]*\)/g, " ").split(/[,;/]|\bou\b/)) {
    const n = norm(part);
    if (!n || n.length > 30) continue;
    out.add(n);
    if (n.startsWith("etre ")) out.add(n.slice(5));
    if (n.startsWith("faire ") && n.split(" ").length > 1) out.add(n);
  }
  return [...out];
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Tolérance aux fautes de frappe : 1 lettre dès 5 lettres, 2 dès 7 (une inversion compte pour 2)
function isRight(text, answers) {
  const t = norm(text);
  if (!t) return false;
  return answers.some((a) => a === t || (a.length >= 5 && lev(a, t) <= (a.length >= 7 ? 2 : 1)));
}
// Mots jouables : parmi les plus fréquents du lexique, avec une traduction courte et claire.
// Anglais : on saute les mots-outils (the, to, a…), trop ambigus pour un duel.
const EN_FUNCTION = new Set("the be a to i you it have do that in on with at we she my and for not this your us will would an of so he his her they me but no yes what how where too just let there some any about by up down after more very much many all can".split(" "));
function wordPool(lang, lexicon = L.loadLexicon()[lang]) {
  return Object.entries(lexicon).slice(0, 450).filter(([w, e]) => {
    if (lang === "en" && EN_FUNCTION.has(w)) return false;
    if (lang === "ko" && (L.KO_PARTICLES.has(w) || w === "이다" || w === "들")) return false;
    if (/particule|compteur|suffixe|\(futur|\(conditionnel/.test(e.fr)) return false;
    return answersOf(e.fr).length > 0 && e.fr.length <= 40;
  }).map(([w, e]) => ({ word: w, fr: e.fr, answers: answersOf(e.fr) }));
}

function create({ social, db, roundMs = 20000, pauseMs = 2500, countdownMs = 3000, now = Date.now, lexicon } = {}) {
  const streams = new Map(); // uid → Set(res)
  const matches = new Map(); // id → match
  let seq = 0;
  const err = (status, message) => Object.assign(new Error(message), { status, expose: true });
  const nameOf = (uid) => { const u = db.prepare("SELECT name, username, avatar_emoji, avatar_file FROM users WHERE id = ?").get(uid) || {}; return { id: uid, name: u.name || u.username || "?", avatar: u.avatar_emoji, avatar_url: u.avatar_file ? `/avatars/${u.avatar_file}` : null }; };

  // ---------- Flux en temps réel ----------
  function push(uid, event) {
    for (const res of streams.get(uid) || []) res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  function openStream(uid, req, res) {
    const set = streams.get(uid) || new Set();
    if (set.size >= 6) { res.writeHead(429, { "Content-Type": "text/plain" }); return res.end(); }
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.write("retry: 3000\n\n");
    set.add(res); streams.set(uid, set);
    // Invitations en attente au moment de la connexion
    for (const m of matches.values()) if (m.status === "waiting" && m.players[1] === uid) res.write(`data: ${JSON.stringify({ type: "invite", match: snapshot(m, uid) })}\n\n`);
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => { clearInterval(ping); set.delete(res); if (!set.size) streams.delete(uid); });
  }
  const online = (uid) => (streams.get(uid)?.size || 0) > 0;

  // ---------- Une partie ----------
  function snapshot(m, me) {
    const r = m.round;
    return {
      id: m.id, lang: m.lang, status: m.status, target: TARGET, maxRounds: MAX_ROUNDS, winner: m.winner ?? null, reason: m.reason || null,
      players: m.players.map((p, i) => ({ ...m.info[i], score: m.score[i], me: p === me })),
      startsAt: m.startsAt || null,
      round: r ? { n: r.n, word: r.word, endsAt: r.endsAt, closed: !!r.result, result: r.result || null } : null,
      history: m.history,
    };
  }
  const broadcast = (m, extra = {}) => { for (const uid of m.players) push(uid, { type: "match", match: snapshot(m, uid), ...extra }); };
  function clear(m) { clearTimeout(m.timer); m.timer = null; }
  function finish(m, reason) {
    clear(m);
    m.status = "finished"; m.reason = reason;
    if (m.winner === undefined) m.winner = m.score[0] === m.score[1] ? null : m.players[m.score[0] > m.score[1] ? 0 : 1];
    broadcast(m);
    setTimeout(() => matches.delete(m.id), 10 * 60e3).unref?.();
  }
  function nextRound(m) {
    clear(m);
    if (m.score.some((s) => s >= TARGET)) return finish(m, "score");
    if ((m.round?.n || 0) >= MAX_ROUNDS || !m.words.length) return finish(m, "rounds");
    const w = m.words.shift();
    m.status = "playing";
    m.round = { n: (m.round?.n || 0) + 1, word: w.word, answers: w.answers, fr: w.fr, endsAt: now() + roundMs, result: null };
    broadcast(m);
    m.timer = setTimeout(() => closeRound(m, null), roundMs);
  }
  function closeRound(m, winnerIdx) {
    const r = m.round;
    if (!r || r.result) return;
    clear(m);
    if (winnerIdx !== null) m.score[winnerIdx]++;
    r.result = { winner: winnerIdx === null ? null : m.players[winnerIdx], answer: r.fr };
    m.history.push({ word: r.word, fr: r.fr, winner: r.result.winner });
    broadcast(m);
    m.timer = setTimeout(() => nextRound(m), pauseMs);
  }

  // ---------- Actions ----------
  function invite(uid, friend, lang) {
    friend = Number(friend);
    if (!["en", "ko"].includes(lang)) throw err(400, "Choisis la langue du duel.");
    if (!social.areFriends(uid, friend)) throw err(403, "Tu ne peux défier que tes amis.");
    for (const m of matches.values()) if (["waiting", "countdown", "playing"].includes(m.status) && m.players.includes(uid)) throw err(409, "Tu as déjà un duel en cours.");
    const pool = wordPool(lang, lexicon?.[lang]);
    if (pool.length < MAX_ROUNDS) throw err(500, "Pas assez de mots pour un duel dans cette langue.");
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const m = { id: `${Date.now().toString(36)}${(++seq).toString(36)}`, lang, players: [uid, friend], info: [nameOf(uid), nameOf(friend)], score: [0, 0], status: "waiting", words: pool.slice(0, MAX_ROUNDS), round: null, history: [], created: now() };
    matches.set(m.id, m);
    // Invitation sans réponse au bout de 2 minutes : annulée
    m.timer = setTimeout(() => { if (m.status === "waiting") { m.status = "cancelled"; m.reason = "expired"; broadcast(m); matches.delete(m.id); } }, 120e3);
    push(friend, { type: "invite", match: snapshot(m, friend) });
    return { match: snapshot(m, uid), friendOnline: online(friend) };
  }
  const get = (uid, id) => { const m = matches.get(id); if (!m || !m.players.includes(uid)) throw err(404, "Ce duel n'existe plus."); return m; };
  function join(uid, id) {
    const m = get(uid, id);
    if (m.players[1] !== uid || m.status !== "waiting") throw err(409, "Ce duel a déjà commencé ou a été annulé.");
    clear(m);
    m.status = "countdown"; m.startsAt = now() + countdownMs;
    broadcast(m);
    m.timer = setTimeout(() => nextRound(m), countdownMs);
    return { match: snapshot(m, uid) };
  }
  function cancel(uid, id) {
    const m = get(uid, id);
    if (m.status === "waiting") { clear(m); m.status = "cancelled"; m.reason = m.players[0] === uid ? "cancelled" : "declined"; broadcast(m); matches.delete(m.id); }
    else if (m.status === "countdown" || m.status === "playing") { m.winner = m.players.find((p) => p !== uid); finish(m, "forfeit"); }
    return { ok: true };
  }
  function answer(uid, id, n, text) {
    const m = get(uid, id), r = m.round;
    if (m.status !== "playing" || !r || r.n !== Number(n)) return { ok: false, late: true };
    if (r.result) return { ok: false, late: true };
    if (typeof text !== "string" || text.length > 80) throw err(400, "Réponse invalide.");
    if (!isRight(text, r.answers)) return { ok: false };
    closeRound(m, m.players.indexOf(uid));
    return { ok: true };
  }

  async function handle(route, uid, readJson, req, res) {
    if (route === "GET /api/live/stream") return openStream(uid, req, res);
    let mm = route.match(/^GET \/api\/live\/([a-z0-9]{4,24})$/);
    if (mm) return { match: snapshot(get(uid, mm[1]), uid) };
    mm = route.match(/^POST \/api\/live\/(invite|([a-z0-9]{4,24})\/(join|cancel|answer))$/);
    if (!mm) throw err(404, "Route inconnue.");
    const b = await readJson(req);
    if (mm[1] === "invite") return invite(uid, b.friend, b.lang);
    if (mm[3] === "join") return join(uid, mm[2]);
    if (mm[3] === "cancel") return cancel(uid, mm[2]);
    return answer(uid, mm[2], b.round, b.text);
  }
  return { handle, matches, streams, online, invite, join, cancel, answer, TARGET };
}

module.exports = { create, answersOf, isRight, norm, wordPool, TARGET, MAX_ROUNDS };
