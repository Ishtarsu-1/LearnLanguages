let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } };
// 1. Tous les lemmes des textes / exercices / exemples sont dans le lexique
for (const lang of ["en", "ko"]) {
  const srcs = [...TEXTS[lang].flatMap((t) => t.sentences.map((s) => s[0])), ...PRODUCTION[lang].map((p) => p.target), ...(lang === "ko" ? KO_GRAMMAR.flatMap((g) => g.examples) : [])];
  for (const s of srcs) for (const w of parseSentence(s, lang)) for (const g of w.segs) for (const l of g.lemmas) ok(LEXICON[lang][l], `${lang}: lemme manquant « ${l} » dans « ${s} »`);
  for (const p of PRODUCTION[lang]) for (const w of p.words) ok(LEXICON[lang][w], `${lang}: mot d'exercice inconnu ${w}`);
}
for (const g of KO_GRAMMAR) for (const q of g.quiz) ok(q.o.includes(q.a), `quiz ${g.id}: réponse absente`);
for (const g of KO_GRAMMAR) for (const ex of g.examples) ok(TEXTS.ko.some(t => t.sentences.some(s => s[0] === ex)), `exemple sans traduction: ${ex}`);
// 2. Parsing
const s1 = toSentence("저|는 커피|를 좋아해요=좋아하다.", "ko");
ok(s1.text === "저는 커피를 좋아해요.", "plain ko: " + s1.text);
ok(s1.words[0].segs[1].particle && !s1.words[2].segs[0].particle, "particules");
const sp = splitAround(s1.words, 1, 1);
ok(sp.before === "저는 커피" && sp.after === " 좋아해요.", "splitAround " + JSON.stringify(sp));
const s2 = toSentence("No, that's=that+be all.", "en");
ok(s2.text === "No, that's all." && s2.words[1].segs[0].lemmas.join() === "that,be", "en contraction " + s2.text);
// 3. Hangul
ok(composeHangul("ㄴ", "ㅏ") === "나" && decomposeHangul("져").join("") === "ㅈㅕ", "compose");
for (let d = 1; d <= HANGUL_DAYS.length; d++) { const qs = hangulQuestions(d); ok(qs.length > 0, "hangul q " + d); for (const q of qs) if (!q.build) ok(q.options.includes(q.answer) && new Set(q.options).size === q.options.length, `hangul day ${d} options ${q.options}`); else ok(q.leads.includes(q.target_l) && q.vowels.includes(q.target_v), "build opts"); }
// 4. Couverture
ok(coverage("en", textById("en", "en-cafe").parsed) < 0.5, "couverture débutant faible");
for (const l of Object.keys(LEXICON.en)) state.langs.en.known[l] = true;
ok(Math.abs(coverage("en", textById("en", "en-cafe").parsed) - 1) < 1e-9, "couverture 100%");
state.langs.en.known = {};
// 5. Recast & checks
let r = recast("I live next to door", "I live next door.", "en"); ok(r.uHtml.includes("<del>to</del>"), "recast en " + r.uHtml);
r = recast("저는 커피을 좋아해요", "저는 커피를 좋아해요.", "ko"); ok(r.tHtml.includes("<ins>를</ins>") && r.uHtml.includes("<del>을</del>"), "recast ko " + r.tHtml + " | " + r.uHtml);
const ex = PRODUCTION.ko.find((e) => e.id === "p-ko-3");
let iss = koChecks(ex, "저는 커피을 좋아해", parseSentence(ex.target, "ko"));
ok(iss.register.length === 1 && !iss.register[0].ok && iss.particles.length === 1 && iss.particles[0].want === "를", "koChecks " + JSON.stringify(iss));
iss = koChecks(ex, "저는 커피를 좋아합니다", parseSentence(ex.target, "ko")); ok(iss.register[0]?.ok, "합니다 soft");
// 6. Rendu de toutes les routes + flux
const routes = ["", "#/pourquoi", "#/profil", "#/learn", "#/nope"];
for (const lang of ["en", "ko"]) for (const [t] of TABS[lang]) routes.push(`#/lang/${lang}/${t}`);
const render1 = (h) => { location.hash = h; try { route(); } catch (e) { fails++; console.log("FAIL route", h, e.stack.split("\n").slice(0, 3).join(" | ")); } };
routes.forEach(render1);
// Flux anglais : lire → capturer → réviser → produire
render1("#/lang/en/lire/en-cafe");
ui.reader.sel = { s: 0, w: 5, g: 0 }; render1("#/lang/en/lire/en-cafe");
actions.capture(); actions["capture-all"](); actions["mark-known"]();
ok(state.cards.filter((c) => c.lang === "en").length > 5, "cartes capturées");
ok(state.cards.every((c) => c.context && c.contextFr && c.context === c.before + c.surface + c.after), "contexte obligatoire");
actions["finish-read"]();
render1("#/lang/en/revisions/go");
const n0 = ui.review.queue.length; ok(n0 > 0 && n0 <= state.settings.newPerDay, "plafond nouvelles cartes " + n0);
for (let i = 0; i < 200 && ui.review.queue.length; i++) { actions.reveal(); actions.rate({ dataset: { g: 3 } }); }
ok(state.logs.length >= n0, "logs");
ok(!state.cards.some((c) => c.type === "prod"), "pas de déblocage le jour 1");
for (let day = 0; day < 2; day++) { state.cards.filter(c => c.type === "recog" && c.lang === "en" && c.fsrs.state === 2).forEach(c => c.fsrs.due = new Date(0).toISOString()); render1("#/lang/en/revisions"); render1("#/lang/en/revisions/go"); for (let i = 0; i < 200 && ui.review.queue.length; i++) { actions.reveal(); actions.rate({ dataset: { g: 3 } }); } }
ok(state.cards.some((c) => c.type === "prod") && state.cards.some((c) => c.type === "listen"), "déblocage prod/listen");
// révision d'une carte prod
state.cards.filter(c => c.type === "prod").forEach(c => c.fsrs.due = new Date(0).toISOString());
render1("#/lang/en/revisions"); render1("#/lang/en/revisions/go");
const pc = state.cards.find(c => c.id === ui.review.queue[0]); 
ui.review.typed = "xx"; ui.review.revealed = true; render1("#/lang/en/revisions/go");
render1("#/lang/en/produire");
ui.prod.ex = PRODUCTION.en[1];
document.getElementById = (id) => (id === "prod-text" ? { value: "I live next to door" } : { innerHTML: "", classList: { add() {}, remove() {}, toggle() {} }, focus() {} });
actions["check-prod"]();
ok(ui.prod.result && !ui.prod.result.perfect, "prod imparfait");
render1("#/lang/en/produire");
ok(state.langs.en.session.production && state.langs.en.session.input, "session");
// Coréen : Hangul gate puis grammaire, production avec erreurs de particule répétées
render1("#/lang/ko/lire/ko-cafe");
render1("#/lang/ko/hangul/1");
actions["start-hangul"]({ dataset: { day: "1" } });
for (let i = 0; i < 100 && ui.quiz.queue.length; i++) { const q = ui.quiz.qs[ui.quiz.queue[0]]; actions["quiz-pick"]({ dataset: { o: i % 3 ? q.answer : "zzz" } }); render1("#/lang/ko/hangul/1"); actions["quiz-next"](); }
render1("#/lang/ko/hangul/1");
ok(state.langs.ko.hangulDays[1], "jour 1 hangul");
render1("#/lang/ko/hangul/6"); actions["start-hangul"]({ dataset: { day: "6" } });
const bq = ui.quiz.qs[ui.quiz.queue[0]]; ui.quiz.build = { l: bq.target_l, v: bq.target_v }; actions["build-check"](); ok(ui.quiz.answer.ok, "build ok"); render1("#/lang/ko/hangul/6");
state.langs.ko.hangulDone = true;
render1("#/lang/ko/parcours");
render1("#/lang/ko/grammaire/haeyo"); actions["start-gram"]({ dataset: { id: "haeyo" } });
for (let i = 0; i < 20 && ui.quiz.queue.length; i++) { const q = ui.quiz.qs[ui.quiz.queue[0]]; actions["quiz-pick"]({ dataset: { o: q.answer } }); actions["quiz-next"](); }
render1("#/lang/ko/grammaire/haeyo"); ok(state.langs.ko.grammarDone.haeyo, "grammaire faite");
render1("#/lang/ko/grammaire/do"); // verrouillé
render1("#/lang/ko/lire/ko-intro");
render1("#/lang/ko/produire");
for (let k = 0; k < 2; k++) {
  ui.prod.ex = ex; ui.prod.result = null;
  document.getElementById = (id) => (id === "prod-text" ? { value: "저는 커피을 좋아해요" } : { innerHTML: "", classList: { add() {}, remove() {}, toggle() {} }, focus() {} });
  actions["check-prod"](); render1("#/lang/ko/produire");
}
const cz = state.cards.find((c) => c.type === "cloze"); ok(cz && cz.surface === "를" && cz.before === "저는 커피" , "carte cloze " + JSON.stringify(cz && [cz.before, cz.surface, cz.after]));
ui.prod.ex = PRODUCTION.ko[3]; ui.prod.result = null;
document.getElementById = (id) => (id === "prod-text" ? { value: "서울에서 살아요" } : { innerHTML: "", classList: { add() {}, remove() {}, toggle() {} }, focus() {} });
actions["check-prod"](); ok(ui.prod.result.perfect, "variante acceptée");
actions["add-frequent"](); render1("#/lang/ko/mots");
actions["ear-play"](); render1("#/lang/ko/oreille");
location.hash = "#/lang/en/fauxamis"; actions["add-faux"](); render1("#/lang/en/fauxamis");
ok(state.cards.filter(c => c.source === "faux-amis").length === FAUX_AMIS.length, "faux amis");
render1("#/profil");
console.log(fails ? `${fails} échec(s)` : "OK : tous les tests passent", "| cartes:", state.cards.length, "logs:", state.logs.length);
// --- Comptes (rendu) ---
let html;
const grab = (h) => { location.hash = h; route(); };
const realGet = document.getElementById;
let appEl = { innerHTML: "", querySelector: () => null, addEventListener() {} };
serverOn = false; html = viewAuth("connexion"); ok(html.includes("Comptes indisponibles"), "auth sans serveur");
serverOn = true; html = viewAuth("inscription"); ok(html.includes('data-form="signup"') && html.includes("sera rattachée"), "inscription");
html = viewProfile(); ok(html.includes("mode invité") && html.includes("heatmap") && !html.includes("avatar-file"), "profil invité");
account = { id: 1, email: "a@b.co", name: "Léa", avatar_emoji: "🦊", avatar_url: "/avatars/1-abc.webp", created_at: new Date().toISOString() };
globalThis.fetch = async () => ({ ok: true, json: async () => ({ sessions: [] }) });
html = viewProfile(); ok(html.includes("avatar-file") && html.includes('src="/avatars/1-abc.webp"') && html.includes('data-form="password"') && html.includes('data-form="delete"'), "profil connecté");
ok(state.history[today()] && state.history[today()].en.rev > 0 && state.history[today()].en.prod > 0, "suivi activité " + JSON.stringify(state.history));
ok(activityCard().split('class="hm l').length - 1 >= 113, "heatmap cellules");
console.log(fails ? `${fails} échec(s) (comptes)` : "OK : rendu comptes");
// --- Exercices ---
for (const lang of ["en", "ko"]) {
  state.langs.ko.hangulDone = true;
  for (const kind of Object.keys(EX_KINDS).filter((k) => EX_KINDS[k].langs.includes(lang))) {
    newExercise(lang, kind);
    location.hash = `#/lang/${lang}/exercices`; route();
    const E = ui.ex, q = E.q;
    let h = tabExercises(lang);
    ok(h.includes("ex-card"), `exercice ${lang}/${kind} rendu`);
    if (kind === "ordre") {
      q.tiles.map((t, ti) => [t.i, ti]).sort((a, b) => a[0] - b[0]).forEach(([, ti]) => actions["ex-tile"]({ dataset: { t: String(ti) } }));
      actions["ex-check"](); ok(E.result.ok, `ordre ${lang} correct`);
    } else if (kind === "dictee") {
      document.getElementById = (id) => (id === "ex-answer" ? { value: q.s.text.toUpperCase() === q.s.text ? q.s.text : q.s.text.toLowerCase() } : { value: "", innerHTML: "", classList: { add() {}, remove() {}, toggle() {} }, focus() {} });
      actions["ex-check"](); ok(E.result.ok, `dictée ${lang} (casse ignorée)`);
    } else {
      ok(q.options.includes(q.answer) && new Set(q.options).size === q.options.length, `${kind} options valides`);
      actions["ex-pick"]({ dataset: { o: q.answer } }); ok(E.picked === q.answer, `${kind} réponse`);
    }
    h = tabExercises(lang); ok(h.includes('data-act="ex-next"'), `${kind} : bouton suivant`);
  }
}
ok(state.history[today()].en.ex > 0, "exercices comptés dans l'activité");
console.log(fails ? `${fails} échec(s) (exercices)` : "OK : exercices");
