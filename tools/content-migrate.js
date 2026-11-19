#!/usr/bin/env node
// ============================================================
//  Migration À USAGE UNIQUE (CONTENU-PIPELINE, lot C1) : sort les textes, livres,
//  chapitres d'histoire et le lexique du code (content.js, library.js, story.js)
//  vers le dossier content/. Écrit aussi l'instantané tests/fixtures/content-v0.json,
//  qui sert au test de non-régression (tests/content.test.js).
//    node tools/content-migrate.js
//  À lancer AVANT de modifier content.js / library.js / story.js (il lit l'état actuel du site).
// ============================================================
const fs = require("node:fs"), path = require("node:path");
const { loadSite } = require("./load-site.js");
const { writeLexicon, writeJSON: write } = require("./content-lib.js");
const ROOT = path.join(__dirname, ".."), C = path.join(ROOT, "content");
const site = loadSite();
const r = site.run("({ LEXICON, SEMANTIC_GROUPS, CONFUSABLE, TEXTS, BOOKS, STORIES })");
const plain = (x) => JSON.parse(JSON.stringify(x)); // sort les objets du bac à sable vm
const SOURCE = { type: "original", author: "Mochi", license: "CC BY 4.0" };
const REVIEW = { by: "nathan", at: "2026-11-19" };

if (fs.existsSync(path.join(C, "texts"))) { console.error("content/texts existe déjà : migration déjà faite."); process.exit(1); }

const langs = Object.keys(r.TEXTS);
const snapshot = { texts: {}, books: {}, stories: {}, lexicon: {}, semantic_groups: {}, confusable: {} };
for (const lang of langs) {
  // Textes : l'ordre d'affichage est gardé dans « order » (10, 20, 30…)
  snapshot.texts[lang] = r.TEXTS[lang].map(({ parsed, ...t }) => plain(t));
  snapshot.texts[lang].forEach((t, i) => write(path.join(C, "texts", lang, `${t.id}.json`), {
    id: t.id, lang, level: "A1", order: (i + 1) * 10, themes: t.themes, grammar: [], title: t.title, icon: t.icon, kind: t.kind,
    status: "published", source: SOURCE, sentences: t.sentences, speakers: null, review: REVIEW,
  }));
  // Livres et histoires : un fichier par livre, chapitres inclus (sans l'id ajouté par registerBook)
  for (const [key, list, dir] of [["books", r.BOOKS[lang], "books"], ["stories", r.STORIES[lang], "story"]]) {
    snapshot[key][lang] = plain(list).map((b) => ({ ...b, chapters: b.chapters.map(({ id, ...ch }) => ch) }));
    snapshot[key][lang].forEach((b, i) => write(path.join(C, dir, lang, `${b.id}.json`), { ...b, lang, order: (i + 1) * 10, status: "published", source: SOURCE, review: REVIEW }));
  }
  // Lexique : même ordre (du plus fréquent au moins fréquent), groupes et confusables intégrés
  snapshot.lexicon[lang] = plain(r.LEXICON[lang]);
  snapshot.semantic_groups[lang] = plain(r.SEMANTIC_GROUPS[lang]);
  snapshot.confusable[lang] = plain(r.CONFUSABLE[lang]);
  const lex = plain(r.LEXICON[lang]);
  for (const [g, ws] of Object.entries(r.SEMANTIC_GROUPS[lang])) for (const w of ws) lex[w].semantic_group = g;
  for (const [a, b] of r.CONFUSABLE[lang]) { (lex[a].confusable_with ||= []).push(b); (lex[b].confusable_with ||= []).push(a); }
  writeLexicon(path.join(C, "lexicon", `${lang}.json`), lex);
}
write(path.join(ROOT, "tests", "fixtures", "content-v0.json"), snapshot);
fs.mkdirSync(path.join(C, "drafts"), { recursive: true });
fs.writeFileSync(path.join(C, "drafts", ".gitkeep"), "");
console.log("Migration faite :", langs.map((l) => `${l} ${snapshot.texts[l].length} textes, ${snapshot.books[l].length} livre(s), ${snapshot.stories[l].length} histoire(s), ${Object.keys(snapshot.lexicon[l]).length} lemmes`).join(" · "));
