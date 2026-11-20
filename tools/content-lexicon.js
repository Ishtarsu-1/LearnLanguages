#!/usr/bin/env node
// ============================================================
//  Enrichir le lexique (AMELIORATIONS v0.5, lot 2.2)
//    npm run content:lexicon -- --lang en                 propose les traductions manquantes
//    npm run content:lexicon -- --lang ko --target 1000   jusqu'à 1 000 lemmes (plan, puis fréquence)
//    Options : --engine ollama|anthropic, --batch 30, --dry-run
//  Mots à traduire : ceux des unités du plan absents du lexique, puis les plus fréquents de la
//  liste de fréquence, jusqu'à --target lemmes au total. Les traductions proposées par le LLM vont
//  dans content/lexicon/<langue>.proposals.json (todo_review), JAMAIS directement dans le lexique :
//  on les relit dans l'admin (#/admin/contenu/lexique), qui les ajoute au lexique une par une.
// ============================================================
const path = require("node:path");
const { z } = require("zod");
const L = require("./content-lib.js");
const P = require("./plan-lib.js");
const llm = require("../llm.js");

const LANG_NAMES = { en: "English", ko: "Korean", zh: "Mandarin Chinese", ru: "Russian" };
const Schema = z.object({ entries: z.array(z.object({ lemma: z.string(), fr: z.string() })) });
const SYSTEM = `You write a bilingual glossary for French speakers learning a language (A1-B1 learners).
For each lemma (dictionary form) give the most common French meaning(s): 1 to 4 words, at most 2 meanings separated by a comma.
Korean verbs and adjectives (ending in -다): French infinitive (« manger », « être grand »). Particles or grammatical words: a short explanation in parentheses.
Never invent: if a lemma is unclear, give its most frequent meaning. Return every lemma given, unchanged.`;

const proposalsFile = (lang, dir = L.CONTENT_DIR) => path.join(dir, "lexicon", `${lang}.proposals.json`);
function loadProposals(lang, dir) { try { return L.readJSON(proposalsFile(lang, dir)); } catch { return {}; } }

const EN_JUNK = new Set(["al", "gan", "de", "re", "co", "la", "non", "playe", "thinke", "develope", "growe"]);
// Mots à traduire, dans l'ordre : plan d'abord, puis fréquence
function wanted(lang, { target = 1000, dir = L.CONTENT_DIR } = {}) {
  const lex = L.loadLexicon(dir)[lang], prop = loadProposals(lang, dir), plan = L.loadPlan(lang, dir);
  const have = (w) => lex[w] || prop[w] || P.BASE[lang]?.has(w);
  const out = [], seen = new Set();
  // Anglais : pas de lettres seules ni de lemmes mal coupés par la liste de fréquence (« playe », « thinke »…)
  const junk = (w) => lang === "en" && (w.length < 2 || EN_JUNK.has(w));
  const push = (w, unit) => { if (!w || seen.has(w) || have(w) || junk(w)) return; seen.add(w); out.push({ lemma: w, unit }); };
  for (const u of plan.units) for (const w of [...(u.new_words || []), ...(u.review_words || [])]) push(w, u.unit);
  const room = Math.max(0, target - Object.keys(lex).length - Object.keys(prop).length);
  for (const f of L.loadFreq(lang, dir)) { if (out.length >= room) break; if (!(lang === "en" && f.cog)) push(f.lemma, null); }
  return out; // les mots du plan passent toujours (même au-delà de la cible) : les textes en ont besoin
}

async function propose(lang, { target = 1000, batch = 30, engine, model, dryRun, log = (s) => process.stdout.write(s), dir = L.CONTENT_DIR } = {}) {
  const todo = wanted(lang, { target, dir });
  log(`${lang} : ${Object.keys(L.loadLexicon(dir)[lang]).length} lemmes, ${Object.keys(loadProposals(lang, dir)).length} propositions en attente, ${todo.length} à traduire\n`);
  if (dryRun || !todo.length) return { done: 0, todo: todo.length };
  let done = 0;
  for (let i = 0; i < todo.length; i += batch) {
    const part = todo.slice(i, i + batch);
    try {
      const r = await llm.structured({ system: SYSTEM, schema: Schema, engine, model, temperature: 0.1, effort: "low",
        user: `Language: ${LANG_NAMES[lang]}\nLemmas:\n${part.map((x) => x.lemma).join("\n")}` });
      const prop = loadProposals(lang, dir); // relu à chaque lot : on peut valider dans l'admin pendant ce temps
      for (const e of r.entries) {
        const w = part.find((x) => x.lemma === e.lemma.trim());
        if (w && e.fr.trim() && e.fr.length <= 80) { prop[w.lemma] = { fr: e.fr.trim(), todo_review: true, ...(w.unit ? { unit: w.unit } : {}) }; done++; }
      }
      L.writeJSON(proposalsFile(lang, dir), prop);
      log(`  ${Math.min(i + batch, todo.length)}/${todo.length}\n`);
    } catch (e) { log(`  lot ${i / batch + 1} : ${e.message}\n`); if (e instanceof llm.LlmUnavailable && /clé|injoignable|ne répond pas|absent/.test(e.message)) throw e; }
  }
  return { done, todo: todo.length };
}

if (require.main === module) {
  const a = process.argv.slice(2), get = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const lang = get("--lang");
  if (!L.LANGS.includes(lang)) { console.error("Usage : npm run content:lexicon -- --lang en|ko [--target 1000] [--engine anthropic] [--dry-run]"); process.exit(2); }
  propose(lang, { target: Number(get("--target", 1000)), batch: Number(get("--batch", 30)), engine: get("--engine"), model: get("--model"), dryRun: a.includes("--dry-run") })
    .then((r) => console.log(`✓ ${r.done} traduction(s) proposée(s) : à relire dans l'admin (#/admin/contenu/lexique).`))
    .catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}
module.exports = { propose, wanted, loadProposals, proposalsFile };
