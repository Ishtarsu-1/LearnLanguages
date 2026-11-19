// ============================================================
//  Mochi — push.js : rappels Web Push (AMELIORATIONS v0.6, lot 3.3), sans dépendance
//  - VAPID (RFC 8292) : jeton ES256 signé avec la clé privée du serveur (VAPID_PRIVATE_KEY).
//  - Chiffrement du message (RFC 8291, « aes128gcm ») : ECDH P-256 + HKDF + AES-128-GCM.
//  Clés : npm run doctor -- --write les génère si elles manquent.
// ============================================================
const crypto = require("node:crypto");

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => Buffer.from(String(s), "base64url");

// Paire de clés VAPID : publique (65 octets, non compressée) et privée (32 octets), en base64url
function generateVapid() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}
function privateKeyObject(publicKey, privateKey) {
  const pub = unb64u(publicKey);
  return crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", d: b64u(unb64u(privateKey)), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });
}
// En-tête Authorization (RFC 8292) pour le service de push de cette adresse
function vapidHeader(endpoint, { publicKey, privateKey, subject }, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: privateKeyObject(publicKey, privateKey), dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey}`;
}
// Chiffre un message pour un abonnement (keys.p256dh, keys.auth). Les paramètres asKeys et salt
// ne servent qu'aux tests (vecteur de la RFC 8291, annexe A).
function encrypt(payload, { p256dh, auth }, { asKeys, salt = crypto.randomBytes(16), rs = 4096 } = {}) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  const as = crypto.createECDH("prime256v1");
  if (asKeys) as.setPrivateKey(unb64u(asKeys.privateKey)); else as.generateKeys();
  const asPublic = as.getPublicKey();
  const ecdhSecret = as.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", ecdhSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21); salt.copy(header, 0); header.writeUInt32BE(rs, 16); header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}
// Envoie un message. Résultat : { ok } ou { gone: true } (abonnement expiré : à supprimer)
async function send(sub, message, vapid, { fetchImpl = fetch, ttl = 12 * 3600 } = {}) {
  const r = await fetchImpl(sub.endpoint, {
    method: "POST",
    headers: { Authorization: vapidHeader(sub.endpoint, vapid), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl), Urgency: "normal" },
    body: encrypt(JSON.stringify(message), sub.keys),
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 404 || r.status === 410) return { gone: true };
  if (!r.ok) throw new Error(`service de push : HTTP ${r.status}`);
  return { ok: true };
}

// ---------- Quand rappeler ? (heure locale de l'abonné) ----------
// local(now, tz) → { date: "2026-11-20", hour: 19, weekday: 1..7 (lundi = 1) }
function local(now, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1 };
}
const validTz = (tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };
// Lundi de la semaine d'une date « AAAA-MM-JJ »
function weekDates(date) {
  const d = new Date(`${date}T12:00:00Z`), out = [];
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  for (let i = 0; i < 7; i++) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
// Décide pour un abonnement : null (rien à envoyer) ou le message. ctx : { practiced(date), weekDone(dates), due(nowIso) }
function decide(sub, now, ctx) {
  const L = local(now, sub.tz);
  if (L.hour !== sub.hour || sub.last_sent === L.date) return null;
  if (!JSON.parse(sub.days || "[]").includes(L.weekday)) return null; // jour exclu par l'utilisateur
  if (ctx.practiced(L.date)) return null; // déjà pratiqué aujourd'hui
  if (ctx.weekDone(weekDates(L.date)) >= 5) return null; // objectif de la semaine atteint : jour de repos (§16)
  const n = ctx.due(now.toISOString());
  // Ton de la charte (§9) : jamais culpabilisant, une estimation honnête
  const body = n > 0 ? `${n} ${n > 1 ? "cartes t'attendent" : "carte t'attend"}. 5 minutes et c'est plié.` : "Un petit texte avec Mochi ? 5 minutes suffisent.";
  return { date: L.date, message: { title: "Mochi 🍡", body, url: "/#/aujourdhui", tag: "mochi-rappel" } };
}

module.exports = { generateVapid, vapidHeader, encrypt, send, decide, local, weekDates, validTz, b64u, unb64u };
