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

// ---------- C3 : plan, fréquences, anti-interférence ----------
{
  const P = require("../tools/plan-lib.js"), { suggest, groupOf } = require("../tools/plan-suggest.js");
  for (const lang of L.LANGS) {
    const freq = L.loadFreq(lang), plan = L.loadPlan(lang);
    ok(freq.length > 3000 && freq.every((f, i) => f.rank === i + 1), `${lang} : liste de fréquence chargée et ordonnée (${freq.length})`);
    ok(plan.units.length >= 10 && plan.units.some((u) => u.legacy), `${lang} : plan avec socle et unités`);
    const groups = (u) => u.new_words.map((w) => groupOf(lang, L.loadLexicon()[lang], w)).filter(Boolean);
    ok(plan.units.every((u) => new Set(groups(u)).size === groups(u).length), `${lang} : aucune unité n'a deux mots nouveaux du même groupe`);
  }
  ok(L.loadPlan("en").units.slice(0, 3).every((u) => u.first_steps), "anglais : 3 unités « tout premiers pas » en tête");
  // Anti-interférence : red/blue (couleurs) et early/late (confusables) jamais dans la même unité
  const lexicon = { early: { fr: "tôt", confusable_with: ["late"] }, late: { fr: "tard", confusable_with: ["early"] }, cat: { fr: "chat", semantic_group: "animal" }, dog: { fr: "chien", semantic_group: "animal" } };
  const freq = ["red", "blue", "early", "late", "cat", "dog", "bread", "walk", "happy", "green"].map((lemma, i) => ({ lemma, rank: i + 1, level: "A1", pos: "", cog: false }));
  const plan = { grammar_order: [{ id: "g1", phase: 1, detect: { regex: "x" } }], units: [] };
  const r = suggest("en", { next: 3, perUnit: 4, plan, lexicon, freq, texts: [] });
  const together = (a, b) => r.units.some((u) => u.new_words.includes(a) && u.new_words.includes(b));
  ok(!together("red", "blue") && !together("red", "green") && !together("early", "late") && !together("cat", "dog"), "plan-suggest : jamais deux mots du même groupe ni deux confusables : " + r.units.map((u) => u.new_words.join("/")).join(" · "));
  ok(r.units.flatMap((u) => u.new_words).length === 10 && r.units[0].new_words[0] === "red", "plan-suggest : tous les mots placés, les plus fréquents d'abord");
  ok(r.units[1].review_words.includes("red"), "plan-suggest : mots de l'unité précédente en révision");
  // Couverture d'unité : 1re occurrence d'un mot nouveau = inconnue, mot hors programme = toujours inconnu
  const cov = P.unitCoverage("en", [["The cat is=be here. The cat is=be happy. Zebra!", "x"]], new Set(["the", "be", "here", "happy"]), new Set(["cat"]));
  ok(cov.tokens === 9 && cov.unknown === 2 && cov.newCounts.cat === 2 && cov.outside.zebra === 1, `couverture d'unité : ${JSON.stringify(cov)}`);
  ok(P.grammarHits("ko", { detect: { particles: ["은", "는"] } }, [["저|는 학생|이에요=이다.", ""], ["커피|가 좋아요=좋다.", ""]]) === 1, "détection d'un point de grammaire (particules)");
}

// ---------- C2 : annotation automatique ≥ 95 % des lemmes, 100 % des particules ----------
(async () => {
  const A = require("../tools/annotate.js");
  const en = await A.evaluate("en");
  ok(en.lemmaRate >= 0.95, `annotation anglaise : ${(en.lemmaRate * 100).toFixed(1)} % des lemmes (≥ 95 %)`);
  if (en.gaps.length) console.log(A.evalReport("en", en));
  // Coréen : réponses de Kiwi enregistrées (tests/fixtures/kiwi-ko-texts.json), rejouées sans serveur
  const rec = L.readJSON(path.join(__dirname, "fixtures", "kiwi-ko-texts.json"));
  const analyze = async (text) => { if (!rec[text]) throw new Error(`phrase non enregistrée : ${text}`); return rec[text]; };
  const ko = await A.evaluate("ko", { analyze });
  ok(ko.lemmaRate >= 0.95, `annotation coréenne (Kiwi enregistré) : ${(ko.lemmaRate * 100).toFixed(1)} % des lemmes (≥ 95 %)`);
  ok(ko.particleRate === 1, `annotation coréenne : ${(ko.particleRate * 100).toFixed(1)} % des particules (100 %)`);
  if (ko.gaps.length) console.log(A.evalReport("ko", ko));
  // Kiwi en direct, s'il tourne (sinon : ignoré, voir SETUP.md « Produire du contenu »)
  if (await A.kiwiHealth()) {
    const live = await A.evaluate("ko");
    ok(live.lemmaRate >= 0.95 && live.particleRate === 1, `annotation coréenne (Kiwi en direct) : ${(live.lemmaRate * 100).toFixed(1)} % / particules ${(live.particleRate * 100).toFixed(1)} %`);
    if (live.gaps.length) console.log(A.evalReport("ko", live));
  } else console.log("  (Kiwi non joignable : test en direct ignoré)");
  // Cas particuliers
  const ctx = { lexicon: { "go": { fr: "" }, "cat": { fr: "" } }, freq: [] };
  const [s1] = await A.annotate(["Let's go! I don't know, it's Tom's cat."], "en", ctx);
  ok(s1 === "Let's=let+us go! I don't=do+not know, it's=it+be @Tom's cat.", "contractions et possessif : " + s1);
  ok((await A.annotate(["Where's Pepper?"], "en", ctx))[0] === "Where's=where+be @Pepper?", "nom propre listé (contenu existant)");
  ok(await A.kiwiAnalyze("x", { url: "http://127.0.0.1:9" }).then(() => false, (e) => e.code === "KIWI_DOWN"), "Kiwi injoignable : erreur claire");
})().then(() => {
  if (fails) { console.log(`✗ ${fails} échec(s)`); process.exitCode = 1; } else console.log("✓ contenu");
});
module.exports = { ok };
