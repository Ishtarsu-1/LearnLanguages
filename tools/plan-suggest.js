#!/usr/bin/env node
// ============================================================
//  Propose les prochaines unités du plan (CONTENU-PIPELINE, lot C3)
//    npm run plan:suggest -- --lang ko                 affiche 5 unités proposées
//    npm run plan:suggest -- --lang en --next 10 --write   les ajoute à content/plan/en.json
//  Règles :
//   - mots nouveaux = les plus fréquents pas encore couverts (content/freq/<langue>.tsv) ;
//     en anglais, les mots transparents comptent déjà comme connus (§7) ;
//   - anti-interférence (§12) : jamais deux mots du même semantic_group, ni deux
//     confusable_with, dans les mots nouveaux d'une unité (le mot écarté passe à la suivante) ;
//   - grammaire (coréen : ordre du §6) : le premier point vu dans moins de 3 textes ;
//     la phase 3 attend que toute la phase 2 soit couverte ;
//   - thème : le moins servi (textes publiés + unités prévues) ;
//   - révision : des mots nouveaux d'il y a 1, 3 et 6 unités (espacement).
// ============================================================
const path = require("node:path");
const L = require("./content-lib.js");
const P = require("./plan-lib.js");

// Catégories évidentes pour les mots absents du lexique (sinon semantic_group du lexique)
const AUTO_GROUPS = {
  en: {
    jour: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "weekend"],
    mois: ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"],
    couleur: ["red", "blue", "green", "yellow", "black", "white", "orange", "pink", "purple", "brown", "grey", "gray"],
    nombre: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "twenty", "hundred", "thousand", "million", "first", "second", "third"],
    famille: ["mother", "father", "mom", "dad", "brother", "sister", "son", "daughter", "wife", "husband", "family", "parent", "child", "baby", "grandmother", "grandfather"],
    pronom: ["i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his", "our", "their", "its"],
    interrogatif: ["what", "who", "where", "when", "why", "how", "which"],
    saison: ["spring", "summer", "autumn", "fall", "winter"],
  },
  ko: {
    jour: ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일", "주말"],
    couleur: ["빨간색", "파란색", "노란색", "검은색", "하얀색", "초록색", "색", "빨갛다", "파랗다", "노랗다", "까맣다", "하얗다"],
    nombre_natif: ["하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉", "열", "스물", "서른", "마흔", "쉰"],
    famille: ["아버지", "어머니", "엄마", "아빠", "형", "오빠", "누나", "언니", "동생", "아들", "딸", "남편", "아내", "가족", "할머니", "할아버지", "부모"],
    pronom: ["저", "나", "너", "우리", "저희", "그", "그녀", "당신"],
    interrogatif: ["무엇", "뭐", "누구", "어디", "언제", "왜", "어떻게", "얼마"],
    saison: ["봄", "여름", "가을", "겨울"],
  },
};
const groupOf = (lang, lex, w) => lex[w]?.semantic_group || Object.entries(AUTO_GROUPS[lang]).find(([, ws]) => ws.includes(w))?.[0] || null;
const LEVEL_RANK = ["A1", "A2", "B1", "B2"];
const KO_LEVEL = { A: "A1", B: "B1", C: "B2" };
const KIND_CYCLE = [["Dialogue", "Récit"], ["Dialogue", "Message"], ["Monologue", "Dialogue"]];

function suggest(lang, { next = 5, perUnit = 5, textsPerUnit = 2, plan = L.loadPlan(lang), lexicon = L.loadLexicon()[lang], freq = L.loadFreq(lang), texts = L.loadKind("texts")[lang] } = {}) {
  plan = JSON.parse(JSON.stringify(plan));
  if (!freq.length) throw new Error(`content/freq/${lang}.tsv manquant : lance « python tools/freq_export.py » (voir SETUP.md).`);
  const covered = P.planWords(lang, plan, texts);
  const isCog = (f) => lang === "en" && (f.cog || lexicon[f.lemma]?.cog) && !lexicon[f.lemma]?.faux;
  const skip = (f) => covered.has(f.lemma) || P.BASE[lang].has(f.lemma) || isCog(f) || !/^[a-z가-힣]/.test(f.lemma) || (lang === "ko" && /조사|감탄사/.test(f.pos) && [...f.lemma].length === 1)
    || (lang === "ko" && ["한", "두", "세", "네", "스무"].includes(f.lemma)); // déterminants numéraux : annotés 하나, 둘… (nombres natifs)
  const pool = freq.filter((f) => !skip(f));
  // Grammaire : textes publiés qui la contiennent + textes prévus dans le plan
  const counts = P.grammarCounts(lang, plan, texts);
  for (const u of plan.units) if (!u.legacy) for (const g of u.grammar || []) counts[g] = (counts[g] || 0) + (u.texts || 0);
  // Thèmes : textes publiés + unités prévues
  const themeUse = Object.fromEntries(L.THEME_IDS.map((t) => [t, 0]));
  for (const t of texts) for (const th of t.themes || []) themeUse[th]++;
  for (const u of plan.units) if (!u.legacy) for (const th of u.themes || []) themeUse[th] += u.texts || 1;
  const out = [];
  for (let k = 0; k < next; k++) {
    const real = plan.units.filter((u) => !u.legacy);
    // Mots nouveaux, sans interférence
    const picked = [], groups = new Set();
    for (let i = 0; i < pool.length && picked.length < perUnit; i++) {
      const f = pool[i], g = groupOf(lang, lexicon, f.lemma), conf = lexicon[f.lemma]?.confusable_with || [];
      if (g && groups.has(g)) continue;
      if (picked.some((p) => conf.includes(p.lemma) || (lexicon[p.lemma]?.confusable_with || []).includes(f.lemma))) continue;
      picked.push(f); if (g) groups.add(g);
    }
    if (!picked.length) break;
    for (const f of picked) pool.splice(pool.indexOf(f), 1);
    // Grammaire
    const order = plan.grammar_order || [];
    const phase2Done = order.filter((g) => g.phase <= 2).every((g) => (counts[g.id] || 0) >= 3);
    const gp = order.find((g) => (counts[g.id] || 0) < 3 && (lang !== "ko" || g.phase < 3 || phase2Done));
    if (gp) counts[gp.id] = (counts[gp.id] || 0) + textsPerUnit;
    // Thème
    const fromLex = picked.flatMap((f) => lexicon[f.lemma]?.themes || []);
    const theme = fromLex[0] || Object.entries(themeUse).sort((a, b) => a[1] - b[1])[0][0];
    themeUse[theme] += textsPerUnit;
    // Niveau : jamais en dessous de l'unité précédente
    const prev = real.at(-1)?.level || "A1";
    const wl = picked.map((f) => (lang === "ko" ? KO_LEVEL[f.level] || "A1" : f.level || "A1"));
    let level = wl.sort((a, b) => LEVEL_RANK.indexOf(a) - LEVEL_RANK.indexOf(b))[Math.floor(wl.length / 2)];
    if (LEVEL_RANK.indexOf(level) < LEVEL_RANK.indexOf(prev)) level = prev;
    if (lang === "ko" && level === "A1" && real.length >= 15) level = "A2";
    // Révision espacée
    const review = [1, 3, 6].flatMap((d) => real.at(-d)?.new_words?.slice(0, 2) || []).filter((w, i, a) => a.indexOf(w) === i).slice(0, 5);
    const n = real.length + 1;
    const unit = {
      unit: `${lang}-${level}-${String(n).padStart(2, "0")}`, level, grammar: gp ? [gp.id] : [], themes: [theme],
      new_words: picked.map((f) => f.lemma), review_words: review, texts: textsPerUnit, kinds: KIND_CYCLE[n % KIND_CYCLE.length],
    };
    plan.units.push(unit); out.push(unit);
  }
  return { units: out, plan };
}

if (require.main === module) {
  const a = process.argv.slice(2), get = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const lang = get("--lang");
  if (!L.LANGS.includes(lang)) { console.error("Usage : npm run plan:suggest -- --lang en|ko [--next 5] [--words 5] [--write]"); process.exit(2); }
  try {
    const r = suggest(lang, { next: Number(get("--next", 5)), perUnit: Number(get("--words", 5)) });
    for (const u of r.units) console.log(`${u.unit} · ${u.grammar.join(", ") || "—"} · ${u.themes.join(", ")} · nouveaux : ${u.new_words.join(", ")} · révision : ${u.review_words.join(", ") || "—"}`);
    if (a.includes("--write")) { L.writeJSON(path.join(L.CONTENT_DIR, "plan", `${lang}.json`), r.plan); console.log(`→ ${r.units.length} unité(s) ajoutée(s) à content/plan/${lang}.json`); }
    else console.log("(aperçu : ajoute --write pour les enregistrer)");
  } catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { suggest, groupOf, AUTO_GROUPS };
