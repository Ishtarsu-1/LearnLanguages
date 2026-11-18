#!/usr/bin/env node
// ============================================================
//  Pré-génère l'audio de toutes les phrases fixes du site (CORRECTIFS v0.4, lot 7.1)
//  Le contenu est fixe : rien ne doit être généré au premier clic.
//    npm run tts:pregen                          toutes les langues et voix configurées (.env)
//    npm run tts:pregen -- --lang en             une seule langue
//    npm run tts:pregen -- --voices af_heart,bf_emma
//    npm run tts:pregen -- --dry-run             compte seulement (déjà en cache / à générer)
//  À lancer après chaque ajout de contenu et avant chaque mise en ligne. Reprend là où il
//  s'est arrêté : ce qui est déjà en cache (DATA_DIR/tts) est sauté.
//  Appelle directement tts.generate() : pas de serveur web, pas de limite de débit.
// ============================================================
const path = require("node:path");
const ttsMod = require("../tts.js");
const { loadSite } = require("./load-site.js");

function parseArgs(argv) {
  const o = { lang: null, voices: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--lang") o.lang = argv[++i];
    else if (argv[i] === "--voices") o.voices = argv[++i].split(",").map((v) => v.trim()).filter(Boolean);
    else if (argv[i] === "--dry-run") o.dryRun = true;
    else throw new Error(`Option inconnue : ${argv[i]}`);
  }
  return o;
}
const fmtN = (n) => n.toLocaleString("fr-FR");
const fmtDur = (s) => (s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h`);

// Exporté pour les tests : { tts, sentences(lang), log } injectables
async function pregen({ tts, sentences, opts = {}, log = (l) => process.stdout.write(l) }) {
  const info = tts.info(), stats = { generated: 0, cached: 0, failed: 0, todo: 0 };
  const langs = Object.keys(info).filter((l) => !opts.lang || l === opts.lang);
  if (!langs.length) { log("Aucune voix serveur configurée (TTS_URL_EN / TTS_VOICES_EN… dans .env, voir SETUP.md).\n"); return stats; }
  for (const lang of langs) {
    const list = sentences(lang);
    const voices = info[lang].filter((v) => !opts.voices || opts.voices.includes(v));
    for (const voice of voices) {
      const todo = list.filter((t) => !tts.cached(lang, voice, t));
      stats.cached += list.length - todo.length; stats.todo += todo.length;
      log(`${lang} · ${voice} · ${fmtN(list.length)} phrases, ${fmtN(list.length - todo.length)} déjà en cache, ${fmtN(todo.length)} à générer\n`);
      if (opts.dryRun || !todo.length) continue;
      const t0 = Date.now();
      for (let i = 0; i < todo.length; i++) {
        try { await tts.generate(lang, voice, todo[i], "low"); stats.generated++; }
        catch (e) { stats.failed++; log(`\n  ⚠️  « ${todo[i].slice(0, 40)} » : ${e.message}\n`); if (stats.failed >= 5 && !stats.generated) { log("Le moteur ne répond pas : arrêt.\n"); return stats; } }
        const done = i + 1, left = ((Date.now() - t0) / done) * (todo.length - done) / 1000;
        log(`\r  ${lang} · ${voice} · ${fmtN(done)}/${fmtN(todo.length)}${done < todo.length ? ` · reste ~${fmtDur(left)}` : ""}   `);
      }
      log("\n");
    }
  }
  return stats;
}

if (require.main === module) {
  (async () => {
    const opts = parseArgs(process.argv.slice(2));
    const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
    const tts = ttsMod.create({ dir: path.join(DATA, "tts") });
    const site = loadSite();
    const t0 = Date.now();
    const s = await pregen({ tts, sentences: (lang) => site.run(`spokenSentences(${JSON.stringify(lang)})`), opts });
    console.log(opts.dryRun ? `\nÀ générer : ${fmtN(s.todo)} · déjà en cache : ${fmtN(s.cached)}` : `\n✓ ${fmtN(s.generated)} générée(s), ${fmtN(s.cached)} déjà en cache${s.failed ? `, ${s.failed} échec(s)` : ""} · ${fmtDur((Date.now() - t0) / 1000)}`);
    process.exit(s.failed ? 1 : 0);
  })().catch((e) => { console.error(e.message); process.exit(2); });
}
module.exports = { pregen, parseArgs };
