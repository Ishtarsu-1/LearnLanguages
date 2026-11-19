// ============================================================
//  Mochi — mini-CTF pour débutants (version portable construite avec --ctf UNIQUEMENT)
//  Le but : trouver la « phrase magique », coupée en deux drapeaux MOCHI{…}.
//   🚩 1. Reconnaissance : /robots.txt cache une page ; elle contient un message en base64.
//   🚩 2. Cookie : le « coffre » (/api/ctf/coffre) ne s'ouvre qu'avec le cookie mochi_role=admin.
//  Ces failles sont VOLONTAIRES et n'existent que si MOCHI_CTF=1 dans une version portable qui
//  n'écoute que sur 127.0.0.1 (l'ordinateur du joueur) : jamais sur un site en ligne.
//  Les drapeaux ne sont pas écrits en clair dans les fichiers (MOCHI_CTF_FLAGS, brouillés) : les
//  retrouver en lisant le code est possible, mais c'est un autre défi… (et ce n'est pas le jeu).
// ============================================================
const crypto = require("node:crypto");

const KEY = "mochi";
// Brouillage simple (XOR + base64) : pas de la sécurité, juste pour ne pas lire les drapeaux d'un coup d'œil
const scramble = (s) => Buffer.from([...Buffer.from(s, "utf8")].map((b, i) => b ^ KEY.charCodeAt(i % KEY.length))).toString("base64");
const unscramble = (s) => Buffer.from([...Buffer.from(s, "base64")].map((b, i) => b ^ KEY.charCodeAt(i % KEY.length))).toString("utf8");
// Tolérant : majuscules, espaces, accents (« ete » = « été »)
const norm = (f) => String(f || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
const hash = (f) => crypto.createHash("sha256").update(norm(f)).digest("hex");

const SECRET_PAGE = "/cachette-du-mochi.html";

function create({ env = process.env, portable = env.MOCHI_PORTABLE === "1", host = env.HOST } = {}) {
  const asked = env.MOCHI_CTF === "1";
  // Garde-fou : jamais en dehors d'une version portable qui n'écoute que la machine locale
  const enabled = asked && portable && (host === "127.0.0.1" || host === "localhost" || host === "::1");
  if (asked && !enabled) console.warn("⚠️  MOCHI_CTF ignoré : le mini-CTF n'existe que dans la version portable, sur 127.0.0.1.");
  let flags = [];
  if (enabled) {
    try { flags = JSON.parse(unscramble(env.MOCHI_CTF_FLAGS || "")); } catch { flags = []; }
    if (flags.length !== 2) { console.warn("⚠️  MOCHI_CTF_FLAGS absent ou invalide : mini-CTF désactivé."); flags = []; }
  }
  const on = enabled && flags.length === 2;
  const hashes = flags.map(hash);

  // Page « cachée » : HTML simple, sans script ni style inline (la CSP du site s'applique)
  const secretPage = () => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cachette du Mochi</title><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/styles.css"></head>
<body><main class="app"><section class="view"><div class="card">
<h1>🕵️ Bien joué, tu as trouvé la cachette !</h1>
<p>Les robots n'avaient pas le droit de venir ici… mais toi, si.</p>
<p>Voici un message codé. Il se termine souvent par « = » : ça te dit quelque chose ?</p>
<p><code>${Buffer.from(flags[0], "utf8").toString("base64")}</code></p>
<!-- Note pour plus tard : le coffre du professeur est rangé à /api/ctf/coffre. Il ne s'ouvre que pour les admins… et le site se souvient de ton rôle dans un petit gâteau 🍪 -->
<p class="muted"><small>Retour au site : <a href="/#/ctf">la page du défi</a>.</small></p>
</div></section></main></body></html>`;

  // Renvoie true si la requête a été traitée ici
  function handle(req, res, url, { send, fail }) {
    if (!on) return false;
    const p = url.pathname;
    if (req.method === "GET" && p === "/robots.txt") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end(`# Les robots n'ont rien à faire ici.\nUser-agent: *\nDisallow: ${SECRET_PAGE}\n`);
      return true;
    }
    if (req.method === "GET" && p === SECRET_PAGE) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(secretPage());
      return true;
    }
    if (req.method === "GET" && p === "/api/ctf/coffre") {
      const role = (String(req.headers.cookie || "").match(/(?:^|;\s*)mochi_role=([^;]*)/) || [])[1] || "(aucun)";
      if (decodeURIComponent(role).toLowerCase() !== "admin") { fail(res, 403, `🔒 Coffre réservé aux admins. Ton rôle actuel : ${decodeURIComponent(role)}.`); return true; }
      send(res, 200, { message: "🔓 Le coffre s'ouvre… Tu as trouvé le deuxième drapeau !", flag: flags[1] });
      return true;
    }
    if (req.method === "POST" && p === "/api/ctf/check") return false; // traité par checkFlag (corps JSON, CSRF)
    return false;
  }
  // Vérification d'un drapeau proposé (comparaison d'empreintes)
  function checkFlag(f) {
    const h = hash(f), i = hashes.indexOf(h);
    return { ok: i >= 0, which: i >= 0 ? i + 1 : null };
  }
  // Phrase magique, seulement quand les deux drapeaux ont été trouvés
  function magic(found) {
    if (!(Array.isArray(found) && found.length === 2 && found.every((f, i) => hash(f) === hashes[i]))) return null;
    return flags.map((f) => f.replace(/^MOCHI\{|\}$/g, "")).join(" ");
  }
  // Cookie de rôle (lisible et modifiable par le navigateur : c'est la faille à trouver)
  const roleCookie = () => (on ? "mochi_role=eleve; Path=/; SameSite=Lax" : null);
  return { on, handle, checkFlag, magic, roleCookie, SECRET_PAGE };
}

module.exports = { create, scramble, unscramble };
