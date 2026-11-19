// Chaîne de contenu (CONTENU-PIPELINE.md) : build, non-régression de la migration, outils.
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const ROOT = path.join(__dirname, "..");
const L = require("../tools/content-lib.js");
const { build } = require("../tools/content-build.js");
const { loadSite } = require("../tools/load-site.js");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("  ok", m); };
const plain = (x) => JSON.parse(JSON.stringify(x));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- C1 : content.data.js à jour et migration sans perte ----------
{
  const r = build({ check: true });
  ok(r.ok, "content.data.js à jour avec content/ " + (r.errors || []).join(" ; "));
  const before = L.readJSON(path.join(__dirname, "fixtures", "content-v0.json"));
  const site = loadSite();
  const now = plain(site.run("({ LEXICON, SEMANTIC_GROUPS, CONFUSABLE, BOOKS, STORIES, TEXTS: Object.fromEntries(Object.entries(TEXTS).map(([l, ts]) => [l, ts.map(({ parsed, ...t }) => t)])) })"));
  for (const lang of L.LANGS) {
    // Textes : mêmes identifiants (dans le même ordre), mêmes phrases, mêmes métadonnées d'affichage
    ok(same(now.TEXTS[lang].map((t) => t.id), before.texts[lang].map((t) => t.id)), `${lang} : mêmes textes, même ordre`);
    for (const old of before.texts[lang]) {
      const t = now.TEXTS[lang].find((x) => x.id === old.id) || {};
      ok(same(t.sentences, old.sentences) && same(t.themes, old.themes) && t.title === old.title && t.icon === old.icon && t.kind === old.kind, `${lang} : ${old.id} identique`);
    }
    // Livres et histoires (sans l'id de chapitre ajouté par registerBook)
    const noId = (bs) => bs.map((b) => ({ ...b, chapters: b.chapters.map(({ id, ...ch }) => ch) }));
    ok(same(noId(now.BOOKS[lang]), before.books[lang]), `${lang} : livres identiques`);
    ok(same(noId(now.STORIES[lang]), before.stories[lang]), `${lang} : histoires identiques`);
    // Lexique : mêmes lemmes dans le même ordre (le rang sert aux exercices), mêmes traductions
    ok(same(Object.keys(now.LEXICON[lang]), Object.keys(before.lexicon[lang])), `${lang} : mêmes lemmes, même ordre`);
    const keep = (e) => ({ fr: e.fr, cog: e.cog, faux: e.faux });
    ok(Object.entries(before.lexicon[lang]).every(([k, e]) => same(keep(now.LEXICON[lang][k]), keep(e))), `${lang} : mêmes traductions et marques (cog, faux)`);
    // Anti-interférence : même appartenance aux groupes, mêmes paires (l'ordre n'a pas d'effet)
    const groupOf = (G) => Object.fromEntries(Object.entries(G).flatMap(([g, ws]) => ws.map((w) => [w, g])).sort());
    ok(same(groupOf(now.SEMANTIC_GROUPS[lang]), groupOf(before.semantic_groups[lang])), `${lang} : mêmes groupes sémantiques`);
    const pairs = (P) => P.map((p) => [...p].sort().join("|")).sort();
    ok(same(pairs(now.CONFUSABLE[lang]), pairs(before.confusable[lang])), `${lang} : mêmes paires confusables`);
  }
  // Les thèmes valides de l'outillage = ceux du site
  ok(same(plain(site.run("THEMES.map((t) => t.id)")), L.THEME_IDS), "THEME_IDS aligné sur THEMES (content.js)");
  // segments() des outils = parseSentence du site
  const s = "@Tom has=have a small|x black cat. 저|는 @민지|예요=이다.";
  for (const lang of L.LANGS) ok(same(plain(site.run(`parseSentence(${JSON.stringify(s)}, "${lang}").flatMap((w) => w.segs)`)), L.segments(s, lang)), `segments() = parseSentence (${lang})`);
}

// ---------- C1 : le build refuse un contenu invalide, ignore les brouillons ----------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-content-"));
  fs.cpSync(L.CONTENT_DIR, tmp, { recursive: true });
  const out = path.join(tmp, "out.js");
  ok(build({ dir: tmp, out, log() {} }).ok && fs.existsSync(out), "build dans un dossier temporaire");
  L.writeJSON(path.join(tmp, "drafts", "en-brouillon.json"), { id: "en-brouillon", status: "draft", sentences: [] });
  const t = L.readJSON(path.join(tmp, "texts", "en", "en-cafe.json"));
  L.writeJSON(path.join(tmp, "texts", "en", "en-pas-fini.json"), { ...t, id: "en-pas-fini", status: "draft" });
  const r1 = build({ dir: tmp, out, log() {} });
  ok(r1.ok && !fs.readFileSync(out, "utf8").includes("en-brouillon") && !fs.readFileSync(out, "utf8").includes("en-pas-fini"), "brouillons et textes non publiés ignorés");
  L.writeJSON(path.join(tmp, "texts", "en", "en-cafe.json"), { ...t, sentences: [["Hi!", ""]] });
  ok(!build({ dir: tmp, out, log() {} }).ok, "traduction manquante → refusé");
  L.writeJSON(path.join(tmp, "texts", "en", "en-cafe.json"), { ...t, themes: ["plage"] });
  ok(!build({ dir: tmp, out, log() {} }).ok, "thème inconnu → refusé");
  L.writeJSON(path.join(tmp, "texts", "en", "en-cafe.json"), { ...t, sentences: [["a ".repeat(200), "x"]] });
  ok(!build({ dir: tmp, out, log() {} }).ok, "phrase > 300 caractères → refusée");
  L.writeJSON(path.join(tmp, "texts", "en", "en-cafe.json"), { ...t, id: "en-bus" });
  ok(!build({ dir: tmp, out, log() {} }).ok, "identifiant en double → refusé");
  fs.rmSync(tmp, { recursive: true });
}

if (fails) { console.log(`✗ ${fails} échec(s)`); process.exitCode = 1; } else console.log("✓ contenu");
module.exports = { ok };
