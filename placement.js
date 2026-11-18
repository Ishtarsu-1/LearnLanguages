// ============================================================
//  Mochi — test de niveau (ROADMAP P1). 5 minutes maximum, facultatif.
//  Anglais : estimation de la taille du vocabulaire par tranches de fréquence
//  (oui / non), avec des faux mots pour corriger les « je coche tout ».
//  Coréen : trois questions, puis de courts contrôles (lecture du Hangul par
//  des mots d'emprunt, sans romanisation ; quelques points de grammaire).
//  Le résultat se corrige à tout moment (« Je connais » / « Pas connu »).
// ============================================================

// Tranches de 1 000 mots (fréquences approximatives des grands corpus anglais)
const EN_BANDS = [
  ["would", "because", "enough", "country", "without", "believe"],
  ["weather", "borrow", "proud", "shout", "pocket", "bridge"],
  ["shelf", "rough", "folk", "gentle", "sweat", "swing"],
  ["steep", "bargain", "spill", "fist", "wipe", "tide"],
  ["brisk", "thrive", "sneeze", "hinder", "peel", "scold"],
  ["grumble", "wobble", "crumb", "drowsy", "nudge", "clumsy"],
  ["lurk", "squint", "muzzle", "flinch", "haggle", "plight"],
  ["gaunt", "quaint", "smirk", "brittle", "swagger", "dwindle"],
  ["wistful", "rummage", "gnarled", "jostle", "sullen", "teeter"],
  ["cajole", "furtive", "tawdry", "wheedle", "ornery", "dally"],
];
// Faux mots (n'existent pas) : un par écran
const EN_FAKE = ["blurk", "plinder", "trolmish", "dastle", "mabble", "fennick", "grantle", "pholdish", "snerve", "quobble"];
// Mots du lexique au-delà des 1 000 plus fréquents (les autres sont dans la 1re tranche)
const EN_LEX_BAND = { elevator: 3, nurse: 3, insist: 3, funny: 2, choose: 2, floor: 2, rest: 2, cinema: 3 };

// Mots d'emprunt : les lire suffit pour les comprendre (contrôle du Hangul)
const KO_LOANS = [["택시", "taxi"], ["바나나", "banane"], ["피자", "pizza"], ["컴퓨터", "ordinateur"], ["호텔", "hôtel"], ["버스", "bus"], ["아이스크림", "glace"], ["라디오", "radio"]];

TABS.en.push(["niveau", "🧭 Niveau"]);
TABS.ko.push(["niveau", "🧭 Niveau"]);
TAB_VIEWS.niveau = (lang) => tabPlacement(lang);

const placementPending = (lang) => {
  const L = state.langs[lang];
  return !L.placement && !state.cards.some((c) => c.lang === lang) && !Object.keys(L.known).length;
};
function placementOffer(lang) {
  if (!placementPending(lang)) return "";
  return `<div class="card offer">${mochi("small", "curious")}<div><h3>Tu as déjà des bases ?</h3>
    <p class="muted">Un petit test de niveau (5 minutes maximum) pour ne pas te faire réviser ce que tu sais déjà. C'est facultatif.</p>
    <div class="wp-actions"><a class="btn small" href="#/lang/${lang}/niveau">Faire le test</a><button class="btn ghost small" data-act="place-skip">Je débute, on y va</button></div></div></div>`;
}

function startPlacement(lang) {
  ui.place = isKo(lang)
    ? { lang, step: "questions", a: {} }
    : { lang, step: "words", band: 0, picks: {}, yes: [], fakes: shuffle(EN_FAKE), screen: null };
  if (!isKo(lang)) nextScreen();
}
function nextScreen() {
  const P = ui.place;
  P.screen = shuffle([...EN_BANDS[P.band].map((w) => ({ w, fake: false })), { w: P.fakes[P.band], fake: true }]);
  P.picks = {};
}

// Estimation : pour chaque tranche, part des mots reconnus, corrigée par le taux
// de faux mots cochés (p' = (p - f) / (1 - f)). On s'arrête quand une tranche
// tombe sous 50 % : les suivantes seraient encore moins connues.
function estimateEn(yes) {
  const fakes = yes.filter((b) => b.fake), bands = yes.filter((b) => !b.fake);
  const f = fakes.length ? fakes.reduce((t, b) => t + b.known, 0) / fakes.length : 0;
  const adj = (b) => (f >= 1 ? 0 : Math.max(0, (b.known / b.size - f) / (1 - f)));
  const words = Math.round(bands.reduce((t, b) => t + adj(b) * 1000, 0) / 100) * 100;
  // Une tranche compte comme « connue » si ≥ 80 % de ses mots le sont, après correction
  let solid = 0;
  for (const b of bands) { if (adj(b) >= 0.8) solid++; else break; }
  return { words, fakeRate: f, solid };
}

function finishEn() {
  const P = ui.place, L = state.langs.en;
  const est = estimateEn(P.yes);
  let marked = 0;
  if (est.solid) for (const [l, e] of Object.entries(LEXICON.en)) {
    if (e.faux || L.known[l]) continue; // les faux amis restent à apprendre
    if ((EN_LEX_BAND[l] || 1) <= est.solid) { L.known[l] = true; marked++; }
  }
  L.placement = { date: today(), words: est.words, fakeRate: Math.round(est.fakeRate * 100) / 100, marked };
  P.step = "done"; P.result = L.placement;
  save();
}

function finishKo() {
  const P = ui.place, K = state.langs.ko;
  const read = P.read ? P.read.filter((x) => x.ok).length : 0;
  const hangul = !!P.read && read >= 4;
  if (hangul) K.hangulDone = true;
  const passed = [];
  if (hangul && P.a.haeyo === "oui") { K.grammarDone.haeyo = true; passed.push("haeyo"); }
  if (hangul && P.gram) for (const g of P.gram) { // points consécutifs uniquement (ordre du parcours)
    if (!g.ok) break;
    const gr = KO_GRAMMAR.find((x) => x.id === g.id);
    K.grammarDone[gr.id] = true; gr.lemmas.forEach((l) => (K.known[l] = true)); passed.push(gr.id);
  }
  K.placement = { date: today(), hangul, read, grammar: passed };
  P.step = "done"; P.result = K.placement;
  save();
}

function textsShare(lang) {
  const stab = stabilityMap(lang);
  const all = TEXTS[lang].flatMap((t) => t.parsed);
  return pct(coverage(lang, all, stab));
}

function tabPlacement(lang) {
  if (!ui.place || ui.place.lang !== lang) startPlacement(lang);
  const P = ui.place, L = state.langs[lang], k = koCls(lang);
  const redo = L.placement && P.step !== "done" ? `<p class="muted"><small>Tu as déjà fait le test le ${esc(L.placement.date || "")} : le refaire ne retire aucun mot, il en ajoute seulement.</small></p>` : "";

  if (P.step === "done") {
    const r = P.result;
    const lines = isKo(lang)
      ? [r.hangul ? "✓ Tu lis le Hangul : le module d'alphabet est validé." : "On commence par le Hangul : c'est l'affaire d'une semaine environ.",
         r.grammar?.length ? `✓ ${r.grammar.length} point(s) de grammaire validé(s).` : ""]
      : [`Tu connais environ <b>${r.words.toLocaleString("fr-FR")} mots</b> d'anglais.`, r.marked ? `${r.marked} mots de nos textes sont marqués comme connus.` : "",
         r.fakeRate > 0.2 ? "Tu as coché des mots qui n'existent pas : l'estimation en tient compte, et elle reste prudente." : ""];
    return `<div class="card empty">${mochi("", "proud")}<h2>Test terminé</h2>
      ${lines.filter(Boolean).map((l) => `<p>${l}</p>`).join("")}
      <p>Tu comprends déjà <b>~${textsShare(lang)} %</b> des mots de nos textes.</p>
      <p class="muted"><small>Un mot mal classé ? Corrige-le à tout moment dans l'onglet « Mots » ou en le touchant dans le lecteur.</small></p>
      <a class="btn" href="#/lang/${lang}/aujourdhui">C'est parti</a></div>`;
  }

  if (!isKo(lang)) {
    const n = EN_BANDS.length;
    return `${redo}<div class="card review-card ex-card">
      <span class="tag">Étape ${P.band + 1} / ${n} au maximum</span>
      <p class="q-label">Coche les mots que tu connais, c'est-à-dire que tu pourrais traduire. Attention : certains mots n'existent pas.</p>
      <div class="place-grid en">${P.screen.map((x, i) => `<button class="choice ${P.picks[i] ? "active" : ""}" data-act="place-pick" data-i="${i}" aria-pressed="${!!P.picks[i]}">${P.picks[i] ? "✓ " : ""}${esc(x.w)}</button>`).join("")}</div>
      <div class="wp-actions"><button class="btn" data-act="place-next">Suivant</button><button class="btn ghost small" data-act="place-skip">Passer le test</button></div>
    </div>`;
  }

  // Coréen
  if (P.step === "questions") {
    const q = (id, label) => `<div class="place-q"><p><b>${label}</b></p><div class="choice-row">${["oui", "non"].map((v) => `<button class="choice ${P.a[id] === v ? "active" : ""}" data-act="place-answer" data-q="${id}" data-v="${v}" aria-pressed="${P.a[id] === v}">${v === "oui" ? "Oui" : "Non"}</button>`).join("")}</div></div>`;
    const ready = ["hangul", "haeyo", "studied"].every((id) => P.a[id]);
    return `${redo}<div class="card ex-card">
      ${q("hangul", "Tu sais lire le Hangul (l'alphabet coréen) ?")}
      ${q("haeyo", "Tu connais le registre poli en -요 (해요체) ?")}
      ${q("studied", "Tu as déjà étudié le coréen (cours, appli, manuel) ?")}
      <div class="wp-actions"><button class="btn" data-act="place-next" ${ready ? "" : "disabled"}>Suivant</button><button class="btn ghost small" data-act="place-skip">Passer le test</button></div>
    </div>`;
  }
  if (P.step === "read") {
    const it = P.read[P.i];
    return `<div class="card review-card ex-card">
      <span class="tag">Lecture ${P.i + 1} / ${P.read.length}</span>
      <p class="q-label">Lis ce mot : c'est un mot d'emprunt. Que veut-il dire ?</p>
      <p class="big-char ko">${esc(it.w)}</p>
      <div class="ex-choices">${it.options.map((o) => `<button class="choice" data-act="place-read" data-o="${esc(o)}">${esc(o)}</button>`).join("")}</div>
      <button class="btn ghost small" data-act="place-read" data-o="">Je ne sais pas lire ce mot</button>
    </div>`;
  }
  if (P.step === "gram") {
    const g = P.gram[P.i], gr = KO_GRAMMAR.find((x) => x.id === g.id);
    return `<div class="card review-card ex-card">
      <span class="tag">Grammaire ${P.i + 1} / ${P.gram.length}</span>
      <p class="q-label">Choisis la bonne forme.</p>
      <p class="q-sentence ko">${esc(g.item.q)}</p><p class="muted">${esc(g.item.fr)}</p>
      <div class="ex-choices">${g.options.map((o) => `<button class="choice ko" data-act="place-gram" data-o="${esc(o)}">${esc(o)}</button>`).join("")}</div>
      <button class="btn ghost small" data-act="place-gram" data-o="">Je ne sais pas</button>
      <p class="muted"><small>${esc(gr.title)}</small></p>
    </div>`;
  }
  return "";
}

function koNextStep() {
  const P = ui.place;
  if (P.step === "questions") {
    if (P.a.hangul === "oui") {
      P.read = shuffle(KO_LOANS).slice(0, 5).map(([w, fr]) => ({ w, fr, options: shuffle([fr, ...shuffle(KO_LOANS.filter((x) => x[1] !== fr)).slice(0, 2).map((x) => x[1])]) }));
      P.step = "read"; P.i = 0; return;
    }
    return finishKo();
  }
  if (P.step === "read") {
    if (P.read.filter((x) => x.ok).length >= 4 && P.a.studied === "oui") {
      // Un item par point (après le registre poli), dans l'ordre du parcours
      P.gram = KO_GRAMMAR.slice(1, 5).map((g) => { const item = g.quiz[Math.floor(Math.random() * g.quiz.length)]; return { id: g.id, item, options: shuffle(item.o), ok: false }; });
      P.step = "gram"; P.i = 0; return;
    }
    return finishKo();
  }
  if (P.step === "gram") finishKo();
}

Object.assign(actions, {
  "place-skip": () => {
    const lang = currentLang();
    state.langs[lang].placement = { date: today(), skipped: true }; save();
    ui.place = null;
    location.hash = `#/lang/${lang}/aujourdhui`; render();
  },
  "place-pick": (el) => { const P = ui.place, i = +el.dataset.i; P.picks[i] = !P.picks[i]; render(); },
  "place-answer": (el) => { ui.place.a[el.dataset.q] = el.dataset.v; render(); },
  "place-next": () => {
    const P = ui.place;
    if (isKo(P.lang)) { koNextStep(); return render(); }
    const real = P.screen.map((x, i) => ({ ...x, i })).filter((x) => !x.fake);
    const fake = P.screen.find((x) => x.fake);
    const known = real.filter((x) => P.picks[x.i]).length;
    P.yes.push({ band: P.band, known, size: real.length });
    P.yes.push({ fake: true, known: P.picks[P.screen.indexOf(fake)] ? 1 : 0, size: 1 });
    if (known / real.length < 0.5 || P.band + 1 >= EN_BANDS.length) finishEn();
    else { P.band++; nextScreen(); }
    render();
  },
  "place-read": (el) => {
    const P = ui.place, it = P.read[P.i];
    it.ok = el.dataset.o === it.fr;
    if (++P.i >= P.read.length) koNextStep();
    render();
  },
  "place-gram": (el) => {
    const P = ui.place, g = P.gram[P.i];
    g.ok = el.dataset.o === g.item.a;
    if (++P.i >= P.gram.length) koNextStep();
    render();
  },
});
