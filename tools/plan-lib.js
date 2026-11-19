// ============================================================
//  Mochi — le plan de contenu (CONTENU-PIPELINE, lot C3)
//  content/plan/<langue>.json : { grammar_order: [...], units: [...] }
//  Une unité : { unit, level, grammar[], themes[], new_words[], review_words[], texts, kinds[] }
//  Unité « socle » (legacy: true) : les textes écrits avant le plan ; leur vocabulaire compte
//  comme acquis pour les unités qui suivent.
// ============================================================
const L = require("./content-lib.js");

// Toujours connus : les particules et la copule (enseignées par la grammaire, §6)
const BASE = { ko: new Set([...L.KO_PARTICLES, "이다", "에게", "부터", "까지", "만", "들"]), en: new Set() };

function unitIndex(plan, unitId) {
  const i = plan.units.findIndex((u) => u.unit === unitId);
  if (i < 0) throw new Error(`Unité inconnue : ${unitId}`);
  return i;
}
// Lemmes des textes d'une unité socle (textes déjà publiés)
function legacyWords(lang, u, texts) {
  const ids = new Set(u.texts_published || []);
  return new Set(texts.filter((t) => ids.has(t.id)).flatMap((t) => L.textLemmas(t.sentences, lang)));
}
// Mots acquis AVANT une unité (unités précédentes) + mots de révision de l'unité + base.
// En anglais, les mots transparents (cog) comptent comme connus (§7).
function knownBefore(lang, plan, unitId, { lexicon = L.loadLexicon()[lang], freq = L.loadFreq(lang), texts = L.loadKind("texts")[lang] } = {}) {
  const i = unitIndex(plan, unitId), known = new Set(BASE[lang]);
  for (const u of plan.units.slice(0, i)) {
    for (const w of [...(u.new_words || []), ...(u.review_words || [])]) known.add(w);
    if (u.legacy) for (const w of legacyWords(lang, u, texts)) known.add(w);
  }
  for (const w of plan.units[i].review_words || []) known.add(w);
  if (lang === "en") {
    for (const [k, v] of Object.entries(lexicon)) if (v.cog && !v.faux) known.add(k);
    for (const f of freq) if (f.cog && !lexicon[f.lemma]?.faux) known.add(f.lemma);
  }
  return known;
}
// Tous les mots couverts par le plan (pour proposer la suite)
function planWords(lang, plan, texts = L.loadKind("texts")[lang]) {
  const s = new Set(BASE[lang]);
  for (const u of plan.units) {
    for (const w of [...(u.new_words || []), ...(u.review_words || [])]) s.add(w);
    if (u.legacy) for (const w of legacyWords(lang, u, texts)) s.add(w);
  }
  return s;
}

// Couverture d'un texte pour une unité : inconnus = 1re occurrence de chaque mot nouveau de
// l'unité (les répétitions se lisent avec le glossaire) + toutes les occurrences hors programme.
function unitCoverage(lang, sentences, known, newWords) {
  const lemmas = L.textLemmas(sentences, lang), seen = new Set(), freqNew = {}, outside = {};
  let unknown = 0;
  for (const l of lemmas) {
    if (known.has(l)) continue;
    if (newWords.has(l)) { freqNew[l] = (freqNew[l] || 0) + 1; if (!seen.has(l)) { seen.add(l); unknown++; } continue; }
    outside[l] = (outside[l] || 0) + 1; unknown++;
  }
  return { tokens: lemmas.length, unknown, coverage: lemmas.length ? 1 - unknown / lemmas.length : 0, newCounts: freqNew, outside };
}

// ---------- Points de grammaire : détection dans un texte annoté ----------
// detect : { particles: [...] } | { lemmas: [...] } | { regex: "…" } (sur le texte affiché, minuscules)
function grammarHits(lang, point, sentences) {
  const d = point.detect || {};
  let n = 0;
  for (const [src] of sentences) {
    const segs = L.segments(src, lang), text = L.plainText(src, lang).toLowerCase();
    let hit = false;
    if (d.particles) hit ||= segs.some((g) => g.particle && d.particles.includes(g.surface));
    if (d.lemmas) hit ||= segs.some((g) => g.lemmas.some((l) => d.lemmas.includes(l)));
    if (d.regex) hit ||= new RegExp(d.regex, "u").test(text);
    if (hit) n++;
  }
  return n;
}
// Combien de textes publiés contiennent chaque point (au moins 2 phrases = « vu »)
function grammarCounts(lang, plan, texts = L.loadKind("texts")[lang]) {
  return Object.fromEntries((plan.grammar_order || []).map((g) => [g.id, texts.filter((t) => grammarHits(lang, g, t.sentences) >= 2).length]));
}

module.exports = { BASE, unitIndex, knownBefore, planWords, legacyWords, unitCoverage, grammarHits, grammarCounts };
