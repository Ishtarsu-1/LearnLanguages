// ============================================================
//  Mochi — amis et défis entre amis (ROADMAP P2 « Liste d'amis », « Défis entre amis »)
//  Règle d'or (PEDAGOGIE §8, §16) : un défi ne pousse jamais à mal apprendre.
//   - Coopératif d'abord ; le seul duel porte sur un indicateur honnête (mots solides).
//   - Pas d'XP à gagner : rien à gonfler en bâclant des cartes.
//   - La progression est CALCULÉE ICI à partir des données synchronisées (séances complètes,
//     temps et révisions par jour, stabilité FSRS des cartes, chapitres lus), jamais déclarée.
//   - Rien n'est public : seuls les amis voient le profil, et les stats se masquent.
// ============================================================
const crypto = require("node:crypto");

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const LANGS = ["en", "ko", "zh"];
const DAYS = [3, 7, 14];
// type → règles. target : valeurs proposées (coopératif : total à atteindre ensemble)
const TYPES = {
  regular: { title: "Semaine régulière", icon: "📅", modes: ["each"], unit: "séances complètes", perPerson: { 3: 3, 7: 5, 14: 10 } },
  time: { title: "Du temps ensemble", icon: "⏱️", modes: ["coop"], unit: "minutes", targets: [60, 120, 300, 600] },
  reviews: { title: "Révisions ensemble", icon: "🔁", modes: ["coop"], unit: "révisions", targets: [100, 300, 600, 1000] },
  solid: { title: "Mots solides", icon: "🌱", modes: ["coop", "duel"], unit: "mots solides gagnés", targets: [10, 30, 60, 100], needLang: true },
  chapter: { title: "Même chapitre", icon: "📖", modes: ["each"], unit: "chapitre lu et compris", needLang: true, needRef: true },
};
const REF_RE = /^[a-z]{2}-[a-z0-9-]{1,60}:\d{1,3}$/;
const SOLID_DAYS = 7; // stabilité FSRS ≥ 7 jours = mot solide (comme lemmaStatus côté client)

function create(db, { now = () => new Date() } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS friendships (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, friend_id)
    );
    CREATE INDEX IF NOT EXISTS friendships_friend ON friendships (friend_id, status);
    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT, creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL, mode TEXT NOT NULL, lang TEXT, target INTEGER, ref TEXT, ref_title TEXT,
      days INTEGER NOT NULL, start_day TEXT NOT NULL, end_day TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS challenge_participants (
      challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL, baseline REAL, joined_at TEXT,
      PRIMARY KEY (challenge_id, user_id)
    );
  `);
  const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!cols.includes("username")) db.exec("ALTER TABLE users ADD COLUMN username TEXT");
  if (!cols.includes("invite_code")) db.exec("ALTER TABLE users ADD COLUMN invite_code TEXT");
  if (!cols.includes("share_stats")) db.exec("ALTER TABLE users ADD COLUMN share_stats INTEGER NOT NULL DEFAULT 1");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users (username)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_invite ON users (invite_code)");

  const iso = () => now().toISOString();
  // Jour du calendrier (Europe/Paris) : comme les jours de l'appli (heure locale des utilisateurs, français)
  const dayOf = (d = now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const err = (status, message) => Object.assign(new Error(message), { status, expose: true });

  // ---------- Mesures (à partir des données synchronisées) ----------
  const inPeriod = (day, c) => day >= c.start_day && day <= c.end_day;
  function counterSum(uid, c, field) {
    let n = 0;
    for (const r of db.prepare("SELECT key, value FROM sync_counters WHERE user_id = ? AND key LIKE 'h.%'").all(uid)) {
      const [, day, lang, f] = r.key.split(".");
      if (f === field && inPeriod(day, c) && (!c.lang || c.lang === lang)) n += r.value;
    }
    return n;
  }
  function fullDaysDistinct(uid, c) {
    const days = new Set();
    for (const r of db.prepare("SELECT key, value FROM sync_kv WHERE user_id = ? AND key LIKE 'langs.%.fullDays.%'").all(uid)) {
      const [, lang, , day] = r.key.split(".");
      if (JSON.parse(r.value) && inPeriod(day, c) && (!c.lang || c.lang === lang)) days.add(day);
    }
    return days.size;
  }
  function solidCount(uid, lang) {
    const solid = new Set();
    for (const r of db.prepare("SELECT data FROM sync_cards WHERE user_id = ?").all(uid)) {
      const card = JSON.parse(r.data);
      if (!card || card.lang !== lang || card.paused) continue;
      if ((card.fsrs?.stability || 0) >= SOLID_DAYS) for (const l of String(card.lemma).split(" + ")) solid.add(l);
    }
    for (const r of db.prepare("SELECT key, value FROM sync_kv WHERE user_id = ? AND key LIKE ?").all(uid, `langs.${lang}.known.%`)) if (JSON.parse(r.value)) solid.add(r.key.slice(`langs.${lang}.known.`.length));
    return solid.size;
  }
  const chapterDone = (uid, lang, ref) => { const r = db.prepare("SELECT value FROM sync_kv WHERE user_id = ? AND key = ?").get(uid, `langs.${lang}.books.${ref}`); return !!(r && JSON.parse(r.value) !== null); };
  const secondsTotal = (uid) => db.prepare("SELECT COALESCE(SUM(value), 0) n FROM sync_counters WHERE user_id = ? AND key LIKE 'seconds.%'").get(uid).n;
  const langsOf = (uid) => LANGS.filter((l) => db.prepare("SELECT value FROM sync_kv WHERE user_id = ? AND key = ?").get(uid, `langs.${l}.started`)?.value === "true"
    || db.prepare("SELECT 1 FROM sync_cards WHERE user_id = ? AND data LIKE ? LIMIT 1").get(uid, `%"lang":"${l}"%`));

  function measure(c, uid, p) {
    if (c.type === "regular") return fullDaysDistinct(uid, c);
    if (c.type === "time") return Math.floor(counterSum(uid, c, "sec") / 60);
    if (c.type === "reviews") return counterSum(uid, c, "rev");
    if (c.type === "solid") return Math.max(0, solidCount(uid, c.lang) - (p.baseline ?? 0));
    if (c.type === "chapter") return chapterDone(uid, c.lang, c.ref) ? 1 : 0;
    return 0;
  }
  // Un défi avec la progression de chacun et son état (en cours / réussi / terminé)
  function view(c, me) {
    const T = TYPES[c.type], today = dayOf();
    const parts = db.prepare(`SELECT p.*, u.name, u.username, u.avatar_emoji FROM challenge_participants p JOIN users u ON u.id = p.user_id WHERE p.challenge_id = ? ORDER BY p.joined_at IS NULL, p.joined_at`).all(c.id);
    const joined = parts.filter((p) => p.status === "joined");
    const people = joined.map((p) => ({ id: p.user_id, name: p.name || p.username, username: p.username, avatar: p.avatar_emoji, me: p.user_id === me, value: measure(c, p.user_id, p) }));
    const perPerson = c.type === "regular" ? T.perPerson[c.days] : c.type === "chapter" ? 1 : null;
    const total = people.reduce((n, x) => n + x.value, 0);
    const over = today > c.end_day;
    let done, progress;
    if (c.mode === "coop") { progress = { value: total, target: c.target }; done = total >= c.target; }
    else if (c.mode === "each") { progress = { perPerson, reached: people.filter((x) => x.value >= perPerson).length, of: people.length }; done = people.length > 0 && people.every((x) => x.value >= perPerson); }
    else { const best = Math.max(0, ...people.map((x) => x.value)); progress = { leaders: people.filter((x) => x.value === best && best > 0).map((x) => x.id) }; done = false; }
    const state = c.mode !== "duel" && done ? "success" : over ? "finished" : "active";
    const meP = parts.find((p) => p.user_id === me);
    return {
      id: c.id, type: c.type, icon: T.icon, title: T.title, unit: T.unit, mode: c.mode, lang: c.lang, target: c.target, ref: c.ref, refTitle: c.ref_title,
      days: c.days, start: c.start_day, end: c.end_day, daysLeft: Math.max(0, Math.round((new Date(`${c.end_day}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 864e5) + (over ? 0 : 1)),
      state, progress, people, invited: parts.filter((p) => p.status === "invited").map((p) => ({ id: p.user_id, name: p.name || p.username })),
      creator: c.creator_id === me, myStatus: meP?.status || null,
    };
  }

  // ---------- Amis ----------
  const rel = (a, b) => db.prepare("SELECT status FROM friendships WHERE user_id = ? AND friend_id = ?").get(a, b)?.status || null;
  const areFriends = (a, b) => rel(a, b) === "accepted" && rel(b, a) === "accepted";
  const friendIds = (uid) => db.prepare("SELECT f.friend_id id FROM friendships f JOIN friendships g ON g.user_id = f.friend_id AND g.friend_id = f.user_id AND g.status = 'accepted' WHERE f.user_id = ? AND f.status = 'accepted'").all(uid).map((r) => r.id);
  const userCard = (u) => ({ id: u.id, name: u.name || u.username, username: u.username, avatar: u.avatar_emoji, avatar_url: u.avatar_file ? `/avatars/${u.avatar_file}` : null });
  function friendCard(uid) {
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(uid);
    const card = userCard(u);
    if (u.share_stats) {
      const langs = langsOf(uid);
      card.stats = { hours: Math.round((secondsTotal(uid) / 3600) * 10) / 10, langs, solid: Object.fromEntries(langs.map((l) => [l, solidCount(uid, l)])) };
    }
    return card;
  }
  function makeFriends(a, b) {
    const t = iso();
    for (const [x, y] of [[a, b], [b, a]]) db.prepare("INSERT INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'accepted', ?) ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted'").run(x, y, t);
  }
  function ensureInvite(uid) {
    const u = db.prepare("SELECT invite_code FROM users WHERE id = ?").get(uid);
    if (u.invite_code) return u.invite_code;
    const code = crypto.randomBytes(9).toString("base64url");
    db.prepare("UPDATE users SET invite_code = ? WHERE id = ?").run(code, uid);
    return code;
  }

  function overview(uid) {
    const me = db.prepare("SELECT username, share_stats FROM users WHERE id = ?").get(uid);
    const incoming = db.prepare("SELECT u.* FROM friendships f JOIN users u ON u.id = f.user_id WHERE f.friend_id = ? AND f.status = 'pending'").all(uid).filter((u) => rel(uid, u.id) !== "blocked").map(userCard);
    const outgoing = db.prepare("SELECT u.* FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = 'pending'").all(uid).map(userCard);
    const blocked = db.prepare("SELECT u.* FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = 'blocked'").all(uid).map(userCard);
    const cs = db.prepare(`SELECT c.* FROM challenges c JOIN challenge_participants p ON p.challenge_id = c.id WHERE p.user_id = ? AND p.status IN ('joined', 'invited') AND c.end_day >= ? ORDER BY c.end_day`).all(uid, addDays(dayOf(), -30)).map((c) => view(c, uid));
    return {
      me: { username: me.username, shareStats: !!me.share_stats, invite: ensureInvite(uid) },
      friends: friendIds(uid).map(friendCard).sort((a, b) => a.name.localeCompare(b.name)),
      incoming, outgoing, blocked,
      challenges: cs.filter((c) => c.myStatus === "joined"), challengeInvites: cs.filter((c) => c.myStatus === "invited" && c.state === "active"),
      types: Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, { title: t.title, icon: t.icon, modes: t.modes, unit: t.unit, targets: t.targets || null, perPerson: t.perPerson || null, needLang: !!t.needLang, needRef: !!t.needRef }])),
      pending: incoming.length + cs.filter((c) => c.myStatus === "invited" && c.state === "active").length,
    };
  }
  const pendingCount = (uid) => db.prepare("SELECT count(*) n FROM friendships WHERE friend_id = ? AND status = 'pending'").get(uid).n
    + db.prepare("SELECT count(*) n FROM challenge_participants p JOIN challenges c ON c.id = p.challenge_id WHERE p.user_id = ? AND p.status = 'invited' AND c.end_day >= ?").get(uid, dayOf()).n;

  function setUsername(uid, raw) {
    const name = String(raw || "").trim().toLowerCase();
    if (!USERNAME_RE.test(name)) throw err(400, "Pseudo : 3 à 20 caractères, lettres minuscules sans accent, chiffres ou _.");
    const other = db.prepare("SELECT id FROM users WHERE username = ?").get(name);
    if (other && other.id !== uid) throw err(409, "Ce pseudo est déjà pris.");
    db.prepare("UPDATE users SET username = ? WHERE id = ?").run(name, uid);
    return name;
  }
  function request(uid, raw) {
    const name = String(raw || "").trim().toLowerCase().replace(/^@/, "");
    if (!db.prepare("SELECT username FROM users WHERE id = ?").get(uid).username) throw err(400, "Choisis d'abord ton pseudo.");
    const u = USERNAME_RE.test(name) ? db.prepare("SELECT id FROM users WHERE username = ?").get(name) : null;
    if (!u) throw err(404, "Aucun compte avec ce pseudo.");
    if (u.id === uid) throw err(400, "C'est ton propre pseudo 🙂");
    if (rel(uid, u.id) === "blocked") throw err(400, "Tu as bloqué ce compte : débloque-le d'abord.");
    if (areFriends(uid, u.id)) return { already: true };
    // Demande en sens inverse déjà reçue : on accepte directement
    if (rel(u.id, uid) === "pending") { makeFriends(uid, u.id); return { friends: true }; }
    if (rel(u.id, uid) === "blocked") return { sent: true }; // on ne révèle pas le blocage
    db.prepare("INSERT INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'pending', ?) ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'pending'").run(uid, u.id, iso());
    return { sent: true };
  }
  function respond(uid, other, accept) {
    if (rel(other, uid) !== "pending") throw err(404, "Demande introuvable.");
    if (accept) makeFriends(uid, other);
    else db.prepare("DELETE FROM friendships WHERE user_id = ? AND friend_id = ?").run(other, uid);
    return { ok: true };
  }
  function remove(uid, other) {
    db.prepare("DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)").run(uid, other, other, uid);
    return { ok: true };
  }
  function block(uid, other) {
    if (other === uid) throw err(400, "Impossible.");
    remove(uid, other);
    db.prepare("INSERT INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'blocked', ?)").run(uid, other, iso());
    // Les défis communs en attente sont retirés
    db.prepare("DELETE FROM challenge_participants WHERE user_id = ? AND status = 'invited' AND challenge_id IN (SELECT id FROM challenges WHERE creator_id = ?)").run(other, uid);
    return { ok: true };
  }
  const unblock = (uid, other) => { db.prepare("DELETE FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'blocked'").run(uid, other); return { ok: true }; };
  function acceptInvite(uid, code) {
    const u = typeof code === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(code) ? db.prepare("SELECT id, name, username FROM users WHERE invite_code = ?").get(code) : null;
    if (!u) throw err(404, "Ce lien d'invitation n'est plus valable.");
    if (u.id === uid) throw err(400, "C'est ton propre lien d'invitation : envoie-le à tes amis 🙂");
    if (rel(u.id, uid) === "blocked" || rel(uid, u.id) === "blocked") throw err(404, "Ce lien d'invitation n'est plus valable.");
    makeFriends(uid, u.id); // le lien a été partagé exprès : pas de demande à accepter
    return { friend: { id: u.id, name: u.name || u.username } };
  }
  function resetInvite(uid) { db.prepare("UPDATE users SET invite_code = NULL WHERE id = ?").run(uid); return { invite: ensureInvite(uid) }; }
  function settings(uid, b) { if (typeof b.shareStats === "boolean") db.prepare("UPDATE users SET share_stats = ? WHERE id = ?").run(b.shareStats ? 1 : 0, uid); return { ok: true }; }

  // ---------- Défis ----------
  function createChallenge(uid, b) {
    const T = TYPES[b.type];
    if (!T) throw err(400, "Type de défi inconnu.");
    const mode = T.modes.includes(b.mode) ? b.mode : T.modes[0];
    const days = DAYS.includes(Number(b.days)) ? Number(b.days) : null;
    if (!days) throw err(400, "Durée : 3, 7 ou 14 jours.");
    const lang = b.lang === "all" || b.lang == null ? null : LANGS.includes(b.lang) ? b.lang : undefined;
    if (lang === undefined || (T.needLang && !lang)) throw err(400, "Choisis la langue du défi.");
    let target = null;
    if (mode === "coop") { target = Number(b.target); if (!T.targets.includes(target)) throw err(400, "Objectif invalide."); }
    let ref = null, refTitle = null;
    if (T.needRef) {
      if (!REF_RE.test(String(b.ref || "")) || !String(b.ref).startsWith(`${lang}-`)) throw err(400, "Choisis le chapitre.");
      ref = b.ref; refTitle = String(b.refTitle || "").slice(0, 120) || ref;
    }
    const friends = [...new Set((Array.isArray(b.friends) ? b.friends : []).map(Number))];
    if (!friends.length || friends.length > 5) throw err(400, "Invite de 1 à 5 amis.");
    if (mode === "duel" && friends.length !== 1) throw err(400, "Un duel se joue à deux : invite un seul ami.");
    if (!friends.every((f) => areFriends(uid, f))) throw err(403, "Tu ne peux inviter que tes amis.");
    const active = db.prepare("SELECT count(*) n FROM challenges WHERE creator_id = ? AND end_day >= ?").get(uid, dayOf()).n;
    if (active >= 10) throw err(429, "Tu as déjà 10 défis en cours : termine-en quelques-uns d'abord.");
    const start = dayOf(), t = iso();
    const id = Number(db.prepare("INSERT INTO challenges (creator_id, type, mode, lang, target, ref, ref_title, days, start_day, end_day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(uid, b.type, mode, lang, target, ref, refTitle, days, start, addDays(start, days - 1), t).lastInsertRowid);
    const baseline = (u) => (b.type === "solid" ? solidCount(u, lang) : null);
    db.prepare("INSERT INTO challenge_participants (challenge_id, user_id, status, baseline, joined_at) VALUES (?, ?, 'joined', ?, ?)").run(id, uid, baseline(uid), t);
    for (const f of friends) db.prepare("INSERT INTO challenge_participants (challenge_id, user_id, status) VALUES (?, ?, 'invited')").run(id, f);
    return { challenge: view(db.prepare("SELECT * FROM challenges WHERE id = ?").get(id), uid) };
  }
  function answerChallenge(uid, id, accept) {
    const p = db.prepare("SELECT * FROM challenge_participants WHERE challenge_id = ? AND user_id = ?").get(id, uid);
    const c = db.prepare("SELECT * FROM challenges WHERE id = ?").get(id);
    if (!p || !c || p.status !== "invited") throw err(404, "Invitation introuvable.");
    if (dayOf() > c.end_day) throw err(400, "Ce défi est déjà terminé.");
    if (accept) db.prepare("UPDATE challenge_participants SET status = 'joined', baseline = ?, joined_at = ? WHERE challenge_id = ? AND user_id = ?").run(c.type === "solid" ? solidCount(uid, c.lang) : null, iso(), id, uid);
    else db.prepare("UPDATE challenge_participants SET status = 'declined' WHERE challenge_id = ? AND user_id = ?").run(id, uid);
    return { challenge: view(c, uid) };
  }
  function leaveChallenge(uid, id) {
    const c = db.prepare("SELECT * FROM challenges WHERE id = ?").get(id);
    if (!c) throw err(404, "Défi introuvable.");
    db.prepare("UPDATE challenge_participants SET status = 'left' WHERE challenge_id = ? AND user_id = ?").run(id, uid);
    // Plus personne : le défi disparaît
    if (!db.prepare("SELECT 1 FROM challenge_participants WHERE challenge_id = ? AND status IN ('joined', 'invited')").get(id)) db.prepare("DELETE FROM challenges WHERE id = ?").run(id);
    return { ok: true };
  }

  // ---------- Routeur ----------
  async function handle(route, uid, readJson, req) {
    const num = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw err(400, "Requête invalide."); return n; };
    if (route === "GET /api/friends") return overview(uid);
    let m = route.match(/^POST \/api\/(friends|challenges)\/([a-z-]+|\d+)(?:\/([a-z]+))?$/);
    if (!m) throw err(404, "Route inconnue.");
    const b = await readJson(req);
    const [, area, a, verb] = m;
    if (area === "friends") {
      if (a === "username") return { username: setUsername(uid, b.username) };
      if (a === "request") return request(uid, b.username);
      if (a === "respond") return respond(uid, num(b.id), !!b.accept);
      if (a === "remove") return remove(uid, num(b.id));
      if (a === "block") return block(uid, num(b.id));
      if (a === "unblock") return unblock(uid, num(b.id));
      if (a === "invite") return acceptInvite(uid, b.code);
      if (a === "invite-reset") return resetInvite(uid);
      if (a === "settings") return settings(uid, b);
    }
    if (area === "challenges") {
      if (a === "new") return createChallenge(uid, b);
      if (/^\d+$/.test(a) && verb === "respond") return answerChallenge(uid, num(a), !!b.accept);
      if (/^\d+$/.test(a) && verb === "leave") return leaveChallenge(uid, num(a));
    }
    throw err(404, "Route inconnue.");
  }

  return { handle, overview, pendingCount, areFriends, measure, solidCount, dayOf, addDays, TYPES, USERNAME_RE };
}

module.exports = { create, TYPES };
