#!/usr/bin/env node
// ============================================================
//  Sortie d'une version du contenu (CONTENU-PIPELINE, lot C7)
//    npm run content:release              vérifie → construit → pré-génère l'audio → rapport
//    npm run content:release -- --no-audio   sans la pré-génération (machine sans voix)
//  1. content:check : aucun texte publié ne doit avoir de problème bloquant (sinon arrêt) ;
//  2. content:build : content.data.js à jour ;
//  3. tts:pregen : audio des phrases pas encore en cache (seulement les nouvelles) ;
//  4. rapport : textes, mots fréquents couverts, phrases audio générées.
//  Ensuite : envoyer data/tts/ sur le serveur (SETUP.md, « Produire du contenu »).
// ============================================================
const path = require("node:path");
const L = require("./content-lib.js");
const { checkText, report } = require("./content-check.js");
const { build } = require("./content-build.js");

async function release({ audio = true, log = console.log, pregenImpl } = {}) {
  // 1. Vérification
  log("1/4 · Vérification des textes publiés");
  const all = L.loadKind("texts");
  const bad = [];
  let warned = 0;
  for (const lang of L.LANGS) for (const t of all[lang]) {
    const r = checkText(t, { others: new Set(all[lang].filter((x) => x !== t).map((x) => x.id)) });
    if (r.blocking.length) { bad.push(t.id); log(report(t, r)); } else if (r.warnings.length) warned++;
  }
  if (bad.length) return { ok: false, step: "check", error: `${bad.length} texte(s) publié(s) avec un problème bloquant : ${bad.join(", ")}` };
  log(`   ✓ ${L.LANGS.reduce((n, l) => n + all[l].length, 0)} texte(s) sans problème bloquant${warned ? ` (${warned} avec avertissements)` : ""}`);
  // 2. Build
  log("2/4 · Construction de content.data.js");
  const b = build({ log: (s) => log(`   ${s}`) });
  if (!b.ok) return { ok: false, step: "build", error: b.errors.join(" ; ") };
  // 3. Audio
  let audioStats = null;
  if (audio) {
    log("3/4 · Pré-génération de l'audio (nouvelles phrases seulement)");
    audioStats = await (pregenImpl || defaultPregen)((s) => process.stdout.write(`   ${s}`));
  } else log("3/4 · Audio : ignoré (--no-audio)");
  // 4. Rapport
  log("4/4 · Rapport");
  const lines = [];
  for (const lang of L.LANGS) {
    const texts = all[lang], freq = L.loadFreq(lang);
    const books = [...L.loadKind("books")[lang], ...L.loadKind("story")[lang]];
    const seen = new Set([...texts.flatMap((t) => L.textLemmas(t.sentences, lang)), ...books.flatMap((x) => x.chapters.flatMap((c) => L.textLemmas(c.sentences, lang)))]);
    const top = freq.slice(0, 1000).filter((f) => !(lang === "en" && f.cog));
    const byLevel = texts.reduce((m, t) => ((m[t.level] = (m[t.level] || 0) + 1), m), {});
    lines.push(`   ${lang} : ${texts.length} textes (${Object.entries(byLevel).map(([k, v]) => `${k} ${v}`).join(", ")}), ${books.length} livre(s) et histoire(s), ${top.filter((f) => seen.has(f.lemma)).length} / ${top.length} des 1 000 mots les plus fréquents vus, ${L.loadDrafts().filter((d) => d.lang === lang).length} brouillon(s) en attente`);
  }
  if (audioStats) lines.push(`   audio : ${audioStats.generated} phrase(s) générée(s), ${audioStats.cached} déjà en cache${audioStats.failed ? `, ${audioStats.failed} échec(s)` : ""}`);
  lines.forEach((l) => log(l));
  log("\n→ Mise en ligne : envoie content.data.js (commit) et le dossier data/tts/ sur le serveur (voir SETUP.md, « Produire du contenu »).");
  return { ok: true, audio: audioStats, report: lines };
}

async function defaultPregen(log) {
  const ttsMod = require("../tts.js");
  const { pregen } = require("./pregen-tts.js");
  const { loadSite } = require("./load-site.js");
  const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
  const tts = ttsMod.create({ dir: path.join(DATA, "tts") });
  const site = loadSite(); // relu APRÈS le build : les nouvelles phrases sont incluses
  return pregen({ tts, sentences: (lang) => site.run(`spokenSentences(${JSON.stringify(lang)})`), log });
}

if (require.main === module) {
  release({ audio: !process.argv.includes("--no-audio") }).then((r) => {
    if (!r.ok) { console.error(`\n✗ Arrêt à l'étape « ${r.step} » : ${r.error}`); process.exit(1); }
    process.exit(r.audio?.failed ? 1 : 0);
  }).catch((e) => { console.error(e.message); process.exit(2); });
}
module.exports = { release };
