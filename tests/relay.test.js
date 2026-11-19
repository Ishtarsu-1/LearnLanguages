// Lot 2 (AMELIORATIONS v0.6) : aucun secret dans les paquets, avis relayés au site de bêta.
const fs = require("fs"), path = require("path"), os = require("os");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-relay-"));
process.env.MOCHI_PORTABLE = "1";
process.env.FEEDBACK_ENDPOINT = "http://127.0.0.1:9";
const { server, db, relayFeedback } = require("../server.js");
const { assertNoSecrets, feedbackEndpoint } = require("../tools/portable.js");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("  ok", m); };
const throws = (f) => { try { f(); return false; } catch { return true; } };

// Garde-fou du constructeur : liste noire de noms et de valeurs
ok(throws(() => assertNoSecrets({ RESEND_API_KEY: "x" })), "refuse *_KEY");
ok(throws(() => assertNoSecrets({ GH_TOKEN: "x" })) && throws(() => assertNoSecrets({ APP_SECRET: "x" })) && throws(() => assertNoSecrets({ DISCORD_WEBHOOK_URL: "x" })), "refuse *_TOKEN, *_SECRET, WEBHOOK_URL");
ok(throws(() => assertNoSecrets({ FOO: "re_123abc" })) && throws(() => assertNoSecrets({ hook: "https://discord.com/api/webhooks/1/abc" })), "refuse une valeur qui ressemble à une clé");
ok(!throws(() => assertNoSecrets({ MOCHI_PORTABLE: "1", FEEDBACK_ENDPOINT: "https://beta.example", TTS_VOICES_EN: "af_heart", MOCHI_CTF_FLAGS: "abc" })), "réglages normaux acceptés");
process.env.FEEDBACK_ENDPOINT = "https://beta.example/"; ok(feedbackEndpoint() === "https://beta.example", "adresse du site de bêta normalisée");
process.env.FEEDBACK_ENDPOINT = "https://beta.example/api?key=1"; ok(throws(feedbackEndpoint), "adresse avec chemin refusée");
// Le constructeur ne copie plus jamais la clé Resend
const src = fs.readFileSync(path.join(__dirname, "..", "tools", "portable.js"), "utf8");
ok(!/RESEND_API_KEY:\s*process\.env/.test(src) && !/FEEDBACK_TO:\s*process\.env/.test(src), "tools/portable.js ne copie ni RESEND_API_KEY ni FEEDBACK_TO");

server.listen(0, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // CORS : seulement la route des avis, sans cookies
    const pre = await fetch(`${base}/api/feedback-site`, { method: "OPTIONS", headers: { Origin: "https://mochi.netlify.app", "Access-Control-Request-Method": "POST" } });
    ok(pre.status === 204 && pre.headers.get("access-control-allow-origin") === "*" && /X-Mochi/.test(pre.headers.get("access-control-allow-headers")) && !pre.headers.get("access-control-allow-credentials"), "CORS : pré-vol accepté, sans cookies");
    const me = await fetch(`${base}/api/me`, { headers: { Origin: "https://mochi.netlify.app" } });
    ok(!me.headers.get("access-control-allow-origin"), "CORS : aucune autre route ouverte");
    const post = await fetch(`${base}/api/feedback-site`, { method: "POST", headers: { "Content-Type": "application/json", "X-Mochi": "1", Origin: "https://mochi.netlify.app" }, body: JSON.stringify({ parts: [{ kind: "bug", message: "Le son coupe." }], source: "mobile" }) });
    ok(post.status === 201 && post.headers.get("access-control-allow-origin") === "*", "avis venu d'une autre origine enregistré");
    ok(db.prepare("SELECT page FROM site_feedback ORDER BY id DESC").get().page.startsWith("[mobile]"), "origine de l'avis notée (mobile)");
    // Relais : site éteint → en attente ; site revenu → transmis, une seule fois
    db.prepare("UPDATE site_feedback SET mailed_at = NULL, mail_error = NULL").run();
    let calls = [];
    await relayFeedback(async () => { throw new TypeError("fetch failed"); });
    ok(/en attente/.test(db.prepare("SELECT mail_error FROM site_feedback").get().mail_error) && !db.prepare("SELECT mailed_at FROM site_feedback").get().mailed_at, "site de bêta éteint : avis gardé, en attente");
    await relayFeedback(async (url, o) => { calls.push({ url, body: JSON.parse(o.body), h: o.headers }); return { ok: true, status: 201 }; });
    ok(calls.length === 1 && calls[0].url.endsWith("/api/feedback-site") && calls[0].body.source === "portable" && calls[0].body.parts[0].message === "Le son coupe." && !JSON.stringify(calls[0]).match(/re_|KEY/), "site revenu : avis transmis, sans aucune clé");
    await relayFeedback(async () => { calls.push(1); return { ok: true, status: 201 }; });
    ok(calls.length === 1 && db.prepare("SELECT mailed_at FROM site_feedback").get().mailed_at, "pas de double envoi");
    // Export (dernier recours)
    const ex = await fetch(`${base}/api/feedback-export`);
    const j = await ex.json();
    ok(ex.status === 200 && /attachment/.test(ex.headers.get("content-disposition")) && j.avis.length === 1 && j.avis[0].parts[0].kind === "bug", "export de mes avis en fichier");
  } catch (e) { fails++; console.log("ERREUR", e); }
  server.close();
  console.log(fails ? `${fails} échec(s)` : "OK : relais des avis et paquets sans secret");
  process.exit(fails ? 1 : 0);
});
