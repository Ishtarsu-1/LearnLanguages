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
  // Constructeur : cibles connues, fichiers inutiles exclus
  const { TARGETS } = require("../tools/portable.js");
  ok(["win", "linux", "mac"].every((k) => TARGETS[k]) && TARGETS.win.out === "node.exe", "cibles Windows, Linux, macOS");
  console.log(fails ? `${fails} échec(s)` : "OK : version portable");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("ERREUR", e); process.exit(1); });
