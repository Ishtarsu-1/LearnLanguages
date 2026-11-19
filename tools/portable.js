#!/usr/bin/env node
// ============================================================
//  Version portable de Mochi : un dossier (et un .zip) à donner à un ami, qui double-clique sur
//  « Lancer Mochi » : le site s'ouvre dans son navigateur, sans rien installer.
//    npm run portable                          Windows (x64)
//    npm run portable -- --os linux            Linux (x64)       --os mac   macOS (Apple Silicon)
//    npm run portable -- --with-feedback       les avis des testeurs t'arrivent par e-mail (voir plus bas)
//    npm run portable -- --no-audio            sans l'audio pré-généré (paquet beaucoup plus léger)
//  Contenu : Node.js officiel pour le système visé (téléchargé une fois, mis en cache), le site et
//  ses dépendances de production, l'audio déjà pré-généré sur CE PC pour les voix configurées
//  (licence libre uniquement), un lanceur, une notice. Pas de moteur de voix ni d'IA : voix
//  pré-générées (sinon celle de l'ordinateur) et correcteur hors ligne. Pas d'amis ni de comptes.
//  --with-feedback : copie FEEDBACK_TO et RESEND_API_KEY dans le paquet. Avec l'expéditeur de test
//  de Resend (onboarding@resend.dev), cette clé ne peut écrire QU'À l'adresse du compte Resend :
//  au pire, quelqu'un pourrait t'envoyer des e-mails. Crée une clé dédiée (« Sending access »),
//  révocable après la bêta.
// ============================================================
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
// Mini-CTF (--ctf) : les deux drapeaux viennent du .env (MOCHI_CTF_FLAG1, MOCHI_CTF_FLAG2), JAMAIS
// du code : le dépôt est public, la phrase magique ne doit pas s'y trouver.
const ctfFlags = () => {
  const f = [process.env.MOCHI_CTF_FLAG1, process.env.MOCHI_CTF_FLAG2].map((x) => String(x || "").trim());
  if (!f.every((x) => /^MOCHI\{.+\}$/.test(x))) throw new Error("--ctf : mets MOCHI_CTF_FLAG1 et MOCHI_CTF_FLAG2 dans ton .env (forme MOCHI{…}), jamais dans le code.");
  return f;
};
const PORT = 47800;
const TARGETS = {
  win: { node: (v) => `node-${v}-win-x64.zip`, bin: (v) => `node-${v}-win-x64/node.exe`, out: "node.exe" },
  linux: { node: (v) => `node-${v}-linux-x64.tar.xz`, bin: (v) => `node-${v}-linux-x64/bin/node`, out: "node" },
  mac: { node: (v) => `node-${v}-darwin-arm64.tar.gz`, bin: (v) => `node-${v}-darwin-arm64/bin/node`, out: "node" },
};
// Fichiers du dépôt qui ne servent pas à faire tourner le site
const EXCLUDE = [/^tools\/portable\.js$/, /^tests\//, /^docs\//, /^deploy\//, /^\.github\//, /^content\/drafts\//, /^tools\/.*\.py$/, /^tools\/start-voices/, /^playwright\.config\.js$/, /^\.env/, /\.md$/];

function args(argv) {
  const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const o = { ctf: argv.includes("--ctf"), os: get("--os", "win"), out: path.resolve(get("--out", path.join(ROOT, "dist"))), feedback: argv.includes("--with-feedback"), audio: !argv.includes("--no-audio"), zip: !argv.includes("--no-zip") };
  if (!TARGETS[o.os]) throw new Error("--os win | linux | mac");
  return o;
}
const log = (s) => console.log(s);

async function nodeBinary(target, cacheDir = path.join(os.homedir(), ".cache", "mochi-portable")) {
  // Dernière version 22 LTS (node:sqlite sans option depuis 22.13)
  const index = await (await fetch("https://nodejs.org/dist/index.json")).json();
  const v = index.find((x) => x.version.startsWith("v22.") && x.lts).version;
  const T = TARGETS[target], file = path.join(cacheDir, T.node(v));
  fs.mkdirSync(cacheDir, { recursive: true });
  if (!fs.existsSync(file)) {
    log(`  Téléchargement de Node ${v} (${target})…`);
    const r = await fetch(`https://nodejs.org/dist/${v}/${T.node(v)}`);
    if (!r.ok) throw new Error(`Téléchargement de Node : HTTP ${r.status}`);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-node-"));
  execFileSync("bsdtar", ["-xf", file, "-C", tmp, T.bin(v)]); // n'extrait que le binaire
  return { v, path: path.join(tmp, T.bin(v)), name: T.out };
}

// L'audio déjà en cache pour les voix configurées (licence libre, assez complètes)
function audioFiles() {
  const ttsMod = require("../tts.js"), { loadSite } = require("./load-site.js"), hw = require("../hardware.js");
  const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
  const tts = ttsMod.create({ dir: path.join(DATA, "tts") });
  const site = loadSite(), files = new Set(), env = {};
  for (const [lang, voices] of Object.entries(tts.info())) {
    const list = site.run(`spokenSentences(${JSON.stringify(lang)})`), model = tts.conf[lang].model, kept = [];
    for (const voice of voices) {
      const lic = hw.voiceLicense(model, voice);
      if (lic && !lic.ok) { log(`  ${lang} · ${voice} : écartée (${lic.license})`); continue; }
      const hits = list.map((t) => tts.cached(lang, voice, t)).filter(Boolean);
      if (hits.length < list.length * 0.5) { log(`  ${lang} · ${voice} : écartée (${hits.length}/${list.length} phrases pré-générées ; npm run tts:pregen)`); continue; }
      hits.forEach((f) => files.add(f)); kept.push(voice);
      log(`  ${lang} · ${voice} : ${hits.length}/${list.length} phrases`);
    }
    if (kept.length) { env[`TTS_VOICES_${lang.toUpperCase()}`] = kept.join(","); env[`TTS_MODEL_${lang.toUpperCase()}`] = model; }
  }
  return { files: [...files], env };
}

const BAT = `@echo off\r
chcp 65001 >nul\r
title Mochi\r
cd /d "%~dp0"\r
set "DATA_DIR=%~dp0donnees"\r
echo Mochi demarre... Le site va s'ouvrir dans ton navigateur.\r
echo Laisse cette fenetre ouverte pendant que tu utilises Mochi, ferme-la pour l'arreter.\r
"%~dp0node\\node.exe" --disable-warning=ExperimentalWarning --env-file="%~dp0app\\portable.env" "%~dp0app\\server.js"\r
if errorlevel 1 pause\r
`;
const SH = `#!/bin/sh
# Lance Mochi (version portable) : le site s'ouvre dans le navigateur. Ctrl+C pour l'arrêter.
cd "$(dirname "$0")" || exit 1
export DATA_DIR="$PWD/donnees"
exec ./node/node --disable-warning=ExperimentalWarning --env-file=app/portable.env app/server.js
`;
const README = (o, nodeV, voices) => `MOCHI : VERSION PORTABLE
========================

Pour lancer Mochi : ${o.os === "win" ? "double-clique sur « Lancer Mochi.bat »" : o.os === "mac" ? "double-clique sur « Lancer Mochi.command » (la première fois : clic droit › Ouvrir)" : "lance ./lancer-mochi.sh"}.
Le site s'ouvre tout seul dans ton navigateur (adresse : http://127.0.0.1:${PORT}).
Laisse la fenêtre noire ouverte pendant que tu utilises Mochi ; ferme-la pour arrêter.
${o.os === "win" ? `
Windows peut afficher « Windows a protégé votre ordinateur » : clique sur « Informations
complémentaires » puis « Exécuter quand même » (le lanceur n'est pas signé, c'est normal).
` : ""}
Ta progression est enregistrée dans le dossier « donnees » : ne le supprime pas.
Pour passer à une nouvelle version, recopie ce dossier « donnees » dans la nouvelle.

Ce qui marche : tout le parcours (lire, réviser, exercices, écrire, Hangul, thèmes…),
avec les vraies voix sur tout le contenu${voices ? "" : " (voix de l'ordinateur)"}. Correcteur hors ligne (pas d'IA).
Ce qui ne marche pas dans cette version : les comptes, les amis, les défis et les duels.

${o.ctf ? `🕵️ LE DÉFI : une phrase magique est cachée dans ce site, coupée en deux drapeaux
MOCHI{…}. Clique sur « 🚩 Défi CTF » en haut du site pour les règles et les indices.
Tout se passe dans le navigateur (de préférence Chrome ou Firefox) : interdit d'ouvrir
les fichiers du dossier « app », ce serait trop facile. Bonus : une vraie faille trouvée
dans Mochi ? Envoie-la avec le bouton 💬 (type « Un bug »).

` : ""}Un avis, un bug, une idée ? Bouton « ${o.ctf ? "💬" : "Bêta · ton avis 💬"} » en haut du site.${o.feedback ? "" : "\n(Dans cette version, les avis restent sur ton ordinateur : envoie-les aussi par message.)"}
Merci de tester Mochi ! 🍡

(Node.js ${nodeV}, licence MIT. Contenus de Mochi : CC BY 4.0. Crédits complets dans le site.)
`;

async function build(o) {
  const name = `Mochi-portable-${o.os}${o.ctf ? "-ctf" : ""}`, dir = path.join(o.out, name), app = path.join(dir, "app");
  log(`📦 ${name}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(app, { recursive: true });
  // 1. Le site (fichiers suivis par git, sans tests ni docs)
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f && !EXCLUDE.some((re) => re.test(f)) && fs.existsSync(path.join(ROOT, f)));
  for (const f of tracked) { fs.mkdirSync(path.dirname(path.join(app, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(app, f)); }
  log(`  ${tracked.length} fichiers du site`);
  // 2. Dépendances de production
  execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: app, stdio: "inherit", shell: process.platform === "win32" });
  // 3. Node.js
  const node = await nodeBinary(o.os);
  fs.mkdirSync(path.join(dir, "node"));
  fs.copyFileSync(node.path, path.join(dir, "node", node.name));
  fs.chmodSync(path.join(dir, "node", node.name), 0o755);
  log(`  Node ${node.v}`);
  // 4. Audio pré-généré
  let audio = { files: [], env: {} };
  if (o.audio) {
    audio = audioFiles();
    fs.mkdirSync(path.join(dir, "donnees", "tts"), { recursive: true });
    for (const f of audio.files) fs.copyFileSync(f, path.join(dir, "donnees", "tts", path.basename(f)));
    log(`  ${audio.files.length} fichiers audio`);
  } else fs.mkdirSync(path.join(dir, "donnees"), { recursive: true });
  // 5. Réglages
  const env = { MOCHI_PORTABLE: "1", HOST: "127.0.0.1", PORT: String(PORT), MOCHI_LLM: "off", MAIL_QUIET: "1", MOCHI_LANGS_STABLE: process.env.MOCHI_LANGS_STABLE || "en,ko", ...(audio.files.length ? { TTS_CACHE_ONLY: "1", ...audio.env } : {}) };
  // Mini-CTF (ctf-server.js) : la phrase magique en deux drapeaux, brouillée dans les réglages
  if (o.ctf) {
    const { scramble } = require("../ctf-server.js");
    Object.assign(env, { MOCHI_CTF: "1", MOCHI_CTF_FLAGS: scramble(JSON.stringify(ctfFlags())) });
    log("  Mini-CTF activé (2 drapeaux)");
  }
  if (o.feedback) {
    if (!process.env.FEEDBACK_TO || !process.env.RESEND_API_KEY) throw new Error("--with-feedback : FEEDBACK_TO et RESEND_API_KEY doivent être dans ton .env");
    Object.assign(env, { FEEDBACK_TO: process.env.FEEDBACK_TO, RESEND_API_KEY: process.env.RESEND_API_KEY, FEEDBACK_MAIL: "each" });
    log("  Avis envoyés par e-mail à FEEDBACK_TO (clé Resend incluse : voir l'en-tête de tools/portable.js)");
  }
  fs.writeFileSync(path.join(app, "portable.env"), `# Réglages de la version portable (générés par tools/portable.js)\n${Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n")}\n`);
  // 6. Lanceur et notice
  if (o.os === "win") fs.writeFileSync(path.join(dir, "Lancer Mochi.bat"), BAT);
  else { const f = path.join(dir, o.os === "mac" ? "Lancer Mochi.command" : "lancer-mochi.sh"); fs.writeFileSync(f, SH); fs.chmodSync(f, 0o755); }
  fs.writeFileSync(path.join(dir, "LISEZMOI.txt"), README(o, node.v, audio.files.length > 0).replace(/\n/g, o.os === "win" ? "\r\n" : "\n"));
  // 7. Archive
  let zip = null;
  if (o.zip) {
    zip = path.join(o.out, `${name}.zip`);
    fs.rmSync(zip, { force: true });
    execFileSync("zip", ["-qr", "-X", zip, name], { cwd: o.out });
  }
  const size = (p) => Number(execFileSync("du", ["-sb", p], { encoding: "utf8" }).split("\t")[0]);
  log(`✓ ${dir} (${Math.round(size(dir) / 1e6)} Mo)${zip ? `\n✓ ${zip} (${Math.round(fs.statSync(zip).size / 1e6)} Mo) : à envoyer` : ""}`);
  return { dir, zip };
}

if (require.main === module) build(args(process.argv.slice(2))).catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
module.exports = { build, TARGETS };
