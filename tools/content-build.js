#!/usr/bin/env node
// ============================================================
//  Construit content.data.js depuis content/ (CONTENU-PIPELINE, lot C1)
//    npm run content:build            vérifie le format et écrit content.data.js
//    npm run content:build -- --check vérifie seulement que content.data.js est à jour
//  Lit tout content/ sauf drafts/ et les textes dont status ≠ "published".
//  Le site reste sans compilation : content.data.js est un simple fichier généré, commité,
//  chargé par index.html avant content.js (const CONTENT = {...}).
// ============================================================
const fs = require("node:fs"), path = require("node:path");
const L = require("./content-lib.js");

const OUT = path.join(L.ROOT, "content.data.js");
// Champs utiles au site (le reste — statut, source, relecture, rapports — reste dans content/)
const TEXT_FIELDS = ["id", "level", "themes", "grammar", "title", "icon", "kind", "sentences", "speakers"];
const BOOK_DROP = new Set(["lang", "order", "status", "source", "review", "_file", "checks", "review_notes"]);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));

function collect(dir = L.CONTENT_DIR) {
  const errors = [];
  const lexicon = L.loadLexicon(dir), texts = L.loadKind("texts", { dir }), books = L.loadKind("books", { dir }), stories = L.loadKind("story", { dir });
  for (const lang of L.LANGS) {
    const seen = new Map(), lex = lexicon[lang];
    const claim = (id, f) => { if (seen.has(id)) errors.push(`${lang} : identifiant « ${id} » en double (${path.basename(seen.get(id))} et ${path.basename(f)})`); seen.set(id, f); };
    for (const t of texts[lang]) {
      errors.push(...L.validateText(t));
      if (t.lang !== lang) errors.push(`${t.id} : rangé dans texts/${lang}/ mais lang = ${t.lang}`);
      if (path.basename(t._file) !== `${t.id}.json`) errors.push(`${t.id} : le fichier doit s'appeler ${t.id}.json`);
      claim(t.id, t._file);
    }
    for (const b of [...books[lang], ...stories[lang]]) {
      errors.push(...L.validateBook(b));
      claim(b.id, b._file);
      b.chapters.forEach((_, i) => claim(`${b.id}-${i + 1}`, b._file)); // identifiant des chapitres (registerBook)
    }
    for (const [k, v] of Object.entries(lex)) {
      if (!v || typeof v.fr !== "string" || !v.fr) errors.push(`lexique ${lang} : « ${k} » sans traduction`);
      for (const c of v.confusable_with || []) if (!lex[c]?.confusable_with?.includes(k)) errors.push(`lexique ${lang} : « ${k} » ↔ « ${c} » doit être déclaré des deux côtés`);
      if (v.todo_review) errors.push(`lexique ${lang} : « ${k} » attend une relecture (todo_review)`);
    }
  }
  const strip = (b) => Object.fromEntries(Object.entries(b).filter(([k]) => !BOOK_DROP.has(k)));
  const data = {
    lexicon: Object.fromEntries(L.LANGS.map((l) => [l, Object.fromEntries(Object.entries(lexicon[l]).map(([k, v]) => [k, pick(v, ["fr", "cog", "faux", "semantic_group", "confusable_with"])]))])),
    texts: Object.fromEntries(L.LANGS.map((l) => [l, texts[l].map((t) => pick(t, TEXT_FIELDS))])),
    books: Object.fromEntries(L.LANGS.map((l) => [l, books[l].map(strip)])),
    stories: Object.fromEntries(L.LANGS.map((l) => [l, stories[l].map(strip)])),
  };
  return { data, errors };
}

function render(data) {
  return `// Fichier GÉNÉRÉ par tools/content-build.js (npm run content:build) depuis le dossier content/.
// Ne pas modifier à la main : éditer content/ puis relancer le build.
const CONTENT = ${L.fmt(data)};
`;
}

function build({ dir = L.CONTENT_DIR, out = OUT, check = false, log = console.log } = {}) {
  const { data, errors } = collect(dir);
  if (errors.length) return { ok: false, errors };
  const js = render(data);
  const stats = L.LANGS.map((l) => `${l} : ${data.texts[l].length} textes, ${data.books[l].length} livre(s), ${data.stories[l].length} histoire(s), ${Object.keys(data.lexicon[l]).length} lemmes`).join(" · ");
  if (check) {
    const cur = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
    return cur === js ? { ok: true, stats } : { ok: false, errors: ["content.data.js n'est pas à jour : lance « npm run content:build »."] };
  }
  const changed = !fs.existsSync(out) || fs.readFileSync(out, "utf8") !== js;
  if (changed) fs.writeFileSync(out, js);
  log(`content.data.js ${changed ? "écrit" : "déjà à jour"} · ${stats}`);
  return { ok: true, stats, changed };
}

if (require.main === module) {
  const r = build({ check: process.argv.includes("--check") });
  if (!r.ok) { console.error(`✗ ${r.errors.length} erreur(s) :\n  - ${r.errors.join("\n  - ")}`); process.exit(1); }
  if (process.argv.includes("--check")) console.log(`✓ content.data.js à jour · ${r.stats}`);
}
module.exports = { build, collect, render };
