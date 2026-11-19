// ============================================================
//  Mochi — accès au dossier content/ (CONTENU-PIPELINE.md)
//  Partagé par content-build, content-check, content-gen, plan-suggest, le serveur (admin)…
//  Aucune dépendance : Node seul.
// ============================================================
const fs = require("node:fs"), path = require("node:path");

const ROOT = path.join(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content");
const LANGS = ["en", "ko"];
const LEVELS = ["A1", "A2", "B1", "B2"];
const KINDS = ["Dialogue", "Récit", "Monologue", "Message"];
// Identifiant d'un texte ou d'un livre : jamais de chemin fourni par le client (lot C6)
const ID_RE = /^[a-z]{2}-[a-z0-9-]{1,60}$/;
const MAX_SENTENCE = 300; // limite du TTS (tts.js)
// Thèmes valides (doivent rester alignés sur THEMES de content.js : vérifié par les tests)
const THEME_IDS = ["cafe", "rencontre", "transports", "cuisine", "sport", "series", "gaming", "travail"];

const readJSON = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
// JSON indenté, mais tableaux de valeurs simples sur une ligne (une phrase = une ligne)
function fmt(v, ind = "") {
  const simple = (x) => x === null || typeof x !== "object";
  if (simple(v)) return JSON.stringify(v);
  const next = ind + "  ";
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    if (v.every(simple)) return JSON.stringify(v).replace(/","/g, '", "');
    return `[\n${v.map((x) => next + fmt(x, next)).join(",\n")}\n${ind}]`;
  }
  const e = Object.entries(v).filter(([, x]) => x !== undefined);
  if (!e.length) return "{}";
  // Petit objet plat (entrée de lexique, source, relecture) : sur une ligne
  const one = `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${fmt(x)}`).join(", ")} }`;
  if (e.every(([, x]) => simple(x) || (Array.isArray(x) && x.every(simple))) && one.length <= 140) return one;
  return `{\n${e.map(([k, x]) => `${next}${JSON.stringify(k)}: ${fmt(x, next)}`).join(",\n")}\n${ind}}`;
}
const writeJSON = (f, data) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, fmt(data) + "\n"); };
// Lexique : une entrée par ligne (diffs lisibles, relecture facile)
function writeLexicon(f, lex) {
  const lines = Object.entries(lex).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `{\n${lines.join(",\n")}\n}\n`);
}
const listJSON = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(dir, f)) : []);

// ---------- Format annoté (même analyse que parseSentence de reader.js, sans le DOM) ----------
const PUNCT_RE = /^([«"“(¿¡]*)(.*?)([.,!?…:;»"”)]*)$/;
const KO_PARTICLES = new Set(["은", "는", "이", "가", "을", "를", "에", "에서", "도", "의", "와", "과", "하고", "로", "으로", "랑", "이랑", "한테", "께"]);
function parseWords(src, lang) {
  return src.split(" ").map((word) => {
    const [, pre, core, post] = word.match(PUNCT_RE);
    const segs = core.split("|").map((raw, i) => {
      const proper = raw.startsWith("@");
      const [surface, lem] = (proper ? raw.slice(1) : raw).split("=");
      const lemmas = proper ? [] : lem ? lem.split("+") : [lang === "en" ? surface.toLowerCase() : surface];
      const particle = lang === "ko" && i > 0 && lemmas.length === 1 && KO_PARTICLES.has(lemmas[0]);
      return { surface, lemmas, proper, particle };
    });
    return { pre, segs, post };
  });
}
// Morceaux à plat d'une phrase : { surface, lemmas[], proper, particle }
const segments = (src, lang) => parseWords(src, lang).flatMap((w) => w.segs);
// Texte affiché (sans annotations)
const plainText = (src, lang = "en") => parseWords(src, lang).map((w) => w.pre + w.segs.map((s) => s.surface).join("") + w.post).join(" ");
// Lemmes (hors noms propres) d'un texte, avec répétitions
const textLemmas = (sentences, lang) => sentences.flatMap(([src]) => segments(src, lang).flatMap((g) => g.lemmas));

// ---------- Lecture ----------
function loadLexicon(dir = CONTENT_DIR) {
  return Object.fromEntries(LANGS.map((l) => [l, fs.existsSync(path.join(dir, "lexicon", `${l}.json`)) ? readJSON(path.join(dir, "lexicon", `${l}.json`)) : {}]));
}
const byOrder = (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.id.localeCompare(b.id);
// published : true → seulement ce que le site doit afficher
function loadKind(kind, { dir = CONTENT_DIR, published = true } = {}) {
  return Object.fromEntries(LANGS.map((l) => [l, listJSON(path.join(dir, kind, l)).map((f) => ({ ...readJSON(f), _file: f }))
    .filter((x) => !published || x.status === "published").sort(byOrder)]));
}
function loadDrafts(dir = CONTENT_DIR) {
  return listJSON(path.join(dir, "drafts")).map((f) => ({ ...readJSON(f), _file: f }));
}
function loadPlan(lang, dir = CONTENT_DIR) {
  const f = path.join(dir, "plan", `${lang}.json`);
  return fs.existsSync(f) ? readJSON(f) : { units: [] };
}
// Liste de fréquence : lignes « lemme\trang\tniveau\tpos[\tcog] », commentaires « # »
function loadFreq(lang, dir = CONTENT_DIR) {
  const f = path.join(dir, "freq", `${lang}.tsv`);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && !l.startsWith("lemme\t")).map((l) => {
    const [lemma, rank, level, pos, cog] = l.split("\t");
    return { lemma, rank: Number(rank), level: level || "", pos: pos || "", cog: cog === "1" || cog === "true" };
  });
}

// ---------- Validation du format (bloquant) ----------
function validateSentences(sentences, where, errors) {
  if (!Array.isArray(sentences) || !sentences.length) { errors.push(`${where} : aucune phrase`); return; }
  sentences.forEach((s, i) => {
    if (!Array.isArray(s) || typeof s[0] !== "string" || !s[0].trim()) errors.push(`${where}, phrase ${i + 1} : texte manquant`);
    else if (typeof s[1] !== "string" || !s[1].trim()) errors.push(`${where}, phrase ${i + 1} : traduction manquante`);
    else if (plainText(s[0]).length > MAX_SENTENCE) errors.push(`${where}, phrase ${i + 1} : plus de ${MAX_SENTENCE} caractères (limite TTS)`);
  });
}
function validateText(t, { draft = false } = {}) {
  const errors = [], where = t.id || "(sans id)";
  if (!ID_RE.test(t.id || "")) errors.push(`${where} : identifiant invalide (attendu ${ID_RE})`);
  if (!LANGS.includes(t.lang)) errors.push(`${where} : langue invalide`);
  else if (t.id && !t.id.startsWith(`${t.lang}-`)) errors.push(`${where} : l'identifiant doit commencer par « ${t.lang}- »`);
  if (!LEVELS.includes(t.level)) errors.push(`${where} : niveau invalide (${t.level})`);
  if (!Array.isArray(t.themes) || t.themes.some((th) => !THEME_IDS.includes(th))) errors.push(`${where} : thèmes invalides (${t.themes})`);
  if (!t.title || typeof t.title !== "string") errors.push(`${where} : titre manquant`);
  if (!KINDS.includes(t.kind)) errors.push(`${where} : type invalide (${t.kind})`);
  if (!draft && t.status !== "published") errors.push(`${where} : statut ${t.status}`);
  validateSentences(t.sentences, where, errors);
  return errors;
}
function validateBook(b) {
  const errors = [], where = b.id || "(sans id)";
  if (!ID_RE.test(b.id || "")) errors.push(`${where} : identifiant invalide`);
  if (!LEVELS.includes(b.level)) errors.push(`${where} : niveau invalide`);
  if (!b.title || !Array.isArray(b.chapters) || !b.chapters.length) errors.push(`${where} : titre ou chapitres manquants`);
  (b.chapters || []).forEach((ch, i) => {
    validateSentences(ch.sentences, `${where} ch. ${i + 1}`, errors);
    if (!Array.isArray(ch.questions) || !ch.questions.length || ch.questions.some((q) => !q.q || !Array.isArray(q.options) || q.options.length < 2)) errors.push(`${where} ch. ${i + 1} : questions invalides`);
  });
  return errors;
}

module.exports = {
  ROOT, CONTENT_DIR, LANGS, LEVELS, KINDS, ID_RE, MAX_SENTENCE, THEME_IDS,
  readJSON, writeJSON, fmt, writeLexicon, listJSON, parseWords, segments, KO_PARTICLES, plainText, textLemmas,
  loadLexicon, loadKind, loadDrafts, loadPlan, loadFreq, validateText, validateBook, byOrder,
};
