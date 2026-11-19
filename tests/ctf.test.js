// Mini-CTF (ctf-server.js) : le défi se joue de bout en bout, et rien n'existe hors du mode CTF.
const fs = require("fs"), path = require("path"), os = require("os");
const { spawn } = require("child_process");
const { create, scramble, unscramble } = require("../ctf-server.js");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("  ok", m); };
// Drapeaux d'essai (les vrais sont dans le .env de l'auteur, jamais dans le dépôt public)
const FLAGS = ["MOCHI{premier drapeau}", "MOCHI{deuxième drapeau trouvé}"];

function start(env) {
  const port = 20000 + Math.floor(Math.random() * 20000), data = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-ctf-"));
  const p = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: data, MAIL_QUIET: "1", MOCHI_LLM: "off", MOCHI_OPEN_BROWSER: "0", ...env }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  const ready = (async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); } throw new Error("serveur"); })();
  return { base, ready, stop: () => new Promise((r) => { p.on("exit", () => { fs.rmSync(data, { recursive: true, force: true }); r(); }); p.kill(); }) };
}
const post = (base, url, body) => fetch(base + url, { method: "POST", headers: { "X-Mochi": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, data: await r.json() }));

(async () => {
  // Garde-fous : jamais hors d'une version portable sur 127.0.0.1, jamais sans drapeaux valides
  const warn = console.warn; console.warn = () => {};
  const F = scramble(JSON.stringify(FLAGS));
  ok(unscramble(F) === JSON.stringify(FLAGS) && !F.includes("premier"), "drapeaux brouillés dans les réglages (pas en clair)");
  ok(!create({ env: { MOCHI_CTF: "1", MOCHI_CTF_FLAGS: F }, portable: false, host: "127.0.0.1" }).on, "pas de CTF hors version portable");
  ok(!create({ env: { MOCHI_CTF: "1", MOCHI_CTF_FLAGS: F }, portable: true, host: "0.0.0.0" }).on, "pas de CTF si le site écoute le réseau");
  ok(!create({ env: { MOCHI_CTF: "1", MOCHI_CTF_FLAGS: "n'importe quoi" }, portable: true, host: "127.0.0.1" }).on, "pas de CTF sans drapeaux valides");
  console.warn = warn;

  // Le défi, de bout en bout
  const s = start({ MOCHI_PORTABLE: "1", MOCHI_CTF: "1", MOCHI_CTF_FLAGS: F });
  try {
    await s.ready;
    const me = await (await fetch(`${s.base}/api/me`)).json();
    ok(me.features.ctf === true, "le site annonce le mode CTF");
    const home = await fetch(`${s.base}/`);
    ok(/mochi_role=eleve/.test(home.headers.get("set-cookie") || "") && !/HttpOnly/i.test(home.headers.get("set-cookie")), "cookie de rôle « eleve », lisible par le navigateur (la faille à trouver)");
    const robots = await (await fetch(`${s.base}/robots.txt`)).text();
    const page = robots.match(/Disallow: (\S+)/)?.[1];
    ok(page === "/cachette-du-mochi.html", "drapeau 1 : robots.txt mène à la cachette");
    const r = await fetch(s.base + page), html = await r.text();
    const b64 = html.match(/<code>([A-Za-z0-9+/=]+)<\/code>/)?.[1];
    ok(Buffer.from(b64, "base64").toString("utf8") === FLAGS[0] && !html.includes("premier"), "drapeau 1 : message base64 dans la cachette (pas en clair)");
    ok(/script-src 'self'/.test(r.headers.get("content-security-policy") || "") && html.includes("/api/ctf/coffre"), "la cachette garde la CSP du site, et indique le coffre en commentaire");
    let c = await fetch(`${s.base}/api/ctf/coffre`, { headers: { Cookie: "mochi_role=eleve" } });
    ok(c.status === 403 && /Ton rôle actuel : eleve/.test((await c.json()).error), "drapeau 2 : coffre fermé pour un élève");
    c = await fetch(`${s.base}/api/ctf/coffre`, { headers: { Cookie: "mochi_role=admin" } });
    ok(c.status === 200 && (await c.json()).flag === FLAGS[1], "drapeau 2 : coffre ouvert avec mochi_role=admin");
    ok((await post(s.base, "/api/ctf/check", { flag: "MOCHI{faux}" })).data.ok === false, "faux drapeau refusé");
    ok((await post(s.base, "/api/ctf/check", { flag: "mochi{PREMIER  drapeau}" })).data.which === 1, "drapeau 1 accepté (majuscules, espaces)");
    ok((await post(s.base, "/api/ctf/check", { flag: "MOCHI{deuxieme drapeau trouve}" })).data.which === 2, "drapeau 2 accepté sans accent");
    ok((await post(s.base, "/api/ctf/magic", { flags: [FLAGS[0], "x"] })).status === 403, "pas de phrase magique avec un seul drapeau");
    ok((await post(s.base, "/api/ctf/magic", { flags: FLAGS })).data.phrase === "premier drapeau deuxième drapeau trouvé", "phrase magique avec les deux drapeaux");
  } catch (e) { fails++; console.log("ERREUR", e); }
  await s.stop();

  // Site normal : aucune de ces failles volontaires n'existe
  const n = start({});
  try {
    await n.ready;
    ok((await fetch(`${n.base}/robots.txt`)).status === 404 && (await fetch(`${n.base}/cachette-du-mochi.html`)).status === 404, "site normal : ni robots.txt ni cachette");
    ok((await fetch(`${n.base}/api/ctf/coffre`, { headers: { Cookie: "mochi_role=admin" } })).status !== 200, "site normal : pas de coffre");
    { const v = await post(n.base, "/api/ctf/check", { flag: FLAGS[0] }); ok(v.status !== 200 && v.data.ok === undefined, "site normal : pas de vérification de drapeaux"); }
    ok(!/mochi_role/.test((await fetch(`${n.base}/`)).headers.get("set-cookie") || ""), "site normal : pas de cookie de rôle");
    ok((await (await fetch(`${n.base}/api/me`)).json()).features.ctf === false, "site normal : mode CTF annoncé désactivé");
  } catch (e) { fails++; console.log("ERREUR", e); }
  await n.stop();
  console.log(fails ? `${fails} échec(s)` : "OK : mini-CTF");
  process.exit(fails ? 1 : 0);
})();
