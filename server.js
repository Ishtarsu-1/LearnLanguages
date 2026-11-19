// ============================================================
//  Mochi — serveur : fichiers statiques + API des comptes
//  Node ≥ 22.5, aucune dépendance (node:sqlite, node:crypto).
//  Lancer : node server.js   (PORT=8000, DATA_DIR=./data, COOKIE_SECURE=1 derrière HTTPS)
// ============================================================
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const net = require("node:net");
const { DatabaseSync } = require("node:sqlite");
const llm = require("./llm.js");
const ttsMod = require("./tts.js");
const hw = require("./hardware.js");
const mailer = require("./mailer.js");
const { MISSIONS } = require("./missions.js");
const contentAdminMod = require("./content-admin.js");
const socialMod = require("./social.js");
const liveMod = require("./live.js");
const ctfMod = require("./ctf-server.js");
const push = require("./push.js");

const PORT = Number(process.env.PORT) || 8000;
const ROOT = __dirname;
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const AVATAR_DIR = path.join(DATA, "avatars");
const SECURE = process.env.COOKIE_SECURE === "1";
// Proxys de confiance (ex. Caddy sur la même machine : 127.0.0.1,::1). Vide : on ne lit jamais X-Forwarded-For.
const TRUST_PROXY = new Set(String(process.env.TRUST_PROXY || "").split(",").map((s) => normIp(s.trim())).filter(Boolean));
// En production derrière un proxy, le serveur n'écoute que la machine elle-même
// (sinon : comportement par défaut de Node, toutes les interfaces IPv4 et IPv6)
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "127.0.0.1" : undefined);
// Adresse publique du site, pour les liens envoyés par e-mail. Jamais déduite de l'en-tête
// Host (un attaquant pourrait sinon faire pointer le lien de réinitialisation vers son site).
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const SESSION_DAYS = 30;
const MAX_STATE = 8 * 1024 * 1024;
const MAX_AVATAR = 1024 * 1024;
const LLM_ON = process.env.MOCHI_LLM !== "off";
// Interrupteur de l'IA (tableau de bord admin) : MOCHI_LLM=off la coupe pour de bon ; sinon l'admin
// peut la mettre en pause (machine trop lente pour Ollama). Réglage gardé dans DATA_DIR/settings.json.
const SETTINGS_FILE = path.join(DATA, "settings.json");
const settings = (() => { try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")); } catch { return {}; } })();
const llmOn = () => LLM_ON && settings.llm !== false;
const LLM_DAILY = Number(process.env.MOCHI_LLM_DAILY) || 30; // corrections par compte et par jour (coût)
const LLM_GLOBAL_DAILY = Number(process.env.MOCHI_LLM_GLOBAL_DAILY) || 500; // appels à l'IA par jour, tout le site
const LLM_CACHE_DAYS = 90;
const EMOJIS = ["mochi", "🐰", "🐱", "🐻", "🐼", "🦊", "🐥", "🐸", "🐨"]; // "mochi" : la mascotte (défaut)

fs.mkdirSync(AVATAR_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA, "mochi.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    avatar_emoji TEXT NOT NULL DEFAULT '🐰',
    avatar_file TEXT,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT ''
  );
  -- Ancien format (un seul bloc JSON) : lu une fois pour migrer, plus écrit
  CREATE TABLE IF NOT EXISTS user_state (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Synchronisation par événements. Chaque écriture porte un numéro de révision
  -- (rev) croissant par utilisateur : un appareil demande « tout ce qui a changé
  -- depuis la rev N ».
  -- Réglages et petites valeurs : la modification la plus récente gagne, clé par clé
  CREATE TABLE IF NOT EXISTS sync_kv (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL, rev INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  -- Cartes : la version la plus récente gagne, carte par carte (data = 'null' : supprimée)
  CREATE TABLE IF NOT EXISTS sync_cards (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, rev INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  -- Historique des révisions : ajout seul, jamais modifié (sert aussi à optimiser FSRS)
  CREATE TABLE IF NOT EXISTS review_logs (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL, card_id TEXT NOT NULL, data TEXT NOT NULL, rev INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  -- Compteurs additifs (XP, temps, activité par jour) : chaque appareil envoie des deltas
  CREATE TABLE IF NOT EXISTS sync_counters (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL, value REAL NOT NULL, rev INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  -- Quota d'appels au correcteur LLM
  CREATE TABLE IF NOT EXISTS llm_usage (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL, count INTEGER NOT NULL,
    PRIMARY KEY (user_id, day)
  );
  -- Plafond global et suivi du coût de l'IA (tout le site, par jour)
  CREATE TABLE IF NOT EXISTS llm_global (
    day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, cache_hits INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0
  );
  -- Cache des corrections : une même phrase pour le même exercice n'appelle l'IA qu'une fois
  CREATE TABLE IF NOT EXISTS llm_cache (
    key TEXT PRIMARY KEY, response_json TEXT NOT NULL, created_at TEXT NOT NULL
  );
  -- Limitation des tentatives (connexion, inscription, correcteur) : survit aux redémarrages
  CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL, blocked_until INTEGER NOT NULL DEFAULT 0
  );
  -- Retours des testeurs (formulaire « Donner mon avis ») : copie en base, en plus de l'e-mail
  CREATE TABLE IF NOT EXISTS push_subs (
    endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    p256dh TEXT NOT NULL, auth TEXT NOT NULL, hour INTEGER NOT NULL, days TEXT NOT NULL, tz TEXT NOT NULL,
    last_sent TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS site_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, user_id INTEGER, kind TEXT NOT NULL, rating INTEGER,
    message TEXT NOT NULL, page TEXT, lang TEXT, contact TEXT, user_agent TEXT, mailed_at TEXT, mail_error TEXT, parts TEXT
  );
  CREATE INDEX IF NOT EXISTS sync_kv_rev ON sync_kv (user_id, rev);
  CREATE INDEX IF NOT EXISTS sync_cards_rev ON sync_cards (user_id, rev);
  CREATE INDEX IF NOT EXISTS review_logs_rev ON review_logs (user_id, rev);
  CREATE INDEX IF NOT EXISTS sync_counters_rev ON sync_counters (user_id, rev);
`);
// Migration : plusieurs sujets par retour (JSON [{ kind, message }])
if (!db.prepare("PRAGMA table_info(site_feedback)").all().some((c) => c.name === "parts")) db.exec("ALTER TABLE site_feedback ADD COLUMN parts TEXT");
// Migration : colonnes de synchro sur users
const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userCols.includes("sync_rev")) db.exec("ALTER TABLE users ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0");
// Acceptation des conditions d'utilisation et de la politique de confidentialité (date + version)
if (!userCols.includes("terms_version")) db.exec("ALTER TABLE users ADD COLUMN terms_version TEXT");
if (!userCols.includes("terms_accepted_at")) db.exec("ALTER TABLE users ADD COLUMN terms_accepted_at TEXT");
if (!userCols.includes("is_admin")) db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"); // attribué par tools/admin.js
if (!userCols.includes("email_verified_at")) db.exec("ALTER TABLE users ADD COLUMN email_verified_at TEXT");
db.exec(`CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,          -- 'reset' (30 min) ou 'verify' (7 jours)
  expires_at TEXT NOT NULL
)`);
db.prepare("DELETE FROM email_tokens WHERE expires_at < ?").run(new Date().toISOString());
if (!userCols.includes("sync_epoch")) db.exec("ALTER TABLE users ADD COLUMN sync_epoch INTEGER NOT NULL DEFAULT 0");
db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());

// Moteurs (voix, Ollama) : état et latence mesurés au préchauffage, pour l'adaptation (lot 8.4)
// et le bloc « Machine » de l'admin. machine : matériel de CE serveur (jamais celui des visiteurs).
const engines = { tts: {}, llm: null, ttsSlow: false, llmSlow: false };
const machine = { basic: null, report: null, at: null };
const TTS_SLOW_MS = 3000, LLM_SLOW_MS = 20000;

// ---------- Utilitaires ----------
// Adresse IP du client, pour la limitation des tentatives.
// Derrière un proxy, req.socket.remoteAddress est celle du proxy pour tout le monde :
// on lit alors la DERNIÈRE entrée de X-Forwarded-For (ajoutée par notre proxy ; les
// premières peuvent être inventées par le client). IPv6 : regroupées par /64.
function normIp(a) {
  a = String(a || "").trim();
  if (a.startsWith("::ffff:") && net.isIPv4(a.slice(7))) a = a.slice(7);
  return a;
}
function ipKey(a) {
  if (!net.isIPv6(a)) return a;
  // Développe « :: » pour obtenir les 8 groupes, puis garde les 4 premiers (préfixe /64)
  const [head, tail = ""] = a.toLowerCase().split("::");
  const h = head ? head.split(":") : [], t = tail ? tail.split(":") : [];
  const groups = a.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}
let warnedXff = false;
// TRUST_CF=1 (bêta derrière cloudflared) : l'IP du visiteur est lue dans CF-Connecting-IP, posé par
// Cloudflare. À n'activer QUE si le site n'est joignable que par le tunnel (HOST=127.0.0.1) : sinon
// n'importe qui pourrait inventer cet en-tête. Toujours exigé : la requête vient d'un proxy de confiance.
const TRUST_CF = process.env.TRUST_CF === "1";
function clientIp(req, trusted = TRUST_PROXY, trustCf = TRUST_CF) {
  const peer = normIp(req.socket?.remoteAddress) || "?";
  const cf = trustCf && trusted.has(peer) ? normIp(String(req.headers["cf-connecting-ip"] || "")) : "";
  if (cf && net.isIP(cf)) return ipKey(cf);
  const xff = req.headers["x-forwarded-for"];
  if (xff && trusted.has(peer)) {
    const last = normIp(String(xff).split(",").pop());
    if (net.isIP(last)) return ipKey(last);
  } else if (xff && !trusted.size && !warnedXff) {
    warnedXff = true;
    console.warn("⚠️  X-Forwarded-For reçu mais TRUST_PROXY n'est pas défini : l'en-tête est ignoré (voir SETUP.md, mise en ligne derrière Caddy).");
  }
  return ipKey(peer);
}
const now = () => new Date().toISOString();
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

// Vraies voix (facultatif, voir tts.js) et fonctionnalités annoncées au client
const tts = ttsMod.create({ dir: path.join(DATA, "tts") });
// Jetons envoyés par e-mail : aléatoires, stockés hachés, à usage unique
const mail = mailer.create();
// Amis et défis (social.js) : tables créées au démarrage
const social = socialMod.create(db);
// Duel en direct (live.js) : parties en mémoire, temps réel par Server-Sent Events
const live = liveMod.create({ social, db });
const TOKEN_TTL = { reset: 30 * 60e3, verify: 7 * 864e5 };
function issueToken(userId, kind) {
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM email_tokens WHERE user_id = ? AND kind = ?").run(userId, kind); // un seul lien valide à la fois
  db.prepare("INSERT INTO email_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)").run(sha256(token), userId, kind, new Date(Date.now() + TOKEN_TTL[kind]).toISOString());
  return token;
}
function consumeToken(token, kind) {
  if (typeof token !== "string" || token.length > 100) return null;
  const row = db.prepare("SELECT * FROM email_tokens WHERE token_hash = ? AND kind = ? AND expires_at > ?").get(sha256(token), kind, new Date().toISOString());
  if (!row) return null;
  db.prepare("DELETE FROM email_tokens WHERE token_hash = ?").run(row.token_hash);
  return row.user_id;
}
// Envoi en arrière-plan : la réponse HTTP ne dépend ni du succès ni de la durée de l'envoi
function sendMail(user, kind) {
  const token = issueToken(user.id, kind);
  const link = `${PUBLIC_URL}/#/${kind === "reset" ? "reinitialiser" : "verifier"}/${token}`;
  const m = mailer.mails[kind](user.name, link);
  mail.send({ to: user.email, ...m }).catch((e) => console.error("E-mail :", e.message));
}
// Version des textes légaux acceptés à l'inscription (à changer quand ils évoluent : legal.js)
const TERMS_VERSION = "2026-11-18";
// Minimisation (RGPD) : les données temporaires sont purgées toutes les heures, pas seulement au démarrage
function purgeExpired() {
  const t = new Date().toISOString();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(t);
  db.prepare("DELETE FROM email_tokens WHERE expires_at < ?").run(t);
  db.prepare("DELETE FROM login_attempts WHERE window_start < ?").run(Date.now() - 86400e3); // IP et e-mails : 24 h max
  db.prepare("DELETE FROM llm_usage WHERE day < ?").run(new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)); // compteurs : 90 jours
  db.prepare("DELETE FROM llm_global WHERE day < ?").run(new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10));
  db.prepare("DELETE FROM llm_cache WHERE created_at < ?").run(new Date(Date.now() - LLM_CACHE_DAYS * 864e5).toISOString());
}
purgeExpired();
setInterval(purgeExpired, 3600e3).unref();
// ---------- Coût de l'IA : plafond global, cache ----------
const today = () => now().slice(0, 10);
const globalRow = () => db.prepare("SELECT * FROM llm_global WHERE day = ?").get(today()) || { calls: 0, cache_hits: 0, cost: 0 };
const globalBump = (col, n = 1) => db.prepare(`INSERT INTO llm_global (day, ${col}) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET ${col} = ${col} + excluded.${col}`).run(today(), n);
// Réserve un appel sur le plafond global (false : plafond atteint, l'IA fait une pause jusqu'à minuit UTC)
function globalReserve() {
  if (globalRow().calls >= LLM_GLOBAL_DAILY) return false;
  globalBump("calls");
  return true;
}
const LLM_PAUSE = "Le correcteur IA fait une pause pour aujourd'hui, voici la correction simplifiée.";
const normText = (t) => String(t ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
const cacheKey = (b) => sha256(JSON.stringify([normText(b.text), normText(b.prompt), normText(b.who), normText(b.register), normText(b.reference), b.lang, llm.PROMPT_VERSION, llm.ENGINE, llm.MODEL]));
// ttsSlow / llmSlow : mesurés au préchauffage (lot 8.4). Rien d'autre sur la machine n'est exposé ici.
// Langues stables (accueil : en haut) ; les autres sont « Expérimentales » (section « En test »)
const STABLE_LANGS = String(process.env.MOCHI_LANGS_STABLE || "en,ko").split(",").map((l) => l.trim()).filter(Boolean);
// Version portable (tools/portable.js) : un seul utilisateur sur sa machine, pas d'amis ni de comptes
const PORTABLE = process.env.MOCHI_PORTABLE === "1";
// Version portable avec --with-feedback : les avis sont relayés au site de bêta (qui envoie l'e-mail
// avec SA clé : aucun secret dans le paquet). Échec (site éteint, hors ligne) : on réessaie plus tard.
const RELAY = PORTABLE && /^https?:\/\/[^/\s]+$/.test(process.env.FEEDBACK_ENDPOINT || "") ? process.env.FEEDBACK_ENDPOINT : null;
let relaying = false;
async function relayFeedback(fetchImpl = fetch) {
  if (!RELAY || relaying) return;
  relaying = true;
  try {
    for (const r of db.prepare("SELECT * FROM site_feedback WHERE mailed_at IS NULL ORDER BY id LIMIT 20").all()) {
      const body = { parts: r.parts ? JSON.parse(r.parts) : [{ kind: r.kind.split(",")[0], message: r.message }], rating: r.rating, contact: r.contact, page: r.page, lang: r.lang, source: "portable" };
      try {
        const res = await fetchImpl(`${RELAY}/api/feedback-site`, { method: "POST", headers: { "Content-Type": "application/json", "X-Mochi": "1" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
        if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
        // 4xx (avis refusé par le site) : inutile de réessayer, on garde la raison
        db.prepare("UPDATE site_feedback SET mailed_at = ?, mail_error = ? WHERE id = ?").run(now(), res.ok ? null : `refusé par le site (HTTP ${res.status})`, r.id);
      } catch (e) { db.prepare("UPDATE site_feedback SET mail_error = ? WHERE id = ?").run(`en attente : ${e.message}`.slice(0, 300), r.id); break; }
    }
  } finally { relaying = false; }
}
// Mini-CTF pour débutants (version portable --ctf seulement, sur 127.0.0.1 : voir ctf-server.js)
const ctf = ctfMod.create({ portable: PORTABLE, host: HOST });
// Rappels Web Push (v0.6, lot 3.3) : clés VAPID dans .env (npm run doctor -- --write les crée)
const VAPID = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && !PORTABLE
  ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject: process.env.VAPID_SUBJECT || (process.env.FEEDBACK_TO ? `mailto:${process.env.FEEDBACK_TO}` : "mailto:mochi@localhost") } : null;
// Envoie les rappels dus (appelé toutes les 5 minutes) : au plus 1 par jour et par appareil, à l'heure
// choisie, jamais un jour exclu, ni si la séance du jour est faite, ni si l'objectif de la semaine
// est atteint (jour de repos, §16).
async function sendReminders(now = new Date(), sender = (s, m) => push.send(s, m, VAPID)) {
  if (!VAPID) return { sent: 0 };
  let sent = 0;
  for (const s of db.prepare("SELECT * FROM push_subs").all()) {
    const practicedOn = (date) => !!db.prepare("SELECT 1 FROM sync_kv WHERE user_id = ? AND key LIKE 'langs.%.fullDays.' || ? AND value = 'true'").get(s.user_id, date);
    const d = push.decide(s, now, {
      practiced: practicedOn,
      weekDone: (dates) => dates.filter(practicedOn).length,
      due: (iso) => db.prepare("SELECT count(*) n FROM sync_cards WHERE user_id = ? AND json_extract(data, '$.deleted') IS NULL AND json_extract(data, '$.fsrs.due') <= ?").get(s.user_id, iso).n,
    });
    if (!d) continue;
    db.prepare("UPDATE push_subs SET last_sent = ? WHERE endpoint = ?").run(d.date, s.endpoint); // une fois par jour, même en cas d'échec
    try {
      const r = await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, d.message);
      if (r.gone) db.prepare("DELETE FROM push_subs WHERE endpoint = ?").run(s.endpoint); else sent++;
    } catch (e) { console.error(`[${new Date().toISOString()}] Rappel : ${e.message}`); }
  }
  return { sent };
}
const featuresJson = (loggedIn = true) => JSON.stringify({ ctf: ctf.on, portable: PORTABLE, relay: !!RELAY, push: VAPID ? VAPID.publicKey : null, stable: STABLE_LANGS, llm: loggedIn && llmOn(), engine: llm.ENGINE, tts: tts.info(), mail: mail.mode, ttsSlow: !!engines.ttsSlow, llmSlow: !!engines.llmSlow });

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return new Promise((ok, ko) => crypto.scrypt(pw, salt, 64, (e, key) => (e ? ko(e) : ok(`scrypt$${salt.toString("hex")}$${key.toString("hex")}`))));
}
function verifyPassword(pw, stored) {
  const [, saltHex, keyHex] = stored.split("$");
  const expected = Buffer.from(keyHex, "hex");
  return new Promise((ok) => crypto.scrypt(pw, Buffer.from(saltHex, "hex"), expected.length, (e, key) => ok(!e && crypto.timingSafeEqual(key, expected))));
}
// Hash factice pour que « email inconnu » et « mauvais mot de passe » prennent le même temps
const DUMMY_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

function send(res, status, body, headers = {}) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(json);
}
const fail = (res, status, error, headers) => send(res, status, { error }, headers);

function readBody(req, limit) {
  return new Promise((ok, ko) => {
    const tooLarge = () => Object.assign(new Error("too large"), { status: 413 });
    if (Number(req.headers["content-length"]) > limit) return ko(tooLarge());
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { chunks.length = 0; return ko(tooLarge()); } // on laisse le reste s'écouler sans le garder
      chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", ko);
  });
}
async function readJson(req, limit = 64 * 1024) {
  const buf = await readBody(req, limit);
  try { return JSON.parse(buf.toString("utf8") || "{}"); } catch { throw Object.assign(new Error("bad json"), { status: 400 }); }
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
}
function sessionCookie(token, maxAge) {
  return `mochi_sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE ? "; Secure" : ""}`;
}

function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, avatar_emoji: u.avatar_emoji,
    avatar_url: u.avatar_file ? `/avatars/${u.avatar_file}` : null,
    created_at: u.created_at, last_login_at: u.last_login_at, email_verified: !!u.email_verified_at, is_admin: !!u.is_admin,
    username: u.username || null, social_pending: social.pendingCount(u.id),
  };
}

function createSession(res, userId, req) {
  const token = crypto.randomBytes(32).toString("base64url");
  const t = now();
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
    .run(sha256(token), userId, t, t, new Date(Date.now() + SESSION_DAYS * 864e5).toISOString(), String(req.headers["user-agent"] || "").slice(0, 200));
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(t, userId);
  res.setHeader("Set-Cookie", sessionCookie(token, SESSION_DAYS * 86400));
}
function currentSession(req) {
  const token = cookies(req).mochi_sid;
  if (!token) return null;
  const s = db.prepare("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?").get(sha256(token), now());
  if (!s) return null;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(s.user_id);
  if (!user) return null;
  // On ne réécrit last_seen_at qu'une fois par heure
  if (Date.now() - Date.parse(s.last_seen_at) > 3600e3) db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(now(), s.token_hash);
  return { session: s, user };
}

// Limitation des tentatives, stockée dans SQLite (un redémarrage ne remet rien à zéro).
// Freinage progressif plutôt que blocage sec : après `free` échecs, chaque nouvel échec
// impose une attente qui double (1 s, 2 s, 4 s…) jusqu'à `max`. Une clé par compte
// plafonnée bas empêche de verrouiller durablement le compte de quelqu'un d'autre.
const RATE_LIMITS = {
  "login-ip": { free: 10, max: 15 * 60e3, window: 3600e3 },
  "login-email": { free: 5, max: 60e3, window: 3600e3 },
  signup: { free: 10, max: 15 * 60e3, window: 3600e3 },
  feedback: { free: 10, max: 60e3, window: 60e3, flat: true }, // 10 corrections par minute, pas de rafales
  avis: { free: 4, max: 3600e3, window: 3600e3, flat: true },   // formulaire « Donner mon avis » : 5 par heure et par IP
  friend: { free: 30, max: 3600e3, window: 3600e3, flat: true }, // demandes d'ami, liens d'invitation, défis créés : 30 par heure
  doctor: { free: 1, max: 60e3, window: 60e3, flat: true },    // diagnostic de la machine (admin) : 1 par minute
  forgot: { free: 5, max: 15 * 60e3, window: 3600e3 },        // demandes de réinitialisation (par IP et par adresse)
  verify: { free: 3, max: 15 * 60e3, window: 3600e3 },        // renvois de l'e-mail de vérification
  tts: { free: 40, max: 60e3, window: 60e3, flat: true },      // 40 phrases générées par minute (le cache, lui, est libre)
  "tts-low": { free: 60, max: 60e3, window: 60e3, flat: true }, // préchargement : compté à part, pour ne pas manger le quota des clics
};
db.prepare("DELETE FROM login_attempts WHERE window_start < ?").run(Date.now() - 86400e3);
const attemptGet = db.prepare("SELECT * FROM login_attempts WHERE key = ?");
const attemptPut = db.prepare("INSERT INTO login_attempts (key, count, window_start, blocked_until) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET count = excluded.count, window_start = excluded.window_start, blocked_until = excluded.blocked_until");
const limitOf = (key) => RATE_LIMITS[key.slice(0, key.indexOf(":"))];
// Renvoie le nombre de secondes à attendre (0 = autorisé)
function waitFor(key, t = Date.now()) {
  const a = attemptGet.get(key);
  if (!a || t - a.window_start > limitOf(key).window) return 0;
  return Math.max(0, Math.ceil((a.blocked_until - t) / 1000));
}
function recordAttempt(key, t = Date.now()) {
  const L = limitOf(key), a = attemptGet.get(key);
  const fresh = !a || t - a.window_start > L.window;
  const count = fresh ? 1 : a.count + 1;
  const over = count - L.free;
  const delay = over <= 0 ? 0 : L.flat ? L.window - (t - (fresh ? t : a.window_start)) : Math.min(L.max, 1000 * 2 ** (over - 1));
  attemptPut.run(key, count, fresh ? t : a.window_start, delay ? t + delay : 0);
}
const clearAttempts = (key) => db.prepare("DELETE FROM login_attempts WHERE key = ?").run(key);
const tooMany = (res, secs) => fail(res, 429, `Trop de tentatives, réessaie dans ${secs < 60 ? `${secs} s` : `${Math.ceil(secs / 60)} min`}.`, { "Retry-After": String(secs) });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validCredentials(email, password) {
  if (typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email)) return "Adresse e-mail invalide.";
  if (typeof password !== "string" || password.length < 8) return "Le mot de passe doit faire au moins 8 caractères.";
  if (password.length > 200) return "Mot de passe trop long.";
  return null;
}
const cleanName = (n) => String(n ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40);

// Détection du format d'image par les premiers octets (on ne fait pas confiance au Content-Type)
function imageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}
function removeAvatarFile(file) {
  if (file && /^[a-z0-9-]+\.(jpg|png|webp)$/.test(file)) fs.rm(path.join(AVATAR_DIR, file), { force: true }, () => {});
}

// ---------- Synchronisation ----------
// L'ancien bloc JSON n'est renvoyé que tant que le compte n'a jamais synchronisé (migration)
function legacyState(user) {
  const u = db.prepare("SELECT sync_rev FROM users WHERE id = ?").get(user.id);
  if (u.sync_rev > 0) return "null";
  return db.prepare("SELECT state FROM user_state WHERE user_id = ?").get(user.id)?.state || "null";
}

const isKey = (k) => typeof k === "string" && k.length > 0 && k.length <= 200;
const LIMITS = { kv: 20000, cards: 20000, logs: 50000, counters: 20000 };

function validSync(b) {
  if (!b || typeof b !== "object") return "Données invalides.";
  if (!Number.isInteger(b.cursor) || b.cursor < 0 || !Number.isInteger(b.epoch) || b.epoch < 0) return "Curseur invalide.";
  for (const [name, max] of Object.entries(LIMITS)) {
    if (b[name] === undefined) b[name] = [];
    if (!Array.isArray(b[name]) || b[name].length > max) return `Liste ${name} invalide.`;
  }
  for (const x of b.kv) if (!x || !isKey(x.k) || !Number.isFinite(x.t) || x.v === undefined) return "Valeur invalide.";
  for (const x of b.cards) if (!x || !isKey(x.id) || !Number.isFinite(x.t) || (x.data !== null && (typeof x.data !== "object" || Array.isArray(x.data)))) return "Carte invalide.";
  for (const x of b.logs) if (!x || !isKey(x.id) || !isKey(x.card_id) || !x.data || typeof x.data !== "object") return "Révision invalide.";
  for (const x of b.counters) if (!x || !isKey(x.k) || !Number.isFinite(x.d)) return "Compteur invalide.";
  return null;
}

function syncUser(uid, b) {
  const err = validSync(b);
  if (err) return { error: err };
  const serverNow = Date.now();
  const clampT = (t) => Math.min(t, serverNow); // une horloge en avance ne doit pas gagner pour toujours
  let { sync_rev: rev, sync_epoch: epoch } = db.prepare("SELECT sync_rev, sync_epoch FROM users WHERE id = ?").get(uid);
  let cursor = b.cursor;
  let epochChanged = false;

  db.exec("BEGIN IMMEDIATE");
  try {
    if (b.reset) {
      // Réinitialisation volontaire : on repart de zéro, les autres appareils le verront via l'epoch
      for (const t of ["sync_kv", "sync_cards", "review_logs", "sync_counters", "user_state"]) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(uid);
      epoch++;
      cursor = 0;
    } else if (b.epoch !== epoch) {
      // Le compte a été réinitialisé ailleurs : on ignore les changements de cet appareil
      // et on lui renvoie tout depuis le début.
      epochChanged = true;
      cursor = 0;
    }
    const writes = epochChanged ? 0 : b.kv.length + b.cards.length + b.logs.length + b.counters.length;
    if (writes || b.reset) {
      const r = ++rev;
      const kv = db.prepare(`INSERT INTO sync_kv (user_id, key, value, updated_at, rev) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, rev = excluded.rev
        WHERE excluded.updated_at >= sync_kv.updated_at`);
      for (const x of epochChanged ? [] : b.kv) kv.run(uid, x.k, JSON.stringify(x.v), clampT(x.t), r);
      const card = db.prepare(`INSERT INTO sync_cards (user_id, id, data, updated_at, rev) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (user_id, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, rev = excluded.rev
        WHERE excluded.updated_at >= sync_cards.updated_at`);
      for (const x of epochChanged ? [] : b.cards) card.run(uid, x.id, JSON.stringify(x.data), clampT(x.t), r);
      const log = db.prepare("INSERT OR IGNORE INTO review_logs (user_id, id, card_id, data, rev) VALUES (?, ?, ?, ?, ?)");
      for (const x of epochChanged ? [] : b.logs) log.run(uid, x.id, x.card_id, JSON.stringify(x.data), r);
      const ctr = db.prepare(`INSERT INTO sync_counters (user_id, key, value, rev) VALUES (?, ?, MAX(0, ?), ?)
        ON CONFLICT (user_id, key) DO UPDATE SET value = MAX(0, sync_counters.value + excluded.value), rev = excluded.rev`);
      for (const x of epochChanged ? [] : b.counters) ctr.run(uid, x.k, x.d, r);
      db.prepare("UPDATE users SET sync_rev = ?, sync_epoch = ? WHERE id = ?").run(rev, epoch, uid);
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }

  // Tout ce qui a changé depuis le curseur de l'appareil (y compris ses propres écritures)
  const since = (sql) => db.prepare(sql).all(uid, cursor);
  return {
    epoch, epochChanged, cursor: rev,
    kv: since("SELECT key AS k, value FROM sync_kv WHERE user_id = ? AND rev > ?").map((x) => ({ k: x.k, v: JSON.parse(x.value) })),
    cards: since("SELECT id, data FROM sync_cards WHERE user_id = ? AND rev > ?").map((x) => ({ id: x.id, data: JSON.parse(x.data) })),
    logs: since("SELECT id, data FROM review_logs WHERE user_id = ? AND rev > ?").map((x) => ({ id: x.id, data: JSON.parse(x.data) })),
    counters: since("SELECT key AS k, value AS v FROM sync_counters WHERE user_id = ? AND rev > ?"),
  };
}

// ---------- Contenu : relecture et publication (CONTENU-PIPELINE, lot C6) ----------
// Après une publication : content.data.js est reconstruit (le site le prend au prochain chargement),
// et l'audio des nouvelles phrases est pré-généré en arrière-plan si des voix serveur sont configurées.
const STARTED_AT = new Date().toISOString();
// ---------- Mesurer la bêta (v0.5, lot 4.5) : entonnoir, rétention, abandons ----------
// Calculé à partir des données déjà synchronisées, sans outil externe. Affiché AGRÉGÉ et anonyme :
// des comptes et des pourcentages, jamais de liste nominative d'activité. Les admins sont exclus.
const parisDay = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const plusDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function betaMetrics(today = parisDay(new Date().toISOString())) {
  const users = db.prepare("SELECT id, created_at FROM users WHERE is_admin = 0").all();
  const steps = { signup: 0, lang: 0, read: 0, review: 0, d1: 0, d7: 0 }, elig = { d1: 0, d7: 0 };
  const ret = {}; // langue → { d1: [n, sur], d7: [n, sur] }
  const drop = { before_read: 0, after_read: 0, after_review: 0, complete: 0 };
  for (const u of users) {
    steps.signup++;
    const kv = db.prepare("SELECT key, value FROM sync_kv WHERE user_id = ? AND (key = 'lastLang' OR key LIKE 'langs.%.started' OR key LIKE 'langs.%.readTexts.%')").all(u.id);
    if (kv.some((r) => (r.key === "lastLang" && JSON.parse(r.value)) || (r.key.endsWith(".started") && JSON.parse(r.value) === true))) steps.lang++;
    if (kv.some((r) => r.key.includes(".readTexts."))) steps.read++;
    if (db.prepare("SELECT 1 FROM review_logs WHERE user_id = ? LIMIT 1").get(u.id)) steps.review++;
    // Activité par jour et par langue : compteurs h.<jour>.<langue>.<champ>
    const days = new Set(), byLang = {}, perDay = {};
    for (const r of db.prepare("SELECT key, value FROM sync_counters WHERE user_id = ? AND key LIKE 'h.%' AND value > 0").all(u.id)) {
      const [, day, lang, f] = r.key.split(".");
      days.add(day); (byLang[lang] ||= new Set()).add(day);
      ((perDay[`${day}.${lang}`] ||= {})[f] = r.value);
    }
    const d0 = parisDay(u.created_at);
    if (plusDays(d0, 1) <= today) { elig.d1++; if (days.has(plusDays(d0, 1))) steps.d1++; }
    if (plusDays(d0, 7) <= today) { elig.d7++; if ([...days].some((d) => d >= plusDays(d0, 7))) steps.d7++; }
    for (const [lang, set] of Object.entries(byLang)) {
      const first = [...set].sort()[0], R = (ret[lang] ||= { d1: [0, 0], d7: [0, 0] });
      if (plusDays(first, 1) <= today) { R.d1[1]++; if (set.has(plusDays(first, 1))) R.d1[0]++; }
      if (plusDays(first, 7) <= today) { R.d7[1]++; if ([...set].some((d) => d >= plusDays(first, 7))) R.d7[0]++; }
    }
    // Où s'arrête une séance : lecture → révisions → production
    for (const x of Object.values(perDay)) {
      if (!(x.sec > 0)) continue;
      drop[!x.read ? "before_read" : !x.rev ? "after_read" : !x.prod ? "after_review" : "complete"]++;
    }
  }
  return { steps, elig, retention: ret, drop };
}

// ---------- Retours des testeurs : récapitulatif quotidien (FEEDBACK_MAIL=daily) ----------
// Économise le quota d'e-mails (Resend gratuit : 100 par jour, partagé avec les mots de passe).
// Envoyé une fois par jour, à partir de 19 h (heure de Paris), s'il y a des avis non envoyés.
const FEEDBACK_MAIL = ["each", "daily", "off"].includes(process.env.FEEDBACK_MAIL) ? process.env.FEEDBACK_MAIL : "each";
db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
async function feedbackDigest({ force = false, at = new Date() } = {}) {
  const to = process.env.FEEDBACK_TO;
  if (!to) return { sent: 0 };
  const parisDay = at.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }), hour = Number(at.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Paris" }));
  const last = db.prepare("SELECT value FROM app_meta WHERE key = 'feedback_digest'").get()?.value;
  if (!force && (last === parisDay || hour < 19)) return { sent: 0 };
  const rows = db.prepare("SELECT f.*, u.name, u.email FROM site_feedback f LEFT JOIN users u ON u.id = f.user_id WHERE f.mailed_at IS NULL ORDER BY f.id").all();
  if (!rows.length) return { sent: 0 };
  const m = mailer.feedbackDigest(rows.map((r) => ({ ...r, parts: r.parts ? JSON.parse(r.parts) : [{ kind: r.kind, message: r.message }], date: new Date(r.created_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }) })));
  try {
    await mail.send({ to, ...m });
    const t = now();
    for (const r of rows) db.prepare("UPDATE site_feedback SET mailed_at = ?, mail_error = NULL WHERE id = ?").run(t, r.id);
    db.prepare("INSERT INTO app_meta (key, value) VALUES ('feedback_digest', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(parisDay);
    return { sent: rows.length };
  } catch (e) { console.error("Récapitulatif des retours :", e.message); return { sent: 0, error: e.message }; }
}
const contentAdmin = contentAdminMod.create({
  onPublished: (lang) => {
    spokenCache = null;
    if (!tts.enabled || !tts.info()[lang]) return;
    require("node:child_process").execFile(process.execPath, [path.join(ROOT, "tools", "pregen-tts.js"), "--lang", lang], { cwd: ROOT, env: process.env, timeout: 6 * 3600e3 },
      (e) => { if (e) console.error(`Pré-génération de l'audio (${lang}) :`, e.message); });
  },
});

// ---------- Bloc « Machine » de l'admin (lot 8.5) ----------
// Phrases du site, calculées une fois avec le code du client (spokenSentences) : sert à compter
// ce qui reste à pré-générer.
let spokenCache = null;
function spokenByLang() {
  if (!spokenCache) {
    try { const site = require("./tools/load-site.js").loadSite(ROOT); spokenCache = Object.fromEntries(Object.keys(tts.info()).map((l) => [l, site.run(`spokenSentences(${JSON.stringify(l)})`)])); }
    catch (e) { console.error("Phrases du site :", e.message); spokenCache = {}; }
  }
  return spokenCache;
}
function machineInfo() {
  const b = machine.basic, rec = b ? hw.recommend({ ...b, voices: Object.fromEntries(Object.entries(engines.tts).map(([l, x]) => [l, { configured: true, up: x.ok, ms: x.ms, error: x.error }])), ...(machine.report || {}) }) : null;
  const spoken = spokenByLang();
  const cache = Object.entries(tts.info()).flatMap(([lang, voices]) => voices.map((voice) => {
    const list = spoken[lang] || [], cached = list.filter((t) => tts.cached(lang, voice, t)).length;
    return { lang, voice, cached, total: list.length };
  }));
  return {
    profile: rec?.profile || null, label: rec?.label || null, warnings: machine.report ? rec.warnings : [], at: machine.at,
    cpu: b?.cpu || null, ram: b?.ram || null, gpus: b?.gpus || [], system: b?.system || null,
    engines: { tts: engines.tts, llm: engines.llm, ttsSlow: engines.ttsSlow, llmSlow: engines.llmSlow },
    cache,
  };
}

// ---------- API ----------
async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  // Protection CSRF : toute requête qui modifie quelque chose doit porter cet en-tête
  // (un autre site ne peut pas l'ajouter sans pré-vol CORS, que l'on n'autorise pas).
  if (req.method !== "GET" && req.headers["x-mochi"] !== "1") return fail(res, 403, "Requête refusée.");
  const ip = clientIp(req);

  // Mini-CTF : vérifier un drapeau, obtenir la phrase magique (seulement en mode CTF)
  if (ctf.on && route === "POST /api/ctf/check") return send(res, 200, ctf.checkFlag((await readJson(req, 2048)).flag));
  if (ctf.on && route === "POST /api/ctf/magic") { const p = ctf.magic((await readJson(req, 2048)).flags); return p ? send(res, 200, { phrase: p }) : fail(res, 403, "Il te manque encore un drapeau."); }

  // Santé du service (Uptime Kuma, page de statut) : la base répond-elle ? Aucune donnée personnelle.
  if (route === "GET /api/health" || route === "HEAD /api/health") {
    let dbOk = false;
    try { dbOk = db.prepare("SELECT 1 AS x").get().x === 1; } catch {}
    return send(res, dbOk ? 200 : 503, { ok: dbOk, db: dbOk ? "ok" : "erreur", uptime: Math.round(process.uptime()), started: STARTED_AT });
  }

  if (route === "POST /api/signup") {
    const { email, password, name, accept } = await readJson(req);
    const err = validCredentials(email, password);
    if (err) return fail(res, 400, err);
    if (accept !== true) return fail(res, 400, "Accepte les conditions d'utilisation et la politique de confidentialité pour créer un compte.");
    const wait = waitFor(`signup:${ip}`);
    if (wait) return tooMany(res, wait);
    recordAttempt(`signup:${ip}`); // compte aussi les inscriptions réussies : limite le spam
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email.trim())) return fail(res, 409, "Un compte existe déjà avec cette adresse.");
    const t = now();
    const info = db.prepare("INSERT INTO users (email, pass, name, avatar_emoji, created_at, terms_version, terms_accepted_at) VALUES (?, ?, ?, 'mochi', ?, ?, ?)").run(email.trim(), await hashPassword(password), cleanName(name), t, TERMS_VERSION, t);
    createSession(res, Number(info.lastInsertRowid), req);
    sendMail(db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid), "verify");
    return send(res, 201, { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid)), legacy_state: null, features: JSON.parse(featuresJson()) });
  }

  if (route === "POST /api/login") {
    const { email, password } = await readJson(req);
    if (typeof email !== "string" || typeof password !== "string") return fail(res, 400, "E-mail et mot de passe requis.");
    const keys = [`login-ip:${ip}`, `login-email:${email.toLowerCase()}`];
    const wait = Math.max(...keys.map((k) => waitFor(k)));
    if (wait) return tooMany(res, wait);
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim());
    const good = await verifyPassword(password, user ? user.pass : DUMMY_HASH);
    if (!user || !good) { keys.forEach((k) => recordAttempt(k)); return fail(res, 401, "E-mail ou mot de passe incorrect."); }
    clearAttempts(keys[1]); // l'IP garde son compteur : un attaquant ne le remet pas à zéro avec son propre compte
    createSession(res, user.id, req);
    return send(res, 200, `{"user":${JSON.stringify(publicUser({ ...user, last_login_at: now() }))},"legacy_state":${legacyState(user)},"features":${featuresJson()}}`);
  }

  // Mot de passe oublié : même réponse que l'adresse existe ou non (on ne révèle pas qui est inscrit)
  if (route === "POST /api/password/forgot") {
    const { email } = await readJson(req);
    if (typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email.trim())) return fail(res, 400, "Adresse e-mail invalide.");
    const keys = [`forgot:${ip}`, `forgot:${email.trim().toLowerCase()}`];
    const wait = Math.max(...keys.map((k) => waitFor(k)));
    if (wait) return tooMany(res, wait);
    keys.forEach((k) => recordAttempt(k));
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim());
    if (user) sendMail(user, "reset");
    return send(res, 200, { ok: true });
  }
  if (route === "POST /api/password/reset") {
    const { token, password } = await readJson(req);
    if (typeof password !== "string" || password.length < 8) return fail(res, 400, "Le mot de passe doit faire au moins 8 caractères.");
    if (password.length > 200) return fail(res, 400, "Mot de passe trop long.");
    const uid = consumeToken(token, "reset");
    if (!uid) return fail(res, 400, "Ce lien n'est plus valable. Redemande un e-mail de réinitialisation.");
    // Le lien prouve l'accès à la boîte mail : l'adresse est vérifiée du même coup.
    // Toutes les sessions sont fermées (si le compte était compromis, l'intrus est déconnecté).
    db.prepare("UPDATE users SET pass = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(await hashPassword(password), now(), uid);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(uid);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(uid);
    clearAttempts(`login-email:${user.email.toLowerCase()}`);
    createSession(res, uid, req);
    return send(res, 200, `{"user":${JSON.stringify(publicUser({ ...user, last_login_at: now() }))},"legacy_state":${legacyState(user)},"features":${featuresJson()}}`);
  }
  if (route === "POST /api/email/verify") {
    const { token } = await readJson(req);
    const uid = consumeToken(token, "verify");
    if (!uid) return fail(res, 400, "Ce lien n'est plus valable. Tu peux en demander un nouveau depuis ton profil.");
    db.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(now(), uid);
    return send(res, 200, { ok: true });
  }

  // Retour d'un testeur (« Donner mon avis »)
  // Envoi : FEEDBACK_MAIL=each (un e-mail par avis), daily (récapitulatif, voir feedbackDigest), off. : ouvert aux invités, enregistré, puis envoyé par e-mail
  // à FEEDBACK_TO. Limité par IP. L'adresse de destination ne vient jamais de la requête.
  if (route === "POST /api/feedback-site") {
    const b = await readJson(req, 32 * 1024);
    // Plusieurs sujets dans le même envoi : parts = [{ kind, message }] (ancien format { kind, message } accepté)
    const raw = Array.isArray(b.parts) ? b.parts : [{ kind: b.kind, message: b.message }];
    const parts = [];
    for (const p of raw.slice(0, 8)) {
      const kind = mailer.FEEDBACK_KINDS.includes(p?.kind) ? p.kind : null, message = typeof p?.message === "string" ? p.message.trim() : "";
      if (!kind) return fail(res, 400, "Choisis le type de retour.");
      if (parts.some((x) => x.kind === kind)) return fail(res, 400, "Chaque sujet ne peut apparaître qu'une fois.");
      if (message.length < 3 || message.length > 3000) return fail(res, 400, "Chaque message doit faire entre 3 et 3 000 caractères.");
      parts.push({ kind, message });
    }
    if (!parts.length) return fail(res, 400, "Choisis au moins un sujet.");
    const kind = parts.map((x) => x.kind).join(","), message = parts.map((x) => (parts.length > 1 ? `[${x.kind}] ${x.message}` : x.message)).join("\n\n");
    const rating = Number.isInteger(b.rating) && b.rating >= 1 && b.rating <= 5 ? b.rating : null;
    const contact = typeof b.contact === "string" && b.contact.trim() ? b.contact.trim() : null;
    if (contact && (contact.length > 254 || !EMAIL_RE.test(contact))) return fail(res, 400, "Adresse e-mail de contact invalide.");
    const wait = waitFor(`avis:${ip}`);
    if (wait) return tooMany(res, wait);
    recordAttempt(`avis:${ip}`);
    const who = currentSession(req)?.user || null;
    const source = ["portable", "mobile"].includes(b.source) ? b.source : null;
    const page = typeof b.page === "string" || source ? `${source ? `[${source}] ` : ""}${typeof b.page === "string" ? b.page : ""}`.slice(0, 200) : null, lang = ["en", "ko", "zh", "ru"].includes(b.lang) ? b.lang : null;
    const ua = String(req.headers["user-agent"] || "").slice(0, 300), at = now();
    const id = Number(db.prepare("INSERT INTO site_feedback (created_at, user_id, kind, rating, message, page, lang, contact, user_agent, parts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(at, who?.id ?? null, kind, rating, message, page, lang, contact, ua, JSON.stringify(parts)).lastInsertRowid);
    const to = process.env.FEEDBACK_TO;
    if (to && FEEDBACK_MAIL === "each") {
      const m = mailer.feedbackMail({ id, parts, rating, page, lang: lang && { en: "anglais", ko: "coréen", zh: "chinois", ru: "russe" }[lang], contact, userAgent: ua, name: who?.name, email: who?.email,
        date: new Date(at).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }) });
      mail.send({ to, ...m, replyTo: contact || who?.email || undefined })
        .then(() => db.prepare("UPDATE site_feedback SET mailed_at = ? WHERE id = ?").run(now(), id))
        .catch((e) => { console.error("Retour testeur, e-mail :", e.message); db.prepare("UPDATE site_feedback SET mail_error = ? WHERE id = ?").run(e.message.slice(0, 300), id); });
    }
    if (RELAY) relayFeedback(); // version portable : transmis au site de bêta (ou plus tard)
    return send(res, 201, { ok: true, id });
  }
  // Version portable : tous les avis enregistrés sur cet ordinateur, en fichier à envoyer à la main
  if (route === "GET /api/feedback-export" && PORTABLE) {
    const rows = db.prepare("SELECT created_at, kind, rating, parts, message, page, lang, contact, mailed_at sent_at FROM site_feedback ORDER BY id").all()
      .map(({ parts, ...r }) => ({ ...r, parts: parts ? JSON.parse(parts) : null }));
    return send(res, 200, { mochi: "avis", exported_at: now(), count: rows.length, avis: rows }, { "Content-Disposition": 'attachment; filename="mochi-avis.json"' });
  }

  // Voix serveur : ouvertes aux invités aussi. Le cache est servi librement,
  // seule la génération (qui coûte du calcul) est limitée par IP.
  if (route === "GET /api/tts") {
    const lang = url.searchParams.get("lang"), voice = url.searchParams.get("voice"), text = url.searchParams.get("text");
    const bad = tts.check(lang, voice, text);
    if (bad) return fail(res, 400, bad);
    let file = tts.cached(lang, voice, text);
    if (!file) {
      // p=low : préchargement (prefetchAudio). Passe après les clics, limité à part,
      // et refusé si la file du moteur est déjà longue.
      const low = url.searchParams.get("p") === "low", key = `${low ? "tts-low" : "tts"}:${ip}`;
      if (low && tts.waiting(lang, "low") > 20) return fail(res, 503, "Le moteur de voix est occupé, réessaie plus tard.", { "Retry-After": "30" });
      const wait = waitFor(key);
      if (wait) return tooMany(res, wait);
      recordAttempt(key);
      // La génération n'est pas liée à la requête : si le client abandonne (repli sur la voix
      // de l'appareil après quelques secondes), le fichier arrive quand même dans le cache.
      try { file = await tts.generate(lang, voice, text, low ? "low" : "high"); }
      catch (e) {
        if (e.cacheMiss) return fail(res, 404, "Pas d'audio pour cette phrase."); // version portable : voix du navigateur
        console.error("TTS :", e.message); return fail(res, 502, "Le moteur de voix ne répond pas.");
      }
      if (res.destroyed) return;
    }
    return serveFile(res, file, ttsMod.typeOf(file), "private, max-age=31536000, immutable");
  }

  // --- Routes authentifiées ---
  const auth = currentSession(req);
  if (route === "GET /api/me") {
    if (!auth) return send(res, 200, `{"user":null,"features":${featuresJson(false)}}`);
    return send(res, 200, `{"user":${JSON.stringify(publicUser(auth.user))},"legacy_state":${legacyState(auth.user)},"features":${featuresJson()}}`);
  }
  if (!auth) return fail(res, 401, "Connecte-toi d'abord.");
  const uid = auth.user.id;

  if (route === "POST /api/logout") {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(auth.session.token_hash);
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
  }
  if (route === "POST /api/feedback") {
    if (!llmOn()) return fail(res, 503, "Correcteur désactivé.");
    const b = await readJson(req);
    const str = (v, max) => typeof v === "string" && v.length <= max;
    if (!["en", "ko", "zh", "ru"].includes(b.lang) || !str(b.prompt, 300) || !str(b.text, 500) || !b.text.trim()
      || (b.who != null && !str(b.who, 80)) || (b.register != null && !str(b.register, 30)) || (b.reference != null && !str(b.reference, 300))) {
      return fail(res, 400, "Requête invalide.");
    }
    const wait = waitFor(`feedback:${uid}`);
    if (wait) return tooMany(res, wait);
    recordAttempt(`feedback:${uid}`);
    const day = today();
    const used = db.prepare("SELECT count FROM llm_usage WHERE user_id = ? AND day = ?").get(uid, day)?.count || 0;
    const input = { lang: b.lang, prompt: b.prompt, who: b.who || null, register: b.register || null, reference: b.reference || null, text: b.text.trim() };
    // Déjà corrigée : servie depuis le cache, ne décompte ni le quota du compte ni le plafond global
    const key = cacheKey(input);
    const hit = db.prepare("SELECT response_json FROM llm_cache WHERE key = ? AND created_at > ?").get(key, new Date(Date.now() - LLM_CACHE_DAYS * 864e5).toISOString());
    if (hit) {
      globalBump("cache_hits");
      return send(res, 200, { feedback: JSON.parse(hit.response_json), engine: llm.ENGINE, remaining: Math.max(0, LLM_DAILY - used), cached: true });
    }
    if (used >= LLM_DAILY) return fail(res, 429, `Tu as utilisé tes ${LLM_DAILY} corrections du jour. Reviens demain !`);
    if (!globalReserve()) return fail(res, 503, LLM_PAUSE, { "X-Mochi-Llm": "pause" });
    db.prepare("INSERT INTO llm_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1").run(uid, day);
    const meta = {};
    try {
      const feedback = await llm.getFeedback(input, meta);
      db.prepare("INSERT OR REPLACE INTO llm_cache (key, response_json, created_at) VALUES (?, ?, ?)").run(key, JSON.stringify(feedback), now());
      if (meta.usage) globalBump("cost", llm.costOf(meta.usage));
      return send(res, 200, { feedback, engine: llm.ENGINE, remaining: LLM_DAILY - used - 1 });
    } catch (e) {
      // Échec : on ne décompte pas la correction
      db.prepare("UPDATE llm_usage SET count = count - 1 WHERE user_id = ? AND day = ?").run(uid, day);
      globalBump("calls", -1);
      if (meta.usage) globalBump("cost", llm.costOf(meta.usage));
      if (e instanceof llm.LlmUnavailable) return fail(res, 503, e.message);
      throw e;
    }
  }
  // Mode histoire : une réplique de jeu de rôle (compte dans le quota quotidien du correcteur)
  if (route === "POST /api/roleplay") {
    if (!llmOn()) return fail(res, 503, "IA désactivée.");
    const b = await readJson(req);
    const m = typeof b.mission === "string" && Object.hasOwn(MISSIONS, b.mission) ? MISSIONS[b.mission] : null;
    const h = Array.isArray(b.history) ? b.history : null;
    if (!m || !h || !h.length || h.length > 24 || h.at(-1).who !== "me"
      || !h.every((x) => x && (x.who === "me" || x.who === "npc") && typeof x.text === "string" && x.text.trim() && x.text.length <= 300)) {
      return fail(res, 400, "Requête invalide.");
    }
    const wait = waitFor(`feedback:${uid}`);
    if (wait) return tooMany(res, wait);
    recordAttempt(`feedback:${uid}`);
    const day = today();
    const used = db.prepare("SELECT count FROM llm_usage WHERE user_id = ? AND day = ?").get(uid, day)?.count || 0;
    if (used >= LLM_DAILY) return fail(res, 429, `Tu as utilisé tes ${LLM_DAILY} échanges avec l'IA aujourd'hui. Le mode guidé reste disponible !`);
    if (!globalReserve()) return fail(res, 503, "L'IA fait une pause pour aujourd'hui. Le mode guidé reste disponible !", { "X-Mochi-Llm": "pause" });
    db.prepare("INSERT INTO llm_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1").run(uid, day);
    const meta = {};
    try {
      const turn = await llm.roleplay(m, h.map((x) => ({ who: x.who, text: x.text.trim() })), meta);
      if (meta.usage) globalBump("cost", llm.costOf(meta.usage));
      return send(res, 200, { turn, engine: llm.ENGINE, remaining: LLM_DAILY - used - 1 });
    } catch (e) {
      db.prepare("UPDATE llm_usage SET count = count - 1 WHERE user_id = ? AND day = ?").run(uid, day);
      globalBump("calls", -1);
      if (meta.usage) globalBump("cost", llm.costOf(meta.usage));
      if (e instanceof llm.LlmUnavailable) return fail(res, 503, e.message);
      throw e;
    }
  }
  if (route === "POST /api/sync") {
    let body;
    try { body = JSON.parse((await readBody(req, MAX_STATE)).toString("utf8")); } catch { return fail(res, 400, "Données invalides."); }
    const out = syncUser(uid, body);
    if (out.error) return fail(res, 400, out.error);
    return send(res, 200, out);
  }
  if (route === "PATCH /api/me") {
    const body = await readJson(req);
    if (body.name !== undefined) db.prepare("UPDATE users SET name = ? WHERE id = ?").run(cleanName(body.name), uid);
    if (body.avatar_emoji !== undefined) {
      if (!EMOJIS.includes(body.avatar_emoji)) return fail(res, 400, "Avatar inconnu.");
      db.prepare("UPDATE users SET avatar_emoji = ? WHERE id = ?").run(body.avatar_emoji, uid);
    }
    return send(res, 200, { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(uid)) });
  }
  if (route === "POST /api/avatar") {
    const buf = await readBody(req, MAX_AVATAR);
    const ext = imageType(buf);
    if (!ext) return fail(res, 400, "Image non reconnue (JPEG, PNG ou WebP).");
    const file = `${uid}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
    fs.writeFileSync(path.join(AVATAR_DIR, file), buf);
    removeAvatarFile(auth.user.avatar_file);
    db.prepare("UPDATE users SET avatar_file = ? WHERE id = ?").run(file, uid);
    return send(res, 200, { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(uid)) });
  }
  if (route === "DELETE /api/avatar") {
    removeAvatarFile(auth.user.avatar_file);
    db.prepare("UPDATE users SET avatar_file = NULL WHERE id = ?").run(uid);
    return send(res, 200, { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(uid)) });
  }
  if (route === "POST /api/password") {
    const { current, next } = await readJson(req);
    if (!(await verifyPassword(String(current ?? ""), auth.user.pass))) return fail(res, 401, "Mot de passe actuel incorrect.");
    const err = validCredentials(auth.user.email, next);
    if (err) return fail(res, 400, err);
    db.prepare("UPDATE users SET pass = ? WHERE id = ?").run(await hashPassword(next), uid);
    // Déconnecte les autres appareils
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(uid, auth.session.token_hash);
    return send(res, 200, { ok: true });
  }
  if (route === "POST /api/email/resend") {
    if (auth.user.email_verified_at) return send(res, 200, { ok: true, already: true });
    const wait = waitFor(`verify:${uid}`);
    if (wait) return tooMany(res, wait);
    recordAttempt(`verify:${uid}`);
    sendMail(auth.user, "verify");
    return send(res, 200, { ok: true });
  }
  // Duel en direct (live.js)
  if (url.pathname.startsWith("/api/live/")) {
    if (route === "POST /api/live/invite") {
      const wait = waitFor(`friend:${uid}`);
      if (wait) return tooMany(res, wait);
      recordAttempt(`friend:${uid}`);
    }
    try { const r = await live.handle(route, uid, (q) => readJson(q, 4 * 1024), req, res); if (r !== undefined) return send(res, 200, r); return; }
    catch (e) { if (e.expose) return fail(res, e.status, e.message); throw e; }
  }
  // Amis et défis (social.js) : la progression des défis est calculée côté serveur
  if (route === "GET /api/friends" || /^POST \/api\/(friends|challenges)\//.test(route)) {
    if (/^POST \/api\/(friends\/(request|invite)|challenges\/new)$/.test(route)) {
      const wait = waitFor(`friend:${uid}`);
      if (wait) return tooMany(res, wait);
      recordAttempt(`friend:${uid}`);
    }
    try { return send(res, 200, await social.handle(route, uid, (r) => readJson(r, 16 * 1024), req)); }
    catch (e) { if (e.expose) return fail(res, e.status, e.message); throw e; }
  }
  // Relecture et publication du contenu (CONTENU-PIPELINE, lots C6 et C8) : admins uniquement
  if (url.pathname.startsWith("/api/admin/content/")) {
    if (!auth.user.is_admin) return fail(res, 403, "Réservé aux administrateurs.");
    if (route.endsWith("/regenerate") && !llmOn()) return fail(res, 503, "L'IA est en pause : réactive-la dans le tableau de bord pour régénérer.");
    try { return send(res, 200, await contentAdmin.handle(route, req, url, (r) => readJson(r, 256 * 1024), (auth.user.name || auth.user.email.split("@")[0]).toLowerCase())); }
    catch (e) { if (e.expose) return fail(res, e.status, e.message); throw e; }
  }
  // Tableau de bord admin : chiffres globaux, jamais de contenu personnel au-delà de la liste des comptes
  if (route === "GET /api/admin/stats") {
    if (!auth.user.is_admin) return fail(res, 403, "Réservé aux administrateurs.");
    const one = (sql, ...a) => db.prepare(sql).get(...a);
    const t7 = new Date(Date.now() - 7 * 864e5).toISOString(), t30 = new Date(Date.now() - 30 * 864e5).toISOString();
    let ttsFiles = 0, ttsBytes = 0;
    try { for (const f of fs.readdirSync(path.join(DATA, "tts"))) { ttsFiles++; ttsBytes += fs.statSync(path.join(DATA, "tts", f)).size; } } catch {}
    return send(res, 200, {
      users: {
        total: one("SELECT count(*) n FROM users").n,
        verified: one("SELECT count(*) n FROM users WHERE email_verified_at IS NOT NULL").n,
        admins: one("SELECT count(*) n FROM users WHERE is_admin = 1").n,
        new7: one("SELECT count(*) n FROM users WHERE created_at > ?", t7).n,
        new30: one("SELECT count(*) n FROM users WHERE created_at > ?", t30).n,
        active7: one("SELECT count(DISTINCT user_id) n FROM sessions WHERE last_seen_at > ?", t7).n,
      },
      sessions: one("SELECT count(*) n FROM sessions WHERE expires_at > ?", now()).n,
      cards: db.prepare("SELECT json_extract(data, '$.lang') lang, count(*) n FROM sync_cards GROUP BY 1").all(),
      reviews: { total: one("SELECT count(*) n FROM review_logs").n },
      llm: (() => {
        const g = globalRow();
        return { today: g.calls, cacheHits: g.cache_hits, hitRate: g.calls + g.cache_hits ? g.cache_hits / (g.calls + g.cache_hits) : 0, cost: g.cost,
          total: one("SELECT COALESCE(sum(calls), 0) n FROM llm_global").n, engine: llmOn() ? llm.ENGINE : null, provider: llm.ENGINE, paused: LLM_ON && !llmOn(), forcedOff: !LLM_ON, daily: LLM_DAILY, globalDaily: LLM_GLOBAL_DAILY, cacheSize: one("SELECT count(*) n FROM llm_cache").n };
      })(),
      tts: { voices: tts.info(), files: ttsFiles, bytes: ttsBytes },
      machine: machineInfo(),
      mail: mail.mode,
      beta: betaMetrics(),
      feedback: { total: one("SELECT count(*) n FROM site_feedback").n, to: !!process.env.FEEDBACK_TO,
        last: db.prepare("SELECT id, created_at, kind, rating, message, page, mailed_at IS NOT NULL mailed, mail_error FROM site_feedback ORDER BY id DESC LIMIT 20").all() },
      list: db.prepare(`SELECT u.id, u.email, u.name, u.created_at, u.last_login_at, u.email_verified_at IS NOT NULL verified, u.is_admin admin,
          (SELECT count(*) FROM sync_cards c WHERE c.user_id = u.id) cards, (SELECT count(*) FROM review_logs r WHERE r.user_id = u.id) reviews
        FROM users u ORDER BY u.created_at DESC LIMIT 100`).all(),
    });
  }
  // Interrupteur de l'IA (correcteur, missions, régénération des brouillons)
  if (route === "POST /api/admin/llm") {
    if (!auth.user.is_admin) return fail(res, 403, "Réservé aux administrateurs.");
    if (!LLM_ON) return fail(res, 409, "L'IA est coupée par MOCHI_LLM=off dans .env.");
    const body = await readJson(req);
    settings.llm = !!body.on;
    fs.writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
    console.log(`[${new Date().toISOString()}] IA ${settings.llm ? "réactivée" : "mise en pause"} (admin n° ${auth.user.id})`);
    return send(res, 200, { on: llmOn(), engine: llm.ENGINE });
  }
  // Diagnostic complet de la machine (admin uniquement, 1 par minute) : jamais dans /api/me
  if (route === "POST /api/admin/doctor") {
    if (!auth.user.is_admin) return fail(res, 403, "Réservé aux administrateurs.");
    const wait = waitFor(`doctor:${uid}`);
    if (wait) return tooMany(res, wait);
    recordAttempt(`doctor:${uid}`);
    machine.report = await hw.detect();
    machine.basic = machine.report; machine.at = now();
    return send(res, 200, { machine: machineInfo() });
  }
  // Rappels : un abonnement par appareil (adresse du service de push du navigateur)
  if (route === "POST /api/push/subscribe") {
    if (!VAPID) return fail(res, 503, "Les rappels ne sont pas configurés sur ce serveur.");
    const b = await readJson(req, 8 * 1024), s = b.subscription || {};
    const hour = Number(b.hour), days = Array.isArray(b.days) ? [...new Set(b.days.map(Number))].filter((d) => d >= 1 && d <= 7).sort() : [];
    if (typeof s.endpoint !== "string" || !/^https:\/\/[^\s]{10,}$/.test(s.endpoint) || s.endpoint.length > 1000) return fail(res, 400, "Abonnement invalide.");
    if (!/^[A-Za-z0-9_-]{80,100}$/.test(s.keys?.p256dh || "") || !/^[A-Za-z0-9_-]{16,32}$/.test(s.keys?.auth || "")) return fail(res, 400, "Clés d'abonnement invalides.");
    if (!Number.isInteger(hour) || hour < 6 || hour > 22) return fail(res, 400, "Heure invalide (6 h à 22 h).");
    const tz = typeof b.tz === "string" && push.validTz(b.tz) ? b.tz : "Europe/Paris";
    if (db.prepare("SELECT count(*) n FROM push_subs WHERE user_id = ?").get(uid).n >= 10 && !db.prepare("SELECT 1 FROM push_subs WHERE endpoint = ?").get(s.endpoint)) return fail(res, 400, "Trop d'appareils abonnés (10 au plus).");
    db.prepare(`INSERT INTO push_subs (endpoint, user_id, p256dh, auth, hour, days, tz, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, hour = excluded.hour, days = excluded.days, tz = excluded.tz`)
      .run(s.endpoint, uid, s.keys.p256dh, s.keys.auth, hour, JSON.stringify(days), tz, now());
    return send(res, 200, { ok: true, hour, days, tz });
  }
  if (route === "POST /api/push/unsubscribe") {
    const b = await readJson(req, 4 * 1024);
    db.prepare("DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?").run(String(b.endpoint || ""), uid);
    return send(res, 200, { ok: true });
  }
  if (route === "GET /api/sessions") {
    const rows = db.prepare("SELECT token_hash, created_at, last_seen_at, user_agent FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC").all(uid, now());
    return send(res, 200, { sessions: rows.map((r) => ({ current: r.token_hash === auth.session.token_hash, created_at: r.created_at, last_seen_at: r.last_seen_at, user_agent: r.user_agent })) });
  }
  if (route === "POST /api/logout-others") {
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(uid, auth.session.token_hash);
    return send(res, 200, { ok: true });
  }
  if (route === "DELETE /api/me") {
    const { password } = await readJson(req);
    if (!(await verifyPassword(String(password ?? ""), auth.user.pass))) return fail(res, 401, "Mot de passe incorrect.");
    removeAvatarFile(auth.user.avatar_file);
    db.prepare("DELETE FROM users WHERE id = ?").run(uid); // sessions et progression supprimées en cascade
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
  }
  return fail(res, 404, "Route inconnue.");
}

// ---------- Fichiers statiques (liste blanche) ----------
const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/state.js": ["state.js", "text/javascript; charset=utf-8"],
  "/sync.js": ["sync.js", "text/javascript; charset=utf-8"],
  "/ui.js": ["ui.js", "text/javascript; charset=utf-8"],
  "/audio.js": ["audio.js", "text/javascript; charset=utf-8"],
  "/reader.js": ["reader.js", "text/javascript; charset=utf-8"],
  "/fsrs-cards.js": ["fsrs-cards.js", "text/javascript; charset=utf-8"],
  "/today.js": ["today.js", "text/javascript; charset=utf-8"],
  "/lessons.js": ["lessons.js", "text/javascript; charset=utf-8"],
  "/profile.js": ["profile.js", "text/javascript; charset=utf-8"],
  "/router.js": ["router.js", "text/javascript; charset=utf-8"],
  "/actions.js": ["actions.js", "text/javascript; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/content.data.js": ["content.data.js", "text/javascript; charset=utf-8"],
  "/content.js": ["content.js", "text/javascript; charset=utf-8"],
  "/zh.js": ["zh.js", "text/javascript; charset=utf-8"],
  "/ru.js": ["ru.js", "text/javascript; charset=utf-8"],
  "/exercises.js": ["exercises.js", "text/javascript; charset=utf-8"],
  "/placement.js": ["placement.js", "text/javascript; charset=utf-8"],
  "/library.js": ["library.js", "text/javascript; charset=utf-8"],
  "/missions.js": ["missions.js", "text/javascript; charset=utf-8"],
  "/story.js": ["story.js", "text/javascript; charset=utf-8"],
  "/keyboard.js": ["keyboard.js", "text/javascript; charset=utf-8"],
  "/hangul.js": ["hangul.js", "text/javascript; charset=utf-8"],
  "/pinyin.js": ["pinyin.js", "text/javascript; charset=utf-8"],
  "/cyrillic.js": ["cyrillic.js", "text/javascript; charset=utf-8"],
  "/cosmetics.js": ["cosmetics.js", "text/javascript; charset=utf-8"],
  "/tour.js": ["tour.js", "text/javascript; charset=utf-8"],
  "/legal.js": ["legal.js", "text/javascript; charset=utf-8"],
  "/admin-content.js": ["admin-content.js", "text/javascript; charset=utf-8"],
  "/feedback.js": ["feedback.js", "text/javascript; charset=utf-8"],
  "/reminders.js": ["reminders.js", "text/javascript; charset=utf-8"],
  "/mistakes.js": ["mistakes.js", "text/javascript; charset=utf-8"],
  "/friends.js": ["friends.js", "text/javascript; charset=utf-8"],
  "/duel.js": ["duel.js", "text/javascript; charset=utf-8"],
  "/ctf.js": ["ctf.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/tokens.css": ["tokens.css", "text/css; charset=utf-8"],
  "/fonts/pretendard.css": ["fonts/pretendard.css", "text/css; charset=utf-8"],
  "/fonts/jua.css": ["fonts/jua.css", "text/css; charset=utf-8"],
  "/fonts/fredoka.css": ["fonts/fredoka.css", "text/css; charset=utf-8"],
  "/fonts/flags.css": ["fonts/flags.css", "text/css; charset=utf-8"],
  "/favicon.svg": ["favicon.svg", "image/svg+xml"],
  "/sw.js": ["sw.js", "text/javascript; charset=utf-8"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/vendor/ts-fsrs-5.2.3.umd.js": ["vendor/ts-fsrs-5.2.3.umd.js", "text/javascript; charset=utf-8"],
};
const IMG_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

function serveFile(res, file, type, cache) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Introuvable"); }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" });
    res.end(data);
  });
}

// Content-Security-Policy : aucun script ni style inline dans le site. Les styles dynamiques
// passent par le CSSOM (data-bar-w / data-vars, voir applyDynStyles dans ui.js), que la CSP autorise.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'",
  "img-src 'self' data: blob:", "media-src 'self' blob:", "font-src 'self'", "connect-src 'self'",
  "worker-src 'self'", "manifest-src 'self'", "object-src 'none'", "base-uri 'none'",
  "form-action 'self'", "frame-ancestors 'none'",
].join("; ");

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("Permissions-Policy", "microphone=(self), camera=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (SECURE) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  const url = new URL(req.url, "http://localhost");
  try {
    if (ctf.on && ctf.handle(req, res, url, { send, fail })) return;
    // Avis envoyés depuis la version mobile (autre origine) : CORS sur CETTE route seulement, sans
    // cookies (pas d'Allow-Credentials) ; la limite par IP et la taille maximale s'appliquent.
    if (url.pathname === "/api/feedback-site") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Mochi");
      res.setHeader("Access-Control-Max-Age", "600");
      if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    }
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "Méthode non autorisée.");
    const m = url.pathname.match(/^\/avatars\/([a-z0-9-]+\.(jpg|png|webp))$/);
    if (m) return serveFile(res, path.join(AVATAR_DIR, m[1]), IMG_TYPES[m[2]], "public, max-age=31536000, immutable");
    // Polices auto-hébergées (charte §6) : noms de fichiers stricts, pas de traversée possible
    const f = url.pathname.match(/^\/fonts\/(pretendard|jua|fredoka|flags)\/([A-Za-z0-9.-]+\.woff2)$/);
    if (f) return serveFile(res, path.join(ROOT, "fonts", f[1], f[2]), "font/woff2", "public, max-age=31536000, immutable");
    const ic = url.pathname.match(/^\/icons\/(mochi-(?:maskable-)?(?:192|512)|apple-touch-icon)\.png$/);
    if (ic) return serveFile(res, path.join(ROOT, "icons", `${ic[1]}.png`), "image/png", "public, max-age=86400");
    const s = STATIC[url.pathname];
    if (s && url.pathname === "/" && ctf.on && !/(?:^|;\s*)mochi_role=/.test(req.headers.cookie || "")) res.setHeader("Set-Cookie", ctf.roleCookie());
    if (s) return serveFile(res, path.join(ROOT, s[0]), s[1], "no-cache");
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Introuvable");
  } catch (e) {
    if (e.status === 413) res.setHeader("Connection", "close");
    if (!res.headersSent) fail(res, e.status || 500, e.status === 413 ? "Fichier trop volumineux." : e.status === 400 ? "Requête invalide." : "Erreur serveur.");
    if (!e.status) console.error(`[${new Date().toISOString()}] ${req.method} ${url.pathname} :`, e); // journal : sans corps de requête ni données personnelles
  }
});

// Préchauffage des moteurs (lot 7.2), en arrière-plan : ne bloque jamais le démarrage.
// Un premier appel charge le modèle, un second mesure la vitesse réelle d'une phrase courte.
const secs = (ms) => `${(ms / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
async function warmEngines(log = console.log) {
  const jobs = Object.keys(tts.info()).filter((l) => !tts.conf[l].cacheOnly).map(async (lang) => {
    try { await tts.warm(lang, 0); engines.tts[lang] = { ok: true, ms: await tts.warm(lang, 1) }; }
    catch (e) { engines.tts[lang] = { ok: false, error: e.cause?.code || e.message }; }
  });
  const llmJob = llm.PROVIDER === "ollama" && llmOn()
    ? llm.warmup().then((ms) => { engines.llm = { ok: true, ms }; }, (e) => { engines.llm = { ok: false, error: e.cause?.code || e.message }; })
    : null;
  await Promise.all([...jobs, llmJob]);
  // Adaptation (lot 8.4) : voix lentes → le client ne précharge plus et passe plus vite à la voix
  // de l'appareil ; Ollama lent → le client prévient que la correction peut prendre un moment.
  const slowVoices = Object.entries(engines.tts).filter(([, x]) => x.ok && x.ms > TTS_SLOW_MS).map(([l]) => l);
  engines.ttsSlow = slowVoices.length > 0;
  engines.llmSlow = !!(engines.llm?.ok && engines.llm.ms > LLM_SLOW_MS);
  const parts = Object.entries(engines.tts).map(([l, x]) => (x.ok ? `Voix ${l} : prête (${secs(x.ms)})` : `⚠️ Voix ${l} : le moteur ne répond pas (${x.error}) → voix du navigateur`));
  if (engines.llm) parts.push(engines.llm.ok ? `Ollama : prêt (${secs(engines.llm.ms)})` : `⚠️ Ollama ne répond pas (${engines.llm.error}) → correcteur hors ligne`);
  if (parts.length) log(parts.join(" · "));
  if (engines.ttsSlow) log(`⚠️  Voix lentes (${slowVoices.join(", ")} : plus de ${TTS_SLOW_MS / 1000} s par phrase) : lance « npm run tts:pregen » pour tout générer d'avance.`);
  if (engines.llmSlow) log(`⚠️  Ollama a mis ${secs(engines.llm.ms)} à se charger : les corrections seront lentes (npm run doctor pour les conseils).`);
  return engines;
}

// Version portable : le serveur ouvre le navigateur (commandes fixes, jamais de shell) ; un second
// double-clic alors que Mochi tourne déjà ouvre simplement le site au lieu d'échouer.
function openBrowser(url) {
  const [cmd, args] = process.platform === "win32" ? ["explorer.exe", [url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  require("node:child_process").execFile(cmd, args, () => {});
}
if (require.main === module) {
  const local = `http://${HOST && HOST !== "0.0.0.0" && HOST !== "::" ? HOST : "localhost"}:${PORT}`;
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE" && PORTABLE) { console.log(`Mochi tourne déjà : ouverture de ${local}`); openBrowser(local); setTimeout(() => process.exit(0), 500); return; }
    throw e;
  });
  server.listen(PORT, HOST, () => {
    console.log(`Mochi → ${local} · correcteur : ${llmOn() ? llm.ENGINE : LLM_ON ? "en pause (tableau de bord)" : "désactivé"} · e-mails : ${mail.mode} · voix : ${tts.enabled ? Object.entries(tts.info()).map(([l, v]) => `${l} ×${v.length}`).join(", ") : "navigateur"}`);
    if (PORTABLE) { console.log("\n🍡 Mochi est ouvert dans ton navigateur. Laisse cette fenêtre ouverte pendant que tu l'utilises ; ferme-la pour arrêter Mochi.\n"); if (process.env.MOCHI_OPEN_BROWSER !== "0") openBrowser(local); }
  });
}
// Erreurs inattendues : écrites avec la date (journal de systemd : journalctl -u mochi).
// Une exception non rattrapée laisse le processus dans un état incertain : on sort, systemd relance.
if (require.main === module) {
  process.on("unhandledRejection", (e) => console.error(`[${new Date().toISOString()}] Promesse rejetée non gérée :`, e));
  process.on("uncaughtException", (e) => { console.error(`[${new Date().toISOString()}] Erreur fatale :`, e); process.exit(1); });
}
// Rappels Web Push : vérifiés toutes les 5 minutes
if (require.main === module && VAPID) setInterval(() => sendReminders().catch((e) => console.error("Rappels :", e.message)), 5 * 60e3).unref();
// Version portable : avis en attente renvoyés au démarrage, puis toutes les 10 minutes
if (require.main === module && RELAY) { setTimeout(() => relayFeedback().catch(() => {}), 5000).unref(); setInterval(() => relayFeedback().catch(() => {}), 10 * 60e3).unref(); }
if (require.main === module && FEEDBACK_MAIL === "daily") setInterval(() => feedbackDigest().catch(() => {}), 30 * 60e3).unref();
if (require.main === module) {
  warmEngines().catch((e) => console.error("Préchauffage :", e.message));
  hw.detectBasic().then((b) => { machine.basic = b; }).catch(() => {}); // léger : système, mémoire, nvidia-smi
}
module.exports = { sendReminders, relayFeedback, server, ctf, contentAdmin, social, live, db, mail, feedbackDigest, betaMetrics, clientIp, warmEngines, engines, tts, limiter: { waitFor, recordAttempt, clearAttempts } };
