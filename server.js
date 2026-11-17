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

const PORT = Number(process.env.PORT) || 8000;
const ROOT = __dirname;
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const AVATAR_DIR = path.join(DATA, "avatars");
const SECURE = process.env.COOKIE_SECURE === "1";
const SESSION_DAYS = 30;
const MAX_STATE = 5 * 1024 * 1024;
const MAX_AVATAR = 1024 * 1024;
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
  CREATE TABLE IF NOT EXISTS user_state (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);
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
    return send(res, 201, { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid)), state: null });
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
    const st = db.prepare("SELECT state, updated_at FROM user_state WHERE user_id = ?").get(user.id);
    return send(res, 200, `{"user":${JSON.stringify(publicUser({ ...user, last_login_at: now() }))},"state":${st ? st.state : "null"},"updated_at":${JSON.stringify(st?.updated_at || null)}}`);
  }

  // --- Routes authentifiées ---
  const auth = currentSession(req);
  if (route === "GET /api/me") {
    if (!auth) return send(res, 200, { user: null });
    const st = db.prepare("SELECT state, updated_at FROM user_state WHERE user_id = ?").get(auth.user.id);
    return send(res, 200, `{"user":${JSON.stringify(publicUser(auth.user))},"state":${st ? st.state : "null"},"updated_at":${JSON.stringify(st?.updated_at || null)}}`);
  }
  if (!auth) return fail(res, 401, "Connecte-toi d'abord.");
  const uid = auth.user.id;

  if (route === "POST /api/logout") {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(auth.session.token_hash);
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
  }
  if (route === "PUT /api/state") {
    const buf = await readBody(req, MAX_STATE);
    let parsed;
    try { parsed = JSON.parse(buf.toString("utf8")); } catch { return fail(res, 400, "Données invalides."); }
    if (!parsed || typeof parsed.state !== "object" || Array.isArray(parsed.state)) return fail(res, 400, "Données invalides.");
    const t = now();
    db.prepare("INSERT INTO user_state (user_id, state, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at")
      .run(uid, JSON.stringify(parsed.state), t);
    return send(res, 200, { ok: true, updated_at: t });
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

if (require.main === module) server.listen(PORT, () => console.log(`Mochi → http://localhost:${PORT}`));
module.exports = { server, db };
