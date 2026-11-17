// ============================================================
//  Mochi — serveur : fichiers statiques + API des comptes
//  Node ≥ 22.5, aucune dépendance (node:sqlite, node:crypto).
//  Lancer : node server.js   (PORT=8000, DATA_DIR=./data, COOKIE_SECURE=1 derrière HTTPS)
// ============================================================
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const llm = require("./llm.js");

const PORT = Number(process.env.PORT) || 8000;
const ROOT = __dirname;
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const AVATAR_DIR = path.join(DATA, "avatars");
const SECURE = process.env.COOKIE_SECURE === "1";
const SESSION_DAYS = 30;
const MAX_STATE = 8 * 1024 * 1024;
const MAX_AVATAR = 1024 * 1024;
const LLM_ON = process.env.MOCHI_LLM !== "off";
const LLM_DAILY = Number(process.env.MOCHI_LLM_DAILY) || 60; // corrections par compte et par jour (coût)
const EMOJIS = ["🐰", "🐱", "🐻", "🐼", "🦊", "🐥", "🐸", "🐨"];

fs.mkdirSync(AVATAR_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA, "mochi.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
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
  CREATE INDEX IF NOT EXISTS sync_kv_rev ON sync_kv (user_id, rev);
  CREATE INDEX IF NOT EXISTS sync_cards_rev ON sync_cards (user_id, rev);
  CREATE INDEX IF NOT EXISTS review_logs_rev ON review_logs (user_id, rev);
  CREATE INDEX IF NOT EXISTS sync_counters_rev ON sync_counters (user_id, rev);
`);
// Migration : colonnes de synchro sur users
const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userCols.includes("sync_rev")) db.exec("ALTER TABLE users ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0");
if (!userCols.includes("sync_epoch")) db.exec("ALTER TABLE users ADD COLUMN sync_epoch INTEGER NOT NULL DEFAULT 0");
db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());

// ---------- Utilitaires ----------
const now = () => new Date().toISOString();
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

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
const fail = (res, status, error) => send(res, status, { error });

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
    created_at: u.created_at, last_login_at: u.last_login_at,
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

// Limitation des tentatives de connexion (en mémoire)
const attempts = new Map();
function tooManyAttempts(key) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > 15 * 60e3) return false;
  return a.count >= 10;
}
function recordFailure(key) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > 15 * 60e3) attempts.set(key, { first: Date.now(), count: 1 });
  else a.count++;
}

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

// ---------- API ----------
async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  // Protection CSRF : toute requête qui modifie quelque chose doit porter cet en-tête
  // (un autre site ne peut pas l'ajouter sans pré-vol CORS, que l'on n'autorise pas).
  if (req.method !== "GET" && req.headers["x-mochi"] !== "1") return fail(res, 403, "Requête refusée.");
  const ip = req.socket.remoteAddress || "?";

  if (route === "POST /api/signup") {
    const { email, password, name } = await readJson(req);
    const err = validCredentials(email, password);
    if (err) return fail(res, 400, err);
    if (tooManyAttempts(`signup:${ip}`)) return fail(res, 429, "Trop de tentatives, réessaie dans quelques minutes.");
    recordFailure(`signup:${ip}`); // compte aussi les inscriptions réussies : limite le spam
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email.trim())) return fail(res, 409, "Un compte existe déjà avec cette adresse.");
    const info = db.prepare("INSERT INTO users (email, pass, name, created_at) VALUES (?, ?, ?, ?)").run(email.trim(), await hashPassword(password), cleanName(name), now());
    createSession(res, Number(info.lastInsertRowid), req);
    return send(res, 201, { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid)), legacy_state: null, features: { llm: LLM_ON, engine: llm.ENGINE } });
  }

  if (route === "POST /api/login") {
    const { email, password } = await readJson(req);
    if (typeof email !== "string" || typeof password !== "string") return fail(res, 400, "E-mail et mot de passe requis.");
    const keys = [`login-ip:${ip}`, `login-email:${email.toLowerCase()}`];
    if (keys.some(tooManyAttempts)) return fail(res, 429, "Trop de tentatives, réessaie dans 15 minutes.");
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim());
    const good = await verifyPassword(password, user ? user.pass : DUMMY_HASH);
    if (!user || !good) { keys.forEach(recordFailure); return fail(res, 401, "E-mail ou mot de passe incorrect."); }
    keys.forEach((k) => attempts.delete(k));
    createSession(res, user.id, req);
    return send(res, 200, `{"user":${JSON.stringify(publicUser({ ...user, last_login_at: now() }))},"legacy_state":${legacyState(user)},"features":{"llm":${LLM_ON},"engine":${JSON.stringify(llm.ENGINE)}}}`);
  }

  // --- Routes authentifiées ---
  const auth = currentSession(req);
  if (route === "GET /api/me") {
    if (!auth) return send(res, 200, { user: null, features: { llm: false } });
    return send(res, 200, `{"user":${JSON.stringify(publicUser(auth.user))},"legacy_state":${legacyState(auth.user)},"features":{"llm":${LLM_ON},"engine":${JSON.stringify(llm.ENGINE)}}}`);
  }
  if (!auth) return fail(res, 401, "Connecte-toi d'abord.");
  const uid = auth.user.id;

  if (route === "POST /api/logout") {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(auth.session.token_hash);
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
  }
  if (route === "POST /api/feedback") {
    if (!LLM_ON) return fail(res, 503, "Correcteur désactivé.");
    const b = await readJson(req);
    const str = (v, max) => typeof v === "string" && v.length <= max;
    if (!["en", "ko"].includes(b.lang) || !str(b.prompt, 300) || !str(b.text, 500) || !b.text.trim()
      || (b.who != null && !str(b.who, 80)) || (b.register != null && !str(b.register, 30)) || (b.reference != null && !str(b.reference, 300))) {
      return fail(res, 400, "Requête invalide.");
    }
    const day = now().slice(0, 10);
    const used = db.prepare("SELECT count FROM llm_usage WHERE user_id = ? AND day = ?").get(uid, day)?.count || 0;
    if (used >= LLM_DAILY) return fail(res, 429, `Tu as utilisé tes ${LLM_DAILY} corrections du jour. Reviens demain !`);
    db.prepare("INSERT INTO llm_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1").run(uid, day);
    try {
      const feedback = await llm.getFeedback({ lang: b.lang, prompt: b.prompt, who: b.who || null, register: b.register || null, reference: b.reference || null, text: b.text.trim() });
      return send(res, 200, { feedback, engine: llm.ENGINE, remaining: LLM_DAILY - used - 1 });
    } catch (e) {
      // Échec : on ne décompte pas la correction
      db.prepare("UPDATE llm_usage SET count = count - 1 WHERE user_id = ? AND day = ?").run(uid, day);
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
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/content.js": ["content.js", "text/javascript; charset=utf-8"],
  "/exercises.js": ["exercises.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};
const IMG_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

function serveFile(res, file, type, cache) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Introuvable"); }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "Méthode non autorisée.");
    const m = url.pathname.match(/^\/avatars\/([a-z0-9-]+\.(jpg|png|webp))$/);
    if (m) return serveFile(res, path.join(AVATAR_DIR, m[1]), IMG_TYPES[m[2]], "public, max-age=31536000, immutable");
    const s = STATIC[url.pathname];
    if (s) return serveFile(res, path.join(ROOT, s[0]), s[1], "no-cache");
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Introuvable");
  } catch (e) {
    if (e.status === 413) res.setHeader("Connection", "close");
    if (!res.headersSent) fail(res, e.status || 500, e.status === 413 ? "Fichier trop volumineux." : e.status === 400 ? "Requête invalide." : "Erreur serveur.");
    if (!e.status) console.error(e);
  }
});

if (require.main === module) server.listen(PORT, () => console.log(`Mochi → http://localhost:${PORT} · correcteur : ${LLM_ON ? llm.ENGINE : "désactivé"}`));
module.exports = { server, db };
