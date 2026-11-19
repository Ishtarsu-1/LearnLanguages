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

// ---------- C5 : textes piégés bloqués, texte correct accepté ----------
{
  const { checkText } = require("../tools/content-check.js");
  // Plan d'essai : l'unité u2 a pour mots nouveaux 커피, 마시다, 빨간색 ; 파란색 et 노란색 (couleurs) seraient en plus
  const lexicon = { "저": { fr: "je" }, "는": { fr: "" }, "를": { fr: "" }, "을": { fr: "" }, "이다": { fr: "être" }, "학생": { fr: "étudiant" }, "좋다": { fr: "bien" }, "오늘": { fr: "aujourd'hui" }, "카페": { fr: "café" }, "가다": { fr: "aller" }, "에": { fr: "" }, "에서": { fr: "" }, "커피": { fr: "café" }, "마시다": { fr: "boire" }, "컵": { fr: "tasse" }, "정말": { fr: "vraiment" }, "빨간색": { fr: "rouge", semantic_group: "couleur" }, "파란색": { fr: "bleu", semantic_group: "couleur" }, "친구": { fr: "ami" }, "같이": { fr: "ensemble" }, "맛있다": { fr: "bon" }, "그리고": { fr: "et" }, "네": { fr: "oui" } };
  const plan = { grammar_order: [{ id: "eseo", label: "에서", phase: 2, detect: { particles: ["에서"] } }], units: [
    { unit: "ko-A1-01", level: "A1", grammar: [], themes: ["cafe"], new_words: ["저", "학생", "좋다", "오늘", "카페", "가다", "친구", "같이", "맛있다", "그리고", "정말", "네"], review_words: [], texts: 1, kinds: ["Récit"] },
    { unit: "ko-A1-02", level: "A1", grammar: ["eseo"], themes: ["cafe"], new_words: ["커피", "마시다", "컵", "빨간색"], review_words: [], texts: 1, kinds: ["Récit"] },
  ] };
  const ctx = { plan, lexicon, freq: [], texts: [] };
  const good = [
    ["오늘|은 친구|하고 카페|에 가요=가다.", "Aujourd'hui, je vais au café avec un ami."], ["카페|에서 커피|를 마셔요=마시다.", "Au café, je bois un café."],
    ["저|는 빨간색 컵|을 좋아해요=좋다.", "J'aime la tasse rouge."], ["친구|는 커피|를 정말 좋아해요=좋다.", "Mon ami adore le café."],
    ["우리|는 같이 커피|를 마셔요=마시다.", "Nous buvons un café ensemble."], ["친구|는 파란색 컵|에 커피|를 마셔요=마시다.", "Mon ami boit dans une tasse bleue."],
    ["커피|가 정말 맛있어요=맛있다!", "Le café est vraiment bon !"], ["그리고 카페|에서 같이 이야기|해요=하다.", "Et on discute ensemble au café."],
  ];
  const T = (sentences) => ({ id: "ko-a1-02-1", lang: "ko", level: "A1", unit: "ko-A1-02", themes: ["cafe"], grammar: ["eseo"], title: "Essai", icon: "☕", kind: "Récit", status: "draft", sentences });
  // Texte correct : sans 파란색 ni 이야기/하다 hors programme, avec 빨간색 répété
  const ok1 = [...good.slice(0, 5), ["저|는 빨간색|을 정말 좋아해요=좋다.", "J'adore le rouge."], good[6], ["그리고 카페|에서 같이 컵|을 봐요=보다.", "Et on regarde les tasses au café."]];
  lexicon["우리"] = { fr: "nous" }; plan.units[0].new_words.push("우리", "하다", "보다");
  const rGood = checkText(T(ok1), ctx);
  ok(!rGood.blocking.length, "texte correct : aucun bloquant " + JSON.stringify(rGood.blocking));
  const bad = (label, sentences, re) => { const r = checkText(T(sentences), ctx); ok(r.blocking.some((b) => re.test(b)), `${label} → bloqué (${r.blocking.join(" | ") || "rien"})`); };
  bad("deux couleurs nouvelles dans la même unité", ok1.map((x, i) => (i === 5 ? ["친구|는 파란색|을 좋아해요=좋다.", "Mon ami aime le bleu."] : x)), /Interférence/);
  bad("romanisation", ok1.map((x, i) => (i === 0 ? ["oneul 카페|에 가요=가다.", "Aujourd'hui je vais au café."] : x)), /Romanisation/);
  bad("registre mélangé", ok1.map((x, i) => (i === 1 ? ["카페|에서 커피|를 마신다=마시다.", "Je bois un café au café."] : i === 2 ? ["저|는 빨간색 컵|을 좋아합니다=좋다.", "J'aime la tasse rouge."] : x)), /Registre/);
  bad("couverture trop basse", ok1.map(() => ["할머니|가 도서관|에서 신문|을 읽어요=읽다.", "La grand-mère lit le journal à la bibliothèque."]), /Couverture/);
  bad("traduction manquante", ok1.map((x, i) => (i === 0 ? [x[0], ""] : x)), /traduction/);
  bad("chinois dans la traduction", ok1.map((x, i) => (i === 0 ? [x[0], "Je vais au 韩语 café."] : x)), /asiatiques/);
  ok(checkText({ ...T(ok1), sentences: [...ok1, ...ok1] }, ctx).warnings.some((w) => /Longueur/.test(w)), "trop de phrases → avertissement");
  // Le contenu publié passe la vérification (CI)
  for (const lang of L.LANGS) for (const t of L.loadKind("texts")[lang]) { const r = checkText(t); if (r.blocking.length) ok(false, `${t.id} publié : ${r.blocking.join(" ; ")}`); }
  ok(true, "aucun texte publié bloquant");
}

// ---------- C6 : relecture, édition, publication, rejet (dans un dossier temporaire) ----------
const c6 = (async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-c6-"));
  fs.cpSync(L.CONTENT_DIR, tmp, { recursive: true });
  for (const f of fs.readdirSync(path.join(tmp, "drafts"))) if (f.endsWith(".json")) fs.rmSync(path.join(tmp, "drafts", f));
  const out = path.join(tmp, "content.data.js");
  const published = [];
  const CA = require("../content-admin.js").create({ dir: tmp, out, onPublished: (l, t) => published.push(t.id), spawnGen: () => {} });
  const draft = { id: "en-a1-test-1", lang: "en", level: "A1", unit: "en-A1-01", themes: ["rencontre"], grammar: ["be-present"], title: "Essai", icon: "👋", kind: "Monologue", status: "draft",
    source: { type: "generated", engine: "test", author: "Mochi", license: "CC BY 4.0" },
    sentences: [["I am=be a student.", "Je suis étudiant."], ["I like=like music.", "J'aime la musique."], ["The music is=be important.", "La musique est importante."], ["I like=like the zorblax.", "J'aime le zorblax."], ["And I am=be happy.", "Et je suis content."], ["A student and a=a idea.", "Un étudiant et une idée."]],
    review_notes: [{ id: "n1", sentence: 6, type: "naturel", issue_fr: "Bizarre", suggestion: "I have an idea.", suggestion_fr: "J'ai une idée.", status: "open" }] };
  L.writeJSON(path.join(tmp, "drafts", `${draft.id}.json`), draft);
  const call = (id, body) => CA.act(id, body);
  const q = await CA.handle("GET /api/admin/content/drafts", null, null, null, "nathan");
  ok(q.drafts.length === 1 && q.drafts[0].id === draft.id, "file de relecture");
  let d = await call(draft.id, { action: "edit", i: 5, text: "Then I am happy." }); // ré-annoté
  ok(d.sentences[5][0] === "Then I am=be happy." && d.checks, "édition → ré-annotation + re-vérification : " + d.sentences[5][0]);
  d = await call(draft.id, { action: "note", note: "n1", decision: "accept" });
  ok(d.sentences[5][0].startsWith("I have an idea") && d.sentences[5][1] === "J'ai une idée." && d.review_notes[0].status === "accepted", "remarque acceptée → correction appliquée");
  ok(Object.keys(d.lexicon_new || {}).includes("zorblax") && d.lexicon_new.zorblax.todo_review, "lemme inconnu → proposition de lexique à valider");
  await Promise.resolve().then(() => CA.publish(draft.id, "nathan")).then(() => ok(false, "publication refusée tant que le lexique n'est pas validé"), (e) => ok(e.status === 409, "publication refusée : " + e.message));
  await call(draft.id, { action: "lexicon", lemma: "zorblax", fr: "zorblax (truc)" });
  for (const [k, v] of Object.entries(L.readJSON(path.join(tmp, "drafts", `${draft.id}.json`)).lexicon_new)) if (v.todo_review) await call(draft.id, { action: "lexicon", lemma: k, fr: `${k} (fr)` });
  // Le texte d'essai n'est pas calibré (couverture, mots nouveaux) : on force des vérifications vertes pour tester la publication
  const f = path.join(tmp, "drafts", `${draft.id}.json`), cur = L.readJSON(f);
  L.writeJSON(f, { ...cur, unit: undefined });
  const r = await CA.publish(draft.id, "nathan");
  const pub = L.readJSON(path.join(tmp, "texts", "en", `${draft.id}.json`));
  ok(r.id === draft.id && pub.status === "published" && pub.review.by === "nathan" && !pub.checks && !pub.review_notes && pub.order > 100, "publié dans texts/ (statut, relecture, champs de travail retirés)");
  ok(L.readJSON(path.join(tmp, "lexicon", "en.json")).zorblax?.fr === "zorblax (truc)", "lexique validé ajouté");
  ok(fs.readFileSync(out, "utf8").includes(draft.id) && !fs.existsSync(f) && published[0] === draft.id, "content.data.js reconstruit, brouillon retiré, audio lancé");
  // Rejet : raison obligatoire, gardée
  L.writeJSON(path.join(tmp, "drafts", "en-a1-test-2.json"), { ...draft, id: "en-a1-test-2" });
  await Promise.resolve().then(() => CA.reject("en-a1-test-2", "")).then(() => ok(false, "rejet sans raison"), (e) => ok(e.status === 400, "rejet sans raison refusé"));
  CA.reject("en-a1-test-2", "Trop scolaire");
  ok(fs.readFileSync(path.join(tmp, "drafts", "rejected.jsonl"), "utf8").includes("Trop scolaire") && !fs.existsSync(path.join(tmp, "drafts", "en-a1-test-2.json")), "rejet : raison gardée, brouillon retiré");
  // Jamais de chemin fourni par le client
  for (const bad of ["../texts/en/en-cafe", "en-cafe/../../x", "/etc/passwd", "en-x.json"]) await Promise.resolve().then(() => CA.act(bad, { action: "meta", title: "x" })).then(() => ok(false, "chemin accepté : " + bad), (e) => ok(e.status === 400, "identifiant refusé : " + bad));
  fs.rmSync(tmp, { recursive: true });
})().catch((e) => ok(false, "C6 : " + e.stack));

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
})().then(() => c6).then(() => {
  if (fails) { console.log(`✗ ${fails} échec(s)`); process.exitCode = 1; } else console.log("✓ contenu");
});
module.exports = { ok };
