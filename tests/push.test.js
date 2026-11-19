// Rappels Web Push (AMELIORATIONS v0.6, lot 3.3) : chiffrement, VAPID, quand rappeler, serveur.
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const push = require("../push.js");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("  ok", m); };

// RFC 8291, annexe A : mêmes octets que la norme
const body = push.encrypt("When I grow up, I want to be a watermelon", { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" },
  { asKeys: { privateKey: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw" }, salt: Buffer.from("DGv6ra1nlYgDCS1FRnbzlw", "base64url") });
ok(body.toString("base64url") === "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN", "chiffrement : vecteur de la RFC 8291");
// VAPID : jeton ES256 vérifiable avec la clé publique, pour l'origine du service de push
const k = push.generateVapid(), h = push.vapidHeader("https://web.push.apple.com/abc", { ...k, subject: "mailto:x@y.fr" });
const [hd, bd, sg] = h.match(/t=([^,]+)/)[1].split("."), pub = Buffer.from(k.publicKey, "base64url");
const key = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") }, format: "jwk" });
ok(crypto.verify("sha256", Buffer.from(`${hd}.${bd}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(sg, "base64url")) && JSON.parse(Buffer.from(bd, "base64url")).aud === "https://web.push.apple.com" && h.endsWith(`k=${k.publicKey}`), "VAPID : signature valide, bonne origine");

// Quand rappeler (heure locale de l'abonné)
const at = new Date("2026-11-20T18:10:00Z"); // vendredi 19 h 10 à Paris, samedi 3 h 10 à Séoul
const sub = { hour: 19, days: "[1,2,3,4,5,6,7]", tz: "Europe/Paris", last_sent: null };
const ctx = (o = {}) => ({ practiced: () => false, weekDone: () => 2, due: () => 14, ...o });
const d = push.decide(sub, at, ctx());
ok(d && d.message.body === "14 cartes t'attendent. 5 minutes et c'est plié." && d.date === "2026-11-20", "rappel à l'heure choisie, ton de la charte");
ok(push.decide(sub, at, ctx({ due: () => 1 })).message.body.startsWith("1 carte t'attend.") && push.decide(sub, at, ctx({ due: () => 0 })).message.body.includes("5 minutes suffisent"), "singulier, et rien à réviser");
ok(!push.decide({ ...sub, hour: 20 }, at, ctx()), "pas à une autre heure");
ok(!push.decide({ ...sub, last_sent: "2026-11-20" }, at, ctx()), "au plus 1 par jour");
ok(!push.decide({ ...sub, days: "[1,2,3,4]" }, at, ctx()), "jamais un jour décoché (vendredi)");
ok(!push.decide(sub, at, ctx({ practiced: (x) => x === "2026-11-20" })), "pas si la séance du jour est faite");
ok(!push.decide(sub, at, ctx({ weekDone: () => 5 })), "pas quand l'objectif de la semaine est atteint (jour de repos)");
ok(!push.decide({ ...sub, tz: "Asia/Seoul" }, at, ctx()) && push.local(at, "Asia/Seoul").date === "2026-11-21", "fuseau horaire de l'abonné");
ok(push.weekDates("2026-11-20")[0] === "2026-11-16" && push.weekDates("2026-11-22")[6] === "2026-11-22", "semaine du lundi au dimanche");

// Serveur : abonnement, envoi, abonnement expiré
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-push-"));
Object.assign(process.env, { VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey, MAIL_QUIET: "1" });
delete process.env.MOCHI_PORTABLE;
const { server, db, sendReminders } = require("../server.js");
server.listen(0, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const call = async (method, url, b) => { const r = await fetch(base + url, { method, headers: { "X-Mochi": "1", "Content-Type": "application/json", Cookie: cookie }, body: b && JSON.stringify(b) }); const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0]; return { status: r.status, data: await r.json().catch(() => null) }; };
  try {
    ok((await call("GET", "/api/me")).data.features.push === k.publicKey, "clé publique annoncée au site");
    ok((await call("POST", "/api/push/subscribe", {})).status === 401, "abonnement : compte requis");
    await call("POST", "/api/signup", { email: "push@test.fr", password: "motdepasse-solide-123", name: "P", accept: true });
    const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
    const subscription = { endpoint: "https://push.example/send/abc123456", keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") } };
    ok((await call("POST", "/api/push/subscribe", { subscription: { ...subscription, endpoint: "http://insecure.example/x" }, hour: 19, days: [5] })).status === 400, "abonnement : adresse https obligatoire");
    ok((await call("POST", "/api/push/subscribe", { subscription, hour: 3, days: [5] })).status === 400, "abonnement : heure entre 6 h et 22 h");
    const r = await call("POST", "/api/push/subscribe", { subscription, hour: 19, days: [5, 9, 5], tz: "Europe/Paris" });
    ok(r.status === 200 && JSON.stringify(r.data.days) === "[5]", "abonnement enregistré (jours nettoyés)");
    const uid = db.prepare("SELECT id FROM users WHERE email = ?").get("push@test.fr").id;
    db.prepare("INSERT INTO sync_cards (user_id, id, data, updated_at, rev) VALUES (?, 'c1', ?, 0, 1)").run(uid, JSON.stringify({ lang: "en", fsrs: { due: "2026-11-19T10:00:00.000Z" } }));
    const sent = [];
    let res = await sendReminders(at, async (s, m) => { sent.push({ s, m }); return { ok: true }; });
    ok(res.sent === 1 && sent[0].m.body.startsWith("1 carte t'attend") && sent[0].s.keys.p256dh === subscription.keys.p256dh, "rappel envoyé avec le bon nombre de cartes");
    res = await sendReminders(new Date(at.getTime() + 10 * 60e3), async () => ({ ok: true }));
    ok(res.sent === 0, "pas deux fois le même jour");
    db.prepare("UPDATE push_subs SET last_sent = NULL").run();
    await sendReminders(at, async () => ({ gone: true }));
    ok(!db.prepare("SELECT 1 FROM push_subs").get(), "abonnement expiré (410) : supprimé");
    await call("POST", "/api/push/subscribe", { subscription, hour: 19, days: [5] });
    ok((await call("POST", "/api/push/unsubscribe", { endpoint: subscription.endpoint })).status === 200 && !db.prepare("SELECT 1 FROM push_subs").get(), "désabonnement en un clic");
  } catch (e) { fails++; console.log("ERREUR", e); }
  server.close();
  console.log(fails ? `${fails} échec(s)` : "OK : rappels Web Push");
  process.exit(fails ? 1 : 0);
});
