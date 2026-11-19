// Version portable (tools/portable.js) : voix « cache seulement » et site en mode solo.
const fs = require("fs"), path = require("path"), os = require("os");
const ttsMod = require("../tts.js");
const { loadSite } = require("../tools/load-site.js");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("  ok", m); };

(async () => {
  // Voix : seulement l'audio pré-généré, pas de moteur
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-tts-cache-"));
  const env = { TTS_CACHE_ONLY: "1", TTS_VOICES_ZH: "zm_yunxi", TTS_MODEL_ZH: "kokoro" };
  const t = ttsMod.create({ dir, env, fetchImpl: () => { throw new Error("aucun moteur ne doit être appelé"); } });
  ok(t.enabled && t.cacheOnly && JSON.stringify(t.info()) === '{"zh":["zm_yunxi"]}', "voix annoncées sans moteur");
  const ref = ttsMod.create({ dir, env: { TTS_URL_ZH: "http://x", TTS_VOICES_ZH: "zm_yunxi", TTS_MODEL_ZH: "kokoro" } });
  const stem = ref.cached("zh", "zm_yunxi", "你好") || path.join(dir, require("crypto").createHash("sha256").update("kokoro\nzh\nzm_yunxi\n你好").digest("hex"));
  fs.writeFileSync(`${stem}.mp3`, Buffer.alloc(200, 1));
  ok((await t.generate("zh", "zm_yunxi", "你好")) === `${stem}.mp3`, "audio pré-généré servi (même clé de cache que la machine qui l'a produit)");
  await t.generate("zh", "zm_yunxi", "pas pré-générée").then(() => ok(false, "génération"), (e) => ok(e.cacheMiss === true, "phrase absente : « pas d'audio » (voix de l'ordinateur), aucun moteur appelé"));
  ok(!ttsMod.create({ dir, env: { TTS_VOICES_ZH: "zm_yunxi" } }).enabled, "sans TTS_CACHE_ONLY ni URL : pas de voix serveur");
  fs.rmSync(dir, { recursive: true });

  // Site : mode solo (pas d'amis, pas de comptes), mention de la version portable
  const site = loadSite();
  site.run(`features = { ...features, portable: true }`);
  ok(site.run(`viewFriends()`).includes("version portable") && site.run(`socialCard()`) === "", "amis et défis : expliqués, pas proposés");
  ok(site.run(`viewProfile()`).includes("Version portable de Mochi") && !site.run(`viewProfile()`).includes('href="#/inscription"'), "profil : pas de compte, progression sur cet ordinateur");
  // Page du mini-CTF : seulement si le serveur l'annonce
  ok(site.run(`viewCtf()`).includes("Page introuvable") || !site.run(`viewCtf()`).includes("Drapeau 1"), "pas de page CTF hors mode CTF");
  site.run(`features = { ...features, ctf: true }`);
  const v = site.run(`viewCtf()`);
  ok(v.includes("Drapeau 1") && v.includes("Drapeau 2") && v.includes('data-act="ctf-hint"') && v.includes('data-ctf="1"') && !/MOCHI\{[^…]/.test(v), "page du défi : règles, indices, saisie, aucun drapeau en clair");
  site.run(`actions["ctf-hint"]({ dataset: { i: "0" } })`);
  ok(site.run(`viewCtf()`).includes("robots des moteurs de recherche"), "indices progressifs");
  ok(!/MOCHI\{[^…]/.test(require("fs").readFileSync(require("path").join(__dirname, "..", "ctf.js"), "utf8")), "ctf.js ne contient pas de drapeau");
  // Constructeur : cibles connues, fichiers inutiles exclus
  const { TARGETS } = require("../tools/portable.js");
  ok(["win", "linux", "mac"].every((k) => TARGETS[k]) && TARGETS.win.out === "node.exe", "cibles Windows, Linux, macOS");
  // Version mobile : site sans serveur, audio statique nommé par la même empreinte des deux côtés
  const { audioKey, siteFiles } = require("../tools/portable.js");
  const s2 = loadSite();
  ok(["en\nvoix\nHello!", "ko\nv\n안녕하세요", "zh\nzm_yunxi\n你好"].every((t) => s2.run(`audioKey(${JSON.stringify(t)})`) === audioKey(t)), "même empreinte audio côté site et côté constructeur");
  const k = audioKey("en\naf_heart\nHello there.");
  s2.run(`features = { static: true, portable: true, tts: { en: ["af_heart"] }, audio: { ${JSON.stringify(k)}: "mp3" } }`);
  ok(s2.run(`ttsUrl("  Hello there. ", "en", "af_heart")`) === `audio/${k}.mp3` && s2.run(`ttsUrl("Pas là.", "en", "af_heart")`) === null, "audio statique : fichier connu, sinon voix de l'appareil");
  ok(s2.run(`viewProfile()`).includes("Version mobile de Mochi"), "profil : version mobile");
  const sf = siteFiles();
  ok(sf.includes("index.html") && sf.includes("sw.js") && sf.includes("icons/apple-touch-icon.png") && sf.some((f) => f.endsWith(".woff2")) && !sf.some((f) => /server|\.env|^tools\//.test(f)), "fichiers du site mobile : ceux du navigateur, rien du serveur");
  console.log(fails ? `${fails} échec(s)` : "OK : version portable");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("ERREUR", e); process.exit(1); });
