// ============================================================
//  Mochi — reader.js : Phrases annotées, modèle du vocabulaire connu, couverture des textes
//  Script classique chargé dans l'ordre par index.html (voir la liste là-bas) :
//  les déclarations de haut niveau sont partagées entre les fichiers.
// ============================================================
// ---------- Phrases annotées (voir content.js) ----------
const PUNCT_RE = /^([«"“(¿¡「『（]*)(.*?)([.,!?…:;»"”)。，！？、：；」』）]*)$/u; // ponctuation latine et chinoise
// Chinois : la source sépare les mots par des espaces (pour les annoter), l'affichage non (words.sep).
function parseSentence(src, lang) {
  const words = src.split(" ").map((word) => {
    const [, pre, core, post] = word.match(PUNCT_RE);
    const segs = core.split("|").map((raw, i) => {
      const proper = raw.startsWith("@");
      const [surface, lem] = (proper ? raw.slice(1) : raw).split("=");
      const lemmas = proper ? [] : lem ? lem.split("+") : [lang === "en" || lang === "ru" ? surface.toLowerCase() : surface]; // écritures à majuscules
      const particle = isKo(lang) && i > 0 && lemmas.length === 1 && KO_PARTICLES.has(lemmas[0]);
      return { surface, lemmas, proper, particle };
    });
    return { pre, segs, post };
  });
  words.sep = isZh(lang) ? "" : " ";
  return words;
}
const wordText = (w) => w.pre + w.segs.map((s) => s.surface).join("") + w.post;
const plain = (words) => words.map(wordText).join(words.sep ?? " ");
const toSentence = (src, lang, fr = "") => { const words = parseSentence(src, lang); return { words, text: plain(words), fr }; };

// Texte avant / après un morceau donné (pour les cartes en contexte, §2)
function splitAround(words, w, g) {
  const word = words[w];
  const sep = words.sep ?? " ";
  const before = [...words.slice(0, w).map(wordText), word.pre + word.segs.slice(0, g).map((s) => s.surface).join("")].join(sep);
  const after = [word.segs.slice(g + 1).map((s) => s.surface).join("") + word.post, ...words.slice(w + 1).map(wordText)].join(sep);
  return { before: w === 0 ? before.trimStart() : before, after };
}

for (const lang of Object.keys(TEXTS)) for (const t of TEXTS[lang]) t.parsed = t.sentences.map(([src, fr]) => toSentence(src, lang, fr));
// Chapitres des livres (library.js) : lus dans le même lecteur que les textes
const CHAPTER_TEXTS = Object.fromEntries(Object.keys(LANGUAGES).map((l) => [l, {}]));
const textById = (lang, id) => TEXTS[lang].find((t) => t.id === id) || CHAPTER_TEXTS[lang][id];

// ---------- Modèle du vocabulaire connu & couverture (§3) ----------
function stabilityMap(lang) {
  const m = {};
  for (const c of state.cards) {
    if (c.lang !== lang) continue;
    for (const l of c.lemma.split(" + ")) m[l] = Math.max(m[l] || 0, c.fsrs.stability || 0);
  }
  return m;
}
function knownWeight(lang, lemma, stab) {
  const L = state.langs[lang];
  if (L.known[lemma]) return 1;
  if (L.unknown[lemma]) return 0;
  if ((stab[lemma] || 0) >= KNOWN_STABILITY) return 1;
  const lex = LEXICON[lang][lemma];
  if (lang === "en" && lex?.cog && !lex.faux) return state.settings.cognateWeight;
  return 0;
}
function lemmaStatus(lang, lemma, stab) {
  const L = state.langs[lang];
  if (L.known[lemma] || (stab[lemma] || 0) >= KNOWN_STABILITY) return "known";
  if (stab[lemma] !== undefined) return "learning";
  if (L.unknown[lemma]) return "new";
  const lex = LEXICON[lang][lemma];
  if (lang === "en" && lex?.cog && !lex.faux) return "cognate";
  return "new";
}
function coverage(lang, sentences, stab = stabilityMap(lang)) {
  let total = 0, known = 0;
  for (const s of sentences) for (const w of s.words) for (const g of w.segs) for (const l of g.lemmas) { total++; known += knownWeight(lang, l, stab); }
  return total ? known / total : 0;
}
function unknownLemmas(lang, sentences, stab = stabilityMap(lang)) {
  const out = new Map();
  sentences.forEach((s, si) => s.words.forEach((w, wi) => w.segs.forEach((g, gi) => g.lemmas.forEach((l) => {
    if (knownWeight(lang, l, stab) < 1 && !out.has(l)) out.set(l, { si, wi, gi });
  }))));
  return out;
}
function zone(c) {
  if (c >= 0.92 && c <= 0.98) return { k: "ideal", label: "🎯 Zone idéale", order: 0 };
  if (c > 0.98) return { k: "easy", label: "😌 Fluidité", order: 2 };
  if (c >= 0.9) return { k: "hard", label: "💪 Un peu dur", order: 1 };
  return { k: "gloss", label: "📖 Avec glossaire", order: 3 };
}
function rankedTexts(lang) {
  const stab = stabilityMap(lang);
  return TEXTS[lang].map((t) => { const c = coverage(lang, t.parsed, stab); return { t, c, z: zone(c) }; })
    .sort((a, b) => a.z.order - b.z.order || (a.z.k === "gloss" ? b.c - a.c : Math.abs(a.c - 0.95) - Math.abs(b.c - 0.95)));
}
function knownCount(lang) {
  const stab = stabilityMap(lang);
  const lemmas = new Set([...Object.keys(LEXICON[lang]), ...Object.keys(stab), ...Object.keys(state.langs[lang].known)]);
  return [...lemmas].filter((l) => knownWeight(lang, l, stab) === 1).length;
}
const lexFr = (lang, lemma) => {
  const fr = lemma.split(" + ").map((l) => LEXICON[lang][l]?.fr || "?").join(" + ");
  if (lang === "ru") { const st = lemma.split(" + ").map(ruStressed).join(" + "); return st !== lemma ? `${st} · ${fr}` : fr; }
  return isZh(lang) ? `${zhLemmaPy(lemma.split(" + "))} · ${fr}` : fr;
};
