#!/usr/bin/env node
// ============================================================
//  Vérification automatique des textes (CONTENU-PIPELINE, lot C5)
//    npm run content:check                    tout content/ : textes publiés (échec si bloquant) + brouillons
//    npm run content:check -- drafts/x.json   un fichier
//    npm run content:check -- --write         enregistre le rapport dans chaque brouillon (checks)
//  Bloquant (rouge) : couverture < 90 %, mots nouveaux hors unité ou hors bornes 3-8,
//  interférence, registre (coréen), romanisation (coréen), format.
//  Avertissement (orange) : couverture hors 92-98 %, répétition, lexique, grammaire ciblée, longueur.
//
//  Couverture d'une unité : on compte comme inconnue la 1re occurrence de chaque mot nouveau
//  de l'unité (les suivantes se lisent grâce au glossaire et à la carte créée) et toutes les
//  occurrences des mots hors programme. Sinon un texte A1 de ~50 mots avec 3 mots nouveaux
//  répétés 2 fois ne pourrait jamais atteindre 92 %.
// ============================================================
const path = require("node:path");
const L = require("./content-lib.js");
const P = require("./plan-lib.js");
const { groupOf } = require("./plan-suggest.js");
const { koRegister } = require("../llm.js");

// Bornes par niveau : phrases par texte, mots par phrase (moyenne)
const LENGTH = { A1: [6, 10, 9], A2: [10, 16, 12], B1: [15, 25, 16], B2: [20, 35, 22] };
const LATIN_OK = new Set(["TV", "PC", "KTX", "SNS", "OK", "K", "DJ", "CD", "DVD", "USB", "PD", "CEO", "IT", "AI"]);
// Formules figées en 합니다체, normales même dans un texte en 해요체
const KO_FORMULAS = new Set(["감사하다", "실례하다", "죄송하다", "반갑다", "축하하다", "수고하다", "먹다", "안녕하다", "부탁하다", "알다"]);
const FORMAL_GRAMMAR = { hamnida: "formal", banmal: "plain" };
// Mots grammaticaux anglais (exclus du calcul « mots pleins »)
const EN_FUNCTION = new Set("a an the and or but so if as of to in on at for with from by up out into than then i you he she it we they me us him her them my your his its our their this that these those be have do can will would not no yes what who which when where how there here".split(" "));
// Noms souvent employés au sens général : « I like coffee », jamais « I like the coffee »
const EN_GENERAL_NOUNS = "coffee|tea|music|cinema|chocolate|sport|sports|football|tennis|jazz|rock|pasta|bread|milk|water|art|dance|games|movies|films|books|cats|dogs|nature|cooking|reading|series";
const EN_LIKE_THE = new RegExp(`\\b(like|likes|love|loves|hate|hates|prefer|prefers|adore|adores)\\s+the\\s+(${EN_GENERAL_NOUNS})\\b`, "gi");

// Registre attendu d'une unité : 해요체, sauf unité de phase 3 sur 반말 / 합니다체
const expectedRegister = (unit) => (unit?.grammar || []).map((g) => FORMAL_GRAMMAR[g]).find(Boolean) || "haeyo";

// Propositions d'une phrase annotée (coupées après . ! ? …) : leurs mots
function clauses(src, lang) {
  const out = [[]];
  for (const w of L.parseWords(src, lang)) { out.at(-1).push(w); if (/[.!?…]/.test(w.post)) out.push([]); }
  return out.filter((c) => c.length);
}
function checkRegister(sentences, want) {
  const bad = [];
  sentences.forEach(([src], i) => {
    for (const c of clauses(src, "ko")) {
      const last = c.at(-1), surface = last.segs.map((g) => g.surface).join("");
      const pred = last.segs.some((g) => g.lemmas.some((l) => l.endsWith("다")));
      if (!pred) continue; // fragment sans verbe (« 커피! », « 네. ») : pas de registre
      const reg = koRegister(surface);
      if (reg === want) continue;
      // 감사합니다, 실례합니다 : formules courtes acceptées en 해요체
      if (want === "haeyo" && reg === "formal" && c.length <= 2 && last.segs.some((g) => g.lemmas.some((l) => KO_FORMULAS.has(l)))) continue;
      bad.push(`phrase ${i + 1} : « ${surface} » (${reg === "formal" ? "합니다체" : reg === "plain" ? "반말 / style en -다" : "해요체"})`);
    }
  });
  return bad;
}
function checkRomanization(sentences) {
  const bad = [];
  sentences.forEach(([src], i) => {
    for (const g of L.segments(src, "ko")) {
      if (g.proper) continue;
      const latin = g.surface.match(/[A-Za-z]+/g) || [];
      for (const x of latin) if (!LATIN_OK.has(x.toUpperCase())) bad.push(`phrase ${i + 1} : « ${g.surface} »`);
    }
  });
  return bad;
}

// Vérifie un texte. ctx : { plan, lexicon, freq, texts, others (autres identifiants) }
function checkText(t, ctx = {}) {
  const lang = t.lang, blocking = [], warnings = [], stats = {};
  const lexicon = ctx.lexicon || L.loadLexicon()[lang];
  const plan = ctx.plan || L.loadPlan(lang);
  const texts = ctx.texts || L.loadKind("texts")[lang];
  const freq = ctx.freq || L.loadFreq(lang);
  const draft = t.status !== "published";
  // Format
  blocking.push(...L.validateText(t, { draft }).map((e) => `Format : ${e}`));
  if (ctx.others?.has(t.id)) blocking.push(`Format : identifiant « ${t.id} » déjà utilisé`);
  if (blocking.length) return finish({ blocking, warnings, stats });
  const sentences = t.sentences;
  sentences.forEach(([src, fr], i) => {
    if (L.plainText(src, lang).trim() === fr.trim()) blocking.push(`Format : phrase ${i + 1} non traduite`);
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(fr)) blocking.push(`Format : phrase ${i + 1}, caractères asiatiques dans la traduction française`);
    if (lang !== "zh" && /[\u3040-\u30ff\u3400-\u9fff]/u.test(src)) blocking.push(`Format : phrase ${i + 1}, caractères chinois ou japonais dans le texte`);
    if (lang === "ru") {
      const latin = L.segments(src, lang).filter((g) => !g.proper && /[A-Za-z]/.test(g.surface) && !LATIN_OK.has(g.surface.toUpperCase()));
      if (latin.length) blocking.push(`Romanisation : phrase ${i + 1}, lettres latines dans le russe (${latin.map((g) => g.surface).join(", ")})`);
    }
    if (lang === "zh") {
      if (/[\uac00-\ud7af\u3040-\u30ff]/u.test(src)) blocking.push(`Format : phrase ${i + 1}, caractères coréens ou japonais dans un texte chinois`);
      // Pas de pinyin ni de lettres latines dans le texte : le pinyin vient du lexique (sauf noms propres et sigles)
      const latin = L.segments(src, lang).filter((g) => !g.proper && /[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔù]/.test(g.surface) && !LATIN_OK.has(g.surface.toUpperCase()));
      if (latin.length) blocking.push(`Romanisation : phrase ${i + 1}, lettres latines dans le chinois (${latin.map((g) => g.surface).join(", ")})`);
    }
  });
  // Coréen : registre et romanisation
  const unit = t.unit && plan.units.find((u) => u.unit === t.unit);
  if (lang === "ko") {
    const reg = checkRegister(sentences, expectedRegister(unit));
    if (reg.length) blocking.push(`Registre : attendu ${expectedRegister(unit) === "haeyo" ? "해요체 (-요)" : expectedRegister(unit)} · ${reg.join(" ; ")}`);
    const rom = checkRomanization(sentences);
    if (rom.length) blocking.push(`Romanisation : lettres latines dans le coréen · ${rom.join(" ; ")}`);
  }
  // Longueur
  const [minS, maxS, maxW] = LENGTH[t.level] || LENGTH.A1;
  // Longueur en mots : en chinois, les mots annotés (le texte affiché n'a pas d'espaces)
  const words = sentences.reduce((n, [src]) => n + (lang === "zh" ? L.segments(src, lang).length : L.plainText(src, lang).split(/\s+/).filter(Boolean).length), 0);
  stats.sentences = sentences.length; stats.wordsPerSentence = +(words / sentences.length).toFixed(1);
  if (sentences.length < minS || sentences.length > maxS) warnings.push(`Longueur : ${sentences.length} phrases (niveau ${t.level} : ${minS} à ${maxS})`);
  if (words / sentences.length > maxW) warnings.push(`Longueur : ${stats.wordsPerSentence} mots par phrase en moyenne (niveau ${t.level} : ${maxW} au plus)`);
  // Lexique
  const lemmas = [...new Set(L.textLemmas(sentences, lang))];
  const missing = lemmas.filter((l) => !lexicon[l] && !/^\d+$/.test(l));
  stats.lexiconMissing = missing;
  if (missing.length) warnings.push(`Lexique : ${missing.length} lemme(s) sans traduction (${missing.join(", ")})${t.lexicon_new ? " — propositions à valider" : ""}`);
  // Le reste dépend de l'unité du plan
  if (unit && !unit.legacy) {
    const known = P.knownBefore(lang, plan, unit.unit, { lexicon, freq, texts });
    const newWords = new Set(unit.new_words || []);
    const cov = P.unitCoverage(lang, sentences, known, newWords);
    stats.coverage = +(cov.coverage * 100).toFixed(1); stats.tokens = cov.tokens;
    if (cov.coverage < 0.9) blocking.push(`Couverture : ${stats.coverage} % (au moins 90 %, idéal 92-98 %)`);
    else if (cov.coverage < 0.92 || cov.coverage > 0.98) warnings.push(`Couverture : ${stats.coverage} % (idéal 92-98 %)`);
    // Mots nouveaux : ceux de l'unité, entre 3 et 8 ; aucun mot hors programme
    const found = Object.keys(cov.newCounts), outside = Object.keys(cov.outside).filter((l) => !/^\d+$/.test(l));
    stats.newWords = found; stats.outside = outside;
    if (found.length < 3 || found.length > 8) blocking.push(`Mots nouveaux : ${found.length} de l'unité dans le texte (${found.join(", ") || "aucun"}), il en faut 3 à 8`);
    if (outside.length) blocking.push(`Mots nouveaux : hors programme, à remplacer ou à ajouter à l'unité (${outside.join(", ")})`);
    // Répétition (§15)
    const once = found.filter((l) => cov.newCounts[l] < 2);
    if (once.length) warnings.push(`Répétition : vu une seule fois (${once.join(", ")}) — chaque mot nouveau au moins 2 fois`);
    // Anti-interférence (§12) entre tous les mots nouveaux du texte
    const fresh = [...found, ...outside], seen = {};
    for (const w of fresh) {
      const g = groupOf(lang, lexicon, w);
      if (g && seen[g]) blocking.push(`Interférence : « ${seen[g]} » et « ${w} » sont du même groupe (${g})`);
      else if (g) seen[g] = w;
      for (const c of lexicon[w]?.confusable_with || []) if (fresh.includes(c) && w < c) blocking.push(`Interférence : « ${w} » et « ${c} » sont confusables`);
    }
    // Grammaire ciblée : au moins 3 phrases (v0.6)
    for (const gid of unit.grammar || []) {
      const g = (plan.grammar_order || []).find((x) => x.id === gid);
      if (!g) continue;
      const n = P.grammarHits(lang, g, sentences);
      stats[`grammar:${gid}`] = n;
      if (n < 3) warnings.push(`Grammaire : « ${g.label} » dans ${n} phrase(s) (au moins 3)`);
    }
    // Texte gonflé aux mots transparents (anglais) : au-delà de 35 % des mots pleins. Pas pour les
    // « tout premiers pas » : ils n'ont que 6 mots non transparents, le reste l'est forcément.
    if (lang === "en" && !unit.first_steps) {
      const cogs = new Set([...Object.entries(lexicon).filter(([, v]) => v.cog && !v.faux).map(([k]) => k), ...freq.filter((f) => f.cog && !lexicon[f.lemma]?.faux).map((f) => f.lemma)]);
      const full = L.textLemmas(sentences, lang).filter((l) => !EN_FUNCTION.has(l) && !/^\d+$/.test(l));
      const share = full.length ? full.filter((l) => cogs.has(l)).length / full.length : 0, max = 0.35;
      stats.cognateShare = Math.round(share * 100);
      if (share > max) warnings.push(`Mots transparents : ${stats.cognateShare} % des mots pleins (au plus ${max * 100} %) — texte gonflé aux mots transparents, au détriment du naturel`);
    }
  } else if (t.unit && !unit) blocking.push(`Plan : unité « ${t.unit} » introuvable`);
  // Schémas répétés : la même suite de 3 lemmes en début de phrase plus de 2 fois
  const starts = {};
  for (const [src] of sentences) for (const c of clauses(src, lang)) {
    const head = c.slice(0, 3).flatMap((w) => w.segs.filter((g) => !g.particle).map((g) => (g.proper ? "@" : g.lemmas[0]))).slice(0, 3);
    if (head.length === 3) { const k = head.join(" "); starts[k] = (starts[k] || 0) + 1; }
  }
  const rep = Object.entries(starts).filter(([, n]) => n > 2);
  if (rep.length) warnings.push(`Schémas répétés : ${rep.map(([k, n]) => `« ${k}… » ×${n}`).join(", ")} en début de phrase — varier la structure`);
  // Anglais : article devant un nom au sens général (erreur typique des francophones)
  if (lang === "en") {
    const hits = sentences.flatMap(([src], i) => [...L.plainText(src, lang).matchAll(EN_LIKE_THE)].map((m) => `phrase ${i + 1} : « ${m[0]} »`));
    if (hits.length) warnings.push(`Article : ${hits.join(" ; ")} — au sens général, pas de « the » (I like coffee)`);
  }
  // Relecture critique (IA) : non faite ou en échec → visible
  if (draft && t.ai_review && t.ai_review.ran === false) warnings.push(`Relecture critique : non faite${t.ai_review.error ? ` (${t.ai_review.error})` : ""}`);
  return finish({ blocking, warnings, stats });
}
function finish(r) {
  r.status = r.blocking.length ? "red" : r.warnings.length ? "orange" : "green";
  r.at = new Date().toISOString();
  return r;
}
// Score pour choisir entre deux variantes : moins de bloquants, puis d'avertissements, puis couverture proche de 95 %
const score = (r) => r.blocking.length * 100 + r.warnings.length * 10 + Math.abs((r.stats.coverage ?? 95) - 95) / 10;

const ICON = { green: "🟢", orange: "🟠", red: "🔴" };
function report(t, r) {
  const lines = [`${ICON[r.status]} ${t.id}${t.unit ? ` (${t.unit})` : ""}${r.stats.coverage !== undefined ? ` · couverture ${r.stats.coverage} %` : ""}`];
  for (const b of r.blocking) lines.push(`   ✗ ${b}`);
  for (const w of r.warnings) lines.push(`   ! ${w}`);
  return lines.join("\n");
}

if (require.main === module) {
  const args = process.argv.slice(2), write = args.includes("--write"), files = args.filter((a) => !a.startsWith("--"));
  const published = L.loadKind("texts", { published: false }), drafts = L.loadDrafts();
  let items = [...L.LANGS.flatMap((l) => published[l]), ...drafts];
  if (files.length) { const want = new Set(files.map((f) => path.resolve(L.CONTENT_DIR, f.replace(/^content\//, "")))); items = items.filter((t) => want.has(t._file)); }
  let failed = 0;
  const ids = (t) => new Set([...L.LANGS.flatMap((l) => published[l]), ...drafts].filter((x) => x !== t && x.lang === t.lang).map((x) => x.id));
  for (const t of items) {
    const r = checkText(t, { others: ids(t) });
    console.log(report(t, r));
    if (t.status === "published" && r.blocking.length) failed++;
    if (write && t.status !== "published") { const { _file, ...data } = t; L.writeJSON(_file, { ...data, checks: r }); }
  }
  console.log(failed ? `\n✗ ${failed} texte(s) publié(s) avec un problème bloquant` : `\n✓ ${items.length} texte(s) vérifié(s), aucun texte publié bloquant`);
  process.exit(failed ? 1 : 0);
}
module.exports = { checkText, checkRegister, checkRomanization, expectedRegister, report, score, LENGTH };
