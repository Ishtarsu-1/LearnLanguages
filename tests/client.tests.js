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
for (let d = 1; d <= HANGUL_DAYS.length; d++) { const qs = hangulQuestions(d); ok(qs.length > 0, "hangul q " + d); for (const q of qs) if (q.type) ok(q.target && q.fr, "écriture " + d); else if (!q.build) ok(q.options.includes(q.answer) && new Set(q.options).size === q.options.length, `hangul day ${d} options ${q.options}`); else ok(q.leads.includes(q.target_l) && q.vowels.includes(q.target_v), "build opts"); }
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
state.langs.ko.hangulDone = true; // l'écoute coréenne attend le Hangul
render1("#/lang/ko/oreille"); actions["ear-play"](); render1("#/lang/ko/oreille");
{ // HVPT : au moins 4 voix, score par contraste, contraste faible plus fréquent
  ok(speakers("ko").length >= 4, "au moins 4 voix");
  const G = ui.ear, key = EAR.ko.pairs[G.i].label;
  actions["ear-pick"]({ dataset: { w: EAR.ko.pairs[G.i].items.find((w) => w !== G.target) } });
  ok(state.langs.ko.earStats[key].n === 1 && state.langs.ko.earStats[key].ok === 0, "score par contraste");
  ok(tabEar("ko").includes("Réécoute les deux") && tabEar("ko").includes("Mes scores par son"), "réécoute + scores");
  state.langs.ko.earStats[key] = { n: 20, ok: 2 };
  // 2000 tirages : l'écart attendu (~22 % contre 17 %) ressort à coup sûr (300 tirages échouaient ~1 fois sur 100)
  let hits = 0; for (let i = 0; i < 2000; i++) if (EAR.ko.pairs[pickPair("ko")].label === key) hits++;
  const share = EAR.ko.pairs.filter((p) => p.label === key).length / EAR.ko.pairs.length;
  ok(hits / 2000 > share, `contraste faible favorisé (${hits}/2000 vs ${share.toFixed(2)})`);
  actions["ear-next"]();
}
location.hash = "#/lang/en/fauxamis"; actions["add-faux"](); render1("#/lang/en/fauxamis");
ok(state.cards.filter(c => c.source === "faux-amis").length === FAUX_AMIS.length, "faux amis");
render1("#/profil");
// Série hebdomadaire (§16) : 5 jours sur 7, rater un jour ne casse rien
{
  const L = { fullDays: {} }, mon = monday(), d = new Date(mon);
  const mark = (base, offsets) => offsets.forEach((o) => { const x = new Date(base); x.setDate(x.getDate() + o); L.fullDays[today(x)] = true; });
  mark(mon, [-7, -6, -5, -3, -1]); // semaine dernière : 5 jours avec des trous
  mark(mon, [-14, -13, -12, -11]); // il y a 2 semaines : 4 jours → coupe la série
  ok(weekly(L).streak === 1, "série hebdo = 1 (semaine dernière) : " + weekly(L).streak);
  ok(weekly(L).thisWeek === 0 && weekly(L).days.length === 7, "semaine en cours vide");
  mark(mon, [-10]);
  ok(weekly(L).streak === 2, "2 semaines régulières");
  // Migration de l'ancienne série quotidienne
  const mig = normalizeState({ langs: { en: { streak: 3, lastStreakDay: today() } } });
  ok(Object.keys(mig.langs.en.fullDays).length === 3 && mig.langs.en.fullDays[yesterday()], "migration série quotidienne");
}
// Page « Pourquoi » : chaque renvoi pointe vers une source existante
ok(SOURCES.length === 29 && WHY.every(([, , , refs]) => refs.every((n) => n >= 1 && n <= SOURCES.length)), "sources du « Pourquoi »");
// Test de niveau (ROADMAP P1)
{
  const saved = JSON.stringify(state);
  ok(estimateEn([{ known: 6, size: 6 }, { known: 6, size: 6 }, { known: 2, size: 6 }, { fake: true, known: 0 }, { fake: true, known: 0 }, { fake: true, known: 0 }]).words === 2300, "estimation sans faux mots");
  const e2 = estimateEn([{ known: 6, size: 6 }, { known: 6, size: 6 }, { fake: true, known: 1 }, { fake: true, known: 0 }]);
  ok(e2.fakeRate === 0.5 && e2.words === 2000 && e2.solid === 2, "correction par les faux mots " + JSON.stringify(e2));
  ok(estimateEn([{ known: 6, size: 6 }, { fake: true, known: 1 }]).words === 0, "tout coché, faux mots compris → 0");
  // Parcours anglais : 3 tranches connues, la 4e non, aucun faux mot
  state.langs.en.known = {}; state.langs.en.placement = null; ui.place = null;
  ok(placementPending("en") || state.cards.some((c) => c.lang === "en"), "offre de test");
  location.hash = "#/lang/en/niveau"; let h = tabPlacement("en");
  ok(h.includes("place-pick"), "écran du test");
  for (let b = 0; b < 4; b++) {
    ui.place.screen.forEach((x, i) => { if (!x.fake && b < 3) actions["place-pick"]({ dataset: { i: String(i) } }); });
    actions["place-next"]();
  }
  ok(ui.place.step === "done" && state.langs.en.placement.words === 3000, "anglais ~3000 mots : " + JSON.stringify(state.langs.en.placement));
  ok(state.langs.en.known.coffee && state.langs.en.known.elevator && !state.langs.en.known.actually, "lexique marqué, faux amis exclus");
  ok(tabPlacement("en").includes("Tu connais environ"), "écran de résultat");
  // Parcours coréen : lit le Hangul, connaît -요, a étudié, réussit 2 points sur 4
  const K = state.langs.ko; K.hangulDone = false; K.grammarDone = {}; K.placement = null; ui.place = null;
  location.hash = "#/lang/ko/niveau"; tabPlacement("ko");
  ["hangul", "haeyo", "studied"].forEach((q) => actions["place-answer"]({ dataset: { q, v: "oui" } }));
  actions["place-next"](); ok(ui.place.step === "read", "contrôle de lecture");
  ok(tabPlacement("ko").includes("mot d'emprunt"), "rendu lecture");
  while (ui.place.step === "read") actions["place-read"]({ dataset: { o: ui.place.read[ui.place.i].fr } });
  ok(ui.place.step === "gram", "mini-quiz de grammaire");
  let gi = 0; while (ui.place.step === "gram") { const g = ui.place.gram[ui.place.i]; actions["place-gram"]({ dataset: { o: gi++ === 2 ? "" : g.item.a } }); }
  ok(K.hangulDone && K.grammarDone.haeyo && K.grammarDone["eun-neun"] && K.grammarDone[KO_GRAMMAR[2].id] && !K.grammarDone[KO_GRAMMAR[4].id], "coréen : Hangul + points consécutifs " + JSON.stringify(K.placement));
  // Ne sait pas lire → Hangul non validé
  K.hangulDone = false; ui.place = null; tabPlacement("ko");
  actions["place-answer"]({ dataset: { q: "hangul", v: "oui" } }); actions["place-answer"]({ dataset: { q: "haeyo", v: "non" } }); actions["place-answer"]({ dataset: { q: "studied", v: "non" } });
  actions["place-next"](); while (ui.place.step === "read") actions["place-read"]({ dataset: { o: "" } });
  ok(!K.hangulDone && ui.place.step === "done", "lecture ratée : Hangul d'abord");
  actions["place-skip"](); ok(K.placement.skipped && !placementPending("ko"), "test passé");
  Object.assign(state, JSON.parse(saved)); ui.place = null;
}
// Anti-interférence (§12)
{
  const saved = JSON.stringify(state);
  state.cards = []; state.langs.en.introduced = { date: null, count: 0 }; state.langs.en.session = {};
  const mk = (lemma) => addCard("en", { lemma, before: "", surface: lemma, after: ".", contextFr: "", fr: "", source: "t" });
  ["coffee", "tea", "milk", "early", "late", "door"].forEach(mk);
  let ids = newCards("en").map((c) => c.lemma);
  ok(ids.join() === "coffee,early,door", "1 mot par groupe, pas de paire confusable : " + ids);
  rateCard(newCards("en")[0].id, 3); // coffee introduit aujourd'hui
  ids = newCards("en").map((c) => c.lemma);
  ok(!ids.includes("tea") && !ids.includes("milk") && ids.includes("early"), "groupe déjà pris aujourd'hui : " + ids);
  state.langs.en.introduced.date = "2000-01-01"; // un autre jour
  ok(newCards("en").some((c) => c.lemma === "tea"), "le lendemain, le groupe est libre");
  Object.assign(state, JSON.parse(saved));
}
// Retour après une absence : révisions plafonnées, pas de nouvelles cartes
{
  const saved = JSON.stringify(state);
  const past = new Date(Date.now() - 10 * 864e5);
  state.history = { [today(past)]: { en: { sec: 60, rev: 1, prod: 0, read: 0 } } };
  state.langs.en.session = {}; state.langs.en.catchUp = false;
  const base = state.cards.find((c) => c.lang === "en");
  for (let i = 0; i < 60; i++) state.cards.push({ ...base, id: "late" + i, fsrs: { ...base.fsrs, state: 2, due: past.toISOString() } });
  ok(dueCards("en").length >= 60 && reviewQueue("en").length === CATCHUP_FIRST && newCards("en").length === 0, "plafond après absence : " + reviewQueue("en").length);
  ok(session("en").welcomeBack >= 60, "message de retour");
  for (let i = 0; i < 5; i++) rateCard(reviewQueue("en")[0].id, 3);
  ok(reviewQueue("en").length === CATCHUP_FIRST - 5, "le plafond décompte les révisions faites");
  ok(tabToday("en").includes("Content de te revoir"), "écran de retour");
  Object.assign(state, JSON.parse(saved)); state.cards = JSON.parse(saved).cards;
}
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
  for (const asked of [...Object.keys(EX_KINDS).filter((k) => EX_KINDS[k].langs.includes(lang)), "melange", "melange", "melange"]) {
    newExercise(lang, asked);
    const kind = ui.ex.q.kind;
    if (asked === "melange") ok(ui.ex.kind === "melange" && ui.ex.q.mix && kind !== "melange", "mélange → un vrai exercice");
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
    } else if (["trou", "forme", "traduction"].includes(kind)) {
      const ans = kind === "traduction" ? q.s.text : q.answer;
      ok(ans && h.includes('id="ex-answer"'), `${kind} : champ de saisie`);
      document.getElementById = (id) => (id === "ex-answer" ? { value: ans } : { value: "", innerHTML: "", classList: { add() {}, remove() {}, toggle() {} }, focus() {} });
      actions["ex-check"](); ok(E.result.ok, `${kind} ${lang} : bonne réponse acceptée`);
    } else if (kind === "paires") {
      ok(q.words.length === 5 && new Set(q.words.map((w) => LEXICON[lang][w].fr)).size === 5, "5 paires distinctes");
      actions["pair-l"]({ dataset: { i: "0" } }); actions["pair-r"]({ dataset: { i: "1" } }); ok(q.errors === 1 && !q.matched.length, "mauvaise association");
      q.words.forEach((_, i) => { actions["pair-l"]({ dataset: { i: String(i) } }); actions["pair-r"]({ dataset: { i: String(i) } }); });
      ok(q.matched.length === 5, "toutes les paires");
    } else if (kind === "confusion" && q.empty) {
      ok(h.includes("les deux") && !h.includes("ex-next"), "confusion : fermé tant que les deux mots ne sont pas connus");
      continue;
    } else {
      ok(q.options.includes(q.answer) && new Set(q.options).size === q.options.length, `${kind} options valides`);
      actions["ex-pick"]({ dataset: { o: q.answer } }); ok(E.picked === q.answer, `${kind} réponse`);
    }
    h = tabExercises(lang); ok(h.includes('data-act="ex-next"'), `${kind} : bouton suivant`);
  }
}
ok(state.history[today()].en.ex > 0, "exercices comptés dans l'activité");
// Alternance (§13) : la grammaire déjà vue revient mélangée, les ratés pèsent plus
KO_GRAMMAR.slice(0, 3).forEach((g) => (state.langs.ko.grammarDone[g.id] = true));
let gq = null;
for (let i = 0; i < 200 && !gq; i++) { newExercise("ko", "melange"); if (ui.ex.q.kind === "grammaire") gq = ui.ex.q; }
ok(gq && KO_GRAMMAR.slice(0, 3).includes(gq.g) && gq.options.includes(gq.answer), "mélange : item de grammaire déjà vue");
ok(tabExercises("ko").includes("Choisis la bonne forme"), "rendu grammaire mélangée");
actions["ex-pick"]({ dataset: { o: gq.options.find((o) => o !== gq.answer) } });
ok(state.langs.ko.grammarMiss[gq.g.id] === 1, "raté compté");
console.log(fails ? `${fails} échec(s) (exercices)` : "OK : exercices");
{ // Audio : voix serveur prioritaires, choix dans le profil, repli navigateur ; thème
  const saved = features;
  ok(audioSource("ko") === null && viewProfile().includes("Aucune voix coréenne") && viewProfile().includes("speech-dispatcher"), "aucune voix → aide affichée");
  features = { ...saved, tts: { ko: ["ko_a", "ko_b"] } };
  ok(audioSource("ko") === "server" && audioSource("en") === null, "voix serveur coréennes");
  const sp = speakers("ko");
  ok(sp.length === 4 && sp[0].server === "ko_a" && sp[1].server === "ko_b" && sp[2].pitch !== 1, "4 locuteurs dont 2 vrais + variations");
  ok(viewProfile().includes("Voix neuronales du serveur (2)") && viewProfile().includes('value="ko_b"'), "profil : voix serveur listées");
  state.settings.voices = { ko: "browser:Yuna" };
  ok(audioSource("ko") === "server", "voix navigateur d'un autre appareil absente → voix serveur");
  state.settings.voices = {};
  features = saved;
  actions.theme({ dataset: { v: "dark" } }); ok(document.documentElement.dataset.theme === "dark", "thème sombre forcé");
  actions.theme({ dataset: { v: "auto" } }); ok(document.documentElement.dataset.theme === undefined, "thème auto");
}
{ // Navigation principale (charte §7)
  state.lastLang = "ko"; location.hash = "#/reviser"; route(); ok(location.hash === "#/lang/ko/pratique", "S'entraîner → section de la dernière langue");
  location.hash = "#/lire"; route(); ok(location.hash === "#/lang/ko/histoire", "Lire");
  const last = state.lastLang; state.lastLang = null; location.hash = "#/aujourdhui"; route(); ok(location.hash === "#/aujourdhui", "sans langue : accueil"); state.lastLang = last;
}
{ // Mot de passe oublié, réinitialisation, bandeau de vérification
  const on = serverOn, acc0 = account; serverOn = true; account = null;
  ok(viewAuth("connexion").includes("#/mot-de-passe-oublie"), "lien mot de passe oublié");
  ok(viewForgot().includes('data-form="forgot"'), "formulaire d'oubli");
  ui.forgotSent = "a@b.fr"; ok(viewForgot().includes("Si un compte existe pour <b>a@b.fr</b>"), "message neutre après envoi"); ui.forgotSent = null;
  ok(viewReset("abc").includes('name="token" value="abc"') && viewReset("abc").includes('name="confirm"'), "formulaire de réinitialisation");
  account = { id: 1, email: "z@t.fr", created_at: new Date().toISOString(), email_verified: false };
  ok(viewProfile().includes("Confirme ton adresse e-mail") && viewProfile().includes("resend-verify"), "bandeau si non vérifiée");
  account.email_verified = true; ok(!viewProfile().includes("Confirme ton adresse e-mail"), "pas de bandeau si vérifiée");
  account = acc0; serverOn = on;
}
{ // Quêtes de la semaine
  const q1 = weekQuests("en"), q2 = weekQuests("en");
  ok(q1.length === 3 && new Set(q1.map((q) => q.id)).size === 3 && q1.map((q) => q.id).join() === q2.map((q) => q.id).join(), "3 quêtes distinctes, tirage stable");
  const nextMon = new Date(monday()); nextMon.setDate(nextMon.getDate() + 7);
  let differs = false; for (let i = 1; i < 6 && !differs; i++) { const m = new Date(monday()); m.setDate(m.getDate() + 7 * i); differs = weekQuests("en", m).map((q) => q.id).join() !== q1.map((q) => q.id).join(); }
  ok(differs, "les quêtes changent d'une semaine à l'autre");
  const goal0 = state.goal; state.goal = 20;
  const read = QUESTS.find((q) => q.id === "read");
  ok(Math.round(read.base * 1.6) === 5, "objectifs proportionnels à l'objectif du jour"); state.goal = goal0;
  // Compléter une quête puis réclamer l'XP, une seule fois
  const q = weekQuests("en")[0], L = state.langs.en, xp0 = L.xp;
  const h = (state.history[today()] ||= {}).en ||= { sec: 0, rev: 0, prod: 0, read: 0 };
  if (q.id === "row") for (let i = 0; i < 7; i++) L.fullDays[today(new Date(+monday() + i * 864e5))] = true;
  else if (q.id === "min") h.sec += q.goal * 60; else h[q.id] = (h[q.id] || 0) + q.goal;
  const done = weekQuests("en").find((x) => x.id === q.id);
  ok(q.id === "row" ? done.n >= 1 : done.done, "progression lue dans l'historique " + JSON.stringify(done));
  if (done.done) {
    ok(questsCard("en").includes("quest-claim"), "bouton de récompense");
    actions["quest-claim"]({ dataset: { k: done.key, l: "en" } }); actions["quest-claim"]({ dataset: { k: done.key, l: "en" } });
    ok(L.xp === xp0 + QUEST_XP && L.quests[done.key] === true, "XP gagnée une seule fois");
    ok(flatten(state).kv[`langs.en.quests.${done.key}`] === true, "récompense synchronisée");
  }
}
{ // Hors ligne : le dernier compte est mémorisé, puis oublié à la déconnexion
  rememberAccount({ user: { id: 9 }, features: {} });
  ok(JSON.parse(localStorage.getItem(LAST_ACCOUNT)).user.id === 9, "compte mémorisé");
  const a = account; account = { id: 9 }; signOutLocal(); ok(localStorage.getItem(LAST_ACCOUNT) === null, "oublié à la déconnexion"); account = a;
}
{ // Admin : toutes les leçons ouvertes, tableau de bord
  const a = account, K = state.langs.ko, hd = K.hangulDone, days = K.hangulDays, gd = K.grammarDone;
  K.hangulDone = false; K.hangulDays = {}; K.grammarDone = {};
  account = { id: 1, email: "a@b.fr", created_at: new Date().toISOString(), email_verified: true, is_admin: false };
  ok(hangulGate("ko") && viewHangul(3).includes("Un jour à la fois") && viewGrammar(KO_GRAMMAR[2].id).includes("Un point à la fois") && viewAdmin().includes("Introuvable") === viewNotFound().includes("Introuvable"), "non-admin : verrous");
  account.is_admin = true;
  ok(!hangulGate("ko") && !viewHangul(3).includes("Un jour à la fois") && !viewGrammar(KO_GRAMMAR[2].id).includes("Un point à la fois"), "admin : leçons ouvertes");
  ok(!tabPath("ko").includes("🔒</span>") && !tabPath("ko").includes('data-act="locked"'), "admin : parcours sans cadenas");
  ui.admin = { d: { users: { total: 3, verified: 1, admins: 1, new7: 1, new30: 2, active7: 2 }, sessions: 2, cards: [{ lang: "ko", n: 5 }], reviews: { total: 9 }, llm: { engine: "Ollama", today: 1, total: 4, daily: 30, globalDaily: 500, cacheHits: 3, hitRate: 0.75, cost: 0.0425, cacheSize: 7 }, tts: { voices: { en: ["af_heart"] }, files: 3, bytes: 2e6 }, mail: "console", list: [{ email: "x@y.fr", name: "X", created_at: "2026-11-01", cards: 5, reviews: 9, verified: 0, admin: 1 }] } };
  const v = viewAdmin();
  ok(v.includes("Tableau de bord") && v.includes("Points de grammaire") && v.includes("x@y.fr") && v.includes("2,0 Mo") && v.includes(`#/lang/ko/grammaire/${KO_GRAMMAR[0].id}`), "tableau de bord");
  ok(v.includes("1 / 500") && v.includes("(75 %)") && /0,04\s?\$/.test(v), "admin : appels IA, taux de cache, coût du jour");
  ok(viewProfile().includes("#/admin"), "lien admin dans le profil");
  ui.admin = null; account = a; K.hangulDone = hd; K.hangulDays = days; K.grammarDone = gd;
}
{ // Thèmes de situation et saveurs
  for (const lang of ["en", "ko"]) {
    const W = themeWords(lang);
    for (const th of THEMES) ok(W[th.id].length >= 8, `${lang}: thème ${th.id} trop pauvre (${W[th.id].length} mots)`);
    ok(!Object.values(W).flat().some((l) => KO_PARTICLES.has(l)), `${lang}: pas de particule dans les thèmes`);
    for (const t of TEXTS[lang]) for (const x of t.themes || []) ok(THEMES.some((th) => th.id === x), `${lang}: thème inconnu ${x}`);
  }
  ok(!themeWords("en").cafe.includes("the") && !themeWords("en").cafe.includes("be"), "le socle n'appartient à aucun thème");
  ok(themeWords("ko").transports.includes("정거장") && themeWords("en").cuisine.includes("garlic"), "mots de scène");
  // Saveur débloquée à 10 mots solides
  const L = state.langs.ko, saved = { ...L.known }, w = themeWords("ko").sport;
  ok(!themeProgress("ko").find((p) => p.id === "sport").unlocked || w.filter((l) => L.known[l]).length >= 10, "saveur verrouillée au départ");
  w.slice(0, 10).forEach((l) => (L.known[l] = true));
  const sp = themeProgress("ko").find((p) => p.id === "sport");
  ok(sp.unlocked && sp.solid >= 10 && tabThemes("ko").includes("Saveur Yuzu débloquée"), "saveur débloquée");
  L.known = saved;
  // Favoris : bascule + bibliothèque
  const favs0 = [...state.settings.themes];
  actions["theme-fav"]({ dataset: { t: "gaming" } }); ok(state.settings.themes.includes("gaming"), "favori ajouté");
  ok(tabLibrary("en").includes("Tes thèmes ⭐"), "bibliothèque : favoris signalés");
  actions["lib-theme"]({ dataset: { t: "gaming" } }); ok(tabLibrary("en").includes("Une partie en ligne") && !tabLibrary("en").includes("Au café</h3>") , "filtre par thème");
  actions["lib-theme"]({ dataset: { t: "" } }); actions["theme-fav"]({ dataset: { t: "gaming" } });
  ok(state.settings.themes.join() === favs0.join(), "favori retiré");
  ok(flatten(state).kv["settings.themes"] !== undefined, "favoris synchronisés");
}
{ // Bibliothèque de lectures graduées
  for (const lang of ["en", "ko"]) for (const b of BOOKS[lang]) {
    ok(b.chapters.length >= 3 && b.chapters.every((ch) => ch.questions.length >= 2 && ch.questions.every((q) => q.options.length >= 2)), `${lang}: livre ${b.id} complet`);
    for (const ch of b.chapters) for (const [src] of ch.sentences) for (const w of parseSentence(src, lang)) for (const g of w.segs) for (const l of g.lemmas) ok(LEXICON[lang][l], `${lang}: lemme manquant « ${l} » dans « ${src} » (${b.id})`);
    for (const ch of b.chapters) ok(textById(lang, ch.id)?.book === b.id, `${lang}: chapitre ${ch.id} lisible dans le lecteur`);
  }
  const lang = "en", b = BOOKS.en[0], L = state.langs.en, acc = account;
  account = null; L.books = {};
  ok(tabLibrary("en").includes("Livres gradués") && tabLibrary("en").includes(`#/lang/en/livre/${b.id}`), "livres dans l'onglet Lire");
  ok(viewBook("en", b.id).includes("🔒") && chapterOpen("en", b, 0) && !chapterOpen("en", b, 1), "chapitres dans l'ordre");
  ok(viewReader("en", b.chapters[0].id).includes(`#/lang/en/livre/${b.id}`), "retour du lecteur vers le livre");
  // Lecture du chapitre 1 → questions → chapitre 2 ouvert
  location.hash = `#/lang/en/lire/${b.chapters[0].id}`; route();
  actions["finish-read"]();
  ok(location.hash === `#/lang/en/livre/${b.id}/quiz/1`, "après la lecture : les questions " + location.hash);
  route();
  let guard = 0;
  while (ui.quiz.queue.length && guard++ < 20) { const q = ui.quiz.qs[ui.quiz.queue[0]]; answerQuiz(true, q.answer); nextQuiz(); }
  viewBook("en", b.id, "quiz", "1"); // écran de fin : enregistre le score
  ok(L.books[`${b.id}:1`] === b.chapters[0].questions.length && chapterOpen("en", b, 1), "score enregistré, chapitre 2 ouvert");
  ok(flatten(state).kv[`langs.en.books.${b.id}:1`] !== undefined, "progression synchronisée");
  const before = state.cards.length;
  actions["book-capture"]({ dataset: { id: b.chapters[0].id } });
  ok(state.cards.length > before, "mots inconnus du chapitre en cartes");
  account = { id: 1, is_admin: true }; ok(chapterOpen("en", b, 2), "admin : tout ouvert"); account = acc;
  location.hash = ""; ui.quiz = null;
}
{ // Mode histoire
  for (const lang of ["en", "ko"]) for (const b of STORIES[lang]) for (const ch of b.chapters) {
    for (const [src] of ch.sentences) for (const w of parseSentence(src, lang)) for (const g of w.segs) for (const l of g.lemmas) ok(LEXICON[lang][l], `${lang}: lemme manquant « ${l} » dans « ${src} » (histoire)`);
    ok(MISSIONS[ch.mission]?.lang === lang && MISSIONS[ch.mission].script.every((s) => s.choices.some((c) => c[1])), `${lang}: mission ${ch.mission} jouable`);
    for (const k of ch.keywords) ok(ch.sentences.some(([src]) => parseSentence(src, lang).some((w) => w.segs.some((g) => g.lemmas.includes(k)))), `${lang}: mot clé ${k} absent du chapitre`);
    if (ch.grammar) ok(KO_GRAMMAR.some((g) => g.id === ch.grammar), `grammaire inconnue ${ch.grammar}`);
  }
  ok(TABS.en.some(([k]) => k === "histoire") && TABS.ko.some(([k]) => k === "histoire"), "onglet Histoire");
  const acc = account, feat = features; account = null;
  const lang = "ko", b = STORIES.ko[0], L = state.langs.ko, gd = { ...L.grammarDone }, hd = L.hangulDone;
  L.hangulDone = true; L.grammarDone = {}; L.books = {};
  ok(/grammaire/.test(chapterLock(lang, b, 0)), "chapitre 1 : grammaire requise");
  L.grammarDone.haeyo = true; ok(chapterOpen(lang, b, 0) && tabStory("ko").includes("공항"), "chapitre 1 ouvert après -요");
  // Questions faites → mission guidée
  L.books[`${b.id}:1`] = 2;
  location.hash = `#/lang/ko/livre/${b.id}/mission/1`; route();
  ok(ui.mission.mode === "guided" && viewMission(lang, b, 0).includes("Choisis ta réplique"), "sans IA : mode guidé");
  const M = MISSIONS[b.chapters[0].mission];
  actions["mission-pick"]({ dataset: { x: String(M.script[0].choices.findIndex((c) => !c[1])) } });
  ok(ui.mission.wrong !== null && ui.mission.step === 0, "mauvaise réplique : explication, on reste");
  for (const step of M.script) actions["mission-pick"]({ dataset: { x: String(step.choices.findIndex((c) => c[1])) } });
  ok(ui.mission.done && L.books[`${b.id}:1:mission`] === true && chapterDone(lang, b, 0), "mission réussie");
  ok(/mots clés/.test(chapterLock(lang, b, 1)), "chapitre 2 : mots clés requis");
  actions["book-keywords"]({ dataset: { id: b.chapters[0].id } });
  ok(!keywordsMissing(lang, b.chapters[0]).length, "mots clés en révision");
  ok(/grammaire/.test(chapterLock(lang, b, 1)), "chapitre 2 : 은/는 requis");
  L.grammarDone["eun-neun"] = true; ok(chapterOpen(lang, b, 1), "chapitre 2 ouvert");
  // Mode IA : réponse simulée de l'API
  account = { id: 1 }; features = { ...feat, llm: true }; ui.mission = null;
  L.books[`${b.id}:2`] = 2;
  location.hash = `#/lang/ko/livre/${b.id}/mission/2`; route();
  ok(ui.mission.mode === "ai", "connecté + IA : mode libre");
  const realApi = api; let sent;
  api = async (m, u, body) => { sent = body; return { turn: { reply: "반가워요!", reply_fr: "Enchantée !", recast: "저는 모찌예요.", note_fr: "Après 모찌 (voyelle), on dit 예요.", hint_fr: "", goal_reached: true } }; };
  missionSend("저는 모찌이에요.").then(() => {
    ok(sent.mission === "ko-neighbor" && sent.history.at(-1).who === "me", "historique envoyé");
    ok(ui.mission.log.at(-2).recast === "저는 모찌예요." && ui.mission.done && L.books[`${b.id}:2:mission`], "recast affiché, mission réussie par l'IA");
    api = realApi; account = acc; features = feat; L.grammarDone = gd; L.hangulDone = hd; location.hash = ""; ui.mission = null;
  });
}
{ // Clavier coréen : composition des syllabes (두벌식)
  const type = (keys) => { let t = "", joinable = true; for (const j of keys) t = hangulAdd(t, j, joinable); return t; };
  ok(type([..."ㅎㅏㄴㄱㅜㄱㅇㅓ"]) === "한국어", "한국어 : " + type([..."ㅎㅏㄴㄱㅜㄱㅇㅓ"]));
  ok(type([..."ㅇㅏㄴㄴㅕㅇㅎㅏㅅㅔㅇㅛ"]) === "안녕하세요", "안녕하세요");
  ok(type([..."ㄱㅗㅏ"]) === "과" && type([..."ㅇㅜㅓ"]) === "워" && type([..."ㅇㅡㅣ"]) === "의", "voyelles composées");
  ok(type([..."ㅇㅓㅂㅅ"]) === "없" && type([..."ㅇㅓㅂㅅㅇㅓ"]) === "없어", "finale double ㅄ, puis 없어");
  ok(type([..."ㄷㅏㄹㄱ"]) === "닭" && type([..."ㄷㅏㄹㄱㅇㅣ"]) === "닭이" && type([..."ㅇㅣㄹㄱㅓ"]) === "일거", "ㄺ et passage de la finale");
  ok(type([..."ㄲㅏㅆㄷㅏ"]) === "깠다" && type([..."ㅃㅏ"]) === "빠", "consonnes doubles");
  ok(type([..."ㅏ"]) === "ㅏ" && type([..."ㄱ"]) === "ㄱ" && type([..."ㄸㄸ"]) === "ㄸㄸ", "lettres seules, ㄸ jamais en finale");
  ok(hangulBack("한") === "하" && hangulBack("하") === "ㅎ" && hangulBack("ㅎ") === "" && hangulBack("없") === "업" && hangulBack("과") === "고", "retour arrière syllabe par syllabe");
  ok(hangulAdd("가", "ㄴ", false) === "가ㄴ", "pas de recollage hors frappe continue");
  ok(Object.keys(KO_KEYMAP).length === 26 && KO_KEYMAP.KeyR[0] === "ㄱ" && KO_KEYMAP.KeyR[1] === "ㄲ" && KO_KEYMAP.KeyK[0] === "ㅏ", "disposition 두벌식");
  ok(kbdPanel("x").includes('data-j="ㅂ"') && kbdPanel("x").split('class="kkey').length > 28, "clavier à l'écran");
}
{ // Apprendre à former les syllabes
  ok(HANGUL_DAYS.length === 10 && HANGUL_DAYS[9].kind === "buildFinal", "10 jours de Hangul");
  ok(composeHangul("ㅎ", "ㅏ", "ㄴ") === "한" && composeHangul("ㄴ", "ㅏ") === "나" && decomposeHangul("밥").join() === "ㅂ,ㅏ,ㅂ", "composition avec 받침");
  // Jour 9 : jamais ㅐ contre ㅔ à l'oreille
  for (let i = 0; i < 20; i++) for (const q of hangulQuestions(9)) if (q.ask === "Quelle lettre entends-tu ?" && ["ㅐ", "ㅔ"].includes(q.answer)) ok(!(q.options.includes("ㅐ") && q.options.includes("ㅔ")), "ㅐ/ㅔ homophones séparés");
  // Jour 10 : construction avec finale + écriture
  const qs = hangulQuestions(10), b = qs.find((q) => q.build && q.target === "옷");
  ok(b && b.finals.includes("ㅅ") && b.target_f === "ㅅ", "construction avec 받침");
  ok(qs.filter((q) => q.type).length === 5, "questions d'écriture");
  startQuiz("t-h", [b], () => {}); ui.quiz.build = { l: "ㅇ", v: "ㅗ", f: "ㅅ" };
  actions["build-check"](); ok(ui.quiz.answer.ok, "옷 construit");
  startQuiz("t-h2", [qs.find((q) => q.type)], () => {});
  ok(viewQuiz("#", "x").includes('id="quiz-type"') && viewQuiz("#", "x").includes("input answer ko"), "champ d'écriture coréen (clavier disponible)");
  // Atelier
  ui.atelier = { l: "ㅇ", v: "ㅗ", f: "ㅅ" };
  const v = viewAtelier();
  ok(v.includes(">옷<") && v.includes("≈ « ôt »") && v.includes("se prononce [t]") && v.includes("au-dessus"), "atelier : 옷, son final, voyelle horizontale");
  ui.atelier = { l: "ㄱ", v: "ㅘ", f: "" }; ok(viewAtelier().includes(">과<") && viewAtelier().includes("bd-v2"), "atelier : voyelle composée");
  ok(decomposeView("한국").split("atl-piece").length === 3 && decomposeView("한국").includes("≈ gouk"), "décomposition d'un mot");
  ok(tabPath("ko").includes("#/lang/ko/atelier"), "lien vers l'atelier dans le Parcours");
  ui.quiz = null; ui.atelier = null;
}
{ // Accessoires de Mochi
  const acc = account; account = null;
  const L = state.langs.en, q0 = { ...L.quests }, look0 = state.settings.look, seen0 = state.settings.lookSeen;
  state.settings.look = {}; state.settings.lookSeen = [];
  L.quests = {}; state.langs.ko.quests = {};
  const beanie = accessoryById("beanie"), scarf = accessoryById("scarf");
  ok(!accUnlocked(beanie), "bonnet verrouillé sans quête");
  actions["acc-wear"]({ dataset: { id: "beanie" } }); ok(!state.settings.look.head, "accessoire verrouillé : impossible à porter");
  L.quests["2026-11-16:read"] = true;
  ok(accUnlocked(beanie) && !accUnlocked(scarf), "1 quête → bonnet, pas encore l'écharpe");
  let toasted = ""; const t0 = toast; toast = (m) => (toasted = m);
  checkNewAccessories(); ok(/Bonnet|nouveaux accessoires/.test(toasted) && state.settings.lookSeen.includes("beanie"), "nouvel accessoire annoncé : " + toasted);
  toasted = ""; checkNewAccessories(); ok(toasted === "", "annoncé une seule fois");
  toast = t0;
  actions["acc-wear"]({ dataset: { id: "beanie" } });
  ok(state.settings.look.head === "beanie" && mochi("", "happy").includes("acc-beanie"), "bonnet porté partout");
  ok(!mochi("", "happy", false).includes("acc-beanie"), "pas sur les Mochis de collection");
  ok(mochi("", "sleepy").includes("translate(0 15)"), "le chapeau suit la forme (endormie)");
  // Un seul accessoire par emplacement
  L.quests["2026-11-16:prod"] = true; L.quests["2026-11-16:ear"] = true; L.quests["2026-11-23:read"] = true; L.quests["2026-11-23:rev"] = true; L.quests["2026-11-23:min"] = true;
  actions["acc-wear"]({ dataset: { id: "cap" } });
  ok(state.settings.look.head === "cap" && !mochi("", "happy").includes("acc-beanie"), "la casquette remplace le bonnet");
  actions["acc-wear"]({ dataset: { id: "scarf" } }); ok(state.settings.look.neck === "scarf" && state.settings.look.head === "cap", "tête + cou ensemble");
  actions["acc-wear"]({ dataset: { id: "scarf" } }); ok(!state.settings.look.neck, "retirer un accessoire");
  ok(lookCard().includes("Ma Mochi") && lookCard().includes("🔒") && viewProfile().includes("Ma Mochi"), "profil : Ma Mochi");
  ok(flatten(state).kv["settings.look"]?.head === "cap", "tenue synchronisée");
  account = { id: 1, is_admin: true }; ok(ACCESSORIES.every((a) => accUnlocked(a)), "admin : tout débloqué"); account = acc;
  L.quests = q0; state.settings.look = look0; state.settings.lookSeen = seen0;
}
{ // Navigation d'une langue : une seule navigation principale (menu du haut / barre du bas) + sous-menus
  const v = viewLanguage("en", "revisions");
  ok(!v.includes("section-nav") && !v.includes('class="sec ') && !v.includes('class="tabs"'), "pas de 2e barre de sections dans la page");
  ok(v.includes("← S'entraîner") && v.includes("🧠 Réviser"), "fil d'Ariane dans un outil");
  ok(viewLanguage("en", "themes").includes("Bibliothèque") && viewLanguage("en", "themes").includes('class="sub-nav"'), "sous-menu de Lire");
  const hub = viewLanguage("ko", "pratique");
  ok(hub.includes("Parcours") && hub.includes("Écouter les sons") && hub.includes("Mes mots") && !hub.includes("Faux amis"), "S'entraîner (coréen) : outils en cartes");
  ok(viewLanguage("en", "pratique").includes("Faux amis"), "faux amis seulement en anglais");
  ok(sectionOf("aujourdhui") === "today" && sectionOf("histoire") === "read" && sectionOf("oreille") === "practice" && navOfTab("lire") === "lire", "sections et barre du bas");
}
{ // Nouveaux exercices : détails
  state.langs.ko.hangulDone = true;
  // Phrase à trou : pas de mot-outil, le trou est rendu
  for (let i = 0; i < 30; i++) { newExercise("en", "trou"); ok(!["the", "a", "be", "i", "you"].includes(ui.ex.q.g.lemmas[0]), "trou : pas de mot-outil " + ui.ex.q.g.lemmas[0]); }
  ok(blankHtml(toSentence("I like coffee.", "en"), 2, 0).includes("＿＿") && blankHtml(toSentence("I like coffee.", "en"), 2, 0, "coffee", "right").includes('class="blank right">coffee'), "rendu du trou");
  // La bonne forme : toujours une forme fléchie différente du mot de base
  for (let i = 0; i < 20; i++) { newExercise("ko", "forme"); const q = ui.ex.q; ok(q.answer !== q.g.lemmas[0] && q.g.lemmas[0].endsWith("다"), "forme ko : verbe conjugué"); }
  // Particule : la paire (은/는…) est toujours proposée, explication de la règle
  for (let i = 0; i < 20; i++) { newExercise("ko", "particule"); const q = ui.ex.q; if (PARTICLE_PAIR[q.answer]) ok(q.options.includes(PARTICLE_PAIR[q.answer]), "particule : paire proposée"); }
  newExercise("ko", "particule"); const pq = ui.ex.q, wrong = pq.options.find((o) => o !== pq.answer), gid = PARTICLE_GRAMMAR[pq.answer];
  const before = gid ? state.langs.ko.grammarMiss[gid] || 0 : 0;
  actions["ex-pick"]({ dataset: { o: wrong } });
  ok(tabExercises("ko").includes("particule de") || tabExercises("ko").includes("particule"), "explication de la particule");
  if (gid) ok(state.langs.ko.grammarMiss[gid] === before + 1, "particule ratée → grammaire renforcée");
  // Ne pas confondre : s'ouvre quand les deux mots d'une paire sont connus
  const L = state.langs.en, k0 = { ...L.known };
  L.known.early = true; L.known.late = true;
  ok(EX_MORE.confusion.ready("en"), "paire early/late connue → exercice ouvert");
  newExercise("en", "confusion"); ok(!ui.ex.q.empty && ui.ex.q.options.includes("early") || ui.ex.q.options.length === 2, "confusion : deux options");
  L.known = k0;
  // Traduction hors IA : comparaison locale, reformulation affichée
  const accT = account; account = null; // sans IA : correction locale
  newExercise("en", "traduction"); const tq = ui.ex.q;
  document.getElementById = (id) => (id === "ex-answer" ? { value: "something else entirely" } : { value: "", innerHTML: "", classList: { add() {}, remove() {}, toggle() {} }, focus() {} });
  actions["ex-check"](); ok(ui.ex.result.local && !ui.ex.result.ok && tabExercises("en").includes("traduction possible"), "traduction : correction locale"); account = accT;
  // Menu groupé
  ok(tabExercises("ko").includes("✍️ Écrit") && tabExercises("ko").includes("Changer d'exercice"), "menu regroupé");
}
{ // Visite guidée interactive
  const s0 = state.settings.tourDone, cards0 = state.cards, started = Object.fromEntries(Object.entries(state.langs).map(([k, L]) => [k, L.started]));
  const hd = state.langs.ko.hangulDone, acc = account; account = null;
  state.cards = []; Object.values(state.langs).forEach((L) => (L.started = false)); state.settings.tourDone = false;
  ok(tourShouldShow(), "nouveau venu : visite proposée");
  location.hash = "#/"; openTour();
  ok(ui.tour.i === 0 && TOUR[0].center, "étape 1 : bienvenue");
  tourNext(); ok(TOUR[ui.tour.i].target === ".lang-grid" && !TOUR[ui.tour.i].doneWhen(), "étape 2 : choisir sa langue (action attendue)");
  // Coréen sans Hangul : l'alphabet au lieu de la lecture
  state.langs.ko.hangulDone = false; location.hash = "#/lang/ko/aujourdhui";
  ok(TOUR[ui.tour.i].doneWhen(), "langue choisie → étape validée");
  tourNext(); ok(TOUR[ui.tour.i].target === ".topnav, .bottomnav", "étape 3 : les 3 sections");
  tourNext(); ok(/hangul/.test(TOUR[ui.tour.i].target), "coréen sans Hangul : on montre l'alphabet");
  location.hash = "#/lang/ko/hangul/1"; tourNext(); ok(TOUR[ui.tour.i].title === "Touche une lettre", "leçon de Hangul");
  tourNext(); ok(/reviser/.test(TOUR[ui.tour.i].target), "la lecture est sautée tant que le Hangul n'est pas fait");
  // Anglais, débutant complet : les premiers mots (pas de texte illisible)
  location.hash = "#/lang/en/aujourdhui"; ui.tour.i = 0; tourGo(5);
  ok(TOUR[ui.tour.i].target.includes("learn-first") && !TOUR[ui.tour.i].doneWhen, "anglais débutant : premiers mots ou test");
  // Anglais avec des bases : le parcours lecture est proposé
  const known0 = state.langs.en.known; state.langs.en.known = Object.fromEntries(Object.keys(LEXICON.en).map((l) => [l, true]));
  ui.tour.i = 0; tourGo(5);
  ok(TOUR[ui.tour.i].target.includes("/lire/") && TOUR[ui.tour.i].doneWhen && !TOUR[ui.tour.i].doneWhen(), "anglais : ouvrir un texte (action attendue)");
  location.hash = "#/lang/en/lire/en-cafe"; ok(TOUR[ui.tour.i].doneWhen(), "texte ouvert → étape validée");
  state.langs.en.known = known0;
  closeTour(true);
  ok(state.settings.tourDone && !tourShouldShow() && ui.tour === null, "visite terminée : plus proposée");
  ok(flatten(state).kv["settings.tourDone"] === true, "synchronisée");
  ok(viewHome().includes('data-tour="open"') && viewProfile().includes("Revoir la visite"), "on peut la revoir");
  state.langs.ko.hangulDone = hd; account = acc; location.hash = "";
  state.settings.tourDone = s0; state.cards = cards0; Object.entries(started).forEach(([k, v]) => (state.langs[k].started = v));
}
{ // Repères pour francophones + l'alphabet d'abord
  const rom = Object.fromEntries(HANGUL_DAYS.filter((d) => d.kind === "jamo").flatMap((d) => d.items.map(([c, r]) => [c, r])));
  ok(rom["ㅜ"] === "ou" && /ô/.test(rom["ㅗ"]) && /ouvert/.test(rom["ㅓ"]) && /eu/.test(rom["ㅡ"]), "voyelles : repères francophones (ㅜ = ou, pas « u »)");
  ok(/souffl/.test(rom["ㅋ"]) && /tendu/.test(rom["ㄲ"]), "consonnes : soufflée / tendue");
  ok(sylRom("ㅅ", "ㅜ", "") === "sou" && sylRom("ㄱ", "ㅓ", "") === "go" && sylRom("ㅋ", "ㅓ", "") === "kho", "atelier : 수 = sou, 커 = kho");
  const hd = state.langs.ko.hangulDone, acc = account; account = null; state.langs.ko.hangulDone = false;
  for (const tab of ["histoire", "themes", "oreille", "lire", "revisions", "exercices"]) ok(viewLanguage("ko", tab).includes("D'abord, le Hangul"), `coréen : ${tab} attend le Hangul`);
  ok(!viewLanguage("ko", "parcours").includes("D'abord, le Hangul") && !viewLanguage("en", "histoire").includes("D'abord, le Hangul"), "le parcours (et l'anglais) restent ouverts");
  ok(viewHangul(1).includes("Comment lire les repères"), "explication des repères");
  state.langs.ko.hangulDone = hd; account = acc;
}
{ // Langues en préparation : montrées, pas accessibles
  const h = viewHome();
  for (const n of ["Chinois", "Français", "Japonais", "Italien"]) ok(h.includes(`data-name="${n}"`) && h.includes(`${n} : bientôt disponible`), `${n} affiché, verrouillé`);
  ok(!h.includes('href="#/lang/zh') && !LANGUAGES.zh && !LANGUAGES.ja, "aucun lien, pas une vraie langue");
  let msg = ""; const t0 = toast; toast = (m) => (msg = m);
  actions["lang-soon"]({ dataset: { name: "Japonais" } }); ok(/Japonais.*préparation/.test(msg), "clic : message « bientôt »");
  toast = t0;
  location.hash = "#/lang/ja"; route(); ok(!location.hash.startsWith("#/lang/ja/") , "URL directe : pas de page");
  location.hash = "";
}
{ // Mes mots en révision : liste, statuts, tri, pause, langues
  const cards0 = state.cards; state.cards = [];
  const s = toSentence("I like coffee with milk.", "en");
  captureSeg("en", s, 2, 0, "test"); captureSeg("en", s, 4, 0, "test");
  const ko = toSentence("저|는 커피|를 좋아해요=좋아하다.", "ko"); captureSeg("ko", ko, 1, 0, "test");
  const v = tabReviews("en");
  ok(v.includes("Mes mots en révision") && v.includes("<mark>coffee</mark>") && v.includes("<mark>milk</mark>"), "mots capturés visibles avec leur phrase");
  ok(v.includes("🇬🇧 Anglais (2)") && v.includes("🇰🇷 Coréen (1)") && v.includes('href="#/lang/ko/revisions"'), "tri par langue");
  ok(!v.includes("커피") && tabReviews("ko").includes("커피"), "chaque langue montre ses mots");
  ok(/Nouveau/.test(v), "statut : nouveau");
  // Pause : retiré des révisions, réversible
  const before = reviewCount("en");
  location.hash = "#/lang/en/revisions";
  actions["card-pause"]({ dataset: { l: "coffee" } });
  ok(state.cards.filter((c) => c.lemma === "coffee").every((c) => c.paused) && ![...newCards("en"), ...dueCards("en")].some((c) => c.lemma === "coffee"), "retiré des révisions");
  ok(tabReviews("en").includes("En pause") && tabReviews("en").includes("Remettre en révision"), "statut : en pause");
  actions["card-pause"]({ dataset: { l: "coffee" } }); ok(state.cards.every((c) => !c.paused), "remis en révision");
  // Statut après une révision : prochaine date
  const c = state.cards.find((x) => x.lemma === "milk"); rateCard(c.id, 3);
  ok(/Dans \d+|Solide/.test(tabReviews("en")), "statut : prochaine révision");
  ui.cardSort = "az"; const h = tabReviews("en"); ok(h.indexOf("coffee") < h.indexOf("milk"), "tri A → Z"); ui.cardSort = null;
  ok(tabWords("en").includes("Voir mes mots en révision"), "lien depuis Mes mots");
  state.cards = cards0; location.hash = "";
}
{ // Textes légaux, consentement, cookies
  for (const p of ["mentions", "cgu", "confidentialite", "cookies", "credits"]) { location.hash = `#/legal/${p}`; ok(viewLegal(p).includes(LEGAL_PAGES[p]) && viewLegal(p).includes("Dernière mise à jour"), `page ${p}`); }
  ok(legalCredits().includes("국립국어원") && legalCredits().includes("wordfreq") && legalCredits().includes("Kiwi"), "crédits : sources des listes et de l'analyseur");
  ok(viewLegal("confidentialite").includes("mark class=\"todo\"") && viewLegal("mentions").includes("à compléter"), "champs à compléter signalés");
  const f0 = features;
  features = { llm: true, engine: "Claude", tts: {}, mail: "console" };
  ok(/Anthropic/.test(legalPrivacy()) && !/Resend/.test(legalPrivacy().replace("aucun service d'envoi", "")) && /Transferts hors/.test(legalPrivacy()), "confidentialité : Claude actif → Anthropic + transfert");
  features = { llm: true, engine: "Ollama (qwen)", tts: { en: ["a"] }, mail: "resend" };
  ok(!/Anthropic/.test(legalPrivacy()) && /sur le serveur de Mochi/.test(legalPrivacy()) && /Resend/.test(legalPrivacy()), "confidentialité : Ollama local, Resend actif");
  features = f0;
  ok(legalCookies().includes("mochi_sid") && legalCookies().includes("aucune mesure d'audience") && legalCookies().includes("mochi-ko-kbd") && !legalCookies().includes("mochi-notice"), "cookies : inventaire");
  ok(legalFooter().includes("#/legal/confidentialite"), "pied de page");
  ok(legalFooter().includes("cookies nécessaires") && legalFooter().includes("#/legal/cookies") && !legalFooter().includes('class="btn'), "information cookies : une ligne dans le pied de page, sans bouton");
  serverOn = true; const acc = account; account = null;
  ok(viewAuth("inscription").includes('name="accept" required') && viewAuth("inscription").includes("#/legal/cgu") && !viewAuth("connexion").includes('name="accept"'), "inscription : case obligatoire");
  account = acc; location.hash = "";
}
// --- Parcours débutant (PEDAGOGIE §3) et coréen : le Hangul d'abord (charte §3) ---
{
  const saved = { ...state }; // mêmes objets restaurés à la fin (des tests asynchrones les gardent en référence)
  Object.assign(state, defaultState()); state.cards = []; state.logs = [];
  const best = rankedTexts("en")[0];
  ok(best.c < BEGINNER_COVERAGE, "état neuf : aucun texte à 80 % (" + Math.round(best.c * 100) + " %)");
  let h = tabToday("en");
  ok(!h.includes(`/lire/${best.t.id}"`) && h.includes("test de niveau") && h.includes('data-act="learn-first"'), "neuf en anglais : pas de texte < 80 % à l'étape 1, test ou premiers mots");
  ok(!h.includes("Tu as déjà des bases"), "pas de double proposition du test");
  actions["learn-first"]({ dataset: { l: "en" } });
  ok(state.cards.filter((c) => c.lang === "en").length >= 5 && session("en").firstWords, "premiers mots ajoutés, étape 1 validée");
  h = tabToday("en");
  ok(/step done[\s\S]*Apprendre mes 10 premiers mots/.test(h) || h.includes("Tes premiers mots sont dans tes révisions"), "étape 1 cochée");
  for (const l of Object.keys(LEXICON.en)) state.langs.en.known[l] = true;
  ok(tabToday("en").includes(`/lire/${rankedTexts("en")[0].t.id}"`), "dès qu'un texte dépasse 80 % : retour à la lecture");
  // Coréen, Hangul pas commencé : « Commencer le jour 1 » est le seul bouton plein, en premier
  Object.assign(state, defaultState()); state.cards = [];
  h = tabToday("ko");
  const primaries = h.match(/class="btn"[^>]*>[^<]*/g) || [];
  ok(primaries.length === 1 && primaries[0].includes("Commencer le jour 1") && h.indexOf("Phase 1") < h.indexOf("Faire le test"), "coréen : le Hangul est l'action principale " + JSON.stringify(primaries));
  state.langs.ko.hangulDays = { 1: true, 2: true };
  ok(tabToday("ko").includes("Continuer : jour 3"), "coréen : continuer au jour suivant");
  for (const k of Object.keys(state)) if (!(k in saved)) delete state[k];
  Object.assign(state, saved);
  location.hash = "";
}
{ // « Donner mon avis »
  ui.avis = null; ui.avisFrom = "#/lang/ko/lire";
  const v = viewFeedback();
  ok(v.includes('form class="card avis-form" data-avis="1" data-lang="ko"') && (v.match(/data-act="avis-kind"/g) || []).length === 4 && (v.match(/data-act="avis-star"/g) || []).length === 5 && v.includes("#/lang/ko/lire"), "avis : formulaire (types, étoiles, page jointe)");
  actions["avis-star"]({ dataset: { n: "4" } }); ok(ui.avis.rating === 4 && viewFeedback().includes('aria-pressed="true"'), "avis : note");
  ui.avis.sent = true; ok(viewFeedback().includes("Merci, c'est envoyé"), "avis : remerciement");
  ok(legalFooter().includes("#/avis"), "avis : lien dans le pied de page");
  ok(!/ style="/.test(viewFeedback()), "avis : aucun style inline");
  ui.avis = null; ui.avisFrom = null;
}
{ // Admin › Contenu (CONTENU-PIPELINE, lots C6 et C8) : rendu de la file, d'un brouillon, de la couverture
  const a = account; account = { id: 1, email: "a@b.co", is_admin: true, created_at: new Date().toISOString() };
  const draft = { id: "ko-a1-01-1", lang: "ko", level: "A1", unit: "ko-A1-01", title: "Au café", icon: "☕", kind: "Dialogue", status: "draft",
    sentences: [["커피|를 마셔요=마시다.", "Je bois un café."]], speakers: ["민지"], checks: { status: "red", blocking: ["Couverture : 80 %"], warnings: [], stats: { coverage: 80, newWords: ["커피"] } },
    review_notes: [{ id: "n1", sentence: 1, type: "naturel", issue_fr: "Un peu sec", suggestion: "커피를 마시고 있어요.", suggestion_fr: "Je bois un café.", status: "open" }], lexicon_new: { "마시다": { fr: "boire", todo_review: true } } };
  ui.ca = { queue: { d: { drafts: [{ id: draft.id, lang: "ko", unit: "ko-A1-01", title: "Au café", icon: "☕", kind: "Dialogue", status: "red", blocking: 1, warnings: 0, coverage: 80, notes: 1, lexiconTodo: 1, sentences: 1 }] } },
    [`d:${draft.id}`]: { d: { draft, unit: { unit: "ko-A1-01", new_words: ["커피", "마시다"], grammar: [] }, grammar: [] } },
    cov: { d: { coverage: { ko: { texts: 10, drafts: 1, byLevel: { A1: 10 }, byTheme: { cafe: { total: 1, A1: 1 } }, top1000: { total: 1000, covered: 100 }, top2000: { total: 2000, covered: 150 }, grammar: [{ id: "eseo", label: "에서", phase: 2, texts: 0 }], holes: { themesWithoutA1: [], grammarUnder3: ["에서"], missingFrequent: ["것"] }, goals: [{ step: 2, label: "30 textes A1-A2", done: 10, target: 30 }], units: { total: 10, written: 0 } } } } } };
  const q = viewAdminContent(), v = viewAdminContent(draft.id), c = viewAdminContent("couverture");
  ok(q.includes("#/admin/contenu/ko-a1-01-1") && q.includes("🔴"), "admin contenu : file de relecture");
  ok(v.includes('class="w nw') && v.includes("pt pt-") && v.includes('data-act="ca-note"') && v.includes('data-act="say"') && /data-act="ca-publish" disabled/.test(v), "admin contenu : mots nouveaux surlignés, particules, remarques, écoute, publication bloquée");
  ok(c.includes("30 textes A1-A2") && c.includes("에서"), "admin contenu : couverture");
  account = { id: 2 }; ok(!viewAdminContent().includes("File de relecture"), "admin contenu : invisible aux non-admins");
  account = a; ui.ca = null;
}

console.log(fails ? `${fails} échec(s)` : "OK : parcours débutant");
// Nombres au format français
ok(num1(1.5) === "1,5" && num1(0) === "0,0" && num0(1234).replace(/\s/g, " ") === "1 234" && /^1\u202f234$/.test(num0(1234)), "nombres au format français : " + num0(1234));
// Avatar : Mochi par défaut, les emojis restent au choix
{
  ok(defaultState().avatar === "mochi" && displayAvatar().includes("avatar-mochi"), "avatar par défaut : Mochi (SVG)");
  const a0 = state.avatar; state.avatar = "🦊"; ok(displayAvatar().includes("🦊") && !displayAvatar().includes("<svg"), "emoji choisi"); state.avatar = a0;
}
// CSP sans 'unsafe-inline' : plus aucun attribut style="…" dans les vues
{
  const html = [viewHome(), viewLanguage("en", "aujourdhui"), viewLanguage("ko", "parcours"), viewLanguage("en", "themes"), viewLanguage("en", "lire"), viewProfile(), viewWhy()].join("");
  ok(!/ style="/.test(html), "aucun style inline dans les vues");
  ok(/data-bar-w="[0-9.]+"/.test(viewLanguage("ko", "parcours")), "barres de progression : data-bar-w");
}
